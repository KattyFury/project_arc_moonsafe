// MoonSafe knowledge base: the framework (top of moonsafe-kb.json) and the situation patterns
// (bottom). Spec: docs/SPEC-FRAMEWORK-2026-10-25.md. Patterns are data: adding one needs no code.
// The server computes the user's facts, matches them here and sends the model only the few
// patterns that apply, instead of the whole framework on every message.
//
// Pure module with relative imports only, shared by the app and functions/api/chat.ts.

import kbJson from './moonsafe-kb.json'

export type Facts = Record<string, number | boolean | string | null | undefined>
type Value = number | boolean | string | null | { param: string } | { fact: string }
export type Cond =
  | { all: Cond[] }
  | { any: Cond[] }
  | { not: Cond }
  | { fact: string; op: '>' | '>=' | '<' | '<=' | '==' | '!='; value: Value }

export type BuyLock = 'block' | 'block_until_fund_floor' | 'by_fund_floor' | 'by_lock' | 'by_data' | 'open' | 'none'

export interface Pattern {
  id: string
  name: string
  priority: number
  spec: string
  status?: 'accepted_for_now'
  when: Cond
  agent_does: string
  say: string[]
  never: string[]
  locks: { buy_cirbtc: BuyLock }
  once?: boolean
}

export interface DebtType { key: string; label: string; group: string; blocks_buy: boolean | string; note?: string }

/** One row of the spec 3 table. */
export interface AssetTypeRow {
  n: number; key: string; label: string; category: string; subgroup?: string
  net_worth: boolean; liquid_base: boolean | string; rebalanceable?: boolean; pricing: string; note?: string
}

export const KB = kbJson as unknown as {
  version: string
  params: Record<string, { value: number; status?: string; note?: string }>
  principles: string[]
  allocation: { rest_split: Record<'traditional' | 'crypto', [number, number]>; crypto_split: Record<'btc' | 'large_cap' | 'altcoin', [number, number]> }
  fund_floor: { rules: { when: string; months: number }[] }
  debt_types: DebtType[]
  asset_types: AssetTypeRow[]
  facts_reference: string[]
  collection: Record<string, string>
  rebalance: string[]
  priority_order: string[]
  priority_rules: string[]
  voice: { style: string; may_say: string[]; never_say: string[]; web3_view: string; before_you_start: string[] }
  patterns: Pattern[]
}

/** The spec 3 row for an asset type key; undefined for an unknown key. */
export const assetTypeRow = (key: string): AssetTypeRow | undefined => KB.asset_types.find(t => t.key === key)

export const param = (name: string): number => {
  const p = KB.params[name]
  if (!p) throw new Error(`Unknown KB param ${name}`)
  return p.value
}

export type MixKey = 'safe' | 'traditional' | 'btc' | 'large_cap' | 'altcoin'

/** Target shares in % of liquid assets (spec 4): safe = age; the rest 4/7 traditional, 3/7 crypto (BTC 2/3, large caps 1/6, altcoins 1/6). */
export function targetMix(age: number): Record<MixKey, number> {
  const a = Math.min(param('age_max'), Math.max(param('age_min'), age))
  const r = 100 - a
  const { rest_split: rs, crypto_split: cs } = KB.allocation
  const crypto = r * rs.crypto[0] / rs.crypto[1]
  return {
    safe: a,
    traditional: r * rs.traditional[0] / rs.traditional[1],
    btc: crypto * cs.btc[0] / cs.btc[1],
    large_cap: crypto * cs.large_cap[0] / cs.large_cap[1],
    altcoin: crypto * cs.altcoin[0] / cs.altcoin[1],
  }
}

/** Emergency fund floor in months of spending (spec 5.1). Unknown stability counts as stable. */
export function fundFloorMonths(p: { income_stable: boolean | null; dependents: number; sole_earner: boolean }): number {
  const irregular = p.income_stable === false
  const deps = p.dependents > 0
  if (irregular && deps) return p.sole_earner ? 12 : 9
  if (irregular || deps) return 6
  return 3
}

/** Priority debt (spec 5.2): a priority type, or any debt at or above the priority rate. Zero interest never is. */
export function isPriorityDebt(d: { type: string; rate_pct: number }): boolean {
  if (d.rate_pct === 0) return false
  if (d.rate_pct >= param('priority_debt_rate_pct')) return true
  return KB.debt_types.find(t => t.key === d.type)?.group === 'priority'
}

function value(v: Value, facts: Facts): unknown {
  if (v && typeof v === 'object') return 'param' in v ? param(v.param) : facts[v.fact]
  return v
}

/** A missing fact never matches (so a pattern cannot fire on data the user has not given). */
export function holds(c: Cond, facts: Facts): boolean {
  if ('all' in c) return c.all.every(x => holds(x, facts))
  if ('any' in c) return c.any.some(x => holds(x, facts))
  if ('not' in c) return !holds(c.not, facts)
  const a = facts[c.fact]
  const b = value(c.value, facts)
  if (a === undefined || a === null || b === undefined || b === null) return false
  switch (c.op) {
    case '==': return a === b
    case '!=': return a !== b
    case '>': return (a as number) > (b as number)
    case '>=': return (a as number) >= (b as number)
    case '<': return (a as number) < (b as number)
    case '<=': return (a as number) <= (b as number)
  }
}

/** Patterns that apply, highest priority first. `done` = ids of once-only patterns already used in this chat. */
export function matchPatterns(facts: Facts, done: Set<string> = new Set()): Pattern[] {
  return KB.patterns
    .filter(p => !(p.once && done.has(p.id)) && holds(p.when, facts))
    .sort((x, y) => y.priority - x.priority)
}

/** Placeholders like {fund_months} filled from the facts; unknown ones stay visible so they get noticed. */
export function fill(text: string, facts: Facts): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => facts[k] === undefined || facts[k] === null ? m : String(facts[k]))
}

/** The compact block the model gets: only the matching patterns, a few lines each. */
export function patternBrief(matched: Pattern[], facts: Facts, max = 4): string {
  return matched.slice(0, max).map(p => [
    `- ${p.name}: ${p.agent_does}`,
    ...p.say.map(s => `  may say: "${fill(s, facts)}"`),
    ...p.never.map(s => `  never: ${s}`),
  ].join('\n')).join('\n')
}
