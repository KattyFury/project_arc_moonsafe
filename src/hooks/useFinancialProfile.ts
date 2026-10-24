// Finances the user told the agent. localStorage is the fast local copy; every change is
// also sent to /api/userdata (src/lib/cloud.ts) so it follows the Privy account.

import { useCallback, useState } from 'react'
import { EMPTY_PROFILE, MONEY_FIELDS, type Currency, type FinancialProfile, type Holding, type MoneyField } from '@/types'
import { cloudSave } from '@/lib/cloud'
import { toHolding } from '@/lib/allocation'

const STORAGE_KEY = 'moonsafe_profile_v1'

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

const isCurrency = (c: unknown): c is Currency => c === 'VND' || c === 'USDC'

/** A money value as a plain number (VND) or {amount, currency} (what the agent sends for USDC). */
function moneyValue(v: unknown): { amount: number | null; currency?: Currency } {
  if (v && typeof v === 'object' && 'amount' in v) {
    const o = v as { amount?: unknown; currency?: unknown }
    const c = typeof o.currency === 'string' ? o.currency.toUpperCase().replace(/^USD$/, 'USDC') : undefined
    return { amount: num(o.amount), currency: isCurrency(c) ? c : undefined }
  }
  return { amount: num(v) }
}

/**
 * Accepts the current shape, the agent's shape ({amount, currency} for USDC) and
 * the Arc Studio one (monthlyEssentials / hasExternalDebt).
 */
export function normalizeProfile(raw: Record<string, unknown> | null | undefined): FinancialProfile {
  if (!raw) return { ...EMPTY_PROFILE }
  const rawUnits = (raw.units && typeof raw.units === 'object' ? raw.units : {}) as Record<string, unknown>
  const units: Partial<Record<MoneyField, Currency>> = {}
  const out: Record<MoneyField, number | null> = { monthlyIncome: null, monthlyExpenses: null, debtAmount: null, otherAssets: null }
  for (const f of MONEY_FIELDS) {
    const m = moneyValue(f === 'monthlyExpenses' && raw[f] === undefined ? raw.monthlyEssentials : raw[f])
    out[f] = m.amount
    const c = m.currency ?? (isCurrency(rawUnits[f]) ? rawUnits[f] : undefined)
    if (c && c !== 'VND') units[f] = c
  }
  // Legacy boolean: "no debt" is a real answer (0); "has debt" without an amount stays unknown.
  if (out.debtAmount === null && (raw.hasExternalDebt === false || raw.hasDebt === false)) out.debtAmount = 0
  // Only set when present, so a partial update from the agent never wipes the list.
  const holdings = Array.isArray(raw.holdings) ? raw.holdings.map(toHolding).filter((h): h is Holding => h !== null) : undefined
  return {
    ...out,
    age: num(raw.age),
    incomeStable: typeof raw.incomeStable === 'boolean' ? raw.incomeStable : null,
    units,
    ...(holdings ? { holdings } : {}),
    savedAt: num(raw.savedAt) ?? undefined,
  }
}

export const unitOf = (p: FinancialProfile | null | undefined, f: MoneyField): Currency => p?.units?.[f] ?? 'VND'

function read(): FinancialProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeProfile(JSON.parse(raw) as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Everything the floor and invest gate need. otherAssets is optional. */
export function isProfileComplete(p: FinancialProfile | null): p is FinancialProfile {
  return !!p && p.monthlyIncome !== null && p.monthlyExpenses !== null && p.monthlyExpenses > 0
    && p.debtAmount !== null && p.age !== null && p.incomeStable !== null
}

export interface ProfileState {
  profile: FinancialProfile | null
  complete: boolean
  saveProfile: (p: FinancialProfile) => void
  clearProfile: () => void
  /** Replace the local copy with the server's (no upload). */
  hydrate: (p: FinancialProfile | null) => void
}

function writeLocal(p: FinancialProfile | null) {
  try { if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); else localStorage.removeItem(STORAGE_KEY) } catch { /* storage blocked */ }
}

/** The local copy as stored, for the first upload to the server. */
export const readLocalProfile = read

export function useProfileState(): ProfileState {
  const [profile, setProfile] = useState<FinancialProfile | null>(read)

  const saveProfile = useCallback((p: FinancialProfile) => {
    const next = { ...p, savedAt: Date.now() }
    writeLocal(next)
    setProfile(next)
    cloudSave({ profile: next })
  }, [])

  const clearProfile = useCallback(() => {
    writeLocal(null)
    setProfile(null)
    cloudSave({ profile: null })
  }, [])

  const hydrate = useCallback((p: FinancialProfile | null) => {
    writeLocal(p)
    setProfile(p)
  }, [])

  return { profile, complete: isProfileComplete(profile), saveProfile, clearProfile, hydrate }
}
