/**
 * The plan message, built here instead of by the model (Hieu, 2026-10-28: "the app never says WHY the emergency fund, Safety,
 * traditional investing and crypto"). Numbers come from the balance, the reasons are fixed sentences, so the same facts always
 * give the same plan, it always explains each step, and it costs no tokens.
 *
 * Only for the plain case; anything the plan has to bend around (priority debt, a near-term goal, a wish for one asset, an unknown
 * income stability) goes to the model as before (buildPlan returns null).
 */

import type { Balance } from '../../src/lib/allocation'
import { appWalletHolding } from '../../src/lib/profile'
import type { FinancialProfile } from '../../src/types'

const fmt = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

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
    en: 'stocks and index funds (for example VOO) and gold. They have grown steadily over the long run and soften the swings of crypto.',
    vi: 'cổ phiếu, quỹ chỉ số (ví dụ VOO) và vàng. Chúng tăng đều theo thời gian dài và làm dịu những cú biến động của crypto.', // lang-ok
  },
  crypto: {
    en: 'mostly BTC, the long-term reserve asset for people who live in Web3. It can fall by about half along the way, which is exactly why it is capped at its share and sits after the safer steps.',
    vi: 'chủ yếu là BTC, tài sản dự trữ dài hạn của người sống trong Web3. Nó có thể giảm khoảng một nửa trên đường đi, vì vậy chỉ giữ ở tỷ lệ này và đứng sau các bước an toàn hơn.', // lang-ok
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
  if (b.debts.priorityCount > 0 || b.goalUsd > 0) return null
  const g = b.byGroup
  // The deposit for the fund comes out of the USDC the user declared for this wallet (the app lowers it when the card is signed), so the
  // plan is quoted on what is left after it: the numbers do not move once the fund is paid.
  const aw = appWalletHolding(p)
  const toFund = cover !== null && aw ? Math.min(cover, aw.value ?? 0) : 0
  const toDivide = Math.max(0, b.liquid - toFund)
  if (toDivide <= 0) return null
  const [sSafe, sTrad, sCrypto] = shares
  const t = b.target
  const tc = t.btc + t.large_cap + t.altcoin
  const aSafe = toDivide * t.safe / 100, aTrad = toDivide * t.traditional / 100, aCrypto = toDivide * tc / 100
  const now = (v: number, target: number) => `${fmt(v)} ${vi ? 'hiện có' : 'now'}${target - v > 0.5 ? `${vi ? ', còn thiếu' : ', still to fill'} ${fmt(target - v)}` : vi ? ', đã đủ' : ', already full'}` // lang-ok
  const cryptoNow = g.btc + g.large_cap + g.altcoin
  const est = b.ageIsDefault ? (vi ? ' (ước tính theo tuổi mặc định 30)' : ' (an estimate: the default age of 30 is used)') : '' // lang-ok
  const vault = b.fundUsd ?? 0
  const fundNow = vault >= b.fund.floorUsd - 0.005
  const ask = fundNow
    ? (vi ? 'Bạn muốn lấp nhóm nào trước: Safety, Traditional hay Crypto?' : 'Which bucket would you like to fill first: Safety, Traditional or Crypto?') // lang-ok
    : cover !== null
      ? (vi ? `Sẵn sàng bắt đầu chưa? Bước đầu là quỹ dự phòng: mình chuẩn bị một lệnh nạp **${fmt(cover)}** từ ví để bạn ký nhé?` : `Ready to start? The first step is your emergency fund: shall I prepare a deposit of **${fmt(cover)}** from your wallet for you to sign?`) // lang-ok
      : (vi ? 'Bước đầu là quỹ dự phòng. Ví chưa đủ USDC để nạp, nên hãy thêm USDC vào ví rồi nói với mình nhé.' : 'The first step is your emergency fund. The wallet does not have enough USDC to add yet, so add some USDC to it and tell me.') // lang-ok
  const lines = vi
    ? [ // lang-ok
      'Đây là kế hoạch của bạn, từng bước một.', // lang-ok
      `1. **Quỹ dự phòng: ${fmt(b.fund.floorUsd)}** (${b.fund.floorMonths} tháng chi tiêu). Vì sao: ${fundWhy(p, b.fund.floorMonths, true)}. Hiện có ${fmt(vault)}.`, // lang-ok
      `Sau khi quỹ đủ, theo khung MoonSafe${est}, bạn có thể cân nhắc chia số tiền linh hoạt (${fmt(toDivide)}${toFund > 0 ? ', sau khi nạp quỹ' : ''}) như sau:`, // lang-ok
      `2. **Safety ${sSafe}% = ${fmt(aSafe)}** — ${WHY.safety.vi} ${now(g.safe, aSafe)}.`,
      `3. **Traditional ${sTrad}% = ${fmt(aTrad)}** — ${WHY.traditional.vi} ${now(g.traditional, aTrad)}.`,
      `4. **Crypto ${sCrypto}% = ${fmt(aCrypto)}** — ${WHY.crypto.vi} ${now(cryptoNow, aCrypto)}.`,
      ask,
    ]
    : [
      'Here is your plan, step by step.',
      `1. **Emergency fund: ${fmt(b.fund.floorUsd)}** (${b.fund.floorMonths} months of spending). Why: ${fundWhy(p, b.fund.floorMonths, false)}. You have ${fmt(vault)} in it.`,
      `Once it is full, by the MoonSafe framework${est}, you could consider dividing your liquid money (${fmt(toDivide)}${toFund > 0 ? ', after the fund' : ''}) like this:`,
      `2. **Safety ${sSafe}% = ${fmt(aSafe)}**: ${WHY.safety.en} ${now(g.safe, aSafe)}.`,
      `3. **Traditional ${sTrad}% = ${fmt(aTrad)}**: ${WHY.traditional.en} ${now(g.traditional, aTrad)}.`,
      `4. **Crypto ${sCrypto}% = ${fmt(aCrypto)}**: ${WHY.crypto.en} ${now(cryptoNow, aCrypto)}.`,
      ask,
    ]
  return lines.join('\n\n')
}
