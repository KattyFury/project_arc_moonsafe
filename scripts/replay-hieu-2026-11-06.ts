// Hieu's three chats of 2026-11-06, replayed through the real /api/chat handler on OpenAI (the main model), with a hard token cap.
//   1. "I have 20$ in bank want to make it safety" → only Traditional was offered while Crypto had room too.
//   2. "I just buy 30$ of gold" with $10 of gold listed → saved as $30 instead of $40.
//   3. "I just buy enough BTC" after buying cirBTC in the app → asked again, then "Crypto is $30" while the wallet made it about $40.
// State as the app had it: age 21, split 50/50, fund full ($1 a month of spending), $10 of gold, cirBTC read onchain.
// Run: bun scripts/replay-hieu-2026-11-06.ts --budget 400000   (needs OPENAI_API_KEY in .dev.vars; prints the token use)

import { readFileSync } from 'node:fs'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { applyOps, normalizeProfile, readOps, type ProfileOp } from '../src/lib/profile'
import { buildRecordOps, recordSummary, type RecordRequest } from '../src/lib/record'
import type { AssetType, FinancialProfile } from '../src/types'

const flag = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1] }
const CAP = Number(flag('--budget') ?? 0)
if (!Number.isInteger(CAP) || CAP <= 0 || CAP > 1_000_000) throw new Error('Give --budget (tokens, at most 1,000,000).')
const key = readFileSync('.dev.vars', 'utf8').split(/\r?\n/).find(l => l.startsWith('OPENAI_API_KEY='))?.slice(15).trim().replace(/^["']|["']$/g, '')
if (!key) throw new Error('No OPENAI_API_KEY in .dev.vars')

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'replay', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'replay' }).setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2')
  .setSubject('did:privy:replay').setIssuedAt().setExpirationTime('2h').sign(privateKey)
let used = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = url instanceof Request ? url.url : String(url)
  if (u.includes('auth.privy.io')) return Response.json({ keys: [jwk] })
  if (u.includes('api.anthropic.com')) throw new Error('OpenAI only')
  if (u.includes('api.openai.com')) {
    if (used >= CAP) return Response.json({ error: { message: 'replay budget reached' } }, { status: 429 })
    const res = await realFetch(url as never, init)
    const data = await res.clone().json().catch(() => ({})) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
    used += (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)
    return res
  }
  if (/open\.er-api\.com/.test(u)) return Response.json({ result: 'success', rates: { VND: 25000 } })
  return Response.json({ usd: {}, goldUsdPerOz: null })
}) as typeof fetch
;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }
const store = new Map<string, string>()
const env = { OPENAI_API_KEY: key, USERDATA: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } },
  FREE_TURNS_PER_DAY: '10000', USER_DAILY_TOKEN_BUDGET: String(CAP), DAILY_TOKEN_BUDGET: String(CAP) }
const handler = '../functions/api/chat'
const { onRequestPost } = await import(handler) as { onRequestPost: (c: { request: Request; env: typeof env }) => Promise<Response> }

const H = (o: Record<string, unknown>) => ({ priceSource: 'self', rebalanceable: true, updatedAt: 1, currency: 'USDC', ...o })
const base = () => normalizeProfile({ v: 2, age: 21, ageDeclined: false, incomeStable: true, dependents: 0, soleEarner: null, debtsComplete: true, noNearGoal: true, cryptoSplit: 50, debts: [],
  incomes: [{ id: 'i', name: 'Pay', monthly: 2, currency: 'USDC', kind: 'active', updatedAt: 1 }],
  expenses: [{ id: 'e', name: 'Spending', monthly: 1, currency: 'USDC', kind: 'variable', updatedAt: 1 }],
  holdings: [H({ id: 'g', type: 'gold_physical', name: 'Gold', value: 10 })] })
// The plan was already given in the real chat: one earlier reply in history so the agent is past the plan.
const history = [{ role: 'user', content: 'what next?' }, { role: 'assistant', content: 'Your emergency fund is full. Now on to investing. Which part would you like to fill first?' }]

type Msg = { role: string; content: string }
async function turn(messages: Msg[], profile: FinancialProfile, cir: number) {
  const req = new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, context: { profile, walletUsdc: 37, vaultUsdc: 3, cirBtcUsdc: cir, hasVault: true, vaultFeeUsdc: 1 } }) })
  return await (await onRequestPost({ request: req, env })).json() as { content: string; ops?: unknown[]; actions?: Array<{ type: string; items?: Array<{ text: string; ops: ProfileOp[] }>; amount?: { amount: number }; holdingType?: string; name?: string; safety?: boolean }> }
}

/** Plays the user's lines; a confirm card is accepted the way the app does it (all items saved, then the app event). */
async function play(name: string, lines: string[], profile: FinancialProfile, cir: number) {
  console.log(`\n===== ${name} =====`)
  const messages: Msg[] = [...history]
  for (const line of lines) {
    messages.push({ role: 'user', content: line })
    const r = await turn(messages, profile, cir)
    console.log(`USER: ${line}\nAPP:  ${r.content}`)
    messages.push({ role: 'assistant', content: r.content })
    profile = applyOps(profile, readOps(r.ops ?? []))
    const card = r.actions?.find(a => a.type === 'confirm_items')
    if (card?.items?.length) {
      console.log(`CARD: ${card.items.map(i => i.text).join(' | ')}`)
      profile = applyOps(profile, card.items.flatMap(i => i.ops))
      const ev = `[app event] The user reviewed the items: saved: ${card.items.map(i => i.text).join('; ')}. skipped: none.`
      messages.push({ role: 'user', content: ev })
      const r2 = await turn(messages, profile, cir)
      console.log(`(confirmed)\nAPP:  ${r2.content}`)
      messages.push({ role: 'assistant', content: r2.content })
      profile = applyOps(profile, readOps(r2.ops ?? []))
    }
    const rec = r.actions?.find(a => a.type === 'confirm_record')
    if (rec?.amount && rec.holdingType && rec.name) {
      // The box: "new money" picked, Confirm tapped, as Hieu did.
      const req: RecordRequest = { amountUsd: rec.amount.amount, holdingType: rec.holdingType as AssetType, name: rec.name, source: null, ...(rec.safety ? { safety: true } : {}) }
      const summary = recordSummary(req, { kind: 'new' }, profile)
      profile = applyOps(profile, buildRecordOps(profile, req, { kind: 'new' }, 25000))
      console.log(`BOX: ${summary}`)
      messages.push({ role: 'user', content: `[app event] The user confirmed recording: ${summary}` })
      const r3 = await turn(messages, profile, cir)
      console.log(`(confirmed)
APP:  ${r3.content}`)
      messages.push({ role: 'assistant', content: r3.content })
    }
  }
  console.log(`holdings now: ${profile.holdings.map(h => `${h.name} ${h.value ?? h.quantity}`).join(', ')}`)
  return profile
}

const p1 = await play('1. bank $20 as Safety', ['I have 20$ in bank want to make it safety'], base(), 10.72)
await play('2. bought $30 more gold', ['I just buy 30$ of gold'], p1, 10.72)
const p3 = applyOps(p1, [{ op: 'set_holding', id: 'g', patch: { value: 40 } }])
await play('3. bought cirBTC in the app', ['I just buy enough BTC', 'I bought it already, now I have over sub it'], p3, 40.7)
console.log(`\ntokens used: ${used.toLocaleString('en-US')} (cap ${CAP.toLocaleString('en-US')})`)
