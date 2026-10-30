import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const labels = process.argv.slice(2)
if (!labels.length || labels.some(l => !/^[a-z0-9-]+$/.test(l))) throw new Error('Run labels required')
const runs = labels.map(label => ({ label, ...JSON.parse(readFileSync(`docs/evals/${label}.json`, 'utf8')) }))
assert.ok(runs.every(r => r.ended), 'Wait until every run finishes')
const totals = runs.reduce((s,r) => ({ verified: s.verified+r.input+r.output, unknown: s.unknown+r.conservativeUnknownUsage, calls: s.calls+r.calls }), { verified:0, unknown:0, calls:0 })
assert.ok(totals.verified + totals.unknown <= 1_000_000)
const checks = []
for (const r of runs) {
  const complete = r.transcript.filter(t => t.complete)
  for (const t of complete.filter(t => t.case.startsWith('day-'))) {
    checks.push({ run:r.label, case:t.case, turn:t.turn, check:'illustrative conversation has no mutations or actions', passed: t.ops.length===0 && t.actions.length===0 })
  }
  const first = complete.find(t=>t.case==='day-small-savings' && t.turn===1)
  if (first) checks.push({ run:r.label, check:'savings timing explicitly five months', passed:/five months|5 months|month 5/.test(first.content) })
  const contribution = complete.find(t=>t.case==='day-pooling-choice' && t.turn===2)
  if (contribution) checks.push({ run:r.label, check:'private balance not asserted to be nonzero', passed: !/private (?:money|balance) (?:isn't|is not) zero/.test(contribution.content) })
}
const summary = { budget:1_000_000, ...totals, accounted:totals.verified+totals.unknown, remaining:1_000_000-totals.verified-totals.unknown, checks,
  runs:runs.map(r=>({ label:r.label, tokens:r.input+r.output, unknown:r.conservativeUnknownUsage, stopped:r.stopped, sourceDiffSha256:r.sourceDiffSha256, completeTurns:r.transcript.filter(t=>t.complete).length, completeCases:r.cases.filter(c=>r.transcript.filter(t=>t.complete && t.case===c.id).length===c.turns).length, calls:r.calls })) }
writeFileSync('docs/evals/day-improvement-2026-10-30-summary.json', JSON.stringify(summary,null,2))
for (const r of runs) {
  let md=`# ${r.label}\n\nModel: ${r.model}. Source diff: ${r.sourceDiffSha256}. Synthetic state; no wallet execution.\n`
  for (const t of r.transcript) md+=`\n## ${t.case}, turn ${t.turn}${t.complete?'':' (incomplete)'}\n\nUser: ${t.user}\n\nAgent: ${t.content??'(no answer)'}\n\nActions: ${JSON.stringify(t.actions)}\n\nOps: ${JSON.stringify(t.ops)}\n`
  writeFileSync(`docs/evals/${r.label}-transcripts.md`,md)
}
console.log(JSON.stringify({ ...summary, checks: { passed:checks.filter(c=>c.passed).length, total:checks.length } }, null,2))
