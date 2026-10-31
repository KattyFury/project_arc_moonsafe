import assert from 'node:assert/strict'
import { detectPartChoice } from '../functions/_lib/plan'

const choice = 'Which part would you like to fill first: Safety, Traditional or Crypto?'
const only = 'Only Crypto still has room. Would you like to start with it?'
const rejected = [
  'not crypto', 'No crypto please', "I don't want crypto", 'I don’t want crypto',
  'crypto later', 'maybe crypto', 'Crypto?', 'Should I choose crypto',
  'I am unsure about crypto', 'avoid crypto', 'stop crypto', 'cancel crypto',
  'yes, but not now', 'yes, maybe later', 'not yet',
  'đừng mua crypto', 'không chọn crypto', 'chưa muốn crypto', 'crypto để sau',
  'có lẽ crypto', 'crypto được không', 'tại sao crypto',
  'not savings', 'gold later', 'no gold', 'What about gold?',
]
for (const previous of [choice, only]) {
  for (const text of rejected) assert.equal(detectPartChoice(text, previous), null, `must not treat "${text}" as a choice`)
}
for (const [text, expected] of [['Crypto', 'crypto'], ['start with Bitcoin', 'crypto'], ['Safety', 'safe'], ['bank savings', 'safe'], ['Gold', 'traditional'], ['chọn vàng', 'traditional']] as const) {
  assert.equal(detectPartChoice(text, choice), expected, `preserve explicit choice: ${text}`)
}
assert.equal(detectPartChoice('yes', only), 'crypto')
assert.equal(detectPartChoice('How about the "safe" part', choice), 'safe')
assert.equal(detectPartChoice('đồng ý', only), 'crypto')
assert.equal(detectPartChoice('yes', choice), null)
assert.equal(detectPartChoice('crypto', 'What would you like to learn?'), null)
console.log(`Part choice OK: ${rejected.length * 2 + 11} bilingual routing checks, no model calls.`)
