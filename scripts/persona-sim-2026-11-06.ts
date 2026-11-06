// Two kinds of users talk to the real /api/chat handler on OpenAI (Hieu, 2026-11-06: "1M GPT tokens, 2 different users").
// A second gpt-5.4-mini plays the user from a persona and a goal for the session; cards are handled the way the app does it
// (form filled from the persona, confirm cards accepted, deposit / buy / open cards signed when the wallet allows).
// Every OpenAI token (app + simulated user) counts toward the cap; no new turn starts within RESERVE of it.
// Run: bun scripts/persona-sim-2026-11-06.ts --budget 1000000   (OPENAI_API_KEY from .dev.vars; writes docs/evals/persona-sim-2026-11-06.*)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { SignJWT, exportJWK, generateKeyPair } from 'jose'
import { applyOps, normalizeProfile, readOps, walletMoveOps, type ProfileOp } from '../src/lib/profile'
import { buildRecordOps, presetSource, recordSummary, sourceOptions, type RecordRequest, type RecordSource } from '../src/lib/record'
import { EMPTY_FORM, formToItems, type FormValues } from '../src/lib/intakeForm'
import type { AssetType, FinancialProfile } from '../src/types'

const flag = (n: string) => { const i = process.argv.indexOf(n); return i < 0 ? undefined : process.argv[i + 1] }
const CAP = Number(flag('--budget') ?? 0)
if (!Number.isInteger(CAP) || CAP <= 0 || CAP > 1_000_000) throw new Error('Give --budget (tokens, at most 1,000,000).')
const OUT = 'docs/evals/persona-sim-2026-11-06'
if (existsSync(`${OUT}.json`)) throw new Error('Result already exists; not overwriting a paid run.')
const RESERVE = 45_000
const key = readFileSync('.dev.vars', 'utf8').split(/\r?\n/).find(l => l.startsWith('OPENAI_API_KEY='))?.slice(15).trim().replace(/^["']|["']$/g, '')
if (!key) throw new Error('No OPENAI_API_KEY in .dev.vars')

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwk = { ...(await exportJWK(publicKey)), kid: 'sim', alg: 'ES256', use: 'sig' }
const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: 'sim' }).setIssuer('privy.io').setAudience('cmvhlli8900mk0gjmwdeypxh2')
  .setSubject('did:privy:persona-sim').setIssuedAt().setExpirationTime('6h').sign(privateKey)
let used = 0, appTokens = 0, simTokens = 0, stopped = ''
const realFetch = globalThis.fetch
let who: 'app' | 'sim' = 'app'
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const u = url instanceof Request ? url.url : String(url)
  if (u.includes('auth.privy.io')) return Response.json({ keys: [jwk] })
  if (u.includes('api.anthropic.com')) throw new Error('OpenAI only')
  if (u.includes('api.openai.com')) {
    if (used >= CAP) { stopped ||= 'cap'; return Response.json({ error: { message: 'budget reached' } }, { status: 429 }) }
    const res = await realFetch(url as never, init)
    const data = await res.clone().json().catch(() => ({})) as { usage?: { prompt_tokens?: number; completion_tokens?: number }; error?: { message?: string } }
    if (!res.ok) { stopped ||= `openai-http-${res.status}`; console.log(`OpenAI ${res.status}: ${data.error?.message?.slice(0, 120)}`) }
    const t = (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)
    used += t
    if (who === 'app') appTokens += t; else simTokens += t
    return res
  }
  if (/open\.er-api\.com/.test(u)) return Response.json({ result: 'success', rates: { VND: 25000 } })
  return Response.json({ usd: {}, goldUsdPerOz: null })
}) as typeof fetch
;(globalThis as { caches?: unknown }).caches = { default: { match: async () => undefined, put: async () => undefined } }
const store = new Map<string, string>()
const env = { OPENAI_API_KEY: key, USERDATA: { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v) } },
  FREE_TURNS_PER_DAY: '10000', USER_DAILY_TOKEN_BUDGET: String(CAP), DAILY_TOKEN_BUDGET: String(CAP) }
const handler = '../functions/api/chat'
const { onRequestPost } = await import(handler) as { onRequestPost: (c: { request: Request; env: typeof env }) => Promise<Response> }

