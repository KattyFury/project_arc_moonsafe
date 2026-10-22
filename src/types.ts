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
  otherAssets: number | null       // gold, property besides home, stocks…
  age: number | null
  incomeStable: boolean | null     // true → floor 3 months, false → 6 months
  units?: Partial<Record<MoneyField, Currency>>
  savedAt?: number
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
export type Prefill =
  | { kind: 'deposit'; amount: bigint; key: number }
  | { kind: 'withdraw'; amount: bigint; key: number }
  | { kind: 'buy'; amount: bigint; key: number }
  | { kind: 'dca'; amount: bigint; intervalDays: number; key: number }

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
