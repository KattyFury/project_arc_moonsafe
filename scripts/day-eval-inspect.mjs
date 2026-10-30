import { readFileSync } from 'node:fs'
const label = process.argv[2]
if (!/^[a-z0-9-]+$/.test(label ?? '')) throw new Error('Run label required')
const r = JSON.parse(readFileSync(`docs/evals/${label}.json`, 'utf8'))
console.log(JSON.stringify({ stopped: r.stopped, tokens: r.input + r.output, unknown: r.conservativeUnknownUsage, calls: r.calls }))
for (const t of r.transcript) console.log(JSON.stringify({ case: t.case, turn: t.turn, content: t.content, ops: t.ops, actions: t.actions, complete: t.complete }))
