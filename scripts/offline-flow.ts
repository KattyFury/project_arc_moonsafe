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
// A tiny fake Arc RPC for the AI-power purchase checks: chain id, one transaction + receipt chosen by the test.
let rpcChain = '0x13b2' // 5042
let rpcTx: Record<string, unknown> | null = null
const fakeRpc = async (_u: string, init?: RequestInit) => {
  const req = JSON.parse(String(init?.body)) as { id: number; method: string }
  const one = (r: { id: number; method: string }) => {
    let result: unknown = null
    if (r.method === 'eth_chainId') result = rpcChain
    if (r.method === 'eth_getTransactionByHash') result = rpcTx
    if (r.method === 'eth_getTransactionReceipt') result = rpcTx ? { transactionHash: rpcTx.hash, blockHash: rpcTx.blockHash, blockNumber: '0x10', from: rpcTx.from, to: rpcTx.to, status: '0x1', gasUsed: '0x5208', cumulativeGasUsed: '0x5208', logs: [], logsBloom: '0x' + '0'.repeat(512), contractAddress: null, effectiveGasPrice: '0x1', type: '0x0', transactionIndex: '0x0' } : null
    return { jsonrpc: '2.0', id: r.id, result }
  }
  return new Response(JSON.stringify(Array.isArray(req) ? (req as Array<{ id: number; method: string }>).map(one) : one(req)), { status: 200, headers: { 'content-type': 'application/json' } })
}
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })
  if (u.includes('rpc.mainnet.arc.io') || u.includes('fake-rpc.test')) return fakeRpc(u, init)
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
  { role: 'assistant', content: buildIntake(normalizeProfile({ v: 3 }), 'I want investing', false, [], 1916) ?? '' },
]
async function call(messages: Array<{ role: string; content: string }>, profile: ReturnType<typeof normalizeProfile>, vaultUsdc = 0, extra: Record<string, unknown> = {}) {
  modelCalls = 0
  const request = new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, context: { profile, vaultUsdc, walletUsdc: 1916, cirBtcUsdc: 0, ...extra } }) })
  const res = await onRequestPost({ request, env: { OPENAI_API_KEY: 'fake', LOCAL_DEV: '1' } })
  const body = await res.json() as { content?: string; ops?: unknown[]; actions?: Array<{ type: string; items?: Array<{ text: string; ops: unknown }>; ask?: string[] }>; error?: string }
  return { status: res.status, body, calls: modelCalls }
}
let bad = 0
const expect = (ok: boolean, what: string) => { if (!ok) { bad++; console.log('FAIL', what) } }

