// New offline probes, including deliberate negative/ambiguous statements. No model or network.
import { existsSync, writeFileSync } from 'node:fs'
import { quantityEvidence, turnPolicy, factProposals, explicitAgeRefusal } from '../functions/_lib/agentGuards'
import { recordingEvidence } from '../functions/_lib/coaching'
import { householdDefault } from '../src/lib/planningScope'
import { normalizeProfile } from '../src/lib/profile'
const rows: Array<{ id: string; expected: boolean; actual: boolean; passed: boolean }> = []
function check(id: string, expected: boolean, actual: boolean) { rows.push({ id, expected, actual, passed: expected === actual }) }
for (const [id, text, n, symbol, kind, expected] of [
  ['money-is-not-btc', 'I invested $4000 into BTC', 4000, 'BTC', 'crypto', false],
  ['real-btc-quantity', 'I hold 0.02 BTC bought for $1600', .02, 'BTC', 'crypto', true],
  ['wrong-symbol', 'I own 2 ETH', 2, 'BTC', 'crypto', false],
  ['shares-have-units', 'I own 10 shares of VOO', 10, 'VOO', 'stock', true],
  ['gold-has-units', 'I own 2 oz of gold', 2, undefined, 'gold', true],
  ['bare-number-is-not-quantity', 'My investment cost was $2000', 2000, 'BTC', 'crypto', false],
  ['negated-btc', 'I do not have 0.5 BTC', .5, 'BTC', 'crypto', false],
  ['vi-negated-btc', 'Mình bỏ 60 triệu VND mua Bitcoin, không phải mình có 60 BTC', 60, 'BTC', 'crypto', false], // lang-ok
  ['not-owned-btc', 'That 2 BTC belongs to my brother, not me', 2, 'BTC', 'crypto', false],
  ['uncertain-btc', 'I am not sure if I own 0.5 BTC', .5, 'BTC', 'crypto', false],
] as const) check(id, expected, quantityEvidence(recordingEvidence(text).text, n, symbol, kind))
for (const [id, users, expected] of [
  ['education-persists', ['Education only', 'Tell me about saving'], true],
  ['listen-persists', ['I only want someone to listen', 'My partner does not know'], true],
  ['new-action-overrides', ['Education only', 'Please buy $100 of cirBTC'], false],
  ['skip-questionnaire-persists', ['Skip the questionnaire for now. Teach me about spending.', 'My friends buy coins; I want to talk about habits.'], true],
  ['vi-no-form-persists', ['Đừng mở form, mình muốn học thôi', 'Nói tiếp đi'], true], // lang-ok
  ['do-not-invest-persists', ['Do not ask me to invest', 'I am worried'], true],
] as const) check(id, expected, turnPolicy([...users]).conversationOnly)
check('explanation-is-not-action', true, turnPolicy(['Can you explain a $100 deposit?']).answerFirst)
check('explicit-action-is-action', false, turnPolicy(['Can you deposit $100 for me?']).answerFirst)
check('conditional-is-not-consent', true, turnPolicy(['Can you buy $100 if the price falls?']).answerFirst)
for (const [id, text, expected] of [
  ['married-family', 'I am married', true],
  ['natural-vi-family', 'Nhà mình hai vợ chồng, chưa có con', true], // lang-ok
  ['friend-not-family', 'My colleague is married', false],
  ['hypothetical-not-family', 'If I were married', false],
  ['separated-not-auto', 'My husband and I are separated', false],
] as const) check(id, expected, householdDefault(undefined, text))
check('individual-optout', false, householdDefault('individual', 'My wife earns $1500'))
check('explicit-refusal', true, explicitAgeRefusal('I prefer not to share my age'))
check('ordinary-fact-not-refusal', false, explicitAgeRefusal('I have $600 in savings'))
const empty = normalizeProfile({ v: 2 })
check('actual-savings-recovery', true, factProposals('I have $600 in savings', empty).some(p => p.name === 'add_holding'))
check('hypothetical-no-recovery', false, factProposals(recordingEvidence('If I have $600 in savings').text, empty).some(p => p.name === 'add_holding'))
check('uncertain-no-recovery', false, factProposals('Maybe I have $600 in savings', empty).some(p => p.name === 'add_holding'))
check('quote-no-recovery', false, factProposals(recordingEvidence('Example: "I have $600 in savings"').text, empty).some(p => p.name === 'add_holding'))
check('age-recovery', true, factProposals('I am 38', empty).some(p => p.args.age === 38))
for (const text of ['I do not have any debts', 'Mình không có nợ', 'Mình không có người phụ thuộc']) { // lang-ok
  check('explicit-absence-preserved: ' + text, true, recordingEvidence(text).text.length > 0)
}
const report = { mode: 'offline', paidCalls: 0, checks: rows.length, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed), rows }
if (!process.argv.includes('--candidate') && existsSync('docs/evals/offline-guard-probes-2026-10-29.json')) throw new Error('Baseline is frozen; use --candidate.')
writeFileSync('docs/evals/offline-guard-probes-2026-10-29' + (process.argv.includes('--candidate') ? '-candidate' : '') + '.json', JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))

if (process.argv.includes('--candidate') && report.failed.length) process.exitCode = 1
