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

const fmt = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

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
}

export function buildPlan({ p, b, shares, cover, vi }: PlanInput): string | null {
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
  const line = (x: typeof safe) => `${vi ? 'Bạn có' : 'You have'} ${fmt(x.have)} ${vi ? 'trên' : 'of'} ${fmt(x.target)}; ${x.left > 0.5 ? `${fmt(x.left)} ${vi ? 'nữa để đủ' : 'to go'}` : vi ? 'đã đủ' : 'already full'}.` // lang-ok
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
    : cover !== null
      ? (vi ? `Sẵn sàng bắt đầu chưa? Bước đầu là quỹ dự phòng: mình chuẩn bị một lệnh nạp **${fmt(cover)}** từ ví để bạn ký nhé?` : `Ready to start? The first step is your emergency fund: shall I prepare a deposit of **${fmt(cover)}** from your wallet for you to sign?`) // lang-ok
      : (vi ? 'Bước đầu là quỹ dự phòng. Ví chưa đủ USDC để nạp, nên hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The first step is your emergency fund. The wallet does not have enough USDC to add yet, so add some USDC to it and tell me.') // lang-ok
  // Airdrops and other bursts are not a job: said once, here, because the plan is built only on steady income.
  const windfall = p.hasWindfalls
    ? (vi ? `Về airdrop: chúng đến theo từng đợt và không thể trông cậy, nên không phải một nghề ổn định${p.windfallsYearly ? ` (bạn nói khoảng ${fmt(p.windfallsYearly)} mỗi năm)` : ''}. Kế hoạch này chỉ dựa trên thu nhập ổn định của bạn; khi nhận một khoản airdrop, hãy coi đó là tiền thêm để đặt vào đúng kế hoạch này.` : `About airdrops: they arrive in bursts and cannot be counted on, so they are not a stable job${p.windfallsYearly ? ` (you said about ${fmt(p.windfallsYearly)} a year)` : ''}. This plan is built on your steady income only; when an airdrop lands, treat it as extra money to place by this same plan.`) // lang-ok
    : null
  const goal = p.nearGoal && b.goalUsd > 0 ? p.nearGoal : null
  const goalLine = goal
    ? (vi ? `**Mục tiêu gần: ${goal.name} ${fmt(b.goalUsd)}** nằm trong phần Safety (tiết kiệm), không đem đi đầu tư${goal.years ? `, vì bạn cần nó trong ${goal.years} năm tới` : ', vì bạn cần nó sớm'} và thị trường có thể giảm đúng lúc đó. Khoản này cộng vào mục tiêu Safety bên dưới.` : `**Near-term goal: ${goal.name} ${fmt(b.goalUsd)}** stays in Safety (savings), not invested${goal.years ? `, because you need it within ${goal.years} year${goal.years === 1 ? '' : 's'}` : ', because you need it soon'} and markets can drop right before. It is added to the Safety target below.`) // lang-ok
    : null
  const safeTarget = goal ? (vi ? `mục tiêu ${fmt(b.goalUsd)} + ${sSafe}% của phần còn lại (${fmt(safe.rest ?? 0)})` : `your ${fmt(b.goalUsd)} goal + ${sSafe}% of the rest (${fmt(safe.rest ?? 0)})`) : null // lang-ok
  const lines = vi
    ? [ // lang-ok
      `Để đầu tư đúng cách, bạn cần ba việc theo thứ tự: trước hết là **quỹ dự phòng**; sau đó chia số tiền linh hoạt còn lại thành phần **an toàn ${sSafe}%** và phần **chấp nhận rủi ro ${risk}%** (phần an toàn bằng tuổi của bạn, ${age}${est ? ', ước tính' : ''}, vì bạn càng trẻ càng có thời gian gánh rủi ro); và trong phần rủi ro đó, chia cân bằng **Traditional ${sTrad}%** và **Crypto ${sCrypto}%**: crypto sập thì Traditional đỡ, cổ phiếu và vàng giảm thì crypto đỡ, cả hai cùng giảm thì vẫn còn quỹ dự phòng và phần an toàn. Đây là gợi ý khách quan, không nghiêng về bên nào.`, // lang-ok
      `1. **Quỹ dự phòng: ${fmt(b.fund.floorUsd)}** (${b.fund.floorMonths} tháng chi tiêu). Vì sao ${b.fund.floorMonths} tháng: ${fundWhy(p, b.fund.floorMonths, true)}. ${SCALE.vi} Hiện có ${fmt(vault)}.`, // lang-ok
      ...(goalLine ? [goalLine] : []),
      `Sau khi quỹ đủ, bạn có thể cân nhắc chia số tiền linh hoạt (${fmt(toDivide)}${toFund > 0 ? ', sau khi nạp quỹ' : ''}${goal ? ', chưa tính mục tiêu gần' : ''}) như sau:`, // lang-ok
      `2. **Safety ${sSafe}%${safeTarget ? ` (${safeTarget})` : ` = ${fmt(safe.target)}`}** — ${WHY.safety.vi} ${line(safe)}`,
      `3. **Traditional ${sTrad}% = ${fmt(trad.target)}** — ${WHY.traditional.vi} ${line(trad)}`,
      `4. **Crypto ${sCrypto}% = ${fmt(crypto.target)}** — ${WHY.crypto.vi} ${line(crypto)}`,
      ...(windfall ? [windfall] : []),
      ask,
    ]
    : [
      `To invest the right way you need three things, in this order: first an **emergency fund**; then your other liquid money split into a **safe part of ${sSafe}%** and a part that **takes risk, ${risk}%** (the safe share equals your age, ${age}${est ? ', an estimate' : ''}, because the younger you are the more time you have to ride out risk); and inside the risky part, a balanced **Traditional ${sTrad}%** and **Crypto ${sCrypto}%**: if crypto crashes, Traditional carries you; if stocks and gold fall, crypto can; if both fall, your emergency fund and Safety still stand. This is an objective suggestion, not a bet on either side.`,
      `1. **Emergency fund: ${fmt(b.fund.floorUsd)}** (${b.fund.floorMonths} months of spending). Why ${b.fund.floorMonths} months: ${fundWhy(p, b.fund.floorMonths, false)}. ${SCALE.en} You have ${fmt(vault)} in it.`,
      ...(goalLine ? [goalLine] : []),
      `Once it is full, you could consider dividing your liquid money (${fmt(toDivide)}${toFund > 0 ? ', after the emergency fund' : ''}${goal ? ', not counting the goal' : ''}) like this:`,
      `2. **Safety ${sSafe}%${safeTarget ? ` (${safeTarget})` : ` = ${fmt(safe.target)}`}**: ${WHY.safety.en} ${line(safe)}`,
      `3. **Traditional ${sTrad}% = ${fmt(trad.target)}**: ${WHY.traditional.en} ${line(trad)}`,
      `4. **Crypto ${sCrypto}% = ${fmt(crypto.target)}**: ${WHY.crypto.en} ${line(crypto)}`,
      ...(windfall ? [windfall] : []),
      ask,
    ]
  return lines.join('\n\n')
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
  const row = (x: typeof safe, detail?: string) => `**${x.name}:** ${fmt(x.have)} ${vi ? 'trên' : 'of'} ${fmt(x.target)}${x.left > 0.5 ? `, ${fmt(x.left)} ${vi ? 'nữa' : 'to go'}` : vi ? ', đã đủ' : ', full'}${detail ? ` (${detail})` : ''}.` // lang-ok
  const safeDetail = [bank.length ? bank.join(', ') : null, safe.goal ? (vi ? `gồm mục tiêu ${fmt(safe.goal)} + ${fmt(safe.rest ?? 0)}` : `target = goal ${fmt(safe.goal)} + ${fmt(safe.rest ?? 0)}`) : null].filter(Boolean).join('; ') // lang-ok
  return [fundLine, row(safe, safeDetail || undefined), row(trad), row(crypto)].join('\n')
}


