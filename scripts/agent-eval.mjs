// Agent eval: plays the user through scripted multi-turn chats against /api/chat and
// checks every reply. Run after any prompt change (AGENTS.md Part 3):
//   node scripts/agent-eval.mjs [baseUrl] [--only name] [--runs 2]
// Default baseUrl https://moonsafe.app. Costs ~ $0.0008 per turn (gpt-4o-mini plan + reply, 2026-10-24).
// Writes the full transcript to scripts/agent-eval-last.txt.
// The app is English-first (2026-10-24): most scenarios are English; the "vi:" ones check that
// a Vietnamese message gets a Vietnamese reply. Vietnamese test phrases are marked lang-ok.

import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const BASE = args.find(a => a.startsWith('http')) ?? 'https://moonsafe.app'
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 1

const usdcStr = n => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n)} USDC`
const rate = (await (await fetch('https://open.er-api.com/v6/latest/USD')).json()).rates.VND

// ---- app-like state ------------------------------------------------------------------
const EMPTY = { monthlyIncome: null, monthlyExpenses: null, debtAmount: null, otherAssets: null, age: null, incomeStable: null, units: {}, holdings: [] }
const MONEY = ['monthlyIncome', 'monthlyExpenses', 'debtAmount', 'otherAssets']
// Like unitOf in the app: an amount without a unit is VND.
const toUsd = (p, f) => p[f] === null ? null : (p.units[f] === 'USDC' ? p[f] : p[f] / rate)

// Same rule as mergeHoldings (src/lib/allocation.ts): kind + symbol is the slot, quantity 0 removes.
function mergeAssets(list, updates) {
  let out = [...list]
  for (const u of updates ?? []) {
    out = out.filter(h => !(h.kind === u.kind && (h.symbol ?? '').toLowerCase() === (u.symbol ?? '').toLowerCase()))
    if (u.quantity > 0) out.push(u)
  }
  return out
}

function merge(profile, update) {
  const p = { ...profile, units: { ...profile.units } }
  for (const [k, v] of Object.entries(update ?? {})) {
    if (MONEY.includes(k) && v && typeof v === 'object') { p[k] = v.amount; p.units[k] = v.currency === 'VND' ? 'VND' : 'USDC' }
    else if (k in p && v !== null && v !== undefined) p[k] = v
  }
  return p
}
const complete = p => p.monthlyIncome !== null && p.monthlyExpenses > 0 && p.debtAmount !== null && p.age !== null && p.incomeStable !== null

function context(s) {
  const p = s.profile
  const exp = toUsd(p, 'monthlyExpenses')
  const floorMonths = p.incomeStable === null ? null : p.incomeStable ? 3 : 6
  const floorUsdc = exp && floorMonths ? exp * floorMonths : null
  const shortfall = floorUsdc !== null ? Math.max(0, floorUsdc - s.vault) : null
  const noDebt = p.debtAmount === null ? null : p.debtAmount === 0
  const fundOk = floorUsdc !== null && s.vault >= floorUsdc
  return {
    profile: p, profileSaved: complete(p),
    vaultBalanceUsdc: usdcStr(s.vault), vaultUsdc: s.vault,
    walletBalanceUsdc: usdcStr(s.wallet), walletUsdc: s.wallet, cirBtcUsdc: s.cir ?? 0,
    floorMonths, floorUsdc: floorUsdc !== null ? usdcStr(floorUsdc) : null, shortfallUsdc: shortfall !== null ? usdcStr(shortfall) : null,
    floorReachedPct: floorUsdc ? Math.round(Math.min(100, s.vault / floorUsdc * 100)) : null,
    investUnlocked: complete(p) && noDebt === true && fundOk,
    fundOk,
    dca: s.dca ?? null,
  }
}

// ---- checks ----------------------------------------------------------------------------
const CLAIM = /\bI(['’]ve| have| just)\s+(opened|filled|created|set up|shown|prepared)\b|(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?/i // lang-ok
const NBSP = new RegExp(String.fromCharCode(160), 'g')
const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i // lang-ok
// A number token read both ways: "1,160.71" (en) and "1.160,71" (vi); one of them is right.
const readings = t => [Number(t.replace(/,/g, '')), Number(t.replace(/\./g, '').replace(',', '.'))].filter(Number.isFinite)
const SCALE = { triệu: 1e6, million: 1e6, M: 1e6, k: 1e3 } // lang-ok
function amountsIn(text) {
  const out = []
  for (const m of text.matchAll(/\$\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(M VND|million VND|million|triệu|USDC|VND|₫|đ\b)/g)) { // lang-ok
    const tok = m[1] ?? m[2], unit = m[3] ?? '$'
    const k = unit.startsWith('M') ? 1e6 : SCALE[unit.split(' ')[0]] ?? 1
    out.push({ raw: m[0], values: readings(tok).map(v => v * k) })
  }
  return out
}
function numbersIn(text) {
  const out = []
  for (const m of text.matchAll(/(\d[\d.,]*\d|\d)(\s*(triệu|million|M\b))?/g)) out.push(...readings(m[1]).map(v => v * (m[2] ? 1e6 : 1))) // lang-ok
  return out
}
// An amount is grounded when some number in the data matches it within 1 % (rounding).
const grounded = (a, nums) => a.values.some(v => v === 0 || nums.some(n => n > 0 && Math.abs(n - v) / n <= 0.01))

// Questions (one sentence ending in "?") that re-ask a field the app already has.
const KNOWN_ASK = {
  monthlyIncome: /(income|salary|earn|thu nhập|lương)[^?]{0,30}(how much|what is|bao nhiêu)|how much do you (earn|make)/i, // lang-ok
  monthlyExpenses: /(spend|spending|chi tiêu)[^?]{0,30}(how much|what is|bao nhiêu)|how much do you spend/i, // lang-ok
  debtAmount: /do you have (any )?debts?|bạn (có|còn) (khoản )?nợ (nào|không|bao nhiêu)/i, // lang-ok
  age: /how old|your age|bao nhiêu tuổi|tuổi của bạn/i, // lang-ok
  incomeStable: /(job|income|work|công việc|thu nhập)[^?]{0,30}(stable|steady|regular|ổn định)/i, // lang-ok
}

function check(turn, res, ctx, userTexts) {
  const fails = []
  const c = res.content ?? ''
  const acts = res.actions ?? []
  if (!c) fails.push('empty reply')
  const viUser = VI_LETTERS.test(userTexts[userTexts.length - 1] ?? '')
  if (viUser && !VI_LETTERS.test(c)) fails.push('Vietnamese message, reply not in Vietnamese')
  if (!viUser && VI_LETTERS.test(c)) fails.push('English message, reply in Vietnamese')
  if (!acts.length && CLAIM.test(c)) fails.push('claims an action that did not run')
  if (/\btôi\b/i.test(c)) fails.push('says "tôi"') // lang-ok
  if (/(VND|triệu)[^.\n?]{0,20}[−-]\s*[\d.,]+\s*USDC|USDC[^.\n?]{0,20}[−-]\s*[\d.,]+\s*(VND|triệu)/i.test(c)) fails.push('mixes VND and USDC in one calculation') // lang-ok
  if (/(you need to|you must|please) (declare|provide|fill in)|(bạn cần|vui lòng|hãy|bạn phải)\s+khai báo/i.test(c)) fails.push('pushes the user to declare') // lang-ok
  if ((c.match(/\?/g) ?? []).length > 1) fails.push('more than one question')
  if (!res.profileUpdate && !res.assetUpdates && /\b(noted|recorded)\b|đã ghi nhận/i.test(c)) fails.push('says "noted" with nothing recorded') // lang-ok
  if (/^\s*(thanks|thank you|cảm ơn|cám ơn)/i.test(c)) fails.push('opens with a thank-you') // lang-ok
  if (c.length > (turn.maxLen ?? 650)) fails.push(`too long (${c.length} chars)`)
  // The safe part is bank savings the user makes outside the app; the fund (vault) is something else.
  if (/safe fund|(add|deposit|move|put)[^.?!\n]{0,40}(into|to) (the |your )?safe (part|fund|bucket)|quỹ an toàn|nạp[^.?!\n]{0,40}(vào |phần )an toàn/i.test(c)) fails.push('confuses the safe part with the fund') // lang-ok
  if (/(invest|put|move|allocate|nên|đầu tư|dành|chia)\s+\**\d+\s*%\**[^.?!\n]{0,25}(of (your )?idle|(số )?tiền nhàn rỗi)/i.test(c)) fails.push('applies the target % to idle money instead of the total') // lang-ok
  if (/(deposit|add)[^.?!\n]{0,40}to (pay|repay|clear)[^.?!\n]{0,10}debt|nạp[^.?!\n]{0,40}(để )?trả nợ/i.test(c)) fails.push('offers a deposit to pay debt') // lang-ok
  if (/(don['’]t|do not) have enough (information|details)|chưa (có|biết) đủ thông tin/i.test(c) && complete(ctx.profile)) fails.push('says info is missing although the profile is complete') // lang-ok
  const sources = [res.facts ?? '', ...(res.notes ?? []), JSON.stringify(ctx), ...userTexts].map(s => s.replace(NBSP, ' '))
  const nums = sources.flatMap(t => numbersIn(t))
  for (const a of amountsIn(c.replace(NBSP, ' '))) if (!grounded(a, nums)) fails.push(`amount not in data: "${a.raw}"`)
  const questions = c.split(/(?<=[.!?\n])/).filter(q => q.trim().endsWith('?'))
  for (const [f, re] of Object.entries(KNOWN_ASK)) if (ctx.profile[f] !== null && questions.some(q => re.test(q))) fails.push(`asks again about known ${f}`)
  const want = turn.action ?? null
  // allowAction: showing the allocation chart unasked is fine on allocation questions.
  if (!want && acts.some(a => !(turn.allowAction && a.type === 'show_allocation'))) fails.push(`unrequested action ${JSON.stringify(acts)}`)
  if (want) {
    const a = acts.find(x => x.type === want.type)
    if (!a) fails.push(`expected action ${want.type}, got ${JSON.stringify(acts)}`)
    else if (want.amount !== undefined) {
      // The app converts a VND amount to USDC itself, so compare in USDC.
      const got = a.amount ? (a.amount.currency === 'VND' ? a.amount.amount / rate : a.amount.amount) : -1
      if (Math.abs(got - want.amount) > (want.tol ?? 0.01)) fails.push(`action amount ${JSON.stringify(a.amount)} ≠ ${want.amount} USDC`)
    }
  }
  for (const re of turn.must ?? []) if (!re.test(c)) fails.push(`missing ${re}`)
  for (const re of turn.mustNot ?? []) if (re.test(c)) fails.push(`should not say ${re}`)
  if (turn.profile) for (const [k, v] of Object.entries(turn.profile)) {
    const got = res.profileUpdate?.[k]
    const val = got && typeof got === 'object' ? got.amount : got
    if (v === 'absent' ? got !== undefined : val !== v) fails.push(`profileUpdate.${k} = ${JSON.stringify(got)}, want ${v}`)
  }
  if (turn.dcaStop && !res.dcaStop) fails.push('expected dcaStop')
  const got = res.assetUpdates ?? []
  for (const w of turn.assets ?? []) {
    const a = got.find(h => h.kind === w.kind && (w.symbol === undefined || (h.symbol ?? '').toUpperCase() === w.symbol))
    if (!a) fails.push(`expected asset ${JSON.stringify(w)}, got ${JSON.stringify(got)}`)
    else if (Math.abs(a.quantity - w.quantity) > 1e-3 * Math.max(1, w.quantity)) fails.push(`asset ${w.kind} ${w.symbol ?? ''} quantity ${a.quantity} ≠ ${w.quantity}`)
  }
  for (const k of turn.noAsset ?? []) if (got.some(h => `${h.kind}:${h.symbol ?? ''}` === k)) fails.push(`should not record ${k}`)
  if (!turn.assets && !turn.allowAssets && got.length) fails.push(`unrequested assets ${JSON.stringify(got)}`)
  return fails
}

// ---- scenarios -------------------------------------------------------------------------
const P = o => ({ ...EMPTY, ...o, units: { ...(o.units ?? {}) } })
const OZ_PER_LUONG = 37.5 / 31.1034768
const USD = u => Object.fromEntries(u.map(k => [k, 'USDC']))
const SC = [
  { name: 'greeting, nothing known', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'hi', mustNot: [/\d/, /income[^.?!]*spending[^.?!]*debt/i, /lock/i] }] },
  { name: 'spending → stable job → open deposit', s: { profile: P({}), vault: 0, wallet: 3300 }, turns: [
    { u: 'I spend about $1,000 a month', profile: { monthlyExpenses: 1000 }, must: [/3[- ]months?/, /6[- ]months?/] },
    { u: 'I work an office job with a fixed salary', profile: { incomeStable: true }, mustNot: [/6[- ]months?/, /savings plan/i], must: [/deposit|add/i] },
    { u: 'ok go ahead and deposit it', action: { type: 'prepare_deposit', amount: 3000, tol: 1 } }] },
  { name: 'how much more (must not open a card)', s: { profile: P({ monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyExpenses']) }), vault: 0, wallet: 3300 }, turns: [
    { u: 'How much more do I need before I can invest?', mustNot: [/savings plan/i], must: [/deposit|add/i] }] },
  { name: 'fund has 1,000, stability unknown', s: { profile: P({ monthlyExpenses: 1000, units: USD(['monthlyExpenses']) }), vault: 1000, wallet: 1300.63 }, turns: [
    { u: 'How much more do I need for a full fund?', must: [/3[- ]months?/, /6[- ]months?/] }] },
  { name: 'freelancer, wallet short', s: { profile: P({}), vault: 1000, wallet: 300 }, turns: [
    { u: "I'm a freelancer, I make around 1500 USDC and spend about 600 USDC a month", profile: { incomeStable: false, monthlyIncome: 1500, monthlyExpenses: 600 }, must: [/6[- ]months?/], mustNot: [/3[- ]months? of spending =/] }] },
  { name: 'wallet short, has income: save + months', s: { profile: P({ monthlyIncome: 1500, monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 0, wallet: 50 }, turns: [
    { u: "I don't have savings yet, how do I build the fund?", must: [/sav/i, /month/] }] },
  { name: 'why keep an emergency fund', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'why not just invest everything instead of keeping an emergency fund?', must: [/sell/i] }] },
  { name: 'debt: pay off or fund first', s: { profile: P({ monthlyIncome: 2000, monthlyExpenses: 1000, debtAmount: 2000, age: 28, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 200, wallet: 500 }, turns: [
    { u: 'Should I fill the fund or pay off my debt first?', must: [/debt/i] }] },
  { name: 'buy cirBTC while locked', s: { profile: P({ monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyExpenses', 'debtAmount']) }), vault: 0, wallet: 3300 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', must: [/lock/i], mustNot: [/(don['’]t|do not) know (your )?spending/i] }] },
  { name: 'buy cirBTC when unlocked', s: { profile: P({ monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 0, age: 30, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 3000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', action: { type: 'prepare_buy_cirbtc', amount: 100 }, must: [/risk|lose|fall/i] }] },
  { name: 'open the Fund screen', s: { profile: P({}), vault: 100, wallet: 100 }, turns: [
    { u: 'open the Fund screen', action: { type: 'open_screen' } }] },
  { name: 'wants to invest while locked (no amount)', s: { profile: P({ monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyExpenses', 'debtAmount']) }), vault: 200, wallet: 2000 }, turns: [
    { u: 'I want to invest', must: [/lock/i] }] },
  { name: 'deposit 200 USDC', s: { profile: P({ monthlyExpenses: 1000, units: USD(['monthlyExpenses']) }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'deposit 200 USDC into my fund', action: { type: 'prepare_deposit', amount: 200 }, profile: { debtAmount: 'absent' } }] },
  { name: 'withdraw everything', s: { profile: P({}), vault: 1000, wallet: 300 }, turns: [
    { u: 'withdraw my whole fund to my wallet', action: { type: 'prepare_withdraw', amount: 1000, tol: 0.5 } }] },
  { name: 'declines to share income', s: { profile: P({ monthlyExpenses: 1000, units: USD(['monthlyExpenses']) }), vault: 0, wallet: 100 }, turns: [
    { u: "I'd rather not say what I earn", mustNot: [/(income|salary|job|stable|earn)[^.?!]*\?/i] }] },
  { name: 'what is an emergency fund', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'what is an emergency fund and why do I need one?', must: [/emergency/i] }] },
  { name: 'correct spending', s: { profile: P({ monthlyExpenses: 1000, incomeStable: true, units: USD(['monthlyExpenses']) }), vault: 0, wallet: 50 }, turns: [
    { u: 'sorry, my monthly spending is actually 1,200 USDC', profile: { monthlyExpenses: 1200 }, must: [/3,600/], mustNot: [/3,000 USDC/] }] },
  { name: 'why is investing still locked (debt)', s: { profile: P({ monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 500, age: 30, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 4000, wallet: 100 }, turns: [
    { u: 'why can I still not invest?', must: [/debt/i] }] },
  { name: 'where is my data stored', s: { profile: P({ monthlyExpenses: 1000, units: USD(['monthlyExpenses']) }), vault: 0, wallet: 0 }, turns: [
    { u: 'where is my data stored, will I lose it on a new device?', must: [/account/i], mustNot: [/browser/i] }] },
  { name: 'salary only, no guess on stability', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'my salary is $2,000', profile: { monthlyIncome: 2000, incomeStable: 'absent' } }] },
  { name: 'how much money do I have (no profile)', s: { profile: P({}), vault: 500, wallet: 1200 }, turns: [
    { u: 'how much money do I have in the app?', must: [/1,2\d\d|1,200/, /500/] }] },
  { name: 'stop DCA', s: { profile: P({ monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 0, age: 30, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 3000, wallet: 1000, dca: { amountUsdc: '50 USDC', everyDays: 7 } }, turns: [
    { u: 'stop my DCA please', dcaStop: true }] },
  { name: 'income then follow-up (no re-asking)', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'I earn $2,500 and spend $1,500 a month', profile: { monthlyIncome: 2500, monthlyExpenses: 1500 } },
    { u: 'so what percent am I saving?', must: [/40/], mustNot: [/stable[^.!]*\?/i] }] },
  { name: 'age + invest share', s: { profile: P({ monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 0, age: 30, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 3000, wallet: 1000 }, turns: [
    { u: 'what percent should I invest?', allowAction: true, must: [/70/, /30/], mustNot: [/monthly income/i, /110|120/] }] },
  { name: 'unlocked, holds cirBTC, how much more can I buy', s: { profile: P({ monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 0, age: 40, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 3000, wallet: 1000, cir: 500 }, turns: [
    { u: 'how much more cirBTC can I buy?', allowAction: true, must: [/60/], mustNot: [/cap|limit of/i] }] },
  { name: 'agree to deposit the gap (right unit)', s: { profile: P({ monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyExpenses', 'debtAmount']) }), vault: 0, wallet: 3300 }, turns: [
    { u: 'how much more do I need for a full fund?' },
    { u: 'ok deposit that', action: { type: 'prepare_deposit', amount: 3000, tol: 1 } }] },
  { name: 'debt in USDC, how am I doing', s: { profile: P({ monthlyIncome: 2000, monthlyExpenses: 1000, debtAmount: 300, age: 25, incomeStable: false, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']) }), vault: 0, wallet: 100 }, turns: [
    { u: 'how are my finances doing?', allowAction: true, must: [/debt/i] }] },
  // ---- framework 2026-10-24: assets, allocation ----
  { name: 'shares several assets', s: { profile: P({ age: 31 }), vault: 0, wallet: 200 }, turns: [
    { u: 'I have $10,000 in savings at Chase, 2 oz of gold, 10 shares of SPY and 0.5 ETH on Binance', assets: [
      { kind: 'savings', quantity: 10000 }, { kind: 'gold', quantity: 2 }, { kind: 'stock', symbol: 'SPY', quantity: 10 }, { kind: 'crypto', symbol: 'ETH', quantity: 0.5 }],
      must: [/noted/i] }] },
  { name: 'gold in grams', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'I own 100 grams of gold', assets: [{ kind: 'gold', quantity: 100 / 31.1034768 }] }] },
  { name: 'Vietnamese stock is not price-tracked', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'I have 100 shares of FPT on the Vietnam exchange, worth about $250', noAsset: ['stock:FPT'], allowAssets: true }] },
  { name: 'current allocation', s: { profile: P({ age: 31, holdings: [{ kind: 'savings', quantity: 2000, currency: 'USDC' }, { kind: 'crypto', symbol: 'ETH', quantity: 2 }] }), vault: 1000, wallet: 500 }, turns: [
    { u: 'how is my money split right now?', action: { type: 'show_allocation' }, must: [/69|31/] }] },
  { name: 'what to do with idle money', s: { profile: P({ age: 31, monthlyIncome: 3000, monthlyExpenses: 1000, debtAmount: 0, incomeStable: true, units: USD(['monthlyIncome', 'monthlyExpenses', 'debtAmount']), holdings: [{ kind: 'cash', quantity: 4000, currency: 'USDC' }] }), vault: 3000, wallet: 1000 }, turns: [
    { u: 'what should I do with my idle money?', allowAction: true, must: [/safe|savings/i, /invest/i] }] },
  { name: 'sold all ETH', s: { profile: P({ age: 31, holdings: [{ kind: 'crypto', symbol: 'ETH', quantity: 2 }] }), vault: 0, wallet: 0 }, turns: [
    { u: 'I sold all my ETH', assets: [{ kind: 'crypto', symbol: 'ETH', quantity: 0 }] }] },
  { name: 'more crypto than experts say', s: { profile: P({ age: 31, holdings: [{ kind: 'crypto', symbol: 'BTC', quantity: 0.2 }] }), vault: 1500, wallet: 100 }, turns: [
    { u: 'experts say crypto should be 5% at most, is it bad that I hold more?', allowAction: true, mustNot: [/should (only )?(be|hold|keep) (at most |no more than )?5%/i] }] },
  // ---- vi: Vietnamese messages get Vietnamese replies ----
  { name: 'vi: chào hỏi', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'chào bạn', mustNot: [/\d/, /khoá|khóa/i] }] }, // lang-ok
  { name: 'vi: kể chi tiêu VND', s: { profile: P({}), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'Mỗi tháng mình tiêu khoảng 10 triệu', profile: { monthlyExpenses: 10000000 }, must: [/3 tháng/, /6 tháng/] }] }, // lang-ok
  { name: 'vi: kể tài sản', s: { profile: P({ age: 31 }), vault: 0, wallet: 200 }, turns: [
    { u: 'Mình gửi Vietcombank 100 triệu, có 2 cây vàng và 0,5 ETH trên Binance', assets: [ // lang-ok
      { kind: 'savings', quantity: 100000000 }, { kind: 'gold', quantity: 2 * OZ_PER_LUONG }, { kind: 'crypto', symbol: 'ETH', quantity: 0.5 }] }] },
  { name: 'vi: nạp 200 USDC', s: { profile: P({ monthlyExpenses: 10000000 }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'nạp 200 USDC vào quỹ', action: { type: 'prepare_deposit', amount: 200 }, profile: { debtAmount: 'absent' } }] }, // lang-ok
  { name: 'vi: hỏi phân bổ', s: { profile: P({ age: 31, holdings: [{ kind: 'savings', quantity: 50000000, currency: 'VND' }, { kind: 'crypto', symbol: 'ETH', quantity: 2 }] }), vault: 1000, wallet: 500 }, turns: [
    { u: 'tiền của mình đang chia thế nào?', action: { type: 'show_allocation' }, must: [/69|31/] }] }, // lang-ok
]

// ---- run -------------------------------------------------------------------------------
let out = '', failures = 0, turns = 0
for (let run = 1; run <= RUNS; run++) for (const sc of SC) {
  if (ONLY && !sc.name.includes(ONLY)) continue
  const s = structuredClone(sc.s)
  const messages = []
  out += `\n### ${sc.name} (run ${run})\n`
  for (const t of sc.turns) {
    messages.push({ role: 'user', content: t.u })
    const ctx = context(s)
    const r = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, context: ctx, debug: true }) })
    const res = await r.json()
    const fails = check(t, res, ctx, messages.filter(m => m.role === 'user').map(m => m.content))
    turns++; if (fails.length) failures++
    out += `U: ${t.u}\nA: ${res.content ?? JSON.stringify(res)}\n   actions=${JSON.stringify(res.actions)} profileUpdate=${JSON.stringify(res.profileUpdate)} assets=${JSON.stringify(res.assetUpdates)}\n   ${fails.length ? 'FAIL: ' + fails.join(' | ') : 'ok'}\n`
    console.log(`${fails.length ? 'FAIL' : ' ok '} ${sc.name} › ${t.u}${fails.length ? '\n      ' + fails.join('\n      ') : ''}`)
    messages.push({ role: 'assistant', content: res.content ?? '' })
    s.profile = merge(s.profile, res.profileUpdate)
    s.profile.holdings = mergeAssets(s.profile.holdings ?? [], res.assetUpdates)
  }
}
writeFileSync(new URL('./agent-eval-last.txt', import.meta.url), out)
console.log(`\n${turns - failures}/${turns} turns clean. Transcript: scripts/agent-eval-last.txt`)
