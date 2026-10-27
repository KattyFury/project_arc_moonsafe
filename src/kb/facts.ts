// The user's facts for the situation patterns (src/kb/moonsafe-kb.json, `facts_reference`): computed
// from the Balance (src/lib/allocation.ts), the profile and the latest message (intents, EN + VI).
// Unknown → null, so a pattern never fires on data the user has not given (kb.ts holds()).
// Shares are fractions of liquid assets (0.3 = 30%); money is USD.
//
// Pure module with relative imports only (functions/api/chat.ts and scripts/kb-check.ts).

import { param, type Facts } from './kb'
import { holdingUsd, type Balance, type Prices } from '../lib/allocation'
import type { FinancialProfile } from '../types'

const DAY = 86_400_000

// ---- intents read from the latest message (Vietnamese lines marked lang-ok for check-lang) ----
export const RECOVER_LOSS = /(win|make|get|earn) (it|my money|that|the money|this) back|recover (my |the |from )?(loss|losses)|make up (for )?(my |the )?loss|lost (a lot|big|heavily|most|half)|gỡ (lại|lỗ|vốn)|gỡ gạc|lỗ (nặng|nhiều|sấp mặt|to)|cháy tài khoản/i // lang-ok
// "I just put 1,000 into safe" without saying where it came from (spec 10: ask, then move or add).
const ADDED_TO_SAFE = /(?<!\p{L})(put|added|moved|deposited|transferred|placed|saved)\s[^.?!\n]{0,30}\d[^.?!\n]{0,30}(into|in|to)\s+(my\s+|the\s+)?(safe|savings|bank|term deposit|flexible|simple earn)|(vừa|đã|mới)\s+(bỏ|gửi|chuyển|cho|nạp|để)[^.?!\n]{0,30}\d[^.?!\n]{0,30}(vào|sang)\s+(phần\s+|quỹ\s+)?(an toàn|safe|tiết kiệm|ngân hàng)/iu // lang-ok
const SAYS_SOURCE = /(?<!\p{L})(from|out of|new money|salary|bonus|từ|lấy từ|tiền mới|lương)(?!\p{L})/iu // lang-ok
const ALL_IN_ALT = /all[- ]?in\b[^.?!\n]{0,30}(alt|meme|small[- ]cap|shitcoin)|(alt|meme)\p{L}*[^.?!\n]{0,30}all[- ]?in|(everything|all my money) (in|into) (alt|meme)|tất tay|dồn hết[^.?!\n]{0,20}(alt|meme)|(?<!\d)(3\d|[4-9]\d|100)\s*%[^.?!\n]{0,30}(alt|meme|low[- ]?cap|small[- ]?cap|shitcoin)|(alt|meme|low[- ]?cap|small[- ]?cap|shitcoin)\p{L}*[^.?!\n]{0,30}(?<!\d)(3\d|[4-9]\d|100)\s*%/iu // lang-ok
const WHAT_TO_INVEST = /what (should|can|do) i (invest|buy)|where (should|do|can) i invest|what to invest|invest in what|nên (đầu tư|mua) (gì|vào đâu|cái gì)|đầu tư (gì|vào đâu|cái gì)/i // lang-ok
const TOTAL_SAID = /(?<!\p{L})(in total|altogether|all together|total(?:ly)?|tổng (cộng|cộng lại|tài sản|là)?|tất cả là)(?!\p{L})/iu // lang-ok
const WINDFALL = /(?<!\p{L})(airdrop|bonus|windfall|inheritance|jackpot|thưởng|trúng|thừa kế)(?!\p{L})/iu // lang-ok

