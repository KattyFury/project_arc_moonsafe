// One shared instance of every piece of app state, so a deposit, a saved profile
// or a new rate updates every screen at once (Arc Studio's version gave each
// screen its own copy, which left the invest lock stale until reload).

import { CURRENCY_CHOICES } from '@/lib/features'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { cloudLoad, cloudSave, readOwner, setCloudAuth, writeOwner } from '@/lib/cloud'
import { hydrateChat, readLocalChat, writeChatExtras } from '@/hooks/useAgent'
import { useVaultState, type VaultState } from '@/hooks/useVault'
import { readLocalProfile, useProfileState, type ProfileState } from '@/hooks/useFinancialProfile'
import { normalizeProfile, walletMoveOps } from '@/lib/profile'
import { useExchangeRateState, vndToUsdc6, usdc6ToVnd, type FxState } from '@/hooks/useExchangeRate'
import { useCirBtcState, type CirBtcState } from '@/hooks/useCirBtc'
import { usePricesState, type PricesState } from '@/hooks/usePrices'
import { computeBalance, type Balance } from '@/lib/allocation'
import { DASH, formatUsdc, formatVnd } from '@/lib/format'
import type { ChatMessage } from '@/types'

export type Unit = 'VND' | 'USD'
const UNIT_KEY = 'moonsafe_unit_v1'

function readUnit(): Unit {
  // One currency for now (USD), even if VND was picked before the dropdown was locked.
  if (!CURRENCY_CHOICES) return 'USD'
  try {
    const v = localStorage.getItem(UNIT_KEY)
    if (v === 'VND' || v === 'USD') return v
  } catch { /* storage blocked */ }
  // English-first app (2026-10-24): USD unless the user picked VND in Menu.
  return 'USD'
}

/** The fund figures in 6-dec USDC for the Fund screen and the chat cards (from Balance.fund). */
export interface FundMath {
  floorMonths: number | null
  /** Spending per month in USDC (6-dec): fixed + variable + debt payments; null if not declared or no rate. */
  monthlyExpUsdc: bigint | null
  floorUsdc: bigint | null
  /** 0–100, null if unknown. */
  floorPct: number | null
  /** Vault balance / monthly spending, in months. */
  vaultMonths: number | null
  shortfall: bigint | null
  fundOk: boolean
  /** The cirBTC buy lock is open (Balance.lock, the same rule as the agent). */
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
  /** The whole picture by the MoonSafe framework, in USD (src/lib/allocation.ts). */
  balance: Balance
  /** USD amount (allocation figures) in the chosen unit. */
  moneyUsd: (usd: number | null | undefined) => string
  /** Money (6-dec USDC) in the chosen unit, "–" when unknown. */
  money: (usdc6: bigint | null | undefined) => string
  /** VND amount in the chosen unit, "–" when unknown. */
  moneyFromVnd: (vnd: number | null | undefined) => string
  vndToUsdc: (vnd: number | null | undefined) => bigint | null
  /** Server copy of profile + chat: ready once loaded (or failed and fell back to this browser). */
  cloud: { ready: boolean; error: boolean }
}

export const AppStateContext = createContext<AppState | null>(null)
const Ctx = AppStateContext

export function AppStateProvider({ children }: { children: ReactNode }) {
  const vaultRaw = useVaultState()
  const profile = useProfileState()
  const fx = useExchangeRateState()
  const cirBtcRaw = useCirBtcState()
  // Only declared money counts (Hieu, 2026-10-28), so when the APP moves USDC out of or into the connected wallet (fund deposit,
  // withdrawal, cirBTC purchase) the USDC the user declared for this wallet follows. Refs: a card keeps the function it was
  // rendered with, and the profile has moved on by the time the transaction is confirmed.
  const applyProfile = profile.apply
  const live = useRef({ profile: profile.profile, quote: cirBtcRaw.quote })
  useEffect(() => { live.current = { profile: profile.profile, quote: cirBtcRaw.quote } })
  const vault = useMemo<VaultState>(() => ({
    ...vaultRaw,
    deposit: async (amount: bigint) => { await vaultRaw.deposit(amount); applyProfile(walletMoveOps(live.current.profile, -Number(amount) / 1_000_000)) },
    withdraw: async (amount: bigint) => { await vaultRaw.withdraw(amount); applyProfile(walletMoveOps(live.current.profile, Number(amount) / 1_000_000)) },
  }), [vaultRaw, applyProfile])
  const cirBtc = useMemo<CirBtcState>(() => ({
    ...cirBtcRaw,
    execute: async () => {
      const spent = Number(live.current.quote?.amountInUsdc ?? 0)
      const ok = await cirBtcRaw.execute()
      if (ok && spent > 0) applyProfile(walletMoveOps(live.current.profile, -spent))
      return ok
    },
  }), [cirBtcRaw, applyProfile])
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
        // A server record that exists (updatedAt > 0) is the truth: an empty field there means it was deleted on another device,
        // so the local copy is dropped instead of being uploaded again. Only an account with no server record yet uploads its local copy.
        const synced = typeof data?.updatedAt === 'number' && data.updatedAt > 0
        if (data?.profile && typeof data.profile === 'object') {
          const raw = data.profile as Record<string, unknown>
          const p = normalizeProfile(raw)
          hydrate(p)
          // A v1 record is migrated once and saved back, so its new ids stay the same.
          if (raw.v !== 2) cloudSave({ profile: p })
        } else if (synced) hydrate(null)
        else { const local = readLocalProfile(); if (local) cloudSave({ profile: local }) }
        if (Array.isArray(data?.chat) && data.chat.length) hydrateChat(data.chat as ChatMessage[])
        else if (synced) { hydrateChat(null); writeChatExtras(null) }
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

  const prices = usePricesState(profile.profile?.holdings)
  const wb = vault.walletBalance
  const vb = vault.vaultBalance
  const cirUsdc6 = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const balance = useMemo(() => computeBalance({
    profile: profile.profile,
    walletUsd: wb !== null ? Number(wb) / 1_000_000 : null,
    vaultUsd: vb !== null ? Number(vb) / 1_000_000 : null,
    cirBtcUsd: cirUsdc6 !== null ? Number(cirUsdc6) / 1_000_000 : null,
    prices: prices.prices,
    vndPerUsd: rate,
  }), [profile.profile, wb, vb, cirUsdc6, prices.prices, rate])

  const math = useMemo<FundMath>(() => {
    const f = balance.fund
    const u6 = (n: number | null) => n === null ? null : BigInt(Math.round(n * 1_000_000))
    const spending = balance.cashflow.spending
    const floorUsdc = u6(f.floorUsd)
    return {
      floorMonths: spending !== null ? f.floorMonths : null,
      monthlyExpUsdc: u6(spending),
      floorUsdc,
      floorPct: f.floorUsd && vb !== null ? Math.min(100, Number(vb) / 1_000_000 / f.floorUsd * 100) : null,
      vaultMonths: f.months,
      shortfall: u6(f.gap),
      fundOk: f.met,
      investUnlocked: balance.lock.open,
    }
  }, [balance, vb])

  const moneyUsd = useCallback((usd: number | null | undefined) =>
    usd === null || usd === undefined || !Number.isFinite(usd) ? DASH : money(BigInt(Math.round(usd * 1_000_000))), [money])

  const value: AppState = { vault, profile, fx, cirBtc, unit, setUnit, math, prices, balance, moneyUsd, money, moneyFromVnd, vndToUsdc, cloud }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp outside AppStateProvider')
  return v
}