type Persona = { id: string; who: string; form: Partial<FormValues>; wallet: number; hasVault: boolean; sessions: string[] }
const PERSONAS: Persona[] = [
  { id: 'A-minh', wallet: 400, hasVault: false,
    who: `You are Minh, 24, a freelance designer in Ho Chi Minh City who is into crypto. You write in casual English, short messages, lowercase, sometimes typos. Income about $1,500 a month but it changes month to month; you spend about $900. Single, nobody relies on you, no debt, no big purchase planned. You hold: $2,000 USDC earning on Binance, $500 in a bank account, about $700 of Bitcoin on Binance, $300 of SOL. You have 400 USDC in this app's wallet. You are impatient, want to put money to work, like Bitcoin, and you test whether the app's numbers add up.`,
    form: { age: '24', salary: '1500', steady: 'no', spending: '900', reliers: 'no', goal: 'no', usdcElsewhere: '2000', bank: '500', btc: '700', coins: '300', debt: 'no', otherAssets: 'no', otherIncome: 'no', windfalls: 'no' },
    sessions: [
      'First time in the app. Get set up, understand how big your emergency fund should be, open it and put some USDC in. Ask why the fund is that size.',
      'A few days later. You bought $150 more Bitcoin on Binance and want the app to know. Then ask where you stand and what to do next. If the app suggests buying cirBTC here, buy a small amount.',
      'A week later. Your income dropped this month. Tell the app you now spend $1,100 a month. Ask if your fund is still enough, and ask to withdraw $50 for an emergency.',
    ] },
  { id: 'B-lan', wallet: 150, hasVault: true,
    who: `Bạn là chị Lan, 38 tuổi, kế toán ở Hà Nội. Bạn CHỈ viết tiếng Việt, câu đầy đủ, lịch sự, không rành crypto. Chồng cũng đi làm, 2 con nhỏ phụ thuộc vào thu nhập hai vợ chồng. Lương bạn khoảng 1.200 USD/tháng ổn định, cả nhà chi khoảng 1.000 USD/tháng. Có khoản vay mua xe còn 6.000 USD, lãi 9%/năm, trả 250 USD/tháng. Tài sản: 4.000 USD gửi tiết kiệm ngân hàng, vàng khoảng 1.500 USD, chưa có crypto. Ví trong app có 150 USDC. Bạn hay lo, hỏi kỹ "có an toàn không", "có mất tiền không", và muốn trả nợ xe sớm.`,
    form: { age: '38', salary: '1200', steady: 'yes', spending: '1000', reliers: 'yes', reliersCount: '2', goal: 'no', bank: '4000', gold: '1500', debt: 'yes', debtKind: 'bank', debtOwed: '6000', debtRate: '9', debtMonthly: '250', otherAssets: 'no', otherIncome: 'no', windfalls: 'no' },
    sessions: [
      'Lần đầu dùng app. Làm quen, khai thông tin, hỏi quỹ dự phòng cần bao nhiêu và vì sao, hỏi có nên trả nợ xe sớm không. Nạp thử một ít USDC vào quỹ.',
      'Vài hôm sau. Bạn vừa mua thêm 500 USD vàng và muốn app ghi lại. Hỏi tình hình hiện tại và phần nào còn thiếu. Hỏi có nên mua Bitcoin không vì sợ mất tiền.',
      'Tuần sau. Bạn đã trả bớt nợ xe, giờ còn 5.000 USD. Báo cho app. Hỏi lại nên làm gì tiếp, và hỏi rút tiền khỏi quỹ thì mất bao lâu.',
    ] },
]

type Action = { type: string; items?: Array<{ text: string; ops: ProfileOp[] }>; ask?: string[]; amount?: { amount: number }; holdingType?: string; name?: string; source?: 'wallet' | 'new' | null; safety?: boolean }
type Msg = { role: string; content: string }
const transcript: Array<Record<string, unknown>> = []
const log: string[] = []
const say = (s: string) => { console.log(s); log.push(s) }

