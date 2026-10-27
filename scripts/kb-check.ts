// Checks the knowledge base (src/kb) against the spec: the age formula against the spec table,
// fund floors, priority debt, every pattern's facts and params, and ~25 user personas that must
// match exactly the expected patterns (every pattern is hit at least once).
// Then real profiles (src/types.ts v2, and a v1 record migrated) run through computeBalance →
// computeFacts → matchPatterns, with the buy-lock cases spec 14.6 requires.
//   bun scripts/kb-check.ts        → exit 1 on any mismatch

import { KB, targetMix, fundFloorMonths, isPriorityDebt, matchPatterns, patternBrief, type Cond, type Facts } from '../src/kb/kb'
import { computeFacts, displayFacts } from '../src/kb/facts'
import { computeBalance } from '../src/lib/allocation'
import { applyOps, normalizeProfile } from '../src/lib/profile'
import { buildRecordOps, detectPlacement, sourceOptions } from '../src/lib/record'
import { EMPTY_PROFILE, type Debt, type FinancialProfile, type Holding } from '../src/types'

let fails = 0
const fail = (m: string) => { fails++; console.log('FAIL', m) }

// 1. Age formula vs the spec 4 table (rounded to 0.1 there). Framework v2 (2026-10-27): crypto is one
// bucket, all of its target in BTC; big caps and low caps have no target.
const TABLE: Record<number, number[]> = {
  18: [18, 46.9, 35.1, 0, 0], 20: [20, 45.7, 34.3, 0, 0], 25: [25, 42.9, 32.1, 0, 0], 30: [30, 40, 30, 0, 0],
  35: [35, 37.1, 27.9, 0, 0], 40: [40, 34.3, 25.7, 0, 0], 45: [45, 31.4, 23.6, 0, 0], 50: [50, 28.6, 21.4, 0, 0],
  55: [55, 25.7, 19.3, 0, 0], 60: [60, 22.9, 17.1, 0, 0], 65: [65, 20, 15, 0, 0], 70: [70, 17.1, 12.9, 0, 0],
}
for (const [age, want] of Object.entries(TABLE)) {
  const m = targetMix(Number(age))
  const got = [m.safe, m.traditional, m.btc, m.large_cap, m.altcoin]
  if (got.some((g, i) => Math.abs(g - want[i]) > 0.051)) fail(`age ${age}: got ${got.map(g => g.toFixed(1)).join('/')} want ${want.join('/')}`)
  if (Math.abs(got.reduce((a, b) => a + b, 0) - 100) > 1e-9) fail(`age ${age}: shares do not add to 100`)
}
for (const age of [18, 50, 90, 100]) if (!(targetMix(age).btc > 0)) fail(`BTC must never be 0 (age ${age})`)
if (Math.abs(targetMix(100).btc - targetMix(90).btc) > 1e-9) fail('ages above 90 must use 90')

// 2. Fund floor (spec 5.1).
const floors: [boolean | null, number, boolean, number][] = [[true, 0, false, 3], [null, 0, false, 3], [true, 2, false, 6], [false, 0, false, 6], [false, 1, false, 9], [false, 1, true, 12]]
for (const [stable, deps, sole, want] of floors) {
  const got = fundFloorMonths({ income_stable: stable, dependents: deps, sole_earner: sole })
  if (got !== want) fail(`fund floor stable=${stable} deps=${deps} sole=${sole}: ${got} ≠ ${want}`)
}

// 3. Priority debt (spec 5.2 and the required test cases in spec 14).
const debts: [string, number, boolean][] = [
  ['credit_card', 25, true], ['consumer_loan', 18, true], ['payday_loan', 40, true], ['crypto_margin', 6, true],
  ['mortgage', 8, false], ['mortgage', 10, true], ['car_loan', 12, true], ['business_loan', 7, false],
  ['family_no_interest', 0, false], ['family_interest', 5, false], ['family_interest', 12, true], ['credit_card', 0, false],
]
for (const [type, rate, want] of debts) if (isPriorityDebt({ type, rate_pct: rate }) !== want) fail(`priority debt ${type} ${rate}% should be ${want}`)

