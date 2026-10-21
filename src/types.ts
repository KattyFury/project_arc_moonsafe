// MoonSafe — shared types

export interface FinancialProfile {
  monthlyIncome: number | null       // VND
  monthlyExpenses: number | null     // VND essential expenses (replaces monthlyEssentials)
  monthlyEssentials?: number | null  // legacy alias kept for compatibility
  hasExternalDebt: boolean           // renamed from hasDebt
  hasDebt?: boolean                  // legacy alias
  debtNote?: string
  otherAssets: number | null         // USDC
  age: number | null
  incomeStable: boolean              // true = 3 months floor, false = 6 months
  savedAt?: number                   // timestamp ms
}

export type ActiveTab = 'fund' | 'invest' | 'balance' | 'settings'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface DCASchedule {
  enabled: boolean
  amountUsdc: number      // 6-decimal integer
  intervalDays: number
  lastRunAt: number | null
}
