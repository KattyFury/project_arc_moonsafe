// Self-declared finances, stored only in this browser (localStorage, try/catch).

import { useCallback, useState } from 'react'
import { EMPTY_PROFILE, type FinancialProfile } from '@/types'

const STORAGE_KEY = 'moonsafe_profile_v1'

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

/** Accepts the current shape and the Arc Studio one (monthlyEssentials / hasExternalDebt). */
export function normalizeProfile(raw: Record<string, unknown> | null | undefined): FinancialProfile {
  if (!raw) return { ...EMPTY_PROFILE }
  let debt = num(raw.debtAmount)
  // Legacy boolean: "no debt" is a real answer (0); "has debt" without an amount stays unknown.
  if (debt === null && (raw.hasExternalDebt === false || raw.hasDebt === false)) debt = 0
  return {
    monthlyIncome: num(raw.monthlyIncome),
    monthlyExpenses: num(raw.monthlyExpenses) ?? num(raw.monthlyEssentials),
    debtAmount: debt,
    otherAssets: num(raw.otherAssets),
    age: num(raw.age),
    incomeStable: typeof raw.incomeStable === 'boolean' ? raw.incomeStable : null,
    savedAt: num(raw.savedAt) ?? undefined,
  }
}

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
}

export function useProfileState(): ProfileState {
  const [profile, setProfile] = useState<FinancialProfile | null>(read)

  const saveProfile = useCallback((p: FinancialProfile) => {
    const next = { ...p, savedAt: Date.now() }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* storage blocked */ }
    setProfile(next)
  }, [])

  const clearProfile = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* storage blocked */ }
    setProfile(null)
  }, [])

  return { profile, complete: isProfileComplete(profile), saveProfile, clearProfile }
}