// 4. Every pattern only uses known facts and params.
const known = new Set((KB as unknown as { facts_reference: string[] }).facts_reference)
const walk = (c: Cond, id: string): void => {
  if ('all' in c) return c.all.forEach(x => walk(x, id))
  if ('any' in c) return c.any.forEach(x => walk(x, id))
  if ('not' in c) return walk(c.not, id)
  if (!known.has(c.fact)) fail(`pattern ${id}: unknown fact ${c.fact}`)
  if (c.value && typeof c.value === 'object' && 'param' in c.value && !KB.params[c.value.param]) fail(`pattern ${id}: unknown param ${c.value.param}`)
}
const ids = new Set<string>()
for (const p of KB.patterns) {
  if (ids.has(p.id)) fail(`duplicate pattern id ${p.id}`)
  ids.add(p.id)
  walk(p.when, p.id)
  for (const t of [...p.say, p.agent_does]) for (const [, k] of t.matchAll(/\{(\w+)\}/g)) if (!known.has(k) && !['amount', 'asset', 'item', 'value', 'declared_total', 'items_total', 'dca_amount'].includes(k)) fail(`pattern ${p.id}: placeholder {${k}} is not a fact`)
}

// 5. Personas: a complete, healthy 30-year-old, then one change each.
const base: Facts = {
  age: 30, age_known: true, age_declined: false, income_known: true, spending_known: true, income_stable: true, dependents: 0, sole_earner: false,
  income_active: 3000, income_passive: 0, income_irregular: 0, spending: 1500, surplus: 1500,
  fund_usd: 4500, fund_floor_months: 3, fund_months: 3, starter_fund_met: true, fund_met: true,
  priority_debt_count: 0, crypto_margin_count: 0, family_noint_debt_count: 0, debt_total: 0, debt_asked: true,
  liquid_total: 20000, net_worth: 24500, net_worth_months: 16, share_altcoin: 0.05, max_gap_points: 3, passive_ratio: 0,
  largest_irregular_inflow_months: 0, stale_self_declared_count: 0, stale_cashflow: false, missing_price_count: 0,
  overdue_loan_count: 0, defi_stable_count: 0, holdings_count: 5, buy_lock_open: true, data_conflict: false, data_changed_this_turn: false,
  intent_recover_loss: false, intent_added_to_safe: false, intent_all_in_alt: false, intent_what_to_invest: false,
}
const locked = { buy_lock_open: false }
const personas: [string, Facts, string[]][] = [
  ['healthy 30, lock open, saving', {}, ['lock_open_surplus']],
  ['20, first job, almost nothing yet', { age: 20, income_active: 500, spending: 400, surplus: 100, fund_usd: 0, fund_months: 0, starter_fund_met: false, fund_met: false, liquid_total: 300, net_worth: 300, net_worth_months: 1, holdings_count: 1, ...locked }, ['new_starter', 'fund_short']],
  ['credit card debt', { priority_debt_count: 1, debt_total: 2000, ...locked }, ['priority_debt']],
  ['crypto margin loan', { priority_debt_count: 1, crypto_margin_count: 1, ...locked }, ['crypto_margin', 'priority_debt']],
  ['interest-free family debt', { family_noint_debt_count: 1, debt_total: 5000 }, ['lock_open_surplus', 'family_debt_no_interest']],
  ['mortgage under the rate (not priority)', { debt_total: 80000 }, ['lock_open_surplus']],
  ['lost the job', { income_active: 0, surplus: -1500 }, ['jobless', 'negative_surplus']],
  ['irregular income, kids, sole earner', { income_stable: false, dependents: 2, sole_earner: true, fund_floor_months: 12, fund_met: false, ...locked }, ['fund_short', 'irregular_income', 'dependents']],
  ['house rich, fund empty', { fund_usd: 0, fund_months: 0, starter_fund_met: false, fund_met: false, net_worth: 400000, net_worth_months: 260, ...locked }, ['fund_short', 'asset_rich_cash_poor']],
  ['all-in altcoins', { share_altcoin: 0.6, max_gap_points: 55 }, ['altcoin_heavy', 'lock_open_surplus', 'off_target']],
  ['says all-in alt, holds none yet', { intent_all_in_alt: true }, ['altcoin_heavy', 'lock_open_surplus']],
  ['airdrop windfall', { largest_irregular_inflow_months: 6 }, ['windfall', 'lock_open_surplus']],
  ['big loss, wants to win it back', { intent_recover_loss: true }, ['recover_loss', 'lock_open_surplus']],
  ['financially free', { income_passive: 2000, passive_ratio: 1.3 }, ['lock_open_surplus', 'financially_free']],
  ['age not given yet', { age: null, age_known: false }, ['age_unknown', 'lock_open_surplus']],
  ['declined the age', { age: null, age_known: false, age_declined: true }, ['age_declined', 'lock_open_surplus']],
  ['nothing declared yet', { holdings_count: 0, debt_asked: false, income_known: false, spending_known: false, surplus: null }, ['collecting']],
  ['"I just put 1,000 into safe"', { intent_added_to_safe: true }, ['added_to_safe', 'lock_open_surplus']],
  ['total does not match items', { data_conflict: true }, ['data_conflict', 'lock_open_surplus']],
  ['no market price for a coin', { missing_price_count: 1 }, ['missing_price', 'lock_open_surplus']],
  ['old self-declared figures', { stale_self_declared_count: 2 }, ['lock_open_surplus', 'stale_data']],
  ['stablecoins in DeFi', { defi_stable_count: 1 }, ['lock_open_surplus', 'defi_stable']],
  ['money lent, overdue', { overdue_loan_count: 1 }, ['lock_open_surplus', 'loan_overdue']],
  ['adds assets later', { data_changed_this_turn: true }, ['lock_open_surplus', 'data_updated']],
  ['spending unknown: no fund gap claimed', { spending_known: false, fund_met: false, surplus: null, ...locked }, ['collecting']],
  ['70, retired on passive income (not jobless)', { age: 70, income_active: 0, income_passive: 1600, passive_ratio: 1.07, surplus: 100 }, ['lock_open_surplus', 'financially_free']],
  ['retired, passive below spending', { age: 68, income_active: 0, income_passive: 600, passive_ratio: 0.4, surplus: -900 }, ['jobless', 'negative_surplus']],
]

