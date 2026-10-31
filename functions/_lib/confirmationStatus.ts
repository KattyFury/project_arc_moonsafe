import type { FinancialProfile } from '../../src/types'

/** Read-only status questions are answered from persisted state, never inferred from a draft.
 * Compound requests with facts, calculations or actions continue through the normal handler.
 */
export function confirmationStatus(text: string, p: FinancialProfile, vi: boolean, vault: number | null): string | null {
  if (/\d/.test(text)) return null
  const request = text.trim().split(/(?<=[.!?])\s+/u)
    .filter(s => !/^(?:do not|don't|đừng|không)\s/iu.test(s)).join(' ').replace(/[.!?]+$/u, '').trim() // lang-ok
  if (!/^(?:explain )?what is (?:(?:actually|already) )?(?:saved|confirmed)(?: now)?(?: and what (?:still )?needs confirmation)?$/iu.test(request)
    && !/^(?:giải thích )?(?:những gì|thông tin nào) đã (?:lưu|xác nhận)(?: và những gì (?:còn )?chờ xác nhận)?$/iu.test(request)) return null // lang-ok
  const amount = (n:number, c:string|undefined) => `${n.toLocaleString('en-US')} ${c === 'VND' ? 'VND' : 'USD'}`
  const saved:string[]=[]
  if(p.age!==null) saved.push(`${vi?'Tuổi':'Age'}: ${p.age}`) // lang-ok
  if(p.incomeStable!==null) saved.push(vi ? `Thu nhập ${p.incomeStable?'ổn định':'không ổn định'}` : `Income ${p.incomeStable?'stable':'irregular'}`) // lang-ok
  if(p.dependents!==null) saved.push(`${vi?'Người phụ thuộc':'Dependents'}: ${p.dependents}`) // lang-ok
  if(p.soleEarner!==null) saved.push(vi ? `Người kiếm thu nhập duy nhất: ${p.soleEarner?'có':'không'}` : `Sole earner: ${p.soleEarner?'yes':'no'}`) // lang-ok
  for(const i of p.incomes) saved.push(`${i.name}: ${amount(i.monthly,i.currency)}/${vi?'tháng':'month'}`) // lang-ok
  for(const e of p.expenses) saved.push(`${e.name}: ${amount(e.monthly,e.currency)}/${vi?'tháng':'month'}`) // lang-ok
  for(const h of p.holdings) saved.push(`${h.name}: ${h.value===undefined ? (vi?'chưa khai vốn/giá trị':'cost/value not declared') : amount(h.value,h.currency)}${h.quantity===undefined?'':`; ${h.quantity} ${h.symbol??h.unit??''}`}`) // lang-ok
  for(const d of p.debts) saved.push(`${d.name}: ${amount(d.balance,d.currency)}`)
  if(p.debtsComplete) saved.push(vi?'Đã xác nhận danh sách nợ đầy đủ':'Debt list confirmed complete') // lang-ok
  if(p.noNearGoal) saved.push(vi?'Đã xác nhận không có mục tiêu gần':'No near-term goal confirmed') // lang-ok
  if(p.nearGoal) saved.push(`${p.nearGoal.name}: ${amount(p.nearGoal.amount,p.nearGoal.currency)}`)
  const intro=vi?'Đã lưu trong hồ sơ:':'Saved in your profile:' // lang-ok
  const unknown=vi?'Mục không có trong hồ sơ chưa được xác nhận, không có nghĩa bằng 0. Đề xuất trên thẻ chỉ được lưu khi bạn xác nhận; mục đã hủy không được tính.':'Items absent from the saved profile are not established, not zero. Card proposals count only after confirmation; skipped items do not count.' // lang-ok
  const vaultLine=vault===null ? '' : vi?`\n\nVault trong app: ${amount(vault,'USDC')}. Số dư này không xác định bạn có bao nhiêu dự phòng bên ngoài app.`:`\n\nApp vault: ${amount(vault,'USDC')}. This balance does not establish your emergency reserves outside the app.` // lang-ok
  return `${intro}\n${saved.length?saved.map(s=>`- ${s}`).join('\n'):(vi?'Chưa có thông tin tài chính được lưu.':'No financial facts saved yet.')}\n\n${unknown}${vaultLine}` // lang-ok
}
