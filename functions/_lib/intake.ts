/**
 * The first questions, asked ONCE (Hieu, 2026-10-28), in two messages told in the user's own words (Hieu, 2026-10-31, option E2:
 * the form was too long): 1. the month (cashflowAsk), 2. what they hold and the split (assetsAsk). It replaces one question per
 * message, which spent two model calls on every question.
 *
 * - The messages are built here, not by the model: they cost no tokens, and they read the same every time.
 * - Anything the user leaves out is taken as "prefer not to say" and is not asked again; the one exception is monthly spending,
 *   without which the emergency fund cannot be sized (chat.ts nextQuestion).
 * - Fewer than INTAKE_MIN_UNKNOWN things missing: no list, the single question is enough.
 */

import type { FinancialProfile } from '../../src/types'

export const INTAKE_MIN_UNKNOWN = 3

/** Marks a message of ours as the list, so it is never sent twice. */
export const BATCH_MARK = /Share whatever you(?:'|’)re comfortable with|thoải mái chia sẻ/i // lang-ok

interface Bullet { key: string; en: string; vi: string; known: (p: FinancialProfile) => boolean }

/** USDC the app sees in the connected wallet: said out loud, but only what the user declares counts (Hieu, 2026-10-28). */
const seen = (n: number | null | undefined) => n !== null && n !== undefined && n >= 1 ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(n)) : null

export const ASSET_TYPES = ['savings', 'term_deposit', 'checking', 'cash', 'bond', 'junk_bond', 'stable_wallet', 'flexible_earn', 'locked_earn', 'defi_stable', 'btc', 'eth', 'top10', 'altcoin', 'crypto', 'staked_large_cap', 'nft', 'gold_physical', 'gold_token', 'us_stock', 'vn_stock', 'fund_bond']
const OTHER_TYPES = ['home', 'car', 'rental_property', 'loan_given', 'business_stake']

const BULLETS: Bullet[] = [
  { key: 'age', en: 'Your age', vi: 'Tuổi của bạn', known: p => p.age !== null || p.ageDeclined }, // lang-ok
  { key: 'income', en: 'What you earn each month, and from what', vi: 'Thu nhập mỗi tháng và từ đâu', known: p => p.incomes.length > 0 }, // lang-ok
  { key: 'spending', en: 'What you spend each month (an estimate is fine)', vi: 'Chi tiêu mỗi tháng (ước chừng là được)', known: p => p.expenses.length > 0 }, // lang-ok
  { key: 'stability', en: 'Whether your income is steady, and whether anyone relies on it', vi: 'Thu nhập có ổn định không, và có ai phụ thuộc vào bạn không', known: p => p.incomeStable !== null && p.dependents !== null }, // lang-ok
  { key: 'goal', en: 'A big expense in the next 5 years, if any', vi: 'Khoản chi lớn trong 5 năm tới, nếu có', known: p => !!p.nearGoal || !!p.noNearGoal }, // lang-ok
  { key: 'assets', en: 'What you hold: wallets, bank, exchanges, coins, gold, stocks (a balance counts only once you tell me)', vi: 'Bạn đang giữ gì: ví, ngân hàng, sàn, coin, vàng, cổ phiếu (số dư chỉ được tính khi bạn khai)', known: p => p.holdings.some(h => ASSET_TYPES.includes(h.type)) }, // lang-ok
  { key: 'other', en: 'A home, land or car, money lent, or a business', vi: 'Nhà, đất hoặc xe, tiền cho vay, hoặc doanh nghiệp', known: p => p.holdings.some(h => OTHER_TYPES.includes(h.type)) }, // lang-ok
  { key: 'debt', en: 'Any debt, family loans included', vi: 'Các khoản nợ, kể cả mượn người thân', known: p => p.debtsComplete || p.debts.length > 0 }, // lang-ok
]

export const unknownBullets = (p: FinancialProfile) => BULLETS.filter(b => !b.known(p))

