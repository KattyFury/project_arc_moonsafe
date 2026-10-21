import { useState, useCallback } from 'react'
import type { FinancialProfile } from '@/types'

const STORAGE_KEY = 'moonsafe_profile_v1'

function readFromStorage(): FinancialProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FinancialProfile
  } catch {
    return null
  }
}

function writeToStorage(profile: FinancialProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // ignore write errors
  }
}

export function useFinancialProfile() {
  const [profile, setProfileState] = useState<FinancialProfile | null>(readFromStorage)

  const saveProfile = useCallback((p: FinancialProfile) => {
    const updated = { ...p, savedAt: Date.now() }
    writeToStorage(updated)
    setProfileState(updated)
  }, [])

  const clearProfile = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setProfileState(null)
  }, [])

  // Minimum vault floor in USDC (6-decimal integer)
  // Spec: 3 months essentials if stable income, 6 months if not
  const floorUsdc = useCallback((p: FinancialProfile | null): number | null => {
    if (!p || p.monthlyEssentials === null) return null
    // Convert VND to USD at cached rate — we use profile.monthlyEssentials in VND,
    // but vault stores USDC. We store/display in USDC units externally.
    // The hook returns the floor in terms of "months of essentials" value.
    // Caller must multiply by USDC per month value.
    return null // caller handles currency conversion
  }, [])

  const vaultFloorMonths = useCallback((p: FinancialProfile | null): number => {
    if (!p) return 3
    return p.incomeStable ? 3 : 6
  }, [])

  // Max invest ratio by age: Normal = 110 - age, Risky = 120 - age (capped 0–100)
  const maxInvestRatio = useCallback((age: number) => ({
    normal: Math.min(100, Math.max(0, 110 - age)) / 100,
    risky: Math.min(100, Math.max(0, 120 - age)) / 100,
  }), [])

  const canInvest = useCallback((p: FinancialProfile | null, vaultBalance: bigint, floorUsdcAmount: bigint): boolean => {
    if (!p) return false
    if (p.hasExternalDebt || p.hasDebt) return false
    if (vaultBalance < floorUsdcAmount) return false
    return true
  }, [])

  return { profile, saveProfile, clearProfile, vaultFloorMonths, maxInvestRatio, canInvest, floorUsdc }
}
