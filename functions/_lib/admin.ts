/**
 * Who may use /admin. Two checks on every call:
 *   1. a signed-in MoonSafe account (Privy access token), and
 *   2. a message signed by one of the admin wallets, made for THAT account in the last 30 minutes (the page asks the wallet to
 *      sign once, then sends the proof with each request).
 * So a stolen Privy session alone is not enough, and a stolen proof only works for the account it was made for, for 30 minutes.
 * Admin wallets: ADMIN_WALLETS (comma separated) or the two wallets Hieu named on 2026-10-28.
 * Every action that changes something is written to an audit log in KV (kept 90 days).
 */

import { recoverMessageAddress } from 'viem'
import { privyUserId } from './privyAuth'
import type { BudgetEnv, Kv } from './budget'

export interface AdminEnv extends BudgetEnv { ADMIN_WALLETS?: string; PRIVY_APP_ID?: string }

const DEFAULT_ADMINS = ['0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6', '0xb0a842fc50ca2f013adb506ecb425476c605c071']
const PROOF_MAX_AGE_MS = 30 * 60 * 1000
const LOG_TTL = 90 * 24 * 3600

export const adminWallets = (env: AdminEnv): string[] =>
  // Set but empty = nobody is an admin (the switch to turn /admin off); unset = the two default wallets.
  (env.ADMIN_WALLETS !== undefined ? env.ADMIN_WALLETS.split(',') : DEFAULT_ADMINS).map(a => a.trim().toLowerCase()).filter(a => /^0x[0-9a-f]{40}$/.test(a))

/** The text an admin wallet signs. It names the site, so a signature collected on another site is worthless here. */
export const adminChallenge = (id: string, host: string) => `MoonSafe admin sign-in\nDomain: ${host}\nAccount: ${id}\nIssued: ${Date.now()}`

export type AdminResult = { ok: true; id: string; address: string } | { ok: false; status: number; error: string }

/** Checks the Privy session and the signed proof (header x-admin-proof: JSON { message, signature }). */
export async function requireAdmin(request: Request, env: AdminEnv): Promise<AdminResult> {
  const id = await privyUserId(request, env)
  if (!id) return { ok: false, status: 401, error: 'Please sign in again' }
  let proof: { message?: unknown; signature?: unknown }
  try { proof = JSON.parse(request.headers.get('x-admin-proof') ?? '') as typeof proof } catch { return { ok: false, status: 403, error: 'Admin proof missing' } }
  const message = typeof proof.message === 'string' ? proof.message : ''
  const m = /^MoonSafe admin sign-in\nDomain: (.+)\nAccount: (.+)\nIssued: (\d+)$/.exec(message)
  if (!m || m[2] !== id) return { ok: false, status: 403, error: 'This proof was not made for your account' }
  if (m[1] !== new URL(request.url).host) return { ok: false, status: 403, error: 'This proof was made for another site' }
  if (Date.now() - Number(m[3]) > PROOF_MAX_AGE_MS || Number(m[3]) - Date.now() > 60_000) return { ok: false, status: 403, error: 'The proof expired, sign again' }
  let signer: string
  try { signer = (await recoverMessageAddress({ message, signature: String(proof.signature) as `0x${string}` })).toLowerCase() } catch { return { ok: false, status: 403, error: 'Invalid signature' } }
  if (!adminWallets(env).includes(signer)) return { ok: false, status: 403, error: 'This wallet is not an admin wallet' }
  return { ok: true, id, address: signer }
}

export async function audit(env: BudgetEnv, who: string, action: string, detail: Record<string, unknown> = {}): Promise<void> {
  const kv = env.USERDATA as Kv | undefined
  if (!kv) return
  const ts = Date.now()
  const key = `adminlog:${String(9_999_999_999_999 - ts).padStart(13, '0')}:${Math.random().toString(36).slice(2, 8)}`
  try { await kv.put(key, JSON.stringify({ ts, who, action, detail }), { expirationTtl: LOG_TTL }) } catch { /* the action already happened */ }
}

export async function readAudit(env: BudgetEnv, limit = 100): Promise<Array<{ ts: number; who: string; action: string; detail: Record<string, unknown> }>> {
  const kv = env.USERDATA
  if (!kv?.list) return []
  const out = []
  const page = await kv.list({ prefix: 'adminlog:', limit })
  for (const k of page.keys) {
    try { const raw = await kv.get(k.name); if (raw) out.push(JSON.parse(raw)) } catch { /* skip */ }
  }
  return out
}