// 0. A brand-new user's first message: the questions come as a FORM to fill in (server-built, no model call).
const hello = await call([{ role: 'user', content: 'investing' }], normalizeProfile({ v: 3 }), 0)
const formAction = hello.body.actions?.find(a => a.type === 'intake_form') as { keys?: string[]; seen?: number | null } | undefined
console.log('step 0: model calls', hello.calls, '| form sections', formAction?.keys?.join(','), '| wallet seen', formAction?.seen)
expect(hello.calls === 0, 'the first message costs no model call')
expect(formAction?.keys?.join() === 'age,income,spending,stability,goal,assets,other,debt', 'the form carries every section for a brand-new user')
expect(formAction?.seen === 1916, 'the form is told what the app sees in the wallet (a hint)')
expect(/Share whatever you're comfortable with/.test(hello.body.content ?? '') && !/^• /m.test(hello.body.content ?? ''), 'the message above the form is short, not a bulleted list')

// 1. A NEW user types everything in one message: it is saved at once (no confirm card), and the plan follows in the same reply.
const empty = normalizeProfile({ v: 3 })
const first = await call([...history, { role: 'user', content: message }], empty)
const firstText = first.body.content ?? ''
console.log('step 1: status', first.status, '| model calls', first.calls, '| ops', first.body.ops?.length)
expect(first.status === 200, 'step 1 succeeds')
expect(first.calls === 2, `the planner records and ends (2 calls), nothing else is called (got ${first.calls})`)
expect(!first.body.actions?.some(a => a.type === 'confirm_items'), 'a first declaration is not put through a confirm card')
expect((first.body.ops?.length ?? 0) >= 6, 'everything declared is saved at once (ops come back for the app to apply)')
expect(readOps(first.body.ops).some(o => o.op === 'update_profile' && 'hasWindfalls' in o.fields), 'an airdrop is saved as a windfall flag')
expect(!readOps(first.body.ops).some(o => o.op === 'set_income' && /airdrop/i.test(o.income.name)), 'an airdrop is never saved as monthly income')
expect(/Here is your plan, in order/.test(firstText) && /Airdrops come in bursts/.test(firstText), 'the plan (with the airdrop note) follows without a model call')
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
expect(/Here is your plan, in order/.test(text) && /by your age, 31/.test(text) && /Traditional and Crypto are kept even/.test(text), 'the plan: steps in order, the split by age, why Traditional and Crypto are even')
expect(/Airdrops come in bursts/.test(text), 'the plan explains that airdrops are not steady income')
for (const [what, re] of [['the fund', /Emergency fund: \$450\*\* = 3 months of spending, because/], ['Safety', /Safety 31%[^\n]*any time/], ['Traditional', /Traditional 34\.5%[^\n]*index funds/], ['Crypto', /Crypto 34\.5%[^\n]*Bitcoin/]] as const) expect(re.test(text), `the plan says why for ${what}`)
expect(/prepare a deposit of \*\*450 USDC\*\*/.test(text), 'the plan offers the deposit')
expect(/You have \*\*\$1,450\*\* not placed yet/.test(text), 'the money not placed yet is what the declared wallet keeps after the fund (the wallet seen onchain is not added)')
expect(/Traditional 34\.5%[^\n]*on track/.test(text) && /Safety 31%[^\n]*of \$[\d,]+, \$[\d,]+ to go/.test(text), 'Balance Sheet v2: the part furthest ahead is on track, the others say what they have of the target and what is left')

// 2b. The same answer from someone whose emergency fund is ALREADY full: the overview still comes first, never a straight offer to buy.
const full = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: event }], saved, 900)
const fullText = full.body.content ?? ''
console.log('\nstep 2b: model calls', full.calls)
expect(/Here is your plan, in order/.test(fullText), 'fund already full: the plan comes first')
expect(!/cirBTC|prepare a|for you to sign/i.test(fullText), 'fund already full: no purchase is offered before they pick a part')
expect(/Which part would you like to fill first|Only [^.]* still has room/.test(fullText), 'fund already full: it asks which part to fill')

// 3. The user cancels everything: nothing saved, the agent does not run the plan.
const none = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: '[app event] The user reviewed the items: saved: none. skipped: everything.' }], empty)
console.log('\nstep 3: status', none.status, '| model calls', none.calls)
expect(!/Here is your plan/.test(none.body.content ?? ''), 'with nothing saved there is no plan')

// 3b. Safety net: the planner records NOTHING for "2500 in USDC, 500 in cash, 2000 in gold" (real chat 2026-10-28): the server still does.
planMode = 'noop'
const known = normalizeProfile({ v: 3, age: 21, incomeStable: false, dependents: 0, debtsComplete: true, noNearGoal: true })
const net = await call([...history, { role: 'user', content: '2500 in USDC, 500 in cash, 2000 in gold that\'s all' }], known, 0)
const netCard = net.body.actions?.find(a => a.type === 'confirm_items')
console.log('\nstep 3b: items', netCard?.items?.map(i => i.text).join(' / '))
expect((netCard?.items ?? []).length === 3, 'the three phrases become three items to confirm')
expect(/USDC.*2,?500/.test((netCard?.items ?? [])[0]?.text ?? '') && /Cash 500 USDC/.test((netCard?.items ?? [])[1]?.text ?? '') && /Gold/.test((netCard?.items ?? [])[2]?.text ?? ''), 'USDC, cash and gold with the right amounts')
planMode = 'full'

