import type { Income } from '../types'

export type PlanningScope = 'individual' | 'household'

export function scopeQuestion(text: string): boolean {
  return /household|family budget|spouse|wife|husband|gia đình|vợ|chồng/iu.test(text) // lang-ok
    && (/\?/.test(text) || /^(?:can|could|how|what|is|do|does)\b|được (?:không|ko)|có thể|là gì/iu.test(text)) // lang-ok
}

/** A partner's age must never replace the profile holder's age in the allocation formula. */
export function profileAgeAllowed(message: string, age: number): boolean {
  if (!/wife|husband|spouse|partner|vợ|chồng/iu.test(message)) return true // lang-ok
  const explicit = [...message.matchAll(/(?:\bi(?:['’]m| am)|\bmy age(?: is)?|(?:mình|tôi)(?:\s+năm nay)?)(?:\s+|:\s*)(\d{1,3})(?!\d)/giu)] // lang-ok
  return explicit.some(m => Number(m[1]) === age)
}

export function dependentEvidence(message: string, previous: string): boolean {
  const words = /depend|rel(?:y|ies)|financially support|phụ thuộc|nuôi/iu // lang-ok
  return words.test(message) || (words.test(previous) && /^\s*(?:\d+|yes|no|có|không|ko)\s*[.!]?\s*$/iu.test(message)) // lang-ok
}

/** Only explicit scope-setting statements change the saved plan; questions do not. */
export function scopeChoice(text: string): PlanningScope | null {
  const t = text.trim().replace(/[.!]+$/u, '').trim()
  if (/^(?:plan for (?:my|our|the) (?:household|family)|use (?:a )?household (?:plan|budget)|lập kế hoạch (?:cho )?(?:gia đình|cả nhà)|tính (?:cho |theo )?(?:gia đình|cả nhà)|tính cho cả hai vợ chồng)$/iu.test(t)) return 'household' // lang-ok
  if (/^(?:plan for (?:just )?me|use (?:an? )?(?:individual|personal) (?:plan|budget)|lập kế hoạch (?:cho )?riêng mình|tính (?:cho )?riêng mình)$/iu.test(t)) return 'individual' // lang-ok
  return null
}

export function scopeBrief(scope: PlanningScope | undefined): string {
  return scope === 'household'
    ? 'Planning scope: HOUSEHOLD. Income and spending describe the shared family budget. Count each income, asset and debt once; partner-to-partner transfers are not extra household income. Use the profile holder\'s age for the unchanged MoonSafe formula, never an average of spouses\' ages. A working spouse is not automatically a dependent. Two income sources do not prove two earners; ask only when needed. Stability refers to the combined dependable income; do not infer it from one salary. Do not assume ownership or permission to spend a partner\'s money. Switching scope never imports, deletes or merges records: review existing entries with the user.'
    : 'Planning scope: INDIVIDUAL. Do not silently include a partner\'s finances just because the user is married. Discuss household planning if asked; change scope only on an explicit choice. Preserve the existing age-based framework.'
}

const subject = (name: string): 'partner' | 'combined' | 'self' =>
  /household|combined|joint|family (income|salary)|total (income|salary)|gia đình|tổng (lương|thu nhập)|cả (hai|nhà)/iu.test(name) ? 'combined' // lang-ok
    : /wife|husband|spouse|partner|vợ|chồng/iu.test(name) ? 'partner' : 'self' // lang-ok

/** Select a source to update without turning a new salary into a correction or a subtotal into new income. */
export function incomeUpdate(items: Income[], args: { id?: unknown; name: string; kind: string }, message: string, scope: PlanningScope = 'individual'): { old?: Income; error?: string } {
  const role = subject(args.name)
  const named = items.find(i => i.name.toLowerCase() === args.name.toLowerCase() && i.kind === args.kind)
  const byId = items.find(i => i.id === args.id)
  if (byId && subject(byId.name) !== role) return { error: 'Not recorded: ask which income source is being changed; this id belongs to a different person or a combined total. Keep existing entries unchanged.' }
  const old = byId ?? named
  const addition = /\b(also|another|additional|extra|side job)\b|thêm|ngoài ra/iu.test(message) // lang-ok
  const separateExtra = addition && !/salary|lương|^income$|^thu nhập$/iu.test(args.name) // lang-ok
  if (old && !args.id && addition && role === 'self' && /^(?:my )?(?:income|salary)$/iu.test(args.name)) {
    return { error: 'Not recorded: ask for a distinct name for the additional income source instead of overwriting the existing salary or Income line.' }
  }
  if (!old && scope === 'individual' && (role === 'partner' || /household|joint|family|gia đình/iu.test(args.name))) { // lang-ok
    return { error: 'Not recorded: ask whether the user wants a household plan or only their own budget before including a partner\'s income. Do not silently combine finances.' }
  }
  {
    const others = items.filter(i => i.kind === args.kind && i.id !== old?.id)
    if ((role === 'combined' && others.length) || (role !== 'combined' && !separateExtra && others.some(i => subject(i.name) === 'combined'))) {
      return { error: 'Not recorded: ask whether this amount is already included in the existing combined income or component salaries. Never count a total alongside its components. Update the relevant existing sources after clarification.' }
    }
  }
  if (old) return { old }
  // A single legacy Income line may be corrected, but never by a spouse's salary or an explicitly additional job.
  const correction = /\b(now|changed|correct|replace|instead|actually)\b|hiện tại|sửa|thay|thực ra/iu.test(message) // lang-ok
  const primary = /^(?:(?:my|monthly) )?(?:salary|income)$|^(?:lương|thu nhập)(?: của (?:mình|tôi))?$/iu.test(args.name) // lang-ok
  if (role === 'self' && (correction || primary) && !addition && items.length === 1 && items[0].name.toLowerCase() === 'income' && items[0].kind === args.kind) return { old: items[0] }
  return {}
}
