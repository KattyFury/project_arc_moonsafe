import type { FinancialProfile } from '../../src/types'
import { currentValuation, investedBasis } from './mutationEvidence'

/** Inputs needed to quote one personalized fund target, without changing the framework formula. */
export function fundMissingInputs(p: FinancialProfile, spending: number | null): string[] {
  return [
    spending === null ? 'monthly spending' : '',
    p.incomeStable === null ? 'income stability' : '',
    p.dependents === null ? 'dependents' : '',
    p.incomeStable === false && (p.dependents ?? 0) > 0 && p.soleEarner === null ? 'whether this is the only household income' : '',
  ].filter(Boolean)
}

/** Cheap, explicit workflow state derived from user instructions, never assistant wording. */
export function turnPolicy(users: string[]) {
  let conversationOnly = false
  for (const text of users) {
    if (text.startsWith('[app event]')) continue
    if (/\b(?:start|build|make|create) (?:my |a )?(?:plan|budget)\b|\b(?:prepare|deposit|withdraw|buy)\s+(?:\$|\d)|open (?:my |a )?vault|lập kế hoạch|mở form|mở vault|nạp \d|mua \d/iu.test(text) // lang-ok
      && !/\?|\b(?:not|don't|do not|no)\b|đừng|không/iu.test(text)) conversationOnly = false // lang-ok
    if (/education only|(?:only|just) (?:teach me|explain|want to (?:learn|understand))|only want.*listen|just.*listen|do not.*(?:form|invest|buy|deposit)|don't.*(?:form|invest|buy|deposit)|without onboarding|no[- ]form|(?:skip|pause|avoid|stop|no|without)\s+(?:(?:the|this|a|my)\s+)?(?:questionnaire|intake|form)|(?:đừng|không)\s+(?:(?:cần|muốn)\s+)?(?:mở|điền|hỏi)\s*(?:form|biểu mẫu|thu nhập)|đừng đề nghị.*(?:mua|form)|không cần (?:mua|form)|chỉ.*(?:lắng nghe|nghe mình|nghe tôi|kiến thức|giải thích|học)/iu.test(text)) conversationOnly = true // lang-ok
  }
  const latest = users[users.length - 1] ?? ''
  const actionRequest = /^(?:please |can you |could you )?(?:deposit|withdraw|buy|prepare (?:a )?(?:deposit|withdrawal|buy)(?: of)?)\s*\$?\d[^.]*\??$/iu.test(latest.trim())
    && !/\b(?:if|would|whether|explain|example|not|don't|maybe|or)\b/iu.test(latest)
  if (actionRequest) conversationOnly = false // a new explicit action overrides the old conversation preference
  const question = !actionRequest && /\?|\b(?:explain|teach|tell me|asking about|show which|show me what|one (?:small |practical )?step)\b|giải thích|phân biệt|một bước|một việc/iu.test(latest) // lang-ok
  return { conversationOnly, question, answerFirst: conversationOnly || question }
}

/** Numbers must have the dimension the tool claims, not merely occur somewhere. */
export function quantityEvidence(text: string, quantity: number, symbol: string | undefined, kind: string): boolean {
  const units = kind === 'gold' ? 'oz|ounces?|grams?|g|kg|lượng|cây|chỉ' // lang-ok
    : kind === 'stock' ? 'shares?|cổ phiếu' // lang-ok
      : [symbol?.replace(/[^A-Z0-9]/gi, ''), 'coins?', 'tokens?'].filter(Boolean).join('|')
  const re = new RegExp(`(?<![\\d$])([\\d,]+(?:\\.\\d+)?)\\s*(k|m)?\\s*(?:${units})(?![\\p{L}])`, 'giu')
  // "btc 0.1", "eth 2.5": the coin named first (persona run 2026-11-01: "btc 0.1" was never recorded). Not "BTC $500" or "BTC worth 500".
  const before = symbol && kind === 'crypto' ? new RegExp(`(?<![\\p{L}])(?:${units})\\s+([\\d,]*\\.?\\d+)(?![\\d.,]*\\s*(?:\\$|usd|usdc|dollars?|k\\b))`, 'giu') : null
  // Only a decimal or a small count reads as coins this way ("BTC 500" is far more likely dollars).
  if (before && [...text.matchAll(before)].some(m => (m[1].includes('.') || Number(m[1].replace(/,/g, '')) < 100) && Math.abs(Number(m[1].replace(/,/g, '')) - quantity) <= Math.max(1e-9, quantity * .000001))) return true
  return [...text.matchAll(re)].some(m => {
    if (/(?:\$|USD|VND|USDC)\s*$/iu.test(text.slice(Math.max(0, m.index! - 8), m.index))) return false
    const n = Number(m[1].replace(/,/g, '')) * (m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1)
    return Math.abs(n - quantity) <= Math.max(1e-9, Math.abs(n) * .000001)
  })
}

export const explicitAgeRefusal = (text: string) => /(?:not|don't|do not|rather not|prefer not).*?(?:share|give|say|tell).*?age|(?:skip|decline).*?age|(?:không muốn|không tiện|xin phép không).*?(?:tuổi)|bỏ qua.*?tuổi/iu.test(text) // lang-ok

export function investmentCost(text: string, symbol: string | undefined): number | null {
  const cost = investedBasis(text, symbol)
  return cost?.currency === 'USDC' ? cost.amount : null
}

type Proposal = { name: string; args: Record<string, unknown> }
const valueOf = (n: string, scale?: string) => Number(n.replace(/,/g, '')) * (/million|triệu|^m$/iu.test(scale ?? '') ? 1e6 : /thousand|nghìn|^k$/iu.test(scale ?? '') ? 1000 : 1) // lang-ok

/** Narrow recovery of explicit facts omitted by a planner. Proposals still pass normal tool guards.
 * Does not infer missing balances, ownership, spouse income or a complete expense total.
 */
export function factProposals(text: string, p: FinancialProfile): Proposal[] {
  const proposals: Proposal[] = []
  if (/\b(?:maybe|perhaps|not sure|unsure)\b|có lẽ|không chắc/iu.test(text)) return proposals // lang-ok
  const fields: Record<string, unknown> = {}
  const age = text.match(/\bi(?: am|['’]m) (?:married(?: and |;\s*))?(\d{2})(?!\d)|(?:mình|tôi) (\d{2}) tuổi/iu) // lang-ok
  if (age && p.age !== Number(age[1] ?? age[2])) fields.age = Number(age[1] ?? age[2])
  if (explicitAgeRefusal(text) && p.age === null && !p.ageDeclined) fields.age_declined = true
  if (/\b(?:we|i) (?:have )?no (?:other )?debts?\b|\bno dependents or debts\b|không (?:có )?nợ/iu.test(text) && !p.debtsComplete) fields.debts_complete = true // lang-ok
  if (/\bno (?:other debt or )?(?:near[- ]term|short[- ]term) goals?\b|chưa có mục tiêu gần/iu.test(text) && !p.nearGoal && !p.noNearGoal) fields.no_near_goal = true // lang-ok
  if (/\bno dependents\b|không (?:có )?người phụ thuộc/iu.test(text) && p.dependents !== 0) fields.dependents = 0 // lang-ok
  if (/\b(?:both salaries|income|salar(?:y|ies)) (?:are |is )?stable\b|\bearn a stable\b|thu nhập ổn định/iu.test(text) && p.incomeStable !== true) fields.income_stable = true // lang-ok
  const count = (s: string) => ({ one: 1, two: 2, three: 3, four: 4 }[s.toLowerCase()] ?? Number(s))
  const supported = text.match(/\b(?:supporting|support|financially support) (?:my )?(spouse|wife|husband)\s*(?:and|;)\s*(one|two|three|four|\d+) children\b/iu)
  if (supported && /only earner|sole earner|financially support/iu.test(text) && p.dependents !== 1 + count(supported[2])) fields.dependents = 1 + count(supported[2])
  const goal = text.match(/\bi need\s*\$([\d,]+(?:\.\d+)?)\s+for\s+(tuition|school fees|a car|a wedding|a down payment)\s+in\s+(one|two|three|four|\d+)\s+months\b/iu)
  if (goal && count(goal[3]) > 0 && count(goal[3]) <= 60 && (p.nearGoal?.amount !== valueOf(goal[1]) || p.nearGoal?.name !== goal[2])) {
    fields.near_goal_amount = { amount: valueOf(goal[1]), currency: 'USDC' }
    fields.near_goal_name = goal[2]
    fields.near_goal_years = count(goal[3]) / 12
  }
  if (Object.keys(fields).length) proposals.push({ name: 'update_profile', args: fields })
  // Explicit current savings declarations; no transfer, investment or hypothetical inference.
  const savings = /(?:\b(?:i|we) have|\b(?:now )?my actual savings are|(?:mình|tôi|nhà mình) (?:hiện )?có|(?:^|;\s*)có)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(million|thousand|triệu|nghìn|k|m)?\s*(VND|USDC|USD|đồng)?\s*(?:in )?(?:bank savings|savings|tiết kiệm(?: ngân hàng)?)/giu // lang-ok
  // "My actual savings are $400" has its amount after the predicate, not followed by savings.
  const matches: RegExpMatchArray[] = [...text.matchAll(savings)]
  const direct = text.match(/\bmy (?:actual )?savings are\s*\$([\d,]+(?:\.\d+)?)/iu)
  if (direct) matches.push(direct)
  for (const m of matches) {
    const amount = valueOf(m[1], m[2])
    const currency = /VND|đồng|triệu|nghìn/iu.test(m[0]) ? 'VND' : 'USDC' // lang-ok
    if (!(amount > 0) || p.holdings.some(h => h.value === amount && h.currency === currency)) continue
    const existing = p.holdings.filter(h => ['savings', 'cash'].includes(h.type) && h.currency === currency)
    if (existing.length > 1) continue // ask rather than choose an account
    proposals.push(existing.length === 1
      ? { name: 'set_holding', args: { id: existing[0].id, worth: { amount, currency } } }
      : { name: 'add_holding', args: { type: 'savings', name: 'Bank savings', worth: { amount, currency } } })
  }
  const basis = currentValuation(text, 'BTC')
  if (basis !== null) {
    const btc = p.holdings.filter(h => h.type === 'btc')
    const quantity = text.match(/(?<![\d$])([\d]+(?:\.\d+)?)\s*BTC\b/iu)
    const args = { worth: basis, ...(quantity ? { quantity: Number(quantity[1]) } : {}) }
    if (!btc.length) proposals.push({ name: 'add_holding', args: { type: 'btc', symbol: 'BTC', name: 'BTC', ...args } })
    else if (btc.length === 1 && (btc[0].priceSource !== 'self' || btc[0].value !== basis.amount || btc[0].currency !== basis.currency)) proposals.push({ name: 'set_holding', args: { id: btc[0].id, ...args } })
  }
  return proposals
}

export const TURN_POLICY = `WORKFLOW GUARD: Answer the user's actual question/concern first. When conversation-only is active: no intake, personal questionnaire, investment onboarding, bucket-choice question or unsolicited product/transaction offer. A negated mention of buying is not buy intent. Keep this preference until the user explicitly asks to start a plan or action. Record explicit current facts accurately even during teaching; say "noted" only for facts actually saved (or clearly label pending confirmation). Unknown targets/balances are unknown, not zero. Quote only computed financial targets; do not invent an "X of Y, Z to go". The vault balance is separate from available savings outside the app. Never turn a dollar cost into coin quantity.`
/** Detect observable response failures; never treat model self-review as authoritative. */
/** "No. I will consider it", "not yet, let me think", "để mình suy nghĩ": a no to the offer for now, answered like a plain no (real chat 2026-11-03). */ // lang-ok
export const defersOffer = (text: string) => text.length <= 120 && !/\d|\?/.test(text)
  && /^\s*(?:(?:no|nope|not yet|not now|maybe later|later|chưa|không|thôi)(?!\p{L})[\s,.!]*(?:(?:i(?:'ll| will| need to| have to| want to)?|let me|để (?:mình|tôi|em|anh)|(?:mình|tôi|em|anh) (?:sẽ|cần))\s+)?(?:consider|think|decide|suy nghĩ|cân nhắc|xem lại)|let me (?:think|consider|decide)|i(?:'ll| will| need to| have to| want to) (?:think|consider|decide)|để (?:mình|tôi|em|anh) (?:suy nghĩ|cân nhắc|xem lại))/iu.test(text) // lang-ok

/** Someone who may be thinking of ending their life. Plain figures of speech ("this stock is suicide", "go on a trip") stay out. */
export const isCrisis = (text: string) => /(?<!\p{L})(suicidal|(?:commit(?:ting)?|thinking (?:of|about)|consider(?:ing)?) suicide|kill(?:ing)? myself|end(?:ing)? my life|take my (?:own )?life|want to die|(?:don'?t|do not) want to (?:live|be alive|wake up)(?: anymore)?|better off dead|tự tử|tự sát|không muốn sống|không còn lý do để sống|(?:mình|tôi|em|anh|tui) muốn chết)(?!\p{L})|(?:(?:don'?t|do not|can'?t) see (?:the|any) point (?:of|in) (?:going on|living)|no (?:point|reason) (?:in |to |of )?(?:living|going on|go on|live)|(?:don'?t|do not|can'?t) (?:want to )?go on)(?: (?:anymore|any more|like this))?\s*[.!]*\s*$/iu.test(text) // lang-ok

// CORE 1: money kept outside the vault never counts as the emergency fund. CORE 3: no % per part, no total as 100%.
const OUTSIDE_MONEY = /binance|okx|bybit|exchange|bank|mattress|cash|savings?|term deposit|ngân hàng|tiết kiệm|tiền mặt|(?<!\p{L})sàn(?!\p{L})|(?<!\p{L})sổ(?!\p{L})/iu // lang-ok
const COUNTS_AS_FUND = /counts?\s+(?:as|toward|towards)|can count|covers?\s+(?:that|the|your)|(?:as|is) your (?:reserve|emergency)|leave the vault|tính vào|được tính|xem[^.?!\n]{0,40}là|một phần dự phòng|dự phòng tạm thời|làm quỹ/iu // lang-ok
const FUND_WORD = /\bfund\b|reserve|(?<!\p{L})quỹ(?!\p{L})|dự phòng/iu // lang-ok
const DENIES = /\b(?:not|never|cannot|can't|doesn't|don't|won't|isn't)\b|(?<!\p{L})(?:không|chưa|chẳng)(?!\p{L})/iu // lang-ok
const ASKS_SPARE = /(?:do you have|have you got|how much|willing to mention|bạn có|cho mình biết)[^?？\n]{0,80}(?:savings?|cash|bank|tiền mặt|ngân hàng)[^?？\n]{0,60}[?？]/iu // lang-ok
const PART_PERCENT = /\d\s*%\s*,\s*(?:your|khoản)\b|of the three parts|\btarget\s+\d+(?:\.\d+)?\s*%|\d\s*%[^.\n]{0,40}:\s*(?:above|below|close to)/iu // lang-ok

export function responseProblems(content: string, answerOnly: boolean, fundTargetUnknown = false, vi?: boolean, investingLocked = false): string[] {
  const problems: string[] = []
  if (content.split(/(?<=[.!?])\s+|\n/u).some(s => OUTSIDE_MONEY.test(s) && COUNTS_AS_FUND.test(s) && FUND_WORD.test(s) && !DENIES.test(s))) problems.push('Only the vault counts as the emergency fund. Money kept anywhere else never counts or covers the target: remove that claim and give the real vault figure.')
  if (/gọi bạn là|chứ không phải ["“]?(?:anh|chị|em)\b|note it in your profile|note Crypto as|haven.t saved that yet|want me to record it\?/iu.test(content)) problems.push('Remove this: never comment on how you address them, and the app stores no mix inside Crypto, so never offer to note or save one.') // lang-ok
  if (/(?:can.t|cannot|won.t) help (?:you )?(?:to )?(?:move|withdraw|take)[^.?!\n]{0,40}(?:fund|vault)|(?:can.t|cannot) (?:place|split|allocate)[^.?!\n]{0,30}(?:has|have)n.t arrived/iu.test(content)) problems.push('Never refuse: withdrawing is their right, so say what it does and offer the card; and an amount still to come can be answered with the shares or what each part is short of.')
  if (ASKS_SPARE.test(content)) problems.push('Never ask how much cash, bank money or savings they have: spare money is not asked about (CORE 2). Remove the question.')
  if (PART_PERCENT.test(content)) problems.push('Never show a part as a percentage or against the total of the three parts. Each part is only its money against its bar ("$10,000 of $13,000, $3,000 to go"). Remove these percentages.')
  if (investingLocked && /(?:Safety|Traditional|Crypto|Truyền thống)\s*(?:(?:share|target|allocation|is|at)\s*|[:=]\s*)?\d+(?:[.,]\d+)?\s*%|\d+(?:[.,]\d+)?\s*%\s*(?:(?:to|in|for|into)\s+)?(?:Safety|Traditional|Crypto|Truyền thống)/iu.test(content)) problems.push('Investing is locked: omit allocation shares and split amounts until the onchain reserve is known and full and expensive debt is gone. Answer the current fund/debt step instead.') // lang-ok
  if (vi === true && /[a-z]{3}/iu.test(content) && !/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/iu.test(content)) problems.push('The real user wrote Vietnamese. Answer in Vietnamese, not English; keep technical symbols unchanged.') // lang-ok
  if (vi === false && /\bmình\b|\bbạn\b/iu.test(content)) problems.push('The real user wrote English. Remove Vietnamese conversational words.') // lang-ok
  if (/your latest (?:request|question)|the latest request|(?:already|have) answered|not going to repeat it|my last (?:draft|reply)|I shouldn.t have added/iu.test(content)) problems.push('Answer the actual question directly. Private drafts were never shown to the user; remove commentary claiming the answer was already given.')
  if (fundTargetUnknown && content.split(/(?<=[.!?])\s+/u).some(s => /fund|quỹ/iu.test(s) && /target|need|aim|cover|mục tiêu|cần|đủ/iu.test(s) && /your|our|you need|bạn|nhà mình/iu.test(s) && /\$\s*\d|\d[\d,.]*\s*(?:USD|USDC|VND|months?|tháng|triệu)/iu.test(s))) problems.push('The personalized fund target is unknown. Remove personal target amounts, months and gaps derived from defaults; explain which inputs remain unknown.') // lang-ok
  if (/that (?:last )?reply (?:did|needs|failed)|here it is again,? without changes|rewrite the (?:whole )?reply|instruction for your next reply|saved facts this turn|the (?:system|developer) (?:prompt|instruction)|(?:câu trả lời|phản hồi) (?:trước|vừa rồi).{0,35}(?:viết lại|chỉnh sửa)/iu.test(content)) problems.push('Return only the answer to the user. Remove editorial comments, evaluation feedback and internal instructions.') // lang-ok
  if (/only lock(?:s|ing)? in|chỉ chốt lỗ|loss(?:es)? (?:is|are) only real (?:if|when)|(?:becomes?|become) (?:a )?real.{0,35}(?:only|if you sell)|only becomes? (?:a )?real|only (?:lose|a loss) (?:if|when) you sell|chỉ (?:lỗ|thua) (?:khi|nếu) (?:bạn )?bán|chỉ (?:thành|trở thành|là) (?:khoản )?lỗ (?:thực sự|thật).{0,25}(?:khi|nếu).{0,10}bán/iu.test(content)) problems.push('A market decline is an economic loss even before selling; selling realizes it. Holding does not guarantee recovery.') // lang-ok
  if (/(?:real|legitimate|genuine) recover(?:y|ies|y services).{0,45}never.{0,25}(?:upfront|advance|fee)|(?:khôi phục|thu hồi|lấy lại tiền).{0,30}(?:hợp pháp|thật).{0,25}không bao giờ.{0,20}phí/iu.test(content)) problems.push('An upfront fee plus a recovery promise is a red flag, not proof that every legitimate service is free. Explain the specific warning signs and independent verification; never guarantee recovery.') // lang-ok
  if (answerOnly && /(?:how (?:much (?:do you|does your|is your)|old are you)|what (?:is your|are your)|do you have|is your income|bạn (?:bao nhiêu tuổi|thu nhập|chi tiêu|có (?:nợ|người phụ thuộc)))[^?？]*[?？]/iu.test(content)) problems.push('Answer the knowledge question without requesting personal income, spending, age, debt or dependents. Stop after the useful explanation.') // lang-ok
  return problems
}

export const REPLY_DISCIPLINE = `USER-FACING ANSWER ONLY: Never claim the app stores a separate current market value unless a saved operation actually does that. A quoted current value can be discussed without saving it. A partner contribution is known shared-budget money, not a full salary; include it once in declared budget resources, with unshared salary unknown. Never describe drafts, rewrites, scoring, system instructions or whether a previous reply complied. If asked to revise, output the corrected answer directly. A saved fact may be acknowledged naturally; no mandatory opening word. Teach only the concept requested, not the entire framework. Personal questions are unnecessary for general education. A concrete next step can be done privately without reporting figures back. Distinguish known, pending and unknown facts. Never assume no emergency reserve from a zero app vault. Do not offer to calculate interest without a known rate. Do not turn an illustrative minimum into a personalized target when income stability or dependents are unknown. A market decline reduces economic value before sale; sale realizes the gain/loss for accounting, and recovery is uncertain. Recovery fees tied to guarantees or unlocking funds are red flags; do not claim all legitimate services are free.`
