// Sync of the profile + agent chat with /api/userdata (Cloudflare KV, keyed by the Privy
// user). localStorage stays as the fast local copy; the server copy is what survives a new
// device, browser or wallet. Writes are batched and retried with the next write on failure.

type TokenGetter = () => Promise<string | null>

let getToken: TokenGetter | null = null
let pending: Record<string, unknown> = {}
let timer: ReturnType<typeof setTimeout> | null = null

export function setCloudAuth(g: TokenGetter | null) { getToken = g }

async function call(method: 'GET' | 'PUT', body?: unknown): Promise<Record<string, unknown> | null> {
  const token = await getToken?.()
  if (!token) return null
  const res = await fetch('/api/userdata', {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`userdata ${method} ${res.status}`)
  return res.json() as Promise<Record<string, unknown>>
}

export const cloudLoad = () => call('GET')

/** Queue a change ({ profile } and/or { chat }); sent ~1 s after the last change. */
export function cloudSave(patch: { profile?: unknown; chat?: unknown }) {
  if (!getToken) return
  pending = { ...pending, ...patch }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, 1000)
}

/** Send anything still queued now (before logging out). */
export async function cloudFlush() {
  if (timer) { clearTimeout(timer); await flush() }
}

async function flush() {
  const body = pending
  pending = {}
  timer = null
  try {
    await call('PUT', body)
  } catch (e) {
    console.error('cloud save failed', e)
    pending = { ...body, ...pending }
  }
}

// Which Privy user the local copy belongs to, so a second person on the same browser
// never inherits (or uploads) someone else's data.
const OWNER_KEY = 'moonsafe_owner_v1'
export function readOwner(): string | null {
  try { return localStorage.getItem(OWNER_KEY) } catch { return null }
}
export function writeOwner(id: string | null) {
  try { if (id) localStorage.setItem(OWNER_KEY, id); else localStorage.removeItem(OWNER_KEY) } catch { /* storage blocked */ }
}