// 7. "I put 1,000 in my bank": a confirmation box, saved only with the source the user picks (real chat 2026-10-27).
const placed: [string, { amountUsd: number; holdingType: string; source: string | null } | null][] = [
  ['Imma put 1000$ in my bank account as Safety', { amountUsd: 1000, holdingType: 'savings', source: null }],
  ['I just put 1,000 into safe', { amountUsd: 1000, holdingType: 'savings', source: null }],
  ['I moved 500 USDC from my wallet into savings', { amountUsd: 500, holdingType: 'savings', source: 'wallet' }],
  ['I deposited 2,000 in a term deposit', { amountUsd: 2000, holdingType: 'term_deposit', source: null }],
  ['I put 300 in flexible earn from my salary', { amountUsd: 300, holdingType: 'flexible_earn', source: 'new' }],
  ['I got 1000 new money from outside the app, I put it in my bank', { amountUsd: 1000, holdingType: 'savings', source: 'new' }],
  ['ok I have 1000 more in savings from outside', { amountUsd: 1000, holdingType: 'savings', source: 'new' }],
  ['I told you it is outside money, 1000 in the bank', { amountUsd: 1000, holdingType: 'savings', source: 'new' }],
  ['I have 200$ in the bank', null],
  ['I have 3000 in savings and 200 in cash', null],
  ['should I put 1000$ in the bank?', null],
  ['Oh I just accidentaly got 1000$ doing airdrop', null],
  ['Safety, I told you before', null],
]
for (const [msg, want] of placed) {
  const got = detectPlacement(msg, 25000)
  if (JSON.stringify(got && { amountUsd: got.amountUsd, holdingType: got.holdingType, source: got.source }) !== JSON.stringify(want)) fail(`placement "${msg}": ${JSON.stringify(got)}`)
}
const cashP = normalizeProfile({ v: 2, holdings: [{ id: 'h1', type: 'cash', name: 'Cash', value: 1500, currency: 'USDC', priceSource: 'self', rebalanceable: true, updatedAt: 1 }] })
const req = detectPlacement('I put 1000$ in my bank', null)!
const valuesOf = (p: FinancialProfile) => p.holdings.map(h => `${h.type}:${h.value}`).join(',')
if (sourceOptions(cashP, req, null).map(h => h.id).join() !== 'h1') fail('the cash item should be offered as a source')
if (valuesOf(applyOps(cashP, buildRecordOps(cashP, req, { kind: 'holding', id: 'h1' }, null))) !== 'cash:500,savings:1000') fail('a listed source goes down, the destination goes up')
if (valuesOf(applyOps(cashP, buildRecordOps(cashP, req, { kind: 'new' }, null))) !== 'cash:1500,savings:1000') fail('new money only adds')
const once = applyOps(cashP, buildRecordOps(cashP, req, { kind: 'new' }, null))
if (valuesOf(applyOps(once, buildRecordOps(once, req, { kind: 'wallet' }, null))) !== 'cash:1500,savings:2000') fail('a second placement adds to the same savings item')
if (sourceOptions(cashP, { ...req, amountUsd: 2000 }, null).length) fail('a source smaller than the amount must not be offered')

