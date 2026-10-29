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
let planMode: 'full' | 'noop' = 'full'
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
    ? (toolMsgs === 0 && planMode === 'full'
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

// 0. A brand-new user's first message: the questions come as a FORM to fill in (server-built, no model call).
const hello = await call([{ role: 'user', content: 'investing' }], normalizeProfile({ v: 2 }), 0)
const formAction = hello.body.actions?.find(a => a.type === 'intake_form') as { keys?: string[]; seen?: number | null } | undefined
console.log('step 0: model calls', hello.calls, '| form sections', formAction?.keys?.join(','), '| wallet seen', formAction?.seen)
expect(hello.calls === 0, 'the first message costs no model call')
expect(formAction?.keys?.join() === 'age,income,spending,stability,goal,assets,other,debt', 'the form carries every section for a brand-new user')
expect(formAction?.seen === 1916, 'the form is told what the app sees in the wallet (a hint)')
expect(/Share whatever you're comfortable with/.test(hello.body.content ?? '') && !/^• /m.test(hello.body.content ?? ''), 'the message above the form is short, not a bulleted list')

// 1. A NEW user types everything in one message: it is saved at once (no confirm card), and the plan follows in the same reply.
const empty = normalizeProfile({ v: 2 })
const first = await call([...history, { role: 'user', content: message }], empty)
const firstText = first.body.content ?? ''
console.log('step 1: status', first.status, '| model calls', first.calls, '| ops', first.body.ops?.length)
expect(first.status === 200, 'step 1 succeeds')
expect(first.calls === 2, `the planner records and ends (2 calls), nothing else is called (got ${first.calls})`)
expect(!first.body.actions?.some(a => a.type === 'confirm_items'), 'a first declaration is not put through a confirm card')
expect((first.body.ops?.length ?? 0) >= 6, 'everything declared is saved at once (ops come back for the app to apply)')
expect(readOps(first.body.ops).some(o => o.op === 'update_profile' && 'hasWindfalls' in o.fields), 'an airdrop is saved as a windfall flag')
expect(!readOps(first.body.ops).some(o => o.op === 'set_income' && /airdrop/i.test(o.income.name)), 'an airdrop is never saved as monthly income')
expect(/To invest the right way you need three things/.test(firstText) && /About airdrops: they arrive in bursts/.test(firstText), 'the plan (overview + airdrop note) follows without a model call')
let saved = applyOps(empty, readOps(first.body.ops))

// 2. A returning user confirms a card: the app applies the ops, tells the agent, and the plan follows (built by the server, no model call).
const crafted = 'I picked up 10 things. Confirm or cancel each one below; nothing is saved until you do.'
const event = '[app event] The user reviewed the items: saved: Age 31; Salary 150 USDC a month (active). skipped: none.'
const second = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: event }], saved)
const text = second.body.content ?? ''
console.log('\nstep 2: status', second.status, '| model calls', second.calls)
if (process.env.FLOW_DEBUG) console.log(second.body.content)
expect(second.status === 200, 'step 2 succeeds')
expect(second.calls === 0, `after the card the plan is built by the server: no model call (got ${second.calls})`)
expect(/To invest the right way you need three things/.test(text) && /safe part of 31%/.test(text) && /takes risk, 69%/.test(text), 'the plan opens with the overview: what is needed and the safe / at-risk split')
expect(/About airdrops: they arrive in bursts/.test(text), 'the plan explains that airdrops are not a stable job')
for (const [what, re] of [['the fund', /Emergency fund: \$450[^\n]*Why 3 months:/], ['Safety', /Safety 31%[^\n]*any time/], ['Traditional', /Traditional 3[45]%[^\n]*index funds/], ['Crypto', /Crypto 3[45]%[^\n]*BTC/]] as const) expect(re.test(text), `the plan says why for ${what}`)
expect(/prepare a deposit of \*\*450 USDC\*\*/.test(text), 'the plan offers the deposit')
expect(/\$3,950, after the emergency fund/.test(text), 'the plan is quoted on the money left after the fund (the wallet seen onchain is not added)')

// 2b. The same answer from someone whose emergency fund is ALREADY full: the overview still comes first, never a straight offer to buy.
const full = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: event }], saved, 900)
const fullText = full.body.content ?? ''
console.log('\nstep 2b: model calls', full.calls)
expect(/To invest the right way you need three things/.test(fullText), 'fund already full: the overview comes first')
expect(!/cirBTC|prepare a|for you to sign/i.test(fullText), 'fund already full: no purchase is offered before they pick a part')
expect(/Which part would you like to fill first|Only [^.]* still has room/.test(fullText), 'fund already full: it asks which part to fill')

