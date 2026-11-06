// Offline checks for the persona run of 2026-11-06 (docs/evals/persona-sim-2026-11-06.txt): no paid call.
// The plain words a first message carries, which questions get the fund line from code, and the dollar format.
import assert from 'node:assert/strict'
import { factProposals, FUND_SIZE_Q, OTHER_FUND_TOPIC, fixDollars } from '../functions/_lib/agentGuards'
import { normalizeProfile } from '../src/lib/profile'

const empty = normalizeProfile({ v: 2 })
const names = (text: string, p = empty) => factProposals(text, p)
const profileFields = (text: string, p = empty) => (names(text, p).find(x => x.name === 'update_profile')?.args ?? {}) as Record<string, unknown>
const money = (text: string, tool: string, p = empty) => (names(text, p).find(x => x.name === tool)?.args as { monthly?: { amount: number; currency: string } } | undefined)?.monthly

// Minh's first message: income, spending, single, no debt, no big plans, income that moves.
const minh = 'hey, first time here — i make around $1.5k a month but it moves a bit, spend about $900, single, no debt, no big plans. how big should my emergency fund be, and why that size?'
assert.deepEqual(money(minh, 'set_expense'), { amount: 900, currency: 'USDC' })
assert.deepEqual(money(minh, 'set_income'), { amount: 1500, currency: 'USDC' })
assert.deepEqual(profileFields(minh), { debts_complete: true, no_near_goal: true, dependents: 0, income_stable: false })
// Lan's second message, in Vietnamese with thousands written with a dot.
const lan = 'Nhà tôi chi khoảng 1.000 USD/tháng cho cả gia đình, thu nhập của hai vợ chồng khá đều nên tôi muốn biết mức quỹ dự phòng hợp lý là bao nhiêu tháng chi tiêu và vì sao' // lang-ok
assert.deepEqual(money(lan, 'set_expense'), { amount: 1000, currency: 'USDC' })
assert.equal(profileFields(lan).income_stable, true)
assert.equal(money(lan, 'set_income'), undefined, 'a household income without a number is not an income line')
assert.deepEqual(money('mình tiêu tầm 15 triệu mỗi tháng', 'set_expense'), { amount: 15e6, currency: 'VND' }) // lang-ok
assert.equal(profileFields('thu nhập không đều, lúc nhiều lúc ít').income_stable, false) // lang-ok
// Not facts: plans, spending on one thing, a yearly figure, a single parent, a partner's pay, things already known.
assert.equal(money('i want to spend $30k on a car', 'set_expense'), undefined)
assert.equal(money('i spend 200 on rent', 'set_expense'), undefined)
assert.equal(money('i make 60k a year', 'set_income'), undefined)
assert.equal(profileFields('i am a single parent').dependents, undefined)
assert.equal(money('my wife and i make 6k', 'set_income'), undefined)
const known = normalizeProfile({ v: 2, dependents: 2, incomeStable: true, debtsComplete: true, expenses: [{ id: 'e', name: 'Monthly spending', monthly: 700, currency: 'USDC', kind: 'fixed', updatedAt: 1 }] })
assert.deepEqual(names('single, no debt, income moves a lot, i spend about $900', known), [])

// The fund line from code: the size or what is missing, never deposits, fees, withdrawals or debt.
const fundLine = (t: string) => FUND_SIZE_Q.test(t) && !OTHER_FUND_TOPIC.test(t)
assert.ok(fundLine('How big should my emergency fund be?'))
assert.ok(fundLine('Mình cảm ơn, nhưng hiện app mới chỉ xác nhận 150 USDC và 4.000 USD tiết kiệm chưa được tính vào quỹ dự phòng thôi, còn chưa nói rõ chính xác tôi đang thiếu bao nhiêu USD để đạt mục tiêu quỹ dự phòng, nên bạn giúp tôi chốt con số đó rõ ràng nhé.')) // lang-ok
assert.ok(fundLine('I am married and 38. My income is irregular and averages $3000 per month. Household spending is $1800 monthly. Explain our emergency fund target?'))
assert.ok(!fundLine('Vâng, tôi sẽ nhớ 3 bước đó; chị có thể cho tôi biết thêm nếu muốn nạp tiếp sau này thì nên nạp từng phần khoảng bao nhiêu để an toàn hơn không?')) // lang-ok
assert.ok(!fundLine('ví của chị đang có 150 USDC, không phải 50 USDC ạ; nếu rút tiền thì có mất phí nhiều không, và khoản vay xe còn 5.000 USD thì chị nên trả tiếp nhanh hay giữ tiền mặt trước ạ? quỹ dự phòng tính bao nhiêu?')) // lang-ok
assert.ok(!fundLine('that bitcoin total looks off — it should be around $850 now. how much should i keep as emergency fund vs put to work?'))

// Dollar amounts keep comma thousands; cents are left alone.
assert.equal(fixDollars('quỹ **$7.500** và chi **$1.250**/tháng'), 'quỹ **$7,500** và chi **$1,250**/tháng') // lang-ok
assert.equal(fixDollars('$40.70 and $1.25 and $1.234.567.'), '$40.70 and $1.25 and $1,234,567.')
console.log('persona-sim-check OK')

// A fund amount worked out from months while a fact is still missing (Lan, dependents unknown: "quỹ dự phòng 3 tháng chi tiêu = $3,000").
import { responseProblems } from '../functions/_lib/agentGuards'
assert.ok(responseProblems('Với chi tiêu đều như vậy, **quỹ dự phòng 3 tháng chi tiêu = $3,000**; mức này thường đủ.', false, true, true).some(p => p.startsWith('The personalized fund target is unknown'))) // lang-ok
assert.ok(!responseProblems('Với chi tiêu đều như vậy, **quỹ dự phòng 3 tháng chi tiêu = $3,000**; mức này thường đủ.', false, false, true).some(p => p.startsWith('The personalized fund target is unknown'))) // lang-ok
console.log('persona-sim-check (fund unknown) OK')
