/**
 * "AI power": how many chat messages an account may send to the agent per day (Hieu, 2026-10-27).
 *
 *  - 20 messages a day for everyone, 60 for the owner wallet (after a one-time signature proves the account holds it).
 *  - Past that, messages come out of the "power" the user bought (a counter per account that does not expire).
 *  - A message that fails on our side is given back. Hidden app events (a card was signed, a box was confirmed) are not
 *    messages the user typed, so they have their own, higher cap that stops anyone using them to skip the limit.
 *
 * Counters and credited payments live in D1 (binding DB, functions/_lib/ledger.ts): one SQL statement per change, so parallel
 * requests cannot overwrite each other (2026-10-30). The owner flag and failed-check counter stay in KV (binding USERDATA).
 * Without USERDATA (local runs) nothing is limited.
 */

import { createPublicClient, http, recoverMessageAddress } from 'viem'
import type { BudgetEnv, Kv } from './budget'
import { audit } from './admin'
import { claims, counters, sweep, type D1Like } from './ledger'
import { DEFAULT_POWER_PAYMENT_ADDRESS, POWER_PER_PURCHASE, POWER_PRICE_NATIVE, powerMemo } from '../../src/lib/power'

export interface PowerEnv extends BudgetEnv {
  /** D1 ledger (migrations/0001_ledger.sql). Without it the counters fall back to KV. */
  DB?: D1Like
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
  const c = counters(env)
  if (!kv || !c) return null
  const [turns, extra, owner] = await Promise.all([c.get(kTurns(id)), c.get(kPower(id)), kv.get(kOwner(id))])
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
  const c = counters(env)
  if (!env.USERDATA || !c) return { ok: true, refund: async () => {} }
  await sweep(env)

  if (kind === 'event') {
    if (!(await c.incrBelow(kEvents(id), EVENT_CAP, TTL_SECONDS))) return { ok: false, message: 'Too many automatic updates today. Try again tomorrow (UTC).' }
    return { ok: true, refund: async () => { await c.add(kEvents(id), -1, TTL_SECONDS) } }
  }

  const state = await powerState(env, id)
  if (!state) return { ok: true, refund: async () => {} }
  if (await c.incrBelow(kTurns(id), state.limit, TTL_SECONDS)) {
    return { ok: true, refund: async () => { await c.add(kTurns(id), -1, TTL_SECONDS) } }
  }
  if (await c.decrIfPositive(kPower(id))) {
    return { ok: true, refund: async () => { await c.add(kPower(id), 1) } }
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
 * account's memo (src/lib/power.ts). Each transaction counts once (D1 table power_tx, kept forever; KV powertx:<hash> without D1).
 */
export async function buyPower(env: PowerEnv, id: string, txHash: string): Promise<{ ok: boolean; error?: string; retry?: boolean }> {
  const kv = env.USERDATA
  const c = counters(env), ledger = claims(env)
  if (!kv || !c || !ledger) return { ok: false, error: 'Data storage is not configured' }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return { ok: false, error: 'That is not a transaction hash' }
  const hash = txHash.toLowerCase() as `0x${string}`
  // Fail closed on a bad configuration (security review 2026-10-29): a typo in the payment address or an RPC that is not Arc mainnet
  // must never be able to credit anything.
  const pay = paymentAddress(env)
  const rpc = env.ARC_RPC || 'https://rpc.mainnet.arc.io'
  if (!/^0x[0-9a-f]{40}$/.test(pay) || !/^https:\/\//.test(rpc)) return { ok: false, error: 'Payments are not configured right now' }

  // At most 10 failed checks an hour per account: every check costs two RPC calls.
  const failKey = `buyfail:${id}:${new Date().toISOString().slice(0, 13)}`
  if ((await num(kv, failKey)) >= 10) return { ok: false, error: 'Too many attempts, try again in an hour' }
  const fail = async (error: string, retry = false) => { try { await kv.put(failKey, String((await num(kv, failKey)) + 1), { expirationTtl: 7200 }) } catch { /* advisory */ } return { ok: false, error, retry } }

  // Reserve the payment BEFORE the slow onchain check, so another account cannot take it; finalize() below lets only one
  // request credit it, even two parallel ones from the same account.
  if (!(await ledger.claim(hash, id))) return { ok: false, error: 'This payment was already counted' }
  const release = async () => { try { await ledger.release(hash, id) } catch { /* the claim stays pending for this account, which only this account can resume */ } }

  const client = createPublicClient({ transport: http(rpc, { retryCount: 1, timeout: 8000 }) })
  let tx, receipt
  try {
    if ((await client.getChainId()) !== 5042) { await release(); return fail('Payments are not configured right now') }
    [tx, receipt] = await Promise.all([client.getTransaction({ hash }), client.getTransactionReceipt({ hash })])
  } catch (e) {
    await release()
    const notFound = /could not be found|not found/i.test(String((e as Error)?.message ?? e))
    return fail(notFound ? 'The payment is not confirmed yet, try again in a moment' : 'The payment check is unavailable right now, try again in a moment', true)
  }
  if (tx.hash.toLowerCase() !== hash || receipt.transactionHash.toLowerCase() !== hash || tx.blockHash !== receipt.blockHash) { await release(); return fail('The payment could not be verified') }
  if (receipt.status !== 'success') { await release(); return fail('The payment failed onchain') }
  if (tx.to?.toLowerCase() !== pay) { await release(); return fail('The payment went to a different address') }
  if (tx.value !== POWER_PRICE_NATIVE) { await release(); return fail('The payment must be exactly 1 USDC') }
  if (tx.input.toLowerCase() !== powerMemo(id).toLowerCase()) { await release(); return fail('This payment was not made for your account') }
  if (!(await ledger.finalize(hash, id))) return { ok: false, error: 'This payment was already counted' }
  try {
    await c.add(kPower(id), POWER_PER_PURCHASE)
  } catch {
    // Paid and claimed but the credit did not land: never ask the user to pay again. The log lets MoonSafe fix it by hand.
    await audit(env, 'system', 'power_credit_failed', { hash, id })
    return { ok: false, error: 'Your payment was received but the credit is delayed. MoonSafe will add it; do not pay again.' }
  }
  return { ok: true }
}
