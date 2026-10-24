// Two donuts: the target split by age (safe = age %, invest = 100 − age %) and what the user
// holds now (safe / invest / idle), for the money outside the emergency fund. Used on Cân đối,
// Đầu tư and in the chat. Colours follow the entity (dataviz skill, validated 2026-10-24 on
// white: CVD ΔE ≥ 27); every slice also has a text label + amount, so colour is never alone.

import { useApp } from '@/state/AppState'
import { formatPercent } from '@/lib/format'
import type { Bucket } from '@/lib/allocation'

export const BUCKET_COLOR: Record<Bucket, string> = { safe: '#1baf7a', invest: '#1E6DF7', idle: '#eda100' }
export const BUCKET_NAME: Record<Bucket, string> = { safe: 'An toàn', invest: 'Đầu tư', idle: 'Nhàn rỗi' }
const ORDER: Bucket[] = ['safe', 'invest', 'idle']

function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (a: number) => [cx + r * Math.sin(a * 2 * Math.PI), cy - r * Math.cos(a * 2 * Math.PI)]
  const [x1, y1] = p(from), [x2, y2] = p(to)
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2} ${y2}`
}

/** Donut of shares (sum 1); a 2px white gap separates slices. */
function Donut({ slices, size, center, sub, label }: { slices: { bucket: Bucket; share: number; title: string }[]; size: number; center: string; sub?: string; label: string }) {
  const stroke = Math.round(size * 0.14)
  const r = (size - stroke) / 2
  const c = size / 2
  const shown = slices.filter(s => s.share > 0)
  let at = 0
  return (
    <figure className="flex flex-col items-center gap-2 min-w-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${shown.map(s => s.title).join(', ') || 'chưa có dữ liệu'}`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth={stroke} />
        {shown.length === 1
          ? <circle cx={c} cy={c} r={r} fill="none" stroke={BUCKET_COLOR[shown[0].bucket]} strokeWidth={stroke}><title>{shown[0].title}</title></circle>
          : shown.map(s => {
            const from = at, to = at + s.share
            at = to
            return (
              <g key={s.bucket}>
                <path d={arc(c, c, r, from, to)} fill="none" stroke={BUCKET_COLOR[s.bucket]} strokeWidth={stroke}><title>{s.title}</title></path>
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
 * compact = one row of two small donuts + a share legend (Đầu tư and the chat). The full
 * version (Cân đối) adds amounts and the idle-money suggestion; its per-asset list shows on
 * desktop only, so the screen still fits 393×852 without scrolling.
 */
export function AllocationPies({ compact = false }: { compact?: boolean }) {
  const { alloc, moneyUsd, prices, profile } = useApp()
  const { target, total, suggest, unpriced } = alloc
  const size = compact ? 80 : 128
  const pct = (v: number) => total > 0 ? (v / total) * 100 : 0
  const now = ORDER.map(b => ({ bucket: b, share: total > 0 ? alloc[b] / total : 0, title: `${BUCKET_NAME[b]} ${formatPercent(pct(alloc[b]))}` }))
  const goal = target ? [
    { bucket: 'safe' as const, share: target.safePct / 100, title: `An toàn ${target.safePct}%` },
    { bucket: 'invest' as const, share: target.investPct / 100, title: `Đầu tư ${target.investPct}%` },
  ] : []

  if (compact) return (
    // One row: target donut, current donut, legend (centre shows the invest share). In a narrow
    // place (the chat bubble column) the legend wraps under the donuts instead of truncating.
    <div className="flex flex-wrap items-center gap-2">
      <Donut slices={goal} size={size} label="Mục tiêu" center={target ? `${target.investPct}%` : '–'} />
      <Donut slices={now} size={size} label="Hiện tại" center={total > 0 ? formatPercent(pct(alloc.invest), 0) : '–'} />
      <ul className="flex-1 min-w-[152px] flex flex-col gap-1">
        {ORDER.map(b => (
          <li key={b} className="flex items-center gap-2 text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BUCKET_COLOR[b] }} />
            <span className="truncate">{BUCKET_NAME[b]}</span>
            <span className="ml-auto font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--ink)' }}>
              {total > 0 ? formatPercent(pct(alloc[b]), 0) : '–'}{target && b !== 'idle' ? ` / ${b === 'safe' ? target.safePct : target.investPct}%` : ''}
            </span>
          </li>
        ))}
        <li className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Giữa vòng: % đầu tư</li>
      </ul>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Donut slices={goal} size={size} label={target ? `Mục tiêu theo tuổi ${profile.profile?.age}` : 'Mục tiêu (cần biết tuổi)'}
          center={target ? `${target.investPct}%` : '–'} sub="đầu tư" />
        <Donut slices={now} size={size} label="Hiện tại" center={total > 0 ? formatPercent(pct(alloc.invest), 0) : '–'} sub="đầu tư" />
      </div>

      {/* Legend: colour + name + share + amount, so no slice relies on colour alone. */}
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map(b => (
          <div key={b} className="p-2 rounded-2xl flex flex-col min-w-0" style={{ background: 'var(--surface-muted)' }}>
            <span className="inline-flex items-center gap-2 text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: BUCKET_COLOR[b] }} />{BUCKET_NAME[b]}
            </span>
            <span className="text-[14px] leading-5 font-semibold tabular-nums break-words" style={{ color: 'var(--ink)' }}>{moneyUsd(alloc[b])}</span>
            <span className="text-[14px] leading-5 tabular-nums" style={{ color: 'var(--subtle)' }}>
              {total > 0 ? formatPercent(pct(alloc[b]), 0) : '–'}{target && b !== 'idle' ? ` / ${b === 'safe' ? target.safePct : target.investPct}%` : ''}
            </span>
          </div>
        ))}
      </div>

      {suggest && (suggest.toSafe >= 0.01 || suggest.toInvest >= 0.01) && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          Tiền nhàn rỗi để đúng mục tiêu: <strong style={{ color: 'var(--ink)' }}>{moneyUsd(suggest.toSafe)}</strong> vào an toàn, <strong style={{ color: 'var(--ink)' }}>{moneyUsd(suggest.toInvest)}</strong> vào đầu tư.
        </p>
      )}
      {alloc.parts.length > 0 && (
        <p className="hidden lg:block text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          {alloc.parts.map(p => `${p.label} ${moneyUsd(p.usd)}`).join(' · ')}
        </p>
      )}
      {unpriced.length > 0 && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          Chưa có giá{prices.error ? ' (nguồn giá đang lỗi)' : ''}, tạm chưa tính: {unpriced.map(h => h.symbol ?? (h.kind === 'gold' ? 'vàng SJC' : h.kind)).join(', ')}.
        </p>
      )}
      <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Tính trên tiền ngoài quỹ dự phòng. Quỹ giữ riêng, không chia.</p>
    </div>
  )
}
