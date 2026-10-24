// Two donuts: the target split by age and what the user holds now, for the money outside the
// emergency fund. The invest part shows its three kinds (stocks & gold, BTC, altcoins; the
// MoonSafe view by age, docs/FRAMEWORK-TAI-CHINH.md). Used on Balance, Invest and in the chat.
// Colours follow the entity (dataviz skill, validated 2026-10-24 on white in this ring order:
// worst adjacent CVD ΔE 27.3); every slice also has a text label + share, so colour is never alone.

import { useApp } from '@/state/AppState'
import { formatPercent } from '@/lib/format'
import { INVEST_CLASS_LABEL } from '@/lib/allocation'

type Segment = 'safe' | 'stocks' | 'btc' | 'altcoin' | 'idle'

const SEG_COLOR: Record<Segment, string> = { safe: '#1baf7a', stocks: '#1E6DF7', btc: '#eb6834', altcoin: '#6250d6', idle: '#eda100' }
const SEG_NAME: Record<Segment, string> = { safe: 'Safe', stocks: INVEST_CLASS_LABEL.stocks, btc: INVEST_CLASS_LABEL.btc, altcoin: INVEST_CLASS_LABEL.altcoin, idle: 'Idle' }
const ORDER: Segment[] = ['safe', 'stocks', 'btc', 'altcoin', 'idle']
const SUGGEST_NAME = { stocks: 'stocks & gold', btc: 'BTC', altcoin: 'altcoins' } as const

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
          <text x={c} y={c - 2} textAnchor="middle" className="font-bold tabular-nums" style={{ fontSize: Math.round(size * 0.18), fill: 'var(--ink)' }}>{center}</text>
          <text x={c} y={c + Math.round(size * 0.14)} textAnchor="middle" style={{ fontSize: 14, fill: 'var(--subtle)' }}>{sub}</text>
        </> : <text x={c} y={c} dy="0.35em" textAnchor="middle" className="font-bold tabular-nums" style={{ fontSize: 16, fill: 'var(--ink)' }}>{center}</text>}
      </svg>
      <figcaption className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{label}</figcaption>
    </figure>
  )
}

/**
 * compact = one row of two small donuts + a share legend (Invest and the chat). The full
 * version (Balance) adds amounts and the idle-money suggestion; its per-asset list shows on
 * desktop only, so the screen still fits 393×852 without scrolling.
 */
export function AllocationPies({ compact = false }: { compact?: boolean }) {
  const { alloc, moneyUsd, prices, profile } = useApp()
  const { target, total, suggest, unpriced, mix, byClass, suggestInvest, declared } = alloc
  const size = compact ? 72 : 128
  const pct = (v: number) => total > 0 ? (v / total) * 100 : 0
  const held: Record<Segment, number> = { safe: alloc.safe, stocks: byClass.stocks, btc: byClass.btc, altcoin: byClass.altcoin, idle: alloc.idle }
  const goalPct: Partial<Record<Segment, number>> = target && mix ? { safe: target.safePct, ...mix } : {}
  const now = ORDER.map(s => ({ seg: s, share: total > 0 ? held[s] / total : 0, title: `${SEG_NAME[s]} ${formatPercent(pct(held[s]))}` }))
  const goal = ORDER.filter(s => goalPct[s] !== undefined).map(s => ({ seg: s, share: goalPct[s]! / 100, title: `${SEG_NAME[s]} ${goalPct[s]}%` }))
  // Now / target; compact drops the spaces and the first % so five rows fit beside the donuts.
  const share = (s: Segment) => {
    const n = total > 0 ? Math.round(pct(held[s])) : null
    const t = goalPct[s]
    if (compact) return t !== undefined ? `${n ?? '–'}/${t}%` : `${n ?? '–'}%`
    return `${n !== null ? `${n}%` : '–'}${t !== undefined ? ` / ${t}%` : ''}`
  }
  // Without what the user holds elsewhere, the wallet is not the whole picture.
  const walletOnly = !declared && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Only your app wallet is counted. Tell the agent what else you hold (savings, cash, gold, stocks, coins).</p>

  const legend = (
    // Full version on desktop: two columns, so Balance fits 1440×900.
    <ul className={compact ? 'flex flex-col gap-1' : 'grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-3 lg:grid-flow-col gap-x-8 gap-y-1'}>
      {ORDER.map(s => (
        <li key={s} className="flex items-center gap-2 text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: SEG_COLOR[s] }} />
          <span className="truncate">{SEG_NAME[s]}</span>
          {!compact && <span className="tabular-nums whitespace-nowrap">{moneyUsd(held[s])}</span>}
          <span className="ml-auto font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink)' }}>{share(s)}</span>
        </li>
      ))}
    </ul>
  )

  if (compact) return (
    // One row: target donut, current donut, legend (centre shows the invest share). In a narrow
    // place (the chat bubble column) the legend wraps under the donuts instead of truncating.
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Donut slices={goal} size={size} label="Target" center={target ? `${target.investPct}%` : '–'} />
        <Donut slices={now} size={size} label="Now" center={total > 0 ? formatPercent(pct(alloc.invest), 0) : '–'} />
        <div className="flex-1 min-w-[144px]" title="Share now / target. Centre: % invested">{legend}</div>
      </div>
      {walletOnly}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Donut slices={goal} size={size} label={target ? `Target at age ${profile.profile?.age}` : 'Target (needs your age)'}
          center={target ? `${target.investPct}%` : '–'} sub="invested" />
        <Donut slices={now} size={size} label="Now" center={total > 0 ? formatPercent(pct(alloc.invest), 0) : '–'} sub="invested" />
      </div>

      {/* Legend: colour + name + amount + share now / target, so no slice relies on colour alone. */}
      {legend}

      {walletOnly || (suggest && (suggest.toSafe >= 0.01 || suggest.toInvest >= 0.01) && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          To reach the target with idle money: <strong style={{ color: 'var(--ink)' }}>{moneyUsd(suggest.toSafe)}</strong> to your bank savings
          {suggestInvest
            ? <>{(['stocks', 'btc', 'altcoin'] as const).filter(c => suggestInvest[c] >= 0.01).map(c => <span key={c}>, <strong style={{ color: 'var(--ink)' }}>{moneyUsd(suggestInvest[c])}</strong> {SUGGEST_NAME[c]}</span>)}.</>
            : <>, <strong style={{ color: 'var(--ink)' }}>{moneyUsd(suggest.toInvest)}</strong> to invest.</>}
        </p>
      ))}
      {alloc.parts.length > 0 && (
        <p className="hidden lg:block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          {alloc.parts.map(p => `${p.label} ${moneyUsd(p.usd)}`).join(' · ')}
        </p>
      )}
      {unpriced.length > 0 && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          No price yet{prices.error ? ' (price source failing)' : ''}, left out for now: {unpriced.map(h => h.symbol ?? h.kind).join(', ')}.
        </p>
      )}
      <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Money outside the emergency fund (it stays separate). Invest split by age is MoonSafe's view; its crypto share is above what institutions suggest (0–5%).</p>
    </div>
  )
}
