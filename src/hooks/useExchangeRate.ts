// VND per USD from /api/rates (open.er-api.com, cached 24h at the edge).
// A rate fetched within 24h is reused without a request. If fetching fails we fall
// back to the last cached rate (marked stale); with no rate at all we return null
// and the UI shows "–" — never a guessed number.

import { useEffect, useState } from 'react'

const CACHE_KEY = 'moonsafe_fx_v1'
const TTL = 24 * 60 * 60 * 1000

interface Cached { vndPerUsd: number; fetchedAt: number }

function readCache(): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Cached
    return c.vndPerUsd > 0 ? c : null
  } catch { return null }
}

async function fetchRate(): Promise<number | null> {
  for (const url of ['/api/rates', 'https://open.er-api.com/v6/latest/USD']) {
    try {
      const r = await fetch(url)
      if (!r.ok) continue
      const data = await r.json() as { rates?: Record<string, number> }
      const v = data.rates?.VND
      if (v && v > 0) return v
    } catch { /* try next */ }
  }
  return null
}

export interface FxState {
  vndPerUsd: number | null
  fetchedAt: number | null
  stale: boolean
}

export function useExchangeRateState(): FxState {
  const [state, setState] = useState<FxState>(() => {
    const c = readCache()
    return c ? { vndPerUsd: c.vndPerUsd, fetchedAt: c.fetchedAt, stale: Date.now() - c.fetchedAt > TTL } : { vndPerUsd: null, fetchedAt: null, stale: false }
  })

  useEffect(() => {
    const c = readCache()
    if (c && Date.now() - c.fetchedAt <= TTL) return
    let cancelled = false
    void fetchRate().then(rate => {
      if (cancelled) return
      if (rate) {
        const now = Date.now()
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ vndPerUsd: rate, fetchedAt: now })) } catch { /* storage blocked */ }
        setState({ vndPerUsd: rate, fetchedAt: now, stale: false })
      } else if (c) {
        setState({ vndPerUsd: c.vndPerUsd, fetchedAt: c.fetchedAt, stale: true })
      }
    })
    return () => { cancelled = true }
  }, [])

  return state
}

export const vndToUsdc6 = (vnd: number, vndPerUsd: number): bigint =>
  BigInt(Math.round((vnd / vndPerUsd) * 1_000_000))

export const usdc6ToVnd = (units: bigint, vndPerUsd: number): number =>
  (Number(units) / 1_000_000) * vndPerUsd
