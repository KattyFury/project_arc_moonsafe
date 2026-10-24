// Allocation of the money outside the emergency fund (docs/FRAMEWORK-TAI-CHINH.md):
// safe = bank savings, invest = gold + stocks + coins + cirBTC, idle = money not put to work
// yet (wallet USDC + cash). Target by age: safe = age %, invest = 100 − age %; idle has no
// target, it is what the user still has to place. The fund (vault) and otherAssets stay out.
//
// Pure module with relative imports only: the app and functions/api/chat.ts both use it,
// so the chart and the agent quote the same numbers.

import { HOLDING_KINDS, type Currency, type Holding, type HoldingKind } from '../types'

export type Bucket = 'safe' | 'invest' | 'idle'

export const BUCKET_OF: Record<HoldingKind, Bucket> = { savings: 'safe', cash: 'idle', gold: 'invest', stock: 'invest', crypto: 'invest' }

/** Dollar stablecoins: priced at 1 and counted as idle money, not as an investment. */
export const STABLECOINS = new Set(['USDT', 'USDC', 'DAI', 'FDUSD', 'USDE'])

export const bucketOf = (h: Holding): Bucket =>
  h.kind === 'crypto' && STABLECOINS.has((h.symbol ?? '').toUpperCase()) ? 'idle' : BUCKET_OF[h.kind]

/** Live prices in USD: gold spot per troy ounce, stocks and coins keyed "stock:SPY" / "crypto:ETH". */
export interface Prices {
  goldUsdPerOz: number | null
  usd: Record<string, number>
}

/** Gold is stored in troy ounces. Holdings saved before 2026-10-24 (no unit) were in lượng (37.5 g). */
export const OZ_PER_LUONG = 37.5 / 31.1034768
export const GOLD_UNITS_TO_OZ: Record<string, number> = { oz: 1, g: 1 / 31.1034768, kg: 1000 / 31.1034768, luong: OZ_PER_LUONG, chi: OZ_PER_LUONG / 10 }

export const priceKey = (h: Pick<Holding, 'kind' | 'symbol'>) => `${h.kind}:${(h.symbol ?? '').toUpperCase()}`

const isCurrency = (c: unknown): c is Currency => c === 'VND' || c === 'USDC'

/** One holding from loose input (stored profile, agent tool call); null if unusable. */
export function toHolding(raw: unknown): Holding | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const kind = o.kind as HoldingKind
  const quantity = typeof o.quantity === 'number' && Number.isFinite(o.quantity) && o.quantity >= 0 ? o.quantity : null
  if (!HOLDING_KINDS.includes(kind) || quantity === null) return null
  const symbol = typeof o.symbol === 'string' && o.symbol.trim() ? o.symbol.trim() : undefined
  if ((kind === 'stock' || kind === 'crypto') && !symbol) return null
  const h: Holding = { kind, quantity }
  if (kind === 'gold') {
    // Any other unit (or none: the old lượng records) is converted to troy ounces.
    const unit = typeof o.unit === 'string' ? o.unit.toLowerCase() : 'luong'
    h.quantity = quantity * (GOLD_UNITS_TO_OZ[unit] ?? OZ_PER_LUONG)
    h.unit = 'oz'
  }
  if (symbol && kind !== 'gold') h.symbol = kind === 'stock' || kind === 'crypto' ? symbol.toUpperCase() : symbol
  if (kind === 'savings' || kind === 'cash') {
    const c = typeof o.currency === 'string' ? o.currency.toUpperCase().replace(/^USD$/, 'USDC') : 'VND'
    h.currency = isCurrency(c) ? c : 'VND'
  }
  return h
}

const sameSlot = (a: Holding, b: Holding) => a.kind === b.kind && (a.symbol ?? '').toLowerCase() === (b.symbol ?? '').toLowerCase()

