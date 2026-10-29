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

// 1. Age formula: Safety = age, the rest split evenly between Traditional and Crypto (Hieu, 2026-10-29). Crypto is one
// bucket, all of its target in BTC; big caps and low caps have no target.
const TABLE: Record<number, number[]> = {
  18: [18, 41, 41, 0, 0], 20: [20, 40, 40, 0, 0], 25: [25, 37.5, 37.5, 0, 0], 30: [30, 35, 35, 0, 0],
  35: [35, 32.5, 32.5, 0, 0], 40: [40, 30, 30, 0, 0], 45: [45, 27.5, 27.5, 0, 0], 50: [50, 25, 25, 0, 0],
  55: [55, 22.5, 22.5, 0, 0], 60: [60, 20, 20, 0, 0], 65: [65, 17.5, 17.5, 0, 0], 70: [70, 15, 15, 0, 0],
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
  ['I withdraw money on this wallet to add to the bank, 600$', { amountUsd: 600, holdingType: 'savings', source: 'wallet' }],
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
if (valuesOf(applyOps(once, buildRecordOps(once, req, { kind: 'new' }, null))) !== 'cash:1500,savings:2000') fail('a second placement adds to the same savings item')
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
if (Math.abs((declined.target?.btc ?? 0) - 35) > 1e-9 || !declined.ageIsDefault) fail('declined age must use the age-30 split (crypto 35%, as BTC)')
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
  if (!(await overBudget(env, 'a'))?.includes('allowance')) fail('budget: one user over 1000 must be blocked')
  if (await overBudget(env, 'a', true)) fail('budget: the verified owner has no per-user token cap')
  if (await overBudget(env, 'b')) fail('budget: another user must still be open')
  await addUsage(env, 'b', 450)
  if (!(await overBudget(env, 'b'))?.includes('for everyone')) fail('budget: everyone over 1500 must be blocked')
  if (await overBudget({}, 'a')) fail('budget: without KV the cap is off')
}

// 9. "AI power": 20 messages a day (60 for the owner wallet), bought power after that, refunds, hidden events capped.
{
  const { ownerChallenge, powerState, takeTurn, verifyOwner } = await import('../functions/_lib/quota')
  const { privateKeyToAccount, generatePrivateKey } = await import('viem/accounts')
  const store = new Map<string, string>()
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }
  const owner = privateKeyToAccount(generatePrivateKey())
  const other = privateKeyToAccount(generatePrivateKey())
  const env = { USERDATA: kv, OWNER_WALLET: owner.address }

  for (let i = 0; i < 20; i++) if (!(await takeTurn(env, 'u1', 'message')).ok) fail(`power: message ${i + 1} of 20 must be allowed`)
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

  // owner: 60 a day, only after a signature from the owner wallet, made for this account and fresh
  if ((await powerState(env, 'boss'))?.limit !== 20) fail('power: before verification the owner is a normal account')
  const sign = (acc: typeof owner, challenge: string) => acc.signMessage({ message: challenge })
  const c1 = ownerChallenge('boss')
  if ((await verifyOwner(env, 'boss', c1, await sign(other, c1))).ok) fail('power: a signature from another wallet must be refused')
  if ((await verifyOwner(env, 'someone-else', c1, await sign(owner, c1))).ok) fail('power: a challenge made for another account must be refused')
  const old = c1.replace(/Issued: \d+$/, `Issued: ${Date.now() - 11 * 60 * 1000}`)
  if ((await verifyOwner(env, 'boss', old, await sign(owner, old))).ok) fail('power: an expired challenge must be refused')
  if (!(await verifyOwner(env, 'boss', c1, await sign(owner, c1))).ok) fail('power: the owner wallet signature must be accepted')
  const bossState = await powerState(env, 'boss')
  if (bossState?.limit !== 60 || !bossState.boosted) fail('power: the verified owner gets 60 messages')
  for (let i = 0; i < 60; i++) if (!(await takeTurn(env, 'boss', 'message')).ok) fail(`power: owner message ${i + 1} of 60 must be allowed`)
  if ((await takeTurn(env, 'boss', 'message')).ok) fail('power: the 91st owner message must be blocked')
  if (!(await takeTurn({}, 'x', 'message')).ok) fail('power: without KV nothing is limited')
}


