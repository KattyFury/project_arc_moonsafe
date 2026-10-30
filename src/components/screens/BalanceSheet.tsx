// Balance sheet v2 (docs/SPEC-BALANCE-SHEET-v2-2026-10-30.md): the emergency fund against its floor, then the three parts at today's
// prices, each against the part furthest ahead of its share (the anchor) with 5/25 bands. No net worth, no "can use now"; cash flow,
// debts, home and car are left out of this screen (cash flow becomes its own module later). Everything comes from the chat; nothing
// is typed here. Fits 393×852 and 1440×900. The Chat tab is always in the nav, so there is no extra "talk to the agent" button here.

import { useApp } from '@/state/AppState'
import { DASH, formatNumber } from '@/lib/format'
import { appWalletHolding } from '@/lib/profile'
import { GlassCard, Notice, Screen, Stats, Title } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

export function BalanceSheet(_: { onOpenChat: () => void }) {
  const { profile, fx, balance: b, moneyUsd } = useApp()
  const known = profile.known
  const fundFull = b.fund.floorUsd !== null && b.fund.met
  const fundSub = b.fund.floorUsd === null ? 'Needs your spending' : fundFull ? 'Full' : `${formatNumber(b.fund.months ?? 0)} of ${b.fund.floorMonths} months`

  return (
    <Screen>
      <Title>Balance sheet</Title>

      {!known && <Notice tone="warning" title="Your balance sheet is empty">Talk to the agent in the Chat tab. It fills in as you share.</Notice>}
      {known && fx.vndPerUsd === null && <Notice tone="warning">No exchange rate yet, figures in VND show “–” for now.</Notice>}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-4">
          <Stats items={[{ label: 'Emergency fund', value: b.fundUsd === null ? DASH : moneyUsd(b.fundUsd), sub: fundSub, good: fundFull }]} />
          {b.walletSeen !== null && b.walletSeen >= 1 && (appWalletHolding(profile.profile)?.value ?? 0) < b.walletSeen - 1 && (
            <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
              This wallet holds {moneyUsd(Math.floor(b.walletSeen))}. Only what you tell the agent counts here, so say how much of it is yours.
            </p>
          )}
        </div>
        <GlassCard className="flex flex-col gap-2 p-4 lg:p-8 lg:col-span-8">
          <h3 className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>Your split</h3>
          <AllocationPies compact={!known} />
        </GlassCard>
      </div>
    </Screen>
  )
}
