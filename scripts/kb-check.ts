// Checks the knowledge base (src/kb) against the spec: the age formula against the spec table,
// fund floors, priority debt, every pattern's facts and params, and ~25 user personas that must
// match exactly the expected patterns (every pattern is hit at least once).
//   bun scripts/kb-check.ts        → exit 1 on any mismatch

import { KB, targetMix, fundFloorMonths, isPriorityDebt, matchPatterns, patternBrief, type Cond, type Facts } from '../src/kb/kb'

let fails = 0
const fail = (m: string) => { fails++; console.log('FAIL', m) }

// 1. Age formula vs the spec 4 table (rounded to 0.1 there).
const TABLE: Record<number, number[]> = {
  18: [18, 46.9, 23.4, 5.9, 5.9], 20: [20, 45.7, 22.9, 5.7, 5.7], 25: [25, 42.9, 21.4, 5.4, 5.4], 30: [30, 40, 20, 5, 5],
  35: [35, 37.1, 18.6, 4.6, 4.6], 40: [40, 34.3, 17.1, 4.3, 4.3], 45: [45, 31.4, 15.7, 3.9, 3.9], 50: [50, 28.6, 14.3, 3.6, 3.6],
  55: [55, 25.7, 12.9, 3.2, 3.2], 60: [60, 22.9, 11.4, 2.9, 2.9], 65: [65, 20, 10, 2.5, 2.5], 70: [70, 17.1, 8.6, 2.1, 2.1],
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
const hit = new Set<string>()
for (const [name, over, want] of personas) {
  const facts = { ...base, ...over }
  const got = matchPatterns(facts).map(p => p.id)
  got.forEach(id => hit.add(id))
  const missing = want.filter(w => !got.includes(w)), extra = got.filter(g => !want.includes(g))
  if (missing.length || extra.length) fail(`${name}: missing [${missing}] extra [${extra}] (got ${got.join(', ')})`)
  else console.log(' ok ', name.padEnd(42), got.join(', '))
}
for (const p of KB.patterns) if (!hit.has(p.id)) fail(`pattern ${p.id} is never matched by any persona`)

// What the model would receive for one persona (token budget check).
const sample = patternBrief(matchPatterns({ ...base, income_stable: false, dependents: 2, sole_earner: true, fund_floor_months: 12, fund_met: false, fund_gap: '6,000 USD', ...locked }), { ...base, fund_floor_months: 12, fund_gap: '6,000 USD' })
console.log(`\nSample brief (${sample.length} chars, ~${Math.round(sample.length / 4)} tokens):\n${sample}`)
console.log(fails ? `\n${fails} problem(s).` : `\nKB OK: ${KB.patterns.length} patterns, ${personas.length} personas, formula matches the spec table.`)
process.exit(fails ? 1 : 0)