// 10. Model call: OpenAI first, Claude as the standby (fetch is faked, nothing leaves this machine).
{
  const { callModel } = await import('../functions/_lib/llm')
  const realFetch = globalThis.fetch
  const calls: string[] = []
  let openaiStatus = 401
  const ok = (text: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 })
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    const u = String(url)
    calls.push(u.includes('openai.com') ? 'openai' : u.includes('anthropic.com') ? 'claude' : 'other')
    if (u.includes('openai.com')) return openaiStatus === 200 ? ok('from openai') : new Response(JSON.stringify({ error: { code: openaiStatus === 429 ? 'insufficient_quota' : 'x' } }), { status: openaiStatus })
    const sent = JSON.parse(init?.body ?? '{}') as { model: string; system?: string; messages: Array<{ role: string }> }
    // Claude: roles must alternate starting with user, and only user/assistant (system goes in its own field)
    if (sent.messages.some((m, i) => m.role !== (i % 2 ? 'assistant' : 'user'))) return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"bad roles"}}', { status: 400 })
    if (sent.system !== 'a') return new Response('{"type":"error","error":{"type":"invalid_request_error","message":"system not set"}}', { status: 400 })
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: sent.model, content: [{ type: 'text', text: 'from claude' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as typeof fetch
  const body = { model: 'gpt-x', messages: [{ role: 'system', content: 'a' }, { role: 'user', content: 'hi' }, { role: 'system', content: 'late note' }] }
  const text = (r: unknown) => (r as { choices: Array<{ message: { content: string } }> }).choices[0].message.content
  try {
    let meter: { tokens: number; provider?: 'claude' } = { tokens: 0 }
    const both = { openai: 'k1', claude: 'k2', claudeModel: 'claude-test' }
    let r = await callModel(both, body, meter)
    if (text(r) !== 'from claude' || meter.provider !== 'claude' || meter.tokens !== 15) fail('llm: a 401 from OpenAI must fall back to Claude and count its tokens')
    if (calls.join() !== 'openai,claude') fail(`llm: expected openai then claude, got ${calls.join()}`)
    calls.length = 0
    r = await callModel(both, body, meter)
    if (calls.join() !== 'claude') fail('llm: once on Claude, the same request stays there')
    calls.length = 0
    meter = { tokens: 0 }
    r = await callModel(both, body, meter)
    if (calls.join() !== 'claude') fail('llm: after a key problem OpenAI is skipped for a few minutes')
    if (text(r) !== 'from claude') fail('llm: a late system note must become a user message for Claude (roles alternate, system set)')
    calls.length = 0
    const onlyOpenAi = await callModel({ openai: 'k1', claudeModel: 'c' }, body, { tokens: 0 })
    if (!(onlyOpenAi instanceof Response) || onlyOpenAi.status !== 502) fail('llm: with no standby, an OpenAI failure is an error response')
    const none = await callModel({ claudeModel: 'c' }, body, { tokens: 0 })
    if (!(none instanceof Response) || none.status !== 503) fail('llm: with no key at all the answer is 503')
  } finally { globalThis.fetch = realFetch }
}

// 11. Usage statistics collected from real traffic (replaces test chats as the way to find where tokens go).
{
  const { readStats, recordStats } = await import('../functions/_lib/stats')
  const store = new Map<string, string>()
  const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }
  const env = { USERDATA: kv }
  await recordStats(env, { tokens: 0, modelCalls: 3, planSteps: 2, rewrites: 1, promptTokens: 9000, completionTokens: 300, cachedTokens: 6000 }, 'message', true)
  await recordStats(env, { tokens: 0, modelCalls: 1, planSteps: 0, rewrites: 0, promptTokens: 4000, completionTokens: 100, cachedTokens: 0, provider: 'claude' }, 'event', true)
  await recordStats(env, { tokens: 0 }, 'message', false)
  const today = (await readStats(env, 1))[0]
  if (today.turns !== 2 || today.events !== 1 || today.failed !== 1 || today.modelCalls !== 4 || today.standbyTurns !== 1) fail(`stats: wrong counts ${JSON.stringify(today)}`)
  if (today.promptTokens !== 13000 || today.cachedTokens !== 6000 || today.cachedShare !== 0.46) fail(`stats: wrong tokens or cached share ${JSON.stringify(today)}`)
  await recordStats({}, { tokens: 0 }, 'message', true) // without KV nothing happens and nothing throws
}