/** Apply what the user just said: each update replaces the holding of the same kind + symbol; quantity 0 removes it. */
export function mergeHoldings(list: Holding[] | undefined, updates: Holding[]): Holding[] {
  let out = [...(list ?? [])]
  for (const u of updates) {
    out = out.filter(h => !sameSlot(h, u))
    if (u.quantity > 0) out.push(u)
  }
  return out
}

/** Value in USD, null when its price (or the VND rate) is missing. */
export function holdingUsd(h: Holding, prices: Prices | null, vndPerUsd: number | null): number | null {
  if (h.kind === 'savings' || h.kind === 'cash') return h.currency === 'USDC' ? h.quantity : vndPerUsd ? h.quantity / vndPerUsd : null
  if (h.kind === 'gold') return prices?.goldUsdPerOz ? h.quantity * prices.goldUsdPerOz : null
  if (h.kind === 'crypto' && STABLECOINS.has((h.symbol ?? '').toUpperCase())) return h.quantity
  const p = prices?.usd[priceKey(h)]
  return p ? h.quantity * p : null
}

export interface AllocationPart { label: string; bucket: Bucket; usd: number; holding?: Holding }

export interface Allocation {
  /** USD in each part; idle includes wallet USDC. */
  safe: number
  invest: number
  idle: number
  total: number
  parts: AllocationPart[]
  /** Holdings that could not be valued (no price yet): left out of the totals. */
  unpriced: Holding[]
  /** null until the age is known. */
  target: { safePct: number; investPct: number } | null
  /** How to place the idle money to move toward the target (USD); null without a target or idle money. */
  suggest: { toSafe: number; toInvest: number } | null
}

export const HOLDING_LABEL: Record<HoldingKind, string> = { savings: 'Savings', cash: 'Cash', gold: 'Gold', stock: 'Stock', crypto: 'Coin' }

export function partLabel(h: Holding): string {
  if (h.kind === 'stock' || h.kind === 'crypto') return h.symbol ?? HOLDING_LABEL[h.kind]
  return h.symbol ? `${HOLDING_LABEL[h.kind]} ${h.symbol}` : HOLDING_LABEL[h.kind]
}

export function allocate(input: { holdings?: Holding[]; walletUsd: number | null; cirBtcUsd: number | null; age: number | null; prices: Prices | null; vndPerUsd: number | null }): Allocation {
  const parts: AllocationPart[] = []
  const unpriced: Holding[] = []
  if (input.walletUsd !== null && input.walletUsd > 0) parts.push({ label: 'Wallet USDC', bucket: 'idle', usd: input.walletUsd })
  if (input.cirBtcUsd !== null && input.cirBtcUsd > 0) parts.push({ label: 'cirBTC', bucket: 'invest', usd: input.cirBtcUsd })
  for (const h of input.holdings ?? []) {
    const usd = holdingUsd(h, input.prices, input.vndPerUsd)
    if (usd === null) unpriced.push(h)
    else parts.push({ label: partLabel(h), bucket: bucketOf(h), usd, holding: h })
  }
  const sum = (b: Bucket) => parts.filter(p => p.bucket === b).reduce((s, p) => s + p.usd, 0)
  const safe = sum('safe'), invest = sum('invest'), idle = sum('idle')
  const total = safe + invest + idle
  const age = input.age
  const target = age !== null && age > 0 ? { safePct: Math.min(100, Math.round(age)), investPct: Math.max(0, 100 - Math.round(age)) } : null

  let suggest: Allocation['suggest'] = null
  if (target && idle > 0) {
    // Fill what each part lacks against the target; if both lack more than the idle money, share it pro rata.
    const needSafe = Math.max(0, total * target.safePct / 100 - safe)
    const needInvest = Math.max(0, total * target.investPct / 100 - invest)
    const need = needSafe + needInvest
    const k = need > idle ? idle / need : 1
    suggest = { toSafe: needSafe * k, toInvest: needInvest * k }
  }
  return { safe, invest, idle, total, parts, unpriced, target, suggest }
}
