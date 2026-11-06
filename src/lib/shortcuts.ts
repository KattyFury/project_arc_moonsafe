// The shortcuts above the message box (Hieu, 2026-11-03, 6a; reworked 2026-11-06): the split, the cash flow and the household, without typing. They run on the app's
// own numbers and save through the same operations as the agent's cards, with no model call, so nothing has to be guessed.
//
// Pure module with relative imports only (shared by the app and scripts).

import { BTC_GUIDE, MAX_CRYPTO_SPLIT } from '../kb/kb'
import type { AssetType, Category, Debt, Expense, FinancialProfile, Holding, Income } from '../types'
import { groupOf } from './allocation'
import { BTC_SYMBOLS, TOP10_SYMBOLS, defaultRebalanceable, newId, type ProfileFields, type ProfileOp } from './profile'

export type Part = 'safe' | 'traditional' | 'crypto'
export type ShortcutId = 'split' | 'flow' | 'info'

export const PART_LABEL: Record<Part, string> = { safe: 'Safety', traditional: 'Traditional', crypto: 'Crypto' }

/**
 * Three, always (Hieu, 2026-11-06): "Add money" and "Add to fund" did nothing the chat and the Emergency tab do not already do.
 * Update split = what sits in Safety, Traditional and Crypto, item by item, with totals the app works out; Edit cash flow = income,
 * spending and debts; Edit information = age and the people who rely on the user.
 */
export function shortcutsFor(): { id: ShortcutId; label: string }[] {
  return [
    { id: 'split', label: 'Update split' },
    { id: 'flow', label: 'Edit cash flow' },
    { id: 'info', label: 'Edit information' },
  ]
}

/** % of the money outside Safety in Crypto, never above the cap (Hieu, 2026-11-03). */
export const SPLIT_CHOICES = [50, 40, 30, 20, 0].filter(c => c <= MAX_CRYPTO_SPLIT)

/** by 'qty': a count (ounces, shares, coins) the app values at today's price; otherwise a value in USD. */
export interface AssetChoice { type: AssetType; label: string; name: string; category?: Category; symbol?: string; hint?: string; asksName?: boolean; by?: 'qty'; unit?: string }

/** What can be added to each part. Safety offers low-volatility forms only (CORE 2): gold, stocks or coins are not on the list. */
export const ASSET_CHOICES: Record<Part, AssetChoice[]> = {
  safe: [
    { type: 'term_deposit', label: 'Term deposit', name: 'Term deposit', hint: 'Usually locked until it matures.' },
    { type: 'bond', label: 'Bonds or money market', name: 'Bonds and money market' },
    { type: 'savings', label: 'Bank money', name: 'Bank savings kept as Safety', category: 'safe', hint: 'Only the amount you choose to keep as Safety.' },
    { type: 'stable_wallet', label: 'Stablecoins', name: 'Stablecoins kept as Safety', category: 'safe', hint: 'Only the amount you choose to keep as Safety.' },
    { type: 'cash', label: 'Cash', name: 'Cash kept as Safety', category: 'safe', hint: 'Only the amount you choose to keep as Safety.' },
  ],
  traditional: [
    { type: 'gold_physical', label: 'Gold', name: 'Gold', by: 'qty', unit: 'oz' },
    { type: 'us_stock', label: 'A US stock or ETF', name: 'Stock', asksName: true, by: 'qty', unit: 'shares', hint: 'By ticker, for example VOO.' },
    { type: 'fund_bond', label: 'Another fund, by value', name: 'Fund', asksName: true },
    { type: 'junk_bond', label: 'High-yield bonds', name: 'High-yield bonds' },
  ],
  crypto: [
    { type: 'btc', label: 'Bitcoin', name: 'BTC', symbol: 'BTC', by: 'qty', unit: 'coins' },
    { type: 'altcoin', label: 'Another coin', name: 'Coin', asksName: true, by: 'qty', unit: 'coins', hint: 'By its symbol, for example ETH.' },
  ],
}

export function partOf(h: Holding): Part | null {
  const g = groupOf(h)
  return g === 'safe' ? 'safe' : g === 'traditional' ? 'traditional' : g === 'btc' || g === 'large_cap' || g === 'altcoin' ? 'crypto' : null
}

/** Holdings the user can edit: cirBTC bought in the app is read onchain, so it is left out. */
export const editableHoldings = (p: FinancialProfile | null, part: Part | 'all'): Holding[] =>
  (p?.holdings ?? []).filter(h => h.symbol !== 'cirBTC' && (part === 'all' || partOf(h) === part))

/** A coin's type from its symbol: Bitcoin, ETH, a top-10 coin or another coin. */
export const coinType = (symbol: string): AssetType =>
  BTC_SYMBOLS.has(symbol) ? 'btc' : symbol === 'ETH' ? 'eth' : TOP10_SYMBOLS.has(symbol) ? 'top10' : 'altcoin'

/** A ticker or coin symbol as typed: letters, digits and dots, upper case. */
export const cleanSymbol = (typed: string) => typed.trim().toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 12)

