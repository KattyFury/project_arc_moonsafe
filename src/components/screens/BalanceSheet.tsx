// Screens 8 / 8b — Bảng cân đối (Figma: title, then cards 6 + 6 col on desktop). Shows every
// figure the agent has recorded so far, even before the profile is complete; a ratio
// that still lacks an input shows "–".

import { useState } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { DASH, formatNumber, formatPercent } from '@/lib/format'
import { Btn, Caps, Col, GlassCard, Grid, Notice, Row, Screen, Stats, Title, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

export function BalanceSheet({ onOpenChat }: { onOpenChat: () => void }) {
  const { profile, vault, cirBtc, fx, math, alloc, money, moneyOfField, fieldUsdc } = useApp()
  const [view, setView] = useState<'overview' | 'alloc'>('overview')
  const p = profile.profile
  const known = !!p && ((['monthlyIncome', 'monthlyExpenses', 'debtAmount', 'otherAssets', 'age', 'incomeStable'] as const).some(k => p[k] !== null) || !!p.holdings?.length)

  const cirValue = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const other = p?.otherAssets ? fieldUsdc(p, 'otherAssets') : 0n
  const debt = fieldUsdc(p, 'debtAmount')
  const vb = vault.vaultBalance
  const wb = vault.walletBalance
  // Declared holdings at live prices (wallet USDC and cirBTC are counted above, not here).
  const declared = BigInt(Math.round(alloc.parts.filter(x => x.holding).reduce((s, x) => s + x.usd, 0) * 1_000_000))

  const assets = vb !== null && wb !== null && cirValue !== null && other !== null ? vb + wb + cirValue + other + declared : null
  const netWorth = assets !== null && debt !== null ? assets - debt : null
  const liquidMonths = math.monthlyExpUsdc && vb !== null && wb !== null ? Number(vb + wb) / Number(math.monthlyExpUsdc) : null
  const debtRatio = assets !== null && debt !== null ? (assets > 0n ? (Number(debt) / Number(assets)) * 100 : debt > 0n ? null : 0) : null
  // Income and spending may be in different currencies (salary in USDC, rent in VND).
  const inc = fieldUsdc(p, 'monthlyIncome')
  const exp = fieldUsdc(p, 'monthlyExpenses')
  const savingRate = inc !== null && exp !== null && inc > 0n ? (Number(inc - exp) / Number(inc)) * 100 : null

  const good = 'var(--success)'
  const bad = 'var(--danger)'
  const mark = (ok: boolean | null) => ok === null ? null : ok
    ? <CheckCircle2 size={16} style={{ color: good }} />
    : <XCircle size={16} style={{ color: bad }} />
  const withMark = (text: string, ok: boolean | null) => <span className="inline-flex items-center gap-2">{text}{mark(ok)}</span>

  const liqOk = liquidMonths !== null && math.floorMonths ? liquidMonths >= math.floorMonths : null
  const chatLabel = known ? 'Update with the agent' : 'Talk to the agent'

  return (
    <Screen>
      <Title>Balance sheet</Title>

      {!known && (
        <Notice tone="warning" title="Your balance sheet is empty">Talk to the agent in the Chat tab. It fills in as you share.</Notice>
      )}
      {known && fx.vndPerUsd === null && <Notice tone="warning">No exchange rate yet, converted figures show “–” for now.</Notice>}
      {known && fx.stale && fx.fetchedAt && <Notice tone="warning">Using the exchange rate from {new Date(fx.fetchedAt).toLocaleDateString('en-US')}.</Notice>}

      <Toggle value={view} onChange={setView} options={[{ value: 'overview', label: 'Overview' }, { value: 'alloc', label: 'Allocation' }]} />

      {view === 'alloc' ? (
        <Grid>
          <Col span={7}><GlassCard className="p-4 lg:p-8"><AllocationPies /></GlassCard></Col>
          <Col span={5}>
            <p className="hidden lg:block text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
              Safe is bank savings. Invest is gold, stocks, coins and cirBTC. Idle is money not put to work yet: wallet USDC and cash. Tell the agent what you hold and the app prices it live.
            </p>
            <Btn variant="outline" onClick={onOpenChat}>{chatLabel}</Btn>
          </Col>
        </Grid>
      ) : (
      <Grid>
        <Col span={6} className="lg:order-2">
          <Stats items={[
            { label: 'Emergency fund', value: money(vb) },
            { label: 'Wallet', value: money(wb) },
            { label: 'cirBTC', value: cirBtc.balance === null ? DASH : money(cirValue) },
          ]} />
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
          <Btn variant="outline" className="hidden lg:flex" onClick={onOpenChat}>{chatLabel}</Btn>
        </Col>

        <Col span={6} className="lg:order-1">
          <GlassCard>
            <Row label="Net worth" sub="All assets − debt" value={<span className="whitespace-nowrap">{money(netWorth)}</span>} />
            <Row label="Liquidity" sub={math.floorMonths ? `Fund + wallet · ${math.floorMonths}-month floor` : 'Fund + wallet'}
              value={liquidMonths !== null ? withMark(`${formatNumber(liquidMonths)} months`, liqOk) : DASH}
              color={liqOk === null ? undefined : liqOk ? good : bad} />
            <Row label="Debt / assets" value={debtRatio !== null ? withMark(formatPercent(debtRatio), debtRatio === 0) : DASH}
              color={debtRatio === null ? undefined : debtRatio === 0 ? good : bad} />
            <Row label="Savings rate" sub="(Income − spending) / income" value={formatPercent(savingRate)} last />
          </GlassCard>
          <Btn variant="outline" className="lg:hidden" onClick={onOpenChat}>{chatLabel}</Btn>
        </Col>
      </Grid>
      )}
    </Screen>
  )
}
