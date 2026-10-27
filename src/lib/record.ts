// "I put 1,000 in my bank as Safety": the user reports money they placed. Instead of the agent
// guessing where it came from (and losing the destination on the next turn, real chat 2026-10-27),
// the app shows a confirmation box under the reply: the user picks the source, taps Confirm, and
// the app saves it. The agent never records a placement by itself.
//
// Pure module with relative imports only (shared by the app, functions/api/chat.ts and scripts/kb-check.ts).

import { amountsUsd } from '../kb/facts'
import type { AssetType, FinancialProfile, Holding } from '../types'
import { categoryOf, defaultRebalanceable, newId, priceKindOf, type ProfileOp } from './profile'

/** What the user said they placed, and where. */
export interface RecordRequest {
  /** USD (USDC). */
  amountUsd: number
  holdingType: AssetType
  /** Display name of the destination ("Bank savings"). */
  name: string
  /** A source named in the same message; null = the user picks in the box. */
  source: 'wallet' | 'new' | null
}

/** Where the money came from, as chosen in the box. */
export type RecordSource = { kind: 'wallet' } | { kind: 'new' } | { kind: 'holding'; id: string }

const DEST_NAME: Partial<Record<AssetType, string>> = {
  savings: 'Bank savings', term_deposit: 'Term deposit', flexible_earn: 'Flexible earn', checking: 'Bank checking account',
}

export const bucketLabel = (type: AssetType): string => categoryOf({ type }) === 'safe' ? 'Safety' : 'Idle money'

// "put / moved / deposited … 1000 … in my bank". "Imma put" and "I'm going to put" count: the box says what will be saved.
const PLACE = /(?<!\p{L})(put|putting|add|added|move|moved|moving|deposit|deposited|transfer|transferred|place|placed|save|saved|sent|wired|send)\s[^.?!\n]{0,40}?\d[^.?!\n]{0,40}?(?<!\p{L})(into|in|to|on)\s+(my\s+|the\s+|a\s+|an\s+)?(safe|safety|savings?|bank|term deposit|fixed deposit|flexible|simple earn|earn|checking)/iu
const PLACE_VI = /(vừa|đã|mới)\s+(bỏ|gửi|chuyển|cho|nạp|để)[^.?!\n]{0,30}\d[^.?!\n]{0,30}(vào|sang)\s+(phần\s+|quỹ\s+)?(an toàn|safe|tiết kiệm|ngân hàng)/iu // lang-ok
const QUESTION = /\?|^\s*(should|shall|can|could|would|how|what|is|do|does|if)\b/i
const FROM_WALLET = /(from|out of)\s+(my\s+|the\s+|this\s+)?(app\s+|moonsafe\s+)?wallet|(this|the app|my app)\s+wallet/i
const NEW_MONEY = /(?<!\p{L})(new money|airdrop|salary|bonus|earned|income|just got|received|from work|tiền mới|lương)(?!\p{L})/iu // lang-ok

/** A placement the user reports in this message, or null (questions and plain "I have X in the bank" are not placements). */
const DEST = '(?:my\\s+|the\\s+|a\\s+|an\\s+)?(?:safe|safety|savings?|bank|term deposit|fixed deposit|flexible|simple earn|earn|checking)'
const VERB = '(?:put|putting|add|added|move|moved|moving|deposit|deposited|transfer|transferred|place|placed|save|saved|sent|wired|send)'
// "I got 1000 new money … I put it in my bank": the amount comes first, the verb has "it" as object (real chat 2026-10-27).
const PLACE_IT = new RegExp(`(?<!\\p{L})${VERB}\\s+(?:it|them|that|this|the money|all of it)\\s+(?:into|in|to|on)\\s+${DEST}`, 'iu')
// "1000 more in savings from outside" / "outside money, 1000 in the bank": an amount for the bank with a "new money" word, no verb.
const PLACE_NEW_AFTER = new RegExp(`\\d[^.?!\\n]{0,30}?(?<!\\p{L})(?:more|extra|additional|new money|outside|airdrop|salary|bonus)(?!\\p{L})[^.?!\\n]{0,40}?(?<!\\p{L})(?:into|in|to|on)\\s+${DEST}`, 'iu')
const PLACE_NEW_BEFORE = new RegExp(`(?<!\\p{L})(?:more|extra|additional|new money|outside|airdrop|salary|bonus)(?!\\p{L})[^.?!\\n]{0,40}?\\d[^.?!\\n]{0,30}?(?<!\\p{L})(?:into|in|to|on)\\s+${DEST}`, 'iu')

