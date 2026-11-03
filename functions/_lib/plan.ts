/**
 * The plan message, built here instead of by the model (Hieu, 2026-10-28: "the app never says WHY the emergency fund, Safety,
 * traditional investing and crypto"). Numbers come from the balance, the reasons are fixed sentences, so the same facts always
 * give the same plan, it always explains each step, and it costs no tokens.
 *
 * Only for the plain case; anything the plan has to bend around (priority debt, a wish for one asset, an unknown income stability)
 * goes to the model as before (buildPlan returns null). A near-term goal is handled here: it is kept in savings first and added to Safety.
 */

import { bucketStanding, type Balance, type Standing } from '../../src/lib/allocation'
import { BTC_GUIDE, param } from '../../src/kb/kb'
import { fundMissingInputs } from './agentGuards'
import type { FinancialProfile } from '../../src/types'

/** Monthly buys a part is spread over when the user does not trade by the charts (Hieu, 2026-10-29). */
export const DCA_MONTHS = 6

/** A value in dollars (Hieu, 2026-10-29). */
const fmt = (n: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2, minimumFractionDigits: n < 100 && Math.round(n * 100) % 100 !== 0 ? 2 : 0 }).format(n)}`
/** The token the user signs for (deposit, cirBTC buy): what the wallet shows. */
const tok = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

/** The scale behind the number, so 3 or 6 months is never a bare figure (Hieu, 2026-10-28). */
const SCALE = {
  en: 'As a rule: 3 months when income is steady and nobody relies on it, 6 when income is irregular or someone relies on it, 9 to 12 when both. The less certain the income, the longer the cushion.',
  vi: 'Quy tắc chung: 3 tháng khi thu nhập ổn định và không ai phụ thuộc, 6 tháng khi thu nhập không đều hoặc có người phụ thuộc, 9 đến 12 tháng khi có cả hai. Thu nhập càng khó đoán thì đệm càng dài.', // lang-ok
}

/** Why the fund has this many months: the user's own situation. */
function fundWhy(p: FinancialProfile, months: number, vi: boolean): string {
  const steady = p.incomeStable === true
  const kids = (p.dependents ?? 0) > 0
  if (months >= 12) return vi ? 'bạn là người kiếm tiền duy nhất, thu nhập không đều và có người phụ thuộc, nên cần đệm dài nhất để không bị ép bán đầu tư lúc xấu' : 'you are the only earner, your income is irregular and someone relies on it, so you need the longest cushion to never be forced to sell investments at a bad time' // lang-ok
  if (months >= 9) return vi ? 'thu nhập không đều và có người phụ thuộc vào bạn, nên cần đệm dài để qua những tháng không có thu nhập' : 'your income is irregular and someone relies on it, so you need a long cushion to get through months with no income' // lang-ok
  if (months >= 6) return steady && kids
    ? (vi ? 'thu nhập ổn định nhưng có người phụ thuộc vào bạn, nên cần đệm dài hơn' : 'your income is steady but someone relies on it, so the cushion is longer') // lang-ok
    : (vi ? 'thu nhập không đều, nên cần đệm dài hơn để một tháng ít việc không buộc bạn bán đầu tư' : 'your income is irregular, so the cushion is longer: one slow month must never force you to sell investments') // lang-ok
  return vi ? 'thu nhập ổn định và không ai phụ thuộc vào bạn, nên vài tháng là đủ để qua lúc gián đoạn mà không phải bán gì' : 'your income is steady and nobody relies on it, so a few months is enough to cover a pause without selling anything' // lang-ok
}

const WHY = {
  safety: {
    en: 'money set aside on purpose in a term deposit at your bank or government bonds. It keeps a bad month, a repair or a missed payment from ever forcing you to sell your investments.',
    vi: 'tiền để riêng có chủ đích, trong tiền gửi có kỳ hạn ở ngân hàng hoặc trái phiếu chính phủ. Nó giúp một tháng xấu hay một khoản sửa chữa không bao giờ buộc bạn phải bán đầu tư.', // lang-ok
  },
  traditional: {
    en: 'stocks and index funds (for example VOO) and gold. They have grown steadily over the long run.',
    vi: 'cổ phiếu, quỹ chỉ số (ví dụ VOO) và vàng. Chúng tăng đều theo thời gian dài.', // lang-ok
  },
  crypto: {
    en: 'a guide of about $7 of every $10 in BTC, the long-term reserve asset for people who live in Web3, and the rest your own pick, top-10 coins by market cap first. Every coin you hold counts. It can fall by about half along the way, which is why it stays at its share.',
    vi: 'gợi ý cứ 10 đô thì khoảng 7 đô vào BTC, tài sản dự trữ dài hạn của người sống trong Web3, còn lại bạn tự chọn, ưu tiên coin top 10 vốn hoá. Coin nào bạn giữ cũng được tính. Nó có thể giảm khoảng một nửa trên đường đi, vì vậy chỉ giữ ở tỷ lệ này.', // lang-ok
  },
}

export interface PlanInput {
  p: FinancialProfile
  b: Balance
  /** Shares in %, rounded to sum to 100: Safety, Traditional, Crypto. */
  shares: [number, number, number]
  /** The deposit to offer for the fund (exactly what is missing when the wallet covers it), or null. */
  cover: number | null
  vi: boolean
  /** The wallet cannot fill the fund but can start it: the deposit to offer now. */
  partial?: number | null
  /** false: the user has no vault yet, so the first step is opening it (one-time fee), not a deposit. */
  hasVault?: boolean
  /** The vault opening fee in USDC (read from the factory by the app). */
  vaultFee?: number
}

/**
 * The offer to open the vault (Hieu, 2026-10-29: the vault is offered only once the user has shared their numbers, and the fee is
 * said plainly but kindly). The wording "open it for you to sign" is what a "yes" is matched on (OPEN_OFFERED in chat.ts).
 */
export function openVaultOffer(vi: boolean, fee = 1): string {
  const f = tok(fee)
  return vi
    ? `Sẵn sàng bắt đầu chưa? Quỹ dự phòng của bạn nằm trong một vault riêng trên Arc: một hợp đồng nhỏ mà chỉ ví của bạn rút được. Mở vault chỉ tốn **${f} một lần** cho mỗi tài khoản; sau đó nạp hay rút chỉ mất phí mạng vài cent. Mình mở nó để bạn ký nhé?` // lang-ok
    : `Ready to start? Your emergency fund lives in your own vault on Arc: a small contract that only your wallet can withdraw from. Opening it is **${f}, once** per account; after that, adding or withdrawing only costs a network fee of a few cents. Shall I open it for you to sign?`
}

/**
 * Start the fund with what the wallet has; the wording keeps "prepare a deposit of", which a "yes" is matched on. `windfalls`: the pay
 * only covers the month, so the rest comes from the money that arrives now and then (airdrops; Hieu, 2026-10-31).
 */
export const partialOffer = (vi: boolean, amount: number, windfalls = false) => vi
  ? `Sẵn sàng bắt đầu chưa? Ví của bạn có thể bắt đầu quỹ với **${tok(amount)}** ngay, phần còn lại ${windfalls ? 'thêm khi có airdrop hay khoản thu lâu lâu' : 'thêm dần sau'}: mình chuẩn bị một lệnh nạp **${tok(amount)}** để bạn ký nhé?` // lang-ok
  : `Ready to start? Your wallet can start the fund with **${tok(amount)}** now and the rest can follow${windfalls ? ' when an airdrop or other occasional money comes in' : ''}: shall I prepare a deposit of **${tok(amount)}** for you to sign?`

/**
 * Where a part stands against its full bar (Hieu, 2026-11-01): the part furthest ahead of its age share is full and sets the others'.
 * "$3,000: the biggest for your age, it sets the size" / "$1,000 of $3,500, $2,500 to go" / "$3,500 of $3,500: full".
 */
export function shareLine(r: Standing, vi: boolean): string {
  // A part the user set to 0% (split 0/100): not part of their plan, never "$0 of $0: full".
  if (r.share <= 0) return vi ? `${fmt(r.have)}: không nằm trong tỷ lệ bạn chọn` : `${fmt(r.have)}: not in your split` // lang-ok
  if (r.anchor) return vi ? `${fmt(r.have)}: phần đi xa nhất theo tuổi, làm mốc cho các phần khác` : `${fmt(r.have)}: furthest ahead for your age, so it sets the size` // lang-ok
  if (r.full) return vi ? `${fmt(r.have)} trên ${fmt(r.target)}: đủ` : `${fmt(r.have)} of ${fmt(r.target)}: full` // lang-ok
  return vi ? `${fmt(r.have)} trên ${fmt(r.target)}, còn ${fmt(r.left)}` : `${fmt(r.have)} of ${fmt(r.target)}, ${fmt(r.left)} to go` // lang-ok
}

/** Shares as quoted in a plan: halves, from the age formula. */
export const planShares = (b: Balance): [number, number, number] | null => {
  const t = b.target
  if (!t) return null
  const half = (x: number) => Math.round(x * 2) / 2
  return [half(t.safe), half(t.traditional), half(t.btc + t.large_cap + t.altcoin)]
}

/**
 * The investing step, only once the emergency fund is full (Hieu, 2026-11-01). The part furthest ahead of its age share sets the
 * size; the others are topped up to follow it, from income or spare money, in any order the user likes. Spare money is not tracked.
 */
export function splitSection(b: Balance, vi: boolean, n = 2): string | null {
  if (!b.fund.met || b.debts.priorityCount > 0) return null
  const standing = bucketStanding(b)
  const shares = planShares(b)
  if (!shares) return null
  const [sSafe, sTrad, sCrypto] = shares
  const age = b.age ?? 30
  const est = b.ageIsDefault ? (vi ? ' (ước tính theo tuổi mặc định 30)' : ' (an estimate: the default age of 30 is used)') : '' // lang-ok
  const even = sTrad === sCrypto
  const safeItems = b.items.filter(i => i.group === 'safe' && i.usd >= 0.005).map(i => `${i.label} ${fmt(i.usd)}`)
  const head = vi
    ? `${n}. **Đầu tư theo tuổi của bạn, ${age}${est}:** Safety ${sSafe}%, Traditional ${sTrad}%, Crypto ${sCrypto}%. ${even ? 'Traditional và Crypto chia đôi là mặc định của MoonSafe, không phải quy tắc chuẩn; bạn có thể giảm Crypto, ví dụ 70/30, nhưng Crypto không quá 50%.' : `Traditional ${sTrad}% và Crypto ${sCrypto}% là tỷ lệ bạn chọn.`}` // lang-ok
    : `${n}. **Investing, by your age, ${age}${est}:** Safety ${sSafe}%, Traditional ${sTrad}%, Crypto ${sCrypto}%. ${even ? 'An even Traditional / Crypto split is MoonSafe\'s default, not a standard rule; you can lower Crypto, for example 70/30, but Crypto stays at 50% or less.' : `Traditional ${sTrad}% and Crypto ${sCrypto}% is the split you chose.`}`
  // Why Safety, in plain words, before any number (Hieu, 2026-11-01: the user must understand why they need it and decide it themselves).
  const why = vi
    ? '- **Safety** là phần rủi ro thấp của tài sản (tiền gửi, trái phiếu): lời ít hơn nhưng đều, không lên xuống theo cổ phiếu hay crypto, nên khi thị trường giảm thì tổng tài sản của bạn giảm ít hơn. Nó không phải tiền dùng lúc khẩn cấp (đó là quỹ dự phòng), và tiền gửi có kỳ hạn thường bị khoá đến ngày đáo hạn.' // lang-ok
    : '- **Safety** is the low-risk part of what you own (deposits, bonds): it earns less but steadily and does not move with stocks or crypto, so when markets fall your whole picture falls less. It is not emergency money (that is the emergency fund), and a term deposit is usually locked until it matures.'
  // What already counts as Safety, and why (a term deposit or bonds count as they are; bank, cash or stablecoins only when chosen).
  const safeLine = safeItems.length
    ? (vi
      ? `- Đã là Safety: ${safeItems.join(', ')}. Khoản này để riêng và không chạy theo giá cổ phiếu hay crypto, nên nó làm đúng việc của Safety: giữ cho tổng tài sản ít dao động.` // lang-ok
      : `- Already Safety: ${safeItems.join(', ')}. It is set aside and does not follow stock or crypto prices, which is exactly Safety's job: keeping your whole picture steadier.`)
    : null
  const rule = vi
    ? '- Phần đi xa nhất so với tỷ lệ của nó làm mốc; các phần khác theo nó:' // lang-ok
    : '- The part furthest ahead of its share sets the size; the others follow it:'
  const what = { safe: vi ? 'ít biến động' : 'low-volatility', traditional: vi ? 'quỹ chỉ số như VOO, vàng' : 'index funds such as VOO, gold', crypto: vi ? 'cứ 10 đô thì khoảng 7 đô Bitcoin, còn lại bạn tự chọn; có lúc giảm một nửa' : 'about $7 of every $10 in Bitcoin, the rest your pick; it can halve on the way' } // lang-ok
  const part = (r: Standing) => `  - **${r.name}** (${what[r.key]}): ${shareLine(r, vi)}.`
  const how = vi
    ? 'Bổ sung các phần còn thiếu từ thu nhập hay tiền rảnh, theo thứ tự bạn thích. Safety để ở đâu cũng được, miễn ít biến động (tiền gửi có kỳ hạn, trái phiếu chính phủ, hoặc stablecoin hay tiền mặt bạn để riêng). Làm xong thì nói với mình (ví dụ "I keep 500 USDC as Safety") để mình ghi lại.' // lang-ok
    : 'Top up the parts still short from your income or spare money, in any order you like. Safety can sit anywhere low-volatility (a term deposit, government bonds, or stablecoins or cash you keep apart). When you have, tell me (for example "I keep 500 USDC as Safety") and I will record it.'
  // Nothing in the three parts yet: whichever they start becomes the one the others follow.
  // Nothing invested yet (Hieu, 2026-11-01): say the three shares and let them top up little by little.
  if (!standing) return [head, why, vi
    ? `- Bạn chưa có gì trong 3 phần, nên cứ bổ sung từ từ theo đúng tỷ lệ này: mỗi $100 bạn để dành được, khoảng $${sSafe} vào Safety, $${sTrad} vào Traditional, $${sCrypto} vào Crypto. Phần nào có trước thì làm mốc cho các phần còn lại.` // lang-ok
    : `- Nothing is in the three parts yet, so top them up little by little by these shares: of every $100 you put aside, about $${sSafe} to Safety, $${sTrad} to Traditional and $${sCrypto} to Crypto. Whichever part gets ahead then sets the size for the others.`, how].join('\n')
  const [safe, trad, crypto] = standing
  return [head, why, safeLine, rule, part(safe), part(trad), part(crypto), how].filter(Boolean).join('\n')
}

