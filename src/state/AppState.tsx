// One shared instance of every piece of app state, so a deposit, a saved profile
// or a new rate updates every screen at once (Arc Studio's version gave each
// screen its own copy, which left the invest lock stale until reload).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { cloudLoad, cloudSave, readOwner, setCloudAuth, writeOwner } from '@/lib/cloud'
import { hydrateChat, readLocalChat } from '@/hooks/useAgent'
import { useVaultState, type VaultState } from '@/hooks/useVault'
import { normalizeProfile, readLocalProfile, useProfileState, type ProfileState } from '@/hooks/useFinancialProfile'
import { useExchangeRateState, vndToUsdc6, usdc6ToVnd, type FxState } from '@/hooks/useExchangeRate'
import { useCirBtcState, type CirBtcState } from '@/hooks/useCirBtc'
import { usePricesState, type PricesState } from '@/hooks/usePrices'
import { allocate, type Allocation } from '@/lib/allocation'
import { DASH, formatUsdc, formatVnd } from '@/lib/format'
import { unitOf } from '@/hooks/useFinancialProfile'
import type { ChatMessage, FinancialProfile, MoneyField } from '@/types'

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
  prices: PricesState
  /** Safe / invest / idle split of the money outside the fund, in USD. */
  alloc: Allocation
  /** USD amount (allocation figures) in the chosen unit. */
  moneyUsd: (usd: number | null | undefined) => string
  /** Money (6-dec USDC) in the chosen unit, "–" when unknown. */
  money: (usdc6: bigint | null | undefined) => string
  /** VND amount in the chosen unit, "–" when unknown. */
  moneyFromVnd: (vnd: number | null | undefined) => string
  /** A declared money field (typed in VND or USDC) as 6-dec USDC; null if unknown. */
  fieldUsdc: (p: FinancialProfile | null | undefined, f: MoneyField) => bigint | null
  /** A declared money field shown in the chosen display unit. */
  moneyOfField: (p: FinancialProfile | null | undefined, f: MoneyField) => string
  vndToUsdc: (vnd: number | null | undefined) => bigint | null
  /** Server copy of profile + chat: ready once loaded (or failed and fell back to this browser). */
  cloud: { ready: boolean; error: boolean }
}

export const AppStateContext = createContext<AppState | null>(null)
const Ctx = AppStateContext

export function AppStateProvider({ children }: { children: ReactNode }) {
  const vault = useVaultState()
  const profile = useProfileState()
  const fx = useExchangeRateState()
  const cirBtc = useCirBtcState()
  const [unit, setUnitState] = useState<Unit>(readUnit)
  const { user, getAccessToken } = usePrivy()
  const userId = user?.id ?? null
  const [cloud, setCloud] = useState({ ready: false, error: false })

  // Load the account's profile + chat from the server. First time on an account, whatever
  // this browser already holds (from before the server copy existed) is uploaded instead.
  useEffect(() => {
    if (!userId) { setCloudAuth(null); setCloud({ ready: true, error: false }); return }
    setCloudAuth(getAccessToken)
    let alive = true
    const hydrate = profile.hydrate
    void (async () => {
      const owner = readOwner()
      if (owner && owner !== userId) { hydrate(null); hydrateChat(null) }
      writeOwner(userId)
      try {
        const data = await cloudLoad()
        if (!alive) return
        if (data?.profile && typeof data.profile === 'object') hydrate(normalizeProfile(data.profile as Record<string, unknown>))
        else { const local = readLocalProfile(); if (local) cloudSave({ profile: local }) }
        if (Array.isArray(data?.chat) && data.chat.length) hydrateChat(data.chat as ChatMessage[])
        else { const local = readLocalChat(); if (local.length) cloudSave({ chat: local }) }
        setCloud({ ready: true, error: false })
      } catch (e) {
        console.error('cloud load failed', e)
        if (alive) setCloud({ ready: true, error: true })
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per signed-in account
  }, [userId])

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

  const fieldUsdc = useCallback((p: FinancialProfile | null | undefined, f: MoneyField): bigint | null => {
    const v = p?.[f]
    if (v === null || v === undefined) return null
    return unitOf(p, f) === 'USDC' ? BigInt(Math.round(v * 1_000_000)) : vndToUsdc(v)
  }, [vndToUsdc])

  const moneyOfField = useCallback((p: FinancialProfile | null | undefined, f: MoneyField): string => {
    const v = p?.[f]
    if (v === null || v === undefined) return DASH
    return unitOf(p, f) === 'USDC' ? money(BigInt(Math.round(v * 1_000_000))) : moneyFromVnd(v)
  }, [money, moneyFromVnd])

  const math = useMemo<FundMath>(() => {
    const p = profile.profile
    const floorMonths = p?.incomeStable === null || p?.incomeStable === undefined ? null : p.incomeStable ? 3 : 6
    const monthlyExpUsdc = p?.monthlyExpenses ? fieldUsdc(p, 'monthlyExpenses') : null
    const floorUsdc = monthlyExpUsdc !== null && floorMonths !== null ? monthlyExpUsdc * BigInt(floorMonths) : null
    const vb = vault.vaultBalance
    const floorPct = floorUsdc && vb !== null ? Math.min(100, Number((vb * 10_000n) / floorUsdc) / 100) : null
    const vaultMonths = monthlyExpUsdc && vb !== null ? Number(vb) / Number(monthlyExpUsdc) : null
    const shortfall = floorUsdc !== null && vb !== null ? (floorUsdc > vb ? floorUsdc - vb : 0n) : null
    const noDebt = p?.debtAmount === null || p?.debtAmount === undefined ? null : p.debtAmount === 0
    const fundOk = floorUsdc !== null && floorUsdc > 0n && vb !== null && vb >= floorUsdc
    const investUnlocked = profile.complete && noDebt === true && fundOk
    return { floorMonths, monthlyExpUsdc, floorUsdc, floorPct, vaultMonths, shortfall, noDebt, fundOk, investUnlocked }
  }, [profile.profile, profile.complete, vault.vaultBalance, fieldUsdc])

  const prices = usePricesState(profile.profile?.holdings)
  const wb = vault.walletBalance
  const cirUsdc6 = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const alloc = useMemo(() => allocate({
    holdings: profile.profile?.holdings,
    walletUsd: wb !== null ? Number(wb) / 1_000_000 : null,
    cirBtcUsd: cirUsdc6 !== null ? Number(cirUsdc6) / 1_000_000 : null,
    age: profile.profile?.age ?? null,
    prices: prices.prices,
    vndPerUsd: rate,
  }), [profile.profile, wb, cirUsdc6, prices.prices, rate])

  const moneyUsd = useCallback((usd: number | null | undefined) =>
    usd === null || usd === undefined || !Number.isFinite(usd) ? DASH : money(BigInt(Math.round(usd * 1_000_000))), [money])

  const value: AppState = { vault, profile, fx, cirBtc, unit, setUnit, math, prices, alloc, moneyUsd, money, moneyFromVnd, vndToUsdc, fieldUsdc, moneyOfField, cloud }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppStateProvider')
  return v
}
