// The three parts (Safety, Traditional, Crypto) as bars against their targets (Balance Sheet v2, docs/SPEC-BALANCE-SHEET-v2-2026-10-30.md),
// plus money not placed yet. The donuts were removed (Hieu, 2026-10-30, option 1a): they showed shares of a total, which v2 no longer has.
// Used on Balance, Invest and in the chat.

import type { ReactNode } from 'react'
import { useApp } from '@/state/AppState'
import { bucketStanding, type Standing } from '@/lib/allocation'

const SEG_COLOR = { safe: '#1baf7a', traditional: '#1E6DF7', crypto: '#eb6834', idle: '#eda100' }

export function AllocationPies() {
  const { balance: b, moneyUsd, prices } = useApp()
  const { target, byGroup, unpriced, declared } = b
  const held = { safe: byGroup.safe, traditional: byGroup.traditional, crypto: byGroup.btc + byGroup.large_cap + byGroup.altcoin, idle: byGroup.idle }
  const NAME = { safe: 'Safety', traditional: 'Traditional', crypto: 'Crypto' }
  const walletOnly = !declared && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Nothing is counted yet. Tell the agent what you hold, wallets included.</p>
  // Each part as a bar against its target (Balance Sheet v2, 2026-10-30): the part furthest ahead of its share sets the targets of
  // the others, so no bar goes past its end. Within the 5/25 band a part is on track; below it, what is left shows. Same numbers as
  // the agent's (bucketStanding). Money not placed yet follows as a plain row.
  const standing = bucketStanding(b)
  const color: Record<string, string> = { safe: SEG_COLOR.safe, traditional: SEG_COLOR.traditional, crypto: SEG_COLOR.crypto }
  const bar = (x: Standing) => {
    const p = x.target > 0 ? Math.min(1, x.have / x.target) : 0
    const onTrack = x.status !== 'under'
    return (
      <li key={x.key} className="py-3 flex flex-col gap-2 border-b border-[var(--line)]">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{x.name} <span className="font-normal" style={{ color: 'var(--subtle)' }}>{Math.round(x.share * 2) / 2}%</span></span>
          <span className="text-[16px] leading-6 tabular-nums"><strong style={{ color: 'var(--ink)' }}>{moneyUsd(x.have)}</strong>{x.target > 0 && <span style={{ color: 'var(--subtle)' }}> of {moneyUsd(x.target)}</span>}</span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }} role="img" aria-label={`${x.name}: ${Math.round(p * 100)}% of its target`}>
          <div className="fill-in absolute inset-y-0 left-0 rounded-full" style={{ width: `${p * 100}%`, background: color[x.key] }} />
        </div>
        <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          {onTrack ? <strong style={{ color: 'var(--success)' }}>On track</strong> : x.target > 0 ? <><strong style={{ color: 'var(--ink)' }}>{moneyUsd(x.left)}</strong> to go</> : 'Nothing yet'}
        </span>
      </li>
    )
  }
  const line = (key: string, dot: string, name: string, right: ReactNode) => (
    <li key={key} className="flex items-center justify-between gap-4 py-2 border-b border-[var(--line)]">
      <span className="flex items-center gap-2 text-[16px] leading-6" style={{ color: 'var(--ink)' }}><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dot }} />{name}</span>
      <span className="text-right tabular-nums text-[16px] leading-6">{right}</span>
    </li>
  )
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{target ? `Shares follow your age, ${b.age}${b.ageIsDefault ? ' (default)' : ''}, at today's prices. The part furthest ahead sets the targets for the others.` : 'Tell the agent your age to see your targets.'}</p>
      {walletOnly || (
        <ul className="flex flex-col [&>li:last-child]:border-b-0">
          {standing
            ? standing.map(bar)
            : (['safe', 'traditional', 'crypto'] as const).map(s => line(s, SEG_COLOR[s], NAME[s], <strong style={{ color: 'var(--ink)' }}>{moneyUsd(held[s])}</strong>))}
          {held.idle > 0.5 && line('idle', SEG_COLOR.idle, 'Not placed yet', <strong style={{ color: 'var(--ink)' }}>{moneyUsd(held.idle)}</strong>)}
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
