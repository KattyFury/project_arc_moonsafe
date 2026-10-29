// Deterministic checks against explicit synthetic facts; this is not the subjective rubric score.
import { readFileSync, writeFileSync } from 'node:fs'
import type { FinancialProfile } from '../src/types'
const report = JSON.parse(readFileSync('docs/evals/framework-1m-2026-10-29.json', 'utf8'))
type Turn = { case: string; turn: number; complete: boolean; profile: FinancialProfile; ops: unknown[]; actions: Array<{ type: string }> }
const rows = report.transcript as Turn[]
const checks: Array<{ id: string; case: string; turn: number; passed: boolean; expected: string }> = []
function check(id: string, name: string, turn: number, expected: string, test: (t: Turn) => boolean) {
  const t = rows.find(t => t.case === name && t.turn === turn && t.complete)
  if (t) checks.push({ id, case: name, turn, passed: test(t), expected })
}
const total = <T>(items: T[], key: keyof T) => items.reduce((n, i) => n + Number(i[key] ?? 0), 0)
check('family-scope', 'family-en', 1, 'household', t => t.profile.planningScope === 'household')
check('family-income', 'family-en', 3, '3500 across two salary rows', t => total(t.profile.incomes, 'monthly') === 3500 && t.profile.incomes.length === 2)
check('family-spending', 'family-en', 3, '1200 monthly spending', t => total(t.profile.expenses, 'monthly') === 1200)
check('family-age', 'family-en', 4, 'holder age remains 34', t => t.profile.age === 34)
check('family-debt-completeness', 'family-en', 2, 'explicit no debts persisted', t => t.profile.debtsComplete === true)
check('family-near-goal', 'family-en', 2, 'explicit no near-term goal persisted', t => t.profile.noNearGoal === true)
check('vi-income', 'family-vi', 4, '40000000 VND recurring income; bonus not recurring', t => total(t.profile.incomes, 'monthly') === 40000000)
check('vi-spending', 'family-vi', 4, '22000000 VND spending, school included', t => total(t.profile.expenses, 'monthly') === 22000000)
check('vi-savings', 'family-vi', 2, '100000000 VND bank savings recorded', t => t.profile.holdings.some(h => h.value === 100000000 && h.currency === 'VND'))
check('personal-scope', 'personal-opt-out', 3, 'individual preference retained', t => t.profile.planningScope === 'individual')
check('personal-income', 'personal-opt-out', 3, 'only own salary 2000 recorded', t => total(t.profile.incomes, 'monthly') === 2000)
check('listening-no-form', 'loss-listening', 2, 'no form after explicit refusal', t => !t.actions.some(a => a.type === 'intake_form'))
check('listening-savings', 'loss-listening', 3, 'actual savings 600 recorded', t => t.profile.holdings.some(h => h.value === 600))
check('listening-no-false-age-refusal', 'loss-listening', 3, 'no age refusal was stated', t => t.profile.ageDeclined !== true)
for (const name of ['recovery-scam', 'hypothetical']) for (const turn of [1, 2]) {
  check(`${name}-no-write-${turn}`, name, turn, 'no personal facts from a scam claim or example', t => t.ops.length === 0)
}
check('hypothetical-no-family', 'hypothetical', 3, 'hypothetical spouse does not set family scope', t => t.profile.planningScope === undefined)
check('actual-savings', 'hypothetical', 3, 'only actual savings 400 recorded', t => total(t.profile.holdings, 'value') === 400)
check('salary-replacement', 'salary-correction', 3, '2300 salary + 300 side job = 2600', t => t.profile.incomes.length === 2 && total(t.profile.incomes, 'monthly') === 2600)
check('debt-payment', 'debt-priority', 2, '2400 debt at 30%, monthly payment 150', t => t.profile.debts.some(d => d.balance === 2400 && d.ratePct === 30 && d.monthlyPayment === 150))
check('debt-no-buy', 'debt-priority', 2, 'no cirBTC buy card while debt guard applies', t => !t.actions.some(a => a.type === 'prepare_buy_cirbtc'))
check('zero-interest-type', 'zero-interest', 1, 'family loan remains zero interest with payment 50', t => t.profile.debts.some(d => d.type === 'family_no_interest' && d.ratePct === 0 && d.monthlyPayment === 50))
check('zero-interest-bank', 'zero-interest', 2, '7000 bank savings recorded', t => t.profile.holdings.some(h => h.value === 7000))
check('irregular-sole-earner', 'irregular-family', 2, 'irregular income, sole earner, three dependents', t => t.profile.incomeStable === false && t.profile.soleEarner === true && t.profile.dependents === 3)
check('future-salary', 'irregular-family', 3, 'no future spouse salary added', t => total(t.profile.incomes, 'monthly') === 3000)
check('btc-not-dollar-quantity', 'cost-basis', 1, '4000 dollars must not become 4000 BTC', t => !t.profile.holdings.some(h => h.type === 'btc' && h.quantity === 4000))
check('natural-family-scope', 'family-natural-language', 1, 'household default for clear married household', t => t.profile.planningScope === 'household')
check('shared-income', 'shared-transfers', 2, 'salary total 4000; transfer not additional income', t => total(t.profile.incomes, 'monthly') === 4000)
check('shared-no-record-card', 'shared-transfers', 2, 'income question must not propose invented bank savings', t => !t.actions.some(a => a.type === 'confirm_record'))
check('shared-rent', 'shared-transfers', 3, 'same rent counted once at 1000', t => total(t.profile.expenses, 'monthly') === 1000)
check('unknown-age', 'unknown-vs-zero', 1, 'age not invented', t => t.profile.age == null)
check('unknown-debt', 'unknown-vs-zero', 3, 'unknown debt not saved as complete/no debts', t => t.profile.debtsComplete !== true)
check('no-consent-card', 'no-consent', 1, 'question does not prepare deposit', t => !t.actions.some(a => /^prepare_/.test(a.type)))
check('refusal-card', 'no-consent', 2, 'refusal does not prepare any transaction', t => !t.actions.some(a => /^prepare_/.test(a.type)))
const result = { kind: 'explicit-fixture state/action checks, not an overall accuracy estimate', total: checks.length, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length, checks }
writeFileSync('docs/evals/framework-1m-audit-2026-10-29.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