export function buildPlan({ p, b, cover, partial = null, vi, hasVault = true, vaultFee = 1 }: PlanInput): string | null {
  if (!b.target || b.fund.floorUsd === null || fundMissingInputs(p, b.cashflow.spending).length) return null
  if (b.debts.priorityCount > 0) return null
  const vault = b.fundUsd ?? 0
  const fundNow = vault >= b.fund.floorUsd - 0.005
  const ask = fundNow
    ? pickQuestion(bucketStanding(b) ?? [], vi)
    : !hasVault
      ? openVaultOffer(vi, vaultFee)
    : cover !== null
      ? (vi ? `Sẵn sàng bắt đầu chưa? Bước đầu là quỹ dự phòng: mình chuẩn bị một lệnh nạp **${tok(cover)}** từ ví để bạn ký nhé?` : `Ready to start? The first step is your emergency fund: shall I prepare a deposit of **${tok(cover)}** from your wallet for you to sign?`) // lang-ok
      : partial !== null ? partialOffer(vi, partial, !!p.hasWindfalls && (b.cashflow.surplus ?? 0) <= 0.5)
      : (vi ? 'Bước đầu là quỹ dự phòng. Ví chưa có USDC để nạp, nên hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The first step is your emergency fund. The wallet has no USDC to add yet, so add some and tell me.') // lang-ok
  // Airdrops and other bursts are not a job: said once, here, because the plan is built only on steady income.
  const windfall = p.hasWindfalls
    ? (vi ? `Airdrop đến theo từng đợt${p.windfallsYearly ? ` (khoảng ${fmt(p.windfallsYearly)} mỗi năm)` : ''}, nên kế hoạch chỉ tính thu nhập ổn định; khi có airdrop, cứ chia theo đúng kế hoạch này.` : `Airdrops come in bursts${p.windfallsYearly ? ` (about ${fmt(p.windfallsYearly)} a year)` : ''}, so the plan only counts your steady income; when one lands, place it by this same plan.`) // lang-ok
    : null
  const goal = p.nearGoal && b.goalUsd > 0 ? p.nearGoal : null
  const goalLine = goal
    ? (vi ? `**Mục tiêu gần: ${goal.name} ${fmt(b.goalUsd)}** để trong Safety, không đầu tư, vì bạn cần nó ${goal.years ? `trong ${goal.years} năm tới` : 'sớm'}.` : `**Near-term goal: ${goal.name} ${fmt(b.goalUsd)}** stays in Safety, not invested, because you need it ${goal.years ? `within ${goal.years} year${goal.years === 1 ? '' : 's'}` : 'soon'}.`) // lang-ok
    : null
  // Where the fund money comes from (spare money is not tracked, Hieu 2026-11-01: just say how it gets in).
  const source = !fundNow
    ? (vi ? ' Nạp bằng USDC: stablecoin nạp thẳng, tiền ngân hàng thì đổi sang USDC, hoặc từ phần dư mỗi tháng.' : ' It goes in as USDC: stablecoins straight in, bank money once changed to USDC, or what is left each month.') // lang-ok
    : ''
  // The fund is checked onchain before any investing advice (Hieu, 2026-11-01): a fund that is only declared cannot be trusted.
  const later = vi
    ? '2. **Đầu tư đến sau khi quỹ đầy.** Quỹ nằm onchain trong vault của chính bạn, nên nó có thật lúc bạn mất việc hay gặp khó; quỹ đầy rồi mình sẽ chỉ cách chia phần còn lại theo tuổi của bạn.' // lang-ok
    : '2. **Investing comes once the fund is full.** The fund sits onchain in your own vault, so it is really there if work stops or things get hard; once it is full I will show how to place the rest by your age.'
  const split = fundNow ? splitSection(b, vi) : later
  if (!split) return null
  const lines = [
    vi ? 'Kế hoạch của bạn, theo thứ tự:' : 'Here is your plan, in order:', // lang-ok
    vi // lang-ok
      ? `1. **Quỹ dự phòng: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} tháng chi tiêu, vì ${fundWhy(p, b.fund.floorMonths, true)}. Hiện có ${fmt(vault)}${fundNow ? ': đã đủ' : ''}.${source}` // lang-ok
      : `1. **Emergency fund: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} months of spending, because ${fundWhy(p, b.fund.floorMonths, false)}. You have ${fmt(vault)}${fundNow ? ': full' : ''}.${source}`,
    ...(goalLine ? [goalLine] : []),
    split,
    ...(windfall ? [windfall] : []),
    ask,
  ]
  const basis = p.planningScope === 'household' ? (vi ? 'Kế hoạch gia đình: dùng thu nhập và chi tiêu chung đã khai, mỗi khoản tính một lần. Tỷ lệ tham khảo vẫn theo tuổi của bạn.' : 'Household plan: uses the shared income and spending you declared, counted once. The reference split still uses your age.') : null // lang-ok
  return [basis, ...lines].filter(Boolean).join('\n\n')
}

