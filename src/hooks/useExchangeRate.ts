import { useState, useEffect, useRef } from 'react'

const CACHE_KEY = 'moonsafe_fx_v1'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

interface CachedRate {
  vndPerUsd: number
  fetchedAt: number
}

const FALLBACK_VND_PER_USD = 25000

function readCache(): CachedRate | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedRate
    if (Date.now() - parsed.fetchedAt > CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(rate: CachedRate) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(rate)) } catch { /* ignore */ }
}

function getInitialRate(): number {
  const cached = readCache()
  return cached?.vndPerUsd ?? FALLBACK_VND_PER_USD
}

export function useExchangeRate() {
  const [vndPerUsd, setVndPerUsd] = useState<number>(getInitialRate)
  const [rateError, setRateError] = useState(false)
  const fetched = useRef(false)

  useEffect(() => {
    // If cache is still valid, no need to re-fetch
    if (readCache() || fetched.current) return
    fetched.current = true

    fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then((data: { rates?: Record<string, number> }) => {
        const rate = data?.rates?.VND
        if (rate && rate > 0) {
          setVndPerUsd(rate)
          writeCache({ vndPerUsd: rate, fetchedAt: Date.now() })
          setRateError(false)
        } else {
          setRateError(true)
        }
      })
      .catch(() => setRateError(true))
  }, [])

  const vndToUsdc = (vnd: number): bigint => {
    if (!vndPerUsd) return 0n
    const usd = vnd / vndPerUsd
    return BigInt(Math.round(usd * 1_000_000))
  }

  const usdcToVnd = (usdcUnits: bigint): number => {
    const usd = Number(usdcUnits) / 1_000_000
    return usd * vndPerUsd
  }

  return { vndPerUsd, vndToUsdc, usdcToVnd, rateError }
}
