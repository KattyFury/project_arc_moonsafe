// Live prices for the declared holdings (/api/prices, functions/api/prices.ts). Refetched
// when the list of symbols changes and every 5 minutes. No price → the holding shows
// "no price yet" and stays out of the totals, never a guessed value.

import { useEffect, useState } from 'react'
import type { Holding } from '@/types'
import { symbolOf, type Prices } from '@/lib/allocation'
import { priceKindOf } from '@/lib/profile'

const POLL_MS = 5 * 60_000

export interface PricesState { prices: Prices | null; error: boolean }

export function usePricesState(holdings: Holding[] | undefined): PricesState {
  const list = (holdings ?? []).filter(h => h.priceSource === 'market' && h.quantity !== undefined)
  const needed = (k: 'stock' | 'crypto') => [...new Set(list.filter(h => priceKindOf(h.type) === k).map(symbolOf).filter((s): s is string => !!s))].sort().join(',')
  const stocks = needed('stock'), crypto = needed('crypto')
  const any = list.some(h => ['gold', 'stock', 'crypto'].includes(priceKindOf(h.type)))
  const [state, setState] = useState<PricesState>({ prices: null, error: false })

  useEffect(() => {
    if (!any) return
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`/api/prices?stocks=${encodeURIComponent(stocks)}&crypto=${encodeURIComponent(crypto)}`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const d = await r.json() as Prices
        if (alive) setState({ prices: { goldUsdPerOz: d.goldUsdPerOz ?? null, usd: d.usd ?? {} }, error: false })
      } catch {
        if (alive) setState(s => ({ ...s, error: true }))
      }
    }
    void load()
    const id = setInterval(() => { void load() }, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [any, stocks, crypto])

  return state
}