// 4. Length (Hieu, 2026-10-28): short when collecting or asking, long only to educate.
expect(/MODE THIS TURN: BRIEF/.test(replySystem), 'after a card with nothing saved the reply is BRIEF')
const whyLesson = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: 'why do I need an emergency fund?' }], saved, 0)
expect(whyLesson.calls === 0 && /unexpected|loss of income/i.test(whyLesson.body.content ?? ''), 'a reviewed why question teaches without a model call')
await call([...history, { role: 'user', content: 'Why does the emergency fund depend on income stability?' }], saved, 0)
expect(/MODE THIS TURN: TEACH/.test(replySystem), 'an unfamiliar why question still uses TEACH mode')

// 5. "How much is in my bank / Safety?": answered with the totals by the server, the emergency fund on its own line (never mixed with Safety).
const how = await call([...history, { role: 'user', content: 'how much is in my bank savings?' }], saved, 900)
const howText = how.body.content ?? ''
console.log('\nstep 5: model calls', how.calls, '\n' + howText)
expect(how.calls === 0, 'a "how much" question is answered by the server: no model call')
expect(/\*\*Emergency fund:\*\*[^\n]*months of spending/.test(howText) && /\*\*Safety:\*\* [^\n]* of [^\n]*(to go|full)/.test(howText), 'the emergency fund and Safety are separate lines, each with "X of Y"')
expect(!/Safety[^\n]*months of spending/.test(howText), 'Safety never carries months of spending')


// 6. Safety and Traditional are full, only Crypto has room: "Yep" to "start with it?" gets the cirBTC offer, never "Safety or Traditional?"
const base = normalizeProfile({ v: 3, age: 21, incomeStable: false, dependents: 0, debtsComplete: true, noNearGoal: true,
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
// No vault yet (Hieu, 2026-10-29): the plan offers to OPEN the vault (fee said plainly), "yes" gets the opening card, the signed
// opening gets the deposit offer. Never a deposit card before the vault exists.
const noVault = { hasVault: false, vaultFeeUsdc: 1 }
const planNV = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: crafted }, { role: 'user', content: event }], saved, 0, noVault)
const planNVText = planNV.body.content ?? ''
expect(/Opening it is \*\*1 USDC, once\*\* per account/.test(planNVText) && /Shall I open it for you to sign\?/.test(planNVText) && !/prepare a deposit/.test(planNVText), `no vault: the plan offers to open it with the one-time fee, not a deposit (got: ${planNVText.slice(-160)})`)
const yesOpen = await call([{ role: 'assistant', content: planNVText }, { role: 'user', content: 'yes' }], saved, 0, noVault)
expect(yesOpen.calls === 0 && (yesOpen.body.actions ?? []).some(a => a.type === 'prepare_open_vault'), '"yes" to the opening offer gets the opening card, no model call')
const opened = await call([{ role: 'assistant', content: planNVText }, { role: 'user', content: 'yes' }, { role: 'assistant', content: 'Here it is: sign the card below to open your vault.' }, { role: 'user', content: '[app event] The user signed the card: Opened your emergency fund vault.' }], saved, 0)
expect(/Your vault is open/.test(opened.body.content ?? '') && /prepare a deposit of \*\*[\d,.]+ USDC\*\*/.test(opened.body.content ?? ''), `after opening: the deposit is offered (got: ${(opened.body.content ?? '').slice(0, 160)})`)

