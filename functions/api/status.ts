/**
 * Cloudflare Pages Function — GET /api/status (public)
 * What the admin switched: whether the agent and the transaction cards are on, and the notice for everybody. No account data.
 */

import { getConfig } from '../_lib/config'
import type { BudgetEnv } from '../_lib/budget'

export async function onRequestGet({ env }: { env: BudgetEnv }): Promise<Response> {
  const c = await getConfig(env)
  return new Response(JSON.stringify({ chatEnabled: c.chatEnabled, cardsEnabled: c.cardsEnabled, notice: c.notice }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' },
  })
}
