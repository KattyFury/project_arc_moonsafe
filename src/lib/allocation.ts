// The user's whole picture by the MoonSafe framework (docs/SPEC-FRAMEWORK-2026-10-25.md, data in
// src/kb): every holding valued in USD, liquid assets (the base of every %: Safe + rebalanceable
// Invest + Idle) and net worth (everything, fund and lifestyle assets included, minus debt), the six
// groups against targetMix(age), the grey slice of items that cannot be rebalanced, cash flow, the
// emergency fund against its floor, each debt, the cirBTC buy lock and how to place idle money.
//
// Pure module with relative imports only: the app (AppState → Balance, Invest, the chat cards) and
// functions/api/chat.ts both call computeBalance, so the screens and the agent quote the same numbers
// and open the buy lock with the same rule.

import { fundFloorMonths, isPriorityDebt, param, targetMix, type MixKey } from '../kb/kb'
import type { Currency, Debt, FinancialProfile, Holding } from '../types'
import { BTC_SYMBOLS, categoryOf, priceKindOf, STABLECOINS, subgroupOf } from './profile'

export type Group = 'safe' | 'traditional' | 'btc' | 'large_cap' | 'altcoin' | 'idle'
export const GROUPS: Group[] = ['safe', 'traditional', 'btc', 'large_cap', 'altcoin', 'idle']
export const TARGET_GROUPS: MixKey[] = ['safe', 'traditional', 'btc', 'large_cap', 'altcoin']
export const GROUP_LABEL: Record<Group, string> = { safe: 'Safety', traditional: 'Traditional', btc: 'BTC', large_cap: 'Big caps', altcoin: 'Low caps', idle: 'Idle' }

export { STABLECOINS, BTC_SYMBOLS }

/** Live prices in USD: gold spot per troy ounce, stocks and coins keyed "stock:SPY" / "crypto:ETH". */
export interface Prices {
  goldUsdPerOz: number | null
  usd: Record<string, number>
}

/** Gold units to troy ounces. */
export const OZ_PER_LUONG = 37.5 / 31.1034768
export const GOLD_UNITS_TO_OZ: Record<string, number> = { oz: 1, g: 1 / 31.1034768, kg: 1000 / 31.1034768, luong: OZ_PER_LUONG, chi: OZ_PER_LUONG / 10 }

/** Market symbol of a holding (BTC / ETH when the type says it). */
export function symbolOf(h: Pick<Holding, 'type' | 'symbol'>): string | undefined {
  if (h.symbol) return h.symbol.toUpperCase()
  if (h.type === 'btc') return 'BTC'
  if (h.type === 'eth') return 'ETH'
  return undefined
}

/** "stock:SPY" / "crypto:ETH"; null when the holding is not priced by symbol. */
export function priceKey(h: Pick<Holding, 'type' | 'symbol'>): string | null {
  const k = priceKindOf(h.type), s = symbolOf(h)
  return (k === 'stock' || k === 'crypto') && s ? `${k}:${s}` : null
}

/** Amount in a currency → USD; null without the VND rate. */
export const toUsd = (amount: number, currency: Currency | undefined, vndPerUsd: number | null): number | null =>
  currency === 'VND' ? (vndPerUsd ? amount / vndPerUsd : null) : amount

/** Value in USD, null when its price (or the VND rate) is missing. */
export function holdingUsd(h: Holding, prices: Prices | null, vndPerUsd: number | null): number | null {
  const kind = priceKindOf(h.type)
  if (h.priceSource === 'self' || kind === 'self' || kind === 'stable' || h.quantity === undefined) {
    if (h.value === undefined) return null
    // Stablecoins are priced 1:1 whatever the symbol.
    return toUsd(h.value, kind === 'stable' && STABLECOINS.has((h.symbol ?? '').toUpperCase()) ? 'USDC' : h.currency, vndPerUsd)
  }
  if (kind === 'gold') return prices?.goldUsdPerOz ? h.quantity * prices.goldUsdPerOz : null
  const s = symbolOf(h)
  if (s && STABLECOINS.has(s)) return h.quantity
  const key = priceKey(h)
  const p = key ? prices?.usd[key] : undefined
  return p ? h.quantity * p : null
}

