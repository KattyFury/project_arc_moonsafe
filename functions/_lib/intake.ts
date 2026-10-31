/**
 * The first questions, asked ONCE as a list (Hieu, 2026-10-28): "I need some information below to ... Share whatever you
 * are comfortable with". It replaces one question per message, which spent two model calls on every question.
 *
 * - The message is built here, not by the model: it costs no tokens, and it reads the same every time.
 * - It lists only what is still unknown. Anything the user leaves out is taken as "prefer not to say" and is not asked
 *   again; the one exception is monthly spending, without which the emergency fund cannot be sized (chat.ts nextQuestion).
 * - Fewer than INTAKE_MIN_UNKNOWN things missing: no list, the single question is enough.
 */

import type { FinancialProfile } from '../../src/types'

export const INTAKE_MIN_UNKNOWN = 3

/** Marks a message of ours as the list, so it is never sent twice. */
export const BATCH_MARK = /Share whatever you(?:'|’)re comfortable with|thoải mái chia sẻ/i // lang-ok

interface Bullet { key: string; en: string; vi: string; known: (p: FinancialProfile) => boolean }

/** USDC the app sees in the connected wallet: said out loud, but only what the user declares counts (Hieu, 2026-10-28). */
const seen = (n: number | null | undefined) => n !== null && n !== undefined && n >= 1 ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.floor(n)) : null

const ASSET_TYPES = ['savings', 'term_deposit', 'checking', 'cash', 'bond', 'junk_bond', 'stable_wallet', 'flexible_earn', 'locked_earn', 'defi_stable', 'btc', 'eth', 'top10', 'altcoin', 'crypto', 'staked_large_cap', 'nft', 'gold_physical', 'gold_token', 'us_stock', 'vn_stock', 'fund_bond']
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

/**
 * The short message above the form (Hieu, 2026-10-28: the first questions are a form to fill in, not a list to answer in words).
 * Null when so little is missing that one question is enough. `readback` is what this message already recorded.
 * The sentence "Share whatever you're comfortable with" marks it as sent (BATCH_MARK).
 */
export function buildIntake(p: FinancialProfile, userText: string, vi: boolean, readback: string[], _walletSeen: number | null = null): string | null {
  if (unknownBullets(p).length < INTAKE_MIN_UNKNOWN) return null
  const why = purpose(userText)
  const noted = readback.length ? (vi ? `Mình ghi: ${readback.join(', ')}.\n\n` : `Noted: ${readback.join(', ')}.\n\n`) : '' // lang-ok
  return vi
    ? `${noted}Mình cần một số thông tin để ${why.vi}. Bạn cứ điền những gì bạn thoải mái chia sẻ ở biểu mẫu bên dưới; ô nào để trống mình hiểu là bạn không muốn chia sẻ và sẽ bỏ qua.` // lang-ok
    : `${noted}I need some information to ${why.en}. Share whatever you're comfortable with in the form below; anything you leave empty I'll take as "prefer not to say" and skip it.`
}
