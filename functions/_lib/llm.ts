/**
 * The model call for the agent: OpenAI first, Gemini as the standby (Hieu, 2026-10-27: the OpenAI credit ran out and the
 * agent went quiet). Both speak the OpenAI chat format (Gemini through its OpenAI-compatible endpoint), so the agent's
 * prompts, tools and checks are the same for both.
 *
 * Falls back to Gemini when OpenAI cannot answer for a reason that is not our request's fault: bad or revoked key (401/403),
 * no credit (402, 429), rate limit (429), a server error (5xx) or no connection. A request that OpenAI rejects as invalid
 * (400) is NOT retried elsewhere. Once a request has moved to Gemini it stays there, and after "no credit" OpenAI is
 * skipped for a few minutes so each message does not pay a failed call first.
 *
 * Quality on Gemini is not measured yet (no side-by-side run): it is the standby, not the primary.
 */

import type { Meter } from './budget'

export interface Keys {
  openai?: string
  gemini?: string
  geminiModel: string
}

export interface ToolCall { id: string; function: { name: string; arguments: string } }
export interface Completion {
  choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
/** After a key or credit problem on OpenAI, skip it for this long (per worker instance). */
const OPENAI_PAUSE_MS = 5 * 60_000
let openaiPausedUntil = 0

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const fallbackWorthy = (status: number) => status === 401 || status === 402 || status === 403 || status === 429 || status >= 500

/**
 * The same messages, shaped for Gemini's OpenAI-compatible endpoint:
 *  - system messages after the opening ones become user messages: Gemini pulls every system message into one instruction,
 *    so a request whose last message is a system note would end with a model turn and be refused (400);
 *  - tool calls made by another model carry a "thought signature" marker that Gemini 3 accepts for foreign history.
 */
function forGemini(body: Record<string, unknown>, model: string): Record<string, unknown> {
  let opening = true
  const messages = (body.messages as Array<Record<string, unknown>>).map(m => {
    if (m.role === 'system') {
      if (opening) return m
      return { role: 'user', content: `[Instruction for your next reply] ${String(m.content ?? '')}` }
    }
    opening = false
    const calls = m.tool_calls as Array<Record<string, unknown>> | undefined
    if (m.role !== 'assistant' || !calls?.length) return m
    return { ...m, tool_calls: calls.map(c => c.extra_content ? c : { ...c, extra_content: { google: { thought_signature: 'skip_thought_signature_validator' } } }) }
  })
  return { ...body, model, messages }
}

function openAiFailure(status: number, err: string): Response {
  if (status === 401) return json({ error: 'invalid OpenAI key' }, 502)
  if (status === 429 && /insufficient_quota/.test(err)) return json({ error: 'the OpenAI account is out of credit' }, 502)
  if (status === 429) return json({ error: 'OpenAI is rate limiting, try again in a few minutes' }, 502)
  return json({ error: `OpenAI error ${status}` }, 502)
}

function count(c: Completion, meter: Meter): Completion {
  meter.tokens += (c.usage?.prompt_tokens ?? 0) + (c.usage?.completion_tokens ?? 0)
  return c
}

async function callGemini(keys: Keys, body: Record<string, unknown>, meter: Meter): Promise<Completion | Response> {
  meter.provider = 'gemini'
  const payload = JSON.stringify(forGemini(body, keys.geminiModel))
  // Gemini answers "high demand" (503) now and then: one more try after a short pause.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res: Response
    try {
      res = await fetch(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.gemini}` }, body: payload })
    } catch (e) {
      console.error('Gemini network error:', (e as Error).message)
      if (attempt === 2) return json({ error: 'the standby AI cannot be reached' }, 502)
      await new Promise(r => setTimeout(r, 800)); continue
    }
    if (res.ok) {
      console.log(`provider=gemini model=${keys.geminiModel}`)
      return count(await res.json() as Completion, meter)
    }
    const err = await res.text()
    console.error('Gemini error:', res.status, err.slice(0, 300))
    if ((res.status === 503 || res.status === 429) && attempt === 1) { await new Promise(r => setTimeout(r, 800)); continue }
    return json({ error: res.status === 503 || res.status === 429 ? 'the AI is busy right now, try again in a minute' : `standby AI error ${res.status}` }, 502)
  }
  return json({ error: 'the AI is busy right now, try again in a minute' }, 502)
}

export async function callModel(keys: Keys, body: Record<string, unknown>, meter: Meter): Promise<Completion | Response> {
  if (!keys.openai && !keys.gemini) return json({ error: 'The agent has no AI key configured' }, 503)
  if (meter.provider === 'gemini' || !keys.openai || Date.now() < openaiPausedUntil) {
    return keys.gemini ? callGemini(keys, body, meter) : openAiFailure(401, '')
  }
  try {
    const res = await fetch(OPENAI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keys.openai}` }, body: JSON.stringify(body) })
    if (res.ok) return count(await res.json() as Completion, meter)
    const err = await res.text()
    console.error('OpenAI error:', res.status, err.slice(0, 300))
    if (!keys.gemini || !fallbackWorthy(res.status)) return openAiFailure(res.status, err)
    if (res.status === 401 || res.status === 402 || res.status === 403 || /insufficient_quota/.test(err)) openaiPausedUntil = Date.now() + OPENAI_PAUSE_MS
  } catch (e) {
    console.error('OpenAI network error:', (e as Error).message)
    if (!keys.gemini) return json({ error: 'OpenAI cannot be reached' }, 502)
  }
  return callGemini(keys, body, meter)
}
