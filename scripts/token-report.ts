// Offline token accounting for the agent: `bun run tokens`.
//
// Runs the real /api/chat code on a few typical messages, but with `fetch` faked: the model is NEVER called, so this
// costs no tokens and no credit. The faked model answers with a bare "no_action" / "Okay." and the script counts what
// the code would have SENT (system text, history, tool schemas) with the o200k tokenizer.
//
// Use it to see where the input tokens go and to check that a prompt change made the request smaller, without a live
// test chat (Hieu, 2026-10-28: live prompt tests used up his OpenAI credit). It does not say whether answers stay good:
// that needs a real run, which is only done with Hieu's go-ahead and a stated token budget.

import { getEncoding } from 'js-tiktoken'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { normalizeProfile } from '../src/lib/profile'

// The chat function is loaded by a computed path: the app's tsconfig does not know the Cloudflare types the functions use.
const chatModule = '../functions/api/chat'
const { onRequestPost } = await import(chatModule) as { onRequestPost: (context: { request: Request; env: Record<string, string> }) => Promise<Response> }

const APP_ID = 'cmvhlli8900mk0gjmwdeypxh2' // the public Privy app id the functions default to
const enc = getEncoding('o200k_base')
const tok = (s: string) => enc.encode(s).length

;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }

// A real signed token and a JWKS served locally, so the real sign-in check runs (no bypass in the code).
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'local', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'local' }).setIssuer('privy.io').setAudience(APP_ID).setSubject('did:privy:token-report').setIssuedAt().setExpirationTime('10m').sign(privateKey)

const profile = normalizeProfile({
  v: 2, age: 31, ageDeclined: false, incomeStable: false, dependents: 0, soleEarner: null, debtsComplete: true, noNearGoal: true, cryptoDropOk: true,
  holdings: [
    { id: 'h1', type: 'savings', name: 'Bank savings', value: 1600, currency: 'USDC', priceSource: 'self', rebalanceable: true, updatedAt: 1 },
    { id: 'h2', type: 'gold_physical', name: 'Gold', quantity: 0.5003, unit: 'oz', priceSource: 'market', rebalanceable: true, updatedAt: 1 },
  ],
  debts: [], incomes: [{ id: 'i1', name: 'Freelance', monthly: 150, currency: 'USDC', kind: 'active', updatedAt: 1 }],
  expenses: [{ id: 'e1', name: 'Monthly spending', monthly: 150, currency: 'USDC', kind: 'fixed', updatedAt: 1 }],
})
const history = [
  { role: 'assistant', content: 'Here is the simple plan for your money. Your emergency fund target is 6 months of spending = 900 USDC. The first step is your emergency fund: shall I prepare a deposit of 900 USDC from your wallet for you to sign?' },
  { role: 'user', content: 'yes' },
  { role: 'assistant', content: 'Your emergency fund is now 900 USDC. Which bucket do you want to fill next: Safety, Traditional, or Crypto?' },
]
const scenarios: Record<string, string> = {
  'pick a bucket': 'now we move to crypto',
  'ask a concept': 'what is the emergency fund for?',
  'record a debt': 'I also owe my mom 2000 dollars, she charges no interest',
  'money put in the bank': 'I put 500 in my bank as Safety',
}

interface Call { kind: 'plan' | 'reply'; total: number; system: number; history: number; tools: number; toolSizes: Array<[string, number]> }
let calls: Call[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'content-type': 'application/json' } })
  if (!u.includes('openai.com')) return realFetch(url as never, init)
  const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }>; tools?: Array<{ function: { name: string } }>; tool_choice?: string }
  const plan = body.tool_choice === 'required'
  const system = tok(body.messages.filter(m => m.role === 'system').map(m => m.content).join('\n'))
  const hist = tok(body.messages.filter(m => m.role !== 'system').map(m => m.content).join('\n'))
  const toolSizes = (body.tools ?? []).map(t => [t.function.name, tok(JSON.stringify(t))] as [string, number])
  const tools = toolSizes.reduce((a, [, n]) => a + n, 0)
  calls.push({ kind: plan ? 'plan' : 'reply', total: system + hist + tools, system, history: hist, tools, toolSizes })
  const message = plan
    ? { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'no_action', arguments: '{}' } }] }
    : { role: 'assistant', content: 'Okay.' }
  return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 0, completion_tokens: 0 } }), { status: 200 })
}) as typeof fetch

console.log('Input tokens the code SENDS per model call (no model is called):\n')
let first: Call | undefined
for (const [name, text] of Object.entries(scenarios)) {
  calls = []
  const request = new Request('http://local/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: text }], context: { profile, vaultUsdc: 900, walletUsdc: 1419, cirBtcUsdc: 0 } }),
  })
  await onRequestPost({ request, env: { OPENAI_API_KEY: 'fake' } })
  const plan = calls.find(c => c.kind === 'plan'); const reply = calls.find(c => c.kind === 'reply')
  first ??= plan
  console.log(`${name.padEnd(24)} PLAN ${String(plan?.total ?? '-').padStart(5)} (system ${plan?.system}, tools ${plan?.tools})   REPLY ${String(reply?.total ?? '-').padStart(5)} (system ${reply?.system})`)
}
if (first) console.log(`\nPlan tools by size: ${first.toolSizes.sort((a, b) => b[1] - a[1]).map(([n, t]) => `${n} ${t}`).join(', ')}`)
console.log('\nA turn is at least 1 PLAN step + 1 REPLY call (more when the planner records something or a reply is rewritten).')
console.log('Real counts per turn, including cached input, come from GET /api/usage (owner) after real traffic.')
globalThis.fetch = realFetch
