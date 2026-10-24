/**
 * Cloudflare Pages Function — /api/prices?stocks=SPY,AAPL&crypto=ETH,SOL
 * Live prices for the assets users declare (src/lib/allocation.ts), each cached 10 minutes.
 * Public sources, no key (tested 2026-10-24):
 * - Gold: vang.today, SJC bars 1L–10L (type SJL1L10), BUY price in VND per lượng = what the
 *   user gets selling. sjc.com.vn itself sits behind a Cloudflare challenge.
 * - US stocks / ETFs: Yahoo Finance chart API (query1, then query2), regularMarketPrice.
 * - Coins: Coinbase spot, then Binance <SYM>USDT.
 * A price no source answers is left out; the app shows that holding as "chưa có giá".
 * functions/api/chat.ts imports getPrices so the agent quotes the same numbers.
 */

import { STABLECOINS as STABLE } from '../../src/lib/allocation'

const TTL_S = 600
const SYMBOL = /^[A-Z0-9.-]{1,12}$/
const MAX_SYMBOLS = 20
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; MoonSafe/1.0; +https://moonsafe.app)', accept: 'application/json' }

async function cached(key: string, load: () => Promise<number | null>): Promise<number | null> {
  const cache = (caches as unknown as { default: Cache }).default
  const req = new Request(`https://moonsafe.internal/prices/${encodeURIComponent(key)}`)
  const hit = await cache.match(req)
  if (hit) return (await hit.json() as { v: number }).v
  const v = await load()
  if (v !== null) await cache.put(req, Response.json({ v }, { headers: { 'Cache-Control': `public, max-age=${TTL_S}` } }))
  return v
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: UA })
  if (!r.ok) throw new Error(`${r.status}`)
  return await r.json()
}

const positive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null

async function firstOf(loaders: Array<() => Promise<number | null>>): Promise<number | null> {
  for (const load of loaders) {
    try { const v = await load(); if (v !== null) return v } catch { /* try next source */ }
  }
  return null
}

const goldVnd = () => cached('gold:SJL1L10', () => firstOf([
  async () => positive((await getJson('https://www.vang.today/api/prices?type=SJL1L10') as { buy?: number }).buy),
]))

const stockUsd = (sym: string) => cached(`stock:${sym}`, () => firstOf(['query1', 'query2'].map(host => async () =>
  positive((await getJson(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`) as
    { chart?: { result?: Array<{ meta?: { regularMarketPrice?: number } }> } }).chart?.result?.[0]?.meta?.regularMarketPrice))))

const cryptoUsd = (sym: string) => STABLE.has(sym) ? Promise.resolve(1) : cached(`crypto:${sym}`, () => firstOf([
  async () => positive(Number((await getJson(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`) as { data?: { amount?: string } }).data?.amount)),
  async () => positive(Number((await getJson(`https://api.binance.com/api/v3/ticker/price?symbol=${sym}USDT`) as { price?: string }).price)),
]))

export interface PriceResult { goldVndPerLuong: number | null; usd: Record<string, number> }

const symbols = (list: string[]) => [...new Set(list.map(s => s.trim().toUpperCase()).filter(s => SYMBOL.test(s)))].slice(0, MAX_SYMBOLS)

export async function getPrices(stocks: string[], crypto: string[]): Promise<PriceResult> {
  const st = symbols(stocks), cr = symbols(crypto)
  const [gold, ...rest] = await Promise.all([goldVnd(), ...st.map(stockUsd), ...cr.map(cryptoUsd)])
  const usd: Record<string, number> = {}
  st.forEach((s, i) => { const v = rest[i]; if (v !== null) usd[`stock:${s}`] = v })
  cr.forEach((s, i) => { const v = rest[st.length + i]; if (v !== null) usd[`crypto:${s}`] = v })
  return { goldVndPerLuong: gold, usd }
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const q = new URL(request.url).searchParams
  const list = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean)
  const prices = await getPrices(list('stocks'), list('crypto'))
  return Response.json({ ...prices, fetchedAt: Date.now() }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