/** Why we ask, in the user's own direction ("spending", "emergency fund", "investing"). */
function purpose(text: string): { en: string; vi: string } {
  if (/spend|spending|expens|where (my )?money|chi tiêu|tiêu xài/i.test(text)) return { en: 'show you where your money goes', vi: 'xem tiền của bạn đang đi đâu' } // lang-ok
  if (/emergency|fund|safety|saving|save|quỹ|dự phòng|tiết kiệm|an toàn/i.test(text)) return { en: 'work out the right size for your emergency fund and where your savings should sit', vi: 'tính quỹ dự phòng cho đúng và nơi nên để tiền tiết kiệm' } // lang-ok
  if (/invest|đầu tư/i.test(text)) return { en: 'build a plan to invest the right way', vi: 'lập kế hoạch đầu tư đúng cách' } // lang-ok
  return { en: 'build a plan for your money', vi: 'lập kế hoạch cho tiền của bạn' } // lang-ok
}

/** The sections the form should show: what is still unknown. */
export const intakeKeys = (p: FinancialProfile): string[] => unknownBullets(p).map(b => b.key)

/** The form's sections for the month (Hieu, 2026-11-01: back to a form, words were hard to use): what is still unknown of the cash flow. */
export const CASHFLOW_KEYS = ['age', 'income', 'spending', 'stability', 'goal', 'debt']
export const cashflowKeys = (p: FinancialProfile): string[] => intakeKeys(p).filter(k => CASHFLOW_KEYS.includes(k))

/**
 * Question 1 of 2: the month, as one block, because together it sizes the emergency fund. Sent with the cash-flow form (Hieu,
 * 2026-11-01: answering in words was hard to use; the form fits one desktop screen). The sentence "Share whatever you're comfortable
 * with" marks it as sent (BATCH_MARK).
 */
export function cashflowAsk(vi: boolean, why = purpose('')): string {
  return vi
    ? `Để ${why.vi}, bạn điền tháng của bạn ở bảng dưới nhé. Ước chừng là được; bạn cứ thoải mái chia sẻ, ô nào không muốn nói thì để trống.` // lang-ok
    : `To ${why.en}, fill in your month below. An estimate is fine. Share whatever you're comfortable with; leave the rest blank.`
}

/**
 * The first question, sent once (the month: cashflowAsk, with the form). Null when so little is missing that one question is enough.
 * `readback` is what this message already recorded.
 */
export function buildIntake(p: FinancialProfile, userText: string, vi: boolean, readback: string[], _walletSeen: number | null = null): string | null {
  if (unknownBullets(p).length < INTAKE_MIN_UNKNOWN) return null
  const noted = readback.length ? (vi ? `Mình ghi: ${readback.join(', ')}.\n\n` : `Noted: ${readback.join(', ')}.\n\n`) : '' // lang-ok
  return noted + cashflowAsk(vi, purpose(userText))
}

/** Marks question 2 (what they hold) as sent. */
export const ASSETS_MARK = /Now, what you hold|Giờ tới phần bạn đang có/ // lang-ok

