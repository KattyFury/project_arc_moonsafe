/**
 * The counters that must not lose a write: today's messages and hidden events, bought messages ("power"), and the list of
 * payments already credited (audit 2026-10-29: KV has no increment, so two parallel requests could both read 19 and both write 20,
 * or both credit one payment).
 *
 * With the D1 binding `DB` (database "moonsafe-ledger", schema in migrations/0001_ledger.sql) every change is ONE SQL statement,
 * so parallel requests cannot overwrite each other. Without it (local runs, the offline tests) the same calls fall back to KV, the
 * old behaviour.
 */

import type { Kv } from './budget'

/** The part of a D1 database these calls use (a real D1Database fits; scripts/ledger-check.ts fakes it on bun:sqlite). */
export interface D1Like {
  prepare(sql: string): { bind(...values: unknown[]): { first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> } }
}

export interface LedgerEnv {
  USERDATA?: Kv
  DB?: D1Like
}

export interface Counters {
  get(key: string): Promise<number>
  /** +1 only while the value is below `limit`. False = the limit was already reached, nothing changed. */
  incrBelow(key: string, limit: number, ttlSeconds?: number): Promise<boolean>
  /** -1 only while the value is above 0. False = it was 0, nothing changed. */
  decrIfPositive(key: string): Promise<boolean>
  /** Adds `delta` (may be negative, never goes below 0) and returns the new value. */
  add(key: string, delta: number, ttlSeconds?: number): Promise<number>
  del(key: string): Promise<void>
}

export interface Claims {
  /** Reserves a payment for this account. False = it belongs to another account or was already credited. */
  claim(hash: string, id: string): Promise<boolean>
  /** Drops this account's reservation (the check failed), never a credited payment. */
  release(hash: string, id: string): Promise<void>
  /** Marks the payment credited. Only one caller ever gets true for a hash. */
  finalize(hash: string, id: string): Promise<boolean>
}

const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

function d1Counters(db: D1Like): Counters {
  const exp = (ttl?: number) => (ttl ? Date.now() + ttl * 1000 : null)
  return {
    async get(key) {
      const r = await db.prepare('SELECT n FROM counters WHERE key = ?1').bind(key).first<{ n: number }>()
      return toNum(r?.n)
    },
    async incrBelow(key, limit, ttl) {
      if (limit < 1) return false
      const r = await db.prepare(
        'INSERT INTO counters (key, n, expires) VALUES (?1, 1, ?2) ON CONFLICT(key) DO UPDATE SET n = n + 1 WHERE n < ?3 RETURNING n',
      ).bind(key, exp(ttl), limit).first<{ n: number }>()
      return r !== null
    },
    async decrIfPositive(key) {
      const r = await db.prepare('UPDATE counters SET n = n - 1 WHERE key = ?1 AND n > 0 RETURNING n').bind(key).first<{ n: number }>()
      return r !== null
    },
    async add(key, delta, ttl) {
      const r = await db.prepare(
        'INSERT INTO counters (key, n, expires) VALUES (?1, MAX(0, ?2), ?3) ON CONFLICT(key) DO UPDATE SET n = MAX(0, n + ?2) RETURNING n',
      ).bind(key, Math.floor(delta), exp(ttl)).first<{ n: number }>()
      return toNum(r?.n)
    },
    async del(key) { await db.prepare('DELETE FROM counters WHERE key = ?1').bind(key).run() },
  }
}

function d1Claims(db: D1Like): Claims {
  return {
    async claim(hash, id) {
      await db.prepare("INSERT INTO power_tx (hash, account, status, at) VALUES (?1, ?2, 'pending', ?3) ON CONFLICT(hash) DO NOTHING").bind(hash, id, Date.now()).run()
      const r = await db.prepare('SELECT account, status FROM power_tx WHERE hash = ?1').bind(hash).first<{ account: string; status: string }>()
      return r !== null && r.account === id && r.status === 'pending'
    },
    async release(hash, id) {
      await db.prepare("DELETE FROM power_tx WHERE hash = ?1 AND account = ?2 AND status = 'pending'").bind(hash, id).run()
    },
    async finalize(hash, id) {
      // Also covers a reservation dropped meanwhile by a parallel failed check of the same account.
      const r = await db.prepare(
        "INSERT INTO power_tx (hash, account, status, at) VALUES (?1, ?2, 'done', ?3) ON CONFLICT(hash) DO UPDATE SET status = 'done', at = ?3 WHERE account = ?2 AND status = 'pending' RETURNING hash",
      ).bind(hash, id, Date.now()).first()
      return r !== null
    },
  }
}

function kvCounters(kv: Kv): Counters {
  const get = async (key: string) => toNum(await kv.get(key))
  const put = (key: string, n: number, ttl?: number) => kv.put(key, String(Math.max(0, n)), ttl ? { expirationTtl: ttl } : undefined)
  return {
    get,
    async incrBelow(key, limit, ttl) { const n = await get(key); if (n >= limit) return false; await put(key, n + 1, ttl); return true },
    async decrIfPositive(key) { const n = await get(key); if (n <= 0) return false; await put(key, n - 1); return true },
    async add(key, delta, ttl) { const n = Math.max(0, (await get(key)) + Math.floor(delta)); await put(key, n, ttl); return n },
    async del(key) { await kv.delete?.(key) },
  }
}

function kvClaims(kv: Kv): Claims {
  const k = (hash: string) => `powertx:${hash}`
  return {
    async claim(hash, id) {
      const cur = await kv.get(k(hash))
      if (cur && cur !== `pending:${id}`) return false
      await kv.put(k(hash), `pending:${id}`)
      return true
    },
    async release(hash, id) { if ((await kv.get(k(hash))) === `pending:${id}`) await kv.delete?.(k(hash)) },
    async finalize(hash, id) { await kv.put(k(hash), id); return true },
  }
}

export const counters = (env: LedgerEnv): Counters | null => (env.DB ? d1Counters(env.DB) : env.USERDATA ? kvCounters(env.USERDATA) : null)
export const claims = (env: LedgerEnv): Claims | null => (env.DB ? d1Claims(env.DB) : env.USERDATA ? kvClaims(env.USERDATA) : null)

/** Drops expired day counters now and then (KV expires them by itself). */
export async function sweep(env: LedgerEnv): Promise<void> {
  if (!env.DB || Math.random() > 0.01) return
  try { await env.DB.prepare('DELETE FROM counters WHERE expires IS NOT NULL AND expires < ?1').bind(Date.now()).run() } catch { /* next time */ }
}
