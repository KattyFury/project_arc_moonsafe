// The first questions as a form (Hieu, 2026-10-28): "Your age: [   ]  Your salary a month: [   ]  Any other income? [yes / no]".
// What the user types here is turned into items by plain code, with no model in between, so nothing is lost or misread
// and no tokens are spent. The items go through the same confirm card as anything else (one by one, Confirm / Cancel).
//
// Pure module (relative imports only): shared by the app and scripts/kb-check.ts.

import type { Prices } from './allocation'
import { defaultRebalanceable, newId, TOP10_SYMBOLS, type ProfileOp } from './profile'
import type { AssetType, Holding } from '../types'

export type YesNo = 'yes' | 'no' | null

/** Everything the form can hold; numbers are USDC (USD) typed as text, empty = "prefer not to say". */
export interface FormValues {
  planningScope?: 'individual' | 'household' | null
  age: string
  salary: string
  otherIncome: YesNo
  passive: string
  windfalls: YesNo
  windfallsYearly: string
  spending: string
  steady: YesNo
  onlyEarner?: YesNo
  reliers: YesNo
  reliersCount: string
  goal: YesNo
  goalName: string
  goalAmount: string
  goalYears: string
  /** Stablecoins onchain, this wallet and others in one total (Hieu, 2026-10-30). */
  usdcThis: string
  usdcElsewhere: string
  bank: string
  cash: string
  btc: string
  /** Every coin other than Bitcoin (Hieu, 2026-10-29: ask Bitcoin and altcoins only). */
  coins: string
  /** All crypto in one total (Hieu, 2026-10-30: one "Crypto" field instead of Bitcoin + Altcoins). */
  crypto?: string
  gold: string
  stocks: string
  // Balance Sheet v2 (Hieu, 2026-10-31): each item by amount ($) or by quantity; a $ amount of something with a market price is turned
  // into a quantity at today's price, so its value then follows the price. Unset unit = $.
  /** Bonds, T-bills, bond and money market funds (Safety). */
  bonds?: string
  goldUnit?: 'usd' | 'oz'
  btcUnit?: 'usd' | 'coins'
  /** US stocks and ETFs: one ticker (VOO) for shares, or a $ total without one. */
  stocksTicker?: string
  stocksUnit?: 'usd' | 'shares'
  vnStocks?: string
  /** High-yield bonds (Traditional: SEC, risk close to stocks). */
  junkBonds?: string
  /** Coins other than Bitcoin: one ticker (ETH) for a quantity, or a $ total without one. */
  coinsTicker?: string
  coinsUnit?: 'usd' | 'coins'
  /** % of the money outside Safety in Crypto: '30' | '50' | '70'; null = not chosen (MoonSafe default 50). */
  cryptoSplit?: string | null
  /** Only decides whether the four fields below are shown. */
  otherAssets: YesNo
  home: string
  car: string
  lent: string
  business: string
  debt: YesNo
  /** Who it is owed to: a bank or card, or family and friends. */
  debtKind: 'bank' | 'family' | null
  debtOwed: string
  debtRate: string
  debtMonthly: string
}

export const EMPTY_FORM: FormValues = {
  planningScope: null,
  onlyEarner: null,
  age: '', salary: '', otherIncome: null, passive: '', windfalls: null, windfallsYearly: '', spending: '', steady: null, reliers: null, reliersCount: '1',
  goal: null, goalName: '', goalAmount: '', goalYears: '', usdcThis: '', usdcElsewhere: '', bank: '', cash: '', btc: '', coins: '', crypto: '', gold: '', stocks: '',
  otherAssets: null, home: '', car: '', lent: '', business: '', debt: null, debtKind: null, debtOwed: '', debtRate: '', debtMonthly: '',
}

/** A number typed by a person: "2,500", "$2500", "2.5k". null when empty or not above zero. */
export function parseAmount(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/[$,\s]/g, '').replace(/usdc?$|usdt$/, '')
  if (!t) return null
  const m = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(t)
  if (!m) return null
  const n = Number(m[1]) * ({ k: 1e3, m: 1e6 }[m[2] ?? ''] ?? 1)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A confirm item: a line of text and the operations that save it. */
export interface FormItem { text: string; ops: ProfileOp[] }

const usd = (n: number) => `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)}`

const qty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 2 : 8 }).format(n)

/** A ticker as typed: letters and digits, upper case; null when empty or not a ticker. */
export const tickerOf = (t: string | undefined): string | null => {
  const s = (t ?? '').trim().toUpperCase().replace(/^\$/, '')
  return /^[A-Z0-9.]{1,10}$/.test(s) ? s : null
}

/** Coin type by symbol (spec 1): ETH, the other top-10 coins, or an altcoin. */
const coinType = (s: string): AssetType => s === 'ETH' ? 'eth' : TOP10_SYMBOLS.has(s) ? 'top10' : 'altcoin'

