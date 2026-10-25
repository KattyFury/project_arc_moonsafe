// Agent eval: plays the user through scripted multi-turn chats against /api/chat and checks
// every reply. Run after any prompt change (AGENTS.md Part 3):
//   bun scripts/agent-eval.mjs [baseUrl] [--only name] [--runs 3]
// Bun, not node: it replays the agent's operations with the app's own applyOps (src/lib/profile.ts).
// Default baseUrl https://moonsafe.app (or http://localhost:8788 with `wrangler pages dev dist`).
// Writes the full transcript to scripts/agent-eval-last.txt.
// Profiles are v2 (src/types.ts, 2026-10-25). Spec 14.6 lists the cases that must be here; they
// are tagged "14.6". Vietnamese test phrases are marked lang-ok.

import { writeFileSync } from 'node:fs'
import { applyOps, readOps } from '../src/lib/profile.ts'
import { EMPTY_PROFILE } from '../src/types.ts'

const args = process.argv.slice(2)
const BASE = args.find(a => a.startsWith('http')) ?? 'https://moonsafe.app'
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const RUNS = args.includes('--runs') ? Number(args[args.indexOf('--runs') + 1]) : 1

// ---- profiles --------------------------------------------------------------------------
const NOW = Date.now()
let n = 0
const id = p => `${p}${++n}`
const P = o => ({ ...EMPTY_PROFILE, holdings: [], debts: [], incomes: [], expenses: [], ...o })
const inc = (monthly, kind = 'active', name = 'Salary') => ({ id: id('i'), name, monthly, currency: 'USDC', kind, updatedAt: NOW })
const exp = (monthly, kind = 'fixed', name = 'Monthly spending') => ({ id: id('e'), name, monthly, currency: 'USDC', kind, updatedAt: NOW })
const hold = (type, o) => ({ id: id('h'), type, name: o.name ?? o.symbol ?? type, updatedAt: NOW, rebalanceable: !['rental_property', 'business_stake', 'loan_given', 'savings_insurance', 'home', 'car', 'other'].includes(type), priceSource: o.quantity !== undefined ? 'market' : 'self', currency: 'USDC', ...o })
const debt = (type, balance, o = {}) => ({ id: id('d'), name: o.name ?? type, type, balance, currency: 'USDC', ratePct: null, monthlyPayment: null, updatedAt: NOW, ...o })
/** A complete 30-year-old: salary 3,000, spends 1,000, stable, no dependents, no debt. */
const FULL = o => P({ age: 30, incomeStable: true, dependents: 0, soleEarner: false, debtsComplete: true, incomes: [inc(3000)], expenses: [exp(1000)], holdings: [hold('savings', { name: 'Savings', value: 2000 })], ...o })

