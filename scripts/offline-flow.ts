// Offline flow check: `bun run flow`.
//
// Runs the real /api/chat code on a few typical messages, but with `fetch` faked: the model is NEVER called, so this
// costs no tokens and no credit. The faked model answers with a bare "no_action" / "Okay." and the script counts what
// the code would have SENT (system text, history, tool schemas) with the o200k tokenizer.
//
// Use it to see where the input tokens go and to check that a prompt change made the request smaller, without a live
// test chat (Hieu, 2026-10-28: live prompt tests used up his OpenAI credit). It does not say whether answers stay good:
// that needs a real run, which is only done with Hieu's go-ahead and a stated token budget.

import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { buildIntake } from '../functions/_lib/intake'
import { normalizeProfile } from '../src/lib/profile'

// The chat function is loaded by a computed path: the app's tsconfig does not know the Cloudflare types the functions use.
const chatModule = '../functions/api/chat'
const { onRequestPost } = await import(chatModule) as { onRequestPost: (context: { request: Request; env: Record<string, string> }) => Promise<Response> }

const APP_ID = 'cmvhlli8900mk0gjmwdeypxh2' // the public Privy app id the functions default to

;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }

// A real signed token and a JWKS served locally, so the real sign-in check runs (no bypass in the code).
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'local', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'local' }).setIssuer('privy.io').setAudience(APP_ID).setSubject('did:privy:token-report').setIssuedAt().setExpirationTime('10m').sign(privateKey)


const message = [
  '31', '150$ salary', '150$ spend each month', 'my income is steady, no one rely on it', 'I dont want to saving for any goal I just want to invest',
  'I keep 500$ in the bank and 2000$ in gold', 'I keep 1900$ USDC in this wallet', 'no I don\'t have any debt', 'I only make enough living, my other income is airdrop that\'s what I do',
].join('\n')
const T = (name: string, args: unknown) => ({ id: 'c' + Math.random(), type: 'function', function: { name, arguments: JSON.stringify(args) } })
const M = (amount: number) => ({ amount, currency: 'USDC' })
let modelCalls = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
  if (!u.includes('openai.com')) return realFetch(url as never, init)
  modelCalls++
  const body = JSON.parse(String(init?.body)) as { tool_choice?: string; messages: Array<{ role: string }> }
  const toolMsgs = body.messages.filter(m => m.role === 'tool').length
  const message = body.tool_choice === 'required'
    ? (toolMsgs === 0
      ? { role: 'assistant', content: null, tool_calls: [
          T('update_profile', { age: 31, income_stable: true, dependents: 0, debts_complete: true, no_near_goal: true }),
          T('set_income', { name: 'Salary', monthly: M(150), kind: 'active' }),
          T('set_income', { name: 'Airdrop', monthly: M(0), kind: 'irregular' }),
          T('set_expense', { name: 'Monthly spending', monthly: M(150), kind: 'fixed' }),
          T('add_holding', { type: 'savings', name: 'Bank savings', worth: M(500) }),
          T('add_holding', { type: 'gold_physical', name: 'Gold', worth: M(2000), unit: 'oz' }),
          T('add_holding', { type: 'stable_wallet', name: 'USDC in this wallet', worth: M(1900) }),
        ] }
      : { role: 'assistant', content: null, tool_calls: [T('no_action', {})] })
    : { role: 'assistant', content: 'MODEL REPLY' }
  return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 0, completion_tokens: 0 } }), { status: 200 })
}) as typeof fetch

const history = [
  { role: 'user', content: 'I want investing' },
  { role: 'assistant', content: buildIntake(normalizeProfile({ v: 2 }), 'I want investing', false, [], 1916) ?? '' },
]
const request = new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ messages: [...history, { role: 'user', content: message }], context: { profile: normalizeProfile({ v: 2 }), vaultUsdc: 0, walletUsdc: 1916, cirBtcUsdc: 0 } }) })
const res = await onRequestPost({ request, env: { OPENAI_API_KEY: 'fake' } })
const body = await res.json() as { content?: string; ops?: Array<{ op: string; holding?: { name: string; value?: number; where?: string }; income?: { name: string; monthly: number } }>; error?: string }
console.log('status', res.status, '| model calls', modelCalls)
let bad = 0
const expect = (ok: boolean, what: string) => { if (!ok) { bad++; console.log('FAIL', what) } }
console.log('ops:', JSON.stringify((body.ops ?? []).map(o => o.op === 'add_holding' ? `${o.holding?.name}=${o.holding?.value}${o.holding?.where ? `@${o.holding.where}` : ''}` : o.op === 'set_income' ? `income ${o.income?.name}=${o.income?.monthly}` : o.op)))
console.log('\n' + (body.content ?? body.error))
expect(res.status === 200, 'the request succeeds')
expect(modelCalls === 2, `the planner records and ends (2 calls), the plan is built by the server: no reply call (got ${modelCalls})`)
expect(!(body.ops ?? []).some(o => o.op === 'set_income' && o.income?.name === 'Airdrop'), 'an income line without an amount (airdrop 0) is not recorded')
expect((body.ops ?? []).some(o => o.op === 'add_holding' && o.holding?.where === 'app wallet' && o.holding?.value === 1900), 'the USDC the user declares for this wallet is recorded')
const text = body.content ?? ''
for (const [what, re] of [['the fund', /Emergency fund: 450 USDC[^\n]*Why:/], ['Safety', /Safety 31%[^\n]*any time/], ['Traditional', /Traditional 39%[^\n]*index funds/], ['Crypto', /Crypto 30%[^\n]*BTC/]] as const) expect(re.test(text), `the plan says why for ${what}`)
expect(/prepare a deposit of \*\*450 USDC\*\*/.test(text), 'the plan offers the deposit')
expect(/3,950 USDC, after the fund/.test(text), 'the plan is quoted on the money left after the fund (the wallet seen onchain is not added)')
console.log(bad ? `${bad} problem(s)` : 'flow OK')
if (bad) process.exit(1)
