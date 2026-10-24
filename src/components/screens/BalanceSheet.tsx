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
  const chatLabel = known ? 'Cập nhật với agent' : 'Trò chuyện với agent'

  return (
    <Screen>
      <Title>Bảng cân đối</Title>

      {!known && (
        <Notice tone="warning" title="Bảng cân đối đang trống">Trò chuyện với agent ở tab Chat. Bạn kể đến đâu, bảng tự điền đến đó.</Notice>
      )}
      {known && fx.vndPerUsd === null && <Notice tone="warning">Chưa lấy được tỉ giá, các số quy đổi tạm hiện “–”.</Notice>}
      {known && fx.stale && fx.fetchedAt && <Notice tone="warning">Đang dùng tỉ giá cũ ngày {new Date(fx.fetchedAt).toLocaleDateString('vi-VN')}.</Notice>}

      <Toggle value={view} onChange={setView} options={[{ value: 'overview', label: 'Tổng quan' }, { value: 'alloc', label: 'Phân bổ' }]} />

      {view === 'alloc' ? (
        <Grid>
          <Col span={7}><GlassCard className="p-4 lg:p-8"><AllocationPies /></GlassCard></Col>
          <Col span={5}>
            <p className="hidden lg:block text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
              An toàn là tiền gửi tiết kiệm. Đầu tư là vàng, cổ phiếu, coin, cirBTC. Nhàn rỗi là tiền chưa phân bổ: USDC trong ví và tiền mặt. Kể với agent tài sản bạn đang có, app tự lấy giá.
            </p>
            <Btn variant="outline" onClick={onOpenChat}>{chatLabel}</Btn>
          </Col>
        </Grid>
      ) : (
      <Grid>
        <Col span={6} className="lg:order-2">
          <Stats items={[
            { label: 'Quỹ dự phòng', value: money(vb) },
            { label: 'Ví', value: money(wb) },
            { label: 'cirBTC', value: cirBtc.balance === null ? DASH : money(cirValue) },
          ]} />
          {known && p && (
            <div className="flex flex-col gap-2">
              <Caps>Agent đã ghi nhận</Caps>
              <Stats items={[
                { label: 'Thu nhập', value: moneyOfField(p, 'monthlyIncome') },
                { label: 'Chi tiêu', value: moneyOfField(p, 'monthlyExpenses') },
                { label: 'Nợ ngoài', value: p.debtAmount === 0 ? 'Không nợ' : moneyOfField(p, 'debtAmount') },
              ]} />
              <Stats items={[
                { label: 'Tuổi', value: p.age ?? DASH },
                { label: 'Thu nhập', value: p.incomeStable === null ? DASH : p.incomeStable ? 'Ổn định' : 'Không ổn định' },
                { label: 'Tài sản khác', value: moneyOfField(p, 'otherAssets') },
              ]} />
            </div>
          )}
          <Btn variant="outline" className="hidden lg:flex" onClick={onOpenChat}>{chatLabel}</Btn>
        </Col>

        <Col span={6} className="lg:order-1">
          <GlassCard>
            <Row label="Giá trị ròng" sub="Mọi tài sản − nợ" value={<span className="whitespace-nowrap">{money(netWorth)}</span>} />
            <Row label="Thanh khoản" sub={math.floorMonths ? `Quỹ + ví · sàn ${math.floorMonths} tháng` : 'Quỹ + ví'}
              value={liquidMonths !== null ? withMark(`${formatNumber(liquidMonths)} tháng`, liqOk) : DASH}
              color={liqOk === null ? undefined : liqOk ? good : bad} />
            <Row label="Nợ / tài sản" value={debtRatio !== null ? withMark(formatPercent(debtRatio), debtRatio === 0) : DASH}
              color={debtRatio === null ? undefined : debtRatio === 0 ? good : bad} />
            <Row label="Tỷ lệ tiết kiệm" sub="(Thu nhập − chi tiêu) / thu nhập" value={formatPercent(savingRate)} last />
          </GlassCard>
          <Btn variant="outline" className="lg:hidden" onClick={onOpenChat}>{chatLabel}</Btn>
        </Col>
      </Grid>
      )}
    </Screen>
  )
}
