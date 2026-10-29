// Offline aggregation of explicit trace-review judgments, never a paid model judge.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
type Turn = { case: string; turn: number; complete: boolean }
type Review = { id: string; scores: number[]; priority?: 'P0' | 'P1' | 'P2'; evidence: Array<{ turn: number; note: string }> }
const label = process.argv[2]
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Supply the saved run label.')
const dir = 'docs/evals/'
const report = JSON.parse(readFileSync(dir + label + '.json', 'utf8')) as { transcript: Turn[]; cases: Array<{ id: string; turns: number }> }
const reviews = JSON.parse(readFileSync(dir + label + '-review.json', 'utf8')) as Review[]
const baseline = JSON.parse(readFileSync(dir + 'framework-1m-scores-2026-10-29.json', 'utf8')) as { scored: Array<{ id: string; total: number }> }
const weights = [25, 20, 20, 15, 15, 5]
const seen = new Set<string>()
const scored = reviews.map(r => {
  assert.ok(!seen.has(r.id), 'Duplicate review: ' + r.id); seen.add(r.id)
  assert.equal(r.scores.length, 6)
  assert.ok(r.scores.every(n => Number.isInteger(n) && n >= 0 && n <= 4))
  const spec = report.cases.find(c => c.id === r.id)
  const turns = report.transcript.filter(t => t.case === r.id)
  assert.ok(spec && turns.length === spec.turns && turns.every(t => t.complete), 'Cannot score an incomplete conversation: ' + r.id)
  assert.ok(r.evidence.length && r.evidence.every(e => turns.some(t => t.turn === e.turn) && e.note.trim()), 'Review needs trace references')
  return { ...r, total: r.scores.reduce((s, n, i) => s + n * weights[i] / 4, 0) }
})
const mean = (xs: number[]) => xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null
const overlap = scored.filter(r => baseline.scored.some(b => b.id === r.id))
const heldout = scored.filter(r => r.id.startsWith('new-'))
const comparable = mean(overlap.map(r => r.total))
const novel = mean(heldout.map(r => r.total))
const severe = scored.filter(r => r.priority === 'P0' || r.priority === 'P1')
const fullCoverage = overlap.length === baseline.scored.length && heldout.length === 6
const result = {
  target: 80, overall: mean(scored.map(r => r.total)), comparable, baselineOnSameCases: mean(overlap.map(r => baseline.scored.find(b => b.id === r.id)!.total)), novel,
  originalCases: overlap.length, novelCases: heldout.length, fullCoverage, severe,
  achieved: fullCoverage && comparable !== null && novel !== null && comparable >= 80 && novel >= 80 && severe.length === 0,
  scored, notReviewed: report.cases.filter(c => !seen.has(c.id)),
  limitation: 'Internal ordinal judgments by the implementing agent; not blinded, not calibrated, not an accuracy percentage.',
}
writeFileSync(dir + label + '-scores.json', JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
