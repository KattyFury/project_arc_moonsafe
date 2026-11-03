// The shortcuts above the message box (Hieu, 2026-11-03, 6a): add to or edit the portfolio without typing. They run on the app's
// own numbers and save through the same operations as the agent's cards, with no model call, so nothing has to be guessed.
//
// Pure module with relative imports only (shared by the app and scripts).

import { BTC_GUIDE, MAX_CRYPTO_SPLIT } from '../kb/kb'
import type { AssetType, Category, Debt, Expense, FinancialProfile, Holding, Income } from '../types'
import { groupOf } from './allocation'
import { defaultRebalanceable, newId, type ProfileOp } from './profile'

export type Part = 'safe' | 'traditional' | 'crypto'
export type ShortcutId = 'fund' | 'add' | 'hold' | 'month'

export const PART_LABEL: Record<Part, string> = { safe: 'Safety', traditional: 'Traditional', crypto: 'Crypto' }

/**
 * As few as possible (Hieu, 2026-11-03: 7b): the main job of the stage, the portfolio, the month. Before investing opens the main job is
 * the fund, and there is no fund button without a vault. The three parts and the split live inside "Edit portfolio".
 */
export function shortcutsFor({ unlocked, hasVault }: { unlocked: boolean; hasVault: boolean }): { id: ShortcutId; label: string }[] {
  return [
    ...(unlocked ? [{ id: 'add' as const, label: 'Add money' }] : hasVault ? [{ id: 'fund' as const, label: 'Add to fund' }] : []),
    { id: 'hold', label: 'Edit portfolio' },
    { id: 'month', label: 'Edit month' },
  ]
}

/** % of the money outside Safety in Crypto, never above the cap (Hieu, 2026-11-03). */
export const SPLIT_CHOICES = [50, 40, 30, 20, 0].filter(c => c <= MAX_CRYPTO_SPLIT)

export interface AssetChoice { type: AssetType; label: string; name: string; category?: Category; symbol?: string; hint?: string; asksName?: boolean }

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
    { type: 'fund_bond', label: 'Stocks or index funds', name: 'Stocks and index funds', asksName: true },
    { type: 'gold_physical', label: 'Gold', name: 'Gold' },
    { type: 'junk_bond', label: 'High-yield bonds', name: 'High-yield bonds' },
  ],
  crypto: [
    { type: 'btc', label: 'Bitcoin', name: 'Bitcoin', symbol: 'BTC' },
    { type: 'top10', label: 'A top-10 coin', name: 'Top-10 coin', asksName: true },
    { type: 'altcoin', label: 'Another coin', name: 'Other coin', asksName: true },
  ],
}

export function partOf(h: Holding): Part | null {
  const g = groupOf(h)
  return g === 'safe' ? 'safe' : g === 'traditional' ? 'traditional' : g === 'btc' || g === 'large_cap' || g === 'altcoin' ? 'crypto' : null
}

/** Holdings the user can edit: cirBTC bought in the app is read onchain, so it is left out. */
export const editableHoldings = (p: FinancialProfile | null, part: Part | 'all'): Holding[] =>
  (p?.holdings ?? []).filter(h => h.symbol !== 'cirBTC' && (part === 'all' || partOf(h) === part))

export function addHoldingOp(choice: AssetChoice, amountUsd: number, typedName = '', now = Date.now()): ProfileOp {
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
