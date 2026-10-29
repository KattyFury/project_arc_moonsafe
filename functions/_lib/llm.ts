/**
 * The model call for the agent: OpenAI first, Claude as the standby (Hieu, 2026-10-28: primary = OpenAI mini, standby = the
 * cheapest Claude; it replaces the Gemini standby of 2026-10-27, whose free key allowed only 5 requests a minute).
 * The agent speaks the OpenAI chat format; for Claude the request is translated to the Messages API (official SDK
 * @anthropic-ai/sdk) and the answer translated back, so the agent's prompts, tools and checks are the same for both.
 *
 * Falls back to Claude when OpenAI cannot answer for a reason that is not our request's fault: bad or revoked key (401/403),
 * no credit (402, 429), rate limit (429), a server error (5xx) or no connection. A request that OpenAI rejects as invalid
 * (400) is NOT retried elsewhere. Once a request has moved to Claude it stays there, and after "no credit" OpenAI is
 * skipped for a few minutes so each message does not pay a failed call first.
 *
 * Claude runs with thinking off (as reasoning_effort 'none' on OpenAI), so no thinking blocks ever enter the history.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Meter } from './budget'

export interface Keys {
  openai?: string
  claude?: string
  claudeModel: string
}

export interface ToolCall { id: string; function: { name: string; arguments: string } }
export interface Completion {
  choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
}

/** The cheapest Claude model ($0.10 / $0.50 per million tokens, 2026-10). */
export const DEFAULT_CLAUDE_MODEL = 'claude-haiku-5-5'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
/** After a key or credit problem on OpenAI, skip it for this long (per worker instance). */
const OPENAI_PAUSE_MS = 5 * 60_000
let openaiPausedUntil = 0

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fallbackWorthy = (status: number) => status === 401 || status === 402 || status === 403 || status === 429 || status >= 500

interface OpenAiMessage { role: string; content?: string | null; tool_calls?: ToolCall[]; tool_call_id?: string }
interface OpenAiTool { function: { name: string; description?: string; parameters?: Record<string, unknown> } }

const parseArgs = (s: string): Record<string, unknown> => {
  try { return JSON.parse(s || '{}') as Record<string, unknown> } catch { return {} }
}

/**
 * The same request, shaped for the Claude Messages API:
 *  - server-owned system messages retain their instruction role, including runtime figures and revision guidance;
 *  - tool results (role 'tool') become tool_result blocks, and messages of the same role are merged.
 */
function forClaude(body: Record<string, unknown>, model: string): Anthropic.MessageCreateParamsNonStreaming {
  const system: string[] = []
  const messages: Anthropic.MessageParam[] = []
  const push = (role: 'user' | 'assistant', blocks: Anthropic.ContentBlockParam[]) => {
    if (!blocks.length) return
    const last = messages[messages.length - 1]
    if (last?.role === role) (last.content as Anthropic.ContentBlockParam[]).push(...blocks)
    else messages.push({ role, content: blocks })
  }
  const text = (s: unknown): Anthropic.TextBlockParam[] => (s ? [{ type: 'text', text: String(s) }] : [])
  for (const m of body.messages as OpenAiMessage[]) {
    if (m.role === 'system') {
      system.push(String(m.content ?? ''))
    } else if (m.role === 'tool') {
      push('user', [{ type: 'tool_result', tool_use_id: String(m.tool_call_id), content: String(m.content ?? '') || '(empty)' }])
    } else if (m.role === 'assistant') {
      const calls: Anthropic.ToolUseBlockParam[] = (m.tool_calls ?? []).map(c => ({ type: 'tool_use', id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }))
      push('assistant', [...text(m.content), ...calls])
    } else {
      push('user', text(m.content))
    }
  }
  // Haiku 5.5 rejects assistant prefill. A rewrite ends in a draft followed by system guidance;
  // keep that guidance privileged, and request a fresh answer in a final user turn.
  if (messages[messages.length - 1]?.role === 'assistant') push('user', text('Please answer the latest user request.'))
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: Number(body.max_completion_tokens) || 1500,
    system: system.join('\n\n'),
    messages,
    thinking: { type: 'disabled' },
    cache_control: { type: 'ephemeral' },
  }
  const tools = body.tools as OpenAiTool[] | undefined
  if (tools?.length) {
    params.tools = tools.map(t => ({ name: t.function.name, description: t.function.description ?? '', input_schema: (t.function.parameters ?? { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema }))
    const choice = body.tool_choice
    params.tool_choice = choice === 'required' ? { type: 'any' } : choice === 'none' ? { type: 'none' } : { type: 'auto' }
  }
  return params
}

/** Claude's answer in the OpenAI shape the agent reads. */
function fromClaude(msg: Anthropic.Message): Completion {
  const content = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('')
  const calls = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map(b => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } }))
  const u = msg.usage
  return {
    choices: [{ message: { role: 'assistant', content: content || null, ...(calls.length ? { tool_calls: calls } : {}) } }],
    usage: { prompt_tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), completion_tokens: u.output_tokens },
  }
}

