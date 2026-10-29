/**
 * Cloudflare Pages Function — /api/power
 * GET  → how much "AI power" (daily chat messages) the signed-in account has left.
 * POST → { action: 'owner-challenge' } returns the text the owner wallet signs;
 *        { action: 'verify-owner', challenge, signature } unlocks the owner allowance for this account;
 *        { action: 'buy', txHash } credits a 1 USDC payment (100 messages, never expire) after checking it onchain.
 * Counting itself happens in /api/chat (functions/_lib/quota.ts).
 */

import { privyUserId } from '../_lib/privyAuth'
import { buyPower, ownerChallenge, powerState, verifyOwner, type PowerEnv } from '../_lib/quota'

interface Env extends PowerEnv { PRIVY_APP_ID?: string }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const id = await privyUserId(request, env)
  if (!id) return json({ error: 'Invalid sign-in session' }, 401)
  return json({ power: await powerState(env, id) })
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const id = await privyUserId(request, env)
  if (!id) return json({ error: 'Invalid sign-in session' }, 401)
  const text = await request.text()
  if (text.length > 4_000) return json({ error: 'Request too large' }, 413)
  let body: { action?: string; challenge?: string; signature?: string; txHash?: string }
  try { body = JSON.parse(text) as typeof body } catch { return json({ error: 'Invalid JSON' }, 400) }

  if (body.action === 'owner-challenge') return json({ challenge: ownerChallenge(id) })
  if (body.action === 'verify-owner') {
    if (typeof body.challenge !== 'string' || typeof body.signature !== 'string') return json({ error: 'challenge and signature are required' }, 400)
    const r = await verifyOwner(env, id, body.challenge, body.signature)
    if (!r.ok) return json({ error: r.error ?? 'Could not verify' }, 403)
    return json({ ok: true, power: await powerState(env, id) })
  }
  if (body.action === 'buy') {
    const r = await buyPower(env, id, typeof body.txHash === 'string' ? body.txHash : '')
    if (!r.ok) return json({ error: r.error ?? 'Could not count the payment', retry: r.retry === true }, r.retry ? 409 : 400)
    return json({ ok: true, power: await powerState(env, id) })
  }
  return json({ error: 'Unknown action' }, 400)
}
