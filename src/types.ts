// MoonSafe — shared types

export type Currency = 'VND' | 'USDC'

/**
 * Asset types: the keys of `asset_types` in src/kb/moonsafe-kb.json (spec 3). The category
 * (safe / invest / idle / lifestyle / fund) and the invest subgroup come from the KB, never
 * stored twice; only type "other" stores its own category (spec 3 #28: classified by nature).
 */
export type AssetType =
  | 'cash' | 'checking' | 'term_deposit' | 'savings' | 'stable_wallet' | 'flexible_earn' | 'locked_earn' | 'defi_stable'
  | 'moonsafe_fund' | 'bond' | 'junk_bond' | 'gold_physical' | 'gold_token' | 'us_stock' | 'vn_stock' | 'fund_bond' | 'btc' | 'cirbtc' | 'eth'
  | 'top10' | 'altcoin' | 'crypto' | 'staked_large_cap' | 'nft' | 'home' | 'rental_property' | 'car' | 'business_stake' | 'loan_given'
  | 'savings_insurance' | 'other'

export type Category = 'fund' | 'safe' | 'invest' | 'idle' | 'lifestyle'

/** One thing the user holds (spec 10). Market-priced items keep a quantity, self-declared ones a value. */
export interface Holding {
  id: string
  type: AssetType
  /** What the user calls it ("Chase savings", "ETH"). */
  name: string
  /** Ticker / coin symbol for market prices (SPY, ETH, PAXG). */
  symbol?: string
  /** Where it is kept (Binance, Vietcombank, cold wallet). */
  where?: string
  /** Market-priced: coins / shares / troy ounces. */
  quantity?: number
  /** 'oz' for gold, 'shares', 'coins'. */
  unit?: string
  /** Self-declared value (and stablecoins, priced 1:1) in `currency`, kept as the user said it. */
  value?: number
  currency?: Currency
  updatedAt: number
  /** market = quantity × live price; self = the value the user declared ("self-declared"). */
  priceSource: 'market' | 'self'
  /** false = counted in net worth, outside the % base (grey slice): rental, business, loans given, insurance. */
  rebalanceable: boolean
  /** Type "other" only: what it is by nature. */
  category?: Category
  /** loan_given only. */
  loanStatus?: 'on_time' | 'overdue'
}

/** Debt types: keys of `debt_types` in the KB; 'unknown' = not told yet (counts as priority until known). */
export type DebtType = 'credit_card' | 'consumer_loan' | 'payday_loan' | 'crypto_margin' | 'mortgage' | 'car_loan' | 'business_loan' | 'family_no_interest' | 'family_interest' | 'unknown'

/** One debt (spec 5.2). */
export interface Debt {
  id: string
  name: string
  type: DebtType
  /** Family member / friend, when it is a family debt. */
  lender?: string
  balance: number
  currency: Currency
  /** Yearly %, 0 = no interest, null = not told yet. */
  ratePct: number | null
  term?: 'short' | 'long'
  /** Paid per month (interest-free debt: what the user actually pays); null = not told. */
  monthlyPayment: number | null
  /** Required payment, or flexible (pay when you can). */
  required?: boolean
  updatedAt: number
}

export type IncomeKind = 'active' | 'passive' | 'irregular'

/** One source of income, monthly average (spec 6). */
export interface Income { id: string; name: string; monthly: number; currency: Currency; kind: IncomeKind; updatedAt: number }

/** One spending line, monthly average (spec 6). Debt payments live on the debts, counted as fixed. */
export interface Expense { id: string; name: string; monthly: number; currency: Currency; kind: 'fixed' | 'variable'; updatedAt: number }

/**
 * What the user told the agent (v2, 2026-10-25). Stored in localStorage + KV under the same keys
 * as v1; a v1 record is migrated when read (src/lib/profile.ts).
 */
export interface FinancialProfile {
  v: 2
  /** One active financial plan; household scope does not create shared wallet permissions. */
  planningScope?: 'individual' | 'household'
  age: number | null
  /** The user declined to give an age: the split uses age 30 and says so. */
  ageDeclined: boolean
  incomeStable: boolean | null
  dependents: number | null
  soleEarner: boolean | null
  holdings: Holding[]
  debts: Debt[]
  /** The user answered the last debt question ("any other debt, family included?"). */
  debtsComplete: boolean
  incomes: Income[]
  expenses: Expense[]
  /** A big expense within 5 years (car, wedding, school): kept in Safety, not invested (framework v2, 2026-10-27). */
  nearGoal?: NearGoal | null
  /** The user said there is no such goal. */
  noNearGoal?: boolean
  /** Money that comes in bursts (airdrops, trading wins, bonuses, "a few times a year"): not counted as monthly income, said once in the plan. */
  hasWindfalls?: boolean
  /** What those windfalls add up to in a year, USD, if the user said (a note in the plan; never counted as monthly income). */
  windfallsYearly?: number
  /** "If your crypto dropped by half, could you hold it without selling to live?" null = not asked / unsure. */
  cryptoDropOk?: boolean | null
  /** Share of the money outside Safety that goes to Crypto, in % (the rest is Traditional). Unset = 50, MoonSafe's default (Hieu, 2026-10-31). */
  cryptoSplit?: number
  /** Health / life cover, asked only when people rely on their income. */
  insured?: boolean | null
  savedAt?: number
}

export interface NearGoal {
  name: string
  amount: number
  currency: Currency
  /** Years until it is needed, if said. */
  years: number | null
}

export const EMPTY_PROFILE: FinancialProfile = {
  v: 2, age: null, ageDeclined: false, incomeStable: null, dependents: null, soleEarner: null,
  holdings: [], debts: [], debtsComplete: false, incomes: [], expenses: [],
}

export type Panel = 'fund' | 'invest' | 'balance' | 'settings'

/** What the agent opened for the user: a screen with an amount filled in (6-dec USDC). The user still signs. */
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  error?: boolean
  /** Sent to the agent but not shown: the app telling it a card was signed. */
  hidden?: boolean
}

/** DCA plan the user approved. Each run is a swap the user signs. */
export interface DcaPlan {
  amountUsdc: string      // 6-decimal units, as string (bigint-safe JSON)
  intervalDays: number
  startedAt: number
  lastRunAt: number | null
}
