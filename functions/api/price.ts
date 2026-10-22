/**
 * Cloudflare Pages Function — /api/price
 * BTC/USD for valuing cirBTC (backed 1:1 by BTC), cached 5 minutes.
 * Sources (public, no key), first that answers wins: Coinbase spot, then CoinGecko.
 */

const CACHE_URL = 'https://moonsafe.internal/api/price/btc-usd'

const SOURCES: Array<{ url: string; pick: (d: unknown) => number | undefined }> = [
  {
    url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
    pick: d => Number((d as { data?: { amount?: string } }).data?.amount),
  },
  {
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    pick: d => (d as { bitcoin?: { usd?: number } }).bitcoin?.usd,
  },
]

export const onRequestGet: PagesFunction = async () => {
  const cache = caches.default
  const cacheKey = new Request(CACHE_URL)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  for (const s of SOURCES) {
    try {
      const r = await fetch(s.url, { headers: { accept: 'application/json', 'user-agent': 'MoonSafe/1.0 (+https://moonsafe.app)' } })
      if (!r.ok) continue
      const usd = s.pick(await r.json())
      if (!usd || !Number.isFinite(usd) || usd <= 0) continue
      const res = Response.json({ btcUsd: usd, fetchedAt: Date.now() }, { headers: { 'Cache-Control': 'public, max-age=300' } })
      await cache.put(cacheKey, res.clone())
      return res
    } catch { /* try next source */ }
  }
  return Response.json({ error: 'no price source answered' }, { status: 502 })
}