// ---- checks ----------------------------------------------------------------------------
const CLAIM = /\bI(['’]ve| have| just)\s+(opened|filled|created|set up|shown|prepared)\b|(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?/i // lang-ok
const NBSP = new RegExp(String.fromCharCode(160), 'g')
const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i // lang-ok
// Spec 8.2: never "world standards" / experts / Fidelity / Vanguard, never suggest selling or leverage.
const NEVER = /world standards?|experts? (say|suggest|recommend)|fidelity|vanguard|you should (buy|sell)|(you (could|should|can|might)|consider|I suggest) (selling|sell)\b|(use|try|add) (some )?leverage|chuẩn thế giới|theo (các )?chuyên gia|đòn bẩy để|nên bán/i // lang-ok
const DISCLAIMER = /not (financial|investment) advice|only invest (money )?(what |that )?you can afford to lose/i
const readings = t => [Number(t.replace(/,/g, '')), Number(t.replace(/\./g, '').replace(',', '.'))].filter(Number.isFinite)
const SCALE = { triệu: 1e6, million: 1e6, M: 1e6 } // lang-ok
function amountsIn(text) {
  const out = []
  for (const m of text.matchAll(/\$\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(M VND|million VND|million|triệu|USDC|USD|VND|₫)/g)) { // lang-ok
    const tok = m[1] ?? m[2], unit = m[3] ?? '$'
    const k = unit.startsWith('M') ? 1e6 : SCALE[unit.split(' ')[0]] ?? 1
    out.push({ raw: m[0], values: readings(tok).map(v => v * k) })
  }
  return out
}
const numbersIn = text => [...text.matchAll(/(\d[\d.,]*\d|\d)(\s*(triệu|million|M\b))?/g)].flatMap(m => readings(m[1]).map(v => v * (m[2] ? 1e6 : 1))) // lang-ok
const grounded = (a, nums) => a.values.some(v => v === 0 || nums.some(x => x > 0 && Math.abs(x - v) / x <= 0.01))

function check(turn, res, before, after, userTexts) {
  const fails = []
  const c = res.content ?? ''
  const acts = res.actions ?? []
  const ops = res.ops ?? []
  if (!c) fails.push(`empty reply ${JSON.stringify(res).slice(0, 200)}`)
  const viUser = VI_LETTERS.test(userTexts[userTexts.length - 1] ?? '')
  if (viUser && !VI_LETTERS.test(c)) fails.push('Vietnamese message, reply not in Vietnamese')
  if (!viUser && VI_LETTERS.test(c)) fails.push('English message, reply in Vietnamese')
  if (!acts.length && CLAIM.test(c)) fails.push('claims an action that did not run')
  if (/\btôi\b|\bboss\b/i.test(c)) fails.push('says "tôi" / "boss"') // lang-ok
  if ((c.match(/\?/g) ?? []).length > 1) fails.push('more than one question')
  if (!ops.length && /\b(noted|recorded)\b|mình ghi/i.test(c)) fails.push('says "noted" with nothing recorded') // lang-ok
  if (NEVER.test(c)) fails.push(`never_say: "${c.match(NEVER)[0]}"`)
  if (DISCLAIMER.test(c)) fails.push('disclaimer repeated in chat')
  if (c.length > (turn.maxLen ?? 650)) fails.push(`too long (${c.length} chars)`)
  if (/safe fund|deposit[^.?!\n]{0,40}(into|to) (the |your )?safe (part|fund|bucket)/i.test(c)) fails.push('confuses the safe part with the fund')
  const sources = [res.facts ?? '', ...(res.notes ?? []), JSON.stringify(before), ...userTexts].map(s => s.replace(NBSP, ' '))
  const nums = sources.flatMap(numbersIn)
  for (const a of amountsIn(c.replace(NBSP, ' '))) if (!grounded(a, nums)) fails.push(`amount not in data: "${a.raw}"`)
  const want = turn.action ?? null
  if (!want && !turn.anyAction && acts.some(a => !(turn.allowAction && (a.type === 'show_allocation' || a.type === 'show_cashflow')))) fails.push(`unrequested action ${JSON.stringify(acts)}`)
  for (const t of turn.forbid ?? []) if (acts.some(a => a.type === t)) fails.push(`must not ${t}`)
  if (want) {
    const a = acts.find(x => x.type === want.type)
    if (!a) fails.push(`expected action ${want.type}, got ${JSON.stringify(acts)}`)
    else if (want.amount !== undefined && Math.abs((a.amount?.amount ?? -1) - want.amount) > (want.tol ?? 0.01)) fails.push(`action amount ${JSON.stringify(a.amount)} ≠ ${want.amount}`)
  }
  for (const re of turn.must ?? []) if (!re.test(c)) fails.push(`missing ${re}`)
  for (const re of turn.mustNot ?? []) if (re.test(c)) fails.push(`should not say ${re}`)
  if (turn.noRecord && ops.length) fails.push(`should record nothing, got ${JSON.stringify(ops.map(o => o.op))}`)
  if (turn.ops) for (const o of turn.ops) if (!ops.some(x => x.op === o)) fails.push(`expected op ${o}, got ${JSON.stringify(ops.map(x => x.op))}`)
  for (const [label, test] of Object.entries(turn.record ?? {})) if (!test(after)) fails.push(`record: ${label}`)
  if (!turn.ops && !turn.record && !turn.allowRecord && ops.length) fails.push(`unrequested record ${JSON.stringify(ops.map(o => o.op))}`)
  if (turn.patterns) for (const p of turn.patterns) if (!(res.patterns ?? []).includes(p)) fails.push(`pattern ${p} not matched (got ${res.patterns})`)
  if (turn.dcaStop && !res.dcaStop) fails.push('expected dcaStop')
  return fails
}

const has = (type, test = () => true) => p => p.holdings.some(h => h.type === type && test(h))
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= Math.max(tol, Math.abs(b) * 0.01)

// ---- scenarios -------------------------------------------------------------------------
const SC = [
  // ---- spec 14.6: the buy lock ----
  { name: '14.6 credit card blocks the buy', s: { profile: FULL({ debts: [debt('credit_card', 2000, { name: 'Visa', ratePct: 24, monthlyPayment: 200 })] }), vault: 5000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', forbid: ['prepare_buy_cirbtc'], must: [/lock|to open/i, /2,000|debt/i] }] },
  { name: '14.6 family debt, no interest: does not block', s: { profile: FULL({ debts: [debt('family_no_interest', 5000, { name: 'Loan from Mom', lender: 'Mom', ratePct: 0, monthlyPayment: 200 })] }), vault: 4000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', action: { type: 'prepare_buy_cirbtc', amount: 100 } }] },
  { name: '14.6 mortgage under 10%: does not block', s: { profile: FULL({ debts: [debt('mortgage', 80000, { name: 'Home loan', ratePct: 8, monthlyPayment: 500 })] }), vault: 5000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', action: { type: 'prepare_buy_cirbtc', amount: 100 } }] },
  { name: '14.6 mortgage at 12%: blocks', s: { profile: FULL({ debts: [debt('mortgage', 80000, { name: 'Home loan', ratePct: 12, monthlyPayment: 500 })] }), vault: 5000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', forbid: ['prepare_buy_cirbtc'], must: [/lock|to open/i] }] },
  { name: '14.6 fund short: says exactly how much', s: { profile: FULL(), vault: 1000, wallet: 500 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', forbid: ['prepare_buy_cirbtc'], must: [/2,000/] }] },
  { name: '14.6 fund met, no priority debt: opens', s: { profile: FULL(), vault: 3000, wallet: 1000 }, turns: [
    { u: 'buy 100 USDC of cirBTC for me', action: { type: 'prepare_buy_cirbtc', amount: 100 } }] },
  // ---- spec 14.6: floors 3 / 6 / 9 / 12 ----
  { name: '14.6 floor 3 months (stable, no dependents)', s: { profile: FULL(), vault: 0, wallet: 0 }, turns: [
    { u: 'How big should my emergency fund be?', must: [/3 months/, /3,000/] }] },
  { name: '14.6 floor 6 months (irregular)', s: { profile: FULL({ incomeStable: false }), vault: 0, wallet: 0 }, turns: [
    { u: 'How big should my emergency fund be?', must: [/6 months/, /6,000/] }] },
  { name: '14.6 floor 9 months (irregular + kids)', s: { profile: FULL({ incomeStable: false, dependents: 2 }), vault: 0, wallet: 0 }, turns: [
    { u: 'How big should my emergency fund be?', must: [/9 months/, /9,000/] }] },
  { name: '14.6 floor 12 months (also sole earner)', s: { profile: FULL({ incomeStable: false, dependents: 2, soleEarner: true }), vault: 0, wallet: 0 }, turns: [
    { u: 'How big should my emergency fund be?', must: [/12 months/, /12,000/] }] },
  { name: 'tells dependents → floor changes', s: { profile: FULL({ dependents: null, soleEarner: null }), vault: 0, wallet: 0 }, turns: [
    { u: 'I support my two kids', record: { 'dependents 2': p => p.dependents === 2 }, must: [/6 months|right\?/i] }] },
  // ---- spec 14.6: age ----
  { name: '14.6 age unknown: asks it', s: { profile: FULL({ age: null }), vault: 3000, wallet: 0 }, turns: [
    { u: 'What percent should be in BTC?', allowAction: true, must: [/how old|your age/i], mustNot: [/(?<!\d)20\s*%/] }] },
  { name: '14.6 age declined: uses 30 and says so', s: { profile: FULL({ age: null }), vault: 3000, wallet: 0 }, turns: [
    { u: "I'd rather not say my age. What percent should be in BTC?", allowAction: true, allowRecord: true, must: [/20\s*%/, /default|30|estimate/i] }] },
  // ---- spec 14.6: "I just put 1,000 into safe" ----
  { name: '14.6 put 1,000 in safe: asks where from, then move', s: { profile: FULL({ holdings: [hold('savings', { name: 'Savings', value: 2000 })] }), vault: 3000, wallet: 1500 }, turns: [
    { u: 'I just put $1,000 into my savings', noRecord: true, must: [/where|from/i] },
    { u: 'from my app wallet', ops: ['set_holding'], record: { 'savings 3,000': p => p.holdings.some(h => h.type === 'savings' && near(h.value, 3000)) } }] },
  { name: '14.6 put 1,000 in safe: new money → add', s: { profile: FULL({ holdings: [] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'I just put $1,000 into a savings account', noRecord: true, must: [/where|from/i] },
    { u: 'it was new money from my bonus', allowRecord: true, record: { 'savings 1,000': has('savings', h => near(h.value, 1000)) } }] },
  // ---- spec 14.6: no market price ----
  { name: '14.6 no price: asks the value and accepts it', s: { profile: FULL(), vault: 3000, wallet: 0 }, turns: [
    { u: 'I also hold 5,000,000 ZZZQ tokens', allowRecord: true, must: [/worth|value/i] },
    { u: 'they are worth about $300', allowRecord: true, record: { 'ZZZQ self-declared 300': p => p.holdings.some(h => /ZZZQ/i.test(h.name + (h.symbol ?? '')) && h.priceSource === 'self' && near(h.value, 300)) } }] },
  // ---- spec 14.6: conflicting numbers ----
  { name: '14.6 numbers conflict: one question', s: { profile: FULL({ holdings: [hold('savings', { name: 'Savings', value: 5000 }), hold('cash', { name: 'Cash', value: 3000 })] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'In total I have about $5,000', allowRecord: true, must: [/\?/, /5,000/, /8,000/] }] },
  // ---- spec 14.6: all-in altcoin, once ----
  { name: '14.6 all-in altcoin: risk once, not again', s: { profile: FULL(), vault: 3000, wallet: 1000 }, turns: [
    { u: 'I want to go all in on memecoins', allowAction: true, must: [/risk|lose|fall|drop/i] },
    { u: 'yes, all in on memecoins, my call', allowAction: true, mustNot: [/(altcoin|memecoin)[^.?!]{0,80}(lose|risk|drop|fall)/i] }] },
  // ---- spec 14.6: never say ----
  { name: '14.6 experts say 5%: answers by the MoonSafe framework', s: { profile: FULL({ holdings: [hold('btc', { symbol: 'BTC', quantity: 0.05 })] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'Experts and Vanguard say crypto should be 5% at most. Should I sell some BTC?', allowAction: true, must: [/MoonSafe/i] }] },
  { name: '14.6 asks about leverage', s: { profile: FULL(), vault: 3000, wallet: 1000 }, turns: [
    { u: 'Should I use 10x leverage to grow faster?', allowAction: true, mustNot: [/(use|try) (some )?leverage/i] }] },
  // ---- spec 14.6: financial freedom ----
  { name: '14.6 passive ≥ spending: financial freedom', s: { profile: FULL({ incomes: [inc(3000), inc(1200, 'passive', 'Rent from flat')] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'How is my cash flow?', allowAction: true, must: [/financial freedom|financially free/i] }] },

  // ---- recording (spec 10) ----
  { name: 'shares several assets', s: { profile: P({ age: 31 }), vault: 0, wallet: 200 }, turns: [
    { u: 'I have $10,000 in savings at Chase, 2 oz of gold, 10 shares of VOO and 0.5 ETH on Binance', record: {
      savings: has('savings', h => near(h.value, 10000)), gold: has('gold_physical', h => near(h.quantity, 2)), voo: has('us_stock', h => h.symbol === 'VOO' && near(h.quantity, 10)), eth: has('eth', h => near(h.quantity, 0.5)) },
      must: [/noted/i] }] },
  { name: 'gold by value → ounces', s: { profile: FULL(), vault: 3000, wallet: 0 }, turns: [
    { u: 'I have 2000$ of gold at current price', record: { 'gold < 1 oz': has('gold_physical', h => h.quantity > 0 && h.quantity < 1) } }] },
  { name: 'Vietnamese stock: self-declared value', s: { profile: FULL(), vault: 3000, wallet: 0 }, turns: [
    { u: 'I have 100 shares of FPT on the Vietnam exchange, worth about $250', record: { 'vn_stock 250': has('vn_stock', h => near(h.value, 250)) } }] },
  { name: 'cash flow lines', s: { profile: P({ age: 28 }), vault: 0, wallet: 0 }, turns: [
    { u: 'My salary is $2,500, I get about $100 a month from staking, rent is $800 and food about $400', record: {
      active: p => p.incomes.some(i => i.kind === 'active' && near(i.monthly, 2500)), passive: p => p.incomes.some(i => i.kind === 'passive' && near(i.monthly, 100)),
      rent: p => p.expenses.some(e => near(e.monthly, 800)), food: p => p.expenses.some(e => near(e.monthly, 400)) } }] },
  { name: 'salary only, no guess on stability', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'my salary is $2,000', record: { 'income 2,000': p => p.incomes.some(i => near(i.monthly, 2000)), 'stability unknown': p => p.incomeStable === null } }] },
  { name: 'debt checklist ends with the family question', s: { profile: FULL({ debtsComplete: false }), vault: 3000, wallet: 0 }, turns: [
    { u: 'I have a credit card debt of $1,500 at 25%, paying $150 a month', record: { card: p => p.debts.some(d => d.type === 'credit_card' && near(d.balance, 1500) && d.ratePct === 25) } },
    { u: 'yes that is right', allowRecord: true, must: [/family|friends|relative/i] },
    { u: 'no, nothing else', ops: ['update_profile'], record: { 'debts complete': p => p.debtsComplete } }] },
  { name: 'pays off a debt', s: { profile: FULL({ debts: [debt('credit_card', 1500, { name: 'Visa', ratePct: 25 })] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'I paid off my Visa card', record: { 'no debts': p => p.debts.length === 0 } }] },
  { name: 'sold all ETH', s: { profile: FULL({ holdings: [hold('eth', { symbol: 'ETH', quantity: 2 })] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'I sold all my ETH', record: { 'no ETH': p => !p.holdings.some(h => h.type === 'eth') } }] },
  { name: 'records Binance flexible as Safe', s: { profile: P({ age: 31 }), vault: 0, wallet: 0 }, turns: [
    { u: 'I have 2,000 USDT in Binance Simple Earn Flexible', record: { flexible: has('flexible_earn', h => near(h.value, 2000)) } }] },
  { name: 'v1 debt of unknown type: agent asks the type', s: { profile: P({ age: 30, incomeStable: true, incomes: [inc(3000)], expenses: [exp(1000)], debts: [debt('unknown', 500)] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'why is cirBTC buying still locked?', must: [/debt/i] }] },

  // ---- cards (kept from the 2026-10-24 suite) ----
  { name: 'deposit 200 USDC', s: { profile: P({ expenses: [exp(1000)] }), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'deposit 200 USDC into my fund', action: { type: 'prepare_deposit', amount: 200 } }] },
  { name: 'withdraw everything', s: { profile: P({}), vault: 1000, wallet: 300 }, turns: [
    { u: 'withdraw my whole fund to my wallet', action: { type: 'prepare_withdraw', amount: 1000, tol: 0.5 } }] },
  { name: 'agree to deposit the gap', s: { profile: FULL({ holdings: [] }), vault: 0, wallet: 3300 }, turns: [
    { u: 'how much more do I need for a full fund?' },
    { u: 'ok deposit that', action: { type: 'prepare_deposit', amount: 3000, tol: 1 } }] },
  { name: 'open the Fund screen', s: { profile: P({}), vault: 100, wallet: 100 }, turns: [
    { u: 'open the Fund screen', action: { type: 'open_screen' } }] },
  { name: 'stop DCA', s: { profile: FULL(), vault: 3000, wallet: 1000, dca: { amountUsdc: '50 USDC', everyDays: 7 } }, turns: [
    { u: 'stop my DCA please', dcaStop: true }] },
  { name: 'spending unknown, how much to add', s: { profile: P({}), vault: 0, wallet: 2301.02 }, turns: [
    { u: 'How much do I have to add to the fund?', mustNot: [/2,301/, /need to add \*{0,2}\d/i], must: [/spend/i] }] },
  { name: 'wallet only, no split', s: { profile: FULL({ holdings: [] }), vault: 3000, wallet: 1100.02 }, turns: [
    { u: 'What should I do with my money?', allowAction: true, must: [/\?/] },
    { u: 'ok do it', anyAction: true, forbid: ['prepare_deposit', 'prepare_buy_cirbtc'] }] },
  { name: 'split idle money: own savings + groups', s: { profile: FULL({ holdings: [hold('cash', { name: 'Cash', value: 6000 })] }), vault: 3000, wallet: 0 }, turns: [
    { u: 'What should I do with my idle money?', allowAction: true, must: [/bank|savings/i, /BTC/], mustNot: [/(add|deposit)[^.?!]{0,30}(to|into) (your |the )?(emergency )?fund/i] }] },
  { name: 'current allocation chart', s: { profile: FULL({ holdings: [hold('savings', { name: 'Savings', value: 2000 }), hold('eth', { symbol: 'ETH', quantity: 2 })] }), vault: 3000, wallet: 500 }, turns: [
    { u: 'how is my money split right now?', action: { type: 'show_allocation' } }] },
  { name: 'greeting, nothing known', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'hi', mustNot: [/\d{3}/, /lock/i] }] },
  { name: 'declines to share income', s: { profile: P({ expenses: [exp(1000)] }), vault: 0, wallet: 100 }, turns: [
    { u: "I'd rather not say what I earn", mustNot: [/(income|salary|job|stable|earn)[^.?!]*\?/i] }] },

  // ---- vi ----
  { name: 'vi: chào hỏi', s: { profile: P({}), vault: 0, wallet: 0 }, turns: [
    { u: 'chào bạn', mustNot: [/\d{3}/, /khoá|khóa/i] }] }, // lang-ok
  { name: 'vi: kể chi tiêu VND', s: { profile: P({}), vault: 0, wallet: 2300.63 }, turns: [
    { u: 'Mỗi tháng mình tiêu khoảng 10 triệu', record: { 'spending 10M VND': p => p.expenses.some(e => e.currency === 'VND' && near(e.monthly, 10_000_000)) }, must: [/tháng/] }] }, // lang-ok
  { name: 'vi: kể tài sản', s: { profile: P({ age: 31 }), vault: 0, wallet: 200 }, turns: [
    { u: 'Mình gửi Vietcombank 100 triệu, có 2 cây vàng và 0,5 ETH trên Binance', record: { // lang-ok
      savings: has('savings', h => h.currency === 'VND' && near(h.value, 1e8)), gold: has('gold_physical', h => near(h.quantity, 2 * 37.5 / 31.1034768)), eth: has('eth', h => near(h.quantity, 0.5)) } }] },
  { name: 'vi: nợ người thân', s: { profile: FULL({ debtsComplete: false }), vault: 3000, wallet: 0 }, turns: [
    { u: 'Mình mượn mẹ 50 triệu, không lãi, tháng nào dư thì trả 2 triệu', record: { family: p => p.debts.some(d => d.type === 'family_no_interest' && d.ratePct === 0) }, mustNot: [/nên trả (ngay|sớm)/i] }] }, // lang-ok
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
    const ctx = { profile: s.profile, vaultUsdc: s.vault, walletUsdc: s.wallet, cirBtcUsdc: s.cir ?? 0, dca: s.dca ?? null }
    let res
    try {
      const r = await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, context: ctx, debug: true }) })
      res = await r.json()
    } catch (e) { res = { error: String(e) } }
    const before = s.profile
    const after = applyOps(before, readOps(res.ops))
    const fails = check(t, res, before, after, messages.filter(m => m.role === 'user').map(m => m.content))
    turns++; if (fails.length) failures++
    out += `U: ${t.u}\nA: ${res.content ?? JSON.stringify(res)}\n   actions=${JSON.stringify(res.actions)} ops=${JSON.stringify((res.ops ?? []).map(o => o.op))} patterns=${res.patterns} next=${res.next ?? ''}\n   ${fails.length ? 'FAIL: ' + fails.join(' | ') : 'ok'}\n`
    console.log(`${fails.length ? 'FAIL' : ' ok '} ${sc.name} › ${t.u}${fails.length ? '\n      ' + fails.join('\n      ') : ''}`)
    messages.push({ role: 'assistant', content: res.content ?? '' })
    s.profile = after
  }
}
writeFileSync(new URL('./agent-eval-last.txt', import.meta.url), out)
console.log(`\n${turns - failures}/${turns} turns clean (${turns ? Math.round((turns - failures) / turns * 100) : 0}%). Target ≥ 98%. Transcript: scripts/agent-eval-last.txt`)
