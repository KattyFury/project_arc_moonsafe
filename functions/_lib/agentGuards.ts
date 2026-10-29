import type { FinancialProfile } from '../../src/types'

/** Cheap, explicit workflow state derived from user instructions, never assistant wording. */
export function turnPolicy(users: string[]) {
  let conversationOnly = false
  for (const text of users) {
    if (text.startsWith('[app event]')) continue
    if (/\b(?:start|build|make|create) (?:my |a )?(?:plan|budget)\b|\b(?:prepare|deposit|withdraw|buy)\s+(?:\$|\d)|open (?:my |a )?vault|lập kế hoạch|mở form|mở vault|nạp \d|mua \d/iu.test(text) // lang-ok
      && !/\?|\b(?:not|don't|do not|no)\b|đừng|không/iu.test(text)) conversationOnly = false // lang-ok
    if (/education only|only want.*listen|just.*listen|do not.*(?:form|invest|buy|deposit)|don't.*(?:form|invest|buy|deposit)|without onboarding|no[- ]form|(?:skip|pause|avoid|stop|no|without)\s+(?:(?:the|this|a|my)\s+)?(?:questionnaire|intake|form)|đừng mở form|không cần (?:mua|form)|chỉ.*(?:lắng nghe|kiến thức)/iu.test(text)) conversationOnly = true // lang-ok
  }
  const latest = users[users.length - 1] ?? ''
  const actionRequest = /^(?:please |can you |could you )?(?:deposit|withdraw|buy|prepare (?:a )?(?:deposit|withdrawal|buy)(?: of)?)\s*\$?\d[^.]*\??$/iu.test(latest.trim())
    && !/\b(?:if|would|whether|explain|example|not|don't|maybe|or)\b/iu.test(latest)
  if (actionRequest) conversationOnly = false // a new explicit action overrides the old conversation preference
  const question = !actionRequest && /\?|\b(?:explain|teach|tell me|one (?:small |practical )?step)\b|giải thích|phân biệt|một bước|một việc/iu.test(latest) // lang-ok
  return { conversationOnly, question, answerFirst: conversationOnly || question }
}

/** Numbers must have the dimension the tool claims, not merely occur somewhere. */
export function quantityEvidence(text: string, quantity: number, symbol: string | undefined, kind: string): boolean {
  const units = kind === 'gold' ? 'oz|ounces?|grams?|g|kg|lượng|chỉ' // lang-ok
    : kind === 'stock' ? 'shares?|cổ phiếu' // lang-ok
      : [symbol?.replace(/[^A-Z0-9]/gi, ''), 'coins?', 'tokens?'].filter(Boolean).join('|')
  const re = new RegExp(`(?<![\\d$])([\\d,]+(?:\\.\\d+)?)\\s*(k|m)?\\s*(?:${units})(?![\\p{L}])`, 'giu')
  return [...text.matchAll(re)].some(m => {
    if (/(?:\$|USD|VND|USDC)\s*$/iu.test(text.slice(Math.max(0, m.index! - 8), m.index))) return false
    const n = Number(m[1].replace(/,/g, '')) * (m[2]?.toLowerCase() === 'k' ? 1000 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1)
    return Math.abs(n - quantity) <= Math.max(1e-9, Math.abs(n) * .000001)
  })
}

export const explicitAgeRefusal = (text: string) => /(?:not|don't|do not|rather not|prefer not).*?(?:share|give|say|tell).*?age|(?:skip|decline).*?age|(?:không muốn|không tiện|xin phép không).*?(?:tuổi)|bỏ qua.*?tuổi/iu.test(text) // lang-ok

export function investmentCost(text: string, symbol: string | undefined): number | null {
  const m = text.match(/\bi (?:invested|put)\s*\$([\d,]+(?:\.\d+)?)\s*(?:into|in)\s*(BTC|Bitcoin)\b/iu)
  return m && /^(?:BTC|WBTC|CIRBTC)$/iu.test(symbol ?? '') ? Number(m[1].replace(/,/g, '')) : null
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
  const amount = investmentCost(text, 'BTC')
  if (amount !== null) {
    const btc = p.holdings.filter(h => h.type === 'btc')
    if (!btc.length) proposals.push({ name: 'add_holding', args: { type: 'btc', symbol: 'BTC', name: 'BTC', worth: { amount, currency: 'USDC' } } })
  }
  return proposals
}

export const TURN_POLICY = `WORKFLOW GUARD: Answer the user's actual question/concern first. When conversation-only is active: no intake, personal questionnaire, investment onboarding, bucket-choice question or unsolicited product/transaction offer. A negated mention of buying is not buy intent. Keep this preference until the user explicitly asks to start a plan or action. Record explicit current facts accurately even during teaching; say "noted" only for facts actually saved (or clearly label pending confirmation). Unknown targets/balances are unknown, not zero. Quote only computed financial targets; do not invent an "X of Y, Z to go". The vault balance is separate from available savings outside the app. Never turn a dollar cost into coin quantity.`
