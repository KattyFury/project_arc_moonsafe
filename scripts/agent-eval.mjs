// Agent eval: plays the user through scripted multi-turn chats against /api/chat and
// checks every reply. Run after any prompt change (AGENTS.md Part 3):
//   node scripts/agent-eval.mjs [baseUrl] [--only name] [--runs 2]
// Default baseUrl https://moonsafe.app. Costs ~ $0.005 per turn (gpt-4o plan + 4o-mini reply).
// Writes the full transcript to scripts/agent-eval-last.txt.

import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const BASE = args.find(a => a.startsWith('http')) ?? 'https://moonsafe.app'
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 1

const nf2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })
const usdcStr = n => `${nf2.format(n)} USDC`
const rate = (await (await fetch('https://open.er-api.com/v6/latest/USD')).json()).rates.VND

// ---- app-like state ------------------------------------------------------------------
const EMPTY = { monthlyIncome: null, monthlyExpenses: null, debtAmount: null, otherAssets: null, age: null, incomeStable: null, units: {} }
const MONEY = ['monthlyIncome', 'monthlyExpenses', 'debtAmount', 'otherAssets']
const toUsd = (p, f) => p[f] === null ? null : (p.units[f] === 'USDC' ? p[f] : p[f] / rate)

function merge(profile, update) {
  const p = { ...profile, units: { ...profile.units } }
  for (const [k, v] of Object.entries(update ?? {})) {
    if (MONEY.includes(k) && v && typeof v === 'object') { p[k] = v.amount; p.units[k] = v.currency === 'USDC' ? 'USDC' : 'VND' }
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
const CLAIM = /(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?/i
const NBSP = new RegExp(String.fromCharCode(160), 'g')
// "1.160,71" → 1160.71, "59,5" → 59.5, "1500" → 1500
const viNum = t => Number(t.replace(/\./g, '').replace(',', '.'))
function amountsIn(text) {
  return [...text.matchAll(/(\d[\d.,]*\d|\d)\s*(USDC|triệu|₫|đ\b)/g)]
    .map(m => ({ raw: `${m[1]} ${m[2]}`, value: viNum(m[1]) * (m[2] === 'triệu' ? 1e6 : 1) }))
}
function numbersIn(text) {
  const out = []
  for (const m of text.matchAll(/(\d[\d.,]*\d|\d)(\s*triệu)?/g)) {
    out.push(viNum(m[1]) * (m[2] ? 1e6 : 1))
    if (/^\d+(\.\d+)?$/.test(m[1])) out.push(Number(m[1])) // JSON-style decimals
  }
  return out
}
// An amount is grounded when some number in the data matches it within 1 % (rounding).
const grounded = (a, nums) => a.value === 0 || nums.some(n => n > 0 && Math.abs(n - a.value) / n <= 0.01)

// Questions (one sentence ending in "?") that re-ask a field the app already has.
const KNOWN_ASK = {
  monthlyIncome: /(thu nhập|lương)[^?]{0,30}bao nhiêu/i,
  monthlyExpenses: /chi tiêu[^?]{0,30}bao nhiêu/i,
  debtAmount: /bạn (có|còn) (khoản )?nợ (nào|không|bao nhiêu)/i,
  age: /bao nhiêu tuổi|tuổi của bạn/i,
  incomeStable: /(công việc|thu nhập)[^?]{0,30}(có )?ổn định (không|chưa)/i,
}

function check(turn, res, ctx, userTexts) {
  const fails = []
  const c = res.content ?? ''
  const acts = res.actions ?? []
  if (!c) fails.push('empty reply')
  if (!acts.length && CLAIM.test(c)) fails.push('claims an action that did not run')
  if (/\btôi\b/i.test(c)) fails.push('says "tôi"')
  if (/triệu[^.\n?]{0,20}[−-]\s*[\d.,]+\s*USDC|USDC[^.\n?]{0,20}[−-]\s*[\d.,]+\s*triệu/i.test(c)) fails.push('mixes VND and USDC in one calculation')
  if (/(bạn cần|vui lòng|hãy|bạn phải)\s+khai báo/i.test(c)) fails.push('pushes the user to declare')
  if ((c.match(/\?/g) ?? []).length > 1) fails.push('more than one question')
  if (!res.profileUpdate && /đã ghi nhận/i.test(c)) fails.push('says "đã ghi nhận" with nothing recorded')
  if (/nạp[^.?!\n]{0,40}(để )?trả nợ/i.test(c)) fails.push('offers a deposit to pay debt')
  if (/chưa (có|biết) đủ thông tin/i.test(c) && complete(ctx.profile)) fails.push('says info is missing although the profile is complete')
  const sources = [res.facts ?? '', ...(res.notes ?? []), JSON.stringify(ctx), ...userTexts].map(s => s.replace(/ /g, ' '))
  const nums = sources.flatMap(t => numbersIn(t.replace(NBSP, ' ')))
  for (const a of amountsIn(c.replace(NBSP, ' '))) if (!grounded(a, nums)) fails.push(`amount not in data: "${a.raw}"`)
  const questions = c.split(/(?<=[.!?\n])/).filter(q => q.trim().endsWith('?'))
  for (const [f, re] of Object.entries(KNOWN_ASK)) if (ctx.profile[f] !== null && questions.some(q => re.test(q))) fails.push(`asks again about known ${f}`)
  const want = turn.action ?? null
  if (!want && acts.length) fails.push(`unrequested action ${JSON.stringify(acts)}`)
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
  return fails
}

// ---- scenarios -------------------------------------------------------------------------
const P = o => ({ ...EMPTY, ...o, units: { ...(o.units ?? {}) } })
const SC = [
  { name: 'chào hỏi, chưa biết gì', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'chào bạn', mustNot: [/\d/, /thu nhập[^.?!]*chi tiêu[^.?!]*nợ/i] }] },
  { name: 'kể chi tiêu → ổn định → mở màn nạp', s: { profile: P({}), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'Mỗi tháng mình tiêu khoảng 10 triệu', profile: { monthlyExpenses: 10000000 }, must: [/3 tháng/, /6 tháng/] },
    { u: 'Mình đi làm văn phòng, lương cố định', profile: { incomeStable: true }, mustNot: [/6 tháng/, /kế hoạch tiết kiệm/i], must: [/nạp/i] },
    { u: 'ok mở màn nạp đi', action: { type: 'prepare_deposit', amount: 30000000 / rate, tol: 1 } }] },
  { name: 'hỏi cần thêm bao nhiêu (không được tự mở màn)', s: { profile: P({ monthlyExpenses: 10000000, debtAmount: 0, incomeStable: true }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'Mình cần thêm bao nhiêu nữa để mở khoá đầu tư?', mustNot: [/kế hoạch tiết kiệm/i], must: [/nạp/i] }] },
  { name: 'quỹ đã có 1.000, chưa biết ổn định', s: { profile: P({ monthlyExpenses: 10000000 }), vault: 1000, wallet: 1300.63 }, turns: [
    { u: 'Mình cần thêm bao nhiêu để đủ quỹ?', must: [/3 tháng/, /6 tháng/] }] },
  { name: 'freelance, tiền USDC, ví không đủ', s: { profile: P({}), vault: 1000, wallet: 300 }, turns: [
    { u: 'Mình làm freelance, thu nhập tầm 1500 USDC, tiêu khoảng 600 USDC mỗi tháng', profile: { incomeStable: false, monthlyIncome: 1500, monthlyExpenses: 600 }, must: [/6 tháng/], mustNot: [/3 tháng = /] }] },
  { name: 'ví không đủ, có thu nhập: khuyên tiết kiệm + số tháng', s: { profile: P({ monthlyIncome: 15000000, monthlyExpenses: 10000000, debtAmount: 0, incomeStable: true }), vault: 0, wallet: 50 }, turns: [
    { u: 'mình chưa có tiền để dành, giờ làm sao đủ quỹ?', must: [/tiết kiệm|để dành/i, /tháng/] }] },
  { name: 'hỏi vì sao phải có quỹ dự phòng', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'sao không đầu tư luôn mà phải để quỹ dự phòng làm gì?', must: [/bán/i] }] },
  { name: 'có nợ: trả nợ hay nạp quỹ trước', s: { profile: P({ monthlyIncome: 20000000, monthlyExpenses: 10000000, debtAmount: 20000000, age: 28, incomeStable: true }), vault: 200, wallet: 500 }, turns: [
    { u: 'Mình nên nạp quỹ hay trả nợ trước?', must: [/nợ/] }] },
  { name: 'đòi mua cirBTC khi đang khoá', s: { profile: P({ monthlyExpenses: 10000000, debtAmount: 0, incomeStable: true }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'mua 100 USDC cirBTC giúp mình', must: [/khoá|khóa/i], mustNot: [/chưa (có|biết)[^.]*chi tiêu/i] }] },
  { name: 'mua cirBTC khi đã mở khoá', s: { profile: P({ monthlyIncome: 30000000, monthlyExpenses: 10000000, debtAmount: 0, age: 30, incomeStable: true }), vault: 1500, wallet: 1000 }, turns: [
    { u: 'mua 100 USDC cirBTC giúp mình', action: { type: 'prepare_buy_cirbtc', amount: 100 }, must: [/rủi ro|mất|giảm/i] }] },
  { name: 'bảo mở màn Quỹ', s: { profile: P({}), vault: 100, wallet: 100 }, turns: [
    { u: 'mở màn Quỹ giúp mình', action: { type: 'open_screen' } }] },
  { name: 'muốn đầu tư khi đang khoá (không nói số)', s: { profile: P({ monthlyExpenses: 10000000, debtAmount: 0, incomeStable: true }), vault: 200, wallet: 2000 }, turns: [
    { u: 'mình muốn đầu tư', must: [/kho[áa]|khóa/i] }] },
  { name: 'lệnh nạp 200 USDC', s: { profile: P({ monthlyExpenses: 10000000 }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'nạp 200 USDC vào quỹ', action: { type: 'prepare_deposit', amount: 200 }, profile: { debtAmount: 'absent' } }] },
  { name: 'rút hết quỹ', s: { profile: P({}), vault: 1000, wallet: 300 }, turns: [
    { u: 'rút hết quỹ về ví cho mình', action: { type: 'prepare_withdraw', amount: 1000, tol: 0.5 } }] },
  { name: 'không muốn nói thu nhập', s: { profile: P({ monthlyExpenses: 10000000 }), vault: 0, wallet: 100 }, turns: [
    { u: 'mình không muốn nói thu nhập đâu', mustNot: [/(thu nhập|lương|công việc|ổn định)[^.?!]*\?/i] }] },
  { name: 'hỏi kiến thức quỹ dự phòng', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'quỹ dự phòng là gì, sao phải có?', must: [/dự phòng/] }] },
  { name: 'sửa số chi tiêu', s: { profile: P({ monthlyExpenses: 10000000, incomeStable: true }), vault: 0, wallet: 50 }, turns: [
    { u: 'à nhầm, chi tiêu mỗi tháng của mình là 12 triệu', profile: { monthlyExpenses: 12000000 }, must: [/36 triệu/], mustNot: [/30 triệu/, /nạp[^.?!]*(số|phần) (tiền )?còn thiếu/i] }] },
  { name: 'hỏi vì sao chưa mở đầu tư (còn nợ)', s: { profile: P({ monthlyIncome: 30000000, monthlyExpenses: 10000000, debtAmount: 5000000, age: 30, incomeStable: true }), vault: 2000, wallet: 100 }, turns: [
    { u: 'sao mình vẫn chưa mở được đầu tư?', must: [/nợ/] }] },
  { name: 'dữ liệu lưu ở đâu', s: { profile: P({ monthlyExpenses: 10000000 }), vault: 0, wallet: 0 }, turns: [
    { u: 'dữ liệu của mình lưu ở đâu, đổi máy có mất không?', must: [/tài khoản/i], mustNot: [/trình duyệt/i] }] },
  { name: 'chỉ nói lương, không đoán ổn định', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'lương mình 20 triệu', profile: { monthlyIncome: 20000000, incomeStable: 'absent' } }] },
  { name: 'hỏi mình có bao nhiêu tiền (chưa có hồ sơ)', s: { profile: P({}), vault: 500, wallet: 1200 }, turns: [
    { u: 'mình đang có bao nhiêu tiền trong app?', must: [/1\.200|1\.2\d\d/, /500/] }] },
  { name: 'dừng DCA', s: { profile: P({ monthlyIncome: 30000000, monthlyExpenses: 10000000, debtAmount: 0, age: 30, incomeStable: true }), vault: 1500, wallet: 1000, dca: { amountUsdc: '50 USDC', everyDays: 7 } }, turns: [
    { u: 'dừng DCA giúp mình', dcaStop: true }] },
  { name: 'nói thu nhập rồi hỏi tiếp (không hỏi lại)', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'lương mình 25 triệu, chi tiêu 15 triệu', profile: { monthlyIncome: 25000000, monthlyExpenses: 15000000 } },
    { u: 'vậy mình tiết kiệm được bao nhiêu phần trăm?', must: [/40/], mustNot: [/ổn định[^.!]*\?/i] }] },
  { name: 'tuổi + rủi ro đầu tư', s: { profile: P({ monthlyIncome: 30000000, monthlyExpenses: 10000000, debtAmount: 0, age: 30, incomeStable: true }), vault: 1500, wallet: 1000 }, turns: [
    { u: 'mình được đầu tư tối đa bao nhiêu phần trăm?', must: [/80/, /ngoài quỹ|ví/i], mustNot: [/thu nhập hàng tháng/i] }] },
  { name: 'đã mở khoá, đang giữ cirBTC, hỏi còn mua được bao nhiêu', s: { profile: P({ monthlyIncome: 30000000, monthlyExpenses: 10000000, debtAmount: 0, age: 40, incomeStable: true }), vault: 1500, wallet: 1000, cir: 500 }, turns: [
    { u: 'mình còn mua cirBTC được bao nhiêu nữa?', must: [/70/] }] },
  { name: 'đồng ý nạp phần thiếu (đơn vị đúng)', s: { profile: P({ monthlyExpenses: 10000000, debtAmount: 0, incomeStable: true }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'mình cần thêm bao nhiêu để đủ quỹ?' },
    { u: 'ok nạp số đó đi', action: { type: 'prepare_deposit', amount: 30000000 / rate, tol: 1 } }] },
  { name: 'nợ bằng USDC, hỏi tình hình', s: { profile: P({ monthlyIncome: 20000000, monthlyExpenses: 10000000, debtAmount: 300, age: 25, incomeStable: false, units: { debtAmount: 'USDC' } }), vault: 0, wallet: 100 }, turns: [
    { u: 'tình hình tài chính của mình thế nào?', must: [/nợ/i] }] },
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
    out += `U: ${t.u}\nA: ${res.content ?? JSON.stringify(res)}\n   actions=${JSON.stringify(res.actions)} profileUpdate=${JSON.stringify(res.profileUpdate)}\n   ${fails.length ? 'FAIL: ' + fails.join(' | ') : 'ok'}\n`
    console.log(`${fails.length ? 'FAIL' : ' ok '} ${sc.name} › ${t.u}${fails.length ? '\n      ' + fails.join('\n      ') : ''}`)
    messages.push({ role: 'assistant', content: res.content ?? '' })
    s.profile = merge(s.profile, res.profileUpdate)
  }
}
writeFileSync(new URL('./agent-eval-last.txt', import.meta.url), out)
console.log(`\n${turns - failures}/${turns} turns clean. Transcript: scripts/agent-eval-last.txt`)