/** Money amounts in a message, in USD (VND / triệu converted with the rate). */
const AMOUNT = /\$\s?(\d[\d.,]*\d|\d)\s?(k|m)?|(\d[\d.,]*\d|\d)\s?(k|m)?\s?(\$|usdc?|usdt|dollars?|đô|vnd|đ|₫|triệu|tr|million)(?!\p{L})/giu // lang-ok
export function amountsUsd(text: string, vndPerUsd: number | null): number[] {
  const out: number[] = []
  const t = text.replace(/ /g, ' ')
  for (const m of t.matchAll(AMOUNT)) {
    const tok = (m[1] ?? m[3]).replace(/,/g, '')
    // "50 million VND": the currency can follow the scale word.
    const vndAfter = /^\s*(vnd|đ|₫|đồng)(?!\p{L})/iu.test(t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 8)) // lang-ok
    const unit = vndAfter ? 'vnd' : (m[5] ?? '$').toLowerCase()
    const mult = { k: 1e3, m: 1e6 }[(m[2] ?? m[4] ?? '').toLowerCase()] ?? 1
    const scale = /^(triệu|tr|million)$/i.test(m[5] ?? '') ? 1e6 : 1 // lang-ok
    const n = Number(tok) * mult * scale
    if (!Number.isFinite(n)) continue
    if (/^(vnd|đ|₫|triệu|tr)$/.test(unit)) { if (vndPerUsd) out.push(n / vndPerUsd) } else out.push(n) // lang-ok
  }
  return out
}

export interface FactsInput {
  balance: Balance
  profile: FinancialProfile | null
  prices: Prices | null
  vndPerUsd: number | null
  /** Latest user message (intents). */
  message?: string
  /** Something was recorded this turn. */
  changed?: boolean
  now?: number
}

