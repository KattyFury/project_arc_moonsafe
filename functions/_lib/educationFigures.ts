/** Narrow arithmetic for an explicitly requested salary/contribution explanation.
 * This does not compute a balance, affordability, a fund target or saved profile facts.
 */
export function salaryRemainder(users: string[]): string | null {
  const latest = users[users.length - 1] ?? ''
  if (!/phần lương không chuyển|salary.*(?:not transferred|not shared|remaining)|remaining salary/iu.test(latest)) return null // lang-ok
  const money = String.raw`\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(triệu|nghìn|million|thousand|k|m)?\s*(VND|đồng|USD|USDC)?` // lang-ok
  const salaryPattern = new RegExp(String.raw`(?:lương(?: người đó)?(?: là)?|salary(?: is| of)?)${money}`, 'iu') // lang-ok
  const contributionPattern = new RegExp(String.raw`(?:góp|contributes?|transfers?)${money}`, 'iu') // lang-ok
  const parse = (m:RegExpMatchArray) => ({
    amount:Number(m[1].replace(/,/g,'')) * (/triệu|million|^m$/iu.test(m[2]??'') ? 1e6 : /nghìn|thousand|^k$/iu.test(m[2]??'') ? 1000 : 1), // lang-ok
    currency:/VND|đồng/iu.test(m[0]) ? 'VND' : /USD|USDC|\$/iu.test(m[0]) ? 'USD' : /triệu|nghìn/iu.test(m[0]) ? 'VND' : null, // lang-ok
  })
  const salary = latest.match(salaryPattern)
  const contributions = users.slice(-3,-1).flatMap(t=>t.replace(/"[^"\n]*"|“[^”\n]*”/gu,'').split(/(?<=[.!?])\s+/u))
    .filter(t=>!/\b(?:not|don't|never)\b|không|chưa/iu.test(t)) // lang-ok
    .flatMap(t=>[...t.matchAll(new RegExp(contributionPattern.source,'giu'))])
  const contribution = contributions[contributions.length - 1]
  if (!salary || !contribution) return null
  const a=parse(salary),b=parse(contribution)
  if (!a.currency || a.currency!==b.currency || !Number.isFinite(a.amount) || !Number.isFinite(b.amount) || a.amount < b.amount || b.amount < 0) return null
  const show=(n:number)=>a.currency==='VND' ? `${n.toLocaleString('en-US')} VND` : `$${n.toLocaleString('en-US')}`
  return `SERVER-COMPUTED EXPLANATORY ARITHMETIC: stated salary ${show(a.amount)} minus stated contribution ${show(b.amount)} = ${show(a.amount-b.amount)} of that salary not transferred. This is NOT a current balance, available money, spending permission or proof of recurring contributions. Answer the arithmetic directly; keep those quantities unknown. No profile change.`
}