/** Group of a holding on the chart; null = outside the % base (grey, lifestyle, fund). */
export function groupOf(h: Holding): Group | null {
  const cat = categoryOf(h)
  if (!h.rebalanceable) return null
  if (cat === 'safe' || cat === 'idle') return cat
  if (cat !== 'invest') return null
  const sg = subgroupOf(h)
  return sg === 'traditional' || sg === 'btc' || sg === 'large_cap' || sg === 'altcoin' ? sg : null
}

export interface Item {
  label: string
  usd: number
  group: Group | null
  /** grey = counted in net worth but not rebalanceable; lifestyle = home, car; fund = the vault. */
  place: 'base' | 'grey' | 'lifestyle' | 'fund'
  holding?: Holding
}

export interface DebtLine { debt: Debt; usd: number | null; monthlyUsd: number | null; priority: boolean; monthlyInterestUsd: number | null }

/** Priority debt (spec 5.2). Not told yet: a debt of unknown type or rate counts as priority, so the lock never opens by mistake. */
export function debtIsPriority(d: Debt): boolean {
  if (d.ratePct === 0) return false
  if (d.type === 'unknown' || d.ratePct === null) return d.type !== 'family_no_interest'
  return isPriorityDebt({ type: d.type, rate_pct: d.ratePct })
}

export interface Balance {
  items: Item[]
  /** Holdings that could not be valued (no price yet): left out of every total. */
  unpriced: Holding[]
  byGroup: Record<Group, number>
  /** Base of every %: Safe + rebalanceable Invest + Idle. */
  liquid: number
  grey: number
  lifestyle: number
  fundUsd: number | null
  assets: number
  debtTotal: number
  netWorth: number
  /** Age in the formula: the user's, else 30 when they declined; null = not known yet. */
  age: number | null
  ageIsDefault: boolean
  target: Record<MixKey, number> | null
  /** True when the user told the agent about anything held outside the app. */
  declared: boolean
  /** USDC seen in the connected wallet, read onchain. NOT part of liquid, assets or net worth; only declared holdings are. */
  walletSeen: number | null
  cashflow: {
    active: number; passive: number; irregular: number; income: number | null
    fixed: number; variable: number; debtPayments: number
    /** Fixed + variable + debt payments; null until a spending line is known. */
    spending: number | null
    surplus: number | null
    /** Passive income / spending; ≥ 1 is financial freedom. */
    passiveRatio: number | null
  }
  fund: {
    floorMonths: number
    floorUsd: number | null
    months: number | null
    gap: number | null
    starterUsd: number | null
    starterMet: boolean | null
    met: boolean
  }
  debts: {
    lines: DebtLine[]
    monthly: number
    priorityCount: number
    priorityTotal: number
    priorityMonthlyInterest: number
    cryptoMarginCount: number
    familyNoInterestCount: number
  }
  lock: {
    open: boolean
    /** What is still missing, each with its amount when there is one. */
    missing: string[]
    /** One sentence for the Invest screen and the agent (spec 5.3). */
    text: string
  }
  /**
   * How to place idle money (spec 5.4), keeping 1 month of spending: starter fund, priority debt, the rest of the fund, then the
   * three parts by what each still needs (toGoal is always 0 since Balance Sheet v2). null until the spending and an age (or the
   * declined default) are known, or with no idle money.
   */
  suggest: { idle: number; keep: number; toFund: number; toDebt: number; toGoal: number; to: Record<MixKey, number> } | null
  /** A big expense within 5 years, in USD: the agent says to keep it in savings; not taken out of any target (Balance Sheet v2). */
  goalUsd: number
}

export interface BalanceInput {
  profile: FinancialProfile | null
  walletUsd: number | null
  vaultUsd: number | null
  cirBtcUsd: number | null
  prices: Prices | null
  vndPerUsd: number | null
}

