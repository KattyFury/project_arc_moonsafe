/**
 * Settings the admin page can change without a deploy (Hieu, 2026-10-28): pause the agent or the transaction cards, a notice shown
 * to everyone, the daily limits, which AI answers first. Stored in KV (key config:app); the environment variables stay the defaults.
 * Read on every chat request, cached for a few seconds inside one worker instance.
 */

import type { BudgetEnv } from './budget'
import type { PowerEnv } from './quota'

export interface AppConfig {
  /** false: the agent answers nothing (maintenance, an incident). */
  chatEnabled: boolean
  /** false: the agent offers no deposit / withdraw / buy cards. */
  cardsEnabled: boolean
  /** Shown to everybody when set. */
  notice: string
  freeTurnsPerDay: number | null
  ownerTurnsPerDay: number | null
  userTokenBudget: number | null
  dailyTokenBudget: number | null
  primaryProvider: 'openai' | 'claude'
}

export const DEFAULT_CONFIG: AppConfig = {
  chatEnabled: true, cardsEnabled: true, notice: '',
  freeTurnsPerDay: null, ownerTurnsPerDay: null, userTokenBudget: null, dailyTokenBudget: null,
  primaryProvider: 'openai',
}

const KEY = 'config:app'
const CACHE_MS = 10_000
let cache: { at: number; cfg: AppConfig } | null = null

const posInt = (v: unknown, max: number): number | null => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : null
}

/** Whatever is stored, cleaned up: unknown or invalid fields fall back to the defaults. */
export function cleanConfig(raw: unknown): AppConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    chatEnabled: r.chatEnabled !== false,
    cardsEnabled: r.cardsEnabled !== false,
    notice: typeof r.notice === 'string' ? r.notice.slice(0, 240) : '',
    freeTurnsPerDay: posInt(r.freeTurnsPerDay, 1000),
    ownerTurnsPerDay: posInt(r.ownerTurnsPerDay, 5000),
    userTokenBudget: posInt(r.userTokenBudget, 50_000_000),
    dailyTokenBudget: posInt(r.dailyTokenBudget, 500_000_000),
    primaryProvider: r.primaryProvider === 'claude' ? 'claude' : 'openai',
  }
}

export async function getConfig(env: BudgetEnv): Promise<AppConfig> {
  if (!env.USERDATA) return DEFAULT_CONFIG
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.cfg
  let cfg = DEFAULT_CONFIG
  try { const raw = await env.USERDATA.get(KEY); if (raw) cfg = cleanConfig(JSON.parse(raw)) } catch { /* unreadable: defaults */ }
  cache = { at: Date.now(), cfg }
  return cfg
}

export async function saveConfig(env: BudgetEnv, patch: Record<string, unknown>): Promise<AppConfig> {
  if (!env.USERDATA) throw new Error('Data storage is not configured')
  cache = null
  const cur = await getConfig(env)
  const next = cleanConfig({ ...cur, ...patch })
  await env.USERDATA.put(KEY, JSON.stringify(next))
  cache = { at: Date.now(), cfg: next }
  return next
}

/** The environment with the admin's limits laid over it, for the quota and token-budget code that reads env strings. */
export function effectiveEnv<T extends PowerEnv>(env: T, cfg: AppConfig): T {
  const over: Partial<PowerEnv> = {}
  if (cfg.freeTurnsPerDay) over.FREE_TURNS_PER_DAY = String(cfg.freeTurnsPerDay)
  if (cfg.ownerTurnsPerDay) over.OWNER_TURNS_PER_DAY = String(cfg.ownerTurnsPerDay)
  if (cfg.userTokenBudget) over.USER_DAILY_TOKEN_BUDGET = String(cfg.userTokenBudget)
  if (cfg.dailyTokenBudget) over.DAILY_TOKEN_BUDGET = String(cfg.dailyTokenBudget)
  return { ...env, ...over }
}

const kBlock = (id: string) => `block:${id}`
export async function isBlocked(env: BudgetEnv, id: string): Promise<boolean> {
  try { return !!(await env.USERDATA?.get(kBlock(id))) } catch { return false }
}
export async function setBlocked(env: BudgetEnv, id: string, blocked: boolean): Promise<void> {
  if (!env.USERDATA) return
  if (blocked) await env.USERDATA.put(kBlock(id), String(Date.now())); else await env.USERDATA.delete?.(kBlock(id))
}
