import { readFileSync, writeFileSync } from 'node:fs'
const labels = process.argv.slice(2)
if (!labels.length || labels.some(s => !/^[a-z0-9-]+$/.test(s))) throw Error('Supply run labels')
for (const label of labels) {
  const r = JSON.parse(readFileSync(`docs/evals/${label}.json`, 'utf8'))
  const checks = []
  const add = (t, rule, pass) => checks.push({ case: t.case, turn: t.turn, rule, pass })
  const onlyConversation = ['session-unknown-private','session-essential-first','session-today-not-future','session-consent-boundary','session-injection-quote']
  for (const t of r.transcript.filter(t => t.complete)) {
    if (t.case.startsWith('session-confirm-') && t.turn >= 3) {
      const proposed = r.transcript.find(row=>row.case===t.case && row.turn===2)?.actions.find(a=>a.type==='confirm_items')?.items ?? []
      const choice=t.case.slice('session-confirm-'.length)
      const accepted=proposed.filter((_,i)=>choice==='all'||(choice==='first'&&i===0))
      const acceptedOps=accepted.flatMap(a=>a.ops)
      const bank=acceptedOps.find(op=>op.op==='add_holding')?.holding
      add(t,'only accepted bank holding persists',t.profile.holdings.length===(bank?1:0) && (!bank || t.profile.holdings[0].value===bank.value))
      for (const key of ['debtsComplete','noNearGoal']) {
        const expected=acceptedOps.some(op=>op.op==='update_profile'&&op.fields[key]===true)
        add(t,`only accepted ${key} persists`,Boolean(t.profile[key])===expected)
      }
      add(t,'review creates no transaction',!t.actions.some(a=>a.type.startsWith('prepare_')))
    }
    if (onlyConversation.includes(t.case)) {
      add(t, 'no profile mutation', t.ops.length === 0)
      add(t, 'no cards', t.actions.length === 0)
    }
    if (t.case === 'session-loss-one-step' || t.case === 'session-fresh-refusal' || t.case === 'session-fresh-native') add(t, 'no onboarding or transaction', !t.actions.some(a => a.type === 'intake_form' || a.type.startsWith('prepare_')))
    if (t.case === 'session-consent-boundary' && t.turn >= 2) add(t, 'requested explanation not replaced by generic deposit response', !/^A deposit increases the app vault balance\./.test(t.content ?? ''))
    if(t.case==='session-pending-target' && t.turn>=2) {
      add(t,'does not deny historically saved facts',!/nothing is confirmed|income figures.*pending|household details.*pending/iu.test(t.content??''))
      add(t,'no whole-reserve gap from unknown outside savings',!/still needed in full|your emergency fund is not full/iu.test(t.content??''))
    }
    if(t.case==='session-unknown-private' && t.turn===3) add(t,'answers salary subtraction',/9(?:[,.]0+)?\s*(?:triệu|million)|9,000,000|9000000/iu.test(t.content??''))
    if (t.case === 'session-correction-scope') {
      add(t, 'individual scope', t.profile.planningScope === 'individual')
      add(t, 'no spouse salary imported', !t.profile.incomes.some(i => i.monthly === 15e6))
      if (t.turn >= 2) add(t, 'salary correction replaces old source', t.profile.incomes.length === 1 && t.profile.incomes[0].monthly === 22e6)
    }
    if (t.case === 'session-debt-ambiguity' && t.turn === 2) add(t, 'question does not confirm interest', t.profile.debts.length === 1 && t.profile.debts[0].ratePct === null)
    if (t.case === 'session-debt-ambiguity' && t.turn === 3) add(t, 'confirmed zero interest preserves repayment', t.profile.debts.length === 1 && t.profile.debts[0].ratePct === 0 && t.profile.debts[0].monthlyPayment === 60 && t.profile.debts[0].required !== false)
    if (t.case === 'session-cost-units') {
      const h = t.profile.holdings.filter(h => h.type === 'btc')
      add(t, 'BTC units and invested cost', h.length === 1 && h[0].quantity === .015 && h[0].value === (t.turn === 1 ? 28e6 : 29e6) && h[0].currency === 'VND')
    }
    add(t, 'no failed explanation fallback', !/could not produce a reliable explanation|chưa tạo được phần giải thích đủ tin cậy/iu.test(t.content ?? ''))
    add(t, 'no internal draft commentary', !/my last draft|corrections:|output only the corrected|private failed draft/iu.test(t.content ?? ''))
  }
  const result = { label, model:r.model, commit:r.commit, sourceDiffSha256:r.sourceDiffSha256, started:r.started, ended:r.ended, cap:r.cap,
    input:r.input, output:r.output, cached:r.cached, verifiedTokens:r.input+r.output, unknownReserved:r.conservativeUnknownUsage,
    calls:r.calls, stop:r.stopped, completeTurns:r.transcript.filter(t=>t.complete).length,
    completeCases:r.cases.filter(c=>r.transcript.filter(t=>t.complete && t.case===c.id).length===c.turns).map(c=>c.id),
    checks:checks.length, passed:checks.filter(c=>c.pass).length, failures:checks.filter(c=>!c.pass),
    limitation:`Narrow automated invariants, not a conversational quality score. ${r.transcript.some(t=>t.reviewedOps?.length) ? 'Includes scripted local confirmation/rejection of cards; no wallet execution or browser UI test.' : 'Confirmation cards are not approved in this run.'}` }
  writeFileSync(`docs/evals/${label}-summary.json`,JSON.stringify(result,null,2)+'\n')
  writeFileSync(`docs/evals/${label}-transcripts.md`, `# ${label}\n\nModel: ${r.model}. Runtime diff: ${r.sourceDiffSha256}.\n` + r.transcript.map(t=>`\n## ${t.case} / ${t.turn}${t.complete?'':' (incomplete)'}\n\nUser: ${t.user}\n\nAgent: ${t.content??'(no answer)'}\n\nOps: ${JSON.stringify(t.ops)}\n${t.reviewedOps?.length?`\nScripted card review applied: ${JSON.stringify(t.reviewedOps)}\n`:''}\nActions: ${JSON.stringify(t.actions)}\n`).join(''))
  console.log(JSON.stringify(result,null,2))
}
