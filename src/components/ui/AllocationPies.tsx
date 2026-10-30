// Two donuts: the target split by the MoonSafe framework (spec 4) and what the user holds now,
// in three buckets (Safety, Traditional, Crypto: framework v2, 2026-10-27) plus Idle and a grey slice for items
// that cannot be rebalanced (spec 3: rental, business, loans given, insurance). Shares are of
// liquid assets (the base of every %, spec 2); the full version also shows each group's share of
// net worth (spec 11). Used on Balance, Invest and in the chat.
// Colours follow the entity (dataviz skill, validated 2026-10-25 on white in this ring order:
// worst adjacent CVD ΔE 9.8, normal-vision 16.2; grey is a neutral on purpose); every slice also
// has a text label + share, so colour is never alone.

import { useApp } from '@/state/AppState'
import type { ReactNode } from 'react'
import { GROUP_LABEL, bucketStanding, shareOfLiquid } from '@/lib/allocation'

type Segment = 'safe' | 'traditional' | 'crypto' | 'idle' | 'grey'

const SEG_COLOR: Record<Segment, string> = { safe: '#1baf7a', traditional: '#1E6DF7', crypto: '#eb6834', idle: '#eda100', grey: '#a3a39d' }
const SEG_NAME: Record<Segment, string> = { safe: GROUP_LABEL.safe, traditional: GROUP_LABEL.traditional, crypto: 'Crypto', idle: GROUP_LABEL.idle, grey: 'Not rebalanced' }
const ORDER: Segment[] = ['safe', 'traditional', 'crypto', 'idle', 'grey']

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)]
  const [x1, y1] = p(from), [x2, y2] = p(to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`
}

/** Donut of shares (sum 1); a 2px white gap separates slices. */
function Donut({ slices, size, center, sub, label }: { slices: { seg: Segment; share: number; title: string }[]; size: number; center: string; sub?: string; label: string }) {
  const stroke = Math.round(size * 0.14)
  const r = (size - stroke) / 2
  const c = size / 2
  const shown = slices.filter(s => s.share > 0)
  let at = 0
  return (
    <figure className="flex flex-col items-center gap-2 min-w-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${shown.map(s => s.title).join(', ') || 'no data yet'}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth={stroke} />
        {shown.length === 1
          ? <circle cx={c} cy={c} r={r} fill="none" stroke={SEG_COLOR[shown[0].seg]} strokeWidth={stroke}><title>{shown[0].title}</title></circle>
          : shown.map(s => {
            const from = at, to = at + s.share
            at = to
            return (
              <g key={s.seg}>
                <path d={arc(c, c, r, from, to)} fill="none" stroke={SEG_COLOR[s.seg]} strokeWidth={stroke}><title>{s.title}</title></path>
                {/* 2px surface gap at the start of each slice */}
                <line x1={c + (r - stroke / 2 - 1) * Math.sin(from * 2 * Math.PI)} y1={c - (r - stroke / 2 - 1) * Math.cos(from * 2 * Math.PI)}
                  x2={c + (r + stroke / 2 + 1) * Math.sin(from * 2 * Math.PI)} y2={c - (r + stroke / 2 + 1) * Math.cos(from * 2 * Math.PI)}
                  stroke="var(--bg)" strokeWidth={2} />
              </g>
            )
          })}
        {sub ? <>
          <text x={c} y={c - 2} textAnchor="middle" className="font-bold tabular-nums" style={{ fontSize: Math.round(size * 0.16), fill: 'var(--ink)' }}>{center}</text>
          <text x={c} y={c + Math.round(size * 0.14)} textAnchor="middle" style={{ fontSize: 14, fill: 'var(--subtle)' }}>{sub}</text>
        </> : <text x={c} y={c} dy="0.35em" textAnchor="middle" className="font-bold tabular-nums" style={{ fontSize: 14, fill: 'var(--ink)' }}>{center}</text>}
      </svg>
      <figcaption className="text-[14px] leading-5 font-semibold text-center" style={{ color: 'var(--subtle)' }}>{label}</figcaption>
    </figure>
  )
}

/**
 * compact = one row of two small donuts + a share legend (Invest and the chat). The full version
 * (Balance) lists each part as "have of target" with what is left.
 */
export function AllocationPies({ compact = false }: { compact?: boolean }) {
  const { balance: b, moneyUsd, prices } = useApp()
  const { target, liquid, grey, byGroup, unpriced, declared } = b
  const size = compact ? 72 : 112
  // Crypto is one bucket: BTC plus any other coins held; its target is all of the crypto share.
  const held: Record<Segment, number> = { safe: byGroup.safe, traditional: byGroup.traditional, crypto: byGroup.btc + byGroup.large_cap + byGroup.altcoin, idle: byGroup.idle, grey }
  const goalPct: Partial<Record<Segment, number>> = target ? { safe: target.safe, traditional: target.traditional, crypto: target.btc + target.large_cap + target.altcoin, idle: 0 } : {}
  // The "now" ring shows liquid assets plus the grey slice, so the grey part is visible beside them.
  const ring = liquid + grey
  const now = ORDER.map(s => ({ seg: s, share: ring > 0 ? held[s] / ring : 0, title: `${SEG_NAME[s]} ${moneyUsd(held[s])}` }))
  const goal = ORDER.filter(s => goalPct[s] !== undefined).map(s => ({ seg: s, share: goalPct[s]! / 100, title: `${SEG_NAME[s]} ${Math.round(goalPct[s]! * 10) / 10}%` }))
  const r = (n: number) => Math.round(n)
  // % of liquid now / target; grey has no % of liquid (it is outside the base).
  const share = (s: Segment) => {
    if (s === 'grey') return '–'
    const n = liquid > 0 ? r(shareOfLiquid(b, held[s])) : null
    const t = goalPct[s]
    return t !== undefined ? `${n ?? '–'}/${r(t)}%` : `${n ?? '–'}%`
  }
  const rows = ORDER.filter(s => s !== 'grey' || grey > 0)
  const walletOnly = !declared && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Nothing is counted yet. Tell the agent what you hold, wallets included.</p>

  if (compact) return (
    // One row: target donut, current donut, legend. In a narrow place (the chat bubble column)
    // the legend wraps under the donuts instead of truncating.
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Donut slices={goal} size={size} label="Target" center={target ? `${r(target.safe)}%` : '–'} />
        <Donut slices={now} size={size} label="Now" center={liquid > 0 ? `${r(shareOfLiquid(b, byGroup.safe))}%` : '–'} />
        <ul className="flex-1 min-w-[160px] flex flex-col" title="% of liquid assets now / target. Centre: Safety share">
          {rows.map(s => (
            <li key={s} className="flex items-center gap-2 text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEG_COLOR[s] }} />
              <span className="truncate">{SEG_NAME[s]}</span>
              <span className="ml-auto font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink)' }}>{s === 'grey' ? moneyUsd(grey) : share(s)}</span>
            </li>
          ))}
        </ul>
      </div>
      {walletOnly}
    </div>
  )

  // Each part as "have of target" with what is left (Hieu, 2026-10-30: one row per part instead of the % table): the same totals as the
  // agent's (bucketStanding). Money not placed yet and items outside the split follow as plain rows.
  const standing = bucketStanding(b)
  const color: Record<string, string> = { safe: SEG_COLOR.safe, traditional: SEG_COLOR.traditional, crypto: SEG_COLOR.crypto }
  const line = (key: string, dot: string, name: string, right: ReactNode, note?: ReactNode) => (
    <li key={key} className="flex items-center justify-between gap-4 py-2 border-b border-[var(--line)]">
      <span className="flex items-center gap-2 text-[16px] leading-6" style={{ color: 'var(--ink)' }}><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />{name}</span>
      <span className="text-right tabular-nums">
        <span className="block text-[16px] leading-6">{right}</span>
        {note && <span className="block text-[14px] leading-5">{note}</span>}
      </span>
    </li>
  )
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Donut slices={goal} size={size} label={target ? `Target at ${b.age}${b.ageIsDefault ? ' (default)' : ''}` : 'Target (needs your age)'} center={target ? `${r(target.safe)}%` : '–'} sub="safety" />
        <Donut slices={now} size={size} label="Now" center={liquid > 0 ? `${r(shareOfLiquid(b, byGroup.safe))}%` : '–'} sub="safety" />
      </div>

      {walletOnly || (
        <ul className="flex flex-col [&>li:last-child]:border-b-0">
          {standing
            ? standing.map(x => line(x.key, color[x.key], x.name,
              <><strong style={{ color: 'var(--ink)' }}>{moneyUsd(x.have)}</strong> <span style={{ color: 'var(--subtle)' }}>of {moneyUsd(x.target)}</span></>,
              x.full ? <strong style={{ color: 'var(--success)' }}>Full</strong> : <span style={{ color: 'var(--subtle)' }}>{moneyUsd(x.left)} to go</span>))
            : (['safe', 'traditional', 'crypto'] as const).map(s => line(s, SEG_COLOR[s], SEG_NAME[s], <strong style={{ color: 'var(--ink)' }}>{moneyUsd(held[s])}</strong>))}
          {held.idle > 0.5 && line('idle', SEG_COLOR.idle, 'Not placed yet', <strong style={{ color: 'var(--ink)' }}>{moneyUsd(held.idle)}</strong>)}
          {grey > 0.5 && line('grey', SEG_COLOR.grey, 'Outside the split', <strong style={{ color: 'var(--ink)' }}>{moneyUsd(grey)}</strong>, <span style={{ color: 'var(--subtle)' }}>rental, business, loans given</span>)}
        </ul>
      )}
      {unpriced.length > 0 && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          No price yet{prices.error ? ' (price source failing)' : ''}, left out for now: {unpriced.map(h => h.name).join(', ')}.
        </p>
      )}
    </div>
  )
}
