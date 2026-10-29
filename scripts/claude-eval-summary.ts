import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const dir = 'docs/evals/'
const run = JSON.parse(readFileSync(dir + 'claude-reeval-2026-10-29.json', 'utf8'))
const grades = JSON.parse(readFileSync(dir + 'claude-reeval-2026-10-29-scores.json', 'utf8'))
const dimensions = ['correctness','relevance','riskConsent','continuity','teaching','efficiency']
const rows = run.apiCalls as Array<{ case: string; status: number; usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }>
const input = rows.reduce((n,c) => n + c.usage.input_tokens + (c.usage.cache_read_input_tokens ?? 0) + (c.usage.cache_creation_input_tokens ?? 0),0)
const output = rows.reduce((n,c) => n + c.usage.output_tokens,0)
assert.equal(input, run.input); assert.equal(output, run.output)
assert.ok(input + output + run.conservativeUnknownUsage <= run.cap)
assert.ok(rows.every(c => c.status === 200))
const complete = run.transcript.filter((t: { complete: boolean }) => t.complete)
const times = complete.map((t: { ms: number }) => t.ms).sort((a: number,b: number) => a-b)
const uncached = input - run.cached - run.cacheCreated
const maxInput = Math.max(...rows.map(c => c.usage.input_tokens + (c.usage.cache_read_input_tokens ?? 0) + (c.usage.cache_creation_input_tokens ?? 0)))
assert.ok(maxInput <= 100000, 'Published short-context pricing must be used only for short prompts')
const costUsd = (uncached*.10 + run.cached*.01 + run.cacheCreated5m*.125 + run.cacheCreated1h*.20 + output*.50)/1e6
const graded = grades.scored as Array<{ id: string; scores: number[]; total: number }>
const baseline = JSON.parse(readFileSync(dir + 'framework-1m-2026-10-29.json','utf8'))
const commonBaselineTokens = baseline.transcript.filter((t: { case: string; complete: boolean }) => t.complete && graded.some(g=>g.id===t.case)).reduce((n:number,t:{tokens:number})=>n+t.tokens,0)
const summary = {
  provider: run.provider, model: run.model, commit: run.commit, cap: run.cap,
  totalTokens: input+output, input, output, uncached, cacheRead: run.cached, cacheCreated5m: run.cacheCreated5m, cacheCreated1h: run.cacheCreated1h,
  calls: rows.length, completeTurns: complete.length, recordedTurns: run.transcript.length, completeConversations: graded.length,
  medianMs: times[Math.floor(times.length*.5)], p95Ms: times[Math.floor(times.length*.95)], maxInput, costUsd,
  score: grades.overall, originalScoreOnSameCases: grades.baselineOnSameCases, commonBaselineTokens,
  dimensionScores: Object.fromEntries(dimensions.map((d,i)=>[d,graded.reduce((n,g)=>n+g.scores[i]*25,0)/graded.length])),
  targetAchieved: grades.achieved, newWordingCasesRun: grades.novelCases,
  comparisonLimit: run.comparisonLimit,
}
writeFileSync(dir+'claude-reeval-2026-10-29-summary.json',JSON.stringify(summary,null,2))
let md='# Claude synthetic conversation traces — 2026-10-29\n\nModel: '+run.model+'. App commit: '+run.commit+'. No confirmation card or transaction was executed. See raw JSON for before/after state.\n'
for(const t of run.transcript) md+='\n## '+t.case+' — turn '+t.turn+(t.complete?'':' (partial: budget guard)')+'\n\n**User:** '+t.user+'\n\n**Agent:** '+(t.content??'(no final content)')+'\n\nActions: '+JSON.stringify(t.actions)+'\n\nOperations: '+JSON.stringify(t.ops)+'\n'
writeFileSync(dir+'claude-reeval-2026-10-29-transcripts.md',md.replace(/[ \t]+$/gm,''))
console.log(JSON.stringify(summary,null,2))
