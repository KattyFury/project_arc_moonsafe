// Cloudflare Pages Function — MoonSafe agent (OpenAI), every app operation is a tool.
// OPENAI_API_KEY is in Cloudflare environment variables (never in client bundle).
//
// Each user message runs two calls:
// 1. PLAN (gpt-4o-mini since 2026-10-24 (free OpenAI tokens; gpt-4o before), tool_choice "required"): the model MUST pick tools — fill the
//    profile (saved by the app), prepare a deposit / withdrawal / cirBTC buy / DCA, open a screen,
//    stop DCA, or no_action. Letting gpt-4o-mini decide on its own called a tool 0/8
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

const RULES = `## The MoonSafe framework
1. Emergency fund first: 3 months of essential spending if income is stable, 6 months if not. Held in USDC in the user's vault, kept apart, never part of the allocation.
2. Buying cirBTC / DCA in the app unlocks only when: no outside debt AND the fund has reached its floor (investUnlocked = true).
3. Money OUTSIDE the fund has 3 parts: Safe = bank savings deposits (deposit insurance). Invest = gold, US stocks, coins, cirBTC. Idle = money not allocated yet (wallet USDC, cash, stablecoins).
4. Target by age: safe = age %, invest = 100 − age % (age 31: 31% safe, 69% invest). Idle is what the user still has to place.
5. What and how much to invest is the user's call; MoonSafe never picks assets and never predicts markets. MoonSafe accepts more crypto than traditional institutions advise (0–5%). Off target → say by how much, never push, never block.`

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
const ASKS_STABLE =/(stable|steady|regular)[^.!?\n]*\?|ổn định[^.!?\n]*\?|ổn định[^.!?\n]*(không|chưa)\.\s*[^.!?\n]{0,80}\?/i // lang-ok

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
const ASKS_HOW_MUCH = /how much|bao nhiêu/i // lang-ok
const SAYS_LOCKED = /lock|kho[áa]|khóa/i // lang-ok
// The safe part is bank savings the user makes outside the app; the fund (vault) is something else.
const SAFE_AS_FUND = /safe fund|(add|deposit|move|put)[^.?!\n]{0,40}(into|to) (the |your )?safe (part|fund|bucket)|quỹ an toàn|nạp[^.?!\n]{0,40}(vào |phần )an toàn/i // lang-ok

// Vietnamese words the model must recognise in Vietnamese messages (the app itself is English-only).
const VI_VOICE = 'In Vietnamese: natural Vietnamese, call yourself "mình" and the user "bạn", never "tôi".' // lang-ok
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