/** The symbols a filled form needs a price for, to turn $ amounts into quantities (Balance Sheet v2). */
export function formPriceNeeds(v: FormValues): { gold: boolean; stocks: string[]; crypto: string[] } {
  const usdMode = (unit: string | undefined, amount: string) => (unit ?? 'usd') === 'usd' && parseAmount(amount) !== null
  const stock = tickerOf(v.stocksTicker), coin = tickerOf(v.coinsTicker)
  return {
    gold: usdMode(v.goldUnit, v.gold),
    stocks: stock && usdMode(v.stocksUnit, v.stocks) ? [stock] : [],
    crypto: [...(usdMode(v.btcUnit, v.btc) ? ['BTC'] : []), ...(coin && usdMode(v.coinsUnit, v.coins) ? [coin] : [])],
  }
}

/**
 * The items a filled form stands for, in the order they are shown. Balance Sheet v2 (Hieu, 2026-10-31): value now, not money put in.
 * Gold, Bitcoin, stocks and coins with a ticker are kept as a QUANTITY priced live: typed as a quantity, or a $ amount turned into
 * one at today's price (`prices`). Without a price (or a ticker) the $ amount is kept as typed.
 */
export function formToItems(v: FormValues, prices: Prices | null, now = Date.now()): FormItem[] {
  const items: FormItem[] = []
  const add = (text: string, ...ops: ProfileOp[]) => items.push({ text, ops })
  const holding = (type: AssetType, name: string, amount: number | null, extra: Partial<Holding> = {}) => {
    if (amount === null) return
    const h: Holding = { id: newId('h'), type, name, value: amount, currency: 'USDC', priceSource: 'self', rebalanceable: defaultRebalanceable(type), updatedAt: now, ...extra }
    add(`${name} ${usd(amount)}`, { op: 'add_holding', holding: h })
  }
  /** By quantity (`byQty`) or by $ converted at `price`; a $ amount with no price stays a declared value. */
  const priced = (type: AssetType, name: string, typed: string, byQty: boolean, unit: string, price: number | null | undefined, extra: Partial<Holding> = {}) => {
    const n = parseAmount(typed)
    if (n === null) return
    const market = (quantity: number, text: string) => add(text, { op: 'add_holding', holding: { id: newId('h'), type, name, quantity, unit, priceSource: 'market', rebalanceable: defaultRebalanceable(type), updatedAt: now, ...extra } })
    if (byQty) market(n, `${name} ${qty(n)} ${unit}`)
    else if (price && price > 0) market(n / price, `${name} ${usd(n)} (${qty(n / price)} ${unit} at ${usd(price)})`)
    else holding(type, name, n, extra)
  }

  const age = parseAmount(v.age)
  const household = v.planningScope === 'household'
  if (v.planningScope === 'individual' || v.planningScope === 'household') add(household ? 'Household plan' : 'Individual plan', { op: 'update_profile', fields: { planningScope: v.planningScope } })
  if (age !== null && age >= 10 && age <= 120) add(`Age ${Math.round(age)}`, { op: 'update_profile', fields: { age: Math.round(age) } })

  const salary = parseAmount(v.salary)
  if (salary !== null) add(`${household ? 'Combined household salary' : 'Salary'} ${usd(salary)} a month (active)`, { op: 'set_income', income: { id: newId('i'), name: household ? 'Combined household salary' : 'Salary', monthly: salary, currency: 'USDC', kind: 'active', updatedAt: now } })
  const passive = v.otherIncome === 'yes' ? parseAmount(v.passive) : null
  if (passive !== null) add(`Passive income ${usd(passive)} a month`, { op: 'set_income', income: { id: newId('i'), name: 'Passive income', monthly: passive, currency: 'USDC', kind: 'passive', updatedAt: now } })
  if (v.otherIncome === 'yes' && v.windfalls === 'yes') {
    const yearly = parseAmount(v.windfallsYearly)
    add(`Airdrops and other windfalls: not counted as monthly income${yearly !== null ? ` (about ${usd(yearly)} a year)` : ''}`, { op: 'update_profile', fields: { hasWindfalls: true, ...(yearly !== null ? { windfallsYearly: yearly } : {}) } })
  }

  const spending = parseAmount(v.spending)
  if (spending !== null) add(`Monthly spending ${usd(spending)} a month (fixed)`, { op: 'set_expense', expense: { id: newId('e'), name: 'Monthly spending', monthly: spending, currency: 'USDC', kind: 'fixed', updatedAt: now } })

  if (v.steady !== null) add(`Income ${v.steady === 'yes' ? 'steady' : 'not steady'}`, { op: 'update_profile', fields: { incomeStable: v.steady === 'yes' } })
  if (v.onlyEarner === 'yes' || v.onlyEarner === 'no') add(v.onlyEarner === 'yes' ? 'One household earner' : 'More than one household earner', { op: 'update_profile', fields: { soleEarner: v.onlyEarner === 'yes' } })
  if (v.reliers === 'no') add('Nobody relies on your income', { op: 'update_profile', fields: { dependents: 0 } })
  if (v.reliers === 'yes') {
    const n = Math.max(1, Math.round(parseAmount(v.reliersCount) ?? 1))
    add(`${n} ${n === 1 ? 'person relies' : 'people rely'} on your income`, { op: 'update_profile', fields: { dependents: n } })
  }

  if (v.goal === 'no') add('No big expense in the next 5 years', { op: 'update_profile', fields: { noNearGoal: true } })
  const goalAmount = parseAmount(v.goalAmount)
  if (v.goal === 'yes' && goalAmount !== null) {
    const years = parseAmount(v.goalYears)
    const name = v.goalName.trim() || 'Goal'
    add(`${name} ${usd(goalAmount)}${years !== null && years <= 5 ? ` in ${years} year${years === 1 ? '' : 's'}` : ''}`,
      { op: 'update_profile', fields: { nearGoal: { name, amount: goalAmount, currency: 'USDC', years: years !== null && years <= 5 ? years : null } } })
  }

  // "Stablecoin onchain" (one field since 2026-10-30) keeps where = app wallet, so the app's own deposits and buys still reduce it.
  holding('stable_wallet', 'Stablecoin onchain', parseAmount(v.usdcThis), { where: 'app wallet' })
  holding('stable_wallet', 'Stablecoins elsewhere', parseAmount(v.usdcElsewhere), { where: 'other wallets and exchanges' })
  holding('savings', 'Bank savings', parseAmount(v.bank))
  holding('cash', 'Cash', parseAmount(v.cash))
  holding('bond', 'Bonds and money market', parseAmount(v.bonds ?? ''))
  priced('btc', 'Bitcoin', v.btc, v.btcUnit === 'coins', 'BTC', prices?.usd['crypto:BTC'], { symbol: 'BTC' })
  const coin = tickerOf(v.coinsTicker)
  if (coin) priced(coinType(coin), coin, v.coins, v.coinsUnit === 'coins', coin, prices?.usd[`crypto:${coin}`], { symbol: coin })
  // A quantity needs a ticker to be priced; without one only a $ total is kept.
  else if (v.coinsUnit !== 'coins') holding('crypto', 'Other coins', parseAmount(v.coins))
  // One Crypto total (2026-10-30 form, kept for drafts saved before 2026-10-31): Crypto bucket, never called BTC (type 'crypto').
  holding('crypto', 'Crypto', parseAmount(v.crypto ?? ''))
  priced('gold_physical', 'Gold', v.gold, v.goldUnit === 'oz', 'oz', prices?.goldUsdPerOz)
  const stock = tickerOf(v.stocksTicker)
  if (stock) priced('us_stock', stock, v.stocks, v.stocksUnit === 'shares', 'shares', prices?.usd[`stock:${stock}`], { symbol: stock })
  else if (v.stocksUnit !== 'shares') holding('fund_bond', 'US stocks and ETFs', parseAmount(v.stocks))
  holding('vn_stock', 'Vietnamese stocks', parseAmount(v.vnStocks ?? ''))
  holding('junk_bond', 'High-yield bonds', parseAmount(v.junkBonds ?? ''))
  const split = v.cryptoSplit === '30' || v.cryptoSplit === '50' || v.cryptoSplit === '70' ? Number(v.cryptoSplit) : null
  if (split !== null) add(`Outside Safety: Traditional ${100 - split}%, Crypto ${split}%`, { op: 'update_profile', fields: { cryptoSplit: split } })
  if (v.otherAssets === 'yes') {
    holding('home', 'Home or land', parseAmount(v.home))
    holding('car', 'Car', parseAmount(v.car))
    holding('loan_given', 'Money lent', parseAmount(v.lent))
    holding('business_stake', 'Business', parseAmount(v.business))
  }

  if (v.debt === 'no') add('No debt', { op: 'update_profile', fields: { debtsComplete: true } })
  const owed = parseAmount(v.debtOwed)
  if (v.debt === 'yes' && owed !== null) {
    const rate = v.debtRate.trim() === '' ? null : Number(v.debtRate.replace(/[%\s]/g, ''))
    const monthly = parseAmount(v.debtMonthly)
    const family = v.debtKind === 'family'
    const ratePct = rate !== null && Number.isFinite(rate) && rate >= 0 ? rate : family ? 0 : null
    // Family money with no interest typed is interest-free; a bank debt of unknown kind stays "priority until told" (the agent asks the type).
    const type = family ? (ratePct === 0 ? 'family_no_interest' as const : 'family_interest' as const) : 'unknown' as const
    const debt = { id: newId('d'), name: family ? 'Family debt' : 'Debt', type, balance: owed, currency: 'USDC' as const, ratePct, monthlyPayment: monthly, updatedAt: now }
    add(`${debt.name} ${usd(owed)}${ratePct !== null ? ` at ${ratePct}% a year` : ''}${monthly !== null ? `, ${usd(monthly)} a month` : ''}`, { op: 'add_debt', debt }, { op: 'update_profile', fields: { debtsComplete: true } })
  }
  return items
}

/** Which sections the form shows: the keys of what is still unknown (functions/_lib/intake.ts). */
export const SECTION_KEYS = ['age', 'income', 'spending', 'stability', 'goal', 'assets', 'other', 'debt'] as const
export type SectionKey = typeof SECTION_KEYS[number]