/** Months to clear `balance` at a yearly `ratePct` paying `pay` a month; null when the payment does not beat the interest. */
function monthsToClear(balance: number, ratePct: number, pay: number): number | null {
  const r = ratePct / 100 / 12
  if (pay <= 0 || pay <= balance * r) return null
  return Math.ceil(r === 0 ? balance / pay : -Math.log(1 - r * balance / pay) / Math.log(1 + r))
}

/**
 * The plan when there is expensive debt (Hieu, 2026-10-31: "high-interest debt must be paid first"), in the KB priority order: a starter
 * fund of one month, then the expensive debt, then the rest of the emergency fund, then the split. Null when a debt is priority only
 * because its rate is not told (the agent asks the rate first) or when the plain plan applies.
 */
export function buildDebtPlan({ p, b, shares, vi, walletUsd, hasVault = true, vaultFee = 1 }: { p: FinancialProfile; b: Balance; shares: [number, number, number]; vi: boolean; walletUsd: number; hasVault?: boolean; vaultFee?: number }): string | null {
  const pri = b.debts.lines.filter(l => l.priority)
  if (!pri.length || b.fund.floorUsd === null || b.fund.starterUsd === null || fundMissingInputs(p, b.cashflow.spending).length) return null
  if (pri.some(l => l.debt.ratePct === null || l.usd === null)) return null
  // A debt of untold type below the priority rate may be a cheap loan, not an expensive one: the agent asks what it is.
  if (pri.some(l => l.debt.type === 'unknown' && (l.debt.ratePct ?? 0) < param('priority_debt_rate_pct'))) return null
  const vault = b.fundUsd ?? 0
  const starter = b.fund.starterUsd
  const total = pri.reduce((s, l) => s + (l.usd ?? 0), 0)
  const interest = pri.reduce((s, l) => s + (l.monthlyInterestUsd ?? 0), 0)
  const topRate = Math.max(...pri.map(l => l.debt.ratePct ?? 0))
  const each = pri.map(l => `${l.debt.name} ${fmt(l.usd ?? 0)} ${vi ? `lãi ${l.debt.ratePct}%/năm` : `at ${l.debt.ratePct}% a year`}`).join(', ') // lang-ok
  // What can go to the debt each month: its own payments plus what is left after spending (spending already includes debt payments).
  const pays = pri.reduce((s, l) => s + (l.monthlyUsd ?? 0), 0)
  const left = Math.max(0, b.cashflow.surplus ?? 0)
  const months = monthsToClear(total, topRate, pays + left)
  const pace = months === null ? '' : vi
    ? ` Trả ${fmt(pays + left)}/tháng${left > 0.5 ? ` (gồm ${fmt(left)} còn dư mỗi tháng)` : ''} thì khoảng ${months} tháng là hết.` // lang-ok
    : ` Paying ${fmt(pays + left)} a month${left > 0.5 ? ` (with the ${fmt(left)} left each month)` : ''} clears it in about ${months} months.`
  const starterGap = Math.max(0, starter - vault)
  const deposit = Math.floor(Math.min(starterGap, walletUsd))
  const ask = starterGap <= 0.005
    ? (vi ? 'Quỹ khởi đầu đã có. Mỗi lần trả bớt nợ, bạn báo số còn lại để mình cập nhật nhé.' : 'Your starter fund is in place. Each time you pay the debt down, tell me what is left and I will update it.') // lang-ok
    : !hasVault ? openVaultOffer(vi, vaultFee)
    : deposit >= 1
      ? (vi ? `Sẵn sàng bắt đầu chưa? Mình chuẩn bị một lệnh nạp **${tok(deposit)}** vào quỹ khởi đầu để bạn ký nhé?` : `Ready to start? Shall I prepare a deposit of **${tok(deposit)}** into the starter fund for you to sign?`) // lang-ok
      : (vi ? 'Bước đầu là quỹ khởi đầu. Ví chưa có USDC để nạp, nên hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The first step is the starter fund. The wallet has no USDC to add yet, so add some and tell me.') // lang-ok
  const lines = vi
    ? [ // lang-ok
      'Bạn đang có nợ lãi cao, nên kế hoạch đi theo thứ tự này:', // lang-ok
      `1. **Quỹ khởi đầu: ${fmt(starter)}** = 1 tháng chi tiêu, để một khoản bất ngờ không phải vay thêm. Hiện có ${fmt(vault)}.`, // lang-ok
      `2. **Trả nợ lãi cao: ${fmt(total)}** (${each}). Nó tốn khoảng ${fmt(interest)} tiền lãi mỗi tháng; trả nợ là khoản lời chắc chắn ${topRate}%/năm, cao hơn mức đầu tư nào hứa được.${pace}`, // lang-ok
      `3. **Hoàn tất quỹ dự phòng: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} tháng chi tiêu, vì ${fundWhy(p, b.fund.floorMonths, true)}.`, // lang-ok
      '4. Chỉ bàn cách đầu tư sau khi hết nợ lãi cao và quỹ dự phòng đã đủ.', // lang-ok
      'Đây là gợi ý, bạn quyết định.', // lang-ok
      ask,
    ]
    : [
      'You have high-interest debt, so the plan goes in this order:',
      `1. **Starter fund: ${fmt(starter)}** = 1 month of spending, so a surprise bill never means borrowing more. You have ${fmt(vault)}.`,
      `2. **Pay off the expensive debt: ${fmt(total)}** (${each}). It costs about ${fmt(interest)} a month in interest; paying it off is a sure ${topRate}% a year, more than any investment can promise.${pace}`,
      `3. **Finish the emergency fund: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} months of spending, because ${fundWhy(p, b.fund.floorMonths, false)}.`,
      '4. Investing comes only after the expensive debt is gone and the emergency fund is full.',
      'A suggestion, your call.',
      ask,
    ]
  return lines.join('\n\n')
}