// 12. The first questions go out as one list (functions/_lib/intake.ts): no model, only what is unknown, once.
{
  const { BATCH_MARK, buildIntake, unknownBullets } = await import('../functions/_lib/intake')
  const fresh = normalizeProfile({ v: 2 })
  const invest = buildIntake(fresh, 'I want to invest in a right way', false, [])
  if (!invest || !invest.includes('build a plan to invest the right way') || !BATCH_MARK.test(invest)) fail('intake: invest wording')
  const { intakeKeys } = await import('../functions/_lib/intake')
  if (intakeKeys(fresh).join() !== 'age,income,spending,stability,goal,assets,other,debt') fail('intake: a brand-new user gets every section of the form')
  if (invest && /^• /m.test(invest)) fail('intake: the questions are a form now, not a bulleted list')
  if (!buildIntake(fresh, 'let me see my spending', false, [])?.includes('show you where your money goes')) fail('intake: spending wording')
  if (!buildIntake(fresh, 'build my emergency fund', false, [])?.includes('emergency fund')) fail('intake: emergency fund wording')
  if (!buildIntake(fresh, 'hello', true, [])?.includes('thoải mái chia sẻ')) fail('intake: the Vietnamese version') // lang-ok
  const told = buildIntake(fresh, 'I am 31', false, ['age 31'])
  if (!told?.startsWith('Noted: age 31.')) fail('intake: what the message recorded comes first')
  const knownMost = normalizeProfile({ v: 2, age: 31, incomes: [{ id: 'i1', name: 'Pay', monthly: 100, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e1', name: 'Rent', monthly: 50, currency: 'USDC', kind: 'fixed', updatedAt: 1 }] })
  if (unknownBullets(knownMost).length !== 5) fail('intake: known things are left out of the list')
  const nearlyDone = normalizeProfile({ v: 2, age: 31, incomeStable: true, dependents: 0, debtsComplete: true, noNearGoal: true,
    incomes: [{ id: 'i1', name: 'Pay', monthly: 100, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e1', name: 'Rent', monthly: 50, currency: 'USDC', kind: 'fixed', updatedAt: 1 }] })
  if (buildIntake(nearlyDone, 'hi', false, []) !== null) fail('intake: with fewer than 3 things missing one question is enough, no list')
}

// 13. Only DECLARED money counts (Hieu, 2026-10-28): the wallet balance the app sees is a hint, never part of the total.
{
  const { appWalletHolding, walletMoveOps } = await import('../src/lib/profile')
  const { buildPlan } = await import('../functions/_lib/plan')
  const { buildIntake } = await import('../functions/_lib/intake')
  const H = (o: Record<string, unknown>) => ({ priceSource: 'self', rebalanceable: true, updatedAt: 1, currency: 'USDC', ...o })
  const chat = (extra: unknown[] = []) => normalizeProfile({ v: 2, age: 31, incomeStable: true, dependents: 0, debtsComplete: true, noNearGoal: true,
    incomes: [{ id: 'i1', name: 'Salary', monthly: 150, currency: 'USDC', kind: 'active', updatedAt: 1 }],
    expenses: [{ id: 'e1', name: 'Spending', monthly: 150, currency: 'USDC', kind: 'fixed', updatedAt: 1 }],
    holdings: [H({ id: 'h1', type: 'savings', name: 'Bank savings', value: 500 }), H({ id: 'h2', type: 'gold_physical', name: 'Gold', quantity: 0.5, unit: 'oz', priceSource: 'market', value: undefined }),
      H({ id: 'hw', type: 'stable_wallet', name: 'USDC in this wallet', where: 'app wallet', value: 1900 }), ...extra] })
  const bal = (p: FinancialProfile, wallet: number, vault = 450) => computeBalance({ profile: p, walletUsd: wallet, vaultUsd: vault, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
  const base = chat()
  // The seen balance changes nothing: only the declared 1,900 counts.
  const a = bal(base, 1900), b2 = bal(base, 5000), c2 = bal(chat([]), 0)
  if (a.liquid !== b2.liquid || a.liquid !== c2.liquid) fail('wallet seen onchain must not change the total')
  if (a.walletSeen !== 1900) fail('the wallet seen is still reported')
  if (bal(normalizeProfile({ v: 2, age: 31 }), 3000).liquid !== 0) fail('nothing declared = no money, however much the wallet holds')
  // The transcript of 2026-10-28: 500 from the declared wallet into the bank. Total, targets and the other buckets do not move.
  const req = detectPlacement('I withdraw 500 USDC on this wallet, put it in the bank', null)!
  const moved = applyOps(base, buildRecordOps(base, req, { kind: 'holding', id: 'hw' }, null))
  const before = bal(base, 1900), after = bal(moved, 1900)
  if (Math.abs(before.liquid - after.liquid) > 0.01) fail('moving declared money between places must not change the total')
  const toFill = (x: ReturnType<typeof bal>) => x.liquid * x.target!.safe / 100 - x.byGroup.safe
  if (Math.abs((toFill(before) - toFill(after)) - 500) > 0.01) fail('Safety still-to-fill must fall by exactly what was added to Safety')
  // New money does grow the total, and each target grows by its share of it.
  const fresh = applyOps(base, buildRecordOps(base, req, { kind: 'new' }, null))
  const grown = bal(fresh, 1900)
  if (Math.abs((grown.liquid - before.liquid) - 500) > 0.01) fail('new money grows the total')
  // The app's own transactions follow the declared wallet.
  const dep = applyOps(base, walletMoveOps(base, -450))
  if (appWalletHolding(dep)?.value !== 1450) fail('a fund deposit lowers the declared wallet')
  if (appWalletHolding(applyOps(dep, walletMoveOps(dep, 450)))?.value !== 1900) fail('a withdrawal raises it back')
  if (appWalletHolding(applyOps(base, walletMoveOps(base, -99999)))?.value !== 0) fail('never below zero')
  const none = normalizeProfile({ v: 2, age: 31 })
  if (walletMoveOps(none, -450).length !== 0) fail('no declared wallet: a deposit takes nothing away')
  if (applyOps(none, walletMoveOps(none, 450)).holdings[0]?.value !== 450) fail('no declared wallet: a withdrawal starts one')
  if (appWalletHolding(normalizeProfile({ v: 2, holdings: [H({ id: 'x', type: 'stable_wallet', name: 'USDT', where: 'Binance', value: 10 })] }))) fail('an exchange balance is not the app wallet')
  // The form: filled values become items (plain code, no model), and the totals use only what was typed.
  const { formToItems, parseAmount, EMPTY_FORM } = await import('../src/lib/intakeForm')
  if (parseAmount('2,500') !== 2500 || parseAmount('$2500') !== 2500 || parseAmount('2.5k') !== 2500 || parseAmount('') !== null || parseAmount('abc') !== null || parseAmount('0') !== null) fail('form: amounts are read like a person types them')
  const filled = { ...EMPTY_FORM, age: '21', salary: '150', spending: '150', steady: 'no' as const, reliers: 'no' as const, goal: 'no' as const, usdcThis: '2500', cash: '500', gold: '2000', debt: 'no' as const }
  const formItems = formToItems(filled, { goldUsdPerOz: 4000, usd: {} })
  if (formItems.length !== 10) fail(`form: 10 items expected, got ${formItems.length}: ${formItems.map(i => i.text).join(' / ')}`)
  let fromForm = normalizeProfile({ v: 2 })
  for (const it of formItems) fromForm = applyOps(fromForm, it.ops)
  const fb = computeBalance({ profile: fromForm, walletUsd: 36.58, vaultUsd: 0, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
  if (fromForm.age !== 21 || fromForm.incomeStable !== false || fromForm.dependents !== 0 || !fromForm.noNearGoal || !fromForm.debtsComplete) fail('form: the facts reach the profile')
  if (Math.abs(fb.liquid - 5000) > 0.5) fail(`form: liquid money is exactly what was typed (2500 + 500 + 2000 gold), got ${fb.liquid}`)
  if (fb.cashflow.income !== 150 || fb.cashflow.spending !== 150) fail('form: salary and spending reach the cash flow')
  const windfall = formToItems({ ...EMPTY_FORM, salary: '150', otherIncome: 'yes', windfalls: 'yes', windfallsYearly: '3000' }, null)
  let wp = normalizeProfile({ v: 2 })
  for (const it of windfall) wp = applyOps(wp, it.ops)
  if (!wp.hasWindfalls || wp.windfallsYearly !== 3000 || wp.incomes.length !== 1) fail('form: airdrops are noted (with the yearly guess) and are NOT a monthly income line')
  const famDebt = formToItems({ ...EMPTY_FORM, debt: 'yes', debtKind: 'family', debtOwed: '500', debtMonthly: '20' }, null)
  const dp = applyOps(normalizeProfile({ v: 2 }), famDebt.flatMap(i => i.ops))
  if (dp.debts[0]?.type !== 'family_no_interest' || dp.debts[0]?.ratePct !== 0) fail('form: family debt with no interest typed is interest-free')
  if (formToItems(EMPTY_FORM, null).length !== 0) fail('form: an empty form saves nothing')
  if (formToItems({ ...EMPTY_FORM, home: '50000' }, null).length !== 0 || formToItems({ ...EMPTY_FORM, otherAssets: 'yes', home: '50000' }, null).length !== 1) fail('form: home, car, lent and business count only when the question was answered yes')
  const btcItems = formToItems({ ...EMPTY_FORM, btc: '1000' }, { goldUsdPerOz: null, usd: { 'crypto:BTC': 100000 } })
  if (Math.abs((btcItems[0]?.ops[0] as { holding?: { quantity?: number } }).holding?.quantity ?? 0) < 0.00999 || btcItems.length !== 1) fail('form: Bitcoin is stored as a quantity at today\'s price')
  // The plan says WHY for every step, and offers the exact deposit with the wording the "yes" is matched on.
  const shares: [number, number, number] = [31, 35, 34]
  const plan = buildPlan({ p: base, b: bal(base, 1900, 0), shares, cover: 450, vi: false })!
  for (const [what, re] of [['fund', /Why 3 months: your income is steady/], ['safety', /Safety 31%[^\n]*any time/], ['traditional', /Traditional 3[45]%[^\n]*stocks and index funds/], ['crypto', /Crypto 3[45]%[^\n]*BTC[^\n]*half/]] as const) if (!re.test(plan)) fail(`plan: the reason for the ${what} is missing`)
  if (!/prepare a deposit of \*\*450 USDC\*\* from your wallet for you to sign/.test(plan)) fail('plan: the deposit offer wording')
  // The numbers quoted before the deposit are the numbers after it (the goalposts do not move).
  const safeInPlan = Number(/Safety 31% = ([\d,]+) USDC/.exec(plan)?.[1].replace(/,/g, ''))
  const afterDeposit = bal(applyOps(base, walletMoveOps(base, -450)), 1450, 450)
  if (Math.abs(safeInPlan - afterDeposit.liquid * afterDeposit.target!.safe / 100) > 1) fail(`plan: Safety ${safeInPlan} must equal the target after the deposit ${afterDeposit.liquid * afterDeposit.target!.safe / 100}`)
  if (!/Traditional[^\n]{0,80}\d+%/.test(plan)) fail('plan: must be recognised as the plan already given')
  const fullPlan = buildPlan({ p: base, b: bal(base, 1900, 450), shares, cover: null, vi: false })!
  if (!/Which part would you like to fill first: Safety \([^)]*\) or Crypto \([^)]*\)\?|Only [^.]* still has room/.test(fullPlan)) fail('plan: with the fund full it asks which part to fill, naming only the parts that still have room')
  if (/Traditional\?|, Traditional/.test(fullPlan.split('\n').pop() ?? '')) fail('plan: a part that is already full is not offered')
  if (/cirBTC|prepare a|for you to sign/i.test(fullPlan)) fail('plan: never opens with a purchase')
  // The overview at 21 (Hieu, 2026-10-28): safe 21%, at risk 79% = Traditional 45% + Crypto 34%.
  const young = buildPlan({ p: normalizeProfile({ ...base, age: 21 }), b: bal(normalizeProfile({ ...base, age: 21 }), 1900, 0), shares: [21, 45, 34], cover: 450, vi: false })!
  if (!/safe part of 21%/.test(young) || !/takes risk, 79%/.test(young) || !/Traditional 45%\*\* and \*\*Crypto 34%/.test(young)) fail('plan: the overview at 21 reads 21% safe / 79% at risk = 45% + 34%')
  const withAirdrops = buildPlan({ p: normalizeProfile({ ...base, hasWindfalls: true }), b: bal(base, 1900, 0), shares, cover: 450, vi: false })!
  if (!/About airdrops: they arrive in bursts and cannot be counted on, so they are not a stable job/.test(withAirdrops)) fail('plan: airdrops are explained as not a stable job')
  if (/About airdrops/.test(plan)) fail('plan: no airdrop note without airdrops')
  const debtor = normalizeProfile({ ...base, debts: [{ id: 'd1', name: 'Card', type: 'credit_card', balance: 500, currency: 'USDC', ratePct: 20, monthlyPayment: null, updatedAt: 1 }] })
  if (buildPlan({ p: debtor, b: bal(debtor, 1900, 0), shares, cover: 450, vi: false }) !== null) fail('plan: a priority debt goes to the model')
  if (!buildPlan({ p: base, b: bal(base, 1900, 0), shares, cover: 450, vi: true })?.includes('Vì sao')) fail('plan: Vietnamese version') // lang-ok
}

// 14. Totals, never only "what is missing" (Hieu, 2026-10-28), and the emergency fund is not Safety.
{
  const { buildPlan, buildStanding } = await import('../functions/_lib/plan')
  const { bucketStanding } = await import('../src/lib/allocation')
  const H = (o: Record<string, unknown>) => ({ priceSource: 'self', rebalanceable: true, updatedAt: 1, currency: 'USDC', ...o })
  const goalP = (bank: number, wallet = 2000, extra: unknown[] = []) => normalizeProfile({ v: 2, age: 21, incomeStable: false, dependents: 0, debtsComplete: true, nearGoal: { name: 'Marriage', amount: 4000, currency: 'USDC', years: 2 },
    incomes: [{ id: 'i1', name: 'Pay', monthly: 150, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e1', name: 'Spending', monthly: 100, currency: 'USDC', kind: 'fixed', updatedAt: 1 }],
    holdings: [H({ id: 'b', type: 'savings', name: 'Bank savings', value: bank }), H({ id: 'w', type: 'stable_wallet', name: 'USDC in this wallet', where: 'app wallet', value: wallet }),
      H({ id: 'g', type: 'gold_physical', name: 'Gold', quantity: 0.5, unit: 'oz', priceSource: 'market', value: undefined }), ...extra] })
  const bal = (p: FinancialProfile, vault = 0) => computeBalance({ profile: p, walletUsd: 0, vaultUsd: vault, cirBtcUsd: 0, prices, vndPerUsd: 25000 })
  // The transcript: a 4,000 goal absorbed the savings, so adding 500 left "Safety still needs 218" unchanged. Now it falls by exactly 500.
  const s500 = bucketStanding(bal(goalP(500)))!.find(x => x.key === 'safe')!
  const s1000 = bucketStanding(bal(goalP(1000, 1500)))!.find(x => x.key === 'safe')! // 500 moved from the declared wallet into the bank
  if (Math.abs((s500.left - s1000.left) - 500) > 0.01) fail(`Safety left must fall by exactly the 500 added (${s500.left} -> ${s1000.left})`)
  if (Math.abs(s500.target - (4000 + (s500.rest ?? 0))) > 0.01 || s500.goal !== 4000) fail('Safety target = goal + its share of the rest')
  const plan = buildPlan({ p: goalP(500), b: bal(goalP(500), 600), shares: [21, 45, 34], cover: null, vi: false })!
  if (!/Near-term goal: Marriage 4,000 USDC/.test(plan) || !/your 4,000 USDC goal \+ 21% of the rest/.test(plan)) fail('plan: the near-term goal is explained and added to the Safety target')
  if (!/You have 500 USDC of [\d,]+ USDC; [\d,]+ USDC to go/.test(plan)) fail('plan: Safety shows what they have of the total and what is left')
  if (!/As a rule: 3 months when income is steady/.test(plan) || !/Why 6 months/.test(plan)) fail('plan: the months are explained (the scale and why this number)')
  const st = buildStanding({ p: goalP(1000, 1500), b: bal(goalP(1000, 1500), 600), vi: false })!
  if (!/Emergency fund:\*\* 600 USDC of 600 USDC \(6 months of spending\), full/.test(st) || !/\*\*Safety:\*\* 1,000 USDC of [\d,]+ USDC, [\d,]+ USDC to go \(Bank savings 1,000 USDC; target = goal 4,000 USDC/.test(st)) fail(`standing: the emergency fund and Safety are separate lines with totals\n${st}`)
  if (/Safety[^\n]*months of spending/.test(st)) fail('standing: Safety never carries months')
}

{
  const { detectPartChoice, pickQuestion } = await import('../functions/_lib/plan')
  const only = 'Only Crypto (0 USDC of 1,354 USDC) still has room. Would you like to start with it?'
  const which = 'Which part would you like to fill first: Safety (300 USDC of 840 USDC) or Crypto (0 USDC of 1,354 USDC)?'
  const cases: Array<[string, string, string | null]> = [
    ['Yep. I will start with that', only, 'crypto'], ['yes', only, 'crypto'], ['ok let us do it', only, 'crypto'],
    ['safe', which, 'safe'], ['How about the "safe" part', which, 'safe'], ['stocks and gold', which, 'traditional'], ['crypto first', which, 'crypto'],
    ['Yep', which, null], ['safe or crypto', which, null], ['why crypto?', which, null], ['I put 500 in the bank', which, null],
    ['Yep', 'Hello there', null], ['safe', 'Ready to start? shall I prepare a deposit of 450 USDC?', null],
  ]
  for (const [text, prev, want] of cases) if (detectPartChoice(text, prev) !== want) fail(`part choice: "${text}" after "${prev.slice(0, 24)}…" should be ${want}`)
  const rows = [
    { key: 'safe' as const, name: 'Safety' as const, share: 21, have: 1000, target: 840, left: 0 },
    { key: 'traditional' as const, name: 'Traditional' as const, share: 45, have: 2000, target: 1800, left: 0 },
    { key: 'crypto' as const, name: 'Crypto' as const, share: 34, have: 0, target: 1354, left: 1354 },
  ]
  if (!/^Only Crypto \(0 USDC of 1,354 USDC\) still has room/.test(pickQuestion(rows, false))) fail('pick: only the part with room is named')
  if (/Safety|Traditional/.test(pickQuestion(rows, false))) fail('pick: full parts are never named')
  if (!/All three parts are at their targets/.test(pickQuestion(rows.map(r => ({ ...r, left: 0 })), false))) fail('pick: all full')
  if (!/Which part would you like to fill first: Safety \(300 USDC of 840 USDC\) or Crypto/.test(pickQuestion([{ ...rows[0], have: 300, left: 540 }, rows[1], rows[2]], false))) fail('pick: two parts with room, each as "X of Y"')
}

console.log(fails ? `\n${fails} problem(s).` : `\nKB OK: ${KB.patterns.length} patterns, ${personas.length} personas + ${reals.length} real profiles, formula matches the spec table.`)
process.exit(fails ? 1 : 0)
