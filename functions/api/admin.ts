/**
 * Cloudflare Pages Function — /api/admin (the data behind the /admin page). See functions/_lib/admin.ts for who may call it.
 *
 *   GET  ?op=challenge            the text an admin wallet signs (needs only a signed-in account)
 *   GET  ?op=overview             today's and the last days' agent statistics, settings, which AI keys exist, limits
 *   GET  ?op=users[&cursor=]      a page of accounts (from the stored data) with a small summary
 *   GET  ?op=user&id=             one account's allowance, power, block flag
 *   GET  ?op=log                  the audit log, newest first
 *   POST {op:'config', patch}     change settings (functions/_lib/config.ts)
 *   POST {op:'user', id, action}  grant_power {messages} | reset_today | block | unblock | delete_data {confirm:true}
 *   POST {op:'test-providers'}    ask OpenAI and Claude to list their models (a free call: no tokens are spent)
 *
 * Secrets are never returned: only whether a key exists. Keys themselves are changed in Cloudflare (Pages secrets).
 */

import { adminChallenge, adminWallets, audit, readAudit, requireAdmin, type AdminEnv } from '../_lib/admin'
import { privyUserId } from '../_lib/privyAuth'
import { getConfig, saveConfig, setBlocked, isBlocked, effectiveEnv } from '../_lib/config'
import { DEFAULT_FREE, DEFAULT_OWNER, type PowerEnv } from '../_lib/quota'
import { DEFAULT_ALL, DEFAULT_USER } from '../_lib/budget'
import { readStats } from '../_lib/stats'
import { DEFAULT_CLAUDE_MODEL } from '../_lib/llm'