// 3. The user cancels everything: nothing saved, the agent does not run the plan.
const none = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: '[app event] The user reviewed the items: saved: none. skipped: everything.' }], empty)
console.log('\nstep 3: status', none.status, '| model calls', none.calls)
expect(!/Here is your plan/.test(none.body.content ?? ''), 'with nothing saved there is no plan')

// 3b. Safety net: the planner records NOTHING for "2500 in USDC, 500 in cash, 2000 in gold" (real chat 2026-10-28): the server still does.
planMode = 'noop'
const known = normalizeProfile({ v: 2, age: 21, incomeStable: false, dependents: 0, debtsComplete: true, noNearGoal: true })
const net = await call([...history, { role: 'user', content: '2500 in USDC, 500 in cash, 2000 in gold that\'s all' }], known, 0)
const netCard = net.body.actions?.find(a => a.type === 'confirm_items')
console.log('\nstep 3b: items', netCard?.items?.map(i => i.text).join(' / '))
expect((netCard?.items ?? []).length === 3, 'the three phrases become three items to confirm')
expect(/USDC.*2,?500/.test((netCard?.items ?? [])[0]?.text ?? '') && /Cash 500 USDC/.test((netCard?.items ?? [])[1]?.text ?? '') && /Gold/.test((netCard?.items ?? [])[2]?.text ?? ''), 'USDC, cash and gold with the right amounts')
planMode = 'full'

// 4. Length (Hieu, 2026-10-28): short when collecting or asking, long only to educate.
expect(/MODE THIS TURN: BRIEF/.test(replySystem), 'after a card with nothing saved the reply is BRIEF')
await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: 'why do I need an emergency fund?' }], saved, 0)
expect(/MODE THIS TURN: TEACH/.test(replySystem), 'a "why" question is answered in TEACH mode')

// 5. "How much is in my bank / Safety?": answered with the totals by the server, the emergency fund on its own line (never mixed with Safety).
const how = await call([...history, { role: 'user', content: 'how much is in my bank savings?' }], saved, 900)
const howText = how.body.content ?? ''
console.log('\nstep 5: model calls', how.calls, '\n' + howText)
expect(how.calls === 0, 'a "how much" question is answered by the server: no model call')
expect(/\*\*Emergency fund:\*\*[^\n]*months of spending/.test(howText) && /\*\*Safety:\*\* [^\n]* of [^\n]*(to go|full)/.test(howText), 'the emergency fund and Safety are separate lines, each with "X of Y"')
expect(!/Safety[^\n]*months of spending/.test(howText), 'Safety never carries months of spending')


// 6. Safety and Traditional are full, only Crypto has room: "Yep" to "start with it?" gets the cirBTC offer, never "Safety or Traditional?"
const base = normalizeProfile({ v: 2, age: 21, incomeStable: false, dependents: 0, debtsComplete: true, noNearGoal: true,
  incomes: [{ id: 'i1', name: 'Salary', monthly: 150, currency: 'USDC', kind: 'active' }],
  expenses: [{ id: 'e1', name: 'Spending', monthly: 150, currency: 'USDC', kind: 'fixed' }],
  holdings: [
    { id: 'h1', type: 'stable_wallet', name: 'USDC in this wallet', where: 'app wallet', value: 1000, currency: 'USDC', priceSource: 'self', rebalanceable: true },
    { id: 'h2', type: 'savings', name: 'Bank savings', value: 1000, currency: 'USDC', priceSource: 'self', rebalanceable: true },
    { id: 'h3', type: 'gold_physical', name: 'Gold', value: 2000, currency: 'USDC', priceSource: 'self', rebalanceable: true },
  ] })
const onlyCrypto = 'Your emergency fund is now 900 USDC of 900 USDC. Only Crypto (0 USDC of 1,360 USDC) still has room. Would you like to start with it?'
const yep = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user signed the card: Added 900 USDC to your emergency fund.' }, { role: 'assistant', content: onlyCrypto }, { role: 'user', content: 'Yep. I will start with that' }], base, 900)
const yepText = yep.body.content ?? ''

// "Are you free to use?": the real prices, from code (Hieu, 2026-10-29).
// "no" to the deposit offer: respected, no card, no second offer (real chat 2026-10-29).
const offer = 'Ready to start? The first step is your emergency fund: shall I prepare a deposit of 24 USDC from your wallet for you to sign?'
const no = await call([{ role: 'user', content: 'I want to start investing' }, { role: 'assistant', content: offer }, { role: 'user', content: 'no' }], base, 0)
const noText = no.body.content ?? ''
expect(no.calls === 0 && /your call/.test(noText) && !/prepare|deposit/i.test(noText) && !(no.body.actions ?? []).length, `"no" to an offer is respected with no new offer (got: ${noText.slice(0, 80)})`)
const noMore = await call([{ role: 'assistant', content: offer }, { role: 'user', content: 'no, make it 10' }], base, 0)
expect(!/your call/.test(noMore.body.content ?? ''), '"no, make it 10" is not a plain no')

