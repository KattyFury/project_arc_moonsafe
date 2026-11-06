// One turn through the real /api/chat handler on OpenAI, printing what the planner called and what each tool answered.
// Fixture: a JSON file { messages, context } (context as the app sends it). Hard token cap.
// Run: bun scripts/probe-turn.ts <fixture.json> --budget 80000

import { readFileSync } from 'node:fs'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { normalizeProfile } from '../src/lib/profile'

const flag = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1] }
const CAP = Number(flag('--budget') ?? 0)
if (!Number.isInteger(CAP) || CAP <= 0 || CAP > 200_000) throw new Error('Give --budget (tokens, at most 200,000).')
const fx = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { messages: Array<{ role: string; content: string }>; context: Record<string, unknown> }
const key = readFileSync('.dev.vars', 'utf8').split(/\r?\n/).find(l => l.startsWith('OPENAI_API_KEY='))?.slice(15).trim().replace(/^["']|["']$/g, '')
if (!key) throw new Error('No OPENAI_API_KEY in .dev.vars')
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'probe', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'probe' }).setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2')
  .setSubject('did:privy:probe').setIssuedAt().setExpirationTime('1h').sign(privateKey)
let used = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = url instanceof Request ? url.url : String(url)
  if (u.includes('auth.privy.io')) return Response.json({ keys: [jwk] })
  if (u.includes('api.openai.com')) {
    if (used >= CAP) return Response.json({ error: { message: 'probe budget reached' } }, { status: 429 })
    const body = JSON.parse(String(init?.body ?? '{}')) as { tools?: Array<{ function?: { name: string } }>; messages: Array<{ role: string; content?: string; tool_calls?: unknown }> }
    const planner = body.tools?.some(t => t.function?.name === 'no_action')
    const last = body.messages.slice(-4).filter(m => m.role === 'tool').map(m => `    tool → ${String(m.content).slice(0, 220)}`)
    if (last.length) console.log(last.join('\n'))
    const res = await realFetch(url as never, init)
    const data = await res.clone().json().catch(() => ({})) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> }
    used += (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)
    const m = data.choices?.[0]?.message
    if (planner) console.log(`  PLAN: ${(m?.tool_calls ?? []).map(c => `${c.function.name}(${c.function.arguments})`).join(' ; ') || '(none)'}`)
    else console.log(`  REPLY draft: ${(m?.content ?? '').slice(0, 300)}${m?.tool_calls?.length ? ` [tools ${m.tool_calls.map(c => c.function.name).join(',')}]` : ''}`)
    return res
  }
  if (/open\.er-api\.com/.test(u)) return Response.json({ result: 'success', rates: { VND: 25000 } })
  return Response.json({ usd: {}, goldUsdPerOz: null })
}) as typeof fetch
;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }
const store = new Map<string, string>()
const env = { OPENAI_API_KEY: key, USERDATA: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } },
  FREE_TURNS_PER_DAY: '10000', USER_DAILY_TOKEN_BUDGET: String(CAP), DAILY_TOKEN_BUDGET: String(CAP) }
const handler = '../functions/api/chat'
const { onRequestPost } = await import(handler) as { onRequestPost: (c: { request: Request; env: typeof env }) => Promise<Response> }
const context = { ...fx.context, profile: normalizeProfile((fx.context.profile ?? { v: 2 }) as Record<string, unknown>) }
const res = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ messages: fx.messages, context }) }), env })
const d = await res.json() as { content?: string; ops?: unknown[]; actions?: unknown[] }
console.log(`\nSTATUS ${res.status}\nCONTENT: ${d.content}\nOPS: ${JSON.stringify(d.ops)}\nACTIONS: ${JSON.stringify(d.actions)}\ntokens: ${used}`)
