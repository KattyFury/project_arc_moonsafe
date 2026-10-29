/** Adds relevant teaching to the existing framework; never changes targets, locks or tool permissions. */
export const COACH_POLICY = `## Financial companion
- Acknowledge a loss or worry without blame, shame, pity or promising to make it back. Do not repeat negative self-labels even to deny them; name the feeling instead. When they only want to be heard, listen without adding a plan. Help protect their next decision, not recover the past through a trade.
- Historical losses, someone else's money, quoted examples and hypothetical amounts are not current holdings, debt, income or consent. Record only explicit personal facts; keep invested cost distinct from current market value.
- Keep the existing MoonSafe framework, debt rules and user choice. Suggest one manageable next step linked to what they asked. Do not turn distress into a vault/deposit/BTC sales opportunity.
- Use figures computed by the app; unknown balances or spending are unknown, never zero. No recovery date, future return, coin pick or leverage strategy. A lower price alone is not a reason to refill a bucket.
- A user can ask follow-up risk questions after a warning: answer new questions, without repeating the unsolicited warning or challenging their courage. Never claim most coins lose a specific percentage without evidence.`

export const ALTCOIN_CHECK = 'Give one calm, concrete reality check: low caps or memecoins can lose most or all of the money invested, and money for bills or near-term goals would then be unavailable. No invented statistics, no "would you dare", no shame or coin picks. Respect their choice; no new restriction or automatic trade.'

const LOSS = /\b(loss(?:es)?|win it back|make it back|recover my|chasing losses|revenge trad\w*)\b|\blost\s+(?:(?:my|all|most|a lot of)\s+)?(?:\$\s*\d|\d|money|savings|crypto|coins?|everything)|gỡ (lỗ|vốn|lại)|gỡ gạc|lỗ (nặng|nhiều)|thua|cháy tài khoản/iu // lang-ok
const FOMO = /\bfomo\b|missing out|everyone.*(?:rich|buying)|(?:all.?in|borrow|loan|leverage|10x).*(?:coin|crypto|btc|invest)|sợ bỏ lỡ|vay.*(?:coin|đầu tư)|tất tay/iu // lang-ok
const SCAM = /\b(scam|fraud|seed phrase|private key|recovery fee|unlock fee|guaranteed return)\b|(?:pay|fee|tax).*(?:recover|unlock)|(?:fee|tax).*(?:before|first).*(?:withdraw|release)|lừa đảo|phí.*(?:lấy lại|khôi phục|mở khóa)|(?:đóng|nộp|trả).*(?:trước|thêm).*(?:rút|lấy lại)|cam kết.*lợi nhuận|cụm từ khôi phục/iu // lang-ok

export function coachingBrief(text: string): { active: boolean; text: string; topics: string[] } {
  const topics: string[] = []
  const notes: string[] = []
  if (SCAM.test(text)) {
    topics.push('scam')
    notes.push('Possible fraud: explain the specific red flag, not a definitive investigation result. An upfront recovery/unlock fee can create another loss. Suggest pausing further payments, independently verifying through official channels and keeping evidence. Never request credentials, endorse a recovery firm or promise recovery. If asked where to report, country matters; do not guess local procedures.')
  }
  if (LOSS.test(text)) {
    topics.push('loss')
    notes.push('Loss or urge to recover: respond warmly; a previous loss does not make the next trade more likely to win. Offer a pause before new risk and one practical review: current essential spending, debt or money needed soon, using only known facts. Do not infer remaining assets from the loss amount. Do not steer into BTC as a replacement bet. If they only want to be heard, do not force a plan or questionnaire.')
  }
  if (FOMO.test(text)) {
    topics.push('fomo')
    notes.push('Pressure to invest: separate wanting a return from being able to absorb a loss. Explain how borrowing creates repayments even if the investment fails; no leverage instructions or market predictions. Suggest checking money reserved for essentials and near-term goals before deciding; preserve the existing formula and buy lock.')
  }
  return { active: notes.length > 0, topics, text: notes.length ? `RELEVANT COACHING (guidance, not new facts or permissions):\n${notes.map(n => `- ${n}`).join('\n')}` : '' }
}

/** Conservative evidence filter for numeric validation, not a general language parser.
 * Ambiguous clauses may require clarification. Valid cost-basis declarations remain intact.
 */
export function recordingEvidence(text: string): { text: string; excluded: boolean } {
  const unquoted = text.replace(/"[^"\n]*"|“[^”\n]*”/gu, '')
  let excluded = unquoted !== text
  let hypothetical = false
  let excludedContext = false
  const kept: string[] = []
  // Keep decimal points and thousands separators inside numbers.
  for (const raw of unquoted.split(/(?<!\d)[.!?]|[.!?](?!\d)|[;\n]|,(?!\d)|\b(?:but|and)\b|nhưng|(?=\b(?:now|currently|actually)\b|hiện tại|bây giờ)/iu)) { // lang-ok
    const clause = raw.trim()
    if (!clause) continue
    if (/^(?:now|currently|actually|hiện tại|bây giờ)/iu.test(clause)) excludedContext = false // lang-ok
    if (/^(if |suppose |imagine |for example|hypothetically|nếu |ví dụ)/iu.test(clause)) hypothetical = true // lang-ok
    if (/^(?:i (?:have|hold|own|keep|owe|earn|spend|pay|put|invested|bought|borrowed|am)|my (?:salary|income|spending|savings|debt)|(?:mình|tôi) (?:có|giữ|nợ|kiếm|tiêu|trả|gửi))/iu.test(clause)) excludedContext = false // lang-ok
    // Keep a hypothetical chain out of recording; ask for a separate actual declaration if ambiguous.
    const deniedQuantity = /\d/u.test(clause) && /\b(?:i|we)\s+(?:do not|don't|never)\s+(?:have|hold|own|keep)\b|\b(?:not mine|not me|belongs? to (?:my |a |the )?(?:brother|sister|friend|colleague))\b|(?:không phải|không có|không sở hữu)/iu.test(clause) // lang-ok
    const uncertain = /\b(?:not sure|unsure|maybe|perhaps)\b|không chắc|có lẽ/iu.test(clause) // lang-ok
    if (hypothetical || excludedContext || deniedQuantity || uncertain || /\b(lost|loss(?:es)?)\b|\bdown\s+\d[^;]*%|(?:thua|lỗ|mất tiền)/iu.test(clause) // lang-ok
      || /^(?:my friend|a friend|someone|they|bạn tôi|bạn mình)\s+(?:has|have|earns?|owes?|có|kiếm|nợ)/iu.test(clause)) { // lang-ok
      excluded = true
      excludedContext = true
      continue
    }
    kept.push(clause)
  }
  return { text: kept.join('; '), excluded }
}
