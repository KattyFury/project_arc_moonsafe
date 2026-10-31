// Cash flow by the MoonSafe framework (spec 6): income (active / passive / irregular), spending, debt payments per month, the
// monthly surplus and the "Passive / Spending" bar (100% is financial freedom). Balance Sheet v2 (Hieu, 2026-10-31): cash flow and
// debt are one block, because together they size the emergency fund; `full` adds each debt and the fund target under the lines.
// Used on Balance and in the chat (show_cashflow).

import { useApp } from '@/state/AppState'
import { KB } from '@/kb/kb'

export function CashflowCard({ compact = false, full = false }: { compact?: boolean; full?: boolean }) {
  const { balance, moneyUsd } = useApp()
  const cf = balance.cashflow
  const ratio = cf.passiveRatio
  const free = ratio !== null && ratio >= 1
  // Income, Spending and Debt payments are the main lines: bold, in ink (black). What sits under them (Active, Passive, Irregular,
  // each debt) is secondary: regular weight in `grey` (--subtle, the brand's secondary text colour), indented.
  // 'value' keeps the older look for the results (Surplus, the fund target): grey label, bold value.
  const row = (label: string, value: string, kind: 'main' | 'sub' | 'value' | 'plain' = 'plain') => (
    <div key={label} className={`flex justify-between gap-2 text-[14px] leading-5 ${kind === 'main' ? 'font-semibold' : ''}`}>
      <span className={`min-w-0 truncate ${kind === 'sub' ? 'pl-2' : ''}`} style={{ color: kind === 'main' ? 'var(--ink)' : 'var(--subtle)' }}>{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${kind === 'value' ? 'font-semibold' : ''}`} style={{ color: kind === 'sub' ? 'var(--subtle)' : 'var(--ink)' }}>{value}</span>
    </div>
  )
  if (cf.income === null && cf.spending === null && !balance.debts.lines.length) return <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Tell the agent what you earn, spend and owe in a month.</p>
  // Spending here is without the debt payments, which get their own line (the form asks spending "not counting debt payments").
  const living = cf.spending === null ? null : cf.spending - cf.debtPayments
  const debtName = (l: typeof balance.debts.lines[number]) => [l.debt.name, KB.debt_types.find(t => t.key === l.debt.type)?.label ?? 'type not told yet']
    .filter((x, k, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === k).join(', ') + (l.debt.ratePct !== null ? `, ${l.debt.ratePct}%` : '')
  const fund = balance.fund
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        {row('Income', cf.income === null ? '–' : moneyUsd(cf.income), 'main')}
        {!compact && cf.income !== null && <>{row('Active', moneyUsd(cf.active), 'sub')}{cf.passive > 0 && row('Passive', moneyUsd(cf.passive), 'sub')}{cf.irregular > 0 && row('Irregular', moneyUsd(cf.irregular), 'sub')}</>}
        {row('Spending', living === null ? '–' : moneyUsd(living), 'main')}
        {row('Debt payments', moneyUsd(cf.debtPayments), 'main')}
        {full && balance.debts.lines.slice(0, 3).map(l => row(debtName(l), `${moneyUsd(l.usd)}${l.monthlyUsd !== null ? `, ${moneyUsd(l.monthlyUsd)}/mo` : ''}`, 'sub'))}
        {full && balance.debts.lines.length > 3 && row(`+${balance.debts.lines.length - 3} more`, '', 'sub')}
      </div>
      {row('Left each month', cf.surplus === null ? '–' : moneyUsd(cf.surplus), 'value')}
      {full && row('Emergency fund target', fund.floorUsd === null ? 'needs your spending' : `${moneyUsd(fund.floorUsd)}, ${fund.floorMonths} months`, 'value')}
      {ratio !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[14px] leading-5">
            <span style={{ color: 'var(--subtle)' }}>Passive / Spending</span>
            <span className="font-semibold tabular-nums" style={{ color: free ? 'var(--success)' : 'var(--ink)' }}>{Math.round(ratio * 100)}%{free ? ', financial freedom' : ''}</span>
          </div>
          <div className="h-2 rounded-full" style={{ background: 'var(--surface-muted)' }} role="img" aria-label={`Passive income covers ${Math.round(ratio * 100)}% of spending`}>
            <div className="fill-in h-full rounded-full" style={{ width: `${Math.min(100, ratio * 100)}%`, background: free ? 'var(--success)' : 'var(--accent)' }} />
          </div>
        </div>
      )}
    </div>
  )
}
