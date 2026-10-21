/**
 * Cloudflare Pages Function — /api/rates
 * Proxies exchange rate requests from open.er-api.com.
 * Caches for 24 hours via CF Cache API.
 */

interface Env {
  EXCHANGE_RATE_API_KEY?: string
}

export const onRequestGet: PagesFunction<Env> = async ({ request }) => {
  const cacheKey = new Request('https://open.er-api.com/v6/latest/USD', request)
  const cache = caches.default

  const cached = await cache.match(cacheKey)
  if (cached) {
    return new Response(cached.body, {
      headers: {
        ...Object.fromEntries(cached.headers.entries()),
        'X-Cache': 'HIT',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  try {
    const upstream = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Rate fetch failed' }), { status: 502 })
    }

    const data = await upstream.json()
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
        'X-Cache': 'MISS',
      },
    })

    // Cache for 24 hours
    const toCache = response.clone()
    await cache.put(cacheKey, toCache)

    return response
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch rates' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
