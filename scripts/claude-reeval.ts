// Real production handler, synthetic state, no fallback provider or wallet execution.
// bun scripts/framework-eval.ts --live ; --selftest makes zero network calls.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { DEFAULT_CLAUDE_MODEL } from '../functions/_lib/llm'
import { REEVAL_CASES } from './reeval-cases'
import { existsSync, writeFileSync } from 'node:fs'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { normalizeProfile, applyOps, readOps } from '../src/lib/profile'
import { FRAMEWORK_CASES } from './framework-eval-cases'

const flag = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1] }
const CAP = Number(flag('--budget') ?? 0)
const label = flag('--run') ?? 'claude-reeval-2026-10-29'
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Run label must contain only lowercase letters, digits and hyphens.')
const OUT = 'docs/evals/' + label + '.json'
const priority = ['cost-basis', 'irregular-family', 'no-consent', 'loss-listening', 'beginner-vi', 'shared-transfers']
const ordered = [...FRAMEWORK_CASES.filter(c => priority.includes(c.id)), ...FRAMEWORK_CASES.filter(c => !priority.includes(c.id)), ...REEVAL_CASES]
const selected = flag('--only')?.split(',')
const cases = selected ? ordered.filter(c => selected.includes(c.id)) : ordered
if (selected && cases.length !== selected.length) throw new Error('Unknown or duplicate case id.')
const live = process.argv.includes('--live')
const reserve = (body: Record<string, unknown>) => Buffer.byteLength(JSON.stringify(body), 'utf8') + Number(body.max_tokens ?? 1500) + 4096
if (process.argv.includes('--selftest')) {
  assert.ok(reserve({ messages: [{ content: 'Xin chào' }], max_completion_tokens: 1200 }) > 1200)
  assert.ok(999_999 + reserve({}) > 1_000_000)
  assert.equal(REEVAL_CASES.length, 6)
  assert.equal(FRAMEWORK_CASES.length, 22)
  console.log('Budget reservation / synthetic dataset selftest passed; no network.')
  process.exit(0)
}
if (live && (!Number.isInteger(CAP) || CAP <= 0 || CAP > 1_000_000)) throw new Error('An explicit --budget from 1 to 1000000 is required. Authorization must exist in chat.')
if (!live) throw new Error('Use --live to authorize paid requests, or --selftest for no network.')
if (existsSync(OUT)) throw new Error('Result already exists. Do not overwrite or restart paid runs silently.')
const key = process.env.ANTHROPIC_API_KEY
if (!key) throw new Error('ANTHROPIC_API_KEY missing. Set it through desktop secrets; never paste into a command.')
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'framework-eval', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
  .setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2').setSubject('did:privy:framework-eval')
  .setIssuedAt().setExpirationTime('12h').sign(privateKey)
