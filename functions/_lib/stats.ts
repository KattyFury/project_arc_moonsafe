/**
 * Daily usage statistics of the agent, collected from real traffic (Hieu, 2026-10-28: cost is found by looking at
 * production, not by running test chats that spend his tokens). One KV record per UTC day: how many chat turns, how
 * many model calls, how many plan steps and rewrite rounds, input / output / cached input tokens, how many turns
 * ran on the standby model. Read it with GET /api/usage (owner only).
 */

import type { BudgetEnv, Meter } from './budget'

export interface DayStats {
  day: string
  turns: number
  events: number
  failed: number
  modelCalls: number
  planSteps: number
  rewrites: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
  standbyTurns: number
}

const empty = (day: string): DayStats => ({ day, turns: 0, events: 0, failed: 0, modelCalls: 0, planSteps: 0, rewrites: 0, promptTokens: 0, completionTokens: 0, cachedTokens: 0, standbyTurns: 0 })
const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const key = (day: string) => `stats:${day}`

async function read(env: BudgetEnv, day: string): Promise<DayStats> {
  try {
    const raw = await env.USERDATA?.get(key(day))
    return raw ? { ...empty(day), ...(JSON.parse(raw) as Partial<DayStats>) } : empty(day)
  } catch { return empty(day) }
}

/** Adds one request to today's record. Best effort: a parallel request can be missed (KV has no increment). */
export async function recordStats(env: BudgetEnv, meter: Meter, kind: 'message' | 'event', ok: boolean): Promise<void> {
  if (!env.USERDATA) return
  try {
    const day = dayKey(new Date())
    const s = await read(env, day)
    if (kind === 'event') s.events++; else s.turns++
    if (!ok) s.failed++
    s.modelCalls += meter.modelCalls ?? 0
    s.planSteps += meter.planSteps ?? 0
    s.rewrites += meter.rewrites ?? 0
    s.promptTokens += meter.promptTokens ?? 0
    s.completionTokens += meter.completionTokens ?? 0
    s.cachedTokens += meter.cachedTokens ?? 0
    if (meter.provider) s.standbyTurns++
    await env.USERDATA.put(key(day), JSON.stringify(s), { expirationTtl: 40 * 24 * 3600 })
  } catch { /* statistics are best effort */ }
}

/** The last `days` days, newest first, with the averages the cost question needs. */
export async function readStats(env: BudgetEnv, days = 7) {
  const out = []
  for (let i = 0; i < days; i++) {
    const s = await read(env, dayKey(new Date(Date.now() - i * 86_400_000)))
    const turns = Math.max(1, s.turns)
    out.push({
      ...s,
      perTurn: {
        modelCalls: +(s.modelCalls / turns).toFixed(2),
        planSteps: +(s.planSteps / turns).toFixed(2),
        rewrites: +(s.rewrites / turns).toFixed(2),
        promptTokens: Math.round(s.promptTokens / turns),
        completionTokens: Math.round(s.completionTokens / turns),
      },
      cachedShare: s.promptTokens ? +(s.cachedTokens / s.promptTokens).toFixed(2) : 0,
    })
  }
  return out
}
