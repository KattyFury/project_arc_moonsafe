/**
 * The plan message, built here instead of by the model (Hieu, 2026-10-28: "the app never says WHY the emergency fund, Safety,
 * traditional investing and crypto"). Numbers come from the balance, the reasons are fixed sentences, so the same facts always
 * give the same plan, it always explains each step, and it costs no tokens.
 *
 * Only for the plain case; anything the plan has to bend around (priority debt, a wish for one asset, an unknown income stability)
 * goes to the model as before (buildPlan returns null). A near-term goal is handled here: it is kept in savings first and added to Safety.
 */

import { bucketStanding, type Balance, type Standing } from '../../src/lib/allocation'
import { appWalletHolding } from '../../src/lib/profile'
import type { FinancialProfile } from '../../src/types'

/** Monthly buys a part is spread over when the user does not trade by the charts (Hieu, 2026-10-29). */
export const DCA_MONTHS = 6

/** A value in dollars (Hieu, 2026-10-29). */
const fmt = (n: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)}`
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
    en: 'money you can reach any time (bank savings or flexible earn). It keeps a bad month, a repair or a missed payment from ever forcing you to sell your investments.',
    vi: 'tiền bạn lấy ra được bất cứ lúc nào (tiết kiệm ngân hàng hoặc earn linh hoạt). Nó giúp một tháng xấu hay một khoản sửa chữa không bao giờ buộc bạn phải bán đầu tư.', // lang-ok
  },
  traditional: {
    en: 'stocks and index funds (for example VOO) and gold. They have grown steadily over the long run.',
    vi: 'cổ phiếu, quỹ chỉ số (ví dụ VOO) và vàng. Chúng tăng đều theo thời gian dài.', // lang-ok
  },
  crypto: {
    en: 'mostly BTC, the long-term reserve asset for people who live in Web3. It can fall by about half along the way, which is why it stays at its share.',
    vi: 'chủ yếu là BTC, tài sản dự trữ dài hạn của người sống trong Web3. Nó có thể giảm khoảng một nửa trên đường đi, vì vậy chỉ giữ ở tỷ lệ này.', // lang-ok
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

/** Start the fund with what the wallet has; the wording keeps "prepare a deposit of", which a "yes" is matched on. */
export const partialOffer = (vi: boolean, amount: number) => vi
  ? `Sẵn sàng bắt đầu chưa? Ví của bạn có thể bắt đầu quỹ với **${tok(amount)}** ngay, phần còn lại thêm dần sau: mình chuẩn bị một lệnh nạp **${tok(amount)}** để bạn ký nhé?` // lang-ok
  : `Ready to start? Your wallet can start the fund with **${tok(amount)}** now and the rest can follow: shall I prepare a deposit of **${tok(amount)}** for you to sign?`

export function buildPlan({ p, b, shares, cover, partial = null, vi, hasVault = true, vaultFee = 1 }: PlanInput): string | null {
  if (!b.target || b.fund.floorUsd === null || p.incomeStable === null) return null
  if (b.debts.priorityCount > 0) return null
  // The deposit for the emergency fund comes out of the USDC the user declared for this wallet (the app lowers it when the card is
  // signed), so the plan is quoted on what is left after it: the numbers do not move once the emergency fund is paid.
  const aw = appWalletHolding(p)
  const toFund = cover !== null && aw ? Math.min(cover, aw.value ?? 0) : 0
  const standing = bucketStanding(b, toFund)
  if (!standing || (b.liquid - toFund <= 0 && b.goalUsd <= 0)) return null
  const [safe, trad, crypto] = standing
  const toDivide = Math.max(0, b.liquid - toFund - b.goalUsd)
  const [sSafe, sTrad, sCrypto] = shares
  const line = (x: typeof safe) => `${vi ? 'Bạn có' : 'You have'} ${fmt(x.have)} ${vi ? 'trên' : 'of'} ${fmt(x.target)}; ${!x.full ? `${fmt(x.left)} ${vi ? 'nữa để đủ' : 'to go'}` : vi ? 'đã đủ' : 'already full'}.` // lang-ok
  const est = b.ageIsDefault ? (vi ? ' (ước tính theo tuổi mặc định 30)' : ' (an estimate: the default age of 30 is used)') : '' // lang-ok
  const vault = b.fundUsd ?? 0
  const fundNow = vault >= b.fund.floorUsd - 0.005
  const age = b.age ?? 30
  // The overview first (Hieu, 2026-10-28): what is needed, in what order, before any single step. Safe + at-risk = 100.
  const risk = sTrad + sCrypto
  // Which parts still have room, each with its total. Never a purchase here: the buy is offered only after the user picks crypto.
  const pick = pickQuestion(standing, vi)
  const ask = fundNow
    ? pick
    : !hasVault
      ? openVaultOffer(vi, vaultFee)
    : cover !== null
      ? (vi ? `Sẵn sàng bắt đầu chưa? Bước đầu là quỹ dự phòng: mình chuẩn bị một lệnh nạp **${tok(cover)}** từ ví để bạn ký nhé?` : `Ready to start? The first step is your emergency fund: shall I prepare a deposit of **${tok(cover)}** from your wallet for you to sign?`) // lang-ok
      : partial !== null ? partialOffer(vi, partial)
      : (vi ? 'Bước đầu là quỹ dự phòng. Ví chưa có USDC để nạp, nên hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The first step is your emergency fund. The wallet has no USDC to add yet, so add some and tell me.') // lang-ok
  // Airdrops and other bursts are not a job: said once, here, because the plan is built only on steady income.
  const windfall = p.hasWindfalls
    ? (vi ? `Airdrop đến theo từng đợt${p.windfallsYearly ? ` (khoảng ${fmt(p.windfallsYearly)} mỗi năm)` : ''}, nên kế hoạch chỉ tính thu nhập ổn định; khi có airdrop, cứ chia theo đúng kế hoạch này.` : `Airdrops come in bursts${p.windfallsYearly ? ` (about ${fmt(p.windfallsYearly)} a year)` : ''}, so the plan only counts your steady income; when one lands, place it by this same plan.`) // lang-ok
    : null
  const goal = p.nearGoal && b.goalUsd > 0 ? p.nearGoal : null
  const goalLine = goal
    ? (vi ? `**Mục tiêu gần: ${goal.name} ${fmt(b.goalUsd)}** để trong Safety, không đầu tư, vì bạn cần nó ${goal.years ? `trong ${goal.years} năm tới` : 'sớm'}.` : `**Near-term goal: ${goal.name} ${fmt(b.goalUsd)}** stays in Safety, not invested, because you need it ${goal.years ? `within ${goal.years} year${goal.years === 1 ? '' : 's'}` : 'soon'}.`) // lang-ok
    : null
  const safeTarget = goal ? (vi ? `mục tiêu ${fmt(b.goalUsd)} + ${sSafe}% của phần còn lại (${fmt(safe.rest ?? 0)})` : `your ${fmt(b.goalUsd)} goal + ${sSafe}% of the rest (${fmt(safe.rest ?? 0)})`) : null // lang-ok
  // Short (Hieu, 2026-10-29: the plan was seven paragraphs): one line per step with one clause of why; the rest comes when they ask "why".
  const have = (x: typeof safe) => vi
    ? `Bạn có ${fmt(x.have)}${x.full ? ': đã đủ' : `, còn ${fmt(x.left)}`}.` // lang-ok
    : `You have ${fmt(x.have)}${x.full ? ': full' : `, ${fmt(x.left)} to go`}.`
  const lines = vi
    ? [ // lang-ok
      'Kế hoạch của bạn, theo thứ tự:', // lang-ok
      `1. **Quỹ dự phòng: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} tháng chi tiêu, vì ${fundWhy(p, b.fund.floorMonths, true)}. Hiện có ${fmt(vault)}.`, // lang-ok
      ...(goalLine ? [goalLine] : []),
      `2. Sau đó chia phần còn lại (${fmt(toDivide)}${toFund > 0 ? ', sau khi nạp quỹ' : ''}) theo tuổi của bạn, ${age}${est}:\n- **Safety ${sSafe}%${safeTarget ? ` (${safeTarget})` : ` = ${fmt(safe.target)}`}**: tiết kiệm rút được bất cứ lúc nào. ${have(safe)}\n- **Traditional ${sTrad}% = ${fmt(trad.target)}**: quỹ chỉ số như VOO và vàng. ${have(trad)}\n- **Crypto ${sCrypto}% = ${fmt(crypto.target)}**: chủ yếu Bitcoin, có lúc giảm một nửa. ${have(crypto)}`, // lang-ok
      'Traditional và Crypto chia cân bằng để không phụ thuộc vào một thị trường. Cả hai có thể cùng giảm; quỹ dự phòng và Safety giữ riêng tiền cho nhu cầu gần. Đây là gợi ý, bạn quyết định.', // lang-ok
      ...(windfall ? [windfall] : []),
      ask,
    ]
    : [
      'Here is your plan, in order:',
      `1. **Emergency fund: ${fmt(b.fund.floorUsd)}** = ${b.fund.floorMonths} months of spending, because ${fundWhy(p, b.fund.floorMonths, false)}. You have ${fmt(vault)}.`,
      ...(goalLine ? [goalLine] : []),
      `2. Then split the rest (${fmt(toDivide)}${toFund > 0 ? ', after the emergency fund' : ''}) by your age, ${age}${est}:\n- **Safety ${sSafe}%${safeTarget ? ` (${safeTarget})` : ` = ${fmt(safe.target)}`}**: savings you can reach any time. ${have(safe)}\n- **Traditional ${sTrad}% = ${fmt(trad.target)}**: index funds such as VOO, and gold. ${have(trad)}\n- **Crypto ${sCrypto}% = ${fmt(crypto.target)}**: mostly Bitcoin, which can halve on the way. ${have(crypto)}`,
      'Traditional and Crypto are kept even so the plan does not depend on one market. Both can fall together; the emergency fund and Safety keep near-term needs separate. A suggestion, your call.',
      ...(windfall ? [windfall] : []),
      ask,
    ]
  const basis = p.planningScope === 'household' ? (vi ? 'Kế hoạch gia đình: dùng thu nhập và chi tiêu chung đã khai, mỗi khoản tính một lần. Tỷ lệ tham khảo vẫn theo tuổi của bạn.' : 'Household plan: uses the shared income and spending you declared, counted once. The reference split still uses your age.') : null // lang-ok
  return [basis, ...lines].filter(Boolean).join('\n\n')
}

/**
 * "How much is in my Safety / bank / crypto?": the totals, straight from the balance, never a bare "you need 218".
 * The emergency fund and Safety are different things and are never mixed (Hieu, 2026-10-28).
 */
export function buildStanding({ p, b, vi }: { p: FinancialProfile; b: Balance; vi: boolean }): string | null {
  const standing = bucketStanding(b)
  if (!standing) return null
  const [safe, trad, crypto] = standing
  const vault = b.fundUsd ?? 0
  const fundLine = b.fund.floorUsd !== null
    ? (vi ? `**Quỹ dự phòng:** ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu)${vault >= b.fund.floorUsd - 0.005 ? ', đã đủ' : `, còn ${fmt(b.fund.floorUsd - vault)}`}.` : `**Emergency fund:** ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending)${vault >= b.fund.floorUsd - 0.005 ? ', full' : `, ${fmt(b.fund.floorUsd - vault)} to go`}.`) // lang-ok
    : (vi ? `**Quỹ dự phòng:** ${fmt(vault)}; hãy cho mình biết chi tiêu hằng tháng để tính mức cần có.` : `**Emergency fund:** ${fmt(vault)}; tell me your monthly spending to work out how much it should be.`) // lang-ok
  const bank = p.holdings.filter(h => h.value !== undefined && ['savings', 'term_deposit', 'checking'].includes(h.type)).map(h => `${h.name} ${fmt(h.value!)}`)
  const row = (x: typeof safe, detail?: string) => `**${x.name}:** ${fmt(x.have)} ${vi ? 'trên' : 'of'} ${fmt(x.target)}${!x.full ? `, ${fmt(x.left)} ${vi ? 'nữa' : 'to go'}` : vi ? ', đã đủ' : ', full'}${detail ? ` (${detail})` : ''}.` // lang-ok
  const safeDetail = [bank.length ? bank.join(', ') : null, safe.goal ? (vi ? `gồm mục tiêu ${fmt(safe.goal)} + ${fmt(safe.rest ?? 0)}` : `target = goal ${fmt(safe.goal)} + ${fmt(safe.rest ?? 0)}`) : null].filter(Boolean).join('; ') // lang-ok
  return [p.planningScope === 'household' ? (vi ? 'Tổng quan gia đình:' : 'Household totals:') : null, fundLine, row(safe, safeDetail || undefined), row(trad), row(crypto)].filter(Boolean).join('\n') // lang-ok
}


// ---------------------------------------------------------------------------------------------------------------------------
// The step after the plan, built here too (Hieu, 2026-10-28): the model once asked "Safety or Traditional?" right after the user
// said yes to starting with Crypto, although Safety and Traditional were full. Which parts still have room, the amounts, and the
// offer are all computed, never written by the model.
// ---------------------------------------------------------------------------------------------------------------------------

export type Part = 'safe' | 'traditional' | 'crypto'

/** The question that follows the plan: only the parts that still have room, each with "X of Y". Never a purchase. */
export function pickQuestion(standing: Standing[], vi: boolean): string {
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

/**
 * Which part the user means when they answer the "which part first?" / "start with X?" question: a single bucket word in a short
 * message, or a plain yes to the "Only X still has room" question. Null for anything else (the model handles it).
 */
export function detectPartChoice(userText: string, prevAssistant: string): Part | null {
  const t = userText.trim()
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

/** The answer for a chosen part: where it lives, what the user has of the target, and the one next step. */
export function buildPartAnswer({ b, vi, part, walletUsd }: { b: Balance; vi: boolean; part: Part; walletUsd: number }): string | null {
  const standing = bucketStanding(b)
  const row = standing?.find(x => x.key === part)
  if (!standing || !row) return null
  const mine = `${vi ? 'Bạn có' : 'You have'} ${fmt(row.have)} ${vi ? 'trên' : 'of'} ${fmt(row.target)}` // lang-ok
  if (row.full) {
    return vi ? `Phần ${row.name} đã đủ: ${mine}. ${pickQuestion(standing, vi)}` : `${row.name} is already full: ${mine}. ${pickQuestion(standing, vi)}` // lang-ok
  }
  const toGo = `${fmt(row.left)} ${vi ? 'nữa để đủ' : 'to go'}` // lang-ok
  if (part === 'crypto') {
    if (!b.lock.open) return `${b.lock.text}`
    // In cents, not whole USDC: small plans (a target under 1 USDC) are real too (real chat 2026-10-29).
    const cents = (n: number) => Math.floor(n * 100) / 100
    const spend = cents(Math.max(0, walletUsd - 0.02))
    const amount = Math.min(cents(row.left), spend)
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
      ? `Safety nằm ngoài app, trong tiết kiệm ngân hàng hoặc earn linh hoạt. ${mine}, ${toGo}. Khi đã chuyển tiền, hãy nói với mình (ví dụ "I put 400 in my bank") để mình ghi lại.` // lang-ok
      : `Safety lives outside the app, in bank savings or flexible earn. ${mine}, ${toGo}. When you have moved the money, tell me (for example "I put 400 in my bank") and I will record it.`
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
  const standing = bucketStanding(b)
  if (!standing || b.fund.floorUsd === null) return null
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
  if (kind === 'deposit') {
    if (!fundFull) return null
    return vi
      ? `Quỹ dự phòng giờ là ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu): đã đủ. ${pickQuestion(standing, vi)}` // lang-ok
      : `Your emergency fund is now ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending): full. ${pickQuestion(standing, vi)}`
  }
  const touched = /\(Safety\)/i.test(summary ?? '') ? standing[0] : /Traditional/i.test(summary ?? '') ? standing[1] : /Crypto/i.test(summary ?? '') ? standing[2] : null
  const status = touched ? ` ${touched.name} ${vi ? 'giờ là' : 'is now'} ${fmt(touched.have)} ${vi ? 'trên' : 'of'} ${fmt(touched.target)}${!touched.full ? `, ${fmt(touched.left)} ${vi ? 'nữa để đủ' : 'to go'}` : (vi ? ': đã đủ' : ': full')}.` : '' // lang-ok
  return `${vi ? 'Đã lưu.' : 'Saved.'}${status} ${pickQuestion(standing, vi)}` // lang-ok
}
