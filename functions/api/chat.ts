// Cloudflare Pages Function — MoonSafe agent (OpenAI), every app operation is a tool.
// OPENAI_API_KEY is in Cloudflare environment variables (never in client bundle).
//
// Framework: docs/SPEC-FRAMEWORK-2026-10-25.md, as data in src/kb (moonsafe-kb.json + kb.ts).
// Numbers: src/lib/allocation.ts computeBalance, the same code the app's screens and buy lock use.
//
// Each user message runs two stages:
// 1. PLAN (gpt-4o-mini, tool_choice "required", at most 10 steps): the tools of spec 10 (profile,
//    holdings, move, debts, incomes, expenses, charts, cards). Recording tools become ProfileOps
//    (src/lib/profile.ts) that the app applies; each is checked first (numbers must be in the
//    user's words, values converted to quantities at live prices…). Letting gpt-4o-mini decide on
//    its own called a tool 0/8 times (measured 2026-10-22), hence "required" + no_action.
// 2. REPLY (gpt-4o-mini): talks to the user from the figures, the matching situation patterns
//    (kb.ts matchPatterns → patternBrief) and what PLAN did; rewritten at most 3 times when a
//    check fails (amounts not in the figures, never_say phrases, two questions, length…).
// The app performs the returned actions (cards, screens); the user always signs in their own wallet.
//
// Language (2026-10-24): the app is English-only; the agent answers in the language of the
// user's message (English by default, Vietnamese when they write Vietnamese). Intent patterns
// below therefore read both; lines holding Vietnamese are marked lang-ok for scripts/check-lang.mjs.

import { getPrices } from './prices'
import { privyUserId } from '../_lib/privyAuth'
import { KB, fundFloorMonths, matchPatterns, patternBrief, param } from '../../src/kb/kb'
import { computeFacts, displayFacts, amountsUsd } from '../../src/kb/facts'
import { computeBalance, holdingUsd, priceKey, symbolOf, toUsd, GOLD_UNITS_TO_OZ, GROUP_LABEL, TARGET_GROUPS, type Balance, type Prices } from '../../src/lib/allocation'
import {
  applyOps, categoryOf, defaultRebalanceable, isAssetType, newId, normalizeProfile, priceKindOf, BTC_SYMBOLS, DEBT_TYPES, STABLECOINS, TOP10_SYMBOLS,
  type ProfileOp,
} from '../../src/lib/profile'
import type { AssetType, Currency, Debt, DebtType, Expense, FinancialProfile, Holding, Income } from '../../src/types'

interface Env {
  OPENAI_API_KEY: string
  PRIVY_APP_ID?: string
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_call_id?: string
}

interface RequestBody {
  messages: Message[]
  /** Profile (v2; v1 is migrated) + wallet / fund / cirBTC balances in USDC + DCA status, sent by the app. */
  context?: Record<string, unknown> | null
  /** Eval harness: also return the computed figures, notes and patterns (no secrets in them). */
  debug?: boolean
}

