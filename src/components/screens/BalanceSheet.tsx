// Balance sheet by the MoonSafe framework (spec 11), Balance Sheet v2 (Hieu, 2026-10-31): the emergency fund against its floor, then
// two views. Split = Safety, Traditional and Crypto as bars by value, sized by the part furthest ahead (no net worth, no total asked).
// Cash flow = income, spending, debt payments and each debt in one block, with the emergency fund target they size. Everything comes
// from the chat; nothing is typed here. Mobile fits 393×852 with a two-way toggle; desktop shows both at once (1440×900). The Chat tab
// is always in the nav, so there is no extra "talk to the agent" button here.

import { useState, type ReactNode } from 'react'
import { useApp } from '@/state/AppState'
import { DASH, formatNumber } from '@/lib/format'
import { appWalletHolding } from '@/lib/profile'
import { GlassCard, Notice, Screen, Stats, Title, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'
import { CashflowCard } from '@/components/ui/CashflowCard'

type View = 'alloc' | 'flow'

/** Section heading: body face, sentence case (no tracked capitals; Hieu, 2026-10-30). */
const Heading = ({ children }: { children: ReactNode }) => <h3 className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{children}</h3>

export function BalanceSheet(_: { onOpenChat: () => void }) {
  const { profile, fx, balance: b, moneyUsd } = useApp()
  const [view, setView] = useState<View>('alloc')
  const known = profile.known
  const fundFull = b.fund.floorUsd !== null && b.fund.met
  const fundSub = b.fund.floorUsd === null ? 'Needs your spending' : fundFull ? 'Full' : `${formatNumber(b.fund.months ?? 0)} of ${b.fund.floorMonths} months`

  return (
    <Screen>
      <Title>Balance sheet</Title>

      {!known && <Notice tone="warning" title="Your balance sheet is empty">Talk to the agent in the Chat tab. It fills in as you share.</Notice>}
      {known && fx.vndPerUsd === null && <Notice tone="warning">No exchange rate yet, figures in VND show “–” for now.</Notice>}

      <Stats items={[
        { label: 'Emergency fund', value: b.fundUsd === null ? DASH : moneyUsd(b.fundUsd), sub: fundSub, good: fundFull },
      ]} />

      {b.walletSeen !== null && b.walletSeen >= 1 && (appWalletHolding(profile.profile)?.value ?? 0) < b.walletSeen - 1 && (
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          This wallet holds {moneyUsd(Math.floor(b.walletSeen))}. Only what you tell the agent counts here, so say how much of it is yours.
        </p>
      )}

      <div className="lg:hidden">
        <Toggle value={view} onChange={setView} options={[{ value: 'alloc', label: 'Split' }, { value: 'flow', label: 'Cash flow' }]} />
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <GlassCard className={`${view === 'alloc' ? 'flex' : 'hidden lg:flex'} flex-col gap-2 p-4 lg:p-6 lg:col-span-7`}>
          <div className="hidden lg:block"><Heading>Split</Heading></div>
          <AllocationPies compact={!known} />
        </GlassCard>

        {/* Cash flow and debt are one block: together they size the emergency fund. */}
        <GlassCard className={`${view === 'flow' ? 'flex' : 'hidden lg:flex'} flex-col gap-2 p-4 lg:p-6 lg:col-span-5`}>
          <div className="hidden lg:block"><Heading>Cash flow</Heading></div>
          <CashflowCard full />
        </GlassCard>
      </div>
    </Screen>
  )
}
