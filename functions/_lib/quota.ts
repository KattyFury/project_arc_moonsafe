/**
 * "AI power": how many chat messages an account may send to the agent per day (Hieu, 2026-10-27).
 *
 *  - 20 messages a day for everyone, 60 for the owner wallet (after a one-time signature proves the account holds it).
 *  - Past that, messages come out of the "power" the user bought (a counter per account that does not expire).
 *  - A message that fails on our side is given back. Hidden app events (a card was signed, a box was confirmed) are not
 *    messages the user typed, so they have their own, higher cap that stops anyone using them to skip the limit.
 *
 * Counters live in KV (binding USERDATA), per UTC day. Without the binding (local runs) nothing is limited.
 * KV has no increment: a parallel request can slip through now and then, which is fine for a daily allowance.
 */

import { createPublicClient, http, recoverMessageAddress } from 'viem'
import type { BudgetEnv, Kv } from './budget'
import { DEFAULT_POWER_PAYMENT_ADDRESS, POWER_PER_PURCHASE, POWER_PRICE_NATIVE, powerMemo } from '../../src/lib/power'

export interface PowerEnv extends BudgetEnv {
  FREE_TURNS_PER_DAY?: string
  OWNER_TURNS_PER_DAY?: string
  /** Wallet whose holder gets the bigger allowance. Public value (it is the factory owner). */
  OWNER_WALLET?: string
  /** Where power purchases are paid (default: the owner wallet, Hieu 2026-10-29). */
  POWER_PAYMENT_ADDRESS?: string
  /** RPC used to check purchases (default: Arc mainnet). */
  ARC_RPC?: string
}

export const DEFAULT_FREE = 20
export const DEFAULT_OWNER = 60
const EVENT_CAP = 20
const DEFAULT_OWNER_WALLET = '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6'
const CHALLENGE_MAX_AGE_MS = 10 * 60 * 1000
const TTL_SECONDS = 2 * 24 * 3600

export interface PowerState {
  /** Free messages used today (never above `limit`). */
  used: number
  /** Free messages per day for this account. */
  limit: number
  /** Bought messages left. */
  extra: number
  boosted: boolean
  /** When the free allowance resets (ms since epoch, 00:00 UTC). */
  resetsAt: number
  canRecharge: boolean
  /** Where a purchase is paid, and what it costs and gives. */
  paymentAddress: string
  pricePerPurchase: string
  messagesPerPurchase: number
  ownerWallet: string
  ownerVerified: boolean
}

export type Turn =
  | { ok: true; refund: () => Promise<void> }
  | { ok: false; message: string }

const day = () => new Date().toISOString().slice(0, 10)
const resetsAt = () => { const d = new Date(); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) }
const kTurns = (id: string) => `turns:${day()}:${id}`
const kEvents = (id: string) => `events:${day()}:${id}`
const kPower = (id: string) => `power:${id}`
const kOwner = (id: string) => `owner:${id}`
const num = async (kv: Kv, key: string) => { const n = Number(await kv.get(key)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }
const limitOf = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback }
export const ownerWallet = (env: PowerEnv) => (env.OWNER_WALLET || DEFAULT_OWNER_WALLET).toLowerCase()
const paymentAddress = (env: PowerEnv) => (env.POWER_PAYMENT_ADDRESS || DEFAULT_POWER_PAYMENT_ADDRESS).toLowerCase()

export async function powerState(env: PowerEnv, id: string): Promise<PowerState | null> {
  const kv = env.USERDATA
  if (!kv) return null
  const [turns, extra, owner] = await Promise.all([num(kv, kTurns(id)), num(kv, kPower(id)), kv.get(kOwner(id))])
  const verified = owner !== null && owner.toLowerCase() === ownerWallet(env)
  const limit = verified ? limitOf(env.OWNER_TURNS_PER_DAY, DEFAULT_OWNER) : limitOf(env.FREE_TURNS_PER_DAY, DEFAULT_FREE)
  return {
    used: Math.min(turns, limit), limit, extra, boosted: verified, resetsAt: resetsAt(),
    canRecharge: true, paymentAddress: paymentAddress(env), pricePerPurchase: POWER_PRICE_NATIVE.toString(), messagesPerPurchase: POWER_PER_PURCHASE,
    ownerWallet: ownerWallet(env), ownerVerified: verified,
  }
}

const OUT_OF_POWER = 'You are out of AI power for today. Recharge to keep chatting, or come back after the reset at 00:00 UTC.'