const money = (n: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)}`

/**
 * Question 2 of 2, after the month is told: what was noted, what it means for the emergency fund (target and what is left each
 * month, and where the fund money can come from), then what they hold in their own words and the Traditional / Crypto split
 * (MoonSafe's default 50/50, their call). Income steadiness left out is asked once here, in one short line.
 */
export function assetsAsk(p: FinancialProfile, fund: { floorUsd: number | null; floorMonths: number }, flow: { income: number | null; spending: number | null; debtPayments: number; surplus: number | null }, vi: boolean, walletSeen: number | null = null): string {
  const noted: string[] = []
  if (p.age !== null) noted.push(vi ? `tuổi ${p.age}` : `age ${p.age}`) // lang-ok
  if (flow.income !== null) noted.push(vi ? `thu nhập ${money(flow.income)}/tháng` : `income ${money(flow.income)} a month`) // lang-ok
  if (p.hasWindfalls) noted.push(vi ? 'có khoản thu lâu lâu (airdrop…)' : 'money now and then (airdrops…)') // lang-ok
  if (flow.spending !== null) noted.push(vi ? `chi tiêu ${money(flow.spending - flow.debtPayments)}/tháng` : `spending ${money(flow.spending - flow.debtPayments)} a month`) // lang-ok
  if (p.dependents !== null) noted.push(vi ? (p.dependents ? `${p.dependents} người sống dựa vào bạn` : 'không ai sống dựa vào thu nhập của bạn') : (p.dependents ? `${p.dependents} relying on you` : 'nobody relying on your income')) // lang-ok
  // "Nợ mẹ" is already a debt's name: no "nợ Nợ mẹ" (Haiku run 2026-10-31).
  for (const d of p.debts) noted.push(`${/^(nợ|debt|loan)\b/iu.test(d.name) ? '' : vi ? 'nợ ' : 'debt '}${d.name} ${money(d.balance)}${d.ratePct === 0 ? (vi ? ', không lãi' : ', no interest') : d.ratePct ? `, ${d.ratePct}%` : ''}${d.monthlyPayment ? (vi ? `, trả ${money(d.monthlyPayment)}/tháng` : `, ${money(d.monthlyPayment)} a month`) : ''}`) // lang-ok
  if (p.debtsComplete && !p.debts.length) noted.push(vi ? 'không nợ' : 'no debt') // lang-ok
  const lines: string[] = []
  if (noted.length) lines.push(vi ? `Mình ghi lại: ${noted.join('; ')}.` : `Noted: ${noted.join('; ')}.`) // lang-ok
  if (fund.floorUsd !== null) {
    const left = flow.surplus
    const source = left === null ? '' : left > 0.5
      ? (vi ? ` Mỗi tháng bạn còn dư ${money(left)}, quỹ lấp dần từ phần này.` : ` You have ${money(left)} left each month, which can fill it over time.`) // lang-ok
      : p.hasWindfalls
        ? (vi ? ' Lương vừa đủ chi, nên quỹ sẽ lấp dần từ những khoản thu lâu lâu như airdrop.' : ' Your pay just covers the month, so the fund fills from the money that comes now and then, like airdrops.') // lang-ok
        : (vi ? ' Hiện mỗi tháng chưa dư đồng nào.' : ' Right now nothing is left at the end of the month.') // lang-ok
    lines.push(vi ? `Quỹ dự phòng của bạn nên là **${money(fund.floorUsd)}** = ${fund.floorMonths} tháng chi tiêu${flow.debtPayments > 0 ? ' (gồm cả tiền trả nợ, vì mất việc vẫn phải trả)' : ''}.${source}` : `Your emergency fund should be **${money(fund.floorUsd)}** = ${fund.floorMonths} months of spending${flow.debtPayments > 0 ? ' (debt payments included: they go on even if your income stops)' : ''}.${source}`) // lang-ok
  }
  const s = seen(walletSeen)
  lines.push(vi
    ? `Giờ tới phần bạn đang có. Bạn kể tự nhiên là được, ví dụ "3k ngân hàng, 1k USDC, 0.5 oz vàng, 0.02 BTC". Quỹ dự phòng trong app và cirBTC thì mình tự đọc trên chuỗi${s ? `; ví này đang có ${s} USDC, bạn nói giúp phần nào là của bạn` : ''}.` // lang-ok
    : `Now, what you hold, in your own words, for example "3k in the bank, 1k USDC, 0.5 oz gold, 0.02 BTC". I read your emergency fund in the app and any cirBTC onchain myself${s ? `; this wallet shows ${s} USDC, so say how much of it is yours` : ''}.`)
  lines.push(vi
    ? 'Thêm 1 câu: ngoài phần an toàn, bạn muốn chia giữa đầu tư truyền thống (cổ phiếu, vàng) và crypto thế nào? MoonSafe mặc định 50/50, bạn chọn khác cũng được.' // lang-ok
    : 'And one more: outside Safety, how would you like to split between traditional investments (stocks, gold) and crypto? MoonSafe\'s default is 50/50; another split is fine.')
  if (p.incomeStable === null && p.incomes.length) lines.push(vi ? 'Một câu nhanh: lương của bạn có đều hằng tháng không?' : 'Quick one: is your pay about the same every month?') // lang-ok
  return lines.join('\n\n')
}