const sumBy = <T>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0)

export function computeBalance(input: BalanceInput): Balance {
  const p = input.profile
  const rate = input.vndPerUsd
  const items: Item[] = []
  const unpriced: Holding[] = []
  // The balance SEEN in the connected wallet is not part of the total: people use several wallets, so only what the user
  // declares counts (Hieu, 2026-10-28). The agent reads it to know there is money, and to cap what a card can move.
  // cirBTC is read onchain and valued at the market price (Balance Sheet v2, 2026-10-30).
  if (input.cirBtcUsd !== null && input.cirBtcUsd > 0) items.push({ label: 'cirBTC', usd: input.cirBtcUsd, group: 'btc', place: 'base' })
  if (input.vaultUsd !== null && input.vaultUsd > 0) items.push({ label: 'Emergency fund', usd: input.vaultUsd, group: null, place: 'fund' })
  for (const h of p?.holdings ?? []) {
    const usd = holdingUsd(h, input.prices, rate)
    if (usd === null) { unpriced.push(h); continue }
    const group = groupOf(h)
    const cat = categoryOf(h)
    items.push({ label: h.name, usd, group, place: group ? 'base' : cat === 'lifestyle' ? 'lifestyle' : cat === 'fund' ? 'fund' : 'grey', holding: h })
  }
  const byGroup = Object.fromEntries(GROUPS.map(g => [g, sumBy(items.filter(i => i.group === g), i => i.usd)])) as Record<Group, number>
  const liquid = sumBy(items.filter(i => i.place === 'base'), i => i.usd)
  const grey = sumBy(items.filter(i => i.place === 'grey'), i => i.usd)
  const lifestyle = sumBy(items.filter(i => i.place === 'lifestyle'), i => i.usd)
  const assets = sumBy(items, i => i.usd)

  // Debts.
  const lines: DebtLine[] = (p?.debts ?? []).map(d => {
    const usd = toUsd(d.balance, d.currency, rate)
    return {
      debt: d, usd, priority: debtIsPriority(d),
      monthlyUsd: d.monthlyPayment === null ? null : toUsd(d.monthlyPayment, d.currency, rate),
      monthlyInterestUsd: usd !== null && d.ratePct !== null ? usd * d.ratePct / 100 / 12 : null,
    }
  })
  const debtTotal = sumBy(lines, l => l.usd ?? 0)
  const pri = lines.filter(l => l.priority)
  const debts: Balance['debts'] = {
    lines,
    monthly: sumBy(lines, l => l.monthlyUsd ?? 0),
    priorityCount: pri.length,
    priorityTotal: sumBy(pri, l => l.usd ?? 0),
    priorityMonthlyInterest: sumBy(pri, l => l.monthlyInterestUsd ?? 0),
    cryptoMarginCount: lines.filter(l => l.debt.type === 'crypto_margin').length,
    familyNoInterestCount: lines.filter(l => l.debt.type === 'family_no_interest' || (l.debt.lender && l.debt.ratePct === 0)).length,
  }

  // Cash flow (spec 6). Debt payments count as fixed spending.
  const flow = (kind: string) => sumBy((p?.incomes ?? []).filter(i => i.kind === kind), i => toUsd(i.monthly, i.currency, rate) ?? 0)
  const active = flow('active'), passive = flow('passive'), irregular = flow('irregular')
  const exp = (kind: string) => sumBy((p?.expenses ?? []).filter(e => e.kind === kind), e => toUsd(e.monthly, e.currency, rate) ?? 0)
  const fixed = exp('fixed') + debts.monthly, variable = exp('variable')
  const spending = p?.expenses.length ? fixed + variable : null
  const income = p?.incomes.length ? active + passive + irregular : null
  const cashflow: Balance['cashflow'] = {
    active, passive, irregular, income, fixed, variable, debtPayments: debts.monthly, spending,
    surplus: income !== null && spending !== null ? income - spending : null,
    passiveRatio: spending ? passive / spending : null,
  }

  // Emergency fund against its floor (spec 5.1). Unknown dependents count as none.
  const floorMonths = fundFloorMonths({ income_stable: p?.incomeStable ?? null, dependents: p?.dependents ?? 0, sole_earner: p?.soleEarner ?? false })
  const vault = input.vaultUsd
  const floorUsd = spending !== null ? spending * floorMonths : null
  const starterUsd = spending !== null ? spending * param('starter_fund_months') : null
  const fund: Balance['fund'] = {
    floorMonths, floorUsd,
    months: spending && vault !== null ? vault / spending : null,
    gap: floorUsd !== null && vault !== null ? Math.max(0, floorUsd - vault) : null,
    starterUsd,
    starterMet: starterUsd !== null && vault !== null ? vault >= starterUsd : null,
    met: floorUsd !== null && floorUsd > 0 && vault !== null && vault >= floorUsd - 0.005,
  }

  // Buy lock (spec 5.3): no priority debt and the fund at its floor. The floor needs the spending and
  // the income stability; "no debt" needs the user's answer to the last debt question.
  const usd = (n: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)}`
  const missing: string[] = []
  if (spending === null) missing.push('tell the agent your monthly spending')
  if (p?.incomeStable === null || p?.incomeStable === undefined) missing.push('say whether your income is stable')
  if (!p?.debtsComplete && !pri.length) missing.push('say whether you have any debt')
  // A debt that is priority only because its type or rate is not told: the missing step is telling it,
  // not paying it off ("pay off the 20,000 loan from Mom" for an interest-free family loan, real chat 2026-10-26).
  const untold = pri.filter(l => l.debt.type === 'unknown' || l.debt.ratePct === null)
  const known = pri.filter(l => !untold.includes(l))
  if (untold.length) missing.push(`say whether ${untold.map(l => `"${l.debt.name}"`).join(' and ')} charges interest, and how much a year`)
  if (known.length) missing.push(`pay off ${usd(sumBy(known, l => l.usd ?? 0))} of priority debt`)
  if (fund.gap !== null && fund.gap > 0.005) missing.push(`add ${usd(fund.gap)} to the emergency fund (${floorMonths} months of spending)`)
  if (spending !== null && vault === null) missing.push('load your fund balance')
  const open = missing.length === 0 && fund.met
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}` : missing[0] ?? ''
  const lock: Balance['lock'] = { open, missing, text: open ? 'cirBTC buying is open.' : `To open cirBTC buying: ${list}.` }

  // Shares and targets.
  const goalUsd = p?.nearGoal ? toUsd(p.nearGoal.amount, p.nearGoal.currency, rate) ?? 0 : 0
  const age = p?.age ?? (p?.ageDeclined ? param('default_age') : null)
  const target = age !== null ? targetMix(age) : null

  // Idle money (spec 5.4): keep 1 month of spending, then the starter fund, priority debt and the rest of the fund; what is left
  // goes to the three parts by what each still needs (bucketStanding, Balance Sheet v2), then by the split.
  let suggest: Balance['suggest'] = null
  if (target && spending !== null && byGroup.idle > 0) {
    const keep = Math.min(byGroup.idle, spending * param('idle_keep_months'))
    let left = byGroup.idle - keep
    const take = (want: number) => { const t = Math.max(0, Math.min(left, want)); left -= t; return t }
    const vaultNow = vault ?? 0
    const toStarter = take((starterUsd ?? 0) - vaultNow)
    const toDebt = take(debts.priorityTotal)
    const toFund = toStarter + take((floorUsd ?? 0) - vaultNow - toStarter)
    const placed = placeNew(standingOf(byGroup, target), left)
    // Crypto is one part: new money goes to BTC.
    const to = { safe: placed.safe, traditional: placed.traditional, btc: placed.crypto, large_cap: 0, altcoin: 0 }
    suggest = { idle: byGroup.idle, keep, toFund, toDebt, toGoal: 0, to }
  }

  return {
    items, unpriced, byGroup, liquid, grey, lifestyle, fundUsd: vault, assets, debtTotal, netWorth: assets - debtTotal,
    age, ageIsDefault: p?.age === null && !!p?.ageDeclined, target, declared: (p?.holdings.length ?? 0) > 0, walletSeen: input.walletUsd,
    cashflow, fund, debts, lock, suggest, goalUsd,
  }
}

