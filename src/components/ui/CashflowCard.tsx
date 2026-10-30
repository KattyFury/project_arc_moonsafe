// Cash flow by the MoonSafe framework (spec 6): income (active / passive / irregular), spending
// (fixed incl. debt payments / variable) per month, the monthly surplus and the "Passive / Spending" bar;
// 100% is financial freedom. Used on Balance and in the chat (show_cashflow).

import { useApp } from '@/state/AppState'

export function CashflowCard({ compact = false }: { compact?: boolean }) {
  const { balance, moneyUsd } = useApp()
  const cf = balance.cashflow
  const ratio = cf.passiveRatio
  const free = ratio !== null && ratio >= 1
  // Income and Spending are the main lines: bold, in ink (black). What sits under them (Active, Passive, Irregular,
  // Fixed, Variable) is secondary: regular weight in `grey` (--subtle, the brand's secondary text colour), indented.
  // 'value' keeps the older look for the results (Surplus): grey label, bold value.
  const row = (label: string, value: string, kind: 'main' | 'sub' | 'value' | 'plain' = 'plain') => (
    <div className={`flex justify-between gap-2 text-[14px] leading-5 ${kind === 'main' ? 'font-semibold' : ''}`}>
      <span className={`whitespace-nowrap ${kind === 'sub' ? 'pl-2' : ''}`} style={{ color: kind === 'main' ? 'var(--ink)' : 'var(--subtle)' }}>{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${kind === 'value' ? 'font-semibold' : ''}`} style={{ color: kind === 'sub' ? 'var(--subtle)' : 'var(--ink)' }}>{value}</span>
    </div>
  )
  if (cf.income === null && cf.spending === null) return <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Tell the agent what you earn and spend in a month.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className={compact ? 'flex flex-col gap-1' : 'grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-1'}>
        <div className="flex flex-col gap-1">
          {row('Income', cf.income === null ? '–' : moneyUsd(cf.income), 'main')}
          {!compact && <>{row('Active', moneyUsd(cf.active), 'sub')}{row('Passive', moneyUsd(cf.passive), 'sub')}{row('Irregular', moneyUsd(cf.irregular), 'sub')}</>}
        </div>
        <div className="flex flex-col gap-1">
          {row('Spending', cf.spending === null ? '–' : moneyUsd(cf.spending), 'main')}
          {!compact && <>{row('Fixed, incl. debt', moneyUsd(cf.fixed), 'sub')}{row('Variable', moneyUsd(cf.variable), 'sub')}</>}
        </div>
      </div>
      {row('Surplus / month', cf.surplus === null ? '–' : moneyUsd(cf.surplus), 'value')}
      {ratio !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[14px] leading-5">
            <span style={{ color: 'var(--subtle)' }}>Passive / Spending</span>
            <span className="font-semibold tabular-nums" style={{ color: free ? 'var(--success)' : 'var(--ink)' }}>{Math.round(ratio * 100)}%{free ? ' · financial freedom' : ''}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'var(--surface-muted)' }} role="img" aria-label={`Passive income covers ${Math.round(ratio * 100)}% of spending`}>
            <div className="fill-in h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: free ? 'var(--success)' : 'var(--accent)' }} />
          </div>
        </div>
      )}
    </div>
  )
}
