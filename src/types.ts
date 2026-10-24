// MoonSafe — shared types

export type Currency = 'VND' | 'USDC'
export type MoneyField = 'monthlyIncome' | 'monthlyExpenses' | 'debtAmount' | 'otherAssets'
export const MONEY_FIELDS: MoneyField[] = ['monthlyIncome', 'monthlyExpenses', 'debtAmount', 'otherAssets']

/**
 * Self-declared finances. null = not declared yet.
 * Each money field is stored in the currency the user typed it in (units[field],
 * default VND), so a salary paid in USDC stays exact; screens convert for display.
 */
export interface FinancialProfile {
  monthlyIncome: number | null
  monthlyExpenses: number | null   // essential spending per month
  debtAmount: number | null        // external debt declared; 0 = no debt
  otherAssets: number | null       // home, property… (what the allocation chart does not track)
  age: number | null
  incomeStable: boolean | null     // true → floor 3 months, false → 6 months
  units?: Partial<Record<MoneyField, Currency>>
  /** Assets the user told the agent about, valued at live prices (src/lib/allocation.ts). */
  holdings?: Holding[]
  savedAt?: number
}

/**
 * savings = bank savings deposit (safe part), cash = cash / payment account (idle money),
 * gold = physical gold at the world spot price, stock = US stock or ETF, crypto = coin held
 * off Arc (exchange, other chains).
 */
export type HoldingKind = 'savings' | 'cash' | 'gold' | 'stock' | 'crypto'
export const HOLDING_KINDS: HoldingKind[] = ['savings', 'cash', 'gold', 'stock', 'crypto']

export interface Holding {
  kind: HoldingKind
  /** gold: troy ounces; stock: shares; crypto: coins; savings / cash: amount of money in `currency`. */
  quantity: number
  /** gold only: 'oz'. Missing on gold saved before 2026-10-24, which was in lượng (converted on load). */
  unit?: 'oz'
  /** stock: ticker (SPY); crypto: symbol (ETH); savings / cash: bank or label (optional). */
  symbol?: string
  /** savings / cash only. */
  currency?: Currency
}

export const EMPTY_PROFILE: FinancialProfile = {
  monthlyIncome: null,
  monthlyExpenses: null,
  debtAmount: null,
  otherAssets: null,
  age: null,
  incomeStable: null,
}

export type Panel = 'fund' | 'invest' | 'balance' | 'settings'

/** What the agent opened for the user: a screen with an amount filled in (6-dec USDC). The user still signs. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  error?: boolean
}

/** DCA plan the user approved. Each run is a swap the user signs. */
export interface DcaPlan {
  amountUsdc: string      // 6-decimal units, as string (bigint-safe JSON)
  intervalDays: number
  startedAt: number
  lastRunAt: number | null
}
