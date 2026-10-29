// The first questions as a form (Hieu, 2026-10-28): "Your age: [   ]  Your salary a month: [   ]  Any other income? [yes / no]".
// What the user types here is turned into items by plain code, with no model in between, so nothing is lost or misread
// and no tokens are spent. The items go through the same confirm card as anything else (one by one, Confirm / Cancel).
//
// Pure module (relative imports only): shared by the app and scripts/kb-check.ts.

import type { Prices } from './allocation'
import { defaultRebalanceable, newId, type ProfileOp } from './profile'
import type { AssetType, Holding } from '../types'

export type YesNo = 'yes' | 'no' | null

/** Everything the form can hold; numbers are USDC (USD) typed as text, empty = "prefer not to say". */
export interface FormValues {
  age: string
  salary: string
  otherIncome: YesNo
  passive: string
  windfalls: YesNo
  windfallsYearly: string
  spending: string
  steady: YesNo
  reliers: YesNo
  reliersCount: string
  goal: YesNo
  goalName: string
  goalAmount: string
  goalYears: string
  usdcThis: string
  usdcElsewhere: string
  bank: string
  cash: string
  btc: string
  /** Every coin other than Bitcoin (Hieu, 2026-10-29: ask Bitcoin and altcoins only). */
  coins: string
  gold: string
  stocks: string
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
  age: '', salary: '', otherIncome: null, passive: '', windfalls: null, windfallsYearly: '', spending: '', steady: null, reliers: null, reliersCount: '1',
  goal: null, goalName: '', goalAmount: '', goalYears: '', usdcThis: '', usdcElsewhere: '', bank: '', cash: '', btc: '', coins: '', gold: '', stocks: '',
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

const usd = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

/**
 * The items a filled form stands for, in the order they are shown. Market-priced things (BTC, gold) are stored as a quantity at
 * today's price when a price is known, otherwise as the value the user typed; everything else keeps the typed value.
 */
export function formToItems(v: FormValues, prices: Prices | null, now = Date.now()): FormItem[] {
  const items: FormItem[] = []
  const add = (text: string, ...ops: ProfileOp[]) => items.push({ text, ops })
  const holding = (type: AssetType, name: string, amount: number | null, extra: Partial<Holding> = {}) => {
    if (amount === null) return
    const h: Holding = { id: newId('h'), type, name, value: amount, currency: 'USDC', priceSource: 'self', rebalanceable: defaultRebalanceable(type), updatedAt: now, ...extra }
    add(`${name} ${usd(amount)}`, { op: 'add_holding', holding: h })
  }
  const priced = (type: AssetType, name: string, symbol: string | undefined, amount: number | null, px: number | undefined, unit?: Holding['unit']) => {
    if (amount === null) return
    if (px && px > 0) {
      const h: Holding = { id: newId('h'), type, name, ...(symbol ? { symbol } : {}), quantity: amount / px, ...(unit ? { unit } : {}), currency: 'USDC', priceSource: 'market', rebalanceable: defaultRebalanceable(type), updatedAt: now }
      add(`${name} ${usd(amount)}`, { op: 'add_holding', holding: h })
    } else holding(type, name, amount, symbol ? { symbol } : {})
  }

  const age = parseAmount(v.age)
  if (age !== null && age >= 10 && age <= 120) add(`Age ${Math.round(age)}`, { op: 'update_profile', fields: { age: Math.round(age) } })

  const salary = parseAmount(v.salary)
  if (salary !== null) add(`Salary ${usd(salary)} a month (active)`, { op: 'set_income', income: { id: newId('i'), name: 'Salary', monthly: salary, currency: 'USDC', kind: 'active', updatedAt: now } })
  const passive = v.otherIncome === 'yes' ? parseAmount(v.passive) : null
  if (passive !== null) add(`Passive income ${usd(passive)} a month`, { op: 'set_income', income: { id: newId('i'), name: 'Passive income', monthly: passive, currency: 'USDC', kind: 'passive', updatedAt: now } })
  if (v.otherIncome === 'yes' && v.windfalls === 'yes') {
    const yearly = parseAmount(v.windfallsYearly)
    add(`Airdrops and other windfalls: not counted as monthly income${yearly !== null ? ` (about ${usd(yearly)} a year)` : ''}`, { op: 'update_profile', fields: { hasWindfalls: true, ...(yearly !== null ? { windfallsYearly: yearly } : {}) } })
  }

  const spending = parseAmount(v.spending)
  if (spending !== null) add(`Monthly spending ${usd(spending)} a month (fixed)`, { op: 'set_expense', expense: { id: newId('e'), name: 'Monthly spending', monthly: spending, currency: 'USDC', kind: 'fixed', updatedAt: now } })

  if (v.steady !== null) add(`Income ${v.steady === 'yes' ? 'steady' : 'not steady'}`, { op: 'update_profile', fields: { incomeStable: v.steady === 'yes' } })
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

  holding('stable_wallet', 'USDC in this wallet', parseAmount(v.usdcThis), { where: 'app wallet' })
  holding('stable_wallet', 'USDC or USDT elsewhere', parseAmount(v.usdcElsewhere), { where: 'other wallets and exchanges' })
  holding('savings', 'Bank savings', parseAmount(v.bank))
  holding('cash', 'Cash', parseAmount(v.cash))
  priced('btc', 'Bitcoin', 'BTC', parseAmount(v.btc), prices?.usd['crypto:BTC'])
  holding('altcoin', 'Altcoins', parseAmount(v.coins))
  priced('gold_physical', 'Gold', undefined, parseAmount(v.gold), prices?.goldUsdPerOz ?? undefined, 'oz')
  holding('fund_bond', 'Stocks and funds', parseAmount(v.stocks))
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
