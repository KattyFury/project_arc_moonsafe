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
import { applyOps, normalizeProfile, readOps } from '../src/lib/profile'

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
  'I keep 500$ in the bank and 2000$ in gold', 'I keep 1900$ USDC in this wallet', 'no I don\'t have any debt', 'my salary is steady, the airdrop income is not steady, sometimes I earn 1000$ 2000$ or even 5000$, a few times a year',
].join('\n')
const T = (name: string, args: unknown) => ({ id: 'c' + Math.random(), type: 'function', function: { name, arguments: JSON.stringify(args) } })
const M = (amount: number) => ({ amount, currency: 'USDC' })
let modelCalls = 0
let replySystem = ''
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
  if (!u.includes('openai.com')) return realFetch(url as never, init)
  modelCalls++
  const body = JSON.parse(String(init?.body)) as { tool_choice?: string; messages: Array<{ role: string; content?: string }> }
  if (body.tool_choice !== 'required') replySystem = body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n')
  const toolMsgs = body.messages.filter(m => m.role === 'tool').length
  const message = body.tool_choice === 'required'
    ? (toolMsgs === 0
      ? { role: 'assistant', content: null, tool_calls: [
          T('update_profile', { age: 31, income_stable: true, dependents: 0, debts_complete: true, no_near_goal: true }),
          T('set_income', { name: 'Salary', monthly: M(150), kind: 'active' }),
          T('set_income', { name: 'Airdrop', monthly: M(1000), kind: 'irregular' }),
          T('update_profile', { has_windfalls: true }),
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
async function call(messages: Array<{ role: string; content: string }>, profile: ReturnType<typeof normalizeProfile>, vaultUsdc = 0) {
  modelCalls = 0
  const request = new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, context: { profile, vaultUsdc, walletUsdc: 1916, cirBtcUsdc: 0 } }) })
  const res = await onRequestPost({ request, env: { OPENAI_API_KEY: 'fake' } })
  const body = await res.json() as { content?: string; ops?: unknown[]; actions?: Array<{ type: string; items?: Array<{ text: string; ops: unknown }>; ask?: string[] }>; error?: string }
  return { status: res.status, body, calls: modelCalls }
}
let bad = 0
const expect = (ok: boolean, what: string) => { if (!ok) { bad++; console.log('FAIL', what) } }

// 1. Everything declared in one message: NOTHING is saved yet, the app asks to confirm each thing.
const empty = normalizeProfile({ v: 2 })
const first = await call([...history, { role: 'user', content: message }], empty)
const card = first.body.actions?.find(a => a.type === 'confirm_items')
console.log('step 1: status', first.status, '| model calls', first.calls, '| items', card?.items?.map(i => i.text).join(' / '))
expect(first.status === 200, 'step 1 succeeds')
expect(first.calls === 2, `the planner records and ends (2 calls), nothing else is called (got ${first.calls})`)
expect(JSON.stringify(first.body.ops) === '[]', 'nothing is saved before the user confirms: ops are empty')
expect((card?.items?.length ?? 0) >= 6, 'the confirm card carries every thing that was declared')
expect(!(card?.items ?? []).some(i => /^Airdrop \d|income/i.test(i.text) && /airdrop/i.test(i.text) && /a month/i.test(i.text)), 'an airdrop is never offered as monthly income')
expect((card?.items ?? []).some(i => /windfalls: not counted as monthly income/i.test(i.text)), 'it is offered as a windfall that is not counted')
expect((card?.items ?? []).some(i => /^USDC in this wallet/i.test(i.text)), 'the USDC the user declares for this wallet is an item')
expect((card?.items ?? []).every(i => readOps(i.ops).length > 0), 'every item carries the operations that save it')

// 2. The user confirms everything: the app applies the ops, tells the agent, and the plan follows (built by the server, no model call).
let saved = empty
for (const i of card?.items ?? []) saved = applyOps(saved, readOps(i.ops))
const event = `[app event] The user reviewed the items: saved: ${(card?.items ?? []).map(i => i.text).join('; ')}. skipped: none.`
const second = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: first.body.content ?? '' }, { role: 'user', content: event }], saved)
const text = second.body.content ?? ''
console.log('\nstep 2: status', second.status, '| model calls', second.calls)
expect(second.status === 200, 'step 2 succeeds')
expect(second.calls === 0, `after the card the plan is built by the server: no model call (got ${second.calls})`)
expect(/To invest the right way you need three things/.test(text) && /safe part of 31%/.test(text) && /takes risk, 69%/.test(text), 'the plan opens with the overview: what is needed and the safe / at-risk split')
expect(/About airdrops: they arrive in bursts/.test(text), 'the plan explains that airdrops are not a stable job')
for (const [what, re] of [['the fund', /Emergency fund: 450 USDC[^\n]*Why:/], ['Safety', /Safety 31%[^\n]*any time/], ['Traditional', /Traditional 39%[^\n]*index funds/], ['Crypto', /Crypto 30%[^\n]*BTC/]] as const) expect(re.test(text), `the plan says why for ${what}`)
expect(/prepare a deposit of \*\*450 USDC\*\*/.test(text), 'the plan offers the deposit')
expect(/3,950 USDC, after the fund/.test(text), 'the plan is quoted on the money left after the fund (the wallet seen onchain is not added)')

// 2b. The same answer from someone whose emergency fund is ALREADY full: the overview still comes first, never a straight offer to buy.
const full = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: first.body.content ?? '' }, { role: 'user', content: event }], saved, 900)
const fullText = full.body.content ?? ''
console.log('\nstep 2b: model calls', full.calls)
expect(/To invest the right way you need three things/.test(fullText), 'fund already full: the overview comes first')
expect(!/cirBTC|prepare a|for you to sign/i.test(fullText), 'fund already full: no purchase is offered before they pick a part')
expect(/Which part would you like to fill first|Only \w+ still has room/.test(fullText), 'fund already full: it asks which part to fill')

// 3. The user cancels everything: nothing saved, the agent does not run the plan.
const none = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: first.body.content ?? '' }, { role: 'user', content: '[app event] The user reviewed the items: saved: none. skipped: everything.' }], empty)
console.log('\nstep 3: status', none.status, '| model calls', none.calls)
expect(!/Here is your plan/.test(none.body.content ?? ''), 'with nothing saved there is no plan')

// 4. Length (Hieu, 2026-10-28): short when collecting or asking, long only to educate.
expect(/MODE THIS TURN: BRIEF/.test(replySystem), 'after a card with nothing saved the reply is BRIEF')
await call([...history, { role: 'user', content: message }, { role: 'assistant', content: first.body.content ?? '' }, { role: 'user', content: 'why do I need an emergency fund?' }], saved, 0)
expect(/MODE THIS TURN: TEACH/.test(replySystem), 'a "why" question is answered in TEACH mode')

console.log(bad ? `${bad} problem(s)` : 'flow OK')
if (bad) process.exit(1)
