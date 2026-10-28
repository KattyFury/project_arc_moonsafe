// A local copy of /api/chat for the agent eval, with a HARD token cap: `bun run eval:server -- --budget 200000`.
//
//   bun run eval:server -- --budget 200000        (terminal 1; needs OPENAI_API_KEY in .env or the environment)
//   bun scripts/agent-eval.mjs http://localhost:8788 --only "greeting, nothing known"     (terminal 2)
//
// Why it exists (Hieu, 2026-10-28: live prompt tests used up his OpenAI credit):
//  - the cap is enforced by the server itself: once the tokens counted from OpenAI's own usage reach --budget, every
//    next request is refused (429) and nothing more is spent. At most ONE turn can go over it.
//  - only OpenAI is used: no standby model, so a run never silently measures Claude, and no other key is touched.
//  - the same code as production runs (functions/api/chat.ts, the real sign-in check with a locally signed token), and
//    GET /__stats prints what the run really used: calls, plan steps, rewrite rounds, input / output / cached tokens.
//
// EVAL_FAKE=1 answers with a fake model that reports invented token counts: use it to test this script itself at no cost.

import { readFileSync } from 'node:fs'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'

// Bun's own global (the app's tsconfig has no Bun types).
declare const Bun: { serve(options: { port: number; fetch(req: Request): Response | Promise<Response> }): { port: number } }

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const budget = Number(flag('--budget'))
const port = Number(flag('--port') ?? 8788)
if (!Number.isFinite(budget) || budget <= 0) { console.error('Give a token budget: bun run eval:server -- --budget 200000'); process.exit(1) }

const FAKE = process.env.EVAL_FAKE === '1'
const APP_ID = 'cmvhlli8900mk0gjmwdeypxh2' // the public Privy app id the functions default to
const envFile = (() => { try { return readFileSync(new URL('../../.env', import.meta.url), 'utf8') } catch { return '' } })()
const fromFile = (k: string) => envFile.split('\n').find(l => l.startsWith(`${k}=`))?.slice(k.length + 1).trim().replace(/^["']|["']$/g, '')
const openaiKey = FAKE ? 'fake' : (process.env.OPENAI_API_KEY ?? fromFile('OPENAI_API_KEY'))
if (!openaiKey) { console.error('No OPENAI_API_KEY in the environment or in ../.env'); process.exit(1) }

;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }

// Sign-in: a token signed here and the matching key set served locally (everything else goes to the network as usual).
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'eval', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'eval' }).setIssuer('privy.io').setAudience(APP_ID).setSubject('did:privy:eval').setIssuedAt().setExpirationTime('12h').sign(privateKey)
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } })
  if (FAKE && u.includes('openai.com')) {
    const body = JSON.parse(String(init?.body)) as { tool_choice?: string }
    const message = body.tool_choice === 'required'
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'no_action', arguments: '{}' } }] }
      : { role: 'assistant', content: 'Okay.' }
    return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 5000, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 3000 } } }), { status: 200 })
  }
  return realFetch(url as never, init)
}) as typeof fetch

const store = new Map<string, string>()
const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }
// Quota off (the eval plays many messages); the token cap is the guard: USER_DAILY_TOKEN_BUDGET = --budget.
const env = { OPENAI_API_KEY: openaiKey, USERDATA: kv, FREE_TURNS_PER_DAY: '1000000', USER_DAILY_TOKEN_BUDGET: String(budget), DAILY_TOKEN_BUDGET: String(budget) }

const chatModule = '../functions/api/chat'
const statsModule = '../functions/_lib/stats'
const { onRequestPost } = await import(chatModule) as { onRequestPost: (c: { request: Request; env: typeof env }) => Promise<Response> }
const { readStats } = await import(statsModule) as { readStats: (e: typeof env, days: number) => Promise<Array<Record<string, number | string | object>>> }

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/__stats') return Response.json((await readStats(env, 1))[0])
    if (url.pathname !== '/api/chat' || req.method !== 'POST') return new Response('not found', { status: 404 })
    const headers = new Headers(req.headers)
    headers.set('authorization', `Bearer ${token}`)
    const res = await onRequestPost({ request: new Request(req.url, { method: 'POST', headers, body: await req.text() }), env })
    if (res.status === 429) console.log('TOKEN BUDGET REACHED: refusing further requests, nothing more is spent.')
    return res
  },
})
console.log(`Eval server on http://localhost:${server.port}  |  token cap ${budget.toLocaleString('en-US')}  |  model: ${FAKE ? 'FAKE (no cost)' : 'OpenAI, real'}`)
console.log('Stats at any time: curl localhost:' + server.port + '/__stats')