const REPLY_PROMPT = `You are MoonSafe's personal finance advisor (onchain personal finance for Web3 users).

## Language
- Reply in the language of the user's latest message. Default to English.
- In English: warm, professional, plain words. ${VI_VOICE}

## Style
- Get to the point: answer exactly what was asked in 2–4 sentences; put amounts and the key point in **bold**. Go longer only when the user asks to learn something.
- Do NOT open with "thanks for sharing", do NOT repeat back what the user just said, do NOT list balances the answer does not need.
- No platitudes, no lecturing, no judging their spending. Explain any jargon in half a sentence.
- When investing comes up, add half a sentence: this is information, there is risk, no returns are promised.
- Why an emergency fund (one sentence, when it fits): without one, an emergency forces you to sell investments, often while prices are down, or to borrow.

${RULES}

## Numbers (a wrong number loses trust)
- Use only numbers from "ASSET & FUND FIGURES", the app state, or the user's own words. NEVER add, subtract, multiply, divide or convert VND↔USDC yourself, never mix units like "30M VND − 1,000 USDC". If a number is missing, say it cannot be worked out yet.
- Never work out what is left after a deposit, withdrawal or buy; the card shows it.
- A floor and the amount "still needed" are different numbers: quote each from its own label.
- Always write fund floors as "N months of spending = amount". A line saying "ALREADY MET" means it is met. If income stability is unknown, give both the 3- and 6-month floors (not "3–6 months") and then ask.
- Adding to the fund is saving, NOT paying debt. Only offer to add what the wallet can add. If the fund line says "WALLET COVERS IT NOW", offer to prepare a deposit for the gap; if not, offer to add what the wallet has and suggest saving a set amount each month (quote "about N months" if the figures have it).

## Allocation
- When you give the target, ALWAYS give both parts, as "X% safe, Y% invest" (from the "Target by age" line).
- Quote the "ALLOCATION", "Target by age" and "Suggested split of idle money" lines. Target % is of ALL money outside the fund, NOT of idle money; amounts to move come from the "Suggested split" line.
- The safe part = bank savings the user makes outside the app. The emergency fund (vault) is NOT the safe part: never offer a deposit or an "order" to grow the safe part.
- In the app only cirBTC can be bought (once investing is unlocked). Gold, stocks and other coins the user buys elsewhere and tells the agent so they are tracked.
- There is NO buy cap. "How much can I buy?" → it is their call (up to the USDC in their wallet), then give the invest target and the "Suggested split" amount.
- Asked about holding more crypto than institutions advise → give MoonSafe's view: more than 0–5% is fine as long as the fund is full and total investing is around the target for their age; mention risk, do not tell them to sell.

## Actions
- Only describe actions listed in the "Actions just taken" note; if none, never say you opened / filled / created / showed anything. To offer, ask: "Would you like me to prepare a … for you to sign?".
- Deposit / withdraw / buy / DCA appear as a CONFIRMATION CARD under the reply; the user taps and signs in their wallet. Never say "deposited / withdrew / bought / saved / set up".
- If the note says something was recorded, say "Noted." once, do NOT read back each number or asset; use the rest for one useful remark. They can review it in the Balance tab and correct it by telling the agent.
- If the note says the allocation chart is shown, comment in 1–2 sentences only (how far off target, how to split idle money); do not read the chart back.
- If an action was blocked, or the user wants to buy while the figures say "Investing is LOCKED": the first sentence says investing is locked and why (from that line), then the next step.

## Questions
- At most ONE question per reply, and only when it helps the current topic. Never push for details.
- Never ask again for a profile field that already has a value. If the user ignored your last question, do not ask it again right away.
- If the user declines to share, ask nothing personal and say they can share any time.
- Do not bring up the investing lock or missing details unless the user asks about buying / investing.
- "How am I doing?" → one short point each, in this order: debt (if any), the emergency fund, then the allocation.
- Greetings: one line of greeting, one open question (e.g. "Where would you like to start: spending, saving or investing?"). No lock, no list of missing details, no "please provide information".
- Outside personal finance you may use web_search.`

