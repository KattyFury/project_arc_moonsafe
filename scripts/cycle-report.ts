// Aggregate the three explicitly authorized budgets. Combined cycle3 includes both of its parts.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const labels = ['claude-cycle1-2026-10-29', 'claude-cycle2-2026-10-29', 'claude-cycle3-combined-2026-10-30']
const read = (name: string) => JSON.parse(readFileSync(`docs/evals/${name}.json`, 'utf8'))
const old = read('claude-reeval-post-repairs-continuation-2026-10-29-scores')
const commonIds = new Set(old.scored.map((x: { id: string }) => x.id))
const rounds = labels.map((label, i) => {
  const run = read(label), scores = read(label + '-scores'), summary = read(label + '-summary')
  const common = scores.scored.filter((x: { id: string }) => commonIds.has(x.id))
  const fresh = scores.scored.filter((x: { id: string }) => x.id.startsWith('fresh-'))
  assert.ok(run.input + run.output + run.conservativeUnknownUsage <= 1e6)
  assert.equal(run.conservativeUnknownUsage, 0)
  assert.ok(run.apiCalls.every((x: { status: number }) => x.status === 200))
  return { cycle: i + 1, label, commit: run.commit, cap: 1e6, tokens: summary.totalTokens, calls: run.calls, conversations: scores.scored.length, turns: run.transcript.length, score: scores.overall, sameElevenScore: common.reduce((n: number, x: { total: number }) => n + x.total, 0) / common.length, freshThreeScore: fresh.length ? fresh.reduce((n: number, x: { total: number }) => n + x.total, 0) / fresh.length : null, severe: scores.severe.map((x: { id: string }) => x.id), costUsd: summary.costUsd }
})
const finalRun = read(labels[2])
const result = { authorizedCeiling: 3e6, totalTokens: rounds.reduce((n, r) => n + r.tokens, 0), estimatedCostUsd: rounds.reduce((n, r) => n + r.costUsd, 0), turnsIncludingRepeatedScenarios: rounds.reduce((n, r) => n + r.turns, 0), rounds, previousSameElevenScore: old.overall, finalSameElevenCalls: finalRun.apiCalls.filter((x: { case: string }) => commonIds.has(x.case)).length, finalSameElevenTokens: finalRun.transcript.filter((x: { case: string }) => commonIds.has(x.case)).reduce((n: number, x: { tokens: number }) => n + x.tokens, 0), fullOriginalSuiteCoverage: false, broadReleaseCertified: false, limitation: 'Internal same-author single-sample iterative review, familiar scenarios and three fresh wording probes; no independent or production certification.' }
assert.ok(result.totalTokens <= result.authorizedCeiling)
writeFileSync('docs/evals/claude-three-cycles-2026-10-30-summary.json', JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
