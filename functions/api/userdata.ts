/**
 * Cloudflare Pages Function — /api/userdata
 * Keeps each user's financial profile and agent chat in KV (binding USERDATA), keyed by
 * their Privy user id, so the data survives a new device, browser or wallet.
 * Every request must carry the Privy access token (Authorization: Bearer …); it is
 * verified against the app's JWKS (ES256, iss "privy.io", aud = app id).
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

interface Env {
  USERDATA: KVNamespace
  PRIVY_APP_ID?: string
}

// Public value, already shipped in the client bundle.
const DEFAULT_APP_ID = 'cmvhlli8900mk0gjmwdeypxh2'
const MAX_BYTES = 256_000
const MAX_CHAT = 80

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

async function userId(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const appId = env.PRIVY_APP_ID ?? DEFAULT_APP_ID
  jwks ??= createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`))
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: 'privy.io', audience: appId })
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

interface Stored { profile: Record<string, unknown> | null; chat: unknown[] | null; updatedAt: number }

async function read(env: Env, id: string): Promise<Stored> {
  const raw = await env.USERDATA.get(`u:${id}`)
  return raw ? (JSON.parse(raw) as Stored) : { profile: null, chat: null, updatedAt: 0 }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.USERDATA) return json({ error: 'Data storage is not configured' }, 503)
  const id = await userId(request, env)
  if (!id) return json({ error: 'Invalid sign-in session' }, 401)
  return json(await read(env, id))
}

/** Body: { profile?: object | null, chat?: array | null }. Fields left out are kept. */
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.USERDATA) return json({ error: 'Data storage is not configured' }, 503)
  const id = await userId(request, env)
  if (!id) return json({ error: 'Invalid sign-in session' }, 401)

  const text = await request.text()
  if (text.length > MAX_BYTES) return json({ error: 'Data too large' }, 413)
  let body: { profile?: unknown; chat?: unknown }
  try { body = JSON.parse(text) as typeof body } catch { return json({ error: 'Invalid JSON' }, 400) }

  const cur = await read(env, id)
  if ('profile' in body) {
    if (body.profile !== null && (typeof body.profile !== 'object' || Array.isArray(body.profile))) return json({ error: 'profile must be an object' }, 400)
    cur.profile = body.profile as Stored['profile']
  }
  if ('chat' in body) {
    if (body.chat !== null && !Array.isArray(body.chat)) return json({ error: 'chat must be an array' }, 400)
    cur.chat = body.chat === null ? null : (body.chat as unknown[]).slice(-MAX_CHAT)
  }
  cur.updatedAt = Date.now()
  await env.USERDATA.put(`u:${id}`, JSON.stringify(cur))
  return json({ ok: true, updatedAt: cur.updatedAt })
}