/**
 * One of the three parts (Balance Sheet v2, docs/SPEC-BALANCE-SHEET-v2-2026-10-30.md). There is no total of the user's money: the part
 * that is furthest ahead of its share (the anchor) sets the implied total, and the others are measured against it.
 */
export interface Standing {
  key: 'safe' | 'traditional' | 'crypto'
  name: 'Safety' | 'Traditional' | 'Crypto'
  /** Target share by age, in %. */
  share: number
  /** What they hold in this part now, at today's prices. */
  have: number
  /** Share of the implied total now, in %. */
  now: number
  /** Implied total × share. */
  target: number
  /** target - have, never below 0: the new money that brings this part to its share without selling anything. */
  left: number
  /** anchor = the part that sets the total; under = below its share by more than the 5/25 band; else on_track. */
  status: 'anchor' | 'on_track' | 'under'
  /** status !== 'under'. Nothing held anywhere = every part under. */
  full: boolean
}

/** 5/25 band (Swedroe): a part is under when its share is lower than the target by more than 5 points or 25% of the target, whichever is smaller. */
export const bandPts = (share: number) => Math.min(5, share * 0.25)

function standingOf(g: Record<Group, number>, t: Record<MixKey, number>): Standing[] {
  const parts: Array<[Standing['key'], Standing['name'], number, number]> = [
    ['safe', 'Safety', t.safe, g.safe],
    ['traditional', 'Traditional', t.traditional, g.traditional],
    ['crypto', 'Crypto', t.btc + t.large_cap + t.altcoin, g.btc + g.large_cap + g.altcoin],
  ]
  const ratio = (p: typeof parts[number]) => p[2] > 0 ? p[3] / p[2] : 0
  const anchor = parts.reduce((a, p) => ratio(p) > ratio(a) ? p : a, parts[0])
  const total = ratio(anchor) * 100
  return parts.map(p => {
    const [key, name, share, have] = p
    const target = total * share / 100
    const now = total > 0 ? have / total * 100 : 0
    const status = total <= 0 ? 'under' : p === anchor ? 'anchor' : share - now > bandPts(share) + 1e-9 ? 'under' : 'on_track'
    return { key, name, share, have, now, target, left: Math.max(0, target - have), status, full: status !== 'under' }
  })
}

