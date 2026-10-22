/**
 * Cloudflare Pages Function — /api/price
 * BTC/USD from CoinGecko's public simple-price endpoint (no key), cached 5 minutes.
 * cirBTC is backed 1:1 by BTC, so this values the user's cirBTC holdings.
 */

const UPSTREAM = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'

export const onRequestGet: PagesFunction = async ({ request }) => {
  const cache = caches.default
  const cacheKey = new Request(UPSTREAM, request)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  try {
    const r = await fetch(UPSTREAM, { headers: { accept: 'application/json' } })
    if (!r.ok) return Response.json({ error: `upstream ${r.status}` }, { status: 502 })
    const data = await r.json() as { bitcoin?: { usd?: number } }
    const usd = data.bitcoin?.usd
    if (!usd || usd <= 0) return Response.json({ error: 'no price' }, { status: 502 })
    const res = Response.json({ btcUsd: usd, fetchedAt: Date.now() }, { headers: { 'Cache-Control': 'public, max-age=300' } })
    await cache.put(cacheKey, res.clone())
    return res
  } catch {
    return Response.json({ error: 'fetch failed' }, { status: 502 })
  }
}