async function app(messages: Msg[], profile: FinancialProfile, st: { wallet: number; vault: number; cir: number; hasVault: boolean }) {
  who = 'app'
  const before = used
  const req = new Request('http://local/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: messages.slice(-30), context: { profile, walletUsdc: st.wallet, vaultUsdc: st.vault, cirBtcUsdc: st.cir, hasVault: st.hasVault, vaultFeeUsdc: 1 } }) })
  const res = await onRequestPost({ request: req, env })
  const data = await res.json() as { content?: string; ops?: unknown[]; actions?: Action[] }
  return { status: res.status, content: data.content ?? '', ops: data.ops ?? [], actions: data.actions ?? [], tokens: used - before }
}

async function simUser(p: Persona, goal: string, seen: string[]): Promise<string> {
  who = 'sim'
  const sys = `${p.who}\n\nThis session: ${goal}\n\nYou are chatting with MoonSafe, an emergency-fund and investing app. Write ONLY your next chat message as this person (1-2 sentences). React to what the app just said: answer its question, or push back if a number looks wrong or the reply ignores you. Buttons and cards are handled for you; "(you …)" lines show what you tapped. When the session goal is done, or after the app has fully answered your last question, write exactly <END>.`
  const res = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-5.4-mini', reasoning_effort: 'none', max_completion_tokens: 200, messages: [{ role: 'system', content: sys }, { role: 'user', content: `Chat so far:\n${seen.slice(-24).join('\n') || '(nothing yet: you just opened the app)'}\n\nYour next message:` }] }) })
  const d = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  return (d.choices?.[0]?.message?.content ?? '<END>').trim().replace(/^"|"$/g, '')
}

const state = new Map<string, { profile: FinancialProfile; wallet: number; vault: number; cir: number; hasVault: boolean }>()
for (const p of PERSONAS) state.set(p.id, { profile: normalizeProfile({ v: 2 }), wallet: p.wallet, vault: 0, cir: 0, hasVault: p.hasVault })
const MAX_LINES = 12

async function session(p: Persona, n: number) {
  const st = state.get(p.id)!
  const goal = p.sessions[n]
  say(`\n===== ${p.id} session ${n + 1}: ${goal}`)
  const messages: Msg[] = [], seen: string[] = []
  const push = async (userText: string, shown: string) => {
    messages.push({ role: 'user', content: userText })
    const before = st.profile
    const r = await app(messages, st.profile, st)
    messages.push({ role: 'assistant', content: r.content })
    st.profile = applyOps(st.profile, readOps(r.ops))
    seen.push(`App: ${r.content}`)
    say(`${shown}\nAPP (${r.tokens.toLocaleString('en-US')} tok, ${r.status}): ${r.content}${r.actions.length ? `\n  [cards: ${r.actions.map(a => a.type + (a.amount ? ` $${a.amount.amount}` : '')).join(', ')}]` : ''}`)
    transcript.push({ persona: p.id, session: n + 1, user: userText, content: r.content, status: r.status, ops: r.ops, actions: r.actions, before, after: st.profile, wallet: st.wallet, vault: st.vault, cir: st.cir, tokens: r.tokens })
    if (r.status !== 200) stopped ||= `handler-${r.status}`
    return r.actions
  }
  for (let line = 0; line < MAX_LINES && !stopped; line++) {
    if (used > CAP - RESERVE) { stopped ||= 'reserve'; break }
    const text = await simUser(p, goal, seen)
    if (text.includes('<END>')) { say('USER: <END>'); break }
    seen.push(`You: ${text}`)
    let actions = await push(text, `USER: ${text}`)
    // The app's cards, handled as a person would, up to 4 in a row.
    for (let k = 0; k < 4 && actions.length && !stopped && used <= CAP - RESERVE; k++) {
      const form = actions.find(a => a.type === 'intake_form')
      const items = actions.find(a => a.type === 'confirm_items')
      const rec = actions.find(a => a.type === 'confirm_record')
      const open = actions.find(a => a.type === 'prepare_open_vault')
      const dep = actions.find(a => a.type === 'prepare_deposit')
      const buy = actions.find(a => a.type === 'prepare_buy_cirbtc')
      const wd = actions.find(a => a.type === 'prepare_withdraw')
      let ev = '', shown = ''
      if (form) {
        const its = formToItems({ ...EMPTY_FORM, ...p.form }, null)
        st.profile = applyOps(st.profile, its.flatMap(i => i.ops))
        ev = `[app event] The user reviewed the items: saved: ${its.map(i => i.text).join('; ')}. skipped: none.`; shown = `(you filled in the form: ${its.map(i => i.text).join('; ')})`
      } else if (items?.items?.length) {
        st.profile = applyOps(st.profile, readOps(items.items.flatMap(i => i.ops)))
        ev = `[app event] The user reviewed the items: saved: ${items.items.map(i => i.text).join('; ')}. skipped: none.${items.ask?.length ? ` Still to ask: ${items.ask.join(' | ')}.` : ''}`
        shown = `(you confirmed the card: ${items.items.map(i => i.text).join('; ')})`
      } else if (rec?.amount && rec.holdingType && rec.name) {
        const req: RecordRequest = { amountUsd: rec.amount.amount, holdingType: rec.holdingType as AssetType, name: rec.name, source: rec.source ?? null, ...(rec.safety ? { safety: true } : {}) }
        const opt = sourceOptions(st.profile, req, 25000).find(h => h.type === req.holdingType)
        const src: RecordSource = presetSource(req, st.profile) ?? (opt ? { kind: 'holding', id: opt.id } : { kind: 'new' })
        const summary = recordSummary(req, src, st.profile)
        st.profile = applyOps(st.profile, readOps(buildRecordOps(st.profile, req, src, 25000)))
        ev = `[app event] The user confirmed recording: ${summary}`; shown = `(you confirmed: ${summary})`
      } else if (open) {
        if (st.wallet < 1) break
        st.wallet -= 1; st.hasVault = true
        ev = '[app event] The user signed the card: Opened your emergency fund vault.'; shown = '(you signed: opened the vault)'
      } else if (dep?.amount && dep.amount.amount <= st.wallet) {
        const a = dep.amount.amount
        st.wallet -= a; st.vault += a; st.profile = applyOps(st.profile, walletMoveOps(st.profile, -a))
        ev = `[app event] The user signed the card: Added ${a} USDC to your emergency fund.`; shown = `(you signed: added ${a} USDC to the fund)`
      } else if (buy?.amount && buy.amount.amount <= st.wallet) {
        const a = buy.amount.amount
        st.wallet -= a; st.cir += +(a * 0.997).toFixed(2); st.profile = applyOps(st.profile, walletMoveOps(st.profile, -a))
        ev = '[app event] The user signed the card: cirBTC bought.'; shown = `(you signed: bought cirBTC for ${a} USDC)`
      } else if (wd?.amount && wd.amount.amount <= st.vault) {
        const a = wd.amount.amount
        st.vault -= a; st.wallet += a
        ev = `[app event] The user signed the card: Withdrew ${a} USDC to your wallet.`; shown = `(you signed: withdrew ${a} USDC)`
      } else break
      seen.push(shown)
      actions = await push(ev, shown)
    }
  }
  const s = state.get(p.id)!
  say(`-- end: wallet ${s.wallet}, vault ${s.vault}, cirBTC $${s.cir}; holdings: ${s.profile.holdings.map(h => `${h.name} ${h.value ?? `${h.quantity} ${h.unit ?? ''}`}`).join(', ')}; spending ${s.profile.expenses.map(e => e.monthly).join('+')}; debts ${s.profile.debts.map(d => `${d.name} ${d.balance}`).join(', ')}`)
}

try {
  for (let n = 0; n < 3 && !stopped; n++) for (const p of PERSONAS) { if (stopped) break; await session(p, n) }
  // Budget left: replay the personas from scratch with the same goals, for a second sample of the same paths.
  if (!stopped) for (const p of PERSONAS) state.set(p.id, { profile: normalizeProfile({ v: 2 }), wallet: p.wallet, vault: 0, cir: 0, hasVault: p.hasVault })
  for (let n = 0; n < 3 && !stopped; n++) for (const p of PERSONAS) { if (stopped) break; await session(p, n) }
  stopped ||= 'done'
} finally {
  globalThis.fetch = realFetch
  const sum = `tokens ${used.toLocaleString('en-US')} / ${CAP.toLocaleString('en-US')} (app ${appTokens.toLocaleString('en-US')}, simulated user ${simTokens.toLocaleString('en-US')}); stopped: ${stopped}; turns ${transcript.length}`
  say(`\n${sum}`)
  writeFileSync(`${OUT}.json`, JSON.stringify({ cap: CAP, used, appTokens, simTokens, stopped, transcript }, null, 2))
  writeFileSync(`${OUT}.txt`, log.join('\n'))
}
