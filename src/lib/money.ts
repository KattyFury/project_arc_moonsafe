// Dollar amounts and a part's standing, written one way everywhere (Hieu, 2026-11-06).
// Pure module with no imports: shared by the app, the agent (functions/) and scripts.

/** Cents always show both digits ($40.70, never $40.7); whole amounts stay whole ($40); $100 and up round to the dollar. */
export function usd(n: number): string {
  const a = Math.abs(n)
  const big = a >= 100
  const hasCents = !big && Math.round(a * 100) % 100 !== 0
  const s = new Intl.NumberFormat('en-US', { maximumFractionDigits: big ? 0 : 2, minimumFractionDigits: hasCents ? 2 : 0 }).format(a)
  return `${n < 0 ? '-' : ''}$${s}`
}

/** The fields of a part's standing this needs (allocation.ts Standing). */
export interface StandingLike { share: number; have: number; target: number; left: number; full: boolean; anchor: boolean }

/**
 * What is left first, then where it stands (Hieu, 2026-11-06): "$30 to go (now $10 / $40)".
 * The part furthest ahead sets the size; a full part says so; a 0% part is not in their split.
 */
export function standingText(r: StandingLike, vi = false, show: (n: number) => string = usd): string {
  if (r.share <= 0) return vi ? `${show(r.have)}: không nằm trong tỷ lệ bạn chọn` : `${show(r.have)}: not in your split` // lang-ok
  if (r.anchor) return vi ? `${show(r.have)}: phần đi xa nhất theo tuổi, làm mốc cho các phần khác` : `${show(r.have)}: furthest ahead for your age, so it sets the size` // lang-ok
  if (r.full || r.left <= 0.005) return vi ? `đủ (hiện ${show(r.have)} / ${show(r.target)})` : `full (now ${show(r.have)} / ${show(r.target)})` // lang-ok
  return vi ? `còn ${show(r.left)} (hiện ${show(r.have)} / ${show(r.target)})` : `${show(r.left)} to go (now ${show(r.have)} / ${show(r.target)})` // lang-ok
}
