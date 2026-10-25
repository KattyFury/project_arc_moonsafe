// Balance sheet by the MoonSafe framework (spec 11), in its order: net worth and liquid assets,
// the allocation chart (six groups + grey slice, % of liquid vs target and % of net worth), the
// emergency fund against its floor, cash flow with "Passive / Spending", each debt, then lifestyle
// assets and items that cannot be rebalanced. Everything comes from the chat; nothing is typed here.
// Mobile fits 393×852 with a three-way toggle; desktop shows everything at once (1440×900). The Chat
// tab is always in the nav, so there is no extra "talk to the agent" button here.

import { useState } from 'react'
import { useApp } from '@/state/AppState'
import { KB } from '@/kb/kb'
import { DASH, formatNumber } from '@/lib/format'
import { Caps, GlassCard, Notice, Screen, Stats, Title, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'
import { CashflowCard } from '@/components/ui/CashflowCard'

type View = 'alloc' | 'flow' | 'debt'

export function BalanceSheet(_: { onOpenChat: () => void }) {
  const { profile, fx, balance: b, moneyUsd } = useApp()
  const [view, setView] = useState<View>('alloc')
  const known = profile.known
  const show = (v: View) => view === v ? 'flex' : 'hidden lg:flex'
  const others = b.items.filter(i => i.place === 'lifestyle' || i.place === 'grey')
  const fundSub = b.fund.floorUsd !== null ? `${formatNumber(b.fund.months ?? 0)} / ${b.fund.floorMonths} months` : 'floor: needs spending'
  // Long lists fold into "+N more" so the screen still fits one frame; the agent has every item.
  const MAX_ROWS = 4
  const more = (n: number) => n > MAX_ROWS && <li className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>+{n - MAX_ROWS} more</li>
  const row = (key: string, left: string, right: string, strong = false) => (
    <li key={key} className={`flex justify-between gap-2 text-[14px] leading-5 ${strong ? 'font-semibold' : ''}`}>
      <span className="min-w-0 truncate" style={{ color: strong ? 'var(--ink)' : 'var(--subtle)' }}>{left}</span>
      <span className="tabular-nums whitespace-nowrap" style={{ color: 'var(--ink)' }}>{right}</span>
    </li>
  )

  return (
    <Screen>
      <Title>Balance sheet</Title>

      {!known && <Notice tone="warning" title="Your balance sheet is empty">Talk to the agent in the Chat tab. It fills in as you share.</Notice>}
      {known && fx.vndPerUsd === null && <Notice tone="warning">No exchange rate yet, figures in VND show “–” for now.</Notice>}

      <Stats items={[
        { label: 'Net worth', value: moneyUsd(b.netWorth) },
        { label: 'Liquid', value: moneyUsd(b.liquid) },
        { label: 'Fund', value: <>{b.fundUsd === null ? DASH : moneyUsd(b.fundUsd)} <span className="font-normal whitespace-nowrap" style={{ color: 'var(--subtle)' }}>{fundSub}</span></> },
      ]} />

      <div className="lg:hidden">
        <Toggle value={view} onChange={setView} options={[{ value: 'alloc', label: 'Allocation' }, { value: 'flow', label: 'Cash flow' }, { value: 'debt', label: 'Debts & other' }]} />
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <GlassCard className={`${show('alloc')} flex-col gap-2 p-4 lg:p-8 lg:col-span-7`}>
          <div className="hidden lg:block"><Caps>Allocation</Caps></div>
          <AllocationPies compact={!known} />
        </GlassCard>

        {/* Desktop: one card for cash flow, debts and the rest, so both columns fit 1440×900. */}
        <GlassCard className={`${view === 'alloc' ? 'hidden' : 'flex'} lg:flex flex-col gap-4 p-4 lg:p-6 lg:col-span-5`}>
          <section className={`${show('flow')} flex-col gap-2`}>
            <div className="hidden lg:block"><Caps>Cash flow</Caps></div>
            <CashflowCard />
          </section>

          <section className={`${show('debt')} flex-col gap-2`}>
            <Caps>Debts</Caps>
            {b.debts.lines.length ? (
              <ul className="flex flex-col gap-1">
                {b.debts.lines.slice(0, MAX_ROWS).map(l => row(l.debt.id,
                  `${[l.debt.name, KB.debt_types.find(t => t.key === l.debt.type)?.label ?? 'type not told yet'].filter((x, k, a) => a.findIndex(y => y.toLowerCase() === x.toLowerCase()) === k).join(' · ')}${l.debt.ratePct !== null ? ` · ${l.debt.ratePct}%` : ''}${l.priority ? ' · priority' : ''}`,
                  `${moneyUsd(l.usd)}${l.monthlyUsd !== null ? ` · ${moneyUsd(l.monthlyUsd)}/mo` : ''}`))}
                {more(b.debts.lines.length)}
                {row('total', 'Total', `${moneyUsd(b.debtTotal)} · ${moneyUsd(b.debts.monthly)}/mo`, true)}
              </ul>
            ) : <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>{profile.profile?.debtsComplete ? 'No debt.' : 'No debt told to the agent yet.'}</p>}
          </section>

          <section className={`${show('debt')} flex-col gap-2`}>
            <Caps>Lifestyle & not rebalanced</Caps>
            {others.length ? (
              <ul className="flex flex-col gap-1">
                {others.slice(0, MAX_ROWS).map(i => row(i.holding?.id ?? i.label, `${i.label} · ${i.place === 'lifestyle' ? 'lifestyle' : 'outside the split'}${i.holding?.loanStatus === 'overdue' ? ' · overdue' : ''}`, moneyUsd(i.usd)))}
                {more(others.length)}
              </ul>
            ) : <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Home, car, rental, business stakes, money lent: none told yet.</p>}
          </section>

        </GlassCard>
      </div>
    </Screen>
  )
}