/** Takes one message (or one hidden event) from the allowance. Call refund() if the reply could not be produced. */
export async function takeTurn(env: PowerEnv, id: string, kind: 'message' | 'event'): Promise<Turn> {
  const kv = env.USERDATA
  if (!kv) return { ok: true, refund: async () => {} }
  const put = (key: string, n: number, ttl?: number) => kv.put(key, String(Math.max(0, n)), ttl ? { expirationTtl: ttl } : undefined)

  if (kind === 'event') {
    const n = await num(kv, kEvents(id))
    if (n >= EVENT_CAP) return { ok: false, message: 'Too many automatic updates today. Try again tomorrow (UTC).' }
    await put(kEvents(id), n + 1, TTL_SECONDS)
    return { ok: true, refund: async () => { await put(kEvents(id), (await num(kv, kEvents(id))) - 1, TTL_SECONDS) } }
  }

  const state = await powerState(env, id)
  if (!state) return { ok: true, refund: async () => {} }
  const turns = await num(kv, kTurns(id))
  if (turns < state.limit) {
    await put(kTurns(id), turns + 1, TTL_SECONDS)
    return { ok: true, refund: async () => { await put(kTurns(id), (await num(kv, kTurns(id))) - 1, TTL_SECONDS) } }
  }
  if (state.extra > 0) {
    await put(kPower(id), state.extra - 1)
    return { ok: true, refund: async () => { await put(kPower(id), (await num(kv, kPower(id))) + 1) } }
  }
  return { ok: false, message: OUT_OF_POWER }
}

/** The text the owner wallet signs once to prove it holds the key. Bound to the account and to the time. */
export function ownerChallenge(id: string): string {
  return `MoonSafe owner check\nAccount: ${id}\nIssued: ${Date.now()}`
}

/** Checks the signed challenge and, if it comes from the owner wallet, remembers this account as the owner. */
export async function verifyOwner(env: PowerEnv, id: string, challenge: string, signature: string): Promise<{ ok: boolean; error?: string }> {
  const kv = env.USERDATA
  if (!kv) return { ok: false, error: 'Data storage is not configured' }
  const m = /^MoonSafe owner check\nAccount: (.+)\nIssued: (\d+)$/.exec(challenge)
  if (!m || m[1] !== id) return { ok: false, error: 'This check was not made for your account' }
  if (Math.abs(Date.now() - Number(m[2])) > CHALLENGE_MAX_AGE_MS) return { ok: false, error: 'The check expired, try again' }
  let signer: string
  try { signer = (await recoverMessageAddress({ message: challenge, signature: signature as `0x${string}` })).toLowerCase() } catch { return { ok: false, error: 'Invalid signature' } }
  if (signer !== ownerWallet(env)) return { ok: false, error: 'This wallet is not the owner wallet' }
  await kv.put(kOwner(id), signer)
  return { ok: true }
}

/**
 * Credits one purchase: the transaction must have succeeded on Arc, pay exactly 1 USDC to the payment address and carry this
 * account's memo (src/lib/power.ts). Each transaction counts once (KV key powertx:<hash>, kept forever).
 */
export async function buyPower(env: PowerEnv, id: string, txHash: string): Promise<{ ok: boolean; error?: string; retry?: boolean }> {
  const kv = env.USERDATA
  if (!kv) return { ok: false, error: 'Data storage is not configured' }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, error: 'That is not a transaction hash' }
  const hash = txHash.toLowerCase() as `0x${string}`
  if (await kv.get(`powertx:${hash}`)) return { ok: false, error: 'This payment was already counted' }
  const client = createPublicClient({ transport: http(env.ARC_RPC || 'https://rpc.mainnet.arc.io') })
  let tx, receipt
  try {
    [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
  } catch {
    return { ok: false, retry: true, error: 'The payment is not confirmed yet, try again in a moment' }
  }
  if (receipt.status !== 'success') return { ok: false, error: 'The payment failed onchain' }
  if (tx.to?.toLowerCase() !== paymentAddress(env)) return { ok: false, error: 'The payment went to a different address' }
  if (tx.value !== POWER_PRICE_NATIVE) return { ok: false, error: 'The payment must be exactly 1 USDC' }
  if (tx.input.toLowerCase() !== powerMemo(id).toLowerCase()) return { ok: false, error: 'This payment was not made for your account' }
  await kv.put(`powertx:${hash}`, id)
  await kv.put(kPower(id), String((await num(kv, kPower(id))) + POWER_PER_PURCHASE))
  return { ok: true }
}
