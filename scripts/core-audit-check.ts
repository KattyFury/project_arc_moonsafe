// What the 5M Haiku audit (2026-11-03) fixed, kept fixed without paying for a model. See docs/evals/core-audit-2026-11-03.md.
import assert from 'node:assert/strict'
import { quantityEvidence, responseProblems } from '../functions/_lib/agentGuards'
import { interestRateEvidence } from '../functions/_lib/mutationEvidence'
import { buildIntake } from '../functions/_lib/intake'
import { targetMix } from '../src/kb/kb'
import { normalizeProfile } from '../src/lib/profile'

const flagged = (text: string) => responseProblems(text, false).length > 0
// CORE 1: money outside the vault never counts as the emergency fund.
assert.ok(flagged('Your $10,000 on Binance matters, and it counts as your reserve for the fund.'))
assert.ok(flagged('Your $10,000 on Binance covers that $9,000 fund target.'))
assert.ok(flagged('Bạn có thể xem khoản 150 triệu tiết kiệm là một phần dự phòng.')) // lang-ok
assert.ok(!flagged('Your $10k on Binance is not counted toward the emergency fund.'))
assert.ok(!flagged('Term deposits count as Safety.'))
// CORE 2: spare money is not asked about.
assert.ok(flagged('Do you have any money in savings outside the app that you would be willing to mention?'))
assert.ok(flagged('Bạn có thể cho mình biết khoản tiền mặt hoặc tiền ngân hàng bạn đang có không?')) // lang-ok
// CORE 3: money against the bar, no % per part, no total as 100%.
assert.ok(flagged('Your shares of the three parts: Safety 46%, target 35%: above.'))
assert.ok(!flagged('Traditional: $10,000 of $13,000, $3,000 to go.'))
assert.ok(!flagged('Investing, by your age, 35: Safety 35%, Traditional 32.5%, Crypto 32.5%.'))
// A fall is a loss before selling too.
assert.ok(flagged('A drop only shows up as a lower value; you only lock in a loss if you sell.'))
// The Crypto cap (Hieu, 2026-11-03).
assert.equal(normalizeProfile({ v: 2, age: 30, cryptoSplit: 60 }).cryptoSplit, 50)
assert.equal(normalizeProfile({ v: 2, age: 30, cryptoSplit: 0 }).cryptoSplit, 0)
assert.equal(targetMix(30, 100).btc, targetMix(30, 50).btc)
// No % next to what they hold; no offer to store a mix inside Crypto; no comment on how you address them.
assert.ok(flagged('Traditional: 39%, your VOO of $10,000.'))
assert.ok(flagged('Got it. Do you want me to note it in your profile?'))
assert.ok(flagged('Mình gọi bạn là "bạn" nhé.')) // lang-ok
// Crypto is one bar; the guide never changes the target.
assert.equal(targetMix(30).btc + targetMix(30).large_cap + targetMix(30).altcoin, 35)
// What people actually type.
assert.ok(interestRateEvidence('they charge like 15% a month', 180))
assert.ok(interestRateEvidence('lãi 30%/năm', 30)) // lang-ok
assert.ok(!interestRateEvidence('they charge like 15% a year', 180))
assert.ok(quantityEvidence('2 cây vàng SJC', 2, undefined, 'gold')) // lang-ok
// No form for a month they just told.
const told = normalizeProfile({ v: 2, age: 24, incomes: [{ id: 'i', name: 'Work', monthly: 3000, currency: 'USDC', kind: 'active' }], expenses: [{ id: 'e', name: 'Spending', monthly: 1500, currency: 'USDC', kind: 'fixed' }] })
assert.equal(buildIntake(told, 'hello', false, []), null)
console.log('core audit checks passed')
