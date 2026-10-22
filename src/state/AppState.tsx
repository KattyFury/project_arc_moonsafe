// One shared instance of every piece of app state, so a deposit, a saved profile
// or a new rate updates every screen at once (Arc Studio's version gave each
// screen its own copy, which left the invest lock stale until reload).

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useVaultState, type VaultState } from '@/hooks/useVault'
import { useProfileState, type ProfileState } from '@/hooks/useFinancialProfile'
import { useExchangeRateState, vndToUsdc6, usdc6ToVnd, type FxState } from '@/hooks/useExchangeRate'
import { useCirBtcState, type CirBtcState } from '@/hooks/useCirBtc'
import { DASH, formatUsdc, formatVnd } from '@/lib/format'

export type Unit = 'VND' | 'USD'
const UNIT_KEY = 'moonsafe_unit_v1'

function readUnit(): Unit {
  try {
    const v = localStorage.getItem(UNIT_KEY)
    if (v === 'VND' || v === 'USD') return v
    const legacy = localStorage.getItem('moonsafe_lang_v1')
    if (legacy === 'en') return 'USD'
    if (legacy === 'vi') return 'VND'
  } catch { /* storage blocked */ }
  // Default follows the browser language.
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('vi') ? 'VND' : 'USD'
}

export interface FundMath {
  floorMonths: number | null
  /** Essential spending per month in USDC (6-dec), null if not declared or no rate. */
  monthlyExpUsdc: bigint | null
  floorUsdc: bigint | null
  /** 0–100, null if unknown. */
  floorPct: number | null
  /** Vault balance / monthly spending, in months. */
  vaultMonths: number | null
  shortfall: bigint | null
  noDebt: boolean | null
  fundOk: boolean
  investUnlocked: boolean
}

export interface AppState {
  vault: VaultState
  profile: ProfileState
  fx: FxState
  cirBtc: CirBtcState
  unit: Unit
  setUnit: (u: Unit) => void
  math: FundMath
  /** Money (6-dec USDC) in the chosen unit, "–" when unknown. */
  money: (usdc6: bigint | null | undefined) => string
  /** VND amount in the chosen unit, "–" when unknown. */
  moneyFromVnd: (vnd: number | null | undefined) => string
  vndToUsdc: (vnd: number | null | undefined) => bigint | null
}

export const AppStateContext = createContext<AppState | null>(null)
const Ctx = AppStateContext

export function AppStateProvider({ children }: { children: ReactNode }) {
  const vault = useVaultState()
  const profile = useProfileState()
  const fx = useExchangeRateState()
  const cirBtc = useCirBtcState()
  const [unit, setUnitState] = useState<Unit>(readUnit)

  const setUnit = useCallback((u: Unit) => {
    try { localStorage.setItem(UNIT_KEY, u) } catch { /* storage blocked */ }
    setUnitState(u)
  }, [])

  const rate = fx.vndPerUsd

  const vndToUsdc = useCallback((vnd: number | null | undefined) =>
    vnd === null || vnd === undefined || !rate ? null : vndToUsdc6(vnd, rate), [rate])

  const money = useCallback((u: bigint | null | undefined) => {
    if (u === null || u === undefined) return DASH
    if (unit === 'USD') return formatUsdc(u)
    return rate ? formatVnd(usdc6ToVnd(u, rate)) : DASH
  }, [unit, rate])

  const moneyFromVnd = useCallback((vnd: number | null | undefined) => {
    if (vnd === null || vnd === undefined) return DASH
    if (unit === 'VND') return formatVnd(vnd)
    return rate ? formatUsdc(vndToUsdc6(vnd, rate)) : DASH
  }, [unit, rate])

  const math = useMemo<FundMath>(() => {
    const p = profile.profile
    const floorMonths = p?.incomeStable === null || p?.incomeStable === undefined ? null : p.incomeStable ? 3 : 6
    const monthlyExpUsdc = p?.monthlyExpenses ? vndToUsdc(p.monthlyExpenses) : null
    const floorUsdc = monthlyExpUsdc !== null && floorMonths !== null ? monthlyExpUsdc * BigInt(floorMonths) : null
    const vb = vault.vaultBalance
    const floorPct = floorUsdc && vb !== null ? Math.min(100, Number((vb * 10_000n) / floorUsdc) / 100) : null
    const vaultMonths = monthlyExpUsdc && vb !== null ? Number(vb) / Number(monthlyExpUsdc) : null
    const shortfall = floorUsdc !== null && vb !== null ? (floorUsdc > vb ? floorUsdc - vb : 0n) : null
    const noDebt = p?.debtAmount === null || p?.debtAmount === undefined ? null : p.debtAmount === 0
    const fundOk = floorUsdc !== null && floorUsdc > 0n && vb !== null && vb >= floorUsdc
    const investUnlocked = profile.complete && noDebt === true && fundOk
    return { floorMonths, monthlyExpUsdc, floorUsdc, floorPct, vaultMonths, shortfall, noDebt, fundOk, investUnlocked }
  }, [profile.profile, profile.complete, vault.vaultBalance, vndToUsdc])

  const value: AppState = { vault, profile, fx, cirBtc, unit, setUnit, math, money, moneyFromVnd, vndToUsdc }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppStateProvider')
  return v
}
