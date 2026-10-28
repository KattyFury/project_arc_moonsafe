/**
 * Cloudflare Pages Function — GET /api/usage (owner only)
 * The agent's daily statistics (turns, model calls, plan steps, rewrite rounds, tokens, cached share) from
 * functions/_lib/stats.ts. Only the account that proved it holds the owner wallet can read it.
 */

import { privyUserId } from '../_lib/privyAuth'
import { powerState, type PowerEnv } from '../_lib/quota'
import { readStats } from '../_lib/stats'

interface Env extends PowerEnv { PRIVY_APP_ID?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = await privyUserId(request, env)
  if (!id) return json({ error: 'Invalid sign-in session' }, 401)
  if (!(await powerState(env, id))?.ownerVerified) return json({ error: 'Owner only' }, 403)
  return json({ days: await readStats(env, 7) })
}
