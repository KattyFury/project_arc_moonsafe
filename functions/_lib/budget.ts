/**
 * A daily cap on the AI tokens the agent may use, so a busy day (or a bug that loops) cannot burn through the OpenAI
 * credit (real case 2026-10-27: a 10 USD credit went in one day). Counters live in KV (binding USERDATA), one for all
 * users and one per user, per UTC day. Without the binding the cap is off (local runs).
 *
 * Defaults stay under OpenAI's free allowance for the mini models (2.5M tokens a day): override them with the
 * variables DAILY_TOKEN_BUDGET (everyone) and USER_DAILY_TOKEN_BUDGET (one user).
 */

/** The part of a KV namespace the counters use (a real KVNamespace fits). */
export interface Kv {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
}

export interface BudgetEnv {
  USERDATA?: Kv
  DAILY_TOKEN_BUDGET?: string
  USER_DAILY_TOKEN_BUDGET?: string
}

/** Tokens used by one request, filled in by every model call. */
export interface Meter { tokens: number; /** Set once a request has moved to the standby model. */ provider?: 'claude' }

const DEFAULT_ALL = 1_500_000
const DEFAULT_USER = 250_000
const TTL_SECONDS = 2 * 24 * 3600

const day = () => new Date().toISOString().slice(0, 10)
const keyAll = () => `budget:${day()}:all`
const keyUser = (id: string) => `budget:${day()}:u:${id}`
const limitOf = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : fallback }

async function used(kv: Kv, key: string): Promise<number> {
  const n = Number(await kv.get(key))
  return Number.isFinite(n) ? n : 0
}

/** null = go ahead; otherwise the message to show the user. */
export async function overBudget(env: BudgetEnv, userId: string): Promise<string | null> {
  if (!env.USERDATA) return null
  try {
    const [all, mine] = await Promise.all([used(env.USERDATA, keyAll()), used(env.USERDATA, keyUser(userId))])
    if (mine >= limitOf(env.USER_DAILY_TOKEN_BUDGET, DEFAULT_USER)) return 'You reached the daily limit of agent messages. It resets tomorrow (UTC).'
    if (all >= limitOf(env.DAILY_TOKEN_BUDGET, DEFAULT_ALL)) return 'The agent reached its daily limit for everyone, to keep costs under control. Try again tomorrow (UTC).'
  } catch { /* KV unavailable: do not block the chat */ }
  return null
}

/** Adds the tokens a request used. Read-modify-write (KV has no increment): a parallel request may be missed, which is fine for a cap. */
export async function addUsage(env: BudgetEnv, userId: string, tokens: number): Promise<void> {
  if (!env.USERDATA || !(tokens > 0)) return
  try {
    const [all, mine] = await Promise.all([used(env.USERDATA, keyAll()), used(env.USERDATA, keyUser(userId))])
    await Promise.all([
      env.USERDATA.put(keyAll(), String(all + tokens), { expirationTtl: TTL_SECONDS }),
      env.USERDATA.put(keyUser(userId), String(mine + tokens), { expirationTtl: TTL_SECONDS }),
    ])
    console.log(`tokens this request=${tokens} day-all=${all + tokens} user=${mine + tokens}`)
  } catch { /* counters are best effort */ }
}