const hit = new Set<string>()
for (const [name, over, want] of personas) {
  const facts = { ...base, ...over }
  const got = matchPatterns(facts).map(p => p.id)
  got.forEach(id => hit.add(id))
  const missing = want.filter(w => !got.includes(w)), extra = got.filter(g => !want.includes(g))
  if (missing.length || extra.length) fail(`${name}: missing [${missing}] extra [${extra}] (got ${got.join(', ')})`)
  else console.log(' ok ', name.padEnd(42), got.join(', '))
}

// 6. Real profiles → computeBalance → computeFacts → patterns (and the lock, spec 5.3 / 14.6).
const NOW = Date.UTC(2026, 9, 25)
const h = (o: Partial<Holding> & Pick<Holding, 'type' | 'name'>): Holding => ({ id: `h${Math.random()}`, updatedAt: NOW, priceSource: o.quantity !== undefined ? 'market' : 'self', rebalanceable: true, currency: 'USDC', ...o })
const debt = (o: Partial<Debt> & Pick<Debt, 'type' | 'balance'>): Debt => ({ id: `d${Math.random()}`, name: o.type, currency: 'USDC', ratePct: null, monthlyPayment: null, updatedAt: NOW, ...o })
const prices = { goldUsdPerOz: 4000, usd: { 'crypto:BTC': 100000, 'crypto:ETH': 4000, 'stock:VOO': 600 } }
const healthy: FinancialProfile = {
  ...EMPTY_PROFILE, age: 30, incomeStable: true, dependents: 0, soleEarner: false, debtsComplete: true,
  incomes: [{ id: 'i1', name: 'Salary', monthly: 3000, currency: 'USDC', kind: 'active', updatedAt: NOW }],
  expenses: [{ id: 'e1', name: 'Rent and food', monthly: 1500, currency: 'USDC', kind: 'fixed', updatedAt: NOW }],
  holdings: [h({ type: 'savings', name: 'Savings', value: 6000 }), h({ type: 'us_stock', name: 'VOO', symbol: 'VOO', quantity: 13 }), h({ type: 'btc', name: 'BTC', quantity: 0.04 }),
    h({ type: 'eth', name: 'ETH', quantity: 0.25 }), h({ type: 'altcoin', name: 'Alts', value: 1000 })],
}
type Real = { name: string; p: FinancialProfile; vault?: number; wallet?: number; msg?: string; open?: boolean; want: string[] }
const reals: Real[] = [
  { name: 'healthy, fund full, no debt', p: healthy, vault: 4500, open: true, want: ['lock_open_surplus'] },
  { name: 'credit card blocks', p: { ...healthy, debts: [debt({ type: 'credit_card', balance: 2000, ratePct: 24, monthlyPayment: 200 })] }, vault: 6000, open: false, want: ['priority_debt'] },
  { name: 'family, no interest, does not block', p: { ...healthy, debts: [debt({ type: 'family_no_interest', balance: 5000, ratePct: 0, monthlyPayment: 200, lender: 'Mom' })] }, vault: 6000, open: true, want: ['family_debt_no_interest', 'lock_open_surplus'] },
  { name: 'mortgage 8% does not block', p: { ...healthy, debts: [debt({ type: 'mortgage', balance: 80000, ratePct: 8, monthlyPayment: 600 })] }, vault: 6300, open: true, want: ['lock_open_surplus'] },
  { name: 'mortgage 10% blocks', p: { ...healthy, debts: [debt({ type: 'mortgage', balance: 80000, ratePct: 10, monthlyPayment: 600 })] }, vault: 6300, open: false, want: ['priority_debt'] },
  { name: 'fund short blocks, says the gap', p: healthy, vault: 1000, open: false, want: ['fund_short'] },
  { name: 'age not known: ask it', p: { ...healthy, age: null }, vault: 4500, open: true, want: ['age_unknown', 'lock_open_surplus'] },
  { name: 'age declined: default 30', p: { ...healthy, age: null, ageDeclined: true }, vault: 4500, open: true, want: ['age_declined', 'lock_open_surplus'] },
  { name: 'passive covers spending: free', p: { ...healthy, incomes: [...healthy.incomes, { id: 'i2', name: 'Rent', monthly: 1600, currency: 'USDC', kind: 'passive', updatedAt: NOW }] }, vault: 4500, open: true, want: ['financially_free', 'lock_open_surplus'] },
  { name: '"just put 1,000 into safe"', p: healthy, vault: 4500, msg: 'I just put $1,000 into my savings', open: true, want: ['added_to_safe', 'lock_open_surplus'] },
  { name: 'says where it came from: no question', p: healthy, vault: 4500, msg: 'I just moved $1,000 from my wallet into my savings', open: true, want: ['lock_open_surplus'] },
  { name: 'wants to go all in altcoins', p: healthy, vault: 4500, msg: 'I want to go all in on memecoins', open: true, want: ['altcoin_heavy', 'lock_open_surplus'] },
  { name: 'nothing declared', p: EMPTY_PROFILE, vault: 0, wallet: 50, open: false, want: ['age_unknown', 'collecting', 'new_starter'] },
  { name: 'v1 record migrated (debt type unknown)', p: normalizeProfile({ monthlyIncome: 3000, monthlyExpenses: 1500, debtAmount: 500, age: 30, incomeStable: true, units: { monthlyIncome: 'USDC', monthlyExpenses: 'USDC', debtAmount: 'USDC' }, holdings: [{ kind: 'savings', quantity: 9000, currency: 'USDC' }] }, NOW), vault: 4500, open: false, want: ['priority_debt', 'collecting', 'off_target'] },
]
const floorCases: [Partial<FinancialProfile>, number][] = [[{ incomeStable: true, dependents: 0 }, 3], [{ incomeStable: true, dependents: 1 }, 6], [{ incomeStable: false, dependents: 0 }, 6], [{ incomeStable: false, dependents: 2, soleEarner: false }, 9], [{ incomeStable: false, dependents: 2, soleEarner: true }, 12]]
for (const [over, months] of floorCases) {
  const b = computeBalance({ profile: { ...healthy, ...over }, walletUsd: 0, vaultUsd: 4500, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
  if (b.fund.floorMonths !== months || b.fund.floorUsd !== months * 1500) fail(`floor ${JSON.stringify(over)}: ${b.fund.floorMonths} months ≠ ${months}`)
  if (b.lock.open !== (months === 3)) fail(`lock with floor ${months} months and 3 months in the fund should be ${months === 3 ? 'open' : 'closed'}`)
}
for (const r of reals) {
  const b = computeBalance({ profile: r.p, walletUsd: r.wallet ?? 0, vaultUsd: r.vault ?? 0, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
  const facts = computeFacts({ balance: b, profile: r.p, prices, vndPerUsd: 25000, message: r.msg ?? '', now: NOW })
  const got = matchPatterns(facts).map(x => x.id)
  got.forEach(id => hit.add(id))
  const missing = r.want.filter(w => !got.includes(w)), extra = got.filter(g => !r.want.includes(g))
  if (missing.length || extra.length) fail(`real ${r.name}: missing [${missing}] extra [${extra}] (got ${got.join(', ')})`)
  else if (r.open !== undefined && b.lock.open !== r.open) fail(`real ${r.name}: lock ${b.lock.open ? 'open' : 'closed'} (${b.lock.text})`)
  else console.log(' ok ', `real: ${r.name}`.padEnd(42), got.join(', ') || '—', '·', b.lock.text)
  for (const k of known) if (!(k in facts)) fail(`computeFacts misses fact ${k}`)
}
const shortB = computeBalance({ profile: healthy, walletUsd: 0, vaultUsd: 1000, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
if (!/add 3,500 USDC to the emergency fund/.test(shortB.lock.text)) fail(`lock text must say the exact gap: ${shortB.lock.text}`)
const declined = computeBalance({ profile: { ...healthy, age: null, ageDeclined: true }, walletUsd: 0, vaultUsd: 0, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
if (Math.abs((declined.target?.btc ?? 0) - 30) > 1e-9 || !declined.ageIsDefault) fail('declined age must use the age-30 split (crypto 30%, as BTC)')
const realBrief = patternBrief(matchPatterns(computeFacts({ balance: shortB, profile: healthy, prices, vndPerUsd: 25000, now: NOW })), displayFacts(computeFacts({ balance: shortB, profile: healthy, prices, vndPerUsd: 25000, now: NOW })))
if (/\{\w+\}/.test(realBrief)) fail(`placeholder left in the brief: ${realBrief}`)
console.log(`\nReal brief, fund short:\n${realBrief}`)

// What the model would receive for one persona (token budget check).
const sample = patternBrief(matchPatterns({ ...base, income_stable: false, dependents: 2, sole_earner: true, fund_floor_months: 12, fund_met: false, fund_gap: '6,000 USD', ...locked }), { ...base, fund_floor_months: 12, fund_gap: '6,000 USD' })
console.log(`\nSample brief (${sample.length} chars, ~${Math.round(sample.length / 4)} tokens):\n${sample}`)
for (const p of KB.patterns) if (!hit.has(p.id)) fail(`pattern ${p.id} is never matched by any persona`)
// 8. The daily token cap: counts per user and for everyone, blocks at the limit, off without KV.
{
  const { addUsage, overBudget } = await import('../functions/_lib/budget')
  const store = new Map<string, string>()
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }
  const env = { USERDATA: kv, USER_DAILY_TOKEN_BUDGET: '1000', DAILY_TOKEN_BUDGET: '1500' }
  if (await overBudget(env, 'a')) fail('budget: a fresh day must be open')
  await addUsage(env, 'a', 600)
  if (await overBudget(env, 'a')) fail('budget: 600 of 1000 is still open')
  await addUsage(env, 'a', 500)
  if (!(await overBudget(env, 'a'))?.includes('daily limit')) fail('budget: one user over 1000 must be blocked')
  if (await overBudget(env, 'b')) fail('budget: another user must still be open')
  await addUsage(env, 'b', 450)
  if (!(await overBudget(env, 'b'))?.includes('for everyone')) fail('budget: everyone over 1500 must be blocked')
  if (await overBudget({}, 'a')) fail('budget: without KV the cap is off')
}

// 9. "AI power": 30 messages a day (90 for the owner wallet), bought power after that, refunds, hidden events capped.
{
  const { ownerChallenge, powerState, takeTurn, verifyOwner } = await import('../functions/_lib/quota')
  const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts')
  const store = new Map<string, string>()
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }
  const owner = privateKeyToAccount(generatePrivateKey())
  const other = privateKeyToAccount(generatePrivateKey())
  const env = { USERDATA: kv, OWNER_WALLET: owner.address }

  for (let i = 0; i < 30; i++) if (!(await takeTurn(env, 'u1', 'message')).ok) fail(`power: message ${i + 1} of 30 must be allowed`)
  const blocked = await takeTurn(env, 'u1', 'message')
  if (blocked.ok || blocked.message.indexOf('Recharge') < 0) fail('power: the 31st message must be blocked and mention recharging')
  if (!(await takeTurn(env, 'u2', 'message')).ok) fail('power: another account has its own allowance')
  store.set('power:u1', '2')
  const paid = await takeTurn(env, 'u1', 'message')
  if (!paid.ok || (await powerState(env, 'u1'))?.extra !== 1) fail('power: bought power is used after the free messages')
  if (paid.ok) await paid.refund()
  if ((await powerState(env, 'u1'))?.extra !== 2) fail('power: a refund gives bought power back')
  const free = await takeTurn(env, 'u3', 'message')
  if (free.ok) await free.refund()
  if ((await powerState(env, 'u3'))?.used !== 0) fail('power: a refund gives the free message back')
  for (let i = 0; i < 20; i++) if (!(await takeTurn(env, 'u4', 'event')).ok) fail('power: 20 hidden events a day are allowed')
  if ((await takeTurn(env, 'u4', 'event')).ok) fail('power: hidden events are capped')
  if ((await powerState(env, 'u4'))?.used !== 0) fail('power: hidden events do not use the message allowance')

  // owner: 90 a day, only after a signature from the owner wallet, made for this account and fresh
  if ((await powerState(env, 'boss'))?.limit !== 30) fail('power: before verification the owner is a normal account')
  const sign = (acc: typeof owner, challenge: string) => acc.signMessage({ message: challenge })
  const c1 = ownerChallenge('boss')
  if ((await verifyOwner(env, 'boss', c1, await sign(other, c1))).ok) fail('power: a signature from another wallet must be refused')
  if ((await verifyOwner(env, 'someone-else', c1, await sign(owner, c1))).ok) fail('power: a challenge made for another account must be refused')
  const old = c1.replace(/Issued: \d+$/, `Issued: ${Date.now() - 11 * 60 * 1000}`)
  if ((await verifyOwner(env, 'boss', old, await sign(owner, old))).ok) fail('power: an expired challenge must be refused')
  if (!(await verifyOwner(env, 'boss', c1, await sign(owner, c1))).ok) fail('power: the owner wallet signature must be accepted')
  const bossState = await powerState(env, 'boss')
  if (bossState?.limit !== 90 || !bossState.boosted) fail('power: the verified owner gets 90 messages')
  for (let i = 0; i < 90; i++) if (!(await takeTurn(env, 'boss', 'message')).ok) fail(`power: owner message ${i + 1} of 90 must be allowed`)
  if ((await takeTurn(env, 'boss', 'message')).ok) fail('power: the 91st owner message must be blocked')
  if (!(await takeTurn({}, 'x', 'message')).ok) fail('power: without KV nothing is limited')
}


console.log(fails ? `\n${fails} problem(s).` : `\nKB OK: ${KB.patterns.length} patterns, ${personas.length} personas + ${reals.length} real profiles, formula matches the spec table.`)
process.exit(fails ? 1 : 0)
