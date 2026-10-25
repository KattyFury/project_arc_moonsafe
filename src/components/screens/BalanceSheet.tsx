// Balance sheet. Allocation is the default view (user, 2026-10-25). Overview: total assets split offchain / onchain, what the agent
// knows, the emergency fund in months, the suggested split by age and the allocation chart.
// Allocation: the full chart with amounts. Every figure the agent has recorded shows at once;
// a figure that still lacks an input shows "–".

import { useState } from 'react'
import { useApp } from '@/state/AppState'
import { DASH, formatNumber } from '@/lib/format'
import { Btn, Caps, Col, GlassCard, Grid, Notice, Screen, Stats, Title, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

export function BalanceSheet({ onOpenChat }: { onOpenChat: () => void }) {
  const { profile, vault, cirBtc, fx, math, alloc, money, moneyOfField, fieldUsdc } = useApp()
  const [view, setView] = useState<'overview' | 'alloc'>('alloc')
  const p = profile.profile
  const known = !!p && ((['monthlyIncome', 'monthlyExpenses', 'debtAmount', 'otherAssets', 'age', 'incomeStable'] as const).some(k => p[k] !== null) || !!p.holdings?.length)

  const cirValue = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const other = p?.otherAssets ? fieldUsdc(p, 'otherAssets') : 0n
  const vb = vault.vaultBalance
  const wb = vault.walletBalance
  // Onchain = what the app reads on Arc; offchain = what the user told the agent, at live prices.
  const onchain = vb !== null && wb !== null && cirValue !== null ? vb + wb + cirValue : null
  const declared = BigInt(Math.round(alloc.parts.filter(x => x.holding).reduce((s, x) => s + x.usd, 0) * 1_000_000))
  const offchain = other !== null ? declared + other : null
  const total = onchain !== null && offchain !== null ? onchain + offchain : null
  const fundMonths = math.monthlyExpUsdc && vb !== null ? Number(vb) / Number(math.monthlyExpUsdc) : null
  const chatLabel = known ? 'Update with the agent' : 'Talk to the agent'

  return (
    <Screen>
      <Title>Balance sheet</Title>

      {!known && (
        <Notice tone="warning" title="Your balance sheet is empty">Talk to the agent in the Chat tab. It fills in as you share.</Notice>
      )}
      {known && fx.vndPerUsd === null && <Notice tone="warning">No exchange rate yet, converted figures show “–” for now.</Notice>}
      {known && fx.stale && fx.fetchedAt && <Notice tone="warning">Using the exchange rate from {new Date(fx.fetchedAt).toLocaleDateString('en-US')}.</Notice>}

      <Toggle value={view} onChange={setView} options={[{ value: 'alloc', label: 'Allocation' }, { value: 'overview', label: 'Overview' }]} />

      {view === 'alloc' ? (
        <Grid>
          <Col span={7}><GlassCard className="p-4 lg:p-8"><AllocationPies /></GlassCard></Col>
          <Col span={5}>
            <p className="hidden lg:block text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
              Safe is bank savings or flexible earn (such as Binance Simple Earn Flexible). Invest is stocks & gold, BTC and altcoins. Idle is money not put to work yet: wallet USDC and cash. Tell the agent what you hold and the app prices it live.
            </p>
            <Btn variant="outline" onClick={onOpenChat}>{chatLabel}</Btn>
          </Col>
        </Grid>
      ) : (
      <Grid>
        <Col span={6}>
          <GlassCard className="p-4 lg:p-8 flex flex-col gap-2">
            <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Total assets</span>
            <span className="font-bold text-[32px] leading-10 tabular-nums break-words" style={{ color: 'var(--ink)' }}>{money(total)}</span>
            <div title="Onchain: wallet, fund and cirBTC. Offchain: what you told the agent.">
              <Stats items={[
                { label: 'Offchain', value: money(offchain) },
                { label: 'Onchain', value: money(onchain) },
              ]} />
            </div>
          </GlassCard>
          <Stats items={[
            { label: 'Emergency fund', value: vb === null ? DASH : <>{money(vb)}{fundMonths !== null && <span style={{ color: 'var(--subtle)' }}> ({formatNumber(fundMonths)} months)</span>}</> },
            { label: 'Suggested split', value: alloc.target ? `${alloc.target.safePct}% safe / ${alloc.target.investPct}% invest` : 'Needs your age' },
          ]} />
          {/* Mobile: chart under the totals. Desktop: chart heads the right column so both columns fit 900. */}
          <GlassCard className="p-4 lg:hidden"><AllocationPies compact /></GlassCard>
        </Col>

        <Col span={6}>
          <GlassCard className="hidden lg:block lg:p-8"><AllocationPies compact /></GlassCard>
          {known && p && (
            <div className="flex flex-col gap-2">
              <Caps>What the agent knows</Caps>
              <Stats items={[
                { label: 'Income', value: moneyOfField(p, 'monthlyIncome') },
                { label: 'Spending', value: moneyOfField(p, 'monthlyExpenses') },
                { label: 'Debt', value: p.debtAmount === 0 ? 'None' : moneyOfField(p, 'debtAmount') },
              ]} />
              <Stats items={[
                { label: 'Age', value: p.age ?? DASH },
                { label: 'Income is', value: p.incomeStable === null ? DASH : p.incomeStable ? 'Stable' : 'Irregular' },
                { label: 'Other assets', value: moneyOfField(p, 'otherAssets') },
              ]} />
            </div>
          )}
          {/* Mobile has the Chat tab right above; the button stays on desktop only, so the screen fits 852. */}
          <Btn variant="outline" className="hidden lg:flex" onClick={onOpenChat}>{chatLabel}</Btn>
        </Col>
      </Grid>
      )}
    </Screen>
  )
}