/**
 * "How much is in my Safety / bank / crypto?": the totals, straight from the balance, never a bare "you need 218".
 * The emergency fund and Safety are different things and are never mixed (Hieu, 2026-10-28).
 */
export function buildStanding({ p, b, vi }: { p: FinancialProfile; b: Balance; vi: boolean }): string | null {
  if (fundMissingInputs(p, b.cashflow.spending).length) return null
  const standing = bucketStanding(b)
  const vault = b.fundUsd ?? 0
  const fundLine = b.fund.floorUsd !== null
    ? (vi ? `**Quỹ dự phòng:** ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu)${vault >= b.fund.floorUsd - 0.005 ? ', đã đủ' : `, còn ${fmt(b.fund.floorUsd - vault)}`}.` : `**Emergency fund:** ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending)${vault >= b.fund.floorUsd - 0.005 ? ', full' : `, ${fmt(b.fund.floorUsd - vault)} to go`}.`) // lang-ok
    : (vi ? `**Quỹ dự phòng:** ${fmt(vault)}; hãy cho mình biết chi tiêu hằng tháng để tính mức cần có.` : `**Emergency fund:** ${fmt(vault)}; tell me your monthly spending to work out how much it should be.`) // lang-ok
  if (!b.fund.met || b.debts.priorityCount > 0) {
    const crypto = b.byGroup.btc + b.byGroup.large_cap + b.byGroup.altcoin
    return [fundLine, `Safety: ${fmt(b.byGroup.safe)}. Traditional: ${fmt(b.byGroup.traditional)}. Crypto: ${fmt(crypto)}.`].join('\n')
  }
  const scope = p.planningScope === 'household' ? (vi ? 'Tổng quan gia đình:' : 'Household totals:') : null // lang-ok
  // Nothing in the three parts yet (spare money is not tracked, Hieu 2026-11-01): the fund, and that the parts start empty.
  if (!standing) return [scope, fundLine, vi ? 'Chưa có gì trong Safety, Traditional hay Crypto.' : 'Nothing is in Safety, Traditional or Crypto yet.'].filter(Boolean).join('\n') // lang-ok
  const [safe, trad, crypto] = standing
  // Everything in Safety by name (term deposits, bonds, money kept as Safety), so the list adds up to the total shown.
  const bank = b.items.filter(i => i.group === 'safe').map(i => `${i.label} ${fmt(i.usd)}`)
  const row = (x: typeof safe, detail?: string) => `**${x.name}:** ${shareLine(x, vi)}${detail ? ` (${detail})` : ''}.`
  const safeDetail = [bank.length ? bank.join(', ') : null, safe.goal ? (vi ? `gồm mục tiêu gần ${fmt(safe.goal)}` : `holds the near-term goal ${fmt(safe.goal)}`) : null].filter(Boolean).join('; ') // lang-ok
  return [scope, fundLine, row(safe, safeDetail || undefined), row(trad), row(crypto)].filter(Boolean).join('\n') // lang-ok
}