/** The first number in `t` from `from` on, as USD (the app's default unit when no currency word is given). */
function firstAmount(t: string, from: number, vndPerUsd: number | null): number {
  const withUnit = amountsUsd(t.slice(from), vndPerUsd)[0]
  if (withUnit) return withUnit
  const bare = /(?<![\w.,])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|m)?(?![\w%])/i.exec(t.slice(from))
  return bare ? Number(bare[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6 }[(bare[2] ?? '').toLowerCase()] ?? 1) : 0
}

export function detectPlacement(text: string, vndPerUsd: number | null): RecordRequest | null {
  const t = text.trim()
  if (!t || t.startsWith('[app event]') || QUESTION.test(t)) return null
  const hit = PLACE.exec(t) ?? PLACE_NEW_AFTER.exec(t) ?? PLACE_NEW_BEFORE.exec(t)
  const viaIt = !hit && PLACE_IT.test(t)
  if (!hit && !viaIt && !PLACE_VI.test(t)) return null
  // "put 1000 in my bank" has no currency word: read the first number after the verb as USD.
  const amount = firstAmount(t, hit && !viaIt ? hit.index : 0, vndPerUsd) || firstAmount(t, 0, vndPerUsd)
  if (!amount || !(amount > 0)) return null
  const holdingType: AssetType = /term deposit|fixed deposit/i.test(t) ? 'term_deposit'
    : /flexible|simple earn|(?<!\p{L})earn(?!\p{L})/iu.test(t) ? 'flexible_earn'
    : /checking|current account/i.test(t) ? 'checking'
    : 'savings'
  const source = FROM_WALLET.test(t) ? 'wallet' : NEW_MONEY.test(t) || /outside|extra/i.test(t) ? 'new' : null
  return { amountUsd: Math.round(amount * 100) / 100, holdingType, name: DEST_NAME[holdingType] ?? 'Savings', source }
}

const usd = (h: Holding, rate: number | null): number | null =>
  h.value === undefined ? null : h.currency === 'VND' ? (rate ? h.value / rate : null) : h.value

/** Tracked places that can have funded this: idle or safe money kept as a plain value, big enough. */
export function sourceOptions(profile: FinancialProfile, req: RecordRequest, rate: number | null): Holding[] {
  return profile.holdings.filter(h => {
    if (h.type === req.holdingType) return false
    const kind = priceKindOf(h.type)
    if (kind !== 'self' && kind !== 'stable') return false
    if (!['idle', 'safe'].includes(categoryOf(h))) return false
    const v = usd(h, rate)
    return v !== null && v >= req.amountUsd - 0.005
  })
}

/** Add `amount` USD to a holding's own currency; null when a VND item has no rate. */
const inCurrency = (amountUsd: number, h: Pick<Holding, 'currency'>, rate: number | null): number | null =>
  h.currency === 'VND' ? (rate ? amountUsd * rate : null) : amountUsd

/**
 * The operations that save a confirmed placement: the destination goes up (or is created), and a
 * tracked source goes down. The app wallet changes onchain by itself; "new money" has no source.
 */
export function buildRecordOps(profile: FinancialProfile, req: RecordRequest, source: RecordSource, rate: number | null, now = Date.now()): ProfileOp[] {
  const ops: ProfileOp[] = []
  const dest = profile.holdings.find(h => h.type === req.holdingType && h.value !== undefined && (priceKindOf(h.type) === 'self' || priceKindOf(h.type) === 'stable'))
  const add = dest ? inCurrency(req.amountUsd, dest, rate) : null
  if (dest && add !== null) {
    ops.push({ op: 'set_holding', id: dest.id, patch: { value: Math.round(((dest.value ?? 0) + add) * 100) / 100 } })
  } else {
    ops.push({
      op: 'add_holding',
      holding: {
        id: newId('h'), type: req.holdingType, name: req.name, value: req.amountUsd, currency: 'USDC', updatedAt: now,
        priceSource: 'self', rebalanceable: defaultRebalanceable(req.holdingType),
      },
    })
  }
  if (source.kind === 'holding') {
    const src = profile.holdings.find(h => h.id === source.id)
    const cut = src ? inCurrency(req.amountUsd, src, rate) : null
    if (src && cut !== null && src.value !== undefined) ops.push({ op: 'set_holding', id: src.id, patch: { value: Math.max(0, Math.round((src.value - cut) * 100) / 100) } })
  }
  return ops
}

/** One line for the agent and the card: what was saved. */
export function recordSummary(req: RecordRequest, source: RecordSource, profile: FinancialProfile): string {
  const from = source.kind === 'wallet' ? 'the app wallet' : source.kind === 'new' ? 'new money' : profile.holdings.find(h => h.id === source.id)?.name ?? 'a listed item'
  return `${req.amountUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDC in ${req.name} (${bucketLabel(req.holdingType)}), from ${from}`
}
