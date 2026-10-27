// "AI power": the chat messages an account may send to the agent per day (server: functions/_lib/quota.ts).
// The server also returns the state with every chat reply, so the meter stays current without extra requests.

import { useCallback, useEffect, useState } from 'react'
import { authHeader } from '@/lib/cloud'

export interface AiPower {
  /** Free messages used today. */
  used: number
  /** Free messages per day for this account. */
  limit: number
  /** Messages the user charged (bought) and has not used yet. */
  extra: number
  boosted: boolean
  /** When the free allowance resets (ms since epoch, 00:00 UTC). */
  resetsAt: number
  canRecharge: boolean
  ownerWallet: string
  ownerVerified: boolean
}

export const messagesLeft = (p: AiPower) => Math.max(0, p.limit - p.used) + p.extra
export const isOutOfPower = (p: AiPower | null) => !!p && messagesLeft(p) <= 0

async function call(method: 'GET' | 'POST', body?: unknown): Promise<Record<string, unknown> | null> {
  const headers = await authHeader()
  if (!headers.Authorization) return null
  const res = await fetch('/api/power', {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`)
  return data
}

export function useAiPower() {
  const [power, setPower] = useState<AiPower | null>(null)

  const refresh = useCallback(async () => {
    try {
      const d = await call('GET')
      if (d?.power) setPower(d.power as AiPower)
    } catch { /* the meter just stays hidden */ }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  /** The owner wallet signs a short text once; the server then gives this account the owner allowance. */
  const verifyOwner = useCallback(async (sign: (message: string) => Promise<string>) => {
    const c = await call('POST', { action: 'owner-challenge' })
    const challenge = typeof c?.challenge === 'string' ? c.challenge : ''
    if (!challenge) throw new Error('Could not start the check')
    const signature = await sign(challenge)
    const d = await call('POST', { action: 'verify-owner', challenge, signature })
    if (d?.power) setPower(d.power as AiPower)
  }, [])

  return { power, setPower, refresh, verifyOwner }
}
