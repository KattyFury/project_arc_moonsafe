// Repeatable offline gate. It never calls a paid provider.
import { spawnSync } from 'node:child_process'
const tests = [
  ['scripts/session-regression-check.ts'],
  ['scripts/response-quality-check.ts', '--no-report'],
  ['scripts/education-eval.ts', '--selftest'],
  ['scripts/part-choice-check.ts'],
  ['scripts/intake-assets-check.ts'],
  ['scripts/offline-flow.ts'],
]
let failed = false
for (const args of tests) {
  const res = spawnSync(process.execPath, ['--experimental-strip-types', '--conditions=browser', '--import', './scripts/local-ts-runtime.mjs', ...args], { encoding:'utf8' })
  const pass = res.status === 0
  console.log(`${pass ? 'PASS' : 'FAIL'} ${args[0]}`)
  if (!pass) { failed = true; console.log(res.stdout); console.error(res.stderr) }
}
process.exitCode = failed ? 1 : 0
