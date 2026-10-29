// Offline invariants over live traces. These checks do not grade conversational quality.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const label = process.argv[2]
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Supply run label')
const run = JSON.parse(readFileSync(`docs/evals/${label}.json`, 'utf8'))
const rows = run.transcript as Array<{ case: string; turn: number; complete: boolean; content?: string; calls: number; profile: { holdings: Array<{ type: string; quantity?: number; value?: number; currency?: string }>; debts: Array<{ ratePct: number | null; monthlyPayment: number | null }>; incomes: Array<{ monthly: number; kind: string }>; planningScope?: string }; actions: Array<{ type: string }> }>
const checks: Array<{ name: string; passed: boolean }> = []
const turn = (id: string, n: number) => rows.find(t => t.case === id && t.turn === n && t.complete)
const check = (name: string, passed: boolean) => checks.push({ name, passed })
for (const n of [1, 2, 3]) {
  const t = turn('new-unit-mixture', n)
  if (t) {
    const btc = t.profile.holdings.find(h => h.type === 'btc')
    check(`BTC quantity and invested cost survive turn ${n}`, btc?.quantity === .02 && btc.value === 1600 && btc.currency === 'USDC')
  }
}
const unknown = turn('new-debt-uncertainty', 2)
if (unknown) check('Question does not establish zero interest', unknown.profile.debts.length === 1 && unknown.profile.debts[0].ratePct === null)
const confirmed = turn('new-debt-uncertainty', 3)
if (confirmed) check('Actual confirmation records zero and preserves repayment once', confirmed.profile.debts.length === 1 && confirmed.profile.debts[0].ratePct === 0 && confirmed.profile.debts[0].monthlyPayment === 75)
const cost = turn('new-cost-vi', 1)
if (cost) {
  const btc = cost.profile.holdings.find(h => h.type === 'btc')
  check('Vietnamese purchase cost is 60m VND, never 60 BTC', btc?.value === 60e6 && btc.currency === 'VND' && btc.quantity === undefined)
}
const contribution = turn('new-family-partial', 2)
if (contribution) check('Known shared resources 3200, contribution not invented passive income', contribution.profile.incomes.reduce((n, i) => n + i.monthly, 0) === 3200 && !contribution.profile.incomes.some(i => i.monthly === 800 && i.kind === 'passive'))
for (const t of rows.filter(t => t.complete)) {
  if (t.case === 'no-consent' || t.case === 'new-no-form') check(`${t.case}/${t.turn} no unwanted preparation`, !t.actions.some(a => a.type.startsWith('prepare_') || a.type === 'intake_form'))
  if (t.case === 'new-cost-vi' || t.case === 'beginner-vi') check(`${t.case}/${t.turn} Vietnamese response`, /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(t.content ?? '')) // lang-ok
  check(`${t.case}/${t.turn} no hidden-draft commentary`, !/your latest (?:request|question)|already answered|not going to repeat|my last draft/iu.test(t.content ?? ''))
}
const used = run.input + run.output + run.conservativeUnknownUsage
assert.ok(used <= run.cap)
const result = { run: label, commit: run.commit, used, cap: run.cap, checks: checks.length, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed), modelCalls: run.calls, completeTurns: rows.filter(t => t.complete).length, costUsd: ((run.input - run.cached - run.cacheCreated) * .1 + run.cached * .01 + run.cacheCreated5m * .125 + run.cacheCreated1h * .2 + run.output * .5) / 1e6 }
writeFileSync(`docs/evals/${label}-audit.json`, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
