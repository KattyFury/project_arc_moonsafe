// Offline regressions derived from observed Claude failures. All fetches are intercepted.
// No standby provider, paid judge, live prices or production user data.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { responseProblems, turnPolicy } from '../functions/_lib/agentGuards'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { normalizeProfile, applyOps, readOps } from '../src/lib/profile'

let checks = 0
const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'education-eval', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: jwk.kid })
  .setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2').setSubject('did:privy:education-eval')
  .setIssuedAt().setExpirationTime('1h').sign(privateKey)
const realFetch = globalThis.fetch
let calls = 0, external = 0
const prompts: Array<Record<string, unknown>> = []
let forcedTools: Array<{ id: string; type: string; function: { name: string; arguments: string } }> = []
let fakeReply = 'A budget helps you plan spending and savings.'
let replyQueue: string[] = []
let failAfterDraft = false
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = String(url)
  if (u.includes('auth.privy.io')) return Response.json({ keys: [jwk] })
  if (u.startsWith('https://api.openai.com/')) {
    calls++
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    prompts.push(body)
    const hasToolResult = (body.messages as Array<{ role: string }>).some(m => m.role === 'tool')
    if (failAfterDraft && body.tool_choice !== 'required' && replyQueue.length === 0) return Response.json({ error: 'offline rewrite failure' }, { status: 400 })
    return Response.json({ choices: [{ message: body.tool_choice === 'required'
      ? { role: 'assistant', content: null, tool_calls: forcedTools.length && !hasToolResult ? forcedTools : [{ id: `c${calls}`, type: 'function', function: { name: 'no_action', arguments: '{}' } }] }
      : { role: 'assistant', content: replyQueue.shift() ?? fakeReply } }] })

  }
  external++
  // Fixed FX fixture; no network spending or market changes during comparisons.
  return Response.json({ result: 'success', rates: { VND: 25000 }, usd: {}, goldUsdPerOz: null })
}) as typeof fetch
;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }
const store = new Map<string, string>()
const env = { OPENAI_API_KEY: 'offline-fake', USERDATA: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } }, FREE_TURNS_PER_DAY: '1000', USER_DAILY_TOKEN_BUDGET: '100000', DAILY_TOKEN_BUDGET: '100000' }
const { onRequestPost } = await import('../functions/api/chat') as { onRequestPost: (ctx: { request: Request; env: typeof env }) => Promise<Response> }
type Result = { content?: string; ops?: unknown[]; actions?: unknown[]; education?: string; error?: string }
async function ask(text: string, signed = true, history: Array<{ role: string; content: string }> = [], context: Record<string, unknown> = {}) {
  const response = await onRequestPost({ env, request: new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(signed ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ messages: [...history, { role: 'user', content: text }], context, debug: true }),
  }) })
  return { status: response.status, data: await response.json() as Result }
}