// ---------------------------------------------------------------------------------------------------------------------------
// The step after the plan, built here too (Hieu, 2026-10-28): the model once asked "Safety or Traditional?" right after the user
// said yes to starting with Crypto, although Safety and Traditional were full. Which parts still have room, the amounts, and the
// offer are all computed, never written by the model.
// ---------------------------------------------------------------------------------------------------------------------------

export type Part = 'safe' | 'traditional' | 'crypto'

/** The question that follows the plan: only the parts that still have room, each with "X of Y". Never a purchase. */
export function pickQuestion(standing: Standing[], vi: boolean): string {
  // Nothing in the three parts yet: the investing step already says to top up by the shares, no question needed.
  if (!standing.length) return ''
  const open = standing.filter(x => !x.full)
  const names = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} ${vi ? 'hay' : 'or'} ${xs[xs.length - 1]}` : xs[0] // lang-ok
  const tag = (x: Standing) => `${x.name} (${fmt(x.have)} ${vi ? 'trên' : 'of'} ${fmt(x.target)})` // lang-ok
  if (open.length === 0) return vi ? 'Cả ba phần đã đạt mục tiêu. Số tiền mới bạn thêm vào có thể theo cùng tỷ lệ này.' : 'All three parts are at their targets. Any new money you add can follow the same split.' // lang-ok
  if (open.length === 1) return vi ? `Chỉ còn ${tag(open[0])} chưa đủ. Bạn muốn bắt đầu với phần này không?` : `Only ${tag(open[0])} still has room. Would you like to start with it?` // lang-ok
  return vi ? `Bạn muốn lấp phần nào trước: ${names(open.map(tag))}?` : `Which part would you like to fill first: ${names(open.map(tag))}?` // lang-ok
}

const PART_WORDS: Array<[Part, RegExp]> = [
  ['safe', /(?<![\p{L}])(safe|safety|bank|savings?|an toàn|tiết kiệm)(?![\p{L}])/iu], // lang-ok
  ['traditional', /(?<![\p{L}])(traditional|stocks?|gold|index|voo|etfs?|truyền thống|vàng)(?![\p{L}])/iu], // lang-ok
  ['crypto', /(?<![\p{L}])(crypto|btc|bitcoin|coins?|cirbtc)(?![\p{L}])/iu],
]
const YES_SHORT = /^\s*(ok|okay|oke|sure|yes|yeah|yep|yup|go ahead|do it|sounds good|please|let'?s|i will|i'll|start|được|đồng ý|ừ|chốt)(?![\p{L}])/iu // lang-ok

// Naming a part is not consent when the user declines, postpones or asks about it.
// Defer these messages to the conversational path rather than bypassing the planner.
const NOT_A_CHOICE = /[?？]|(?<![\p{L}])(no|not|never|don['’]?t|do not|can['’]?t|cannot|won['’]?t|wouldn['’]?t|shouldn['’]?t|avoid|stop|cancel|later|maybe|perhaps|unsure|uncertain|undecided|wait|hold off|but|why|what(?! about)|how(?! about)|should|could|would|không|chưa|đừng|thôi|để sau|có lẽ|phân vân|tại sao|vì sao)(?![\p{L}])/iu // lang-ok

/**
 * Which part the user means when they answer the "which part first?" / "start with X?" question: a single bucket word in a short
 * message, or a plain yes to the "Only X still has room" question. Null for anything else (the model handles it).
 */
export function detectPartChoice(userText: string, prevAssistant: string): Part | null {
  const t = userText.trim()
  if (NOT_A_CHOICE.test(t)) return null
  if (!t || t.length > 70 || /\d/.test(t) || /(why|what if|what is|what'?s|explain|how much|don'?t|do not|vì sao|tại sao|nếu không)/i.test(t)) return null // lang-ok
  if (!/(fill first|start with|which part|which bucket|how about|what about|still has room|muốn lấp|bắt đầu với)/i.test(prevAssistant)) return null // lang-ok
  const hit = PART_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k)
  if (hit.length === 1) return hit[0]
  if (hit.length > 1) return null
  if (!YES_SHORT.test(t)) return null
  const only = prevAssistant.match(/Only (Safety|Traditional|Crypto)[^.?!]*still has room|Chỉ còn (Safety|Traditional|Crypto)/i) // lang-ok
  const name = (only?.[1] ?? only?.[2] ?? '').toLowerCase()
  return name === 'safety' ? 'safe' : name === 'traditional' ? 'traditional' : name === 'crypto' ? 'crypto' : null
}

/** No investing advice until the onchain fund is full (Hieu, 2026-11-01). */
export function fundFirst(b: Balance, vi: boolean): string {
  const vault = b.fundUsd ?? 0
  const floor = b.fund.floorUsd
  const where = floor !== null ? (vi ? `${fmt(vault)} trên ${fmt(floor)}` : `${fmt(vault)} of ${fmt(floor)}`) : fmt(vault) // lang-ok
  return vi
    ? `Trước hết là quỹ dự phòng: hiện có ${where}. Quỹ đầy rồi mình mới tư vấn đầu tư, vì quỹ nằm onchain trong vault của bạn nên nó có thật lúc bạn gặp khó.` // lang-ok
    : `The emergency fund comes first: you have ${where}. Investing advice starts once it is full, because the fund sits onchain in your own vault, so it is really there when things get hard.`
}

/** The answer for a chosen part: where it lives, what the user has of the target, and the one next step. */
export function buildPartAnswer({ b, vi, part, walletUsd }: { b: Balance; vi: boolean; part: Part; walletUsd: number }): string | null {
  if (!b.fund.met) return fundFirst(b, vi)
  const standing = bucketStanding(b)
  const row = standing?.find(x => x.key === part)
  if (!standing || !row) return null
  const mine = `${vi ? 'Bạn có' : 'You have'} ${fmt(row.have)} ${vi ? 'trên' : 'of'} ${fmt(row.target)}` // lang-ok
  if (row.full) {
    return vi ? `Phần ${row.name} đang đúng tỷ lệ: ${mine}. ${pickQuestion(standing, vi)}` : `${row.name} is on track: ${mine}. ${pickQuestion(standing, vi)}` // lang-ok
  }
  const toGo = `${fmt(row.left)} ${vi ? 'nữa để đủ' : 'to go'}` // lang-ok
  if (part === 'crypto') {
    if (!b.lock.open) return `${b.lock.text}`
    // In cents, not whole USDC: small plans (a target under 1 USDC) are real too (real chat 2026-10-29).
    const cents = (n: number) => Math.floor(n * 100) / 100
    const spend = cents(Math.max(0, walletUsd - 0.02))
    // cirBTC is the Bitcoin part of what is still to go; the rest is their pick, outside the app (Hieu, 2026-11-03).
    const amount = Math.min(cents(row.left * BTC_GUIDE), spend)
    if (amount < 0.01) {
      return vi ? `Crypto: ${mine}, ${toGo}. Ví này chưa có USDC để mua, hãy thêm USDC vào ví rồi nói với mình nhé.` : `Crypto: ${mine}, ${toGo}. The wallet does not have USDC to spend yet, so add some and tell me.` // lang-ok
    }
    // Spread over DCA_MONTHS equal monthly buys unless the amount is too small to split.
    const slice = Math.floor(amount / DCA_MONTHS)
    if (slice < 1) {
      return vi
        ? `cirBTC là Bitcoin bạn có thể mua và giữ ngay trong app. Crypto: ${mine}, ${toGo}. Mình chuẩn bị một lệnh mua cirBTC **${tok(amount)}** từ ví để bạn ký nhé?` // lang-ok
        : `cirBTC is Bitcoin you can buy and hold in this app. Crypto: ${mine}, ${toGo}. Shall I prepare a cirBTC buy of **${tok(amount)}** from your wallet for you to sign?`
    }
    return vi
      ? `cirBTC là Bitcoin bạn có thể mua và giữ ngay trong app. Crypto: ${mine}, ${toGo}. Không ai biết đâu là đỉnh hay đáy, nên nếu bạn không theo dõi chart thì chia nhỏ ra mua đều mỗi tháng (DCA) giúp phân tán giá mua: khoảng **${tok(slice)}** mỗi tháng trong ${DCA_MONTHS} tháng, thay vì đoán thời điểm; cách này không bảo đảm tránh lỗ. Mình chuẩn bị lần mua đầu **${tok(slice)}** để bạn ký nhé? Nếu muốn mua một lần cả **${tok(amount)}** thì cứ nói.` // lang-ok
      : `cirBTC is Bitcoin you can buy and hold in this app. Crypto: ${mine}, ${toGo}. Nobody knows where the top or the bottom is, so unless you trade by the charts, spreading it into equal monthly buys (DCA) spreads the entry prices: about **${tok(slice)}** a month for ${DCA_MONTHS} months, instead of guessing the moment; this does not prevent losses. Shall I prepare the first buy of **${tok(slice)}** for you to sign? If you prefer all **${tok(amount)}** at once, just say so.`
  }
  if (part === 'safe') {
    return vi
      ? `Safety là phần rủi ro thấp (lời ít nhưng đều, không chạy theo cổ phiếu hay crypto), giúp tổng tài sản giảm ít hơn khi thị trường xấu; nó không phải tiền khẩn cấp, việc đó là của quỹ dự phòng. ${mine}, ${toGo}. Bạn chọn để ở đâu cũng được, miễn ít biến động: tiền gửi có kỳ hạn, trái phiếu chính phủ, hoặc stablecoin hay tiền mặt để riêng. Khi đã để xong, hãy nói với mình (ví dụ "I keep 400 USDC as Safety") để mình ghi lại.` // lang-ok
      : `Safety is the low-risk part (it earns less but steadily and does not follow stocks or crypto), so your whole picture falls less in a bad market; it is not emergency money, that is the emergency fund's job. ${mine}, ${toGo}. You choose where it sits, as long as it is low-volatility: a term deposit, government bonds, or stablecoins or cash you keep apart. When you have placed it, tell me (for example "I keep 400 USDC as Safety") and I will record it.`
  }
  const tSlice = Math.floor(row.left / DCA_MONTHS)
  const spread = tSlice >= 1
    ? (vi ? ` Không ai biết đâu là đỉnh hay đáy, nên nếu bạn không theo dõi chart thì chia ra mua đều mỗi tháng (DCA), khoảng **${fmt(tSlice)}** mỗi tháng trong ${DCA_MONTHS} tháng, giúp phân tán giá mua nhưng không bảo đảm tránh lỗ.` // lang-ok
      : ` Nobody knows where the top or the bottom is, so unless you trade by the charts, equal monthly buys (DCA), about **${fmt(tSlice)}** a month for ${DCA_MONTHS} months, spread entry prices but do not prevent losses.`)
    : ''
  return vi
    ? `Traditional cũng nằm ngoài app: cổ phiếu hoặc quỹ chỉ số (ví dụ VOO) và vàng, qua nhà môi giới của bạn. ${mine}, ${toGo}.${spread} Khi đã mua, hãy nói với mình để mình ghi lại.` // lang-ok
    : `Traditional lives outside the app too: stocks or index funds (for example VOO) and gold, through your broker. ${mine}, ${toGo}.${spread} When you have bought, tell me and I will record it.`
}