const PLAN_PROMPT = `You are MoonSafe's action planner. Read the user's LATEST message (earlier ones are context only) and the app state, then CALL the right tools. Always call at least one tool; if nothing is needed, call no_action. Users write English or Vietnamese.

${RULES}

## Choosing tools
- The user TELLS you their numbers (income, spending, debt, age, job, home / property) → update_profile.
- The user TELLS you assets they hold: bank savings, cash / checking account, gold, US stocks, coins on an exchange or another wallet → record_asset, one item each. Sold all / no longer has it → quantity 0. Can be called together with update_profile.
- Asks about allocation, safe / invest split, "how is my money split", "what should I do with idle money", or asks to see the chart → show_allocation. Just "I want to invest" / "buy …" without asking about the split → NOT show_allocation.
- WANTS to add to the fund → prepare_deposit. Withdraw from the fund → prepare_withdraw. Buy cirBTC → prepare_buy_cirbtc. Recurring buys → propose_dca. Stop recurring buys → stop_dca.
- open_screen ONLY when the user asks to open / view a screen ("open the Fund screen", "show me my balance sheet"). QUESTIONS about amounts, fund floors, what is missing, how much they have → no_action (the agent answers in words).
- The user agrees to the agent's offer right before → do exactly that action with exactly the amount offered. It counts as agreement ONLY when the latest message is a clear yes ("ok", "yes", "go ahead", "do it", "deposit that", ${VI_YES}). A message adding information (job, salary, spending…) is NOT agreement → open or fill nothing.
- "deposit 200 USDC" / ${VI_DEPOSIT} is a deposit, NOT debt. General questions and greetings → no_action.

## Amounts
- Pass the number and currency the user said. USDC, USD, $, dollars, ${VI_USD} → "USDC" (800 dollars = 800, 3k USD = 3000). VND, million, thousand, ${VI_VND} with no USD → "VND" (500k VND = 500000). Never convert.
- "the rest", "fill it up", "that amount" (right after the agent offered the gap) = shortfallUsdc; "all of my wallet", "max" when depositing = walletBalanceUsdc; "withdraw everything" = vaultBalanceUsdc.
- EVERY number from the app state (shortfallUsdc, floorUsdc, walletBalanceUsdc, vaultBalanceUsdc…) is USDC → currency "USDC", amount as a plain number (1,384.62 = 1384.62). Never tag these "VND".

## update_profile
- Pass only the fields the user just stated. Do not guess: "salary" alone says nothing about stability or debt.
- Each number goes with the item next to it: debt / loan / installments / credit card → debtAmount; salary / income → monthlyIncome; spending / rent / food / living costs → monthlyExpenses; home, land, car, Vietnamese stocks, anything record_asset does not cover → otherAssets (add up several).
- "no debt" → debtAmount {amount: 0}. Employee / fixed salary → incomeStable true; freelance / own business / irregular → false.
Examples: "credit card debt of $2,000" → debtAmount 2000 USDC. "an apartment worth 2 billion VND" → otherAssets 2000000000 VND.

## record_asset
- savings = bank savings deposit (quantity = amount, currency, symbol = bank name if given). cash = cash / checking account (quantity = amount, currency).
- gold = physical gold (quantity + unit: "oz", "g", "kg", "luong" or "chi"; ${VI_GOLD}). If they only give the value of their gold and no quantity → do not record it.
- stock = US-listed stock or ETF (symbol = ticker: SPY, VOO, AAPL; quantity = shares). Vietnamese stocks (FPT, VNM…) are NOT stock: put their stated value in update_profile.otherAssets.
- crypto = coins held off Arc (symbol: BTC, ETH, SOL, USDT…; quantity = coins). cirBTC in the Arc wallet is read by the app, do not record it.
- Record only quantities the user said, never guess. Example: "I have $10,000 in savings at Chase, 2 oz of gold and 0.5 ETH on Binance" → savings 10000 USDC symbol "Chase"; gold 2 oz; crypto ETH 0.5.`

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
          quantity: { type: 'number', description: 'savings / cash: amount of money; gold: quantity in unit; stock: shares; crypto: coins' },
          symbol: { type: 'string', description: 'stock: US ticker (SPY); crypto: symbol (ETH); savings / cash: bank name if given' },
          unit: { type: 'string', enum: ['oz', 'g', 'kg', 'luong', 'chi'], description: 'Gold only' },
          currency: { type: 'string', enum: ['VND', 'USDC'], description: 'Savings / cash only' },
        },
        required: ['kind', 'quantity'],
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
  if (cir > 0) lines.push(`- cirBTC held: ${showUsd(cir)}`)
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
    if (alloc.total > 0) {
      const d = pctOf(alloc.invest) - investPct
      gap = d === 0 ? '; investing is on target' : `; investing is ${Math.abs(d)} points ${d > 0 ? 'above' : 'below'} target`
    }
    lines.push(`- Target by age ${age}: ${safePct}% safe, ${investPct}% invest${alloc.total > 0 ? ` (= ${showUsd(alloc.total * safePct / 100)} safe, ${showUsd(alloc.total * investPct / 100)} invest)` : ''}${gap}`)
    if (alloc.suggest && alloc.idle > 0) lines.push(`- Suggested split of idle money ${showUsd(alloc.idle)} to get closer to target: ${showUsd(alloc.suggest.toSafe)} to safe (the user's own bank savings, NOT the fund), ${showUsd(alloc.suggest.toInvest)} to invest (the user picks the assets; the app only sells cirBTC)`)
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
        else if (spendable !== null && spendable >= need) gap = `still needed: ${showUsd(need)}; WALLET COVERS IT NOW`
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

  // ---- 1. PLAN: forced tool call --------------------------------------------------
  const plan = await openai(apiKey, {
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: PLAN_PROMPT }, ...messages.slice(-4), { role: 'system', content: stateText }],
    tools: PLAN_TOOLS,
    tool_choice: 'required',
    temperature: 0,
    max_tokens: 400,
  })
  if (plan instanceof Response) return plan
  if (plan.usage) console.log(`plan tokens in=${plan.usage.prompt_tokens} out=${plan.usage.completion_tokens}`)

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
  const wantsInvestLocked =!investUnlocked && INVEST_INTENT.test(lastUserText) && !ASKS_WHY.test(lastUserText) && !DEPOSIT_WORD.test(lastUserText)
  for (const call of plan.choices[0]?.message.tool_calls ?? []) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { continue }
    const name = call.function.name
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
          || (amount === 0 && k !== 'age' && !SAYS_NONE.test(lastUserText)) ||(amount !== undefined && saved[k] === amount && sameUnit)) {
          console.log(`dropped ${k}=${JSON.stringify(v)}: zero not stated or already saved`)
          delete args[k]
        }
      }
    }
    if (name === 'update_profile' && Object.keys(args).length) {
      profileUpdate = { ...(profileUpdate ?? {}), ...args }
      done.push(`Recorded NEW figures: ${JSON.stringify(args)}. The app saved them, effective now${appState?.profileSaved ? ' (they replace the old ones, do not contradict them with old numbers)' : ''}. Just say "Noted." once, do NOT read back each number.`)
    } else if (name === 'record_asset') {
      const items = Array.isArray(args.items) ? args.items as Array<Record<string, unknown>> : []
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
      if (!ACTION_INTENT.test(lastUserText) || (ASKS_HOW_MUCH.test(lastUserText) && !/\d/.test(lastUserText)) || (ACTION_VERB[name] && !ACTION_VERB[name].test(lastUserText) && !AGREES.test(lastUserText))) {
        console.log(`dropped ${name}: no request in "${lastUserText.slice(0, 60)}"`)
        continue
      }
      if (INVEST_ACTIONS.has(name) && !investUnlocked) {
        done.push(`BLOCKED ${name}: investing is locked (needs no debt and a full fund). Nothing was opened.`)
        continue
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
  }

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
  // Holdings after this turn's updates, valued at live prices (functions/api/prices.ts).
  const savedProfile = (appState?.profile && typeof appState.profile === 'object' ? appState.profile : {}) as Record<string, unknown>
  const held = (Array.isArray(savedProfile.holdings) ? savedProfile.holdings : []).map(toHolding).filter((h): h is Holding => h !== null)
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
  const { text: facts, floors } = fundFacts(appState, profileUpdate, rate, alloc)
  if (facts) replyMessages.push({ role: 'system', content: facts })
  if (ASKS_OVERVIEW.test(lastUserText)) {
    const p = { ...savedProfile, ...(profileUpdate ?? {}) }
    const hasDebt = moneyOf(p.debtAmount, (p.units as Record<string, unknown> | undefined)?.debtAmount) !== null
    replyMessages.push({ role: 'system', content: `Overall check-up: one short point each, in this order: ${hasDebt ? 'their outside debt (start with it), ' : ''}the emergency fund vs its floor, then the allocation. Keep the allocation to one sentence.` })
  }
  const replyLang = VI_LETTERS.test(lastUserText) ? 'Vietnamese' : 'English'
  replyMessages.push({ role: 'system', content: `Reply language: ${replyLang} (the language of the user's latest message).` })
  if (DECLINES.test(lastUserText)) replyMessages.push({ role: 'system', content: 'The user just declined to share. Respect it: this reply asks NOTHING about their personal situation (income, job, stability, debt, age…). Share general knowledge and say they can share any time.' })

  let rewrites = 0
  for (let round = 1; round <= 4; round++) {
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
      if (actions.some(a => a.type === 'show_allocation') && content.length > 380) problems.push(`the chart right below already shows every figure: rewrite in at most 2–3 sentences: the target${alloc.target ? ` (${alloc.target.safePct}% safe, ${alloc.target.investPct}% invest)` : ''}, how far off it they are, how to split idle money; no reading back each part`)
      const stray = ungrounded(content, [facts, stateText, ...done, ...messages.filter(m => m.role === 'user').map(m => m.content)])
      if (stray.length) problems.push(`these amounts are not in the figures: ${stray.join(', ')}. Do not compute new numbers (no "left after", no sums or differences); quote only amounts given in ASSET & FUND FIGURES or by the user`)
      if (alloc.target) {
        const { safePct, investPct } = alloc.target
        const has = (n: number) => new RegExp(`(?<!\\d)${n}\\s*%`).test(plain)
        if (has(investPct) !== has(safePct) || (ASKS_TARGET.test(lastUserText) && !has(investPct))) problems.push(`give the target by age with both parts: "${safePct}% safe, ${investPct}% invest" (of all money outside the fund)`)
      }
      if (!floors.length && appState?.fundOk !== true && NEEDS_AMOUNT.test(content)) problems.push('monthly spending is unknown, so nobody knows how much the fund needs: never say an amount is needed or quote the wallet as what to add; say the fund is 3 months of essential spending (6 if income is irregular) and ask how much they spend a month')
      if (SAFE_AS_FUND.test(content)) problems.push('the safe part is bank savings the user makes themselves, NOT the emergency fund, and it cannot be deposited in the app')
      if (problems.length && rewrites < 2 && round < 4) {
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
