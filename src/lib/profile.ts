// The user's profile v2 (src/types.ts): reading any stored shape (v1 is migrated, nothing is
// dropped) and the operations the agent's tools turn into (functions/api/chat.ts builds them,
// the app applies them with applyOps, the eval replays them). One list of operations instead of
// the old profileUpdate + assetUpdates, so app, server and eval cannot drift apart.
//
// Pure module with relative imports only (shared by the app, functions/api/chat.ts and scripts).

import { assetTypeRow } from '../kb/kb'
import {
  EMPTY_PROFILE, type AssetType, type Category, type Currency, type Debt, type DebtType, type Expense,
  type FinancialProfile, type Holding, type Income, type IncomeKind, type NearGoal,
} from '../types'

export const DEBT_TYPES: DebtType[] = ['credit_card', 'consumer_loan', 'payday_loan', 'crypto_margin', 'mortgage', 'car_loan', 'business_loan', 'family_no_interest', 'family_interest', 'unknown']

/** Dollar stablecoins: priced at 1. */
export const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE'])
/** BTC and its wrapped forms. */
export const BTC_SYMBOLS = new Set(['BTC', 'WBTC', 'CBBTC', 'CIRBTC'])
/** Big caps besides ETH (spec 1: ETH, SOL, BNB and other top-10 coins). Anything else is an altcoin. */
export const TOP10_SYMBOLS = new Set(['BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'TRX', 'TON', 'AVAX'])

/** How a type is valued: live price by quantity (gold / stock / crypto), 1:1 dollars, or the declared value. */
export type PriceKind = 'gold' | 'stock' | 'crypto' | 'stable' | 'self'
const PRICE_KIND: Partial<Record<AssetType, PriceKind>> = {
  gold_physical: 'gold', gold_token: 'crypto', us_stock: 'stock', btc: 'crypto', eth: 'crypto', top10: 'crypto',
  altcoin: 'crypto', staked_large_cap: 'crypto', stable_wallet: 'stable', flexible_earn: 'stable', defi_stable: 'stable',
}
export const priceKindOf = (type: AssetType): PriceKind => PRICE_KIND[type] ?? 'self'

export const isAssetType = (t: unknown): t is AssetType => typeof t === 'string' && t !== 'moonsafe_fund' && t !== 'cirbtc' && !!assetTypeRow(t)

/** Category of a holding (KB spec 3); "other" uses its own, unclassified other counts as lifestyle (outside the base). */
export function categoryOf(h: Pick<Holding, 'type' | 'category'>): Category {
  if (h.type === 'other') return h.category ?? 'lifestyle'
  return (assetTypeRow(h.type)?.category ?? 'lifestyle') as Category
}

/** Invest subgroup (traditional / btc / large_cap / altcoin / real_estate / business / lending), null outside invest. */
export const subgroupOf = (h: Pick<Holding, 'type'>): string | null => assetTypeRow(h.type)?.subgroup ?? null

/** Default for a new holding of this type (spec 3: rental, business, loans given, insurance are not rebalanceable). */
export function defaultRebalanceable(type: AssetType, category?: Category): boolean {
  if (type === 'other') return category === 'safe' || category === 'idle'
  const row = assetTypeRow(type)
  return row?.rebalanceable !== false && row?.liquid_base === true
}

export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`
}

// ---- reading stored data ------------------------------------------------------------------

const num = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null
const str = (v: unknown): string | undefined => typeof v === 'string' && v.trim() ? v.trim() : undefined
const bool = (v: unknown): boolean | null => typeof v === 'boolean' ? v : null
export const toCurrency = (c: unknown): Currency => typeof c === 'string' && /^(usdc?|usdt|\$|dollars?)$/i.test(c.trim()) ? 'USDC' : 'VND'
const cur = (c: unknown, fallback: Currency = 'USDC'): Currency => c === 'VND' || c === 'USDC' ? c : typeof c === 'string' ? toCurrency(c) : fallback

function readHolding(raw: unknown, now: number): Holding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (!isAssetType(o.type)) return null
  const type = o.type
  const category = type === 'other' && ['safe', 'invest', 'idle', 'lifestyle'].includes(String(o.category)) ? o.category as Category : undefined
  const h: Holding = {
    id: str(o.id) ?? newId('h'),
    type,
    name: str(o.name) ?? str(o.symbol) ?? assetTypeRow(type)!.label,
    updatedAt: num(o.updatedAt) ?? now,
    priceSource: o.priceSource === 'self' || o.priceSource === 'market' ? o.priceSource : priceKindOf(type) === 'self' ? 'self' : 'market',
    rebalanceable: bool(o.rebalanceable) ?? defaultRebalanceable(type, category),
  }
  const symbol = str(o.symbol)?.toUpperCase()
  if (symbol) h.symbol = symbol
  if (str(o.where)) h.where = str(o.where)
  if (num(o.quantity) !== null) h.quantity = num(o.quantity)!
  if (str(o.unit)) h.unit = str(o.unit)
  if (num(o.value) !== null) { h.value = num(o.value)!; h.currency = cur(o.currency) }
  if (category) h.category = category
  if (o.loanStatus === 'on_time' || o.loanStatus === 'overdue') h.loanStatus = o.loanStatus
  // Unusable: nothing to value it by.
  if (h.quantity === undefined && h.value === undefined) return null
  return h
}

function readDebt(raw: unknown, now: number): Debt | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const balance = num(o.balance)
  if (balance === null) return null
  const type = DEBT_TYPES.includes(o.type as DebtType) ? o.type as DebtType : 'unknown'
  return {
    id: str(o.id) ?? newId('d'), name: str(o.name) ?? 'Debt', type, balance, currency: cur(o.currency),
    ratePct: type === 'family_no_interest' ? 0 : num(o.ratePct), monthlyPayment: num(o.monthlyPayment), updatedAt: num(o.updatedAt) ?? now,
    ...(str(o.lender) ? { lender: str(o.lender) } : {}),
    ...(o.term === 'short' || o.term === 'long' ? { term: o.term } : {}),
    ...(typeof o.required === 'boolean' ? { required: o.required } : {}),
  }
}

function readFlow<T extends Income | Expense>(raw: unknown, kinds: string[], prefix: string, now: number): T | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const monthly = num(o.monthly)
  if (monthly === null || !kinds.includes(String(o.kind))) return null
  return { id: str(o.id) ?? newId(prefix), name: str(o.name) ?? (prefix === 'i' ? 'Income' : 'Spending'), monthly, currency: cur(o.currency), kind: o.kind, updatedAt: num(o.updatedAt) ?? now } as T
}

const list = <T>(v: unknown, read: (x: unknown) => T | null): T[] => Array.isArray(v) ? v.map(read).filter((x): x is T => x !== null) : []

/** v1 holdings (kind savings / cash / gold / stock / crypto) → v2 asset types. */
const OZ_PER_LUONG = 37.5 / 31.1034768
function migrateHolding(raw: unknown, now: number): Holding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const q = num(o.quantity)
  if (q === null || q === 0) return null
  const sym = str(o.symbol)
  const base = { id: newId('h'), updatedAt: now }
  switch (o.kind) {
    case 'savings':
    case 'cash': {
      const type = o.kind === 'savings' ? 'savings' : 'cash'
      return { ...base, type, name: sym ?? (type === 'savings' ? 'Savings' : 'Cash'), ...(sym ? { where: sym } : {}), value: q, currency: cur(o.currency, 'VND'), priceSource: 'self', rebalanceable: true }
    }
    case 'gold':
      // v1 gold without a unit was in lượng (before 2026-10-24).
      return { ...base, type: 'gold_physical', name: 'Gold', quantity: o.unit === 'oz' ? q : q * OZ_PER_LUONG, unit: 'oz', priceSource: 'market', rebalanceable: true }
    case 'stock':
      if (!sym) return null
      return { ...base, type: 'us_stock', name: sym.toUpperCase(), symbol: sym.toUpperCase(), quantity: q, unit: 'shares', priceSource: 'market', rebalanceable: true }
    case 'crypto': {
      if (!sym) return null
      const s = sym.toUpperCase()
      if (STABLECOINS.has(s)) return { ...base, type: 'stable_wallet', name: s, symbol: s, value: q, currency: 'USDC', priceSource: 'market', rebalanceable: true }
      const type: AssetType = BTC_SYMBOLS.has(s) ? 'btc' : s === 'ETH' ? 'eth' : TOP10_SYMBOLS.has(s) ? 'top10' : 'altcoin'
      return { ...base, type, name: s, symbol: s, quantity: q, unit: 'coins', priceSource: 'market', rebalanceable: true }
    }
  }
  return null
}

/** A v1 money field: a number (VND unless units says USDC) or {amount, currency}. */
function v1Money(raw: Record<string, unknown>, field: string): { amount: number; currency: Currency } | null {
  const v = field === 'monthlyExpenses' && raw[field] === undefined ? raw.monthlyEssentials : raw[field]
  const units = (raw.units && typeof raw.units === 'object' ? raw.units : {}) as Record<string, unknown>
  if (v && typeof v === 'object' && 'amount' in v) {
    const o = v as { amount?: unknown; currency?: unknown }
    return num(o.amount) !== null ? { amount: num(o.amount)!, currency: cur(o.currency, 'VND') } : null
  }
  return num(v) !== null ? { amount: num(v)!, currency: units[field] === 'USDC' ? 'USDC' : 'VND' } : null
}

/** v1 (monthlyIncome / monthlyExpenses / debtAmount / otherAssets + holdings by kind) → v2, nothing lost. */
function migrateV1(raw: Record<string, unknown>, now: number): FinancialProfile {
  const p: FinancialProfile = { ...EMPTY_PROFILE, holdings: [], debts: [], incomes: [], expenses: [] }
  p.age = num(raw.age)
  p.incomeStable = bool(raw.incomeStable)
  p.holdings = list(raw.holdings, x => migrateHolding(x, now))
  const inc = v1Money(raw, 'monthlyIncome')
  if (inc && inc.amount > 0) p.incomes.push({ id: newId('i'), name: 'Income', monthly: inc.amount, currency: inc.currency, kind: 'active', updatedAt: now })
  const exp = v1Money(raw, 'monthlyExpenses')
  if (exp && exp.amount > 0) p.expenses.push({ id: newId('e'), name: 'Spending', monthly: exp.amount, currency: exp.currency, kind: 'fixed', updatedAt: now })
  // Debt of an unknown type and rate counts as priority debt until the agent asks (BUILD PLAN -17 step 1).
  const debt = v1Money(raw, 'debtAmount')
  if (debt && debt.amount > 0) p.debts.push({ id: newId('d'), name: 'Debt', type: 'unknown', balance: debt.amount, currency: debt.currency, ratePct: null, monthlyPayment: null, updatedAt: now })
  if ((debt && debt.amount === 0) || raw.hasExternalDebt === false || raw.hasDebt === false) p.debtsComplete = true
  const other = v1Money(raw, 'otherAssets')
  if (other && other.amount > 0) p.holdings.push({ id: newId('h'), type: 'other', name: 'Other assets', value: other.amount, currency: other.currency, updatedAt: now, priceSource: 'self', rebalanceable: false })
  if (num(raw.savedAt) !== null) p.savedAt = num(raw.savedAt)!
  return p
}

/** Any stored shape (v2, v1, Arc Studio's) → v2. */
export function normalizeProfile(raw: Record<string, unknown> | null | undefined, now = Date.now()): FinancialProfile {
  if (!raw) return { ...EMPTY_PROFILE }
  if (raw.v !== 2) return migrateV1(raw, now)
  return {
    v: 2,
    age: num(raw.age),
    ageDeclined: raw.ageDeclined === true,
    incomeStable: bool(raw.incomeStable),
    dependents: num(raw.dependents),
    soleEarner: bool(raw.soleEarner),
    holdings: list(raw.holdings, x => readHolding(x, now)),
    debts: list(raw.debts, x => readDebt(x, now)),
    debtsComplete: raw.debtsComplete === true,
    incomes: list(raw.incomes, x => readFlow<Income>(x, ['active', 'passive', 'irregular'], 'i', now)),
    expenses: list(raw.expenses, x => readFlow<Expense>(x, ['fixed', 'variable'], 'e', now)),
    ...(readNearGoal(raw.nearGoal) ? { nearGoal: readNearGoal(raw.nearGoal) } : {}),
    ...(raw.noNearGoal === true ? { noNearGoal: true } : {}),
    ...(raw.hasWindfalls === true ? { hasWindfalls: true } : {}),
    ...(num(raw.windfallsYearly) !== null && num(raw.windfallsYearly)! > 0 ? { windfallsYearly: num(raw.windfallsYearly)! } : {}),
    ...(bool(raw.cryptoDropOk) !== null ? { cryptoDropOk: bool(raw.cryptoDropOk) } : {}),
    ...(bool(raw.insured) !== null ? { insured: bool(raw.insured) } : {}),
    ...(num(raw.savedAt) !== null ? { savedAt: num(raw.savedAt)! } : {}),
  }
}

function readNearGoal(raw: unknown): NearGoal | null {
  if (!raw || typeof raw !== 'object') return null
  const g = raw as Record<string, unknown>
  const amount = num(g.amount)
  if (amount === null || amount <= 0) return null
  return { name: str(g.name) ?? 'Goal', amount, currency: g.currency === 'VND' ? 'VND' : 'USDC', years: num(g.years) }
}

/** Something was ever told to the agent. */
export const hasAnyData = (p: FinancialProfile | null | undefined): boolean =>
  !!p && (p.age !== null || p.ageDeclined || p.incomeStable !== null || p.dependents !== null || p.soleEarner !== null
    || p.holdings.length > 0 || p.debts.length > 0 || p.debtsComplete || p.incomes.length > 0 || p.expenses.length > 0)

// ---- operations (what the agent's tools become) ---------------------------------------------

export type ProfileFields = Partial<Pick<FinancialProfile, 'age' | 'ageDeclined' | 'incomeStable' | 'dependents' | 'soleEarner' | 'debtsComplete' | 'nearGoal' | 'noNearGoal' | 'hasWindfalls' | 'windfallsYearly' | 'cryptoDropOk' | 'insured'>>

/** The holding the user declared for the USDC in THIS (connected) wallet, if there is one. */
export function appWalletHolding(p: FinancialProfile | null): Holding | undefined {
  return p?.holdings.find(h => h.type === 'stable_wallet' && h.value !== undefined && h.currency !== 'VND' && /\b(app|this wallet|my wallet|moonsafe|connected)\b|ví (này|app)/i.test(`${h.where ?? ''} ${h.name}`)) // lang-ok
}

/**
 * The app itself moved USDC out of / into the connected wallet (fund deposit or withdrawal, cirBTC purchase). Only declared money
 * counts, so the declared wallet amount follows (never below 0). Without a declared wallet nothing is taken away; money coming
 * back to the wallet (withdrawal) then starts a declared wallet item.
 */
export function walletMoveOps(p: FinancialProfile | null, deltaUsd: number, now = Date.now()): ProfileOp[] {
  if (!p || !Number.isFinite(deltaUsd) || Math.abs(deltaUsd) < 0.005) return []
  const h = appWalletHolding(p)
  const cents = (n: number) => Math.round(n * 100) / 100
  if (h) return [{ op: 'set_holding', id: h.id, patch: { value: Math.max(0, cents((h.value ?? 0) + deltaUsd)) } }]
  if (deltaUsd < 0) return []
  return [{ op: 'add_holding', holding: { id: newId('h'), type: 'stable_wallet', name: 'Stablecoins in this wallet', where: 'app wallet', value: cents(deltaUsd), currency: 'USDC', priceSource: 'self', rebalanceable: defaultRebalanceable('stable_wallet'), updatedAt: now } }]
}

/** Where the app records the cirBTC it bought: one holding, at the USDC paid (cost), never revalued at the market. */
export const CIRBTC_WHERE = 'MoonSafe'
export const cirBtcHolding = (p: FinancialProfile | null): Holding | undefined =>
  p?.holdings.find(h => h.type === 'btc' && h.where === CIRBTC_WHERE)

/** After a cirBTC buy in the app: add what was paid to the "cirBTC (bought in MoonSafe)" holding. */
export function cirBtcBuyOps(p: FinancialProfile | null, paidUsd: number, now = Date.now()): ProfileOp[] {
  if (!p || !Number.isFinite(paidUsd) || paidUsd < 0.005) return []
  const cents = (n: number) => Math.round(n * 100) / 100
  const h = cirBtcHolding(p)
  if (h) return [{ op: 'set_holding', id: h.id, patch: { value: cents((h.value ?? 0) + paidUsd), updatedAt: now } }]
  return [{ op: 'add_holding', holding: { id: newId('h'), type: 'btc', name: 'cirBTC (bought in MoonSafe)', symbol: 'cirBTC', where: CIRBTC_WHERE, value: cents(paidUsd), currency: 'USDC', priceSource: 'self', rebalanceable: defaultRebalanceable('btc'), updatedAt: now } }]
}

export type ProfileOp =
  | { op: 'update_profile'; fields: ProfileFields }
  | { op: 'add_holding'; holding: Holding }
  | { op: 'set_holding'; id: string; patch: Partial<Omit<Holding, 'id'>> }
  | { op: 'remove_holding'; id: string }
  | { op: 'add_debt'; debt: Debt }
  | { op: 'update_debt'; id: string; patch: Partial<Omit<Debt, 'id'>> }
  | { op: 'remove_debt'; id: string }
  | { op: 'set_income'; income: Income }
  | { op: 'remove_income'; id: string }
  | { op: 'set_expense'; expense: Expense }
  | { op: 'remove_expense'; id: string }

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => arr.some(x => x.id === item.id) ? arr.map(x => x.id === item.id ? item : x) : [...arr, item]

/** The profile after the operations, in order. Unknown ids are ignored (never throws on agent input). */
export function applyOps(p: FinancialProfile, ops: ProfileOp[], now = Date.now()): FinancialProfile {
  let out: FinancialProfile = { ...p, holdings: [...p.holdings], debts: [...p.debts], incomes: [...p.incomes], expenses: [...p.expenses] }
  for (const o of ops) {
    switch (o.op) {
      case 'update_profile': out = { ...out, ...o.fields }; break
      case 'add_holding': out.holdings = upsert(out.holdings, o.holding); break
      case 'set_holding': out.holdings = out.holdings.map(h => h.id === o.id ? { ...h, ...o.patch, updatedAt: now } : h); break
      case 'remove_holding': out.holdings = out.holdings.filter(h => h.id !== o.id); break
      case 'add_debt': out.debts = upsert(out.debts, o.debt); break
      case 'update_debt': out.debts = out.debts.map(d => d.id === o.id ? { ...d, ...o.patch, updatedAt: now } : d); break
      case 'remove_debt': out.debts = out.debts.filter(d => d.id !== o.id); break
      case 'set_income': out.incomes = upsert(out.incomes, o.income); break
      case 'remove_income': out.incomes = out.incomes.filter(x => x.id !== o.id); break
      case 'set_expense': out.expenses = upsert(out.expenses, o.expense); break
      case 'remove_expense': out.expenses = out.expenses.filter(x => x.id !== o.id); break
    }
  }
  return out
}

const HOLDING_PATCH = ['type', 'name', 'symbol', 'where', 'quantity', 'unit', 'value', 'currency', 'priceSource', 'rebalanceable', 'category', 'loanStatus']
const DEBT_PATCH = ['name', 'type', 'lender', 'balance', 'currency', 'ratePct', 'term', 'monthlyPayment', 'required']
/** Only the named fields, each a number ≥ 0, a string, a boolean or null. */
function pick(raw: unknown, keys: string[]): Record<string, unknown> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    const v = o[k]
    if (v === null || typeof v === 'string' || typeof v === 'boolean' || num(v) !== null) out[k] = v
  }
  return out
}

/** Loose ops from the network (server reply) → typed ops; anything malformed is dropped. */
export function readOps(raw: unknown, now = Date.now()): ProfileOp[] {
  if (!Array.isArray(raw)) return []
  const out: ProfileOp[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const id = str(o.id)
    switch (o.op) {
      case 'update_profile': {
        const f = (o.fields && typeof o.fields === 'object' ? o.fields : {}) as Record<string, unknown>
        const fields: ProfileFields = {}
        if (num(f.age) !== null) fields.age = num(f.age)!
        for (const k of ['ageDeclined', 'incomeStable', 'soleEarner', 'debtsComplete', 'noNearGoal', 'hasWindfalls', 'cryptoDropOk', 'insured'] as const) if (typeof f[k] === 'boolean') fields[k] = f[k] as boolean
        if (num(f.dependents) !== null) fields.dependents = num(f.dependents)!
        if (num(f.windfallsYearly) !== null && num(f.windfallsYearly)! > 0) fields.windfallsYearly = num(f.windfallsYearly)!
        const goal = readNearGoal(f.nearGoal)
        if (goal) fields.nearGoal = goal
        if (Object.keys(fields).length) out.push({ op: 'update_profile', fields })
        break
      }
      case 'add_holding': { const h = readHolding(o.holding, now); if (h) out.push({ op: 'add_holding', holding: h }); break }
      case 'add_debt': { const d = readDebt(o.debt, now); if (d) out.push({ op: 'add_debt', debt: d }); break }
      case 'set_income': { const x = readFlow<Income>(o.income, ['active', 'passive', 'irregular'], 'i', now); if (x) out.push({ op: 'set_income', income: x }); break }
      case 'set_expense': { const x = readFlow<Expense>(o.expense, ['fixed', 'variable'], 'e', now); if (x) out.push({ op: 'set_expense', expense: x }); break }
      case 'set_holding':
      case 'update_debt': {
        const patch = pick(o.patch, o.op === 'set_holding' ? HOLDING_PATCH : DEBT_PATCH)
        if (o.op === 'set_holding' && 'type' in patch && !isAssetType(patch.type)) delete patch.type
        if (id && Object.keys(patch).length) out.push({ op: o.op, id, patch } as ProfileOp)
        break
      }
      case 'remove_holding': case 'remove_debt': case 'remove_income': case 'remove_expense':
        if (id) out.push({ op: o.op, id })
        break
    }
  }
  return out
}

export const INCOME_KINDS: IncomeKind[] = ['active', 'passive', 'irregular']