interface ToolCall { id: string; function: { name: string; arguments: string } }
interface Completion {
  choices: Array<{ message: { role: string; content: string | null; tool_calls?: ToolCall[] } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ---- The framework in short, built from the KB (spec 0, 4, 5, 7, 8) -------------------------
const RULES = `## MoonSafe principles
${KB.principles.map(p => `- ${p}`).join('\n')}
## Framework (by age, only age changes it)
- Shares of LIQUID assets (Safe + rebalanceable Invest + Idle): Safe = age %; the rest 4/7 Traditional (stocks, gold, funds) and 3/7 crypto: BTC 2/3, Big caps (ETH, SOL, BNB, top-10) 1/6, Low caps (smaller coins, memecoins) 1/6. Age 30: Safe 30, Traditional 40, BTC 20, Big caps 5, Low caps 5. BTC never goes to 0.
- The emergency fund (USDC in the MoonSafe vault) stands apart. Floor in months of spending (fixed + essential variable + debt payments): 3 stable income; 6 stable with dependents or irregular without; 9 irregular with dependents; 12 if also the sole earner.
- Priority debt: credit card, consumer / payday loan, crypto margin, or any debt at ${param('priority_debt_rate_pct')}%/year or more. Interest-free debt never blocks.
- cirBTC buying in the app opens only with no priority debt AND the fund at its floor. Nothing else is ever blocked.
- The emergency fund is the only must. The split above is a reference the user MAY consider: "you could consider", never "recommended" / "you need to".
- When money is short, the order is a suggestion: ${KB.priority_order.join(' → ')}. ${KB.priority_rules.slice(1).join(' ')}
## Voice
- ${KB.voice.style}
- May say, for example: ${KB.voice.may_say.map(s => `"${s}"`).join(' ')}
- Never say: ${KB.voice.never_say.join(' ')}
- ${KB.voice.web3_view}
## Rebalancing
${KB.rebalance.map(r => `- ${r}`).join('\n')}`

// ---- intent patterns (EN + VI) -----------------------------------------------------------
// The user declining to share something ("I'd rather not say my income", "không muốn nói thu nhập"…).
const DECLINES = /(don'?t|do not|rather not|prefer not)\s+(want\s+to\s+|to\s+)?(say|share|tell|disclose|give)|\bprivate\b|none of your business|(không|chưa|ko|k)\s+(muốn|thích|tiện|định)\s+(nói|kể|chia sẻ|tiết lộ|khai)|bí mật|riêng tư|đừng hỏi/i // lang-ok
const AGE_WORD = /(?<!\p{L})(age|old|tuổi)(?!\p{L})/iu // lang-ok
// A UI action only runs when the latest message asks for one or clearly agrees to the
// agent's offer (2026-10-22 eval: "I work in an office" once opened a prefilled deposit).
// \b treats Vietnamese letters as non-word, so word edges are written with \p{L}.
// Agreement only counts at the start of the message ("ok so my salary is…" is not a yes).
const AGREES = /^\s*(ok|okay|oke|sure|yes|yeah|yep|go ahead|do it|sounds good|please do|được|đồng ý|ừ|uk|chốt|nhất trí|triển)(?!\p{L})/iu // lang-ok
const ACTION_INTENT = new RegExp(`(?<!\\p{L})(deposit|add|top up|put|withdraw|take out|buy|purchase|sell|dca|open|show|fill|stop|move|transfer|nạp|rút|mua|bán|mở(?!\\s*kh(?:oá|óa|oa))|xem|điền|dừng|chuyển|làm đi)(?!\\p{L})|${AGREES.source}`, 'iu') // lang-ok
const INVEST_INTENT = /(?<!\p{L})(buy|invest|investing|cirbtc|dca|btc|mua|đầu tư)(?!\p{L})/iu // lang-ok
// "I'm not yet investing" (answer to the coins question) once got the buy-lock sentence (real chat 2026-10-26).
const NOT_INVESTING = /(not|never|don'?t|do not|no)\s+(yet\s+)?(invest|investing|buy|buying)|(chưa|không|ko)\s+(đầu tư|mua)/iu // lang-ok
// A number paid per month or towards a debt: never the total owed ("200$ to repay my debt" became a 200 debt, real chat 2026-10-26).
const PAYMENT_NUM = /(\d[\d.,]*\d|\d)\s*k?\s*(?:\$|usdc?|usdt|dollars?|đô)?\s*(?:a month|per month|\/\s*month|monthly|each month|every month|to repay|to pay (?:it )?(?:back|off)|for (?:my |the )?(?:debt|loan)|mỗi tháng|một tháng|\/\s*tháng|trả nợ|trả góp)/giu // lang-ok
const APP_WALLET = /(this|the app|my app|moonsafe)\s+wallet|in (the|this) app|ví (này|app|moonsafe)/i // lang-ok
const QUESTIONS_US = /\?|(?<!\p{L})(why|you mean|wrong|how come|sao|tại sao|sai)(?!\p{L})/iu // lang-ok
// "my mom not using interest on me" was not read as 0% (real chat 2026-10-26).
const NO_INTEREST = /interest[- ]free|(no|not|never|without|zero|0%?)\s+(\p{L}+\s+){0,3}interest|(doesn'?t|does not|don'?t|do not|won'?t)\s+(\p{L}+\s+){0,2}(charge|take|ask|use)\s+(\p{L}+\s+){0,2}interest|(không|ko|chẳng)\s+(tính\s+|lấy\s+)?lãi/iu // lang-ok
const DEBT_PAY_NAME = /loan|debt|repay|mortgage|installment|credit card|(?<!\p{L})(mom|dad|mother|father)(?!\p{L})|nợ|trả góp/iu // lang-ok
const OFFERS_DEPOSIT = /prepare[^.?!\n]{0,60}(card|deposit)|card to (add|deposit)/i
const IDLE_AMOUNT = /(\d[\d,.]*\d|\d)\s*USDC\s*(?:of|in)\s*idle|idle money[^.?!\n]{0,30}?(\d[\d,.]*\d|\d)\s*USDC/gi
const YES_NO = /^\W*(yes|yeah|yep|yup|no|nope|not really|sure|mostly|kind of|có|không|ko|ừ|uh|đúng)(?!\p{L})/iu // lang-ok
const YOU_ARE_RIGHT = /^\W*(you('| a)re (right|correct)|that'?s (right|correct)|bạn nói đúng|đúng rồi)/i // lang-ok
// Each card needs its own verb (or a plain yes): "buy 100 USDC of cirBTC" while locked once
// came back as a deposit card (eval 2026-10-24).
const ACTION_VERB: Record<string, RegExp> = {
  prepare_deposit: /(?<!\p{L})(deposit|add|top up|put|nạp|bỏ vào quỹ|cho vào quỹ)(?!\p{L})/iu, // lang-ok
  prepare_withdraw: /(?<!\p{L})(withdraw|take out|rút)(?!\p{L})/iu, // lang-ok
  prepare_buy_cirbtc: /(?<!\p{L})(buy|purchase|mua)(?!\p{L})/iu, // lang-ok
  propose_dca: /(?<!\p{L})(dca|recurring|weekly|monthly|every (week|month)|mua đều|định kỳ|mỗi tuần|mỗi tháng)(?!\p{L})/iu, // lang-ok
}
// Questions where the reply must state the target split by age.
const ASKS_TARGET = /(what (percent|percentage|share)|how much (should|can) i invest|allocat|split|how is my money|bao nhiêu (phần trăm|%)|tỷ lệ|tỉ lệ|phân bổ|chia (tiền|thế nào|sao))/iu // lang-ok
// "why not invest right away instead of keeping a fund?" asks why; it is not a request to invest.
const ASKS_WHY = /(?<!\p{L})(why|what for|what is|sao|tại sao|vì sao|làm gì|là gì)(?!\p{L})/iu // lang-ok
const DEPOSIT_WORD = /(?<!\p{L})(deposit|nạp)(?!\p{L})/iu // lang-ok
// An overall check-up ("how are my finances doing?"): the reply follows debt → fund → allocation.
const ASKS_OVERVIEW = /how (am i|are my finances|is my (financial )?situation)|my finances|tình hình (tài chính)?/i // lang-ok
// Letters only Vietnamese uses: the reply language follows the user's latest message.
const VI_LETTERS = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i // lang-ok

// incomeStable is kept only when the user talked about how their income comes in (or answered
// the stability question). gpt-4o-mini filled incomeStable=true from "my salary is $2,000" (eval 2026-10-24).
const STABILITY_WORDS = /(?<!\p{L})(stable|steady|regular|irregular|fixed|employee|employed|full[- ]time|part[- ]time|salaried|freelanc\p{L}*|self[- ]employed|own (a |my )?business|contract|gig|ổn định|cố định|nhân viên|văn phòng|công chức|biên chế|tự do|kinh doanh|bấp bênh|thất thường)(?!\p{L})/iu // lang-ok
const ASKS_STABLE = /(stable|steady|regular)[^.!?\n]*\?|ổn định[^.!?\n]*\?|ổn định[^.!?\n]*(không|chưa)\.\s*[^.!?\n]{0,80}\?/i // lang-ok
// A zero / "none" is recorded only when the user said so (gpt-4o-mini filled 0 from "fixed salary", eval 2026-10-24).
const SAYS_NONE = /(?<!\p{L})(no|none|zero|nothing|nobody|no one|don'?t have|do not have|debt[- ]free|paid off|không|chưa có|hết nợ|ko có|không có ai)(?!\p{L})|(?<![\d.,])0(?![\d.,])/iu // lang-ok
const DEPENDENT_WORDS = /(?<!\p{L})(kids?|child(ren)?|son|daughter|parents?|mom|dad|mother|father|wife|husband|family|depend\p{L}*|support|con|bố|mẹ|ba má|vợ|chồng|gia đình|nuôi|phụ thuộc)(?!\p{L})/iu // lang-ok
const SOLD = /(?<!\p{L})(sold|no longer|don'?t have|gone|closed|withdrew|cashed out|paid off|bán hết|không còn|tất toán|trả hết|rút hết)(?!\p{L})/iu // lang-ok
// Vietnamese stocks are not price-tracked: gpt-4o-mini still filed "FPT on the Vietnam exchange" as a US stock.
const VN_MARKET = /vietnam|(?<!\p{L})(vn|hose|hnx|upcom|vn-?index)(?!\p{L})|việt nam|sàn việt|chứng khoán việt|cổ phiếu việt/iu // lang-ok

/**
 * Last resort after the rewrites: remove a repeated stability question, then keep only the
 * last question if several remain (one question per reply).
 */
function tidyQuestions(text: string, dropStable: boolean): string {
  const lines = text.split('\n').map(line => line.split(/(?<=[.!?])\s+/))
  if (dropStable) for (const parts of lines) for (let i = parts.length - 1; i >= 0; i--) if (ASKS_STABLE.test(parts[i].trim())) parts.splice(i, 1)
  const questions = lines.flatMap((parts, li) => parts.map((p, pi) => ({ li, pi, q: p.replace(/\*+$/, '').trim().endsWith('?') }))).filter(x => x.q)
  for (const x of questions.slice(0, -1)) lines[x.li][x.pi] = ''
  return lines.map(parts => parts.filter(Boolean).join(' ')).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Phrases that report an app action as done; only allowed when an action actually ran.
const CLAIMS_ACTION = /\bI(['’]ve| have| just)\s+(opened|filled|created|set up|shown|prepared)\b|here(['’]s| is) (the|your) card|(đã|vừa)\s+(mở|điền|hiện|tạo)(?!\s*kh(?:oá|óa|oa))\s*(sẵn)?|mở sẵn màn .{0,40} (rồi|cho bạn)/i // lang-ok
const SAYS_NOTED = /\b(noted|recorded|got it saved)\b|(đã |mình )ghi( nhận)?/i // lang-ok
// "You need to add 2,301 USDC" / "you can add up to 2,301 USDC" while the floor is unknown.
const NEEDS_AMOUNT = /((need|have|has) to (add|deposit|put)|can (add|deposit|put) up to|to reach (its|the|your) (required )?floor)[^.?!\n]{0,30}\d|(cần|phải|được tối đa) (nạp|thêm)[^.?!\n]{0,30}\d/i // lang-ok
const ASKS_USE = /idle|what (should|can) i do with|how (should|do) i (split|invest|use)|nhàn rỗi|làm gì với|chia (tiền|thế nào|sao)/i // lang-ok
const BUILD_FUND = /(?<!\p{L})(build|grow|save|saving|reach|xây|để dành|tiết kiệm)(?!\p{L})/iu // lang-ok
const DEBT_WORD = /(?<!\p{L})(debts?|loans?|nợ|khoản vay)(?!\p{L})/iu // lang-ok
const PUSHY = /(you need to|you must|please) (declare|provide|fill in)|(bạn cần|vui lòng|hãy|bạn phải)\s+khai báo/i // lang-ok
// Advice read as orders with no reason (Hieu, 2026-10-27): suggestions say what they do for the user.
const BOSSY = /\byou (need|have) to\b|\byou must\b|(?<!\p{L})(bạn cần|bạn phải|hãy)(?!\p{L})/iu // lang-ok
const OTHER_SCRIPT = /[\u0400-\u04FF\u0590-\u06FF\u0E00-\u0E7F\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/ // Cyrillic, Hebrew, Arabic, Thai, Japanese, Chinese, Korean
const RIGHT_Q = /(Right|Đúng chưa)\?/i // lang-ok
const NEED_TO_KNOW = /I need to know|(?<!\p{L})mình cần (biết|bạn cho biết)(?!\p{L})/iu // lang-ok
const ROTE_WHY = /(this|that|it) is (important|crucial|essential) because|(điều|điểm) (này|đó) (rất )?quan trọng (vì|để)/i // lang-ok
const DEBT_CARD = /(prepare|set up|chuẩn bị|tạo)[^.?!\n]{0,40}(trả nợ|pay (off |down |back )?(the |your |this )?(debt|loan|credit))/i // lang-ok
const UNLOCKS =/(open|unlock|mở( khóa| khoá)?)[^.;?!\n]{0,30}cirBTC|cirBTC[^.;?!\n]{0,20}(will|sẽ)[^.;?!\n]{0,10}(open|unlock|mở)/iu // lang-ok
const GIVES_REASON = /because|\bso (that )?(I|you|we|the)\b|which (means|lets|protects|covers|shows)|this (protects|lets|means|way|tells|shows)|that way|(?<!\p{L})(to|helps? (me|you)) (protect|cover|keep|make sure|work out|tell|see|know|figure|plan|decide|set)\b|depends on|(?<!\p{L})(vì|để (mình|bạn|biết|tính|xem|quyết)|nhờ đó|như vậy|giúp (mình|bạn)|phụ thuộc)(?!\p{L})/iu // lang-ok
const OFFERED: Record<string, RegExp> = {
  prepare_buy_cirbtc: /(prepare|set up|proceed|go ahead)[^.?!\n]{0,40}(buy|purchase|invest)|(buy|purchase|cirBTC)[^.?!\n]{0,40}\?/i,
  prepare_deposit: /(prepare|set up)[^.?!\n]{0,30}deposit/i,
  prepare_withdraw: /(prepare|set up)[^.?!\n]{0,30}withdraw/i,
  propose_dca: /(set up|prepare|want)[^.?!\n]{0,30}DCA/i,
}
const NOTHING_ELSE = /(?<!\p{L})(nothing( else)?|none|no other|that'?s (all|it)|only (the|this|my) (app )?wallet|just (the|this|my) wallet|không có gì|không còn gì|chỉ có (ví|thế)|hết rồi)(?!\p{L})/iu // lang-ok
// "Would you like me to prepare a deposit for your savings?" — the app cannot move money to a bank or an exchange.
const SAFE_IN_APP = /(\bI(['’]ve|['’]ll| have| will| can)?|would you like me to|shall I|let me|want me to)\s[^.?!\n]{0,20}(prepare|prepared|set up|make|arrange|move|moved|transfer|transferred)\b[^.?!\n]{0,40}(to|into|for) (your |the )?(safe )?(savings|bank|safe)|(mình|để mình)[^.?!\n]{0,20}(chuẩn bị|chuyển|nạp)[^.?!\n]{0,40}(tiết kiệm|ngân hàng)/i // lang-ok
const FUND_WORD = /fund|vault|emergency|quỹ/i // lang-ok
const ALL_OF_IT = /(?<!\p{L})(all|whole|everything|entire|max|hết|toàn bộ|tất cả)(?!\p{L})/iu // lang-ok
const ASKS_HOW_MUCH = /how much|bao nhiêu/i // lang-ok
const SAYS_LOCKED = /lock|kho[áa]|khóa|(to open|để mở)/i // lang-ok
const SAFE_AS_FUND = /safe fund|deposit[^.?!\n]{0,40}(into|to) (the |your )?safe (part|fund|bucket)|quỹ an toàn|nạp[^.?!\n]{0,40}(vào |phần )an toàn/i // lang-ok
// never_say (spec 8.2): world standards / experts / Fidelity / Vanguard, "you should buy", selling, leverage, promised returns.
const NEVER_SAY = /world standards?|international standards?|experts? (say|suggest|recommend|advise)|according to experts|financial experts|fidelity|vanguard|you should (buy|sell)|(you (could|should|can|might)|consider|I('d)? suggest|try) (selling|to sell|sell)\b|sell (some|part|half|a bit) of|(use|try|add|take on) (some )?leverage|guaranteed (returns?|profit)|will (go up|moon|rise) |chuẩn (thế giới|quốc tế)|theo (các )?chuyên gia|nên (mua|bán) ngay|(nên|hãy|có thể) bán (bớt|một phần|đi)|dùng đòn bẩy|lợi nhuận đảm bảo/i // lang-ok
const SPLIT_AS_MUST = /(recommended|you need to|you must|you have to|you should)[^.?!\n]{0,60}(split|allocation|target|rebalanc|diversif|%)|(\d\s*%|target|split|allocation)[^.?!\n]{0,40}recommended|(nên|cần|phải)\s+(là|chia|có|giữ)[^.?!\n]{0,30}%/iu // lang-ok
// The disclaimer lives on the cards and "Before you start" only (spec 8.4).
const DISCLAIMER = /not (financial|investment) advice|only invest (money )?(what |that )?you can afford to lose|không phải lời khuyên đầu tư|chỉ đầu tư số tiền/i // lang-ok
const CAUTION_ALT = /(altcoin|low[- ]caps?|memecoin|meme coin)[^.?!\n]{0,80}(lose|risk|drop|fall|crash|down|shrink|mất|rủi ro)|(lose|risk|mất|rủi ro)[^.?!\n]{0,80}(altcoin|low[- ]caps?|memecoin|meme coin)/i // lang-ok

// Vietnamese words the model must recognise in Vietnamese messages (the app itself is English-only).
const VI_VOICE = 'In Vietnamese: natural Vietnamese, call yourself "mình" and the user "bạn", never "tôi", never "boss".' // lang-ok
const VI_FLOORS = 'Write fund floors as "3 tháng chi tiêu = …" and the figures\' labels in Vietnamese; the emergency fund is "quỹ dự phòng", never "quỹ an toàn"; never copy English labels such as "WALLET COVERS IT NOW". Read-back starts with "Mình ghi:" and ends with "Đúng chưa?".' // lang-ok
const VI_YES = '"được", "đồng ý", "nạp đi"' // lang-ok
const VI_DEPOSIT = '"nạp 200 USDC"' // lang-ok
const VI_USD = 'đô' // lang-ok
const VI_VND = 'đồng, triệu / tr, nghìn / k (15 triệu = 15000000)' // lang-ok
const VI_GOLD = '1 cây / lượng = 37.5 g, 1 chỉ = 3.75 g' // lang-ok
const VI_DEBT_Q = 'Bạn còn khoản nợ nào khác không, kể cả mượn người thân, không lãi, không giấy tờ?' // lang-ok

// ---- Grounding: every amount in a reply must come from the figures, the notes or the user ----
// "You will still need 2,800 USDC after adding 200" was the model doing its own subtraction
// (eval 2026-10-24); the prompt alone did not stop it.
const AMOUNT = /\$\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s*(M VND|million VND|million|triệu|USDC|USD|VND|₫)/g // lang-ok
const NUMBER = /(\d[\d.,]*\d|\d)(\s*(triệu|million|M\b))?/g // lang-ok
/** A token read both ways, "1,160.71" (en) and "1.160,71" (vi); one of them is the meant value. */
const readings = (t: string) => [Number(t.replace(/,/g, '')), Number(t.replace(/\./g, '').replace(',', '.'))].filter(Number.isFinite)
const numbersIn = (s: string) => [...s.replace(/ /g, ' ').matchAll(NUMBER)].flatMap(m => readings(m[1]).map(v => v * (m[2] ? 1e6 : 1)))
function ungrounded(reply: string, sources: string[]): string[] {
  const known = sources.flatMap(numbersIn)
  const out: string[] = []
  for (const m of reply.replace(/ /g, ' ').matchAll(AMOUNT)) {
    const unit = m[3] ?? '$'
    const k = /^(M|million|triệu)/.test(unit) ? 1e6 : 1 // lang-ok
    const ok = readings(m[1] ?? m[2]).some(v => v * k === 0 || known.some(n => n > 0 && Math.abs(n - v * k) / n <= 0.01))
    if (!ok) out.push(m[0].trim())
  }
  return out
}

const REPLY_MODEL = 'gpt-5.4-mini'

const REPLY_PROMPT = `You are MoonSafe's personal finance advisor for Web3 users: professional, warm, plain words. You advise, ask one question at a time to understand their money, record what they tell you, and prepare cards for them to sign when useful. You never push them to buy or sell; they decide.

## Language
Reply in the language of the user's latest message (default English). ${VI_VOICE}

## Style
- Talk like a friend who knows money well, sitting next to them: warm, concrete, never preachy. Advise first, ask after.
- Make every reason tangible with THEIR numbers and a real-life picture ("if your income stopped next month, **500 USDC** covers about two weeks"). Never the empty "this is important because…": say what actually happens to them.
- The FIRST time a reply uses a MoonSafe idea (emergency fund, fund floor, cirBTC lock, split by age, idle money, priority debt), explain in one plain sentence what it is and why, with their numbers.
- Greeting: one sentence on what you can do for them (sort out spending, an emergency fund, how to split their money), then your question with why you ask.
- Options, never orders ("you could…", "one option is…"; never "you need to" / "you must"). At most one question, saying why you ask.
- About 3-4 sentences (about 70 words); up to 6 when they ask why. Amounts and the key point in **bold**.
- No preamble, no repeating what they said, no filler, no judging.
- No disclaimer in chat ("not investment advice", "only invest what you can afford to lose"): it is on the cards and the "Before you start" screen.

${RULES}

## Numbers (a wrong number loses trust)
- Only numbers from "ASSET & FUND FIGURES", the notes or the user's words. Never add, subtract, multiply, divide or convert yourself; if a number is missing, say it cannot be worked out yet.
- Fund floors read "N months of spending = amount"; "still needed" is its own number.
- Spending unknown → nobody knows the floor: call no amount "needed", ask how much they spend a month.
- Shares are of liquid assets. Quote the target by the MoonSafe framework ("by the MoonSafe framework, at 30…"). Age unknown → ask the age before any share. Age declined → use 30 and say it is the default.

## Situations
- "MATCHING SITUATIONS" lists what applies to this user right now, most important first. Follow "does", you may use the "may say" lines, never do the "never" lines. Only bring up a situation when it fits what they asked, the most important one first.

## Actions and recording
- Only describe what the "Actions just taken" note lists. Cards (add to the fund, withdraw, buy cirBTC, DCA) are confirmation CARDS the user signs: never say deposited / bought / done. To offer one: "Would you like me to prepare … for you to sign?".
- Something recorded → start with the read-back from the notes, then at most one sentence on what the new number means for them, then end with "Right?" (that is your one question). When a "Next question" is given, ask it instead of "Right?" (with why you ask). Never mention what they said before or that it changed.
- The app cannot move money to a bank or an exchange; the Safe part is their own savings or flexible earn (e.g. Binance Simple Earn Flexible), never the emergency fund.
- They want a big BTC share (even 50%) → understand and respect it, Web3 thinking is heavy on BTC; only the fund comes first. They want a big low-cap / memecoin share → the reality check from the matching situation, once.
- They want to buy cirBTC while it is locked → what is missing and how much (the "Buy lock" line), then why the lock exists in one sentence: without the cushion, if BTC drops right when they need cash, they would have to sell at a loss. No longer lecture.
- Buying is OPEN and they agree to invest without an amount → offer the BTC amount from "Suggested use of idle money" as a cirBTC card for them to sign; never ask the same yes / no again.

## Questions
- At most one, only when it helps. Never ask again for something known or a question they ignored. They decline to share → ask nothing personal, use the defaults and say the picture is an estimate.
- Collecting: when "Next question" is given and they did not ask something else, first give one useful point from what is already known (the figures), then ask exactly that one, saying briefly why it matters for their advice.
- Greeting → one line plus one open question.
- They are angry or swear → one short apology, then fix or ask what is wrong in their numbers; never repeat your last message.
- "How am I doing?" → priority debt (if any), the fund, the split; one short point each.
- They question a number ("why 2,400?", "you mean 6 months?") → answer that first: show how it is made from the figures (spending lines + debt payments = spending a month, × months = floor). Never say they are right unless the figures agree with them.
- Outside personal finance you may use web_search.`

const ASSET_TYPES_TEXT = KB.asset_types.filter(t => t.key !== 'moonsafe_fund' && t.key !== 'cirbtc').map(t => `${t.key} (${t.label})`).join('; ')

const PLAN_PROMPT = `You are MoonSafe's action planner. Read the user's LATEST message (earlier ones are context), the profile list (each item has an [id]) and the app state, then CALL tools. Every step calls at least one tool and sees each result; when nothing more was asked or told, call no_action. Never do what was not asked or told. Users write English or Vietnamese.

## Which tool
- A bare answer ("400$", "Maybe 1000$", "No") answers the agent's LAST question: after "how much do you spend?" it is spending, after "how much in the bank?" it is savings, after "any other debt?" a "No" is no other debt.
- Age, income stability, number of dependents, sole earner, declining to give the age, "no (other) debt" → update_profile. Only what was just said ("salary" says nothing about stability).
- Something they hold → add_holding, one call per item, with the right type. A new amount for an item already listed → set_holding with its id. Sold everything / closed it → remove_holding.
- Money moved between their own places ("I moved 1,000 from my wallet into savings") → move. "I just put X into savings / safe" WITHOUT saying where it came from → record nothing, call no_action (the agent asks first). When they answer where it came from: their idle money, cash or the app wallet → move; new money from outside → add_holding.
- Each debt → add_debt (type, balance, yearly rate and monthly payment if said, lender for family). Changes → update_debt; paid off → remove_debt. Unknown type → type "unknown".
- Each income source → set_income: active (salary, side jobs, content), passive (interest, staking, rent, dividends, interest on loans given), irregular (airdrops, trading, bonuses). A new number for a listed one → same tool with its id.
- Spending → set_expense: fixed (rent, bills, subscriptions, school fees) or variable (food, transport, other essentials). One total ("I spend 1,000 a month") → one fixed line named "Monthly spending". Debt payments belong on the debt (monthly_payment), never as an expense. A total that includes debt payments ("600 in all: 400 must-pay and 200 to repay my debt") → set_expense with ONLY the non-debt part (400), once. A payment on a debt whose total owed was not said → record no debt (the agent asks how much is still owed).
- USDC in THIS app wallet ("in this wallet", "in the app") is read by the app: never record it, never move it.
- Money "in the bank" without saying checking / current account → savings (it is their Safe part). They say an item is in the wrong place ("I told you I have 1000$ in the bank" while it shows as idle) → set_holding with its id and the right type.
- A loan from family / friends: family_no_interest when they say there is no interest, family_interest when there is; not said → family_interest without rate_pct (the agent asks).
- show_allocation ONLY when they ask how their money is split, what to do with idle money, or for the chart. show_cashflow ONLY when they ask about income vs spending, how much they save, or financial freedom.
- They want to add to the fund → prepare_deposit; withdraw → prepare_withdraw; buy cirBTC → prepare_buy_cirbtc; recurring buys → propose_dca; stop them → stop_dca; open a screen → open_screen.
- A plain yes right after the agent's offer ("ok", "yes", "do it", "as you said", ${VI_YES}) → that exact action with the offered amount. A message that adds information is not a yes.
- prepare_deposit is ONLY for the emergency fund, never for the Safe part (their own savings).

## Asset types
${ASSET_TYPES_TEXT}.
- BTC on an exchange / cold wallet = btc (cirBTC in the app wallet is read by the app: never record it). ETH = eth; BNB, SOL, XRP and other top-10 coins = top10; staked ETH / SOL = staked_large_cap; other coins and memecoins = altcoin (with symbol).
- USDC / USDT, or dollars with no coin named ("$1,000 on an exchange"), in a wallet or on an exchange spot account = stable_wallet; in Binance Simple Earn Flexible or similar = flexible_earn; locked earn = locked_earn; lent in DeFi = defi_stable.
- Vietnamese stocks = vn_stock (worth only). Gold bars / rings = gold_physical with quantity + unit (oz, g, kg, luong, chi; ${VI_GOLD}).

## Amounts
- quantity = coins / shares / gold units for market-priced items; worth = what it is worth when they gave a value ("$2,000 of gold", "ETH worth 50 million VND") or for anything without a market price (cash, savings, home, car, business, loans given, insurance at its surrender value).
- Pass the number and currency as said: USDC, USD, $, dollars, ${VI_USD} → "USDC" (3k USD = 3000); VND, ${VI_VND} → "VND". Never convert.
- App-state numbers are USDC. "the rest" / "fill it up" = the fund gap; "all my wallet" / "max" = the wallet balance; "withdraw everything" = the fund balance.
- "deposit 200 USDC" / ${VI_DEPOSIT} is a deposit, not debt.`

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

const ASSET_TYPE_KEYS = KB.asset_types.map(t => t.key).filter(k => k !== 'moonsafe_fund' && k !== 'cirbtc')

const PLAN_TOOLS = [
  fn('update_profile', 'Record facts about the user just stated. Pass only fields just learned.', {
    age: { type: 'integer' },
    age_declined: { type: 'boolean', description: 'true when they decline to give their age' },
    income_stable: { type: 'boolean', description: 'Fixed salary = true; freelance / own business / irregular = false' },
    dependents: { type: 'integer', description: 'Number of people who rely on their income' },
    sole_earner: { type: 'boolean', description: 'They are the only earner of the household' },
    debts_complete: { type: 'boolean', description: 'true when they said they have no (other) debt, family loans included' },
  }),
  fn('add_holding', 'Record one thing the user holds (the app prices it live or keeps the declared value).', {
    type: { type: 'string', enum: ASSET_TYPE_KEYS },
    name: { type: 'string', description: 'Short name: "Chase savings", "ETH", "Gold rings", "Apartment"' },
    symbol: { type: 'string', description: 'Ticker / coin symbol for market-priced items (VOO, ETH, PAXG, SOL)' },
    where: { type: 'string', description: 'Where it is kept (Binance, Vietcombank, cold wallet) if said' },
    quantity: { type: 'number', description: 'Coins / shares / gold units. Leave out when only a value was given.' },
    unit: { type: 'string', enum: ['oz', 'g', 'kg', 'luong', 'chi'], description: 'Gold only' },
    worth: { ...MONEY, description: 'What it is worth, when a value was given instead of a quantity, or for anything without a market price' },
    category: { type: 'string', enum: ['safe', 'invest', 'idle', 'lifestyle'], description: 'Type "other" only: what it is by nature' },
    loan_status: { type: 'string', enum: ['on_time', 'overdue'], description: 'loan_given only' },
  }, ['type', 'name']),
  fn('set_holding', 'Change the amount, or the type, of an item already listed (by id).', {
    id: { type: 'string' },
    type: { type: 'string', enum: ASSET_TYPE_KEYS, description: 'Only when the user says it is a different kind of item (bank checking → savings)' },
    quantity: { type: 'number' },
    worth: MONEY,
    loan_status: { type: 'string', enum: ['on_time', 'overdue'] },
  }, ['id']),
  fn('remove_holding', 'Remove an item (sold all, closed).', { id: { type: 'string' } }, ['id']),
  fn('move', 'Money moved between the user\'s own places (idle money / app wallet / a listed item → another place).', {
    from: { type: 'string', description: '"wallet" (the app wallet), "idle" (cash / idle money), or the id of a listed item' },
    to_id: { type: 'string', description: 'id of a listed item it went into, if any' },
    to_type: { type: 'string', enum: ASSET_TYPE_KEYS, description: 'Type of the place it went into, when not a listed item' },
    to_name: { type: 'string' },
    amount: MONEY,
  }, ['from', 'amount']),
  fn('add_debt', 'Record one debt.', {
    name: { type: 'string', description: '"Visa card", "Home loan", "Loan from Mom"' },
    type: { type: 'string', enum: DEBT_TYPES },
    lender: { type: 'string', description: 'Family member / friend, for family debts' },
    balance: MONEY,
    rate_pct: { type: 'number', description: 'Yearly interest %, 0 = no interest; leave out if not said' },
    monthly_payment: { ...MONEY, description: 'Paid per month (interest-free: what they actually pay)' },
    term: { type: 'string', enum: ['short', 'long'] },
    required: { type: 'boolean', description: 'false = flexible, pay when they can' },
  }, ['name', 'type', 'balance']),
  fn('update_debt', 'Change a listed debt (by id).', {
    id: { type: 'string' },
    type: { type: 'string', enum: DEBT_TYPES },
    balance: MONEY,
    rate_pct: { type: 'number' },
    monthly_payment: MONEY,
    lender: { type: 'string' },
    required: { type: 'boolean' },
  }, ['id']),
  fn('remove_debt', 'Remove a debt (paid off).', { id: { type: 'string' } }, ['id']),
  fn('set_income', 'Record or update one source of income (monthly average).', {
    id: { type: 'string', description: 'id of the listed income to update, if any' },
    name: { type: 'string' },
    monthly: MONEY,
    kind: { type: 'string', enum: ['active', 'passive', 'irregular'] },
  }, ['name', 'monthly', 'kind']),
  fn('remove_income', 'Remove a source of income.', { id: { type: 'string' } }, ['id']),
  fn('set_expense', 'Record or update one spending line (monthly average).', {
    id: { type: 'string', description: 'id of the listed line to update, if any' },
    name: { type: 'string' },
    monthly: MONEY,
    kind: { type: 'string', enum: ['fixed', 'variable'] },
  }, ['name', 'monthly', 'kind']),
  fn('remove_expense', 'Remove a spending line.', { id: { type: 'string' } }, ['id']),
  fn('show_allocation', 'Show the allocation chart (target by age vs now) right in the chat.'),
  fn('show_cashflow', 'Show income vs spending (and passive / spending) right in the chat.'),
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
const RECORDING = new Set(['update_profile', 'add_holding', 'set_holding', 'remove_holding', 'move', 'add_debt', 'update_debt', 'remove_debt', 'set_income', 'remove_income', 'set_expense', 'remove_expense'])

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

// Same rate source as the app (/api/rates → open.er-api.com).
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

const usdc = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: Math.abs(n) >= 100 ? 0 : 2 }).format(n)} USDC`
const vnd = (n: number) => n >= 1_000_000
  ? `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n / 1_000_000)}M VND`
  : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)} VND`
const pct = (n: number) => `${Math.round(n * 10) / 10}%`
const qty = (n: number) => `${Math.round(n * 10_000) / 10_000}`

/** A tool amount ({amount, currency}) read loosely. */
function moneyArg(v: unknown): { amount: number; currency: Currency } | null {
  if (!v || typeof v !== 'object') return null
  const o = v as { amount?: unknown; currency?: unknown }
  return typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount >= 0 ? { amount: o.amount, currency: o.currency === 'VND' ? 'VND' : 'USDC' } : null
}
const moneyText = (m: { amount: number; currency: Currency }) => m.currency === 'VND' ? vnd(m.amount) : usdc(m.amount)

// Money kept in the wallet for gas when filling the fund (= GAS_RESERVE_USDC6 in useVault).
const GAS_RESERVE_USDC = 0.02
const MAX_PLAN_STEPS = 10

/** One line per listed item with its id, for the planner. */
function listing(p: FinancialProfile, b: Balance, prices: Prices | null, rate: number | null): string {
  const val = (h: Holding) => {
    const usd = holdingUsd(h, prices, rate)
    const amt = h.quantity !== undefined && h.priceSource === 'market' ? `${qty(h.quantity)} ${h.unit ?? ''}`.trim() : h.value !== undefined ? moneyText({ amount: h.value, currency: h.currency ?? 'USDC' }) : ''
    return `${amt}${usd !== null && (h.quantity !== undefined || h.currency === 'VND') ? ` ≈ ${usdc(usd)}` : usd === null ? ' (no price yet)' : ''}`
  }
  const flags = [`age ${p.age ?? (p.ageDeclined ? 'declined (default 30)' : 'unknown')}`, `income stable: ${p.incomeStable ?? 'unknown'}`, `dependents: ${p.dependents ?? 'unknown'}`,
    `sole earner: ${p.soleEarner ?? 'unknown'}`, `debts answered: ${p.debtsComplete ? 'yes' : 'no'}`]
  return [
    `Profile: ${flags.join(' | ')}`,
    `Holdings: ${p.holdings.map(h => `[${h.id}] ${h.type} "${h.name}"${h.where ? ` at ${h.where}` : ''} ${val(h)}`).join('; ') || 'none'}`,
    `Debts: ${p.debts.map(d => `[${d.id}] ${d.type} "${d.name}"${d.lender ? ` from ${d.lender}` : ''} ${moneyText({ amount: d.balance, currency: d.currency })}, rate ${d.ratePct === null ? 'unknown' : `${d.ratePct}%`}, pays ${d.monthlyPayment === null ? 'unknown' : moneyText({ amount: d.monthlyPayment, currency: d.currency })}/month`).join('; ') || 'none'}`,
    `Incomes: ${p.incomes.map(i => `[${i.id}] ${i.kind} "${i.name}" ${moneyText({ amount: i.monthly, currency: i.currency })}/month`).join('; ') || 'none'}`,
    `Expenses: ${p.expenses.map(e => `[${e.id}] ${e.kind} "${e.name}" ${moneyText({ amount: e.monthly, currency: e.currency })}/month`).join('; ') || 'none'}`,
    `App: wallet ${b.items.find(i => i.label === 'Wallet USDC') ? usdc(Math.floor(b.items.find(i => i.label === 'Wallet USDC')!.usd)) : '0 USDC'} (read onchain, never record it), emergency fund ${b.fundUsd !== null ? usdc(b.fundUsd) : 'unknown'}, fund gap ${b.fund.gap !== null ? usdc(b.fund.gap) : 'unknown'}, cirBTC buying ${b.lock.open ? 'OPEN' : 'LOCKED'}`,
  ].join('\n')
}

/**
 * Every figure the reply may quote, computed here (src/lib/allocation.ts) in USDC (VND in brackets
 * when the user uses VND). The model mixed VND and USDC in one subtraction when it had to convert
 * itself (2026-10-22).
 */
function figures(b: Balance, p: FinancialProfile, wallet: number | null, cir: number, rate: number | null, usesVnd: boolean, surplusDca: boolean): { text: string; floors: { months: number; texts: string[] }[]; cover: number | null } {
  let cover: number | null = null
  const show = (n: number) => usesVnd && rate ? `${usdc(n)} (≈ ${vnd(n * rate)})` : usdc(n)
  const lines: string[] = []
  const floors: { months: number; texts: string[] }[] = []
  // Rounded down to whole USDC: 2,300.58 shown as "2,301" was offered as a deposit above the wallet (real chat 2026-10-26).
  const spendable = wallet !== null ? Math.max(0, Math.floor(wallet - GAS_RESERVE_USDC)) : null
  const cf = b.cashflow
  lines.push(wallet !== null ? `- App wallet: ${show(Math.floor(wallet))} (idle money; can add up to ${show(spendable ?? 0)} to the fund, keeping ${usdc(GAS_RESERVE_USDC)} for fees)` : '- App wallet: balance unknown')
  lines.push(b.fundUsd !== null ? `- Emergency fund: ${show(b.fundUsd)}${b.fund.months !== null ? ` = ${Math.round(b.fund.months * 10) / 10} months of spending` : ''}` : '- Emergency fund: balance unknown')
  if (cir > 0) lines.push(`- cirBTC already held: ${show(cir)} (owned, NOT an amount to buy or invest)`)

  // Fund floor (spec 5.1). Stability unknown → both floors, so the agent can ask.
  if (cf.spending === null) lines.push('- Fund floor: UNKNOWN, monthly spending is not known yet. Nobody can say how much the fund needs: never present any amount as needed. If asked: the floor is 3 months of spending (more with irregular income or dependents), then ask how much they spend a month.')
  else {
    // Spelled out so the agent can show how the floor is made when asked "why 2,400?" (real chat 2026-10-26).
    const lineSum = cf.fixed - cf.debtPayments + cf.variable
    lines.push(`- Spending per month: ${show(cf.spending)} = spending lines ${show(lineSum)}${cf.debtPayments > 0 ? ` + debt payments ${show(cf.debtPayments)} (${b.debts.lines.filter(l => l.monthlyUsd).map(l => `${l.debt.name} ${show(l.monthlyUsd!)}`).join(', ')})` : ''}`)
    const irregularFloor = fundFloorMonths({ income_stable: false, dependents: p.dependents ?? 0, sole_earner: p.soleEarner ?? false })
    const cases = p.incomeStable === null ? [{ months: b.fund.floorMonths, who: 'If income is stable' }, { months: irregularFloor, who: 'If income is irregular' }] : [{ months: b.fund.floorMonths, who: `Floor (income ${p.incomeStable ? 'stable' : 'irregular'}, dependents ${p.dependents ?? 0}${p.soleEarner ? ', sole earner' : ''})` }]
    for (const c of cases) {
      const floor = cf.spending * c.months
      let status = 'cannot work out the gap yet (no fund balance)'
      if (b.fundUsd !== null) {
        const need = floor - b.fundUsd
        if (need <= 0.005) status = 'the fund has ALREADY MET this floor'
        else if (spendable !== null && spendable >= need) { status = `still needed: ${show(need)}; WALLET COVERS IT NOW (offer exactly this amount, not the whole wallet)`; if (cases.length === 1) cover = need }
        else if (spendable !== null && spendable > 0) status = `still needed: ${show(need)}; even after adding the whole wallet (${show(spendable)}), still needed: ${show(need - spendable)}`
        else status = `still needed: ${show(need)}; the wallet has nothing to add`
        const rest = need - (spendable ?? 0)
        if (rest > 0 && cf.surplus !== null) status += cf.surplus > 0 ? `; saving ${show(cf.surplus)} a month into the fund takes about ${Math.ceil(rest / cf.surplus)} more months` : '; no monthly surplus to save yet (spending ≥ income)'
      }
      lines.push(`- ${c.who}: FLOOR ${c.months} months of spending = ${c.months} × ${show(cf.spending)} = ${show(floor)} · ${status}`)
      floors.push({ months: c.months, texts: [usdc(floor)] })
    }
    if (b.fund.starterUsd !== null) lines.push(`- Starter fund (1 month of spending): ${show(b.fund.starterUsd)} · ${b.fund.starterMet ? 'met' : 'not met yet'}`)
  }

  // Cash flow (spec 6).
  if (cf.income !== null) {
    lines.push(`- Income per month: ${show(cf.income)} (active ${show(cf.active)}, passive ${show(cf.passive)}, irregular ${show(cf.irregular)})${cf.surplus !== null ? ` · surplus ${show(cf.surplus)} a month${cf.income > 0 ? ` (saves ${Math.round(cf.surplus / cf.income * 100)}% of income)` : ''}` : ''}`)
    if (cf.passiveRatio !== null) lines.push(`- Passive / Spending = ${Math.round(cf.passiveRatio * 100)}%${cf.passiveRatio >= 1 ? ' → FINANCIAL FREEDOM by the MoonSafe framework' : ''}`)
  }

  // Debts (spec 5.2).
  if (b.debts.lines.length) {
    lines.push(`- Debts: ${b.debts.lines.map(l => `${l.debt.name} (${KB.debt_types.find(t => t.key === l.debt.type)?.label ?? 'type not told yet'}) ${l.usd !== null ? show(l.usd) : moneyText({ amount: l.debt.balance, currency: l.debt.currency })}, ${l.debt.ratePct === null ? 'rate not told' : `${l.debt.ratePct}%/year`}${l.monthlyUsd !== null ? `, pays ${show(l.monthlyUsd)}/month` : ''}${l.priority ? ', PRIORITY' : ''}${l.monthlyInterestUsd ? `, costs about ${show(l.monthlyInterestUsd)} a month in interest` : ''}`).join('; ')}`)
    lines.push(`- Total debt ${show(b.debtTotal)}; priority debt ${show(b.debts.priorityTotal)}`)
  } else lines.push(p.debtsComplete ? '- Debts: none (the user said so)' : '- Debts: not asked yet')

  // Totals (spec 2) and the split (spec 4).
  lines.push(`- Liquid assets (base of every %): ${show(b.liquid)} · Net worth: ${show(b.netWorth)} (all assets ${show(b.assets)} incl. fund, lifestyle ${show(b.lifestyle)}, not rebalanceable ${show(b.grey)}; minus debt ${show(b.debtTotal)})`)
  if (b.liquid > 0) lines.push(`- Split now (% of liquid): ${(['safe', 'traditional', 'btc', 'large_cap', 'altcoin', 'idle'] as const).map(g => `${GROUP_LABEL[g]} ${pct(b.byGroup[g] / b.liquid * 100)} (${show(b.byGroup[g])})`).join(', ')}`)
  const parts = b.items.filter(i => i.holding || i.label === 'cirBTC')
  if (parts.length) lines.push(`- Items: ${parts.map(i => `${i.label} ${show(i.usd)} (${i.group ? GROUP_LABEL[i.group] : i.place === 'grey' ? 'not rebalanceable' : i.place})${i.holding?.priceSource === 'self' ? ' self-declared' : ''}`).join('; ')}`)
  if (b.unpriced.length) lines.push(`- No price yet, left out for now: ${b.unpriced.map(h => h.name).join(', ')}`)
  if (b.target) {
    const t = b.target
    lines.push(`- Target by the MoonSafe framework at age ${b.age}${b.ageIsDefault ? ' (DEFAULT age 30: the user declined; say the split is an estimate)' : ''}: ${TARGET_GROUPS.map(g => `${GROUP_LABEL[g]} ${pct(t[g])}`).join(', ')}; crypto ${pct(t.btc + t.large_cap + t.altcoin)}`)
  } else lines.push('- Target: AGE UNKNOWN. Ask the age before talking about any share.')
  if (!b.declared) lines.push('- Only the app wallet is known: the user has not said what else they hold. If they ask how to split or invest: suggest NO split and NO purchase from the wallet, turn NO percentage into an amount; ask about the next item of the collection flow instead.')
  else if (b.suggest) {
    const s = b.suggest
    const to = TARGET_GROUPS.filter(g => s.to[g] >= 0.01).map(g => `${GROUP_LABEL[g]} ${show(s.to[g])}${g === 'safe' ? " (their OWN bank savings or flexible earn such as Binance Simple Earn Flexible; nothing to do in the app)" : g === 'btc' ? ' (the only part buyable in the app, as cirBTC)' : ' (bought outside the app)'}`)
    lines.push(`- Suggested use of idle money ${show(s.idle)}: keep ${show(s.keep)} for daily spending${s.toFund > 0.01 ? `; emergency fund ${show(s.toFund)}` : ''}${s.toDebt > 0.01 ? `; priority debt ${show(s.toDebt)}` : ''}${to.length ? `; ${to.join('; ')}` : ''}${!to.length && s.toFund < 0.01 && s.toDebt < 0.01 ? '; nothing to place' : ''}`)
  }
  lines.push(`- Buy lock: ${b.lock.open ? 'cirBTC buying is OPEN' : `LOCKED. ${b.lock.text}`}`)
  if (surplusDca && b.lock.open && cf.surplus !== null && cf.surplus > 0) lines.push(`- DCA suggestion: ${show(cf.surplus * param('dca_share_of_surplus'))} a month into cirBTC (50% of the surplus; the user adjusts)`)
  return { text: `ASSET & FUND FIGURES (computed by the server at live prices; quote them VERBATIM, never add, subtract, multiply, divide or convert):\n${lines.join('\n')}`, floors, cover }
}

// ---- Collection flow (spec 10): the next topic not known and not asked yet ------------------
const TOPICS: { key: string; ask: string; asked: RegExp; known: (p: FinancialProfile) => boolean }[] = [
  { key: 'age', ask: 'How old are you? The MoonSafe split depends on it.', asked: /how old|your age|bao nhiêu tuổi/i, known: p => p.age !== null || p.ageDeclined }, // lang-ok
  { key: 'income', ask: 'Roughly how much do you earn a month, and from what?', asked: /(earn|income|salary)[^.?!\n]{0,40}\?|thu nhập[^.?!\n]{0,40}\?/i, known: p => p.incomes.length > 0 }, // lang-ok
  { key: 'spending', ask: 'Roughly how much do you spend a month?', asked: /spend[^.?!\n]{0,40}\?|chi tiêu[^.?!\n]{0,40}\?/i, known: p => p.expenses.length > 0 }, // lang-ok
  { key: 'stability', ask: 'Is your income stable, and does anyone rely on it?', asked: /(stable|steady|rely|depend)[^.?!\n]{0,60}\?|(ổn định|phụ thuộc)[^.?!\n]{0,60}\?/i, known: p => p.incomeStable !== null && p.dependents !== null }, // lang-ok
  { key: 'bank', ask: 'How much do you keep in the bank (savings or checking)?', asked: /bank[^.?!\n]{0,60}\?|ngân hàng[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['savings', 'term_deposit', 'checking', 'cash'].includes(h.type)) }, // lang-ok
  { key: 'stables', ask: 'Any USDC / USDT on exchanges or in other wallets?', asked: /(stablecoin|USDT|USDC on|exchange)[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['stable_wallet', 'flexible_earn', 'locked_earn', 'defi_stable'].includes(h.type)) },
  { key: 'crypto', ask: 'Which coins do you hold (BTC, ETH, others), and how much?', asked: /(coins?|crypto|BTC|ETH)[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['btc', 'eth', 'top10', 'altcoin', 'staked_large_cap', 'nft'].includes(h.type)) },
  { key: 'traditional', ask: 'Do you hold any gold or stocks?', asked: /(gold|stocks?|ETF|vàng|cổ phiếu)[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['gold_physical', 'gold_token', 'us_stock', 'vn_stock', 'fund_bond'].includes(h.type)) }, // lang-ok
  { key: 'property', ask: 'Do you own a home, land or a car?', asked: /(home|house|property|land|car|nhà|đất|xe)[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['home', 'car', 'rental_property'].includes(h.type)) }, // lang-ok
  { key: 'lending', ask: 'Have you lent money to anyone, or put money into a business?', asked: /(lent|lend|business|cho vay|góp vốn|kinh doanh)[^.?!\n]{0,60}\?/i, known: p => p.holdings.some(h => ['loan_given', 'business_stake'].includes(h.type)) }, // lang-ok
  { key: 'debt', ask: `Do you have any debt? (credit card, loans… then, last: "${KB.collection.last_debt_question}")`, asked: /$^/, known: p => p.debtsComplete },
]
const ASSET_TOPICS = new Set(['bank', 'stables', 'crypto', 'traditional', 'property', 'lending'])

const OWED_Q = /still owe|còn nợ bao nhiêu/i // lang-ok
const INTEREST_Q = /interest|lãi/i // lang-ok

function nextQuestion(p: FinancialProfile, assistantTexts: string[], userTexts: string[], userSaidNothingElse: boolean, vi: boolean): string | null {
  const questions = assistantTexts.flatMap(t => t.split(/(?<=[.!?])\s+/).filter(s => s.trim().endsWith('?')))
  // They mentioned paying a debt but it is not recorded: ask about it once, before the asset questions.
  const knownSoFar = p.incomes.length > 0 && p.expenses.length > 0
  if (knownSoFar && !p.debts.length && !p.debtsComplete && userTexts.some(t => DEBT_WORD.test(t) || /repay|pay (it )?back|trả nợ/i.test(t)) && !questions.some(q => OWED_Q.test(q))) // lang-ok
    return 'You mentioned paying back a debt: how much do you still owe, and to whom?'
  // A debt without its rate keeps cirBTC buying locked (allocation.ts debtIsPriority): ask it right away, once per debt.
  const untold = p.debts.find(d => (d.ratePct === null || d.type === 'unknown') && d.type !== 'family_no_interest' && !questions.some(q => INTEREST_Q.test(q) && q.includes(d.name)))
  if (untold) return `Does "${untold.name}" charge you any interest? If yes, roughly how much a year?`
  // The last debt question is asked once; asked again it reads like the agent was not listening (real chat 2026-10-26).
  const lastDebtAsked = questions.some(q => q.includes(KB.collection.last_debt_question.slice(0, 40)) || q.includes(VI_DEBT_Q.slice(0, 30)))
  for (const t of TOPICS) {
    if (t.key === 'debt' && p.debts.length && lastDebtAsked) continue
    if (t.known(p)) continue
    if (t.key === 'age' && p.ageDeclined) continue
    if (ASSET_TOPICS.has(t.key) && (userSaidNothingElse || questions.some(q => t.asked.test(q)))) continue
    // A question they ignored is not asked again.
    if (t.key !== 'debt' && questions.some(q => t.asked.test(q))) continue
    if (t.key === 'debt') return p.debts.length ? `The debt checklist's LAST question, word for word: "${vi ? VI_DEBT_Q : KB.collection.last_debt_question}"` : `Do you have any debt (credit card, loans)?`
    return t.ask
  }
  return null
}

// once-only patterns already used in this chat, read from the agent's own earlier replies.
const ONCE_SEEN: Record<string, RegExp> = {
  altcoin_heavy: CAUTION_ALT,
  defi_stable: /smart[- ]contract/i,
  lock_open_surplus: /\bDCA\b/i,
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const apiKey = context.env.OPENAI_API_KEY
  if (!apiKey) return json({ error: 'The agent has no AI key configured' }, 503)
  // Signed-in users only, so nobody else can spend the OpenAI credit.
  if (!await privyUserId(context.request, context.env)) return json({ error: 'Please sign in again' }, 401)

  let body: RequestBody
  try {
    body = await context.request.json() as RequestBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-30)
  const ctx = (body.context ?? {}) as Record<string, unknown>
  const rate = await vndPerUsd()
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null
  const wallet = num(ctx.walletUsdc), vault = num(ctx.vaultUsdc), cir = num(ctx.cirBtcUsdc) ?? 0
  const startProfile = normalizeProfile((ctx.profile && typeof ctx.profile === 'object' ? ctx.profile : null) as Record<string, unknown> | null)
  let profile = startProfile
  const ops: ProfileOp[] = []
  const readback: string[] = []
  let dcaStop = false
  const actions: Array<Record<string, unknown>> = []
  const done: string[] = []

  const lastUserText = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
  const lastUserAt = messages.map(m => m.role).lastIndexOf('user')
  const prevAssistantText = [...messages.slice(0, lastUserAt)].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const prevUserText = [...messages.slice(0, lastUserAt)].reverse().find(m => m.role === 'user')?.content ?? ''
  const assistantTexts = messages.filter(m => m.role === 'assistant').map(m => m.content)
  const vi = VI_LETTERS.test(lastUserText)
  const said = numbersIn(lastUserText)
  const saidBefore = numbersIn(prevUserText)
  const vnClauses = lastUserText.split(/[.;\n]|,(?!\d)|\band\b/i).filter(c => VN_MARKET.test(c))
  const userSaidNothingElse = messages.some(m => m.role === 'user' && NOTHING_ELSE.test(m.content))
  /** A number the user said (within 1%, or ×1000 for "3k"); 0 only when they said none / sold. */
  const stated = (q: unknown, pool = said) => typeof q === 'number' && (q === 0 ? SAYS_NONE.test(lastUserText) || SOLD.test(lastUserText) : pool.some(n => n > 0 && (Math.abs(n - q) / n <= 0.01 || Math.abs(n * 1000 - q) / (n * 1000) <= 0.01 || Math.abs(n * 1e6 - q) / (n * 1e6) <= 0.01)))

  // Live prices for everything market-priced (functions/api/prices.ts, cached 10 min).
  let prices: Prices | null = null
  const loadPrices = async (p: FinancialProfile, extra: { kind: 'stock' | 'crypto'; sym: string }[] = []) => {
    const market = p.holdings.filter(h => h.priceSource === 'market' && h.quantity !== undefined)
    const syms = (k: 'stock' | 'crypto') => [...market.filter(h => priceKindOf(h.type) === k).map(symbolOf).filter((s): s is string => !!s), ...extra.filter(e => e.kind === k).map(e => e.sym)]
    if (!market.length && !extra.length) return prices
    prices = await getPrices(syms('stock'), syms('crypto'))
    return prices
  }
  const balanceOf = async (p: FinancialProfile) => computeBalance({ profile: p, walletUsd: wallet, vaultUsd: vault, cirBtcUsd: cir, prices: await loadPrices(p), vndPerUsd: rate })
  const startBalance = await balanceOf(profile)
  const investUnlocked = startBalance.lock.open
  const wantsInvestLocked = !investUnlocked && INVEST_INTENT.test(lastUserText) && !NOT_INVESTING.test(lastUserText) && !ASKS_WHY.test(lastUserText) && !DEPOSIT_WORD.test(lastUserText)
  const paymentNums = [...lastUserText.matchAll(PAYMENT_NUM)].flatMap(m => readings(m[1]))
  const startFacts = computeFacts({ balance: startBalance, profile, prices, vndPerUsd: rate, message: lastUserText })
  // "I want 50% in BTC": that share of liquid assets in USDC, so neither the card nor the reply computes it.
  const wishPct = Number(lastUserText.match(/(?<!\d)(\d{1,3})\s*%/)?.[1] ?? NaN)
  const wishGroup = !(wishPct > 0 && wishPct <= 100) ? null : startFacts.intent_all_in_alt || /alt|meme|low[- ]?cap|small[- ]?cap/i.test(lastUserText) ? 'low caps' : /btc|bitcoin|cirbtc/i.test(lastUserText) ? 'BTC' : null
  const wishLine = wishGroup ? `\n- Their wish: ${wishPct}% of liquid assets in ${wishGroup} = ${usdc(startBalance.liquid * wishPct / 100)}${wishGroup === 'low caps' ? ' (bought outside the app; never offer a card for it)' : `; fine by Web3 thinking, respect it. A cirBTC card can use at most the app wallet: ${usdc(Math.max(0, Math.floor((wallet ?? 0) - GAS_RESERVE_USDC)))} now; the rest comes from their other money, moved to the wallet first`}` : ''

  // The same item recorded twice in one turn is read back once, with its last value ("600…, 400…", real chat 2026-10-26).
  const readbackOf = new Map<string, number>()
  const record = (op: ProfileOp, text: string, key?: string) => {
    ops.push(op)
    profile = applyOps(profile, [op])
    const at = key !== undefined ? readbackOf.get(key) : undefined
    if (at !== undefined) readback[at] = text
    else {
      if (key !== undefined) readbackOf.set(key, readback.length)
      readback.push(text)
    }
  }
  const describe = (h: Holding) => `${h.name} ${h.quantity !== undefined && h.priceSource === 'market' ? `${qty(h.quantity)}${h.unit ? ` ${h.unit}` : ''}` : h.value !== undefined ? moneyText({ amount: h.value, currency: h.currency ?? 'USDC' }) : ''}`.trim()

  /** A holding from add_holding arguments, valued as the spec says (spec 12: value of a market-priced item → quantity at the live price). */
  const buildHolding = async (a: Record<string, unknown>): Promise<Holding | string> => {
    let type = String(a.type) as AssetType
    if (!isAssetType(type)) return `Not recorded: unknown type ${type}.`
    let sym = typeof a.symbol === 'string' && a.symbol.trim() ? a.symbol.trim().toUpperCase() : undefined
    // The model's type corrected by the symbol (spec 3): BTC is btc, ETH eth, top-10 coins large caps, stablecoins not coins.
    if (sym && ['altcoin', 'top10', 'eth', 'btc'].includes(type)) {
      if (STABLECOINS.has(sym)) type = 'stable_wallet'
      else if (BTC_SYMBOLS.has(sym)) type = 'btc'
      else if (sym === 'ETH') type = 'eth'
      else if (TOP10_SYMBOLS.has(sym)) type = 'top10'
      else if (type !== 'altcoin') type = 'altcoin'
    }
    if (type === 'btc') sym ??= 'BTC'
    if (type === 'eth') sym ??= 'ETH'
    // "$1000 on exchange" became 1,000 coins of an unnamed top-10 coin (real chat 2026-10-26).
    if ((type === 'top10' || type === 'altcoin' || type === 'staked_large_cap') && !sym) return 'Not recorded: no coin was named. Dollars with no coin named are stable_wallet; otherwise ask which coin.'
    const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : sym ?? KB.asset_types.find(t => t.key === type)!.label
    const worth = moneyArg(a.worth)
    let quantity = typeof a.quantity === 'number' && a.quantity >= 0 ? a.quantity : undefined
    // "$2000 of gold" read as 2,000 oz (real chat 2026-10-24): a quantity equal to a money amount in the message is a worth.
    const moneySaid = amountsUsd(lastUserText, rate)
    const asWorth = !worth && quantity !== undefined && moneySaid.some(m => Math.abs(m - quantity!) <= m * 0.01) && /\$|usd|dollar|vnd|triệu|đô|worth|trị giá/i.test(lastUserText) // lang-ok
    const w = worth ?? (asWorth ? { amount: quantity!, currency: 'USDC' as Currency } : null)
    if (asWorth) quantity = undefined
    // Vietnamese stocks are not price-tracked.
    if (type === 'us_stock' && (vnClauses.some(c => sym && c.toUpperCase().includes(sym)) || (!sym && vnClauses.length))) type = 'vn_stock'
    const kind = priceKindOf(type)
    const category = type === 'other' && ['safe', 'invest', 'idle', 'lifestyle'].includes(String(a.category)) ? a.category as Holding['category'] : undefined
    const base = { id: newId('h'), type, name, ...(sym && kind !== 'self' ? { symbol: sym } : {}), ...(typeof a.where === 'string' && a.where.trim() ? { where: a.where.trim() } : {}), updatedAt: Date.now(), rebalanceable: defaultRebalanceable(type, category), ...(category ? { category } : {}), ...(a.loan_status === 'on_time' || a.loan_status === 'overdue' ? { loanStatus: a.loan_status as Holding['loanStatus'] } : {}) }
    if (kind === 'stable') {
      const amount = w ?? (quantity !== undefined ? { amount: quantity, currency: 'USDC' as Currency } : null)
      if (!amount || !stated(amount.amount)) return 'Not recorded: the amount is not in the user\'s words.'
      // "2300$ in this wallet" is the app wallet, already read onchain: recording it counted it twice (real chat 2026-10-26).
      const usd = toUsd(amount.amount, amount.currency, rate)
      if (wallet !== null && usd !== null && APP_WALLET.test(lastUserText) && Math.abs(usd - wallet) <= Math.max(1, wallet * 0.05)) return 'Not recorded: that is the app wallet, which the app reads onchain by itself.'
      return { ...base, value: amount.amount, currency: amount.currency, priceSource: 'market' }
    }
    // A home or a motorbike "worth 0" (real chat 2026-10-26): an owned thing needs its value.
    if (w && w.amount === 0) return `Not recorded: ${name} needs what it is worth; ask the value.`
    if (kind === 'self') {
      const amount = w
      if (!amount) return `Not recorded: ${name} needs what it is worth; ask the value (it will be self-declared).`
      if (!stated(amount.amount)) return 'Not recorded: the value is not in the user\'s words.'
      return { ...base, value: amount.amount, currency: amount.currency, priceSource: 'self' }
    }
    // Market-priced: gold units → troy ounces; a worth → quantity at the live price.
    if (quantity !== undefined) {
      if (!stated(quantity)) return 'Not recorded: the quantity is not in the user\'s words.'
      if (kind === 'gold') return { ...base, quantity: quantity * (GOLD_UNITS_TO_OZ[String(a.unit ?? 'oz')] ?? 1), unit: 'oz', priceSource: 'market' }
      return { ...base, quantity, unit: kind === 'stock' ? 'shares' : 'coins', priceSource: 'market' }
    }
    if (!w) return `Not recorded: ask how much ${name} they hold (or what it is worth).`
    if (!stated(w.amount)) return 'Not recorded: the value is not in the user\'s words.'
    const pr = kind === 'gold' ? await getPrices([], []) : await getPrices(kind === 'stock' && sym ? [sym] : [], kind === 'crypto' && sym ? [sym] : [])
    const price = kind === 'gold' ? pr.goldUsdPerOz : sym ? pr.usd[`${kind}:${sym}`] : undefined
    const usd = toUsd(w.amount, w.currency, rate)
    // No live price (spec 12): the user's value is the truth, labelled self-declared.
    if (!price || usd === null) return { ...base, value: w.amount, currency: w.currency, priceSource: 'self' }
    return { ...base, quantity: usd / price, unit: kind === 'gold' ? 'oz' : kind === 'stock' ? 'shares' : 'coins', priceSource: 'market' }
  }

  // One tool call → its result for the next PLAN step.
  const handle = async (call: ToolCall): Promise<string> => {
    let a: Record<string, unknown> = {}
    try { a = JSON.parse(call.function.arguments || '{}') as Record<string, unknown> } catch { return 'Could not read the arguments.' }
    const name = call.function.name
    const before = done.length
    const findH = (id: unknown) => profile.holdings.find(h => h.id === id)
    const findD = (id: unknown) => profile.debts.find(d => d.id === id)
    // "I just put X into safe" without a source: ask first (spec 10).
    if ((name === 'add_holding' || name === 'move') && startFacts.intent_added_to_safe) {
      return 'Not done: they did not say where the money came from. Record nothing; the agent asks "where did it come from?" first.'
    }
    // The app wallet is read onchain: "2300$ in this wallet" reached the profile through add, set and move (real chats 2026-10-26).
    if ((name === 'add_holding' || name === 'set_holding' || name === 'move') && wallet !== null && APP_WALLET.test(lastUserText)) {
      const amts = [moneyArg(a.worth), moneyArg(a.amount), typeof a.quantity === 'number' ? { amount: a.quantity, currency: 'USDC' as Currency } : null]
      if (amts.some(m => m && Math.abs((toUsd(m.amount, m.currency, rate) ?? -1) - wallet) <= Math.max(1, wallet * 0.05))) return 'Not recorded: that is the app wallet, which the app reads onchain by itself.'
    }

    if (name === 'update_profile') {
      const f: Record<string, unknown> = {}
      if (typeof a.age === 'number' && a.age >= 10 && a.age <= 120 && stated(a.age) && a.age !== profile.age) f.age = Math.round(a.age)
      if (a.age_declined === true && !profile.ageDeclined && profile.age === null && (DECLINES.test(lastUserText) || AGE_WORD.test(prevAssistantText))) f.ageDeclined = true
      // An answer about something else ("I bring it all onchain") once became "income stable" (real chat 2026-10-26): it needs a yes / no or a stability word.
      if (typeof a.income_stable === 'boolean' && a.income_stable !== profile.incomeStable && (STABILITY_WORDS.test(lastUserText) || (ASKS_STABLE.test(prevAssistantText) && YES_NO.test(lastUserText)))) f.incomeStable = a.income_stable
      if (typeof a.dependents === 'number' && a.dependents >= 0 && a.dependents !== profile.dependents && (a.dependents === 0 ? SAYS_NONE.test(lastUserText) : stated(a.dependents) || DEPENDENT_WORDS.test(lastUserText))) f.dependents = Math.round(a.dependents)
      if (typeof a.sole_earner === 'boolean' && a.sole_earner !== profile.soleEarner) f.soleEarner = a.sole_earner
      if (a.debts_complete === true && !profile.debtsComplete && SAYS_NONE.test(lastUserText)) f.debtsComplete = true
      if (!Object.keys(f).length) { console.log(`dropped update_profile ${call.function.arguments}: not stated or unchanged`); return 'Nothing changed (not stated in the latest message, or already known).' }
      const words = [f.age !== undefined && `age ${f.age}`, f.ageDeclined && 'age not given (default 30)', f.incomeStable !== undefined && `income ${f.incomeStable ? 'stable' : 'irregular'}`,
        f.dependents !== undefined && `${f.dependents} dependent${f.dependents === 1 ? '' : 's'}`, f.soleEarner !== undefined && (f.soleEarner ? 'sole earner' : 'not the sole earner'), f.debtsComplete && 'no other debt'].filter(Boolean)
      record({ op: 'update_profile', fields: f }, words.join(', '))
      done.push(`Recorded: ${words.join(', ')}.`)
    } else if (name === 'add_holding') {
      const h = await buildHolding(a)
      if (typeof h === 'string') { console.log(`dropped add_holding ${call.function.arguments}: ${h}`); return h }
      // The same item again (type + symbol + place) replaces it instead of doubling it.
      const same = profile.holdings.find(x => x.type === h.type && (x.symbol ?? '') === (h.symbol ?? '') && (x.where ?? '').toLowerCase() === (h.where ?? '').toLowerCase() && (h.symbol || x.name.toLowerCase() === h.name.toLowerCase()))
      if (same) record({ op: 'set_holding', id: same.id, patch: { quantity: h.quantity, value: h.value, currency: h.currency, unit: h.unit, priceSource: h.priceSource } }, describe({ ...same, ...h }), same.id)
      else record({ op: 'add_holding', holding: h }, describe(h), h.id)
      done.push(`Recorded ${describe(h)}${h.priceSource === 'self' ? ' (self-declared)' : ''}.`)
    } else if (name === 'set_holding') {
      const h = findH(a.id)
      if (!h) return `No item with id ${String(a.id)}.`
      const w = moneyArg(a.worth)
      const patch: Partial<Holding> = {}
      if (typeof a.quantity === 'number' && stated(a.quantity)) {
        if (h.quantity !== undefined && h.priceSource === 'market') patch.quantity = a.quantity
        else patch.value = a.quantity
      }
      if (w && stated(w.amount)) {
        if (h.priceSource === 'self' || priceKindOf(h.type) === 'self' || priceKindOf(h.type) === 'stable') { patch.value = w.amount; patch.currency = w.currency }
        else {
          // A value for a coin without a price (spec 12): accepted as self-declared.
          const usd = toUsd(w.amount, w.currency, rate)
          const key = priceKey(h)
          const price = priceKindOf(h.type) === 'gold' ? prices?.goldUsdPerOz : key ? prices?.usd[key] : undefined
          if (price && usd !== null) patch.quantity = usd / price
          else { patch.value = w.amount; patch.currency = w.currency; patch.priceSource = 'self' }
        }
      }
      if (a.loan_status === 'on_time' || a.loan_status === 'overdue') patch.loanStatus = a.loan_status
      // Same way of pricing only (a bank balance → savings), so the stored amount keeps its meaning.
      const byValue = (t: AssetType) => priceKindOf(t) === 'self' || priceKindOf(t) === 'stable'
      if (isAssetType(a.type) && a.type !== h.type && (priceKindOf(a.type) === priceKindOf(h.type) || (byValue(a.type) && byValue(h.type) && h.value !== undefined))) {
        if (priceKindOf(a.type) !== priceKindOf(h.type)) patch.priceSource = priceKindOf(a.type) === 'self' ? 'self' : 'market'
        patch.type = a.type
        patch.name = KB.asset_types.find(t => t.key === a.type)!.label
        patch.rebalanceable = defaultRebalanceable(a.type)
      }
      if (!Object.keys(patch).length) return 'Not changed: the new amount is not in the user\'s words.'
      record({ op: 'set_holding', id: h.id, patch }, describe({ ...h, ...patch }))
      done.push(`Updated ${describe({ ...h, ...patch })}.`)
    } else if (name === 'remove_holding') {
      const h = findH(a.id)
      if (!h) return `No item with id ${String(a.id)}.`
      if (!SOLD.test(lastUserText) && !SAYS_NONE.test(lastUserText)) return 'Not removed: the user did not say it is gone.'
      record({ op: 'remove_holding', id: h.id }, `${h.name} removed`)
      done.push(`Removed ${h.name}.`)
    } else if (name === 'move') {
      const m = moneyArg(a.amount)
      // The amount of the previous message only counts when the agent just asked where that money came from;
      // otherwise "only 2300$ in this wallet" was moved into a stablecoin item one turn later (real chat 2026-10-26).
      const answersWhere = /where did|came from|come from|từ đâu/i.test(prevAssistantText) // lang-ok
      if (!m || !(stated(m.amount) || (answersWhere && stated(m.amount, saidBefore)))) return 'Not done: the amount is not in the user\'s words.'
      const usd = toUsd(m.amount, m.currency, rate)
      // Source: a listed item is reduced; the app wallet changes onchain by itself; "idle" = the one idle item if there is one.
      const idle = profile.holdings.filter(h => categoryOf(h) === 'idle')
      const src = a.from === 'wallet' ? null : findH(a.from) ?? (a.from === 'idle' && idle.length === 1 ? idle[0] : null)
      // "Bank account −1,000, Bank account +1,000" (real chat 2026-10-26): a move needs two different places,
      // and an item recorded this turn already holds what was said.
      if (src && a.to_id === src.id) return 'Not done: from and to are the same item. To change what kind of item it is, use set_holding with type.'
      if (a.to_id && ops.some(o => o.op === 'add_holding' && o.holding.id === a.to_id)) return 'Not done: that item was just recorded with this amount.'
      if (src) {
        if (src.quantity === undefined || src.priceSource === 'self') {
          const inSrc = src.currency === m.currency ? m.amount : src.currency === 'VND' ? (usd !== null && rate ? usd * rate : null) : usd
          if (inSrc !== null && src.value !== undefined) record({ op: 'set_holding', id: src.id, patch: { value: Math.max(0, src.value - inSrc) } }, `${src.name} −${moneyText(m)}`)
        } else {
          const key = priceKey(src)
          const price = priceKindOf(src.type) === 'gold' ? prices?.goldUsdPerOz : key ? prices?.usd[key] : undefined
          if (price && usd !== null) record({ op: 'set_holding', id: src.id, patch: { quantity: Math.max(0, src.quantity! - usd / price) } }, `${src.name} −${moneyText(m)}`)
        }
      }
      const dest = findH(a.to_id)
      if (dest && dest.value !== undefined && (dest.priceSource === 'self' || priceKindOf(dest.type) === 'stable')) {
        const add = dest.currency === m.currency ? m.amount : dest.currency === 'VND' ? (usd !== null && rate ? usd * rate : null) : usd
        if (add !== null) record({ op: 'set_holding', id: dest.id, patch: { value: dest.value + add } }, `${dest.name} +${moneyText(m)}`)
      } else {
        const type = isAssetType(a.to_type) ? a.to_type : 'savings'
        const existing = profile.holdings.find(h => h.type === type && h.value !== undefined && (priceKindOf(type) === 'self' || priceKindOf(type) === 'stable'))
        if (existing) record({ op: 'set_holding', id: existing.id, patch: { value: existing.value! + (existing.currency === m.currency ? m.amount : existing.currency === 'VND' ? (usd ?? 0) * (rate ?? 0) : usd ?? 0) } }, `${existing.name} +${moneyText(m)}`)
        else if (priceKindOf(type) === 'self' || priceKindOf(type) === 'stable') {
          const h: Holding = { id: newId('h'), type, name: typeof a.to_name === 'string' && a.to_name.trim() ? a.to_name.trim() : KB.asset_types.find(t => t.key === type)!.label, value: m.amount, currency: m.currency, updatedAt: Date.now(), priceSource: priceKindOf(type) === 'self' ? 'self' : 'market', rebalanceable: defaultRebalanceable(type) }
          record({ op: 'add_holding', holding: h }, describe(h))
        } else return 'Not done: move only goes into savings / cash / stablecoin places; for coins or stocks use add_holding with the quantity.'
      }
      done.push(`Moved ${moneyText(m)}${a.from === 'wallet' ? ' from the app wallet' : src ? ` from ${src.name}` : ''}.`)
    } else if (name === 'add_debt') {
      const bal = moneyArg(a.balance)
      if (!bal || !stated(bal.amount)) return 'Not recorded: the balance is not in the user\'s words.'
      const payArg = moneyArg(a.monthly_payment)
      if ((payArg && payArg.amount === bal.amount) || paymentNums.some(n => n > 0 && Math.abs(n - bal.amount) <= n * 0.01)) {
        console.log(`dropped add_debt ${call.function.arguments}: the number is a payment, not the total owed`)
        return 'Not recorded: that number is what they pay, not the total owed. Record no debt; the agent asks how much is still owed and to whom.'
      }
      const type = DEBT_TYPES.includes(a.type as DebtType) ? a.type as DebtType : 'unknown'
      const rateArg = typeof a.rate_pct === 'number' && a.rate_pct >= 0 && (a.rate_pct === 0 ? SAYS_NONE.test(lastUserText) || NO_INTEREST.test(lastUserText) || type === 'family_no_interest' : stated(a.rate_pct)) ? a.rate_pct : null // lang-ok
      const pay = moneyArg(a.monthly_payment)
      const d: Debt = {
        id: newId('d'), name: typeof a.name === 'string' && a.name.trim() ? a.name.trim() : 'Debt', type, balance: bal.amount, currency: bal.currency,
        ratePct: type === 'family_no_interest' ? 0 : rateArg, monthlyPayment: pay && stated(pay.amount) ? pay.amount : null, updatedAt: Date.now(),
        ...(typeof a.lender === 'string' && a.lender.trim() ? { lender: a.lender.trim() } : {}),
        ...(a.term === 'short' || a.term === 'long' ? { term: a.term } : {}),
        ...(typeof a.required === 'boolean' ? { required: a.required } : {}),
      }
      // An unknown debt with the same balance or the same monthly payment is this one, now told in full.
      const same = profile.debts.find(x => x.type === d.type && x.name.toLowerCase() === d.name.toLowerCase())
        ?? profile.debts.find(x => x.type === 'unknown' && (Math.abs(x.balance - d.balance) <= x.balance * 0.01 || (x.monthlyPayment !== null && x.monthlyPayment === d.monthlyPayment)))
      const text = `${d.name} ${moneyText(bal)}${d.ratePct !== null ? ` at ${d.ratePct}%` : ''}${d.monthlyPayment !== null ? `, ${moneyText({ amount: d.monthlyPayment, currency: d.currency })} a month` : ''}`
      const { id: _id, ...fields } = d
      if (same) record({ op: 'update_debt', id: same.id, patch: fields }, text, same.id)
      else record({ op: 'add_debt', debt: d }, text, d.id)
      done.push(`Recorded debt: ${text}.`)
    } else if (name === 'update_debt') {
      const d = findD(a.id)
      if (!d) return `No debt with id ${String(a.id)}.`
      const patch: Partial<Debt> = {}
      if (DEBT_TYPES.includes(a.type as DebtType) && a.type !== d.type) patch.type = a.type as DebtType
      const bal = moneyArg(a.balance)
      if (bal && stated(bal.amount)) { patch.balance = bal.amount; patch.currency = bal.currency }
      if (typeof a.rate_pct === 'number' && (a.rate_pct === 0 ? SAYS_NONE.test(lastUserText) || NO_INTEREST.test(lastUserText) : stated(a.rate_pct))) patch.ratePct = a.rate_pct // lang-ok
      const pay = moneyArg(a.monthly_payment)
      if (pay && stated(pay.amount)) patch.monthlyPayment = pay.amount
      if (typeof a.lender === 'string' && a.lender.trim()) patch.lender = a.lender.trim()
      if (typeof a.required === 'boolean') patch.required = a.required
      if ((patch.type ?? d.type) === 'family_no_interest') patch.ratePct = 0
      // Same values again read back as "Noted: Loan from Mom: ratePct 0" (real chat 2026-10-26).
      for (const k of Object.keys(patch) as (keyof Debt)[]) if (patch[k] === d[k]) delete patch[k]
      if (!Object.keys(patch).length) return 'Not changed: nothing new in the user\'s words.'
      record({ op: 'update_debt', id: d.id, patch }, `${d.name}: ${Object.entries(patch).map(([k, v]) => `${k} ${v}`).join(', ')}`)
      done.push(`Updated debt ${d.name}.`)
    } else if (name === 'remove_debt') {
      const d = findD(a.id)
      if (!d) return `No debt with id ${String(a.id)}.`
      if (!SOLD.test(lastUserText) && !SAYS_NONE.test(lastUserText)) return 'Not removed: the user did not say it is paid off.'
      record({ op: 'remove_debt', id: d.id }, `${d.name} paid off`)
      done.push(`Removed debt ${d.name}.`)
    } else if (name === 'set_income' || name === 'set_expense') {
      const m = moneyArg(a.monthly)
      if (!m || !stated(m.amount)) return 'Not recorded: the amount is not in the user\'s words.'
      const isIncome = name === 'set_income'
      // "I have to pay my mom 200$ a month" became a spending line next to the same debt payment (real chat 2026-10-26).
      if (!isIncome && (DEBT_PAY_NAME.test(String(a.name ?? '')) || profile.debts.some(d => d.monthlyPayment !== null && Math.abs(d.monthlyPayment - m.amount) <= 0.01 && d.currency === m.currency))) {
        return 'Not recorded: a debt payment belongs on the debt (update_debt monthly_payment), never as spending; it already counts in spending.'
      }
      const kinds =isIncome ? ['active', 'passive', 'irregular'] : ['fixed', 'variable']
      const kind = kinds.includes(String(a.kind)) ? String(a.kind) : kinds[0]
      const nm = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : isIncome ? 'Income' : 'Monthly spending'
      const listItems: (Income | Expense)[] = isIncome ? profile.incomes : profile.expenses
      // Same id, else the same name, else a single migrated v1 line ("Income" / "Spending") is the one being corrected.
      const old = listItems.find(x => x.id === a.id) ?? listItems.find(x => x.name.toLowerCase() === nm.toLowerCase())
        ?? (listItems.length === 1 && ['income', 'spending', 'monthly spending'].includes(listItems[0].name.toLowerCase()) && listItems[0].kind === kind ? listItems[0] : undefined)
      // Told again with the same number ("2 sources bring me 600 a month"): nothing to record or read back.
      if (old && old.monthly === m.amount && old.currency === m.currency && old.kind === kind && !ops.some(o => (o.op === 'set_income' && o.income.id === old.id) || (o.op === 'set_expense' && o.expense.id === old.id))) return 'Already recorded with this amount, nothing changed.'
      const item = { id: old?.id ?? newId(isIncome ? 'i' : 'e'), name: old && ['income', 'spending'].includes(old.name.toLowerCase()) ? nm : old?.name ?? nm, monthly: m.amount, currency: m.currency, kind, updatedAt: Date.now() }
      const text = `${item.name} ${moneyText(m)} a month (${kind})`
      if (isIncome) record({ op: 'set_income', income: item as Income }, text, item.id)
      else record({ op: 'set_expense', expense: item as Expense }, text, item.id)
      done.push(`Recorded ${isIncome ? 'income' : 'spending'}: ${text}.`)
    } else if (name === 'remove_income' || name === 'remove_expense') {
      const isIncome = name === 'remove_income'
      const x = (isIncome ? profile.incomes : profile.expenses).find(i => i.id === a.id)
      if (!x) return `No ${isIncome ? 'income' : 'spending line'} with id ${String(a.id)}.`
      if (!SOLD.test(lastUserText) && !SAYS_NONE.test(lastUserText) && !/(?<!\p{L})(stopped|quit|lost|ended|no more|không còn|nghỉ|mất)(?!\p{L})/iu.test(lastUserText)) return 'Not removed: the user did not say it ended.' // lang-ok
      record(isIncome ? { op: 'remove_income', id: x.id } : { op: 'remove_expense', id: x.id }, `${x.name} removed`)
      done.push(`Removed ${x.name}.`)
    } else if (name === 'show_allocation' || name === 'show_cashflow') {
      if (!actions.some(x => x.type === name)) actions.push({ type: name })
      done.push(name === 'show_allocation' ? 'The allocation chart is shown (target by the MoonSafe framework vs now) right under this reply.' : 'The cash-flow card (income, spending, surplus, passive / spending) is shown right under this reply.')
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
      if (actions.some(x => x.type === name)) return 'Already shown under the reply, not repeated.'
      // "ok" to a split once turned the safe part (bank savings) into a fund deposit card (real chat 2026-10-24).
      if (name === 'prepare_deposit' && startBalance.fund.met && !FUND_WORD.test(lastUserText) && !DEPOSIT_WORD.test(lastUserText)) {
        console.log('dropped prepare_deposit: fund already full')
        return 'Not done: the emergency fund is already full; nothing to add unless the user asks to.'
      }
      const amt0 = moneyArg(a.amount)
      const amtUsd = amt0 ? toUsd(amt0.amount, amt0.currency, rate) : null
      const toSafe = startBalance.suggest?.to.safe
      if (name === 'prepare_deposit' && !FUND_WORD.test(lastUserText) && amtUsd !== null && toSafe && Math.abs(amtUsd - toSafe) <= toSafe * 0.01 + 1) {
        console.log('dropped prepare_deposit: safe part is bank savings')
        return "Not done: the safe part is the user's own bank savings, nothing to deposit in the app."
      }
      // "ok go ahead" carries no amount: the card must use one the agent offered ("deposit 3,000?" → "ok" once became 3,300).
      if (!/\d/.test(lastUserText) && !ALL_OF_IT.test(lastUserText) && amt0) {
        const offered = numbersIn(prevAssistantText)
        if (!offered.some(n => n > 0 && Math.abs(n - amt0.amount) / n <= 0.01)) {
          console.log(`dropped ${name}: amount ${amt0.amount} not offered`)
          return `Not done: the user named no amount, so use exactly the amount you offered in your last reply, not ${amt0.amount}.`
        }
      }
      // A DCA plan only when the user asked for one or the agent offered one ("ok do it" once set 1,000 USDC a week).
      if (name === 'propose_dca' && !ACTION_VERB.propose_dca.test(lastUserText) && !ACTION_VERB.propose_dca.test(prevAssistantText)) {
        console.log('dropped propose_dca: nobody asked for recurring buys')
        return 'Not done: the user did not ask for recurring buys.'
      }
      // No buy cap (user, 2026-10-25); a purchase nobody sized still waits for the rest of the picture.
      if (INVEST_ACTIONS.has(name) && !/\d/.test(lastUserText) && !startBalance.declared) {
        return 'Not done: only the app wallet is known; ask what else the user holds before suggesting a purchase.'
      }
      if (INVEST_ACTIONS.has(name) && !investUnlocked) {
        done.push(`BLOCKED ${name}: cirBTC buying is locked. ${startBalance.lock.text} Nothing was opened.`)
        return done[done.length - 1]
      }
      // A 7,500 USDC buy card with 2,000 in the wallet (test 2026-10-26): the card spends the app wallet only.
      const canSpend = Math.max(0, Math.floor((wallet ?? 0) - GAS_RESERVE_USDC))
      if (name === 'prepare_buy_cirbtc' && amtUsd !== null && amtUsd > canSpend + 0.5) {
        return `Not done: the app wallet holds ${usdc(canSpend)}; a card can buy at most that now. Offer ${usdc(canSpend)} and say the rest needs money moved to the wallet first.`
      }
      actions.push({ type: name, ...a })
      const amt = amt0 ? moneyText(amt0) : 'an unclear amount'
      done.push(
        name === 'open_screen' ? `Opened the ${SCREEN_NAMES[String(a.screen)] ?? String(a.screen)} screen; the user is looking at it, do NOT list figures, one short sentence.`
        : name === 'propose_dca' ? `Showed a DCA PROPOSAL card for ${amt} every ${String(a.intervalDays ?? 7)} days under this reply. NOT set up yet: the user taps "Approve DCA" on the card, then reviews a quote and signs each round.`
        : name === 'prepare_deposit' ? `Showed a confirmation card to ADD ${amt} to the fund under this reply. NOT deposited yet: the user taps "Sign transaction" on the card and confirms in their wallet.`
        : name === 'prepare_withdraw' ? `Showed a confirmation card to WITHDRAW ${amt} to the wallet under this reply. NOT withdrawn yet: the user taps "Sign transaction" on the card and confirms in their wallet; the money goes to their own wallet.`
        : `Showed a card to BUY ${amt} of cirBTC under this reply. NOT bought yet: the user taps "Get a quote" on the card, checks it, then "Sign purchase". More BTC than the framework is their call and fits the Web3 view: no warning; at most one short mention that the framework is a reference.`)
    }
    return done.length > before ? done.slice(before).join(' ') : 'Nothing changed.'
  }

  // ---- 1. PLAN: tool loop, at most MAX_PLAN_STEPS -------------------------------------
  // Every step must call a tool (tool_choice "required"); it sees each result, plus the fresh
  // listing after something was recorded, and ends with no_action. Repeats are refused.
  const stateText = () => `Profile and app state (real, latest; ids in brackets):\n${listing(profile, startBalance, prices, rate)}`
  const planMessages: Message[] = [{ role: 'system', content: PLAN_PROMPT }, ...messages.slice(-4), { role: 'system', content: `${stateText()}${wishLine}` }]
  const seen = new Set<string>()
  // What the user told but could not be recorded yet (a home without its value, a debt payment without the total owed).
  const toAsk: string[] = []
  let planIn = 0, planOut = 0, planSteps = 0
  for (let step = 1; step <= MAX_PLAN_STEPS; step++) {
    const plan = await openai(apiKey, { model: 'gpt-4o-mini', messages: planMessages, tools: PLAN_TOOLS, tool_choice: 'required', temperature: 0, max_tokens: 500 })
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
          if (/^Not recorded:.*\bask/.test(result)) toAsk.push(result.replace(/^Not recorded: /, ''))
          // "Only 2300$ in this wallet" got an unrelated reply (real chat 2026-10-26): say why nothing was recorded.
          if (result.includes('that is the app wallet') && !done.some(d => d.includes('app wallet'))) done.push('Nothing recorded: the money they mention is the app wallet, which the app already counts (read onchain). Say so in a few words.')
          acted = true
          if (RECORDING.has(call.function.name)) recorded = true
        }
      }
      planMessages.push({ role: 'tool', content: result, tool_call_id: call.id })
    }
    if (!acted) break
    planMessages.push({ role: 'system', content: `${recorded ? `${stateText()}\n` : ''}Anything else the user's latest message asked for or told that is not done yet? If not, call no_action.` })
  }
  console.log(`plan steps=${planSteps} tokens in=${planIn} out=${planOut} ops=${ops.length}`)

  if (wantsInvestLocked && !done.some(d => d.startsWith('BLOCKED'))) {
    done.push(`The user wants to invest but cirBTC buying is LOCKED: what is missing and how much ("${startBalance.lock.text}"), why the lock protects them (no forced selling at a loss if BTC drops when they need cash), then the option they have.`)
  }

  // ---- 2. REPLY ---------------------------------------------------------------------
  const balance = ops.length ? await balanceOf(profile) : startBalance
  const usesVnd = [...profile.incomes, ...profile.expenses, ...profile.debts, ...profile.holdings].some(x => x.currency === 'VND') || vi
  const facts = computeFacts({ balance, profile, prices, vndPerUsd: rate, message: lastUserText, changed: ops.length > 0 })
  const usedOnce = new Set(Object.entries(ONCE_SEEN).filter(([, re]) => assistantTexts.some(t => re.test(t))).map(([id]) => id))
  // A recorded fact is not "missing" any more; recording itself is not a reason to bring up every pattern.
  const matched = matchPatterns(facts, usedOnce)
  const brief = patternBrief(matched, displayFacts(facts))
  const { text: figs, floors, cover } = figures(balance, profile, wallet, cir, rate, usesVnd, !usedOnce.has('lock_open_surplus'))
  const collecting = matched.some(p => p.id === 'collecting' || p.id === 'age_unknown')
  // A question or a doubt from the user is answered first; the collection flow waits a turn.
  const userAsks = QUESTIONS_US.test(lastUserText)
  const next = collecting && !DECLINES.test(lastUserText) && !userAsks && !toAsk.length ? nextQuestion(profile, assistantTexts, messages.filter(m => m.role === 'user').map(m => m.content), userSaidNothingElse, vi) : null

  const replyMessages: Message[] = [
    { role: 'system', content: REPLY_PROMPT },
    ...messages,
    { role: 'system', content: `Actions just taken: ${done.length ? done.join(' | ') : 'none.'}${readback.length ? `\nRead-back to start with (one sentence; then "Right?", or the Next question if one is given): "Noted: ${readback.join(', ')}."` : ''}` },
    { role: 'system', content: `${figs}${wishLine}` },
    { role: 'system', content: `MATCHING SITUATIONS (most important first):\n${brief || '- none'}${next ? `\nNext question (collection flow, one per message): ${next}\nThis is your one question: ask exactly it (same meaning), as a real question ending in "?", not "I need to know…". Before it, one useful point from what is already known (if any); after it, a few words on why it matters for their advice. No "Right?" this turn.` : ''}` },
  ]
  // A read-back's "Right?" is the turn's one question (spec 10), so this waits for the next turn.
  if (toAsk.length && !userAsks && !readback.length) replyMessages.push({ role: 'system', content: `Told but not recorded yet: ${[...new Set(toAsk)].join(' ')} Your one question is about this.` })
  // A big low-cap wish gets the reality check once, as the turn's question (Hieu, 2026-10-26).
  const altCheck = wishGroup === 'low caps' || (startFacts.intent_all_in_alt && !usedOnce.has('altcoin_heavy'))
  if (altCheck && !usedOnce.has('altcoin_heavy')) replyMessages.push({ role: 'system', content: `They want a big share in low caps / memecoins. Once, a vivid reality check as your one question: most low caps end up down 90-99%; would they dare put ${wishGroup ? `${wishPct}% of their assets` : 'that much'} in and watch it shrink to 1%? Then it is their call. No card (the app cannot buy them), no "should".` })
  if (userAsks) replyMessages.push({ role: 'system', content: 'The user is asking or doubting something: answer it first and plainly. If it is about the fund amount, show how it is made from the figures: "Spending per month" (its spending lines + debt payments) × the months = the floor. Do not say they are right unless the figures agree.' })
  if (ASKS_OVERVIEW.test(lastUserText)) replyMessages.push({ role: 'system', content: `Overall check-up, as an advisor: one short point each, in this order: ${balance.debts.priorityCount ? 'their priority debt (start with it), ' : ''}the emergency fund vs its floor, then the split. For each, why it matters for them and one option they could take (an option, not an order). Keep the split to one sentence.` })
  const replyLang = vi ? 'Vietnamese' : 'English'
  replyMessages.push({ role: 'system', content: `Reply language: ${replyLang} (the language of the user's latest message).${vi ? ` ${VI_FLOORS}` : ''}` })
  if (DECLINES.test(lastUserText)) replyMessages.push({ role: 'system', content: 'The user just declined to share. Respect it: this reply asks NOTHING about their personal situation. Use the defaults (age 30 if the age is missing) and say the picture is an estimate; they can share any time.' })

  const grounding = [figs, wishLine, brief, ...done, readback.join(', '), ...messages.filter(m => m.role === 'user').map(m => m.content)]
  const prevAssistant = assistantTexts[assistantTexts.length - 1] ?? ''
  const recordedStable = ops.some(o => o.op === 'update_profile' && o.fields.incomeStable !== undefined)
  let rewrites = 0
  for (let round = 1; round <= 5; round++) {
    // gpt-5.4-mini replies like an advisor (reasons tied to the user's numbers); gpt-4o-mini read as orders (Hieu, 2026-10-27, 3 test rounds).
    // Function tools need reasoning_effort 'none' on chat/completions.
    const reply = await openai(apiKey, { model: REPLY_MODEL, messages: replyMessages, tools: REPLY_TOOLS, tool_choice: round >= 3 ? 'none' : 'auto', max_completion_tokens: 1200, reasoning_effort: 'none' })
    if (reply instanceof Response) return reply
    const msg = reply.choices[0]?.message
    if (reply.usage) console.log(`reply tokens in=${reply.usage.prompt_tokens} out=${reply.usage.completion_tokens} round=${round}`)
    if (!msg?.tool_calls?.length) {
      const content = msg?.content ?? ''
      const plain = content.replace(/ /g, ' ')
      const problems: string[] = []
      if (!actions.length && CLAIMS_ACTION.test(content)) problems.push('no action was taken, the app opened and filled NOTHING: only OFFER (e.g. "Would you like me to prepare a deposit of … for you to sign?"), never say you opened / filled / created / showed anything')
      for (const f of floors) {
        if (f.texts.some(t => plain.includes(t)) && !plain.includes(`${f.months} month`) && !plain.includes(`${f.months} tháng`)) problems.push(`the floor ${f.texts[0]} must be labelled as "${f.months} months of spending"`) // lang-ok
      }
      if ((content.match(/\?/g) ?? []).length > 1) problems.push('only ONE question is allowed, drop the others')
      if (ASKS_STABLE.test(prevAssistant) && ASKS_STABLE.test(content) && !recordedStable) problems.push('the last reply already asked whether their income is stable and they did not answer; do NOT ask it again, answer what they are asking')
      if (wantsInvestLocked && !SAYS_LOCKED.test(content)) problems.push(`say that cirBTC buying is locked, what is missing ("${balance.lock.text}") and why the lock protects them`)
      if (!ops.length && SAYS_NOTED.test(content)) problems.push('nothing was recorded this turn, drop "Noted"')
      if (userAsks && !ops.length && YOU_ARE_RIGHT.test(content)) problems.push('do not say they are right: nothing changed. Answer their question by showing how the number is made from ASSET & FUND FIGURES (spending lines + debt payments = spending a month; months × spending = floor)')
      // Offered 600 while 1,800 was missing and the wallet covered it (real chat 2026-10-26).
      const offerSentence = plain.split(/(?<=[.?!])\s+/).find(x => OFFERS_DEPOSIT.test(x))
      if (cover !== null && offerSentence && !offerSentence.replace(/\*\*/g, '').includes(usdc(cover))) problems.push(`the deposit to offer is exactly ${usdc(cover)} (what the fund still needs; the wallet covers it)`)
      // Gold and bank savings were called idle money (real chat 2026-10-26).
      const idleSaid = [...plain.matchAll(IDLE_AMOUNT)].flatMap(m => readings(m[1] ?? m[2]))
      if (idleSaid.length && !idleSaid.some(v => Math.abs(v - balance.byGroup.idle) <= Math.max(1, balance.byGroup.idle * 0.01))) problems.push(`idle money is ${usdc(balance.byGroup.idle)} (only the items marked Idle); gold is Traditional and bank savings are Safe`)
      // "The loan from your mom is priority debt because you pay 200 a month" while only its rate was unknown (real chat 2026-10-26).
      const priLines = balance.debts.lines.filter(l => l.priority)
      if (priLines.length && priLines.every(l => l.debt.type === 'unknown' || l.debt.ratePct === null) && /priority debt|pay (it )?off (this|that|the) (debt|loan) first/i.test(plain)) problems.push(`it is not known yet whether this debt costs interest, so do not call it priority debt or say to pay it off first: ask whether ${priLines.map(l => `"${l.debt.name}"`).join(' and ')} charges interest, and how much a year`)
      if (!ops.length && content.trim() === prevAssistant.trim()) problems.push('do not repeat your last message: answer what they just said')
      if (ops.length && !SAYS_NOTED.test(content)) problems.push(`start with the read-back: "Noted: ${readback.join(', ')}."`)
      const chartMax = 520
      if (actions.some(x => x.type === 'show_allocation' || x.type === 'show_cashflow') && content.length > chartMax) problems.push('the card right below already shows every figure: rewrite in at most 3 sentences, no reading back each part')
      const stray = ungrounded(content, grounding)
      if (stray.length) problems.push(`these amounts are not in the figures: ${stray.join(', ')}. Do not compute new numbers (no "left after", no sums or differences); quote only amounts given in ASSET & FUND FIGURES or by the user`)
      if (NEVER_SAY.test(content)) problems.push('never say "world standards", "experts say", Fidelity / Vanguard, "you should buy", never suggest selling or leverage, never promise returns: speak "by the MoonSafe framework", give the facts, they decide')
      // The split is a reference to consider; only the fund is a must (Hieu, 2026-10-26).
      if (altCheck && !usedOnce.has('altcoin_heavy') && (!/99\s*%/.test(plain) || !/(?<![\d.,])1\s*%/.test(plain))) problems.push('give the reality check once: most low caps end up down 90-99%; would they dare put that share in and watch it shrink to 1%?')
      if (SPLIT_AS_MUST.test(plain)) problems.push('the split by age is only a reference they may consider: say "you could consider" / "the framework suggests", never "recommended", "you need to" or "you must"')
      if (DISCLAIMER.test(content)) problems.push('no disclaimer in chat (it is on the cards and the "Before you start" screen): drop it')
      if (balance.target && ASKS_TARGET.test(lastUserText) && !new RegExp(`(?<!\\d)${Math.round(balance.target.safe)}\\s*%`).test(plain)) problems.push(`give the target by the MoonSafe framework: Safe ${pct(balance.target.safe)}, Traditional ${pct(balance.target.traditional)}, BTC ${pct(balance.target.btc)}, Big caps ${pct(balance.target.large_cap)}, Low caps ${pct(balance.target.altcoin)} of liquid assets`)
      if (!balance.target && !facts.age_declined && /(?<!\d)\d{1,2}\s*%/.test(plain) && ASKS_TARGET.test(lastUserText)) problems.push('the age is unknown: quote no share yet, ask the age first')
      if (balance.cashflow.spending === null && !balance.fund.met && NEEDS_AMOUNT.test(content)) problems.push('monthly spending is unknown, so nobody knows how much the fund needs: never say an amount is needed or quote the wallet as what to add; ask how much they spend a month')
      // "Would you like me to prepare a deposit of 1,101 USDC" for the bank-savings part (real chat 2026-10-24).
      const toSafe = balance.suggest?.to.safe ?? 0
      if (toSafe > 1 && /deposit/i.test(content) && [...plain.matchAll(AMOUNT)].some(m => readings(m[1] ?? m[2]).some(v => Math.abs(v - toSafe) <= toSafe * 0.01 + 1))) problems.push(`${usdc(toSafe)} is the safe part: the user's OWN savings, not a deposit in the app; tell them to put it in bank savings or flexible earn (e.g. Binance Simple Earn Flexible)`)
      if (balance.declared && toSafe > 1 && ASKS_USE.test(lastUserText) && !/bank|savings|ngân hàng|tiết kiệm/i.test(content)) problems.push(`say where the safe part goes: ${usdc(toSafe)} into their own bank savings or flexible earn (e.g. Binance Simple Earn Flexible)`) // lang-ok
      if (DEBT_WORD.test(lastUserText) && !DEBT_WORD.test(content)) problems.push('the user asked about their debt: say plainly what to do about the debt')
      if (BUILD_FUND.test(lastUserText) && /a month into the fund takes about/.test(figs) && !/sav|để dành|tiết kiệm/i.test(content)) problems.push('they asked how to build the fund: suggest saving the monthly amount from the figures and say about how many months it takes') // lang-ok
      if (vi && /months? of spending|Noted[.:]|Right\?/i.test(content)) problems.push('this reply is in Vietnamese: write "N tháng chi tiêu", "Mình ghi: …", "Đúng chưa?", no English phrases') // lang-ok
      if (PUSHY.test(content)) problems.push('do not order the user to provide details ("please provide…"); ask one friendly question instead')
      // Advisor replies (2026-10-27 tests): a stray "Right?" after the real question, "I need to know…" instead of asking,
      // the rote "this is important because", and "adding to the fund opens cirBTC" while priority debt still locks it.
      if (!readback.length && RIGHT_Q.test(plain)) problems.push('nothing was recorded this turn: drop "Right?" / "Đúng chưa?"') // lang-ok
      // The Next question is written in English and was once pasted as is into a Vietnamese reply.
      if (vi && /(?<!\p{L})(how much|how old|do you|are you|is your|what is|roughly)(?!\p{L})/iu.test(plain)) problems.push('this reply is in Vietnamese: ask the question in Vietnamese, no English sentence') // lang-ok
      else if (next && RIGHT_Q.test(plain)) problems.push('a Next question is given: ask it as a real question and drop "Right?" / "Đúng chưa?"') // lang-ok
      if (NEED_TO_KNOW.test(plain)) problems.push('ask a real friendly question instead of "I need to know…"')
      if (ROTE_WHY.test(plain)) problems.push('drop "this is important because": say what actually happens to them')
      if (vi && /(?<!\p{L})(floor|options?)(?!\p{L})/iu.test(plain)) problems.push('this reply is in Vietnamese: write "mức tối thiểu" for floor and "lựa chọn" for option') // lang-ok
      if (!balance.lock.open && balance.lock.missing.some(m => m.startsWith('pay off')) && plain.split(/(?<=[.;!?])\s+/).some(x => UNLOCKS.test(x) && !DEBT_WORD.test(x))) problems.push(`cirBTC stays locked while there is priority debt: adding to the fund alone does not open it (${balance.lock.text})`)
      if (!balance.lock.open && /(prepare|chuẩn bị|tạo)[^.?!\n]{0,60}cirBTC/i.test(plain)) problems.push(`cirBTC buying is locked, so there is no cirBTC card to offer (${balance.lock.text})`) // lang-ok
      if (DEBT_CARD.test(plain)) problems.push('the app has no card to pay a debt: they pay it themselves; only offer cards for the fund, withdraw, cirBTC or DCA')
      // gpt-5.4-mini once dropped a Persian word into a Vietnamese reply (test 2026-10-27).
      if (OTHER_SCRIPT.test(content)) problems.push(`write only in ${replyLang}: a word in another script slipped in`)
      if (BOSSY.test(content)) problems.push(`suggest, do not order: no "you need to" / "you must"${vi ? ' / "bạn cần" / "bạn phải" / "hãy"' : ''}; say what the option does for them and let them choose`) // lang-ok
      if (ASKS_OVERVIEW.test(lastUserText) && !GIVES_REASON.test(content)) problems.push('this is a check-up from an advisor: for each point say why it matters for them and one option they could take')
      if (next && content.includes('?') && !GIVES_REASON.test(content)) problems.push('say in a few words why you ask (what the answer lets you work out for them); if something useful is already known from the figures, give that one point before the question')
      if (SAFE_IN_APP.test(content)) problems.push('the app cannot move money to the user\'s bank or exchange and nothing was moved: the user tops up their own savings themselves; never offer or claim a deposit / transfer to savings')
      if (SAFE_AS_FUND.test(content)) problems.push('if you meant the emergency fund, call it "emergency fund" / "quỹ dự phòng" and add no explanation about the safe part; the safe part is the user\'s own savings, NOT the emergency fund, and cannot be deposited in the app') // lang-ok
      if (startFacts.intent_added_to_safe && !ops.length && !/(?<!\p{L})(where|from|từ đâu|ở đâu)(?!\p{L})/iu.test(content)) problems.push('ask exactly one question: where did the money come from (their idle money / the app wallet, or new money)?') // lang-ok
      if (usedOnce.has('altcoin_heavy') && CAUTION_ALT.test(content)) problems.push('the altcoin risk was already said once in this chat: do not repeat it, respect their decision')
      // Users found replies wordy (2026-10-24, median 305 chars), then found them bossy with no reasons (Hieu, 2026-10-27):
      // room for one "why" sentence. Checked only once the content is right.
      const maxChars = ASKS_WHY.test(lastUserText) ? 680 : readback.length ? 520 : 480
      if (!problems.length && content.replace(/\*\*/g, '').length > maxChars && !actions.some(x => x.type === 'show_allocation' || x.type === 'show_cashflow')) problems.push(`too long (${content.length} chars): cut to at most ${maxChars === 680 ? '5' : '4'} short sentences including one question; first sentence = the direct answer; keep every point it makes now (key numbers, the reason why, advice on debt or saving), drop only preambles, repeats and filler`)
      if (problems.length && rewrites < 3 && round < 5) {
        rewrites++
        replyMessages.push({ role: 'assistant', content })
        replyMessages.push({ role: 'system', content: `That reply needs fixing: ${problems.join('; ')}. Rewrite the whole reply in ${replyLang}, keeping the correct figures.` })
        continue
      }
      // Still asking twice after the rewrites: drop the extra questions rather than send them.
      // A read-back with nothing recorded survived the rewrites once ("Mình ghi: Bạn muốn mua…"): drop it.
      const noFalseNote = ops.length ? content : content.replace(/^\s*(\*\*)?(Noted|Mình ghi)(\*\*)?:\s*/i, '').replace(/\s*(Right\?|Đúng chưa\?)\s*$/i, '') // lang-ok
      const oneAsk = (noFalseNote.match(/\?/g) ?? []).length > 1 ? noFalseNote.replace(/\s*(Right\?|Đúng chưa\?)\s*$/i, '') : noFalseNote // lang-ok
      const tidy = tidyQuestions(oneAsk, ASKS_STABLE.test(prevAssistant) && !recordedStable)
      return json({ content: tidy, ops, dcaStop, actions, ...(body.debug ? { facts: figs, notes: done, patterns: matched.map(p => p.id), next, readback, profile } : {}) })
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
