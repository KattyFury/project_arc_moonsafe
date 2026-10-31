import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
const labels=[1,2,3].map(n=>`session${n}-2026-10-31`)
const rows=labels.map(label=>JSON.parse(readFileSync(`docs/evals/${label}-summary.json`,'utf8')))
if(rows.some(r=>!r.ended)) throw Error('All runs must finish first')
if(rows.some(r=>r.verifiedTokens+r.unknownReserved>1_000_000)) throw Error('Session cap exceeded')
const total={verifiedTokens:0,unknownReserved:0,calls:0,completeTurns:0,completeConversationExecutions:0}
for(const r of rows){for(const key of ['verifiedTokens','unknownReserved','calls','completeTurns'])total[key]+=r[key];total.completeConversationExecutions+=r.completeCases.length}
const distinctCases=[...new Set(rows.flatMap(r=>r.completeCases))]
const replay=JSON.parse(readFileSync('docs/evals/session-final-status-replay-2026-10-31.json','utf8'))
const finalSourceDiffSha256=createHash('sha256').update(execFileSync('git',['diff','--','functions','src'],{encoding:'utf8'})).digest('hex')
const finalSourceTree=execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard','--','functions','src'],{encoding:'utf8'}).split('\0').filter(Boolean).sort().map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))
const output={date:'2026-10-31',provider:'anthropic',model:rows[0].model,perSessionCap:1_000_000,total,distinctCompleteCases:distinctCases.length,distinctCases,runs:rows,finalSourceDiffSha256,finalSourceTree,finalStatusRepair:{verification:'offline deterministic replay and zero-model handler regression, after the three paid runs',passed:replay.results.every(r=>r.passed)},limitations:['Development scenarios, not a blinded benchmark.','Repeated conversations are not independent users.','Narrow invariant checks are not overall conversational accuracy.','No wallet transactions, real user data, or production deployment.','Final deterministic status repair was not followed by another paid Haiku run.','Historical run diff hashes omit untracked modules; final file manifest includes them. Future runner records a per-file source manifest.']}
writeFileSync('docs/evals/session-three-cycles-2026-10-31-summary.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify({total,distinctCompleteCases:distinctCases.length,finalSourceDiffSha256},null,2))