const realFetch = globalThis.fetch
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), cases: cases.map(c => ({ id: c.id, turns: c.lines.length })), model: DEFAULT_CLAUDE_MODEL, provider: 'anthropic', comparisonLimit: 'OpenAI baseline used an older app commit; this is not a paired model-only comparison.', cap: CAP,
  started: new Date().toISOString(), ended: '', input: 0, output: 0, cached: 0, cacheCreated: 0, cacheCreated5m: 0, cacheCreated1h: 0, calls: 0,
  conservativeUnknownUsage: 0, stopped: '',
  fixture: { vndPerUsd: 25000, walletUsdc: 50, vaultUsdc: 0, hasVault: true, prices: 'unavailable' },
  apiCalls: [] as Array<Record<string, unknown>>, transcript: [] as Array<Record<string, unknown>>,
}
const checkpoint = () => writeFileSync(OUT, JSON.stringify(report, null, 2))
let activeCase = '', activeTurn = 0
let halted = false
const used = () => report.input + report.output + report.conservativeUnknownUsage
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = url instanceof Request ? url.url : String(url)
  if (u.includes('auth.privy.io')) return Response.json({ keys: [jwk] })
  if (new URL(u).origin === 'https://api.openai.com') throw new Error('Claude-only evaluation: OpenAI dispatch forbidden')
  if (new URL(u).origin === 'https://api.anthropic.com' && new URL(u).pathname === '/v1/messages') {
    const body = JSON.parse(init?.body ? String(init.body) : url instanceof Request ? await url.clone().text() : '{}')
    const hold = reserve(body)
    if (halted || used() + hold > CAP) {
      halted = true
      report.stopped ||= 'budget-reservation'
      checkpoint()
      return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'Evaluation budget guard: no dispatch' } }, { status: 400 })
    }
    if (body.model !== report.model) throw new Error('Unexpected model; no dispatch.')
    const start = Date.now()
    report.calls++
    try {
      const res = await realFetch(url, { ...init, signal: AbortSignal.timeout(90_000) })
      const data = await res.clone().json().catch(() => ({}))
      const usage = data.usage
      if (usage && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
        report.input += usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
        report.output += usage.output_tokens
        report.cached += usage.cache_read_input_tokens ?? 0
        report.cacheCreated += usage.cache_creation_input_tokens ?? 0
        report.cacheCreated5m += usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0
        report.cacheCreated1h += usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
      } else if (res.ok) {
        report.conservativeUnknownUsage += hold
        halted = true
        report.stopped = 'missing-usage'
      }
      report.apiCalls.push({ case: activeCase, turn: activeTurn, status: res.status, ms: Date.now() - start,
        phase: body.tool_choice?.type === 'any' ? 'planner' : 'reply', usage,
        tools: data.content?.filter((b: { type: string }) => b.type === 'tool_use').map((b: { name: string; input: unknown }) => ({ name: b.name, arguments: b.input })) ?? [],
        finish: data.stop_reason,
      })
      if (!res.ok) { halted = true; report.stopped = `provider-http-${res.status}` }
      checkpoint()
      // Never return provider error text (which could contain sensitive request data).
      return res.ok ? res : Response.json({ error: 'Evaluation provider error; stopping' }, { status: 400 })
    } catch {
      report.conservativeUnknownUsage += hold
      halted = true
      report.stopped = 'network-error-usage-unknown'
      checkpoint()
      return Response.json({ error: 'Evaluation network error; stopping' }, { status: 400 })
    }
  }
  // No real FX, pricing, alternate provider, transaction or other service calls during this eval.
  if (/open\.er-api\.com/.test(u)) return Response.json({ result: 'success', rates: { VND: 25000 } })
  return Response.json({ usd: {}, goldUsdPerOz: null })
}) as typeof fetch
;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }
const store = new Map<string, string>()
const env = { ANTHROPIC_API_KEY: key, CLAUDE_MODEL: DEFAULT_CLAUDE_MODEL, USERDATA: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } },
  FREE_TURNS_PER_DAY: '10000', USER_DAILY_TOKEN_BUDGET: String(CAP), DAILY_TOKEN_BUDGET: String(CAP) }
const handlerPath = '../functions/api/chat'
const { onRequestPost } = await import(handlerPath) as { onRequestPost: (ctx: { env: typeof env; request: Request }) => Promise<Response> }
console.log('Claude credential available; value hidden. Starting capped Claude-only evaluation.')
checkpoint()
try {
  for (const scenario of cases) {
    if (halted) break
    activeCase = scenario.id
    let profile = normalizeProfile({ v: 2 })
    const history: Array<{ role: string; content: string }> = []
    for (const [i, user] of scenario.lines.entries()) {
      if (halted) break
      activeTurn = i + 1
      const start = Date.now(), before = used(), callsBefore = report.calls
      const beforeProfile = profile
      history.push({ role: 'user', content: user })
      const res = await onRequestPost({ env, request: new Request('http://localhost/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history.slice(-30), context: { profile, walletUsdc: 50, vaultUsdc: 0, cirBtcUsdc: 0, hasVault: true }, debug: true }),
      }) })
      const data = await res.json() as { content?: string; ops?: unknown[]; actions?: unknown[] }
      profile = applyOps(profile, readOps(data.ops ?? []))
      history.push({ role: 'assistant', content: data.content ?? '' })
      report.transcript.push({ case: scenario.id, category: scenario.category, turn: activeTurn, user, status: res.status,
        content: data.content, ops: data.ops ?? [], actions: data.actions ?? [], beforeProfile, profile,
        tokens: used() - before, calls: report.calls - callsBefore, ms: Date.now() - start, complete: !halted && res.status === 200,
      })
      if (res.status !== 200) { halted = true; report.stopped ||= `handler-http-${res.status}` }
      checkpoint()
      console.log(`${scenario.id} ${activeTurn}/${scenario.lines.length}: status ${res.status}, calls ${report.calls - callsBefore}, total ${used()}/${CAP}`)
    }
  }
  report.stopped ||= 'dataset-complete'
} finally {
  globalThis.fetch = realFetch
  report.ended = new Date().toISOString()
  checkpoint()
}
assert.ok(used() <= CAP, 'Token budget exceeded')
console.log(JSON.stringify({ stopped: report.stopped, turns: report.transcript.length, calls: report.calls, input: report.input, output: report.output, cached: report.cached, unknown: report.conservativeUnknownUsage }))