/** `n` is a count for a choice by quantity, else a value in USD. */
export function addHoldingOp(choice: AssetChoice, n: number, typedName = '', now = Date.now()): ProfileOp {
  if (choice.by === 'qty') {
    const symbol = choice.symbol ?? cleanSymbol(typedName)
    const type = choice.type === 'altcoin' ? coinType(symbol) : choice.type
    const holding: Holding = {
      id: newId('h'), type, name: choice.asksName ? symbol : choice.name, quantity: n, unit: choice.unit, priceSource: 'market',
      rebalanceable: defaultRebalanceable(type), updatedAt: now, ...(symbol ? { symbol } : {}),
    }
    return { op: 'add_holding', holding }
  }
  const amountUsd = n
  const name = typedName.trim() || choice.name
  const holding: Holding = {
    id: newId('h'), type: choice.type, name, value: amountUsd, currency: 'USDC', priceSource: 'self',
    rebalanceable: defaultRebalanceable(choice.type), updatedAt: now,
    ...(choice.category ? { category: choice.category } : {}),
    ...(choice.symbol ? { symbol: choice.symbol } : {}),
  }
  return { op: 'add_holding', holding }
}

/** A coin or share count stays a count; anything else is its value now, in the currency it was declared in (CORE 3). */
export const editsQuantity = (h: Holding) => h.priceSource === 'market' && h.quantity !== undefined
export const editHoldingOp = (h: Holding, n: number): ProfileOp =>
  ({ op: 'set_holding', id: h.id, patch: editsQuantity(h) ? { quantity: n } : { value: n } })
export const removeHoldingOp = (h: Holding): ProfileOp => ({ op: 'remove_holding', id: h.id })

export const splitOp = (cryptoSplit: number): ProfileOp => ({ op: 'update_profile', fields: { cryptoSplit: Math.min(MAX_CRYPTO_SPLIT, cryptoSplit) } })

/** The month: what they earn, spend and owe. */
export type MonthLine =
  | { kind: 'income'; item: Income }
  | { kind: 'expense'; item: Expense }
  | { kind: 'debt'; item: Debt }

export const monthLines = (p: FinancialProfile | null): MonthLine[] => [
  ...(p?.incomes ?? []).map(item => ({ kind: 'income' as const, item })),
  ...(p?.expenses ?? []).map(item => ({ kind: 'expense' as const, item })),
  ...(p?.debts ?? []).map(item => ({ kind: 'debt' as const, item })),
]
export const lineAmount = (l: MonthLine) => l.kind === 'debt' ? l.item.balance : l.item.monthly
export function editLineOp(l: MonthLine, n: number, now = Date.now()): ProfileOp {
  if (l.kind === 'income') return { op: 'set_income', income: { ...l.item, monthly: n, updatedAt: now } }
  if (l.kind === 'expense') return { op: 'set_expense', expense: { ...l.item, monthly: n, updatedAt: now } }
  return { op: 'update_debt', id: l.item.id, patch: { balance: n } }
}
export function removeLineOp(l: MonthLine): ProfileOp {
  if (l.kind === 'income') return { op: 'remove_income', id: l.item.id }
  if (l.kind === 'expense') return { op: 'remove_expense', id: l.item.id }
  return { op: 'remove_debt', id: l.item.id }
}
export function addLineOp(kind: 'income' | 'expense', name: string, n: number, now = Date.now()): ProfileOp {
  const label = name.trim() || (kind === 'income' ? 'Income' : 'Spending')
  return kind === 'income'
    ? { op: 'set_income', income: { id: newId('i'), name: label, monthly: n, currency: 'USDC', kind: 'active', updatedAt: now } }
    : { op: 'set_expense', expense: { id: newId('e'), name: label, monthly: n, currency: 'USDC', kind: 'fixed', updatedAt: now } }
}

/** The Bitcoin part of a Crypto amount, in cents ($325 → $227.50, never $227.49 from floating point). */
export const btcPart = (amount: number) => Math.floor(amount * BTC_GUIDE * 100 + 1e-6) / 100

/** An amount split by the age shares; cents, so the three add back up to the amount. */
export function splitAmount(amount: number, shares: { safe: number; traditional: number; crypto: number }): Record<Part, number> {
  const total = shares.safe + shares.traditional + shares.crypto
  const cents = (n: number) => Math.round(n * 100) / 100
  const safe = cents(amount * shares.safe / total)
  const traditional = cents(amount * shares.traditional / total)
  return { safe, traditional, crypto: cents(amount - safe - traditional) }
}

/** A debt line: what is still owed, the yearly rate, what is paid a month (null = not told). */
export interface DebtFields { balance: number; ratePct: number | null; monthlyPayment: number | null }
export const editDebtOp = (d: Debt, f: DebtFields): ProfileOp => ({ op: 'update_debt', id: d.id, patch: { balance: f.balance, ratePct: f.ratePct, monthlyPayment: f.monthlyPayment } })
export function addDebtOp(name: string, f: DebtFields, now = Date.now()): ProfileOp {
  return { op: 'add_debt', debt: { id: newId('d'), name: name.trim() || 'Debt', type: 'unknown', balance: f.balance, currency: 'USDC', ratePct: f.ratePct, monthlyPayment: f.monthlyPayment, updatedAt: now } }
}

/** About the household (Hieu, 2026-11-06): what sets the emergency fund's months and the age shares. */
export type InfoKey = 'age' | 'dependents' | 'incomeStable' | 'soleEarner'
export const INFO_LABEL: Record<InfoKey, string> = { age: 'Age', dependents: 'People who rely on your income', incomeStable: 'Steady income', soleEarner: 'Only earner at home' }
export const infoOp = (fields: ProfileFields): ProfileOp => ({ op: 'update_profile', fields })
