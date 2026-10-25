// Cloudflare Pages Function — MoonSafe agent (OpenAI), every app operation is a tool.
// OPENAI_API_KEY is in Cloudflare environment variables (never in client bundle).
//
// Each user message runs two stages:
// 1. PLAN (gpt-4o-mini since 2026-10-24, free OpenAI tokens; gpt-4o before): a tool loop of at most
//    10 steps, tool_choice "required" every step: fill the profile (saved by the app), record assets,
//    prepare a deposit / withdrawal / cirBTC buy / DCA, open a screen, stop DCA; no_action ends it. Letting gpt-4o-mini decide on its own called a tool 0/8
//    times and once filed "deposit 200 USDC" as debt (measured 2026-10-22).
// 2. REPLY (gpt-4o-mini): talks to the user and may only describe what step 1 did.
// The app performs the returned actions (opens screens, prefills amounts); the user
// always signs in their own wallet.
//
// Personal-finance framework (docs/FRAMEWORK-TAI-CHINH.md, 2026-10-24): fund first, then the
// money outside the fund is split safe / invest / idle, target safe = age %, invest = 100 − age %.
// Allocation numbers come from src/lib/allocation.ts, the same code the app's chart uses.
//
// Language (2026-10-24): the app is English-only; the agent answers in the language of the
// user's message (English by default, Vietnamese when they write Vietnamese). Intent patterns
// below therefore read both; lines holding Vietnamese are marked lang-ok for scripts/check-lang.mjs.

import { getPrices } from './prices'
import { allocate, mergeHoldings, toHolding, type Allocation } from '../../src/lib/allocation'
import type { Holding } from '../../src/types'

interface Env {
  OPENAI_API_KEY: string
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
}

interface RequestBody {
  messages: Message[]
  /** Declared profile, fund progress and DCA status sent by the app. */
  context?: Record<string, unknown> | null
  profile?: Record<string, unknown> | null // legacy clients
  /** Eval harness: also return the computed fund facts (no secrets in them). */
  debug?: boolean
}