const price = await call([{ role: 'user', content: 'are you free to use?' }], base, 900)
const priceText = price.body.content ?? ''
expect(price.calls === 0 && /20 messages a day/.test(priceText) && /1 USDC, once/.test(priceText) && /charges nothing else/.test(priceText), `"are you free?" gets the prices with no model call (got ${price.calls} calls: ${priceText.slice(0, 80)})`)
const notPrice = await call([{ role: 'user', content: 'how much is in my bank?' }], base, 900)
expect(!/messages a day/.test(notPrice.body.content ?? ''), 'a question about money held is not taken as a price question')
console.log('\nstep 6: model calls', yep.calls, '\n' + yepText)
expect(yep.calls === 0, `choosing a part costs no model call (got ${yep.calls})`)
expect(/prepare the first buy of \*\*\d[\d,]* USDC\*\*[^\n]*all \*\*\d[\d,]* USDC\*\* at once/.test(yepText), 'a yes to "start with Crypto?" gets the offer: the first of 6 monthly buys, or all at once')
expect(!/Safety or Traditional|Which (part|bucket)/i.test(yepText), 'full parts are never offered')

// 6b. After the user signs the emergency-fund deposit, the next step names only the parts that still have room.
const signed = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user signed the card: Added 900 USDC to your emergency fund.' }], base, 900)
const signedText = signed.body.content ?? ''
console.log('\nstep 6b: model calls', signed.calls, '\n' + signedText)
expect(signed.calls === 0 && /emergency fund is now \$900 of \$900/.test(signedText) && /Only Crypto/.test(signedText) && !/Safety|Traditional/.test(signedText.split('Only Crypto')[1] ?? ''), 'after the deposit: the fund status, then only Crypto (the only part with room)')

// 6c. A saved amount (record box) is acknowledged, with the part it touched, then only the parts that have room.
const rec = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user confirmed recording: Recorded 500 USDC in Bank savings (Safety), from Binance.' }], base, 900)
const recText = rec.body.content ?? ''
console.log('\nstep 6c: model calls', rec.calls, '\n' + recText)
expect(rec.calls === 0 && /^Saved\. Safety is now \$[\d,]+ of \$[\d,]+/.test(recText) && /Only Crypto/.test(recText), 'after a saved amount: which part it touched, then only the part with room')

// 6d. Naming a part answers where it lives and what is left; Safety is outside the app.
const safe = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user signed the card: Added 900 USDC to your emergency fund.' }, { role: 'assistant', content: 'Which part would you like to fill first: Safety (300 USDC of 840 USDC) or Crypto (0 USDC of 1,354 USDC)?' }, { role: 'user', content: 'How about the "safe" part' }], { ...base, holdings: base.holdings.map(h => h.id === 'h2' ? { ...h, value: 300 } : h) }, 900)
const safeText = safe.body.content ?? ''
console.log('\nstep 6d: model calls', safe.calls, '\n' + safeText)
expect(safe.calls === 0 && /Safety lives outside the app/.test(safeText) && /You have \$300 of/.test(safeText), 'naming Safety explains it lives outside the app, with the totals')