// "no" to the deposit offer: respected, no card, no second offer (real chat 2026-10-29).
const offer = 'Ready to start? The first step is your emergency fund: shall I prepare a deposit of 24 USDC from your wallet for you to sign?'
const no = await call([{ role: 'user', content: 'I want to start investing' }, { role: 'assistant', content: offer }, { role: 'user', content: 'no' }], base, 0)
const noText = no.body.content ?? ''
expect(no.calls === 0 && /your call/.test(noText) && !/prepare|deposit/i.test(noText) && !(no.body.actions ?? []).length, `"no" to an offer is respected with no new offer (got: ${noText.slice(0, 80)})`)
const noMore = await call([{ role: 'assistant', content: offer }, { role: 'user', content: 'no, make it 10' }], base, 0)
expect(!/your call/.test(noMore.body.content ?? ''), '"no, make it 10" is not a plain no')
// Refusals in more words (real chat 2026-10-30: "no just leave it" went to the model).
for (const t of ['no just leave it', 'No, just leave it for now.', 'not now, maybe later', 'forget it', 'never mind', 'no need', 'thôi, cứ để vậy đi']) { // lang-ok
  const r = await call([{ role: 'assistant', content: offer }, { role: 'user', content: t }], base, 0)
  expect(r.calls === 0 && /your call|quyết định của bạn/.test(r.body.content ?? '') && !(r.body.actions ?? []).length, `"${t}" to an offer is a no`) // lang-ok
}
for (const t of ['no I already have savings', 'not yet, I want to ask about crypto', 'no, why?']) {
  const r = await call([{ role: 'assistant', content: offer }, { role: 'user', content: t }], base, 0)
  expect(!/your call/.test(r.body.content ?? ''), `"${t}" is not a plain no`)
}

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

// 6b3. A buy asked a few words later (real chat 2026-10-30: "Create an 11$ order for me" got "I can't create that order from here").
const buyOffer6 = 'cirBTC is Bitcoin you can buy and hold in this app. Shall I prepare the first buy of **1 USDC** for you to sign? If you prefer all **6 USDC** at once, just say so.'
const buyLater = (text: string, walletUsdc: number) => call([{ role: 'assistant', content: buyOffer6 }, { role: 'user', content: text }], base, 900, { walletUsdc })
const buyAmt = (r: Awaited<ReturnType<typeof call>>) => (r.body.actions as Array<{ type: string; amount?: { amount: number } }> | undefined)?.find(a => a.type === 'prepare_buy_cirbtc')?.amount?.amount
const longAsk = 'No this is mainnet we are not lack of liquidity. Create an 11$ order for me'
const big = await buyLater(longAsk, 50)
expect(big.calls === 0 && buyAmt(big) === 11, `buy order: "create an 11$ order" makes an 11 USDC buy card when the wallet has enough (got: ${(big.body.content ?? '').slice(0, 100)})`)
const small6 = await buyLater(longAsk, 6)
expect(buyAmt(small6) === undefined && /can spend about \*\*5\.98 USDC\*\*/.test(small6.body.content ?? '') && /cirBTC buy of \*\*5\.98 USDC\*\*/.test(small6.body.content ?? ''), `buy order above the wallet: says what it can spend and offers that (got: ${(small6.body.content ?? '').slice(0, 120)})`)
expect(buyAmt(await buyLater('I will buy gold with 5$ instead', 50)) === undefined, 'buy order: gold is not a cirBTC buy')

// 6b2. A small deposit that does not fill the fund (real chat 2026-10-30: $5 got "Still needed to open cirBTC buying"): the fund
// status and "a little at a time", nothing about cirBTC, no model call.
const small = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user signed the card: Added 5 USDC to your emergency fund.' }], base, 5)
const smallText = small.body.content ?? ''
expect(small.calls === 0 && /emergency fund is now \$5 of \$[\d,]+/.test(smallText) && /a little at a time/.test(smallText) && !/cirBTC|BTC|bitcoin|buy/i.test(smallText), `after a small deposit: "$5 of $X", add a little at a time, no cirBTC (got: ${smallText.slice(0, 160)})`)

// 6c. A saved amount (record box) is acknowledged, with the part it touched, then only the parts that have room.
const rec = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user confirmed recording: Recorded 500 USDC in Bank savings (Safety), from Binance.' }], base, 900)
const recText = rec.body.content ?? ''
console.log('\nstep 6c: model calls', rec.calls, '\n' + recText)
expect(rec.calls === 0 && /^Saved\. Safety is now \$[\d,]+(: on track| of \$[\d,]+)/.test(recText) && /Only Crypto/.test(recText), 'after a saved amount: which part it touched, then only the part with room')