const results: Array<{ name: string; status: string }> = []
const tools = (name: string, args: Record<string, unknown>) => ({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } })
try {
  for (const [text, bad] of [
    ['That last reply did not say Noted. Here it is again, without changes.', true],
    ['Losses are only real when you sell.', true],
    ['Real recoveries never require upfront fees.', true],
    ['A price decline reduces current wealth; selling realizes the loss. Recovery is uncertain.', false],
    ['An upfront recovery fee with a guarantee is a red flag. Verify independently.', false],
    ['How much do you spend monthly?', true],
    ['Nhu cầu là khoản thiết yếu. Mong muốn là khoản có thể hoãn.', false], // lang-ok
  ] as const) {
    assert.equal(responseProblems(text, true).length > 0, bad, text)
    checks++
  }
  assert.equal(turnPolicy(['Just teach me about spending.', 'My friends buy coins.']).conversationOnly, true)
  assert.equal(turnPolicy(['Just want to build a plan']).conversationOnly, false)
  checks += 2
  // Facts are correctly pending, while the explanation must still be generated.
  forcedTools = [tools('update_profile', { age: 38, income_stable: false, dependents: 3, sole_earner: true })]
  fakeReply = 'An emergency fund covers unexpected costs or a loss of income. Its target is not final until the relevant expenses and household risks are known.'
  const existing = normalizeProfile({ v: 2, age: 30 })
  const pendingStart = prompts.length
  const pending = await ask('I am 38, the only earner, supporting 3 dependents. My income is irregular. Explain how our emergency fund works?', true, [], { profile: existing, hasVault: true, walletUsdc: 50, vaultUsdc: 0 })
  assert.equal(pending.status, 200)
  assert.match(pending.data.content ?? '', /unexpected costs/)
  assert.match(pending.data.content ?? '', /nothing is saved until you do/)
  assert.deepEqual(pending.data.ops, [])
  const cards = pending.data.actions as Array<{ type: string; items?: Array<{ ops: unknown[] }> }>
  assert.equal(cards.length, 1)
  assert.equal(cards[0].type, 'confirm_items')
  assert.ok((cards[0].items?.length ?? 0) >= 3)
  const confirmed = applyOps(existing, readOps(cards[0].items!.flatMap(i => i.ops)))
  assert.equal(confirmed.age, 38)
  assert.equal(confirmed.dependents, 3)
  assert.equal(confirmed.incomeStable, false)
  assert.equal(existing.age, 30)
  const pendingPrompt = JSON.stringify(prompts.slice(pendingStart).find(p => p.tool_choice !== 'required'))
  assert.ok(pendingPrompt.includes('New facts await confirmation'))
  assert.ok(pendingPrompt.includes('Saved facts this turn: []'))
  results.push({ name: 'pending facts preserve confirmation and answer', status: 'pass' })
  checks += 13
  fakeReply = 'Quỹ dự phòng dành cho chi phí bất ngờ hoặc lúc mất thu nhập. Quy mô phụ thuộc chi tiêu thiết yếu và mức ổn định thu nhập.' // lang-ok
  const pendingVi = await ask('Mình 38 tuổi, có 3 người phụ thuộc và thu nhập không ổn định. Giải thích cách xây quỹ dự phòng?', true, [], { profile: existing, hasVault: true, walletUsdc: 50, vaultUsdc: 0 }) // lang-ok
  assert.equal(pendingVi.status, 200)
  assert.match(pendingVi.data.content ?? '', /chi phí bất ngờ/) // lang-ok
  assert.match(pendingVi.data.content ?? '', /chưa có gì được lưu/) // lang-ok
  assert.deepEqual(pendingVi.data.ops, [])
  assert.equal((pendingVi.data.actions as Array<{ type: string }>)[0]?.type, 'confirm_items')
  results.push({ name: 'Vietnamese explanation survives pending confirmation', status: 'pass' })
  checks += 5
  // Natural acknowledgment should not cause two expensive rewrites just for missing "Noted".
  forcedTools = [tools('update_profile', { age: 38 })]
  fakeReply = 'Your age is now saved. A budget helps you plan spending and saving.'
  const beforeNatural = calls
  const natural = await ask('I am 38. Explain how a budget helps me?')
  assert.equal(natural.data.content, fakeReply)
  assert.ok(readOps(natural.data.ops).some(o => o.op === 'update_profile' && o.fields.age === 38))
  assert.equal(calls - beforeNatural, 3, 'one planner action, one no_action, one answer')
  results.push({ name: 'natural acknowledgment avoids mandatory-word rewrites', status: 'pass' })
  checks += 3
  forcedTools = []
  fakeReply = 'Needs cover essential living costs; wants are purchases you can postpone. Before the next purchase, privately label it as a need or a want.'
  replyQueue = ['How much do you spend monthly?', fakeReply]
  const fixed = await ask('Teach me needs versus wants, without intake.')
  assert.equal(fixed.data.content, fakeReply)
  assert.deepEqual(fixed.data.actions, [])
  results.push({ name: 'one correction returns useful teaching', status: 'pass' })
  checks += 2
  replyQueue = ['That last reply did not say Noted. Here it is again, without changes.']
  failAfterDraft = true
  const failedRewrite = await ask('Teach me needs versus wants, without intake.')
  assert.equal(failedRewrite.status, 200)
  assert.match(failedRewrite.data.content ?? '', /could not produce a reliable explanation/)
  assert.equal(responseProblems(failedRewrite.data.content ?? '', true).length, 0)
  failAfterDraft = false
  results.push({ name: 'provider failure does not release rejected editorial draft', status: 'pass' })
  checks += 3
  for (const badReply of [
    'That last reply did not say Noted. Here it is again, without changes.',
    'Losses are only real when you sell.',
    'Real recoveries never require upfront fees.',
    'How much do you spend monthly?',
  ]) {
    fakeReply = badReply
    const result = await ask('Teach me the difference between needs and wants, without intake.')
    assert.equal(result.status, 200)
    assert.notEqual(result.data.content, badReply)
    assert.equal(responseProblems(result.data.content ?? '', true).length, 0)
    assert.deepEqual(result.data.actions, [])
    results.push({ name: `persistent bad output blocked: ${badReply}`, status: 'pass' })
    checks += 4
  }
} finally { globalThis.fetch = realFetch }
writeFileSync('docs/evals/response-quality-offline-2026-10-29.json', JSON.stringify({ mode: 'offline', paidCalls: 0, checks, mockCalls: calls, mockedExternal: external, results }, null, 2))
console.log(JSON.stringify({ checks, paidCalls: 0, results }, null, 2))