interface Env extends AdminEnv, PowerEnv {
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  CLAUDE_MODEL?: string
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const day = () => new Date().toISOString().slice(0, 10)
const num = async (env: Env, key: string) => { const n = Number(await env.USERDATA?.get(key)); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }
const isId = (s: unknown): s is string => typeof s === 'string' && s.length > 3 && s.length < 200 && !/[\s]/.test(s)

async function userRow(env: Env, name: string) {
  const id = name.slice(2)
  let updatedAt = 0, holdings = 0, debts = 0, messages = 0, age: number | null = null
  try {
    const raw = await env.USERDATA?.get(name)
    if (raw) {
      const d = JSON.parse(raw) as { profile?: { holdings?: unknown[]; debts?: unknown[]; age?: number | null } | null; chat?: unknown[] | null; updatedAt?: number }
      updatedAt = d.updatedAt ?? 0; holdings = d.profile?.holdings?.length ?? 0; debts = d.profile?.debts?.length ?? 0
      messages = d.chat?.length ?? 0; age = typeof d.profile?.age === 'number' ? d.profile.age : null
    }
  } catch { /* unreadable record: shown empty */ }
  return { id, updatedAt, holdings, debts, messages, age }
}

export async function onRequestGet({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(request.url)
  const op = url.searchParams.get('op') ?? 'overview'
  if (op === 'challenge') {
    const id = await privyUserId(request, env)
    return id ? json({ message: adminChallenge(id, url.host) }) : json({ error: 'Please sign in again' }, 401)
  }
  const who = await requireAdmin(request, env)
  if (!who.ok) return json({ error: who.error }, who.status)
  if (!env.USERDATA) return json({ error: 'Data storage is not configured' }, 503)

  if (op === 'overview') {
    const cfg = await getConfig(env)
    const eff = effectiveEnv(env, cfg)
    const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? Math.floor(x) : d }
    return json({
      admin: who.address,
      stats: await readStats(env, 7),
      config: cfg,
      providers: { openai: !!env.OPENAI_API_KEY, claude: !!env.ANTHROPIC_API_KEY, claudeModel: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL },
      limits: {
        freeTurnsPerDay: n(eff.FREE_TURNS_PER_DAY, DEFAULT_FREE), ownerTurnsPerDay: n(eff.OWNER_TURNS_PER_DAY, DEFAULT_OWNER),
        userTokenBudget: n(eff.USER_DAILY_TOKEN_BUDGET, DEFAULT_USER), dailyTokenBudget: n(eff.DAILY_TOKEN_BUDGET, DEFAULT_ALL),
      },
      tokensToday: await num(env, `budget:${day()}:all`),
      adminWallets: adminWallets(env),
    })
  }
  if (op === 'users') {
    if (!env.USERDATA.list) return json({ error: 'Listing is not available' }, 503)
    const page = await env.USERDATA.list({ prefix: 'u:', limit: 25, cursor: url.searchParams.get('cursor') ?? undefined })
    const users = await Promise.all(page.keys.map(k => userRow(env, k.name)))
    return json({ users, cursor: page.list_complete ? null : page.cursor ?? null })
  }
  if (op === 'user') {
    const id = url.searchParams.get('id')
    if (!isId(id)) return json({ error: 'Bad id' }, 400)
    const [turns, events, power, owner, tokens, blocked] = await Promise.all([
      num(env, `turns:${day()}:${id}`), num(env, `events:${day()}:${id}`), num(env, `power:${id}`), env.USERDATA.get(`owner:${id}`),
      num(env, `budget:${day()}:u:${id}`), isBlocked(env, id),
    ])
    return json({ id, turnsToday: turns, eventsToday: events, extraPower: power, ownerWallet: owner, tokensToday: tokens, blocked })
  }
  if (op === 'log') return json({ log: await readAudit(env, 100) })
  return json({ error: 'Unknown op' }, 400)
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }): Promise<Response> {
  const who = await requireAdmin(request, env)
  if (!who.ok) return json({ error: who.error }, who.status)
  if (!env.USERDATA) return json({ error: 'Data storage is not configured' }, 503)
  let body: Record<string, unknown>
  try { body = (await request.json()) as Record<string, unknown> } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body.op === 'config') {
    const patch = (body.patch && typeof body.patch === 'object' ? body.patch : {}) as Record<string, unknown>
    const cfg = await saveConfig(env, patch)
    await audit(env, who.address, 'config', { patch })
    return json({ config: cfg })
  }

  if (body.op === 'test-providers') {
    const probe = async (url: string, headers: Record<string, string>) => {
      try { const r = await fetch(url, { headers }); return { ok: r.ok, status: r.status } } catch { return { ok: false, status: 0 } }
    }
    const result = {
      openai: env.OPENAI_API_KEY ? await probe('https://api.openai.com/v1/models', { Authorization: `Bearer ${env.OPENAI_API_KEY}` }) : null,
      claude: env.ANTHROPIC_API_KEY ? await probe('https://api.anthropic.com/v1/models', { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }) : null,
    }
    await audit(env, who.address, 'test-providers', { openai: result.openai?.status ?? 'no key', claude: result.claude?.status ?? 'no key' })
    return json(result)
  }

  if (body.op === 'user') {
    const id = body.id
    if (!isId(id)) return json({ error: 'Bad id' }, 400)
    const kv = env.USERDATA
    const action = String(body.action)
    if (action === 'grant_power') {
      const n = Math.floor(Number(body.messages))
      if (!Number.isFinite(n) || n < 1 || n > 10_000) return json({ error: 'messages must be 1 to 10000' }, 400)
      const cur = await num(env, `power:${id}`)
      await kv.put(`power:${id}`, String(cur + n))
      await audit(env, who.address, 'grant_power', { id, messages: n })
      return json({ ok: true, extraPower: cur + n })
    }
    if (action === 'reset_today') {
      await Promise.all([kv.delete?.(`turns:${day()}:${id}`), kv.delete?.(`events:${day()}:${id}`), kv.delete?.(`budget:${day()}:u:${id}`)])
      await audit(env, who.address, 'reset_today', { id })
      return json({ ok: true })
    }
    if (action === 'block' || action === 'unblock') {
      await setBlocked(env, id, action === 'block')
      await audit(env, who.address, action, { id })
      return json({ ok: true, blocked: action === 'block' })
    }
    if (action === 'delete_data') {
      if (body.confirm !== true) return json({ error: 'Confirmation required' }, 400)
      await kv.delete?.(`u:${id}`)
      await audit(env, who.address, 'delete_data', { id })
      return json({ ok: true })
    }
    return json({ error: 'Unknown action' }, 400)
  }
  return json({ error: 'Unknown op' }, 400)
}
