/**
 * Privy access-token check shared by the Pages Functions (/api/chat, /api/userdata).
 * The token (Authorization: Bearer …) is verified against the app's JWKS
 * (ES256, iss "privy.io", aud = app id). Returns the Privy user id, or null.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose'

// Public value, already shipped in the client bundle.
const DEFAULT_APP_ID = 'cmvhlli8900mk0gjmwdeypxh2'

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export async function privyUserId(request: Request, env: { PRIVY_APP_ID?: string }): Promise<string | null> {
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
