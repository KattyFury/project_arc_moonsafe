// What the 5M Haiku audit (2026-11-03) fixed, kept fixed without paying for a model. See docs/evals/core-audit-2026-11-03.md.
import assert from 'node:assert/strict'
import { defersOffer, isCrisis, quantityEvidence, responseProblems } from '../functions/_lib/agentGuards'
import { computeBalance, debtIsPriority } from '../src/lib/allocation'
import { interestRateEvidence } from '../functions/_lib/mutationEvidence'
import { buildIntake } from '../functions/_lib/intake'
import { bareAmount, buildPlacement, spareSource } from '../functions/_lib/plan'
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
// A debt from the form: the kind is unknown, the rate decides (real chat 2026-11-03). No rate yet: still treated as expensive.
const formDebt = { id: 'd', name: 'Debt', type: 'unknown' as const, balance: 20000, currency: 'USDC' as const, monthlyPayment: 200, updatedAt: 1 }
assert.equal(debtIsPriority({ ...formDebt, ratePct: 0 }), false)
assert.equal(debtIsPriority({ ...formDebt, ratePct: 5 }), false)
assert.equal(debtIsPriority({ ...formDebt, ratePct: 10 }), true)
assert.equal(debtIsPriority({ ...formDebt, ratePct: null }), true)
// Putting an offer off is a no; changing it or asking about it is not.
assert.ok(defersOffer('No. I will consider fullfill it'))
assert.ok(defersOffer('not yet, let me think'))
assert.ok(defersOffer('để mình suy nghĩ')) // lang-ok
assert.ok(!defersOffer('no make it 10'))
assert.ok(!defersOffer('I think so'))
assert.ok(!defersOffer("i think i'll do it"))
assert.ok(defersOffer("i'll think about it"))
assert.ok(!defersOffer('no I already have savings'))
assert.ok(!defersOffer('should I consider it?'))
// Spare money they named can be pointed at the fund; nothing named, or kept as Safety, stays out of it (Hieu, 2026-11-03).
assert.equal(spareSource(['I have 2000$ in stablecoin, 2000$ in gold at current price. Maybe 1000$ in bank account.']), 'both')
assert.equal(spareSource(['500 usdt on binance']), 'stable')
assert.equal(spareSource(['100 triệu ngân hàng']), 'bank')
assert.equal(spareSource(['2000 in gold']), null)
assert.equal(spareSource(['keep 3000 usdc as safety']), null)
assert.equal(spareSource(['do i need a bank?']), null)
assert.equal(spareSource(['[app event] The user signed the card: Added 5 USDC to your emergency fund.']), null)
assert.equal(spareSource(['50 triệu không kỳ hạn']), 'bank') // lang-ok
assert.ok(flagged('I can\'t help move your emergency fund into Bitcoin.'))
// Someone in crisis gets the fixed answer; figures of speech do not.
for (const t of ['i lost everything. i dont see the point of going on anymore', 'mình không muốn sống nữa', 'i want to end my life', 'I am suicidal', "i can't go on"]) assert.ok(isCrisis(t), t) // lang-ok
for (const t of ['kill my debt', 'this stock is suicide lol', 'end my subscription', 'i dont want to go on a trip', 'i see no point in buying gold', 'tức muốn chết']) assert.ok(!isCrisis(t), t) // lang-ok
// Money to place is answered from the numbers (audit 2026-11-03).
assert.equal(bareAmount('i want to add 500000 next month from selling a business, how would you place it'), 500000)
assert.equal(bareAmount('an airdrop of 3000 just landed, what do i do with it'), 3000)
assert.equal(bareAmount('got 5k in 2 years at 10%, how should i split it'), 5000)
assert.equal(bareAmount('what do i do with it'), null)
{
  const person = { v: 2, age: 31, incomeStable: true, dependents: 1, debtsComplete: true, noNearGoal: true,
    incomes: [{ id: 'i', name: 'Pay', monthly: 600, currency: 'USDC', kind: 'active', updatedAt: 1 }], expenses: [{ id: 'e', name: 'Spending', monthly: 600, currency: 'USDC', kind: 'fixed', updatedAt: 1 }],
    holdings: [{ id: 'g', type: 'fund_bond', name: 'VOO', value: 2000, currency: 'USDC', priceSource: 'self', rebalanceable: true, updatedAt: 1 }] }
  const answer = (vault: number, amount: number, extra = {}) => { const p = normalizeProfile({ ...person, ...extra }); return buildPlacement({ p, b: computeBalance({ profile: p, walletUsd: 0, vaultUsd: vault, cirBtcUsd: 0, prices: { usd: {}, goldUsdPerOz: null }, vndPerUsd: 25000 }), vi: false, amount }) ?? '' }
  assert.match(answer(37, 3000), /\$37 of \$3,600, so all of this \$3,000 could go in first/)
  assert.match(answer(3000, 1000), /so \$600 of this \$1,000 could fill it\. The other \$400 could go by your age: Safety \$124, Traditional \$138, Crypto \$138/)
  assert.match(answer(3600, 500), /can go to the parts still short: Safety \$1,797 to go \(now \$0 \/ \$1,797\) and Crypto \$2,000 to go \(now \$0 \/ \$2,000\)\. Nothing needs selling/)
  assert.match(answer(3600, 1000, { holdings: [] }), /could go by your age: Safety \$310, Traditional \$345, Crypto \$345/)
  assert.match(answer(0, 500, { debts: [{ id: 'd', name: 'Card', type: 'credit_card', balance: 900, currency: 'USDC', ratePct: 24, monthlyPayment: 50, updatedAt: 1 }] }), /first the starter fund .* then the expensive debt/)
}
// What people actually type.
assert.ok(interestRateEvidence('they charge like 15% a month', 180))
assert.ok(interestRateEvidence('lãi 30%/năm', 30)) // lang-ok
assert.ok(!interestRateEvidence('they charge like 15% a year', 180))
assert.ok(quantityEvidence('2 cây vàng SJC', 2, undefined, 'gold')) // lang-ok
// No form for a month they just told.
const told = normalizeProfile({ v: 2, age: 24, incomes: [{ id: 'i', name: 'Work', monthly: 3000, currency: 'USDC', kind: 'active' }], expenses: [{ id: 'e', name: 'Spending', monthly: 1500, currency: 'USDC', kind: 'fixed' }] })
assert.equal(buildIntake(told, 'hello', false, []), null)
console.log('core audit checks passed')