// ---------------------------------------------------------------------------------------------------------------------------
// The step after the plan, built here too (Hieu, 2026-10-28): the model once asked "Safety or Traditional?" right after the user
// said yes to starting with Crypto, although Safety and Traditional were full. Which parts still have room, the amounts, and the
// offer are all computed, never written by the model.
// ---------------------------------------------------------------------------------------------------------------------------

export type Part = 'safe' | 'traditional' | 'crypto'

/** The question that follows the plan: only the parts that still have room, each with "X of Y". Never a purchase. */
export function pickQuestion(standing: Standing[], vi: boolean): string {
  const open = standing.filter(x => x.left > 0.5)
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
  if (row.left <= 0.5) {
    return vi ? `Phần ${row.name} đã đủ: ${mine}. ${pickQuestion(standing, vi)}` : `${row.name} is already full: ${mine}. ${pickQuestion(standing, vi)}` // lang-ok
  }
  const toGo = `${fmt(row.left)} ${vi ? 'nữa để đủ' : 'to go'}` // lang-ok
  if (part === 'crypto') {
    if (!b.lock.open) return `${b.lock.text}`
    const spend = Math.floor(Math.max(0, walletUsd - 0.02))
    const amount = Math.min(Math.floor(row.left), spend)
    if (amount < 1) {
      return vi ? `Crypto: ${mine}, ${toGo}. Ví này chưa có USDC để mua, hãy thêm USDC vào ví rồi nói với mình nhé.` : `Crypto: ${mine}, ${toGo}. The wallet does not have USDC to spend yet, so add some and tell me.` // lang-ok
    }
    return vi
      ? `cirBTC là Bitcoin bạn có thể mua và giữ ngay trong app. Crypto: ${mine}, ${toGo}. Mình chuẩn bị một lệnh mua cirBTC **${fmt(amount)}** từ ví để bạn ký nhé?` // lang-ok
      : `cirBTC is Bitcoin you can buy and hold in this app. Crypto: ${mine}, ${toGo}. Shall I prepare a cirBTC buy of **${fmt(amount)}** from your wallet for you to sign?`
  }
  if (part === 'safe') {
    return vi
      ? `Safety nằm ngoài app, trong tiết kiệm ngân hàng hoặc earn linh hoạt. ${mine}, ${toGo}. Khi đã chuyển tiền, hãy nói với mình (ví dụ "I put 400 in my bank") để mình ghi lại.` // lang-ok
      : `Safety lives outside the app, in bank savings or flexible earn. ${mine}, ${toGo}. When you have moved the money, tell me (for example "I put 400 in my bank") and I will record it.`
  }
  return vi
    ? `Traditional cũng nằm ngoài app: cổ phiếu hoặc quỹ chỉ số (ví dụ VOO) và vàng, qua nhà môi giới của bạn. ${mine}, ${toGo}. Khi đã mua, hãy nói với mình để mình ghi lại.` // lang-ok
    : `Traditional lives outside the app too: stocks or index funds (for example VOO) and gold, through your broker. ${mine}, ${toGo}. When you have bought, tell me and I will record it.`
}

