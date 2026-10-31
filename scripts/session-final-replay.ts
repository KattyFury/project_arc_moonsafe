// Replay the actual failing status turns using their captured saved profiles.
// The handler's zero-provider routing is verified separately by session-regression-check.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { confirmationStatus } from '../functions/_lib/confirmationStatus'
import { normalizeProfile } from '../src/lib/profile'
const results=[]
for(const label of ['session1-2026-10-31','session2-2026-10-31','session3-2026-10-31']) {
  const r=JSON.parse(readFileSync(`docs/evals/${label}.json`,'utf8'))
  const t=r.transcript.find((t:{case:string;turn:number})=>t.case==='session-pending-target'&&t.turn===3)
  assert.ok(t?.complete)
  const content=confirmationStatus(t.user,normalizeProfile(t.beforeProfile),false,0)
  assert.ok(content)
  assert.match(content,/3,000 USD/);assert.match(content,/1,800 USD/);assert.match(content,/Age: 38/)
  assert.match(content,/not establish your emergency reserves/)
  assert.doesNotMatch(content,/not full|still needed|still to go|nothing is confirmed/)
  results.push({source:label,case:t.case,turn:t.turn,passed:true,paidCalls:0,content})
}
writeFileSync('docs/evals/session-final-status-replay-2026-10-31.json',JSON.stringify({mode:'offline deterministic replay',results},null,2)+'\n')
console.log(JSON.stringify({cases:results.length,passed:results.length,paidCalls:0}))
