// Persona eval (Hieu, 2026-10-29): the same agent through very different users, to judge whether replies are short and right.
// Real model, through the capped eval server:
//   bun run eval:server -- --budget 600000          (terminal 1, OPENAI_API_KEY in the environment)
//   bun scripts/persona-eval.mjs [--only name]       (terminal 2)
// Plays each persona's lines in order, applies the agent's operations like the app does, answers forms and cards the way the
// persona would, and prints the whole transcript to scripts/persona-eval-last.txt for reading. No pass / fail here: read it.

import { writeFileSync } from 'node:fs'
import { applyOps, readOps, normalizeProfile } from '../src/lib/profile.ts'
import { EMPTY_FORM, formToItems } from '../src/lib/intakeForm.ts'

const BASE = 'http://localhost:8788'
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null

// What each persona types in the form when it appears (null = "Skip all").
const FORMS = {
  newbie: { age: '24', salary: '800', spending: '600', steady: 'yes', reliers: 'no', usdcThis: '50', bank: '300', goal: 'no', debt: 'no' },
  degen: { age: '27', salary: '2500', spending: '1500', steady: 'no', reliers: 'no', usdcThis: '50', btc: '4000', coins: '6000', goal: 'no', debt: 'no' },
  impatient: { age: '30', salary: '1', spending: '0.25', steady: 'yes', reliers: 'no', usdcThis: '1', bank: '1', stocks: '1', goal: 'no', debt: 'no' },
  viet: { age: '35', salary: '1200', spending: '700', steady: 'yes', reliers: 'yes', usdcThis: '50', bank: '2000', gold: '1000', goal: 'no', debt: 'no' },
  skeptic: null,
  trader: { age: '33', salary: '4000', spending: '2000', steady: 'yes', reliers: 'no', usdcThis: '50', bank: '6000', stocks: '5000', btc: '3000', goal: 'no', debt: 'no' },
}

// "FORM" = fill the form; "SIGN" = sign the last card shown; plain text = what the user types.
const PERSONAS = {
  newbie: ['hi, what is this app?', 'what is personal finance?', 'I want to start saving', 'FORM', 'what is an emergency fund? why do I need it?', 'ok', 'SIGN', 'what next?'],
  degen: ['I want to ape everything into BTC and alts', 'FORM', 'nah skip the emergency fund, I want to buy crypto now', 'no', 'why should I keep money doing nothing?'],
  impatient: ['invest', 'FORM', 'go', 'SIGN', 'crypto', 'make it 1$', 'is it free?'],
  viet: ['mình muốn quản lý tiền tốt hơn', 'FORM', 'quỹ dự phòng là gì vậy?', 'ok làm đi', 'SIGN', 'tiếp theo làm gì?'],
  skeptic: ['is this free?', 'why should I trust an AI with my money?', 'can you move my money without me?', 'what happens if MoonSafe disappears?'],
  trader: ['I trade by charts, I want to buy the dip on BTC', 'FORM', 'ok', 'SIGN', 'crypto', 'all at once', 'BTC dropped 10% today, should I buy more?'],
}

const post = async body => {
  const r = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

let out = ''
const log = s => { out += s + '\n'; console.log(s) }

for (const [name, lines] of Object.entries(PERSONAS)) {
  if (ONLY && name !== ONLY) continue
  log(`\n==================== ${name.toUpperCase()} ====================`)
  let profile = normalizeProfile({ v: 2 })
  const msgs = []
  let vault = 0, wallet = 50, hasVault = true, lastCard = null
  const say = async (text, hidden = false) => {
    msgs.push({ role: 'user', content: text })
    if (!hidden) log(`\nUSER: ${text}`)
    const res = await post({ messages: msgs.slice(-30), context: { profile, vaultUsdc: vault, walletUsdc: wallet, cirBtcUsdc: 0, hasVault, vaultFeeUsdc: 1 } })
    if (res.status !== 200) { log(`!! HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 200)}`); return false }
    const b = res.body
    profile = applyOps(profile, readOps(b.ops ?? []))
    msgs.push({ role: 'assistant', content: b.content ?? '' })
    log(`AGENT: ${b.content}`)
    for (const a of b.actions ?? []) {
      if (['prepare_deposit', 'prepare_withdraw', 'prepare_buy_cirbtc', 'prepare_open_vault'].includes(a.type)) { lastCard = a; log(`  [card ${a.type}${a.amount ? ` ${a.amount.amount} ${a.amount.currency}` : ''}]`) }
      else if (a.type !== 'open_screen') log(`  [${a.type}]`)
    }
    return true
  }
  for (const line of lines) {
    if (line === 'FORM') {
      const v = FORMS[name]
      if (!v) { if (!(await say('[app event] The user skipped the form.', true))) break; continue }
      const items = formToItems({ ...EMPTY_FORM, ...v }, null)
      for (const it of items) profile = applyOps(profile, it.ops)
      log(`\n(form saved: ${items.map(i => i.text).join('; ')})`)
      if (!(await say(`[app event] The user reviewed the items: saved: ${items.map(i => i.text).join('; ')}. skipped: none.`, true))) break
      continue
    }
    if (line === 'SIGN') {
      if (!lastCard) { log('\n(no card to sign)'); continue }
      const amt = lastCard.amount?.amount ?? 0
      const summary = lastCard.type === 'prepare_deposit' ? `Added ${amt} USDC to your emergency fund.` : lastCard.type === 'prepare_open_vault' ? 'Opened your emergency fund vault.' : 'cirBTC bought.'
      if (lastCard.type === 'prepare_deposit') { vault += amt; wallet -= amt }
      if (lastCard.type === 'prepare_open_vault') { hasVault = true; wallet -= 1 }
      log(`\n(signed: ${summary})`)
      lastCard = null
      if (!(await say(`[app event] The user signed the card: ${summary}`, true))) break
      continue
    }
    if (!(await say(line))) break
  }
}
const stats = await fetch(`${BASE}/__stats`).then(r => r.json()).catch(() => null)
log(`\nSTATS ${JSON.stringify(stats)}`)
writeFileSync(new URL('./persona-eval-last.txt', import.meta.url), out)