function openAiFailure(status: number, err: string): Response {
  if (status === 401) return json({ error: 'invalid OpenAI key' }, 502)
  if (status === 429 && /insufficient_quota/.test(err)) return json({ error: 'the OpenAI account is out of credit' }, 502)
  if (status === 429) return json({ error: 'OpenAI is rate limiting, try again in a few minutes' }, 502)
  return json({ error: `OpenAI error ${status}` }, 502)
}

function count(c: Completion, meter: Meter): Completion {
  const prompt = c.usage?.prompt_tokens ?? 0
  const completion = c.usage?.completion_tokens ?? 0
  meter.tokens += prompt + completion
  meter.promptTokens = (meter.promptTokens ?? 0) + prompt
  meter.completionTokens = (meter.completionTokens ?? 0) + completion
  meter.cachedTokens = (meter.cachedTokens ?? 0) + (c.usage?.prompt_tokens_details?.cached_tokens ?? 0)
  meter.modelCalls = (meter.modelCalls ?? 0) + 1
  return c
}

async function callClaude(keys: Keys, body: Record<string, unknown>, meter: Meter): Promise<Completion | Response> {
  meter.provider = 'claude'
  // Made per call so it uses the fetch of the moment (Workers runtime, or the fake one in kb-check). The SDK retries
  // 429 / 5xx / connection errors once by itself.
  const client = new Anthropic({ apiKey: keys.claude, maxRetries: 1 })
  try {
    const msg = await client.messages.create(forClaude(body, keys.claudeModel))
    if (msg.stop_reason === 'refusal') {
      console.error('Claude refused:', msg.stop_details?.category ?? 'no category')
      return json({ error: 'the standby AI declined this message' }, 502)
    }
    console.log(`provider=claude model=${keys.claudeModel}`)
    return count(fromClaude(msg), meter)
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error('Claude error:', e.status, e.message.slice(0, 300))
      if (e.status === 401) return json({ error: 'invalid Claude key' }, 502)
      if (e.status === 402 || /credit balance/i.test(e.message)) return json({ error: 'the Claude account is out of credit' }, 502)
      if (e.status === 429 || e.status === 529) return json({ error: 'the AI is busy right now, try again in a minute' }, 502)
      return json({ error: `standby AI error ${e.status ?? ''}`.trim() }, 502)
    }
    console.error('Claude network error:', (e as Error).message)
    return json({ error: 'the standby AI cannot be reached' }, 502)
  }
}

export async function callModel(keys: Keys, body: Record<string, unknown>, meter: Meter): Promise<Completion | Response> {
  if (!keys.openai && !keys.claude) return json({ error: 'The agent has no AI key configured' }, 503)
  if (meter.provider === 'claude' || !keys.openai || Date.now() < openaiPausedUntil) {
    return keys.claude ? callClaude(keys, body, meter) : openAiFailure(401, '')
  }
  try {
    const res = await fetch(OPENAI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` }, body: JSON.stringify(body) })
    if (res.ok) return count(await res.json() as Completion, meter)
    const err = await res.text()
    console.error('OpenAI error:', res.status, err.slice(0, 300))
    if (!keys.claude || !fallbackWorthy(res.status)) return openAiFailure(res.status, err)
    if (res.status === 401 || res.status === 402 || res.status === 403 || /insufficient_quota/.test(err)) openaiPausedUntil = Date.now() + OPENAI_PAUSE_MS
  } catch (e) {
    console.error('OpenAI network error:', (e as Error).message)
    if (!keys.claude) return json({ error: 'OpenAI cannot be reached' }, 502)
  }
  return callClaude(keys, body, meter)
}