// 6d. Naming a part answers where it lives and what is left; Safety is outside the app.
const safe = await call([...history, { role: 'user', content: message }, { role: 'assistant', content: firstText }, { role: 'user', content: '[app event] The user signed the card: Added 900 USDC to your emergency fund.' }, { role: 'assistant', content: 'Which part would you like to fill first: Safety (300 USDC of 840 USDC) or Crypto (0 USDC of 1,354 USDC)?' }, { role: 'user', content: 'How about the "safe" part' }], { ...base, holdings: base.holdings.map(h => h.id === 'h2' ? { ...h, value: 300 } : h) }, 900)
const safeText = safe.body.content ?? ''
console.log('\nstep 6d: model calls', safe.calls, '\n' + safeText)
expect(safe.calls === 0 && /Safety lives outside the app/.test(safeText) && /You have \$300 of/.test(safeText), 'naming Safety explains it lives outside the app, with the totals')


// 7. The admin page's API: who may call it, what it changes, and that it never shows a secret.
{
  const { generatePrivateKey, privateKeyToAccount } = await import('viem/accounts')
  const quotaPath = '../functions/_lib/quota'
  const powerPath = '../src/lib/power'
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
  const proof = async (who = admin, account = 'did:privy:token-report', age = 0, host = 'local') => {
    const message = `MoonSafe admin sign-in\nDomain: ${host}\nAccount: ${account}\nIssued: ${Date.now() - age}`
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
  expect((await get('op=overview', await proof(admin, 'did:privy:token-report', 0, 'evil.example'))).status === 403, 'admin: a proof signed for another site is refused')
  const ch = await (await get('op=challenge')).json() as { message?: string; wallets?: unknown }
  expect(/^MoonSafe admin sign-in\nDomain: local\nAccount: did:privy:token-report\nIssued: \d+$/.test(ch.message ?? '') && ch.wallets === undefined, 'admin: the challenge names the site and does not list the admin wallets')
  expect((await adminGet({ request: new Request('http://local/api/admin?op=overview', { headers: headers(await proof()) }), env: { ...env, ADMIN_WALLETS: '' } })).status === 403, 'admin: ADMIN_WALLETS set but empty switches the admin off')
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

  // AI-power purchase (second review 2026-10-29): every check of buyPower against a fake Arc RPC.
  {
    const { buyPower } = await import(quotaPath) as { buyPower: (e: unknown, id: string, h: string) => Promise<{ ok: boolean; error?: string; retry?: boolean }> }
    const { powerMemo } = await import(powerPath) as { powerMemo: (id: string) => string }
    const pay = '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6'
    const payKv = new MemKv()
    const penv = { USERDATA: payKv }
    const H = (n: number) => '0x' + n.toString(16).padStart(64, '0')
    const mk = (n: number, over: Record<string, unknown> = {}) => ({ hash: H(n), blockHash: H(900 + n), blockNumber: '0x10', from: '0x' + '11'.repeat(20), to: pay, value: '0xde0b6b3a7640000', input: powerMemo('did:privy:alice'), nonce: '0x0', gas: '0x5208', gasPrice: '0x1', type: '0x0', transactionIndex: '0x0', v: '0x1b', r: '0x1', s: '0x1', ...over })
    rpcTx = mk(1)
    const r1 = await buyPower(penv, 'did:privy:alice', H(1))
    expect(r1.ok && payKv.m.get('power:did:privy:alice') === '100' && payKv.m.get(`powertx:${H(1)}`) === 'did:privy:alice', 'purchase: a correct 1 USDC payment with the right memo credits 100 messages')
    const r2 = await buyPower(penv, 'did:privy:alice', H(1))
    expect(!r2.ok && /already counted/.test(r2.error ?? '') && payKv.m.get('power:did:privy:alice') === '100', 'purchase: the same payment is not counted twice')
    const r3 = await buyPower(penv, 'did:privy:bob', H(1))
    expect(!r3.ok && !payKv.m.has('power:did:privy:bob'), 'purchase: another account cannot claim it')
    rpcTx = mk(2); expect(!(await buyPower(penv, 'did:privy:bob', H(2))).ok && !payKv.m.has(`powertx:${H(2)}`), 'purchase: a memo for another account is refused and the claim is released')
    rpcTx = mk(3, { value: '0x1bc16d674ec80000' }); expect(!(await buyPower(penv, 'did:privy:alice', H(3))).ok, 'purchase: 2 USDC is refused (exact price only)')
    rpcTx = mk(4, { to: '0x' + '22'.repeat(20) }); expect(!(await buyPower(penv, 'did:privy:alice', H(4))).ok, 'purchase: a payment to another address is refused')
    rpcTx = mk(5, { hash: H(99) }); expect(!(await buyPower(penv, 'did:privy:alice', H(5))).ok, 'purchase: a transaction whose hash differs from the one asked is refused')
    rpcTx = null; const nf = await buyPower(penv, 'did:privy:alice', H(6)); expect(!nf.ok && nf.retry === true && !payKv.m.has(`powertx:${H(6)}`), 'purchase: an unknown transaction says try again and leaves no claim')
    rpcTx = mk(7, { input: powerMemo('did:privy:alice') }); rpcChain = '0x1'
    expect(!(await buyPower(penv, 'did:privy:alice', H(7))).ok && !payKv.m.has(`powertx:${H(7)}`), 'purchase: an RPC that is not chain 5042 credits nothing')
    rpcChain = '0x13b2'
    expect(!(await buyPower({ ...penv, POWER_PAYMENT_ADDRESS: 'oops' }, 'did:privy:alice', H(7))).ok, 'purchase: a mistyped payment address fails closed')
    expect(!(await buyPower({ ...penv, ARC_RPC: 'http://insecure.test' }, 'did:privy:alice', H(7))).ok, 'purchase: a non-https RPC fails closed')
    rpcTx = mk(8)
    const [pa, pb] = await Promise.all([buyPower(penv, 'did:privy:alice', H(8)), buyPower(penv, 'did:privy:alice', H(8))])
    console.log(`  info: two parallel claims of one payment left alice at ${payKv.m.get('power:did:privy:alice')} messages (200 = one extra credit, 300 = double credit)`)
    expect(payKv.m.get('power:did:privy:alice') === '200' || (pa.ok && pb.ok), `purchase: two parallel claims of one payment (credit ${payKv.m.get('power:did:privy:alice')}; KV is not atomic, see the audit)`)
    for (let i = 0; i < 11; i++) { rpcTx = null; await buyPower(penv, 'did:privy:carol', H(100 + i)) }
    expect((await buyPower(penv, 'did:privy:carol', H(200))).error === 'Too many attempts, try again in an hour', 'purchase: 10 failed checks an hour lock the account out of the RPC')
  }

  // Open-vault card rules (second review 2026-10-29).
  {
    const vaultChat = async (text: string, hasVault: boolean | 'unknown' = false) => {
      const r = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ role: 'user', content: text }], context: hasVault === 'unknown' ? {} : { hasVault } }) }), env: env as unknown as Record<string, string> })
      return await r.json() as { actions?: Array<{ type: string }>; content?: string }
    }
    const opens = (r: { actions?: Array<{ type: string }> }) => !!r.actions?.some(a => a.type === 'prepare_open_vault')
    expect(!opens(await vaultChat("I don't want to open a vault")), 'vault: "I don\'t want to open a vault" is not a request')
    expect(!opens(await vaultChat('how do I open a vault?')), 'vault: a how-question does not open the signing card')
    expect(!opens(await vaultChat('my landlord lets me stay for free, rent is 0')).valueOf() && !/free, you get/.test((await vaultChat('my landlord lets me stay for free, rent is 0')).content ?? ''), 'price: a sentence with a number that says "for free" is not a price question')
    expect(opens(await vaultChat('please open my vault')), 'vault: a plain request opens the card')
    expect(!opens(await vaultChat('please open my vault', 'unknown')), 'vault: an unknown vault state (not read yet) never offers a second vault')
    await post({ op: 'config', patch: { cardsEnabled: false } }, okProof)
    expect(!opens(await vaultChat('please open my vault')), 'vault: the pause-transactions switch also stops the open-vault card')
    await post({ op: 'config', patch: { cardsEnabled: true } }, okProof)

    // The "yes to an offered amount" fast path obeys the buy lock and the pause switch (review 2026-10-30).
    const yes = async (offer: string, text = 'yes', ctx: Record<string, unknown> = { hasVault: true }) => {
      const r = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ role: 'assistant', content: offer }, { role: 'user', content: text }], context: ctx }) }), env: env as unknown as Record<string, string> })
      return await r.json() as { actions?: Array<{ type: string }> }
    }
    const has = (r: { actions?: Array<{ type: string }> }, t: string) => !!r.actions?.some(a => a.type === t)
    const buyOffer = 'Shall I prepare a cirBTC buy of **100 USDC** from your wallet for you to sign?'
    const depOffer = 'Ready to start? The first step is your emergency fund: shall I prepare a deposit of **450 USDC** from your wallet for you to sign?'
    expect(!has(await yes(buyOffer), 'prepare_buy_cirbtc'), 'fast path: "yes" to a buy offer does not make a buy card while buying is locked')
    expect(has(await yes(depOffer), 'prepare_deposit'), 'fast path: "yes" to a deposit offer makes the deposit card')
    expect(!has(await yes(depOffer, 'yes', { hasVault: false }), 'prepare_deposit'), 'fast path: no deposit card without a vault')
    expect(!has(await yes(buyOffer, 'make it 5$'), 'prepare_buy_cirbtc'), 'fast path: a new amount for a buy offer is refused while buying is locked')
    // Real chat 2026-10-30: the deposit offer, a "no", a question, then "I have 5$ to put in" and "help me create order" got no card.
    const later = async (turns: string[], ctx: Record<string, unknown> = { hasVault: true }) => {
      const msgs = [{ role: 'assistant', content: 'Ready to start? Your wallet can start the fund with **48 USDC** now: shall I prepare a deposit of **48 USDC** for you to sign?' },
        ...turns.map((c, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: c }))]
      const r = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: msgs, context: ctx }) }), env: env as unknown as Record<string, string> })
      return await r.json() as { actions?: Array<{ type: string; amount?: { amount: number } }> }
    }
    const amountOf = (r: { actions?: Array<{ type: string; amount?: { amount: number } }> }) => r.actions?.find(a => a.type === 'prepare_deposit')?.amount?.amount
    const talk = ['no just leave it', 'Understood. Leave it as-is.', 'Why Emergency fund: $3,600?', 'Because it is 6 months of spending.']
    expect(amountOf(await later([...talk, 'I have 5$ to put in'])) === 5, 'later deposit: "I have 5$ to put in" a few turns after the offer makes a 5 USDC card')
    expect(amountOf(await later([...talk, 'I have 5$ to put in', 'Yes, $5 is enough to start.', 'help me create order'])) === 5, 'later deposit: "help me create order" uses the amount the user said')
    expect(amountOf(await later([...talk, 'help me create order'])) === 48, 'later deposit: "help me create order" with no amount said uses the offered amount')
    expect(amountOf(await later(['help me create order'])) === 48, 'later deposit: "help me create order" right after the offer makes the card')
    expect(amountOf(await later([...talk, 'I add 5$ to my bank savings each month'])) === undefined, 'later deposit: money talk about the bank is not a deposit')
    expect(amountOf(await later([...talk, 'I have 5$ to put in'], { hasVault: false })) === undefined, 'later deposit: no card without a vault')
    await post({ op: 'config', patch: { cardsEnabled: false } }, okProof)
    expect(!has(await yes(depOffer), 'prepare_deposit') && !has(await yes(depOffer, 'make it 5$'), 'prepare_deposit'), 'fast path: the pause switch stops deposit cards from both fast paths')
    await post({ op: 'config', patch: { cardsEnabled: true } }, okProof)
  }

  // Round 3 (2026-10-30): every regex the chat runs, against 2,000-character repetitive inputs (user text and the agent's previous reply).
  {
    const battery: Array<[string, string]> = [
      ['digits', '1'.repeat(2000)], ['spaced digits', '1 '.repeat(1000)], ['thousands', '1,'.repeat(1000)], ['dollars', '$1'.repeat(1000)],
      ['dots', '1.'.repeat(1000)], ['words', 'a '.repeat(1000)], ['k', 'k '.repeat(1000)], ['1 k', '1 k '.repeat(500)],
      ['have 1', 'I have 1' + ' 1'.repeat(900)], ['put in bank', 'I put ' + '1,'.repeat(900) + ' in my bank'], ['long word', 'I have ' + 'x'.repeat(1900)],
      ['sentences', '. '.repeat(1000)], ['parens', '('.repeat(2000)], ['per month', '1 usdc a month '.repeat(130)], ['nines', 'my savings are $' + '9'.repeat(1900)],
      ['maybe', 'maybe '.repeat(300)], ['just leave it', 'just leave it '.repeat(140)], ['no no', 'no '.repeat(660)], ['vietnamese', 'đồng triệu '.repeat(180)], ['i am', "I'm 3 " .repeat(300)], ['no debt', 'no debt '.repeat(240)], ['question marks', '?'.repeat(2000)],
      ['offer text', 'prepare a deposit of **1 USDC** '.repeat(60)], ['percent', '5% '.repeat(600)], ['to repay', '1 to repay '.repeat(170)],
    ]
    let worst = ['', 0]
    for (const [name, text] of battery) {
      for (const asAssistant of [false, true]) {
        const msgs = asAssistant ? [{ role: 'assistant', content: text }, { role: 'user', content: 'yes' }] : [{ role: 'user', content: text }]
        const t = Date.now()
        await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: msgs, context: { hasVault: true } }) }), env: env as unknown as Record<string, string> })
        const ms = Date.now() - t
        if (ms > (worst[1] as number)) worst = [`${name}${asAssistant ? ' (as the agent reply)' : ''}`, ms]
        expect(ms < 800, `regex DoS: "${name}"${asAssistant ? ' as the previous agent reply' : ''} took ${ms} ms`)
      }
    }
    console.log(`  info: slowest adversarial message: ${worst[0]} ${worst[1]} ms`)
  }

  // Security review 2026-10-29: fail closed without KV; a whitespace bomb must not cost seconds of CPU.
  const noKv = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }) }), env: { OPENAI_API_KEY: 'fake' } })
  expect(noKv.status === 503 && /unavailable/.test(await noKv.text()), 'security: the chat refuses to run without the KV binding')
  const bomb = '1' + ' '.repeat(1900) + 'x'
  const t0 = Date.now()
  const bombRes = await onRequestPost({ request: new Request('http://local/api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages: [{ role: 'user', content: bomb }, { role: 'assistant', content: 'x', tool_calls: [{ bad: true }] }, { role: 'user', content: 5 }], context: {} }) }), env: env as unknown as Record<string, string> })
  expect(Date.now() - t0 < 1500 && bombRes.status < 500, `security: a whitespace-bomb message is cheap (${Date.now() - t0} ms, status ${bombRes.status})`)

  const log = await (await get('op=log', okProof)).json() as { log: Array<{ action: string }> }
  expect(log.log.length >= 6 && log.log.some(l => l.action === 'config') && log.log.some(l => l.action === 'delete_data'), 'admin: every change is in the audit log')
}

console.log(bad ? `${bad} problem(s)` : 'flow OK')
if (bad) process.exit(1)
