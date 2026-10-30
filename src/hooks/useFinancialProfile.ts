// Finances the user told the agent (profile v2, src/types.ts). localStorage is the fast local copy;
// every change is also sent to /api/userdata (src/lib/cloud.ts) so it follows the Privy account.
// Any stored shape is read through normalizeProfile, so a v1 record is migrated on load.

import { useCallback, useState } from 'react'
import type { FinancialProfile } from '@/types'
import { cloudSave } from '@/lib/cloud'
import { applyOps, hasAnyData, normalizeProfile, type ProfileOp } from '@/lib/profile'
import { EMPTY_PROFILE } from '@/types'

const STORAGE_KEY = 'moonsafe_profile_v1'

function read(): FinancialProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as Record<string, unknown>
    const p = normalizeProfile(stored)
    // An older record is migrated once and written back, so its new ids stay the same (and dropped holdings stay dropped).
    if (stored.v !== 3) writeLocal(p)
    return p
  } catch {
    return null
  }
}

export interface ProfileState {
  profile: FinancialProfile | null
  /** The user has told the agent something. */
  known: boolean
  /** Apply what the agent recorded this turn (one save). */
  apply: (ops: ProfileOp[]) => void
  clearProfile: () => void
  /** Replace the local copy with the server's (no upload). */
  hydrate: (p: FinancialProfile | null) => void
}

function writeLocal(p: FinancialProfile | null) {
  try { if (p) localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); else localStorage.removeItem(STORAGE_KEY) } catch { /* storage blocked */ }
}

/** The local copy (migrated to v2), for the first upload to the server. */
export const readLocalProfile = read

export function useProfileState(): ProfileState {
  const [profile, setProfile] = useState<FinancialProfile | null>(read)

  const apply = useCallback((ops: ProfileOp[]) => {
    if (!ops.length) return
    setProfile(prev => {
      const next = { ...applyOps(prev ?? EMPTY_PROFILE, ops), savedAt: Date.now() }
      writeLocal(next)
      cloudSave({ profile: next })
      return next
    })
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

  return { profile, known: hasAnyData(profile), apply, clearProfile, hydrate }
}