interface ToolCall { id: string; function: { name: string; arguments: string } }
interface Completion {
  choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const RULES = `## MoonSafe in short
MoonSafe records the user's money and offers options; the user decides everything about their own money. Never push, never block.
1. Emergency fund first: 3 months of essential spending if income is stable, 6 if not. USDC in the user's vault, kept apart from everything below.
2. Buying cirBTC / DCA in the app opens once there is no outside debt AND the fund has reached its floor (investUnlocked).
3. Money outside the fund has 3 parts. Safe = cash in bank savings, or USDT / USDC in flexible earn such as Binance Simple Earn Flexible. Invest = stocks & gold (one share), BTC / cirBTC, altcoins. Idle = not placed yet (wallet USDC, cash, stablecoins not earning).
4. Target by age: safe = age %, invest = 100 − age %. Inside invest, MoonSafe's view: stocks & gold 40%, the rest in coins, mostly BTC, altcoins up to 5% for those who like to degen (age 30: 30% safe, 40% stocks & gold, 25% BTC, 5% altcoins; coins shrink with age). This is more crypto than the 0–5% institutions advise. All of it is a suggestion: off target → say by how much, the user decides.`

// The user declining to share something ("I'd rather not say my income", "không muốn nói thu nhập"…).
const DECLINES = /(don'?t|do not|rather not|prefer not)\s+(want\s+to\s+|to\s+)?(say|share|tell|disclose)|\bprivate\b|none of your business|(không|chưa|ko|k)\s+(muốn|thích|tiện|định)\s+(nói|kể|chia sẻ|tiết lộ|khai)|bí mật|riêng tư|đừng hỏi/i // lang-ok

// A UI action only runs when the latest message asks for one or clearly agrees to the
// agent's offer (2026-10-22 eval: "I work in an office" once opened a prefilled deposit).
// \b treats Vietnamese letters as non-word, so word edges are written with \p{L}.
// Agreement only counts at the start of the message ("ok so my salary is…" is not a yes).
const AGREES = /^\s*(ok|okay|oke|sure|yes|yeah|yep|go ahead|do it|sounds good|please do|được|đồng ý|ừ|uk|chốt|nhất trí|triển)(?!\p{L})/iu // lang-ok
const ACTION_INTENT = new RegExp(`(?<!\\p{L})(deposit|add|top up|put|withdraw|take out|buy|purchase|sell|dca|open|show|fill|stop|move|transfer|nạp|rút|mua|bán|mở(?!\\s*kh(?:oá|óa|oa))|xem|điền|dừng|chuyển|làm đi)(?!\\p{L})|${AGREES.source}`, 'iu') // lang-ok
const INVEST_INTENT = /(?<!\p{L})(buy|invest|investing|cirbtc|dca|btc|mua|đầu tư)(?!\p{L})/iu // lang-ok
// Each card needs its own verb (or a plain yes): "buy 100 USDC of cirBTC" while locked once
// came back as a deposit card (eval 2026-10-24).
const ACTION_VERB: Record<string, RegExp> = {
  prepare_deposit: /(?<!\p{L})(deposit|add|top up|put|nạp|bỏ vào quỹ|cho vào quỹ)(?!\p{L})/iu, // lang-ok
  prepare_withdraw: /(?<!\p{L})(withdraw|take out|rút)(?!\p{L})/iu, // lang-ok
  prepare_buy_cirbtc: /(?<!\p{L})(buy|purchase|mua)(?!\p{L})/iu, // lang-ok
  propose_dca: /(?<!\p{L})(dca|recurring|weekly|monthly|every (week|month)|mua đều|định kỳ|mỗi tuần|mỗi tháng)(?!\p{L})/iu, // lang-ok
}
// Questions where the reply must state the target split by age.
const ASKS_TARGET = /(what (percent|percentage|share)|how much (should|can) i invest|allocat|split|how is my money|buy[^.?!\n]{0,25}how much|how much[^.?!\n]{0,25}buy|bao nhiêu (phần trăm|%)|tỷ lệ|tỉ lệ|phân bổ|chia (tiền|thế nào|sao)|mua[^.?!\n]{0,25}bao nhiêu)/iu // lang-ok
// "why not invest right away instead of keeping a fund?" asks why; it is not a request to invest.
const ASKS_WHY = /(?<!\p{L})(why|what for|what is|sao|tại sao|vì sao|làm gì|là gì)(?!\p{L})/iu // lang-ok
const DEPOSIT_WORD = /(?<!\p{L})(deposit|nạp)(?!\p{L})/iu // lang-ok
// An overall check-up ("how are my finances doing?"): the reply follows debt → fund → allocation.
const ASKS_OVERVIEW = /how (am i|are my finances|is my (financial )?situation)|my finances|tình hình (tài chính)?/i // lang-ok
// Letters only Vietnamese uses: the reply language follows the user's latest message. Without
// naming it, rewrite rounds drifted English questions into Vietnamese answers (eval 2026-10-24).
const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i // lang-ok

// The reply asks about job / income stability (directly, or "…is it stable. Could you tell me?").
// incomeStable is kept only when the user talked about how their income comes in (or answered
// the stability question). gpt-4o-mini filled incomeStable=true from "my salary is $2,000" (eval 2026-10-24).
const STABILITY_WORDS = /(?<!\p{L})(stable|steady|regular|irregular|fixed|employee|employed|full[- ]time|part[- ]time|salaried|freelanc\p{L}*|self[- ]employed|own (a |my )?business|contract|gig|ổn định|cố định|nhân viên|văn phòng|công chức|biên chế|tự do|kinh doanh|bấp bênh|thất thường)(?!\p{L})/iu // lang-ok
// A zero is recorded only when the user said so; gpt-4o-mini filled monthlyIncome 0 and debtAmount 0
// from "I work an office job with a fixed salary" (eval 2026-10-24).
const SAYS_NONE = /(?<!\p{L})(no|none|zero|nothing|don'?t have|do not have|debt[- ]free|paid off|không|chưa có|hết nợ|ko có)(?!\p{L})|(?<![\d.,])0(?![\d.,])/iu // lang-ok
// Vietnamese stocks are not price-tracked; gpt-4o-mini still filed "FPT on the Vietnam exchange" as a stock.
const VN_MARKET = /vietnam|(?<!\p{L})(vn|hose|hnx|upcom|vn-?index)(?!\p{L})|việt nam|sàn việt|chứng khoán việt|cổ phiếu việt/iu // lang-ok
const ASKS_STABLE = /(stable|steady|regular)[^.!?\n]*\?|ổn định[^.!?\n]*\?|ổn định[^.!?\n]*(không|chưa)\.\s*[^.!?\n]{0,80}\?/i // lang-ok

/**
 * Last resort after the rewrites: remove a repeated stability question, then keep only the
 * last question if several remain (one question per reply).
 */
function tidyQuestions(text: string, dropStable: boolean): string {
  const lines = text.split('\n').map(line => line.split(/(?<=[.!?])\s+/))
  if (dropStable) for (const parts of lines) for (let i = parts.length - 1; i >= 0; i--) if (ASKS_STABLE.test(parts[i].trim())) parts.splice(i, 1)
  const questions = lines.flatMap((parts, li) => parts.map((p, pi) => ({ li, pi, q: p.trim().endsWith('?') }))).filter(x => x.q)
  for (const x of questions.slice(0, -1)) lines[x.li][x.pi] = ''
  return lines.map(parts => parts.filter(Boolean).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Phrases that report an app action as done; only allowed when an action actually ran.
const CLAIMS_ACTION = /\bI(['’]ve| have| just)\s+(opened|filled|created|set up|shown|prepared)\b|(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?|mở sẵn màn .{0,40} (rồi|cho bạn)/i // lang-ok
const SAYS_NOTED = /\b(noted|recorded|got it saved)\b|đã ghi nhận/i // lang-ok
// "You need to add 2,301 USDC" / "you can add up to 2,301 USDC" while the floor is unknown.
const NEEDS_AMOUNT = /((need|have|has) to (add|deposit|put)|can (add|deposit|put) up to|to reach (its|the|your) (required )?floor)[^.?!\n]{0,30}\d|(cần|phải|được tối đa) (nạp|thêm)[^.?!\n]{0,30}\d/i // lang-ok
// "Yes. How much I have to add?" is a question, not an order: gpt-4o-mini prepared a deposit of the whole wallet (2026-10-24).
const ASKS_USE = /idle|what (should|can) i do with|how (should|do) i (split|invest|use)|nhàn rỗi|làm gì với|chia (tiền|thế nào|sao)/i // lang-ok
const BUILD_FUND = /(?<!\p{L})(build|grow|save|saving|reach|xây|để dành|tiết kiệm)(?!\p{L})/iu // lang-ok
const DEBT_WORD = /(?<!\p{L})(debts?|loans?|nợ|khoản vay)(?!\p{L})/iu // lang-ok
const PUSHY = /(you need to|you must|please) (declare|provide|fill in)|(bạn cần|vui lòng|hãy|bạn phải)\s+khai báo/i // lang-ok
const OFFERED: Record<string, RegExp> = {
  prepare_buy_cirbtc: /(prepare|set up|proceed|go ahead)[^.?!\n]{0,40}(buy|purchase|invest)|(buy|purchase|cirBTC)[^.?!\n]{0,40}\?/i,
  prepare_deposit: /(prepare|set up)[^.?!\n]{0,30}deposit/i,
  prepare_withdraw: /(prepare|set up)[^.?!\n]{0,30}withdraw/i,
}
const NOTHING_ELSE = /(?<!\p{L})(nothing( else)?|none|no other|that'?s (all|it)|only (the|this|my) (app )?wallet|just (the|this|my) wallet|không có gì|không còn gì|chỉ có (ví|thế))(?!\p{L})/iu // lang-ok
const ASKED_HOLDINGS = /what (else|other)[^.?!\n]{0,60}\?|other (assets|investments)[^.?!\n]{0,40}\?|(tài sản|đầu tư) (gì )?khác[^.?!\n]{0,40}\?/i // lang-ok
// Money amounts with their unit on either side: "$2,000", "2000$", "2,000 USD", "50 million VND".
const MONEY_AMT = /\$\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?(\$|usdc?\b|dollars?\b|vnd\b|đ\b|₫|triệu|million)/gi // lang-ok
const SOLD = /(?<!\p{L})(sold|no longer|don'?t have|gone|bán hết|không còn)(?!\p{L})/iu // lang-ok
// "Would you like me to prepare a deposit for your savings?" / "I've prepared to move 275 USDC to your savings account".
// Only offers / claims by the agent, so advice like "you could move 275 USDC to your bank savings" passes.
const SAFE_IN_APP = /(\bI(['’]ve|['’]ll| have| will| can)?|would you like me to|shall I|let me|want me to)\s[^.?!\n]{0,20}(prepare|prepared|set up|make|arrange|move|moved|transfer|transferred)\b[^.?!\n]{0,40}(to|into|for) (your |the )?(safe )?(savings|bank|safe)|(mình|để mình)[^.?!\n]{0,20}(chuẩn bị|chuyển|nạp)[^.?!\n]{0,40}(tiết kiệm|ngân hàng)/i // lang-ok
const FUND_WORD = /fund|vault|emergency|quỹ/i // lang-ok
const ALL_OF_IT = /(?<!\p{L})(all|whole|everything|entire|max|hết|toàn bộ|tất cả)(?!\p{L})/iu // lang-ok
const ASKS_HOW_MUCH = /how much|bao nhiêu/i // lang-ok
const SAYS_LOCKED = /lock|kho[áa]|khóa/i // lang-ok
// The safe part is savings the user tops up outside the app ("add to your safe part" is fine since 2026-10-25); depositing it like the fund is the mistake.
const SAFE_AS_FUND = /safe fund|deposit[^.?!\n]{0,40}(into|to) (the |your )?safe (part|fund|bucket)|quỹ an toàn|nạp[^.?!\n]{0,40}(vào |phần )an toàn/i // lang-ok

// Vietnamese words the model must recognise in Vietnamese messages (the app itself is English-only).
const VI_VOICE = 'In Vietnamese: natural Vietnamese, call yourself "mình" and the user "bạn", never "tôi".' // lang-ok
const VI_FLOORS = 'Write fund floors as "3 tháng chi tiêu = …" and the figures\' labels in Vietnamese; never copy English labels such as "WALLET COVERS IT NOW".' // lang-ok
const VI_YES = '"được", "đồng ý", "nạp đi"' // lang-ok
const VI_DEPOSIT = '"nạp 200 USDC"' // lang-ok
const VI_USD = 'đô' // lang-ok
const VI_VND = 'đồng, triệu / tr, nghìn / k (15 triệu = 15000000)' // lang-ok
const VI_GOLD = '1 cây / lượng = 37.5 g, 1 chỉ = 3.75 g' // lang-ok

// ---- Grounding: every amount in a reply must come from the figures, the notes or the user ----
// "You will still need 2,800 USDC after adding 200" was the model doing its own subtraction
// (eval 2026-10-24); the prompt alone did not stop it.
const AMOUNT = /\$\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(M VND|million VND|million|triệu|USDC|VND|₫)/g // lang-ok
const NUMBER = /(\d[\d.,]*\d|\d)(\s*(triệu|million|M\b))?/g // lang-ok
/** A token read both ways, "1,160.71" (en) and "1.160,71" (vi); one of them is the meant value. */
const readings = (t: string) => [Number(t.replace(/,/g, '')), Number(t.replace(/\./g, '').replace(',', '.'))].filter(Number.isFinite)
function ungrounded(reply: string, sources: string[]): string[] {
  const known = sources.flatMap(s => [...s.replace(/ /g, ' ').matchAll(NUMBER)].flatMap(m => readings(m[1]).map(v => v * (m[2] ? 1e6 : 1))))
  const out: string[] = []
  for (const m of reply.replace(/ /g, ' ').matchAll(AMOUNT)) {
    const unit = m[3] ?? '$'
    const k = /^(M|million|triệu)/.test(unit) ? 1e6 : 1 // lang-ok
    const ok = readings(m[1] ?? m[2]).some(v => v * k === 0 || known.some(n => n > 0 && Math.abs(n - v * k) / n <= 0.01))
    if (!ok) out.push(m[0].trim())
  }
  return out
}

const REPLY_PROMPT = `You are MoonSafe's personal finance and investing advisor for Web3 users: professional, warm, plain words. Your job: advise, ask or record to understand their money, and prepare orders for them when useful. You never push them to buy or sell; they decide.

## Language
Reply in the language of the user's latest message (default English). ${VI_VOICE}

## Style
- The first sentence is the direct answer. At most 2 sentences plus one question (about 45 words); up to 4 when they ask why / what something is. Amounts and the key point in **bold**.
- No preamble, no repeating what they said, no filler at the end, no lecturing or judging.
- When investing comes up, half a sentence: information only, values can fall, no returns promised.

${RULES}

## Numbers (a wrong number loses trust)
- Only numbers from "ASSET & FUND FIGURES", the app state or the user's words. Never add, subtract, multiply, divide or convert yourself; if a number is missing, say it cannot be worked out yet.
- Fund floors read "N months of spending = amount"; "still needed" is its own number. Stability unknown → give both the 3- and 6-month floors, then ask.
- Spending unknown → nobody knows the floor: call no amount "needed", ask how much they spend a month.
- Fund short and the line says "WALLET COVERS IT NOW" → offer a deposit of exactly the gap. Otherwise offer what the wallet can add and suggest saving a set amount each month ("about N months" from the figures).

## Advice
- Target: always both parts, "X% safe, Y% invest" of all money outside the fund. Amounts to move come only from the "Suggested split" lines.
- Safe part: cash in their own bank savings, or USDT / USDC in a flexible earn product such as Binance Simple Earn Flexible (Web3-friendly, take it out any time, not deposit-insured like a bank). The app cannot move money there: never offer a deposit for it.
- Stocks & gold ideas (information only): broad index ETFs such as VOO or SPY, gold, or tokenized gold such as PAXG or XAUT. BTC in the app is cirBTC.
- In the app only cirBTC can be bought; stocks, gold and altcoins they buy elsewhere and tell you, so they are tracked.
- No buy cap: if they want more cirBTC than suggested, it is their call; say once how far it puts them from the target.
- Only the app wallet is known and they ask how to split or invest → percentages only, ask once what else they hold.
- Why a fund (one sentence, when it fits): without one, an emergency forces you to sell investments, often at a loss, or to borrow.

## Actions
- Only describe what the "Actions just taken" note lists. Deposit / withdraw / buy / DCA are confirmation CARDS the user signs: never say deposited / bought / done. The only cards are: add to the fund, withdraw from it, buy cirBTC, DCA. To offer one: "Would you like me to prepare … for you to sign?".
- Something recorded → "Noted." once, no read-back, then one sentence on what it changes (from the "Safe part" line: the safe part is now complete, or how much is still short). Chart shown → 1–2 sentences, no read-back.
- When a move the app can do fits (add to the fund, buy cirBTC, DCA), say you can prepare it for them to sign.
- They want to buy while "Investing is LOCKED" → the first sentence says it is locked and why, then the next step.

## Questions
- At most one, only when it helps. Never ask again for a known field or a question they ignored. They decline to share → ask nothing personal.
- Greeting → one line plus one open question ("Where would you like to start: spending, saving or investing?").
- "How am I doing?" → debt (if any), the fund, the allocation; one short point each.
- Outside personal finance you may use web_search.`

const PLAN_PROMPT = `You are MoonSafe's action planner. Read the user's LATEST message (earlier ones are context) and the app state, then CALL tools. Every step calls at least one tool and sees each result; when nothing more was asked, call no_action. Never do what was not asked. Users write English or Vietnamese.

${RULES}

## Which tool
- They TELL numbers (income, spending, debt, age, job, home) → update_profile. They TELL what they hold → record_asset (one item each; sold all → quantity 0).
- They want to add to the fund → prepare_deposit; withdraw → prepare_withdraw; buy cirBTC → prepare_buy_cirbtc; recurring buys → propose_dca; stop them → stop_dca; open a screen → open_screen.
- show_allocation ONLY when they ask how their money is split, what to do with idle money, or for the chart. Other questions (how much more, what is missing, why) and greetings → no_action: the agent answers in words.
- A plain yes right after the agent's offer ("ok", "yes", "do it", "as you said", ${VI_YES}) → that exact action with the offered amount. A message that adds information is not a yes.
- prepare_deposit is ONLY for the emergency fund, never for the safe part (the user's own savings).

## Amounts
- Pass the number and currency as said: USDC, USD, $, dollars, ${VI_USD} → "USDC" (3k USD = 3000); VND, ${VI_VND} → "VND". Never convert.
- App-state numbers are USDC. "the rest" / "fill it up" = shortfallUsdc; "all my wallet" / "max" = walletBalanceUsdc; "withdraw everything" = vaultBalanceUsdc.
- "deposit 200 USDC" / ${VI_DEPOSIT} is a deposit, not debt.

## update_profile
- Only fields just stated, never guessed ("salary" says nothing about stability or debt). "no debt" → debtAmount 0. Employee / fixed salary → incomeStable true; freelance / own business → false.
- debt, loan, credit card → debtAmount; salary → monthlyIncome; spending, rent → monthlyExpenses; home, land, car, Vietnamese stocks → otherAssets.

## record_asset
- savings = bank savings or flexible earn (Binance Simple Earn Flexible…): quantity = amount, currency, symbol = where. cash = cash / checking account.
- gold: quantity + unit (oz, g, kg, luong, chi; ${VI_GOLD}). stock = US ticker + shares. crypto = coins off Arc (symbol + coins); cirBTC in the wallet is read by the app.
- Only a value given ("$2,000 of gold") → worth, no quantity. Never put gold, US stocks or coins in otherAssets.
- Example: "$10,000 in savings at Chase, 2 oz of gold and 0.5 ETH on Binance" → savings 10000 USDC "Chase"; gold 2 oz; crypto ETH 0.5.`

const MONEY = {
  type: 'object',
  properties: {
    amount: { type: 'number', description: 'Amount exactly as the user said it (15 million VND = 15000000)' },
    currency: { type: 'string', enum: ['VND', 'USDC'] },
  },
  required: ['amount', 'currency'],
}

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

const PLAN_TOOLS = [
  fn('update_profile', 'Record the financial figures the user just shared (the app saves them). Pass only fields just learned.', {
    monthlyIncome: { ...MONEY, description: 'Monthly income' },
    monthlyExpenses: { ...MONEY, description: 'Essential monthly spending' },
    debtAmount: { ...MONEY, description: 'Total outside debt; amount 0 if none' },
    otherAssets: { ...MONEY, description: 'Assets not price-tracked: home, land, car, Vietnamese stocks…' },
    age: { type: 'integer' },
    incomeStable: { type: 'boolean', description: 'Fixed salary = true; freelance / own business = false' },
  }),
  fn('record_asset', 'Record assets the user holds (the app prices them live and draws the allocation chart). One item per holding; quantity 0 = no longer held.', {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['savings', 'cash', 'gold', 'stock', 'crypto'], description: 'savings = bank savings, cash = cash / checking account, gold = physical gold, stock = US stock / ETF, crypto = coin held off Arc' },
          quantity: { type: 'number', description: 'savings / cash: amount of money; gold: quantity in unit; stock: shares; crypto: coins. Leave out when the user only gave what it is worth.' },
          worth: { ...MONEY, description: 'What it is worth, when the user gave a value instead of a quantity ("$2,000 of gold", "ETH worth 50 million VND"); the app converts at the live price' },
          symbol: { type: 'string', description: 'stock: US ticker (SPY); crypto: symbol (ETH); savings / cash: bank name if given' },
          unit: { type: 'string', enum: ['oz', 'g', 'kg', 'luong', 'chi'], description: 'Gold only' },
          currency: { type: 'string', enum: ['VND', 'USDC'], description: 'Savings / cash only' },
        },
        required: ['kind'],
      },
    },
  }, ['items']),
  fn('show_allocation', 'Show the allocation chart (target by age vs now) right in the chat.'),
  fn('prepare_deposit', 'Show a card to add an amount to the fund vault; the user signs.', { amount: MONEY }, ['amount']),
  fn('prepare_withdraw', 'Show a card to withdraw an amount from the vault to the user\'s own wallet; the user signs.', { amount: MONEY }, ['amount']),
  fn('prepare_buy_cirbtc', 'Show a card to buy cirBTC for an amount; the user gets a quote and signs.', { amount: MONEY }, ['amount']),
  fn('propose_dca', 'Propose recurring cirBTC buys (DCA); the user taps Approve.', {
    amount: { ...MONEY, description: 'Amount per round' },
    intervalDays: { type: 'integer', description: 'Days between buys, default 7' },
  }, ['amount']),
  fn('stop_dca', 'Stop the recurring cirBTC plan (DCA).'),
  fn('open_screen', 'Open an app screen for the user.', {
    screen: { type: 'string', enum: ['fund', 'invest', 'balance', 'menu'], description: 'fund = Fund, invest = Invest, balance = Balance, menu = Wallet & settings' },
  }, ['screen']),
  fn('no_action', 'Nothing to do in the app (question, greeting, conversation).'),
]

const REPLY_TOOLS = [
  fn('web_search', 'Look up finance, markets, interest rates, exchange rates or recent news.', {
    query: { type: 'string', description: 'Search query in English or Vietnamese' },
  }, ['query']),
]

const SCREEN_NAMES: Record<string, string> = { fund: 'Fund', invest: 'Invest', balance: 'Balance', menu: 'Wallet & settings' }

const UI_ACTIONS = new Set(['prepare_deposit', 'prepare_withdraw', 'prepare_buy_cirbtc', 'propose_dca', 'open_screen'])
const INVEST_ACTIONS = new Set(['prepare_buy_cirbtc', 'propose_dca'])

/** Map OpenAI failures to a clear message (AGENTS.md Part 3, rule 4: fail loudly). */
async function openAiError(res: Response): Promise<Response> {
  const err = await res.text()
  console.error('OpenAI error:', res.status, err)
  if (res.status === 401) return json({ error: 'invalid OpenAI key' }, 502)
  if (res.status === 429 && /insufficient_quota/.test(err)) return json({ error: 'the OpenAI account is out of credit' }, 502)
  if (res.status === 429) return json({ error: 'OpenAI is rate limiting, try again in a few minutes' }, 502)
  return json({ error: `OpenAI error ${res.status}` }, 502)
}

async function openai(apiKey: string, body: Record<string, unknown>): Promise<Completion | Response> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) return openAiError(res)
  return await res.json() as Completion
}

async function webSearch(query: string): Promise<string> {
  // DuckDuckGo Instant Answer API (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, { headers: { 'User-Agent': 'MoonSafe/1.0' } })
    if (!res.ok) return `No results for "${query}".`
    const data = await res.json() as { AbstractText?: string; Answer?: string; RelatedTopics?: Array<{ Text?: string }> }
    const result = data.AbstractText || data.Answer || data.RelatedTopics?.[0]?.Text || ''
    return (result || `Nothing specific found for "${query}".`).slice(0, 4000)
  } catch {
    return 'Search is unavailable right now.'
  }
}

// ---- Fund figures ----------------------------------------------------------------
// Every emergency-fund number the reply may quote is computed here, in BOTH currencies,
// with the same rate source as the app (/api/rates → open.er-api.com). The model mixed
// VND and USDC in one subtraction when it had to convert itself (2026-10-22).

async function vndPerUsd(): Promise<number | null> {
  try {
    const url = 'https://open.er-api.com/v6/latest/USD'
    const cache = (caches as unknown as { default: Cache }).default
    const hit = await cache.match(url)
    const res = hit ?? await fetch(url)
    if (!res.ok) return null
    if (!hit) await cache.put(url, new Response(res.clone().body, { headers: { 'Cache-Control': 'public, max-age=86400' } }))
    const data = await res.json() as { rates?: { VND?: number } }
    return data.rates?.VND && data.rates.VND > 0 ? data.rates.VND : null
  } catch {
    return null
  }
}

function moneyOf(v: unknown, unit: unknown): { amount: number; currency: 'VND' | 'USDC' } | null {
  if (v && typeof v === 'object' && 'amount' in v) {
    const o = v as { amount?: unknown; currency?: unknown }
    return typeof o.amount === 'number' && o.amount > 0 ? { amount: o.amount, currency: o.currency === 'USDC' ? 'USDC' : 'VND' } : null
  }
  return typeof v === 'number' && v > 0 ? { amount: v, currency: unit === 'USDC' ? 'USDC' : 'VND' } : null
}

const vnd = (n: number) => n >= 1_000_000
  ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n / 1_000_000)}M VND`
  : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} VND`