/** Every fact in facts_reference, plus display-only values for the pattern placeholders. */
export function computeFacts(i: FactsInput): Facts {
  const { balance: b, profile: p } = i
  const now = i.now ?? Date.now()
  const msg = i.message ?? ''
  const cf = b.cashflow
  const spending = cf.spending
  const liquid = b.liquid
  const share = (usd: number) => liquid > 0 ? usd / liquid : null
  const g = b.byGroup
  const crypto = g.btc + g.large_cap + g.altcoin
  // Off target: placed money (liquid minus idle) against the target split; idle money is handled by the suggestion.
  const placed = liquid - g.idle
  // Three buckets (framework v2): Safety, Traditional, Crypto as one (held ETH or small coins are not "off target").
  const maxGap = b.target && placed > 0
    ? Math.max(Math.abs(g.safe / placed * 100 - b.target.safe), Math.abs(g.traditional / placed * 100 - b.target.traditional),
      Math.abs(crypto / placed * 100 - (b.target.btc + b.target.large_cap + b.target.altcoin)))
    : null
  const holdings = p?.holdings ?? []
  const stale = holdings.filter(h => h.priceSource === 'self' && now - h.updatedAt > param('stale_self_declared_days') * DAY)
    .sort((x, y) => x.updatedAt - y.updatedAt)
  const flows = [...(p?.incomes ?? []), ...(p?.expenses ?? [])]
  const said = amountsUsd(msg, i.vndPerUsd)
  const windfall = WINDFALL.test(msg) && said.length ? Math.max(...said) : 0
  const irregularMax = Math.max(0, ...(p?.incomes ?? []).filter(x => x.kind === 'irregular').map(x => x.currency === 'VND' ? (i.vndPerUsd ? x.monthly / i.vndPerUsd : 0) : x.monthly))
  // "My total is 5,000" against the items listed (spec 12).
  const itemsTotal = b.items.filter(x => x.holding).reduce((s, x) => s + x.usd, 0)
  const declaredTotal = TOTAL_SAID.test(msg) && said.length === 1 ? said[0] : null
  const conflict = declaredTotal !== null && holdings.length >= 2 && itemsTotal > 0 && Math.abs(declaredTotal - itemsTotal) / itemsTotal > 0.1

  const facts: Facts = {
    age: b.age,
    age_known: p?.age !== null && p?.age !== undefined,
    age_declined: !!p?.ageDeclined && (p?.age === null || p?.age === undefined),
    income_known: cf.income !== null,
    spending_known: spending !== null,
    income_stable: p?.incomeStable ?? null,
    dependents: p?.dependents ?? null,
    sole_earner: p?.soleEarner ?? null,
    income_active: cf.income !== null ? cf.active : null,
    income_passive: cf.income !== null ? cf.passive : null,
    income_irregular: cf.income !== null ? cf.irregular : null,
    spending,
    surplus: cf.surplus,
    surplus_abs: cf.surplus !== null ? Math.abs(cf.surplus) : null,
    fund_usd: b.fundUsd,
    fund_floor_months: b.fund.floorMonths,
    fund_floor_usd: b.fund.floorUsd,
    fund_months: b.fund.months,
    fund_gap: b.fund.gap,
    starter_fund_usd: b.fund.starterUsd,
    starter_fund_met: b.fund.starterMet,
    fund_met: spending !== null ? b.fund.met : null,
    priority_debt_count: b.debts.priorityCount,
    priority_debt_total: b.debts.priorityTotal,
    priority_debt_monthly_interest: b.debts.priorityMonthlyInterest,
    crypto_margin_count: b.debts.cryptoMarginCount,
    family_noint_debt_count: b.debts.familyNoInterestCount,
    debt_total: b.debtTotal,
    debt_asked: !!p?.debtsComplete,
    liquid_total: liquid,
    net_worth: b.netWorth,
    net_worth_months: spending ? b.netWorth / spending : null,
    idle_usd: g.idle,
    share_safe: share(g.safe),
    share_traditional: share(g.traditional),
    share_btc: share(g.btc),
    share_large_cap: share(g.large_cap),
    share_altcoin: share(g.altcoin),
    share_idle: share(g.idle),
    share_crypto: share(crypto),
    target_crypto: b.target ? (b.target.btc + b.target.large_cap + b.target.altcoin) / 100 : null,
    max_gap_points: maxGap,
    passive_ratio: cf.passiveRatio,
    largest_irregular_inflow_months: spending ? Math.max(irregularMax, windfall) / spending : null,
    stale_self_declared_count: stale.length,
    stale_cashflow: flows.some(x => now - x.updatedAt > param('stale_cashflow_days') * DAY),
    missing_price_count: b.unpriced.length,
    overdue_loan_count: holdings.filter(h => h.type === 'loan_given' && h.loanStatus === 'overdue').length,
    defi_stable_count: holdings.filter(h => h.type === 'defi_stable').length,
    holdings_count: holdings.length,
    buy_lock_open: b.lock.open,
    data_conflict: conflict,
    data_changed_this_turn: !!i.changed,
    intent_recover_loss: RECOVER_LOSS.test(msg),
    intent_added_to_safe: ADDED_TO_SAFE.test(msg) && !SAYS_SOURCE.test(msg),
    intent_all_in_alt: ALL_IN_ALT.test(msg),
    intent_what_to_invest: WHAT_TO_INVEST.test(msg),
  }

  // Display-only values for placeholders ({amount}, {asset}, {item}, {value}…), never used in conditions.
  const firstStale = stale[0]
  const staleValue = firstStale ? holdingUsd(firstStale, i.prices, i.vndPerUsd) : null
  return {
    ...facts,
    amount: said.length ? said[0] : null,
    asset: b.unpriced.map(h => h.name).join(', ') || null,
    item: firstStale?.name ?? (facts.stale_cashflow ? 'monthly income and spending' : null),
    value: staleValue,
    declared_total: declaredTotal,
    items_total: conflict ? itemsTotal : null,
    dca_amount: cf.surplus !== null && cf.surplus > 0 ? cf.surplus * param('dca_share_of_surplus') : null,
  }
}

const MONEY_FACTS = new Set(['spending', 'surplus', 'surplus_abs', 'fund_usd', 'fund_floor_usd', 'fund_gap', 'starter_fund_usd', 'priority_debt_total',
  'priority_debt_monthly_interest', 'debt_total', 'liquid_total', 'net_worth', 'idle_usd', 'income_active', 'income_passive', 'income_irregular',
  'amount', 'value', 'declared_total', 'items_total', 'dca_amount'])
const SHARE_FACTS = /^(share_|target_crypto$)/

/** Facts as the model reads them: money "1,234 USDC", shares "30%", months "2.5". */
export function displayFacts(f: Facts): Facts {
  const out: Facts = {}
  for (const [k, v] of Object.entries(f)) {
    if (typeof v !== 'number') { out[k] = v; continue }
    if (MONEY_FACTS.has(k)) out[k] = `${new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).format(v)} USDC`
    else if (SHARE_FACTS.test(k)) out[k] = `${Math.round(v * 100)}%`
    else out[k] = Math.round(v * 10) / 10
  }
  return out
}