/** Safety, Traditional and Crypto measured against the anchor. Money not placed yet (Idle) is not in any part: it is what fills them. */
export function bucketStanding(b: Balance): Standing[] | null {
  return b.target ? standingOf(b.byGroup, b.target) : null
}

/**
 * New money split across the parts: first what each still needs (in proportion when it is not enough), then anything beyond that
 * by the target shares. Never takes money out of a part.
 */
export function placeNew(st: Standing[], money: number): Record<Standing['key'], number> {
  const out = { safe: 0, traditional: 0, crypto: 0 }
  if (!(money > 0)) return out
  const need = st.reduce((s, x) => s + x.left, 0)
  const k = need > 0 ? Math.min(1, money / need) : 0
  const rest = money - need * k
  const shares = st.reduce((s, x) => s + x.share, 0) || 1
  for (const x of st) out[x.key] = x.left * k + rest * x.share / shares
  return out
}

/** Share of liquid assets in %, 0 without any. */
export const shareOfLiquid = (b: Balance, usd: number) => b.liquid > 0 ? usd / b.liquid * 100 : 0
/** Share of net worth in %, null when net worth is not positive. */
export const shareOfNetWorth = (b: Balance, usd: number) => b.netWorth > 0 ? usd / b.netWorth * 100 : null