/** After the user signs the emergency-fund deposit, or confirms a saved amount: where things stand, then only the parts with room. */
export function buildAfterSign({ b, vi, kind, summary }: { b: Balance; vi: boolean; kind: 'deposit' | 'record'; summary?: string }): string | null {
  const standing = bucketStanding(b)
  if (!standing || b.fund.floorUsd === null) return null
  const vault = b.fundUsd ?? 0
  const fundFull = vault >= b.fund.floorUsd - 0.005
  if (kind === 'deposit') {
    if (!fundFull) return null
    return vi
      ? `Quỹ dự phòng giờ là ${fmt(vault)} trên ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} tháng chi tiêu): đã đủ. ${pickQuestion(standing, vi)}` // lang-ok
      : `Your emergency fund is now ${fmt(vault)} of ${fmt(b.fund.floorUsd)} (${b.fund.floorMonths} months of spending): full. ${pickQuestion(standing, vi)}`
  }
  const touched = /\(Safety\)/i.test(summary ?? '') ? standing[0] : /Traditional/i.test(summary ?? '') ? standing[1] : /Crypto/i.test(summary ?? '') ? standing[2] : null
  const status = touched ? ` ${touched.name} ${vi ? 'giờ là' : 'is now'} ${fmt(touched.have)} ${vi ? 'trên' : 'of'} ${fmt(touched.target)}${touched.left > 0.5 ? `, ${fmt(touched.left)} ${vi ? 'nữa để đủ' : 'to go'}` : (vi ? ': đã đủ' : ': full')}.` : '' // lang-ok
  return `${vi ? 'Đã lưu.' : 'Saved.'}${status} ${pickQuestion(standing, vi)}` // lang-ok
}