const usdc = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n)} USDC`

/** A tool amount ({amount, currency}) as text in both currencies, so the reply never converts. */
function moneyText(v: unknown, rate: number | null): string {
  const m = moneyOf(v, undefined)
  if (!m) return 'an unclear amount'
  if (m.currency === 'USDC') return rate ? `${usdc(m.amount)} (≈ ${vnd(m.amount * rate)})` : usdc(m.amount)
  return rate ? `${vnd(m.amount)} (≈ ${usdc(m.amount / rate)})` : vnd(m.amount)
}

// Money kept in the wallet for gas when filling the fund (= GAS_RESERVE_USDC6 in useVault).
const GAS_RESERVE_USDC = 0.02
const MAX_PLAN_STEPS = 10

/**
 * What the user holds (wallet, fund) and, once monthly spending is known, the 3 / 6-month
 * floors with the gap and whether the wallet already covers it. Both currencies, as text.
 */
interface Floor { months: number; texts: string[] }

const BUCKET_WORD = { safe: 'safe', invest: 'invest', idle: 'idle' } as const

function fundFacts(appState: Record<string, unknown> | null, update: Record<string, unknown> | null, rate: number | null, alloc: Allocation): { text: string; floors: Floor[] } {
  const floors: Floor[] = []
  const p = { ...((appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>), ...(update ?? {}) }
  const units = (p.units && typeof p.units === 'object' ? p.units : {}) as Record<string, unknown>
  const exp = moneyOf(p.monthlyExpenses, units.monthlyExpenses)
  const vault = typeof appState?.vaultUsdc === 'number' ? appState.vaultUsdc : null
  const wallet = typeof appState?.walletUsdc === 'number' ? appState.walletUsdc : null
  const stable = typeof p.incomeStable === 'boolean' ? p.incomeStable : null
  if (vault === null && wallet === null && !exp && !alloc.parts.length && !alloc.unpriced.length) return { text: '', floors }

  // Amounts in the user's own currency first (USDC unless they spend in VND), the other in brackets.
  const cur = exp?.currency ?? 'USDC'
  const toUsd = (amount: number) => cur === 'USDC' ? amount : rate ? amount / rate : null
  const show = (amount: number) => {
    if (cur === 'USDC') return rate ? `${usdc(amount)} (≈ ${vnd(amount * rate)})` : usdc(amount)
    const usd = toUsd(amount)
    return usd !== null ? `${vnd(amount)} (≈ ${usdc(usd)})` : vnd(amount)
  }
  const showUsd = (usd: number) => cur === 'VND' && rate ? `${vnd(usd * rate)} (≈ ${usdc(usd)})` : rate ? `${usdc(usd)} (≈ ${vnd(usd * rate)})` : usdc(usd)
  const spendable = wallet !== null ? Math.max(0, wallet - GAS_RESERVE_USDC) : null

  const cir = typeof appState?.cirBtcUsdc === 'number' ? appState.cirBtcUsdc : 0
  const lines = [
    wallet !== null ? `- User's wallet holds: ${showUsd(wallet)}${exp ? ` (can add up to ${showUsd(spendable ?? 0)} to the fund, keeping ${usdc(GAS_RESERVE_USDC)} for fees)` : ''}` : '- Wallet: balance unknown',
    vault !== null ? `- Emergency fund holds: ${showUsd(vault)}` : '- Emergency fund: balance unknown',
  ]
  // Without spending there is no floor: the model once quoted the whole wallet as "what you need to add" (real chat 2026-10-24).
  if (!exp) lines.push('- Fund floor: UNKNOWN, monthly spending is not known yet. Nobody can say how much the fund needs: never present any amount as needed. If asked how much to add: the fund = 3 months of essential spending (6 if income is irregular), then ask how much they spend a month.')
  // Other amounts the user told the agent, so it never converts them itself.
  const inc = moneyOf(p.monthlyIncome, units.monthlyIncome)
  const debtRaw = p.debtAmount
  const debt = moneyOf(debtRaw, units.debtAmount)
  const other = moneyOf(p.otherAssets, units.otherAssets)
  const both = (m: { amount: number; currency: 'VND' | 'USDC' }) => moneyText(m, rate)
  if (inc) lines.push(`- Monthly income: ${both(inc)}`)
  if (debt) lines.push(`- Outside debt: ${both(debt)}`)
  else if (debtRaw === 0 || (debtRaw && typeof debtRaw === 'object' && (debtRaw as { amount?: number }).amount === 0)) lines.push('- Outside debt: none')
  if (other) lines.push(`- Other assets: ${both(other)}`)
  // "You can invest 15.93 USDC in cirBTC" quoted the cirBTC already held (real chat 2026-10-24).
  if (cir > 0) lines.push(`- cirBTC already held: ${showUsd(cir)} (owned, NOT an amount to buy or invest)`)
  let savedUsd: number | null = null
  if (inc && exp) {
    const incUsd = inc.currency === 'USDC' ? inc.amount : rate ? inc.amount / rate : null
    const expUsd = exp.currency === 'USDC' ? exp.amount : rate ? exp.amount / rate : null
    if (incUsd && expUsd !== null) {
      savedUsd = incUsd - expUsd
      const saved = inc.currency === exp.currency ? inc.amount - exp.amount : null
      lines.push(`- Savings rate (income − spending) / income: ${Math.round((incUsd - expUsd) / incUsd * 100)}%; can save per month: ${saved !== null ? both({ amount: saved, currency: inc.currency }) : showUsd(incUsd - expUsd)}`)
    }
  }
  const age = typeof p.age === 'number' ? p.age : null
  // Allocation of the money outside the fund (same numbers as the app's chart).
  const pctOf = (v: number) => alloc.total > 0 ? Math.round(v / alloc.total * 100) : 0
  if (alloc.total > 0) {
    lines.push(`- ALLOCATION of money outside the fund (total ${showUsd(alloc.total)}): Safe ${showUsd(alloc.safe)} (${pctOf(alloc.safe)}%) · Invest ${showUsd(alloc.invest)} (${pctOf(alloc.invest)}%) · Idle ${showUsd(alloc.idle)} (${pctOf(alloc.idle)}%)`)
    lines.push(`- Breakdown at current market prices: ${alloc.parts.map(x => `${x.label} ${showUsd(x.usd)} (${BUCKET_WORD[x.bucket]})`).join('; ')}`)
  }
  if (alloc.unpriced.length) lines.push(`- No price yet, left out for now: ${alloc.unpriced.map(h => h.symbol ?? h.kind).join(', ')}`)
  if (alloc.target) {
    const { safePct, investPct } = alloc.target
    let gap = ''
    // Amounts only once the user said what they hold: 70% of the wallet is not 70% of their money.
    if (alloc.total > 0 && alloc.declared) {
      const d = pctOf(alloc.invest) - investPct
      gap = d === 0 ? '; investing is on target' : `; investing is ${Math.abs(d)} points ${d > 0 ? 'above' : 'below'} target`
    }
    lines.push(`- Target by age ${age}: ${safePct}% safe, ${investPct}% invest${alloc.total > 0 && alloc.declared ? ` (= ${showUsd(alloc.total * safePct / 100)} safe, ${showUsd(alloc.total * investPct / 100)} invest)` : ' (percentages only: quote no amounts until the user says what they hold)'}${gap}`)
    // "I just put $X in the bank" → say whether the safe part is now complete (user, 2026-10-25).
    if (alloc.total > 0 && alloc.declared) {
      const safeTarget = alloc.total * safePct / 100
      lines.push(`- Safe part: ${showUsd(alloc.safe)} of its ${showUsd(safeTarget)} target · ${alloc.safe >= safeTarget * 0.99 ? 'COMPLETE' : `short ${showUsd(safeTarget - alloc.safe)}`}`)
    }
    if (alloc.mix) {
      const m = alloc.mix, c = alloc.byClass
      lines.push(`- MoonSafe view of the invest part at age ${age} (% of all money outside the fund): stocks & gold ${m.stocks}% (one share: the safer, larger part of investing; index stocks / ETF and gold), BTC ${m.btc}%, altcoins up to ${m.altcoin}%. Held now: stocks & gold ${showUsd(c.stocks)}, BTC incl. cirBTC ${showUsd(c.btc)}, altcoins ${showUsd(c.altcoin)}. When suggesting this split, say it is MoonSafe's view and that its crypto share is above what institutions suggest (0–5%).`)
    }
    // A wallet alone is not someone's money: the agent once split the wallet as if it were everything (real chat 2026-10-24).
    if (!alloc.declared) lines.push('- Only the app wallet is known: the user has not said what else they hold (bank savings, cash, gold, stocks, coins). If they ask how to split, invest or use their money: suggest NO split and NO deposit or purchase from the wallet, and turn NO percentage into an amount (40% of the wallet is not 40% of their money); first ask what else they hold, one question (unless they already said they have nothing else). On other topics do not bring it up.')
    else if (alloc.suggest && alloc.idle > 0) {
      lines.push(`- Suggested split of idle money ${showUsd(alloc.idle)} to get closer to target: ${showUsd(alloc.suggest.toSafe)} to safe = the user's OWN savings: bank savings or flexible earn such as Binance Simple Earn Flexible (NOT the emergency fund, nothing to do in the app), ${showUsd(alloc.suggest.toInvest)} to invest`)
      const si = alloc.suggestInvest
      if (si) lines.push(`- Of that ${showUsd(alloc.suggest.toInvest)} to invest: stocks & gold ${showUsd(si.stocks)} (index stocks / ETF or gold, bought outside the app), BTC ${showUsd(si.btc)} (the only part buyable in the app, as cirBTC), altcoins ${showUsd(si.altcoin)} (outside the app). If they want more cirBTC than this, it is their call.`)
    }
  } else if (alloc.total > 0) lines.push('- Age unknown, so no allocation target yet')
  if (appState && appState.investUnlocked !== true) {
    const why: string[] = []
    const missing = [!inc && 'income', !exp && 'spending', (debtRaw === null || debtRaw === undefined) && 'whether there is debt', age === null && 'age', stable === null && 'whether income is stable'].filter(Boolean)
    if (missing.length) why.push(`the agent does not know yet: ${missing.join(', ')}`)
    if (debt) why.push('there is outside debt')
    if (appState.fundOk !== true) why.push('the emergency fund is below its floor')
    lines.push(`- Investing is LOCKED. Missing (in order): ${why.join('; ')}`)
  } else if (appState?.investUnlocked === true) lines.push('- Investing is UNLOCKED')
  if (exp) {
    lines.push(`- Essential spending per month: ${show(exp.amount)}`)
    for (const m of stable === null ? [3, 6] : [stable ? 3 : 6]) {
      const floor = exp.amount * m
      const floorUsd = toUsd(floor)
      const who = stable === null ? `If ${m === 3 ? 'employed / income is stable' : 'income is irregular'}` : `Income ${stable ? 'stable' : 'irregular'}`
      let gap = 'cannot work out the gap yet (no exchange rate or fund balance)'
      if (floorUsd !== null && vault !== null) {
        const need = floorUsd - vault
        if (need <= 0) gap = 'the fund has ALREADY MET this floor'
        else if (spendable !== null && spendable >= need) gap = `still needed: ${showUsd(need)}; WALLET COVERS IT NOW (offer exactly this amount, not the whole wallet)`
        else if (spendable !== null && spendable > 0) gap = `still needed: ${showUsd(need)}; even after adding the whole wallet (${showUsd(spendable)}), still needed: ${showUsd(need - spendable)}`
        else gap = `still needed: ${showUsd(need)}; the wallet has nothing to add`
        const rest = need - (spendable ?? 0)
        if (rest > 0 && savedUsd !== null) {
          gap += savedUsd > 0
            ? `; saving ${showUsd(savedUsd)} a month into the fund takes about ${Math.ceil(rest / savedUsd)} more months`
            : '; no monthly surplus to save yet (spending ≥ income)'
        }
      }
      lines.push(`- ${who}: FLOOR ${m} months of spending = ${show(floor)} · ${gap}`)
      floors.push({ months: m, texts: [cur === 'USDC' ? usdc(floor) : vnd(floor), ...(floorUsd !== null ? [usdc(floorUsd)] : [])] })
    }
  }
  const text = `ASSET & FUND FIGURES (computed by the server at real rates; quote them VERBATIM, never add, subtract, multiply, divide or convert):\n${lines.join('\n')}`
    + (exp && stable === null ? '\nIncome stability is UNKNOWN: when talking about the fund, give both floors, written "3 months of spending = …" and "6 months of spending = …", then ask whether their income is stable (unless they just declined to share personal details).' : '')
  return { text, floors }
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const apiKey = context.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'The agent has no AI key configured' }, 503)

  let body: RequestBody
  try {
    body = await context.request.json() as RequestBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
  const appState = body.context ?? (body.profile ? { profile: body.profile } : null)
  const rate = await vndPerUsd()
  const stateText = `The user's current app state (real, latest data): ${JSON.stringify(appState ?? {})}`

  let profileUpdate: Record<string, unknown> | null = null
  const assetUpdates: Holding[] = []
  let dcaStop = false
  const actions: Array<Record<string, unknown>> = []
  const done: string[] = []
  const investUnlocked = appState?.investUnlocked === true

  const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const lastUserAt = messages.map(m => m.role).lastIndexOf('user')
  const prevAssistantText = [...messages.slice(0, lastUserAt)].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const vnClauses = lastUserText.split(/[.;\n]|,(?!\d)|\band\b/i).filter(c => VN_MARKET.test(c))
  const vnDropped: string[] = []
  // Stop asking what else they hold once they said there is nothing else, or after asking twice.
  const firstAsk = messages.findIndex((m, i) => i < lastUserAt && m.role === 'assistant' && ASKED_HOLDINGS.test(m.content))
  const askedHoldings = firstAsk >= 0 && (messages.filter((m, i) => i < lastUserAt && m.role === 'assistant' && ASKED_HOLDINGS.test(m.content)).length >= 2
    || messages.some((m, i) => i > firstAsk && m.role === 'user' && NOTHING_ELSE.test(m.content)))
  const wantsInvestLocked = !investUnlocked && INVEST_INTENT.test(lastUserText) && !ASKS_WHY.test(lastUserText) && !DEPOSIT_WORD.test(lastUserText)
  let startAlloc: Allocation | null = null
  // One tool call → its result for the next PLAN step.
  const handle = async (call: ToolCall): Promise<string> => {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { return 'Could not read the arguments.' }
    const name = call.function.name
    const before = done.length
    if (name === 'update_profile' && 'incomeStable' in args && !STABILITY_WORDS.test(lastUserText) && !ASKS_STABLE.test(prevAssistantText)) {
      console.log(`dropped incomeStable: not stated in "${lastUserText.slice(0, 60)}"`)
      delete args.incomeStable
    }
    if (name === 'update_profile') {
      const saved = (appState?.profile ?? {}) as Record<string, unknown>
      const savedUnits = (saved.units && typeof saved.units === 'object' ? saved.units : {}) as Record<string, unknown>
      for (const [k, v] of Object.entries(args)) {
        const money = v && typeof v === 'object' ? v as { amount?: unknown; currency?: unknown } : null
        const amount = money ? money.amount : v
        const sameUnit = !money || money.currency === (savedUnits[k] ?? 'VND')
        if ((k === 'age' && !(typeof amount === 'number' && amount >= 10 && amount <= 120))
          || (amount === 0 && k !== 'age' && !SAYS_NONE.test(lastUserText)) || (amount !== undefined && saved[k] === amount && sameUnit)) {
          console.log(`dropped ${k}=${JSON.stringify(v)}: zero not stated or already saved`)
          delete args[k]
        }
      }
    }
    if (name === 'update_profile' && Object.keys(args).length) {
      profileUpdate = { ...(profileUpdate ?? {}), ...args }
      done.push(`Recorded NEW figures: ${JSON.stringify(args)}. The app saved them, effective now${appState?.profileSaved ? ' (they replace the old ones, do not contradict them with old numbers)' : ''}. Just say "Noted." once, do NOT read back each number.`)
    } else if (name === 'record_asset') {
      // Each quantity must be in the user's words: "ok do it" once recorded 759 USDC of cash out of nothing (2026-10-24).
      const said = [...lastUserText.replace(/ /g, ' ').matchAll(NUMBER)].flatMap(m => readings(m[1]).map(v => v * (m[2] ? 1e6 : 1)))
      const stated = (q: unknown) => typeof q === 'number' && (q === 0 ? SAYS_NONE.test(lastUserText) || SOLD.test(lastUserText) : said.some(n => n > 0 && (Math.abs(n - q) / n <= 0.01 || Math.abs(n * 1000 - q) / (n * 1000) <= 0.01)))
      // "$2000 of gold" is a worth, not 2,000 oz (real chat 2026-10-24): convert it at the live price.
      const money = [...lastUserText.replace(/ /g, ' ').matchAll(MONEY_AMT)].map(m => {
        const unit = (m[3] ?? '$').toLowerCase()
        const k = /^(triệu|million)/.test(unit) ? 1e6 : 1 // lang-ok
        return { amount: readings(m[1] ?? m[2])[0] * k, currency: /vnd|đ|₫|triệu/.test(unit) ? 'VND' : 'USDC' } // lang-ok
      })
      const items: Array<Record<string, unknown>> = []
      for (const i of Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : []) {
        const kind = String(i.kind), sym = String(i.symbol ?? '').toUpperCase()
        const w = i.worth && typeof i.worth === 'object' ? i.worth as { amount?: unknown; currency?: unknown } : null
        const worth = w && typeof w.amount === 'number' ? { amount: w.amount, currency: w.currency === 'VND' ? 'VND' : 'USDC' }
          : typeof i.quantity === 'number' && i.quantity > 0 ? money.find(m => Math.abs(m.amount - (i.quantity as number)) <= m.amount * 0.01) ?? null : null
        if (worth && (kind === 'savings' || kind === 'cash')) { items.push({ ...i, quantity: worth.amount, currency: worth.currency }); continue }
        if (worth && (kind === 'gold' || kind === 'stock' || kind === 'crypto')) {
          if (!stated(worth.amount)) { console.log(`dropped asset ${JSON.stringify(i)}: worth not in the message`); continue }
          const usd = worth.currency === 'VND' ? (rate ? worth.amount / rate : null) : worth.amount
          const pr = await getPrices(kind === 'stock' ? [sym] : [], kind === 'crypto' ? [sym] : [])
          const price = kind === 'gold' ? pr.goldUsdPerOz : pr.usd[`${kind}:${sym}`]
          if (!usd || !price) { done.push(`No live price for ${sym || kind}, so it was NOT recorded: ask how much they hold (ounces / shares / coins).`); continue }
          items.push({ kind, ...(sym ? { symbol: sym } : {}), quantity: usd / price, ...(kind === 'gold' ? { unit: 'oz' } : {}) })
          continue
        }
        if (stated(i.quantity)) items.push(i)
        else console.log(`dropped asset ${JSON.stringify(i)}: quantity not in "${lastUserText.slice(0, 60)}"`)
      }
      // toHolding converts gold from any unit to troy ounces.
      const found = items.map(i => toHolding(i.kind === 'gold' ? { ...i, unit: typeof i.unit === 'string' ? i.unit : 'oz' } : i))
        .filter((h): h is Holding => h !== null)
        .filter(h => {
          if (h.kind !== 'stock' || !h.symbol || !vnClauses.some(c => c.toUpperCase().includes(h.symbol!))) return true
          vnDropped.push(h.symbol)
          return false
        })
      if (found.length) {
        assetUpdates.push(...found)
        done.push(`Recorded assets: ${found.map(h => h.quantity === 0 ? `removed ${h.symbol ?? h.kind}` : `${h.kind}${h.symbol ? ` ${h.symbol}` : ''} ${h.kind === 'gold' ? `${Math.round(h.quantity * 1000) / 1000} oz` : h.quantity}${h.currency ? ` ${h.currency}` : ''}`).join('; ')}. The app prices them live and counts them in the allocation ("ALLOCATION" line). Just say "Noted." once.`)
      }
    } else if (name === 'show_allocation') {
      actions.push({ type: name })
      done.push('The allocation chart is shown (target by age vs now) right under this reply.')
    } else if (name === 'stop_dca') {
      dcaStop = true
      done.push('DCA was stopped in the app.')
    } else if (UI_ACTIONS.has(name)) {
      // "just doing as you said" / "just BTC" right after the agent offered this action is a yes (real chat 2026-10-24).
      // A message with numbers ("I have 2000$ of gold") tells something new, it does not accept the offer.
      const acceptsOffer = !!OFFERED[name]?.test(prevAssistantText) && !lastUserText.includes('?') && !/\d/.test(lastUserText) && lastUserText.trim().split(/\s+/).length <= 5
      if (!acceptsOffer && (!ACTION_INTENT.test(lastUserText) || (ASKS_HOW_MUCH.test(lastUserText) && !/\d/.test(lastUserText)) || (ACTION_VERB[name] && !ACTION_VERB[name].test(lastUserText) && !AGREES.test(lastUserText)))) {
        console.log(`dropped ${name}: no request in "${lastUserText.slice(0, 60)}"`)
        return `Not done: the user did not ask for ${name}.`
      }
      if (actions.some(a => a.type === name)) return 'Already shown under the reply, not repeated.'
      // "ok" to a split once turned the safe part (bank savings) into a fund deposit card (real chat 2026-10-24).
      if (name === 'prepare_deposit' && appState?.fundOk === true && !FUND_WORD.test(lastUserText) && !DEPOSIT_WORD.test(lastUserText)) {
        console.log('dropped prepare_deposit: fund already full')
        return 'Not done: the emergency fund is already full; nothing to add unless the user asks to.'
      }
      const amt0 = (args.amount ?? {}) as { amount?: number; currency?: string }
      const amtUsd = typeof amt0.amount === 'number' ? (amt0.currency === 'VND' ? (rate ? amt0.amount / rate : null) : amt0.amount) : null
      const toSafe = startAlloc?.suggest?.toSafe
      if (name === 'prepare_deposit' && !FUND_WORD.test(lastUserText) && amtUsd !== null && toSafe && Math.abs(amtUsd - toSafe) <= toSafe * 0.01 + 1) {
        console.log('dropped prepare_deposit: safe part is bank savings')
        return "Not done: the safe part is the user's own bank savings, nothing to deposit in the app."
      }
      // "ok go ahead" carries no amount: the card must use one the agent offered ("deposit 3,000?" → "ok" once became 3,300).
      if (!/\d/.test(lastUserText) && !ALL_OF_IT.test(lastUserText) && args.amount && typeof args.amount === 'object') {
        const a = args.amount as { amount?: number; currency?: string }
        const offered = [...prevAssistantText.replace(/ /g, ' ').matchAll(NUMBER)].flatMap(m => readings(m[1]).map(v => v * (m[2] ? 1e6 : 1)))
        if (typeof a.amount === 'number' && !offered.some(n => n > 0 && Math.abs(n - a.amount!) / n <= 0.01)) {
          console.log(`dropped ${name}: amount ${a.amount} not offered`)
          return `Not done: the user named no amount, so use exactly the amount you offered in your last reply, not ${a.amount}.`
        }
      }
      // A DCA plan only when the user asked for one or the agent offered one ("ok do it" once set 1,000 USDC a week).
      if (name === 'propose_dca' && !ACTION_VERB.propose_dca.test(lastUserText) && !ACTION_VERB.propose_dca.test(prevAssistantText)) {
        console.log('dropped propose_dca: nobody asked for recurring buys')
        return 'Not done: the user did not ask for recurring buys.'
      }
      // No buy cap (user, 2026-10-25); a purchase nobody sized still waits for the rest of the picture.
      if ((name === 'prepare_buy_cirbtc' || name === 'propose_dca') && !/\d/.test(lastUserText) && startAlloc && !startAlloc.declared) {
        return 'Not done: only the app wallet is known; ask what else the user holds before suggesting a purchase.'
      }
      if (INVEST_ACTIONS.has(name) && !investUnlocked) {
        done.push(`BLOCKED ${name}: investing is locked (needs no debt and a full fund). Nothing was opened.`)
        return done[done.length - 1]
      }
      actions.push({ type: name, ...args })
      const amt = moneyText(args.amount, rate)
      done.push(
        name === 'open_screen' ? `Opened the ${SCREEN_NAMES[String(args.screen)] ?? String(args.screen)} screen; the user is looking at it, do NOT list figures, one short sentence.`
        : name === 'propose_dca' ? `Showed a DCA PROPOSAL card for ${amt} every ${String(args.intervalDays ?? 7)} days under this reply. NOT set up yet: the user taps "Approve DCA" on the card, then reviews a quote and signs each round. Add one sentence: cirBTC can fall sharply, only invest money you can afford to lose.`
        : name === 'prepare_deposit' ? `Showed a confirmation card to ADD ${amt} to the fund under this reply. NOT deposited yet: the user taps "Sign transaction" on the card and confirms in their wallet.`
        : name === 'prepare_withdraw' ? `Showed a confirmation card to WITHDRAW ${amt} to the wallet under this reply. NOT withdrawn yet: the user taps "Sign transaction" on the card and confirms in their wallet; the money goes to their own wallet.`
        : `Showed a card to BUY ${amt} of cirBTC under this reply. NOT bought yet: the user taps "Get a quote" on the card, checks it, then "Sign purchase". Add one sentence: cirBTC can fall sharply, only invest money you can afford to lose.`)
    }
    return done.length > before ? done.slice(before).join(' ') : 'Nothing changed.'
  }

  // Holdings after this turn's updates, valued at live prices (functions/api/prices.ts, cached 10 min).
  const savedProfile = (appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>
  const held = (Array.isArray(savedProfile.holdings) ? savedProfile.holdings : []).map(toHolding).filter((h): h is Holding => h !== null)
  const currentFacts = async () => {
    const holdings = mergeHoldings(held, assetUpdates)
    const syms = (k: Holding['kind']) => holdings.filter(h => h.kind === k && h.symbol).map(h => h.symbol!)
    const prices = holdings.some(h => h.kind === 'gold' || h.kind === 'stock' || h.kind === 'crypto') ? await getPrices(syms('stock'), syms('crypto')) : null
    const ageNow = typeof profileUpdate?.age === 'number' ? profileUpdate.age : typeof savedProfile.age === 'number' ? savedProfile.age : null
    const alloc = allocate({
      holdings,
      walletUsd: typeof appState?.walletUsdc === 'number' ? appState.walletUsdc : null,
      cirBtcUsd: typeof appState?.cirBtcUsdc === 'number' ? appState.cirBtcUsdc : null,
      age: ageNow,
      prices,
      vndPerUsd: rate,
    })
    // Asked once is enough: the agent kept asking "what else do you hold?" every turn (real chat 2026-10-24).
    if (askedHoldings) alloc.declared = true
    return { alloc, ...fundFacts(appState, profileUpdate, rate, alloc) }
  }

  // ---- 1. PLAN: tool loop, at most MAX_PLAN_STEPS -------------------------------------
  // Every step must call a tool (tool_choice "required"); it sees each result, plus fresh
  // figures after something was recorded, and ends with no_action. Repeats are refused.
  startAlloc = (await currentFacts()).alloc
  const planMessages: Message[] = [{ role: 'system', content: PLAN_PROMPT }, ...messages.slice(-4), { role: 'system', content: stateText }]
  const seen = new Set<string>()
  let planIn = 0, planOut = 0, planSteps = 0
  for (let step = 1; step <= MAX_PLAN_STEPS; step++) {
    const plan = await openai(apiKey, {
      model: 'gpt-4o-mini',
      messages: planMessages,
      tools: PLAN_TOOLS,
      tool_choice: 'required',
      temperature: 0,
      max_tokens: 400,
    })
    if (plan instanceof Response) return plan
    planSteps = step
    planIn += plan.usage?.prompt_tokens ?? 0
    planOut += plan.usage?.completion_tokens ?? 0
    const calls = plan.choices[0]?.message.tool_calls ?? []
    if (!calls.length) break
    planMessages.push({ role: 'assistant', content: plan.choices[0].message.content ?? '', tool_calls: calls } as Message)
    let acted = false, recorded = false
    for (const call of calls) {
      const key = call.function.name + call.function.arguments
      let result = 'Done.'
      if (call.function.name !== 'no_action') {
        if (seen.has(key)) result = 'Already done this turn, do not repeat it.'
        else {
          seen.add(key)
          result = await handle(call)
          acted = true
          if (call.function.name === 'update_profile' || call.function.name === 'record_asset') recorded = true
        }
      }
      planMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
    if (!acted) break
    if (recorded) planMessages.push({ role: 'system', content: `Figures now: ${(await currentFacts()).text}\nAnything else the user's latest message asked for that is not done yet? If not, call no_action.` })
    else planMessages.push({ role: 'system', content: 'Anything else the user asked for in their latest message? If not, call no_action.' })
  }
  console.log(`plan steps=${planSteps} tokens in=${planIn} out=${planOut}`)

  if (vnDropped.length && !(profileUpdate && 'otherAssets' in profileUpdate)) {
    const stated = [...lastUserText.replace(/ /g, ' ').matchAll(AMOUNT)]
    const prior = (appState?.profile as Record<string, unknown> | undefined)?.otherAssets
    if (stated.length === 1 && !prior) {
      const unit = stated[0][3] ?? '$'
      const amount = readings(stated[0][1] ?? stated[0][2])[0] * (/^(M|million|triệu)/.test(unit) ? 1e6 : 1) // lang-ok
      profileUpdate = { ...(profileUpdate ?? {}), otherAssets: { amount, currency: /VND|₫|triệu/.test(unit) ? 'VND' : 'USDC' } } // lang-ok
      done.push(`Vietnamese stock ${vnDropped.join(', ')} is not price-tracked: its stated value was recorded as other assets (outside the allocation chart). Just say "Noted." once.`)
    } else {
      done.push(`Vietnamese stock ${vnDropped.join(', ')} is not price-tracked and was NOT recorded. Ask what it is worth in total; it will count as other assets, outside the allocation chart.`)
    }
  }

  if (wantsInvestLocked && !done.some(d => d.startsWith('BLOCKED'))) {
    done.push('The user wants to invest but INVESTING IS LOCKED: the first sentence must say investing is locked and why, from the "Investing is LOCKED" line, then suggest the next step.')
  }

  // ---- 2. REPLY ---------------------------------------------------------------------
  const replyMessages: Message[] = [
    { role: 'system', content: REPLY_PROMPT },
    ...messages,
    { role: 'system', content: stateText + (appState?.profileSaved
      ? '\nThe agent already has the user\'s full financial details: do not ask again for fields that are known. To change a number the user just tells the agent.'
      : '') },
    { role: 'system', content: `Actions just taken: ${done.length ? done.join(' | ') : 'none.'}` },
  ]
  const { alloc, text: facts, floors } = await currentFacts()
  if (facts) replyMessages.push({ role: 'system', content: facts })
  if (ASKS_OVERVIEW.test(lastUserText)) {
    const p = { ...savedProfile, ...(profileUpdate ?? {}) }
    const hasDebt = moneyOf(p.debtAmount, (p.units as Record<string, unknown> | undefined)?.debtAmount) !== null
    replyMessages.push({ role: 'system', content: `Overall check-up: one short point each, in this order: ${hasDebt ? 'their outside debt (start with it), ' : ''}the emergency fund vs its floor, then the allocation. Keep the allocation to one sentence.` })
  }
  const replyLang = VI_LETTERS.test(lastUserText) ? 'Vietnamese' : 'English'
  replyMessages.push({ role: 'system', content: `Reply language: ${replyLang} (the language of the user's latest message).${replyLang === 'Vietnamese' ? ` ${VI_FLOORS}` : ''}` })
  if (DECLINES.test(lastUserText)) replyMessages.push({ role: 'system', content: 'The user just declined to share. Respect it: this reply asks NOTHING about their personal situation (income, job, stability, debt, age…). Share general knowledge and say they can share any time.' })

  let rewrites = 0
  for (let round = 1; round <= 5; round++) {
    const reply = await openai(apiKey, {
      model: 'gpt-4o-mini',
      messages: replyMessages,
      tools: REPLY_TOOLS,
      tool_choice: round >= 3 ? 'none' : 'auto',
      max_tokens: 800,
      temperature: 0.5,
    })
    if (reply instanceof Response) return reply
    const msg = reply.choices[0]?.message
    if (reply.usage) console.log(`reply tokens in=${reply.usage.prompt_tokens} out=${reply.usage.completion_tokens} round=${round}`)
    if (!msg?.tool_calls?.length) {
      const content = msg?.content ?? ''
      // The model sometimes claims a screen was opened / filled when no action ran
      // (measured 2026-10-22, with actions = []). Rewrite.
      const problems: string[] = []
      if (!actions.length && CLAIMS_ACTION.test(content)) problems.push('no action was taken, the app opened and filled NOTHING: only OFFER (e.g. "Would you like me to prepare a deposit of … for you to sign?"), never say you opened / filled / created / showed anything')
      const plain = content.replace(/ /g, ' ')
      for (const f of floors) {
        if (f.texts.some(t => plain.includes(t.replace(/ /g, ' '))) && !plain.includes(`${f.months} month`) && !plain.includes(`${f.months} tháng`)) { // lang-ok
          problems.push(`the floor ${f.texts[0]} must be labelled as "${f.months} months of spending"`)
        }
      }
      if ((content.match(/\?/g) ?? []).length > 1) problems.push('only ONE question is allowed, drop the others')
      const prevAssistant = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
      if (ASKS_STABLE.test(prevAssistant) && ASKS_STABLE.test(content) && profileUpdate?.incomeStable === undefined) problems.push('the last reply already asked whether their income is stable and they did not answer; do NOT ask it again, answer what they are asking')
      if (wantsInvestLocked && !SAYS_LOCKED.test(content)) problems.push('the first sentence must say investing is locked and why')
      if (!profileUpdate && !assetUpdates.length && SAYS_NOTED.test(content)) problems.push('nothing was recorded this turn, drop "Noted"')
      // The chart under the reply already shows every share; a reply that reads it back buries the point.
      // Room for the invest split too: at 380 the model kept cutting it to fit (eval 2026-10-25).
      const chartMax = alloc.declared && alloc.suggestInvest ? 520 : 380
      if (actions.some(a => a.type === 'show_allocation') && content.length > chartMax) problems.push(`the chart right below already shows every figure: rewrite in at most 3 sentences: the target${alloc.target ? ` (${alloc.target.safePct}% safe, ${alloc.target.investPct}% invest)` : ''}, how far off it they are, how to split idle money${chartMax > 380 ? ' (safe, then stocks & gold / BTC / altcoins)' : ''}; no reading back each part`)
      const stray = ungrounded(content, [facts, stateText, ...done, ...messages.filter(m => m.role === 'user').map(m => m.content)])
      if (stray.length) problems.push(`these amounts are not in the figures: ${stray.join(', ')}. Do not compute new numbers (no "left after", no sums or differences); quote only amounts given in ASSET & FUND FIGURES or by the user`)
      if (alloc.target) {
        const { safePct, investPct } = alloc.target
        const has = (n: number) => new RegExp(`(?<!\\d)${n}\\s*%`).test(plain)
        if (has(investPct) !== has(safePct) || (ASKS_TARGET.test(lastUserText) && !has(investPct))) problems.push(`give the target by age with both parts: "${safePct}% safe, ${investPct}% invest" (of all money outside the fund)`)
      }
      if (!floors.length && appState?.fundOk !== true && NEEDS_AMOUNT.test(content)) problems.push('monthly spending is unknown, so nobody knows how much the fund needs: never say an amount is needed or quote the wallet as what to add; say the fund is 3 months of essential spending (6 if income is irregular) and ask how much they spend a month')
      const si = alloc.suggestInvest
      if (si && alloc.declared && ASKS_USE.test(lastUserText) && !/stock|ETF|gold|cổ phiếu|vàng/i.test(content)) problems.push(`give the invest part split from the figures: stocks & gold ${usdc(si.stocks)}, BTC ${usdc(si.btc)} (cirBTC in the app), altcoins ${usdc(si.altcoin)}, and say it is MoonSafe's view`) // lang-ok
      // "Would you like me to prepare a deposit of 1,101 USDC" for the bank-savings part (real chat 2026-10-24).
      const toSafe = alloc.suggest?.toSafe ?? 0
      if (toSafe > 1 && /deposit/i.test(content) && [...plain.matchAll(AMOUNT)].some(m => readings(m[1] ?? m[2]).some(v => Math.abs(v - toSafe) <= toSafe * 0.01 + 1))) problems.push(`${usdc(toSafe)} is the safe part: the user's OWN savings, not a deposit in the app; do not offer to deposit it, tell them to put it in bank savings or flexible earn (e.g. Binance Simple Earn Flexible)`)
      if (alloc.declared && alloc.suggest && alloc.suggest.toSafe > 1 && ASKS_USE.test(lastUserText) && !/bank|savings|ngân hàng|tiết kiệm/i.test(content)) problems.push(`say where the safe part goes: ${usdc(alloc.suggest.toSafe)} into their own bank savings or flexible earn (e.g. Binance Simple Earn Flexible)`) // lang-ok
      if (DEBT_WORD.test(lastUserText) && !DEBT_WORD.test(content)) problems.push('the user asked about their debt: say plainly what to do about the debt')
      if (BUILD_FUND.test(lastUserText) && /a month into the fund takes about/.test(facts) && !/sav|để dành|tiết kiệm/i.test(content)) problems.push('they asked how to build the fund: suggest saving the monthly amount from the figures and say about how many months it takes') // lang-ok
      if (replyLang === 'Vietnamese' && /months? of spending|Noted\./i.test(content)) problems.push('this reply is in Vietnamese: write "N tháng chi tiêu" and "Mình đã ghi nhận", no English phrases') // lang-ok
      if (PUSHY.test(content)) problems.push('do not order the user to provide details ("please provide…"); ask one friendly question instead, e.g. "Roughly how much do you spend in a month?"')
      if (SAFE_IN_APP.test(content)) problems.push('the app cannot move money to the user\'s bank or exchange and nothing was moved: the user tops up their own savings themselves; never offer or claim a deposit / transfer to savings')
      if (SAFE_AS_FUND.test(content)) problems.push('the safe part is bank savings the user makes themselves, NOT the emergency fund, and it cannot be deposited in the app')
      // Users found replies wordy (2026-10-24, median 305 chars). Checked only once the content is right:
      // asked for both at once, the model cut the very point that was missing.
      const maxChars = ASKS_WHY.test(lastUserText) ? 520 : 340
      if (!problems.length && content.replace(/\*\*/g, '').length > maxChars && !actions.some(a => a.type === 'show_allocation')) problems.push(`too long (${content.length} chars): cut to at most ${maxChars === 340 ? '2' : '4'} short sentences plus one question; first sentence = the direct answer; keep every point it makes now (its key numbers, any warning, advice on debt or saving), drop only preambles, repeats and closing filler`)
      if (problems.length && rewrites < 3 && round < 5) {
        rewrites++
        replyMessages.push({ role: 'assistant', content })
        replyMessages.push({ role: 'system', content: `That reply needs fixing: ${problems.join('; ')}. Rewrite the whole reply in ${replyLang}, keeping the correct figures.` })
        continue
      }
      // Still asking twice after the rewrites: drop the extra questions rather than send them.
      const tidy = tidyQuestions(content, ASKS_STABLE.test(prevAssistant) && profileUpdate?.incomeStable === undefined)
      return json({ content: tidy, profileUpdate, assetUpdates: assetUpdates.length ? assetUpdates : null, dcaStop, actions, ...(body.debug ? { facts, notes: done } : {}) })
    }
    replyMessages.push({ role: 'assistant', content: msg.content ?? '', ...{ tool_calls: msg.tool_calls } } as Message)
    for (const call of msg.tool_calls) {
      let result = 'Tool not supported.'
      if (call.function.name === 'web_search') {
        try { result = await webSearch((JSON.parse(call.function.arguments) as { query: string }).query) } catch { result = 'Search failed.' }
      }
      replyMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }
  return json({ error: 'the agent needed too many steps, please ask more briefly' }, 502)
}