/** After the user signs the emergency-fund deposit, or confirms a saved amount: where things stand, then only the parts with room. */
export function buildAfterSign({ b, vi, kind, summary, cover = null, partial = null }: { b: Balance; vi: boolean; kind: 'deposit' | 'record' | 'open'; summary?: string; cover?: number | null; partial?: number | null }): string | null {
  if (b.fund.floorUsd === null) return null
  // Nothing in the three parts yet is fine (a new saver): the investing step then says the three shares.
  const standing = bucketStanding(b) ?? []
  const vault = b.fundUsd ?? 0
  const fundFull = vault >= b.fund.floorUsd - 0.005
  // The vault was just opened: now the first deposit.
  if (kind === 'open') {
    const need = Math.max(0, b.fund.floorUsd - vault)
    const what = vi ? `Vault của bạn đã mở. Quỹ dự phòng cần ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu).` : `Your vault is open. Your emergency fund needs ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending).` // lang-ok
    if (need < 0.005) return `${what} ${pickQuestion(standing, vi)}`
    return cover !== null
      ? `${what} ${vi ? `Mình chuẩn bị một lệnh nạp **${tok(cover)}** từ ví để bạn ký nhé?` : `Shall I prepare a deposit of **${tok(cover)}** from your wallet for you to sign?`}` // lang-ok
      : partial !== null ? `${what} ${partialOffer(vi, partial)}`
      : `${what} ${vi ? 'Ví chưa có USDC để nạp, hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The wallet has no USDC to add yet, so add some and tell me.'}` // lang-ok
  }
  if (b.debts.priorityCount > 0) {
    const reserve = vi ? `Quỹ dự phòng hiện có ${fmt(vault)}.` : `Your emergency fund now holds ${fmt(vault)}.` // lang-ok
    const next = b.fund.starterMet
      ? (vi ? 'Quỹ khởi đầu một tháng đã đủ. Bước tiếp theo là trả nợ lãi cao, rồi hoàn tất quỹ dự phòng; chưa chuyển sang đầu tư.' : 'Your one-month starter fund is in place. Next comes the expensive debt, then the rest of the emergency fund; investing waits.') // lang-ok
      : (vi ? `Mốc tiếp theo là quỹ khởi đầu một tháng: ${fmt(b.fund.starterUsd ?? 0)}. Vẫn trả khoản nợ tối thiểu; phần dư bổ sung quỹ khởi đầu trước.` : `The next milestone is the one-month starter fund: ${fmt(b.fund.starterUsd ?? 0)}. Maintain minimum debt repayments; extra money builds that starter fund first.`) // lang-ok
    return `${reserve} ${next}`
  }
  if (kind === 'deposit') {
    // Not full yet: where the fund stands and that small amounts are fine. Nothing about cirBTC or buying (Hieu, 2026-10-30: after a
    // $5 deposit the model wrote "Still needed to open cirBTC buying: $3,595" when nobody had asked about Bitcoin).
    if (!fundFull) return vi
      ? `Quỹ dự phòng giờ là ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu). Những lần sau cứ nạp từ từ, lúc nào tiện là được.` // lang-ok
      : `Your emergency fund is now ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending). Keep adding a little at a time, whenever it suits you.`
    // Full: now, and only now, the investing step (Hieu, 2026-11-01).
    const split = splitSection(b, vi, 1)
    // A new saver has nothing in the three parts: no "which part" question, and no trailing blank lines.
    const pick = pickQuestion(standing, vi)
    return (vi
      ? `Quỹ dự phòng giờ là ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu): đã đủ. Giờ mình chuyển sang đầu tư.${split ? `\n\n${split}` : ''}${pick ? `\n\n${pick}` : ''}` // lang-ok
      : `Your emergency fund is now ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending): full. Now on to investing.${split ? `\n\n${split}` : ''}${pick ? `\n\n${pick}` : ''}`)
  }
  const touched = /\(Safety\)/i.test(summary ?? '') ? standing[0] : /Traditional/i.test(summary ?? '') ? standing[1] : /Crypto/i.test(summary ?? '') ? standing[2] : null
  const status = touched && fundFull ? ` ${touched.name} ${vi ? 'giờ là' : 'is now'} ${shareLine(touched, vi)}.` : '' // lang-ok
  return `${vi ? 'Đã lưu.' : 'Saved.'}${status} ${fundFull ? pickQuestion(standing, vi) : fundFirst(b, vi)}` // lang-ok
}