// 7. The admin page's API: who may call it, what it changes, and that it never shows a secret.
{
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
  const adminModule = '../functions/api/admin'
  const { onRequestGet: adminGet, onRequestPost: adminPost } = await import(adminModule) as {
    onRequestGet: (c: { request: Request; env: unknown }) => Promise<Response>
    onRequestPost: (c: { request: Request; env: unknown }) => Promise<Response>
  }
  class MemKv {
    m = new Map<string, string>()
    get = async (k: string) => this.m.get(k) ?? null
    put = async (k: string, v: string) => { this.m.set(k, v) }
    delete = async (k: string) => { this.m.delete(k) }
    list = async (o: { prefix?: string; limit?: number } = {}) => ({ keys: [...this.m.keys()].filter(k => k.startsWith(o.prefix ?? '')).sort().slice(0, o.limit ?? 1000).map(name => ({ name })), list_complete: true })
  }
  const kv = new MemKv()
  const admin = privateKeyToAccount(generatePrivateKey())
  const stranger = privateKeyToAccount(generatePrivateKey())
  const env = { OPENAI_API_KEY: 'fake-secret-key-123', ADMIN_WALLETS: admin.address, USERDATA: kv }
  const proof = async (who = admin, account = 'did:privy:token-report', age = 0) => {
    const message = `MoonSafe admin sign-in\nAccount: ${account}\nIssued: ${Date.now() - age}`
    return JSON.stringify({ message, signature: await who.signMessage({ message }) })
  }
  const headers = (p?: string) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(p ? { 'x-admin-proof': p } : {}) })
  const get = (q: string, p?: string) => adminGet({ request: new Request(`http://local/api/admin?${q}`, { headers: headers(p) }), env })
  const post = (body: unknown, p?: string) => adminPost({ request: new Request('http://local/api/admin', { method: 'POST', headers: headers(p), body: JSON.stringify(body) }), env })
  const chatText = async () => { const r = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }], context: {} }) }), env: env as never }); return { status: r.status, body: await r.json() as { error?: string; code?: string } } }

  expect((await get('op=challenge')).status === 200, 'admin: a signed-in account can ask for the challenge')
  expect((await get('op=overview')).status === 403, 'admin: no proof, no entry')
  expect((await get('op=overview', await proof(stranger))).status === 403, 'admin: a wallet that is not on the list is refused')
  expect((await get('op=overview', await proof(admin, 'did:privy:somebody-else'))).status === 403, 'admin: a proof made for another account is refused')
  expect((await get('op=overview', await proof(admin, 'did:privy:token-report', 31 * 60_000))).status === 403, 'admin: a proof older than 30 minutes is refused')
  const okProof = await proof()
  const ov = await get('op=overview', okProof)
  const ovText = await ov.text()
  expect(ov.status === 200 && /"openai":true/.test(ovText) && /"claude":false/.test(ovText), 'admin: the overview says which AI keys exist')
  expect(!ovText.includes('fake-secret-key-123'), 'admin: a secret is never returned')
  expect(/"freeTurnsPerDay":20/.test(ovText) && /"userTokenBudget":600000/.test(ovText), 'admin: the effective limits are shown')

  await kv.put('u:did:privy:alice', JSON.stringify({ profile: { holdings: [{}, {}], debts: [], age: 30 }, chat: [1, 2, 3], updatedAt: 1000 }))
  const users = await (await get('op=users', okProof)).json() as { users: Array<{ id: string; holdings: number; messages: number }> }
  expect(users.users.some(u => u.id === 'did:privy:alice' && u.holdings === 2 && u.messages === 3), 'admin: the user list summarizes stored accounts')

  const grant = await post({ op: 'user', id: 'did:privy:alice', action: 'grant_power', messages: 50 }, okProof)
  const detail = await (await get('op=user&id=did:privy:alice', okProof)).json() as { extraPower: number }
  expect(grant.status === 200 && detail.extraPower === 50, 'admin: granting power adds messages')

  const blockedRes = await post({ op: 'user', id: 'did:privy:token-report', action: 'block' }, okProof)
  const blockedChat = await chatText()
  expect(blockedRes.status === 200 && blockedChat.status === 403 && blockedChat.body.code === 'blocked', 'admin: a blocked account gets no answer')
  await post({ op: 'user', id: 'did:privy:token-report', action: 'unblock' }, okProof)

  await post({ op: 'config', patch: { chatEnabled: false, notice: 'Back in ten minutes' } }, okProof)
  const paused = await chatText()
  expect(paused.status === 503 && paused.body.code === 'paused' && paused.body.error === 'Back in ten minutes', 'admin: pausing the agent shows the notice and stops answers')
  await post({ op: 'config', patch: { chatEnabled: true, notice: '', freeTurnsPerDay: 5 } }, okProof)
  expect((await (await get('op=overview', okProof)).text()).includes('"freeTurnsPerDay":5'), 'admin: a changed daily limit is used')
  const bad = await post({ op: 'config', patch: { freeTurnsPerDay: -4, primaryProvider: 'evil' } }, okProof)
  expect(bad.status === 200 && /"freeTurnsPerDay":null/.test(await bad.text()), 'admin: invalid settings fall back to the defaults')

  expect((await post({ op: 'user', id: 'did:privy:alice', action: 'delete_data' }, okProof)).status === 400, 'admin: deleting data needs a confirmation')
  await post({ op: 'user', id: 'did:privy:alice', action: 'delete_data', confirm: true }, okProof)
  expect(!kv.m.has('u:did:privy:alice'), 'admin: confirmed deletion removes the account data')

  const log = await (await get('op=log', okProof)).json() as { log: Array<{ action: string }> }
  expect(log.log.length >= 6 && log.log.some(l => l.action === 'config') && log.log.some(l => l.action === 'delete_data'), 'admin: every change is in the audit log')
}

console.log(bad ? `${bad} problem(s)` : 'flow OK')
if (bad) process.exit(1)
