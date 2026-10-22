// Screens 8 / 8b — Bảng cân đối (Figma: title + notice, then two cards 6 + 6 col on desktop). Unknown values show "–".

import { CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { DASH, formatNumber, formatPercent } from '@/lib/format'
import { Btn, Col, GlassCard, Grid, Notice, Row, Screen, Stats, Title } from '@/components/ui/kit'

export function BalanceSheet({ onOpenChat }: { onOpenChat: () => void }) {
  const { profile, vault, cirBtc, fx, math, money, moneyOfField, fieldUsdc } = useApp()
  const p = profile.complete ? profile.profile : null

  const cirValue = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const other = p ? (p.otherAssets === null ? 0n : fieldUsdc(p, 'otherAssets')) : null
  const debt = p ? fieldUsdc(p, 'debtAmount') : null
  const vb = vault.vaultBalance
  const wb = vault.walletBalance

  const assets = p && vb !== null && wb !== null && cirValue !== null && other !== null ? vb + wb + cirValue + other : null
  const netWorth = assets !== null && debt !== null ? assets - debt : null
  const liquidMonths = p && math.monthlyExpUsdc && vb !== null && wb !== null ? Number(vb + wb) / Number(math.monthlyExpUsdc) : null
  const debtRatio = assets !== null && debt !== null ? (assets > 0n ? (Number(debt) / Number(assets)) * 100 : debt > 0n ? null : 0) : null
  // Income and spending may be in different currencies (salary in USDC, rent in VND).
  const inc = p ? fieldUsdc(p, 'monthlyIncome') : null
  const exp = p ? fieldUsdc(p, 'monthlyExpenses') : null
  const savingRate = inc !== null && exp !== null && inc > 0n ? (Number(inc - exp) / Number(inc)) * 100 : null

  const good = 'var(--success)'
  const bad = 'var(--danger)'
  const mark = (ok: boolean | null) => ok === null ? null : ok
    ? <CheckCircle2 size={16} style={{ color: good }} />
    : <XCircle size={16} style={{ color: bad }} />
  const withMark = (text: string, ok: boolean | null) => <span className="inline-flex items-center gap-2">{text}{mark(ok)}</span>

  const liqOk = liquidMonths !== null && math.floorMonths ? liquidMonths >= math.floorMonths : null

  return (
    <Screen>
      <Title>Bảng cân đối</Title>

      {!p && (
        <Notice tone="warning" title="Bảng cân đối đang trống">Trò chuyện với agent ở tab Chat. Bạn kể đến đâu, bảng tự điền đến đó.</Notice>
      )}
      {p && fx.vndPerUsd === null && <Notice tone="warning">Chưa lấy được tỉ giá, các số quy đổi tạm hiện “–”.</Notice>}
      {p && fx.stale && fx.fetchedAt && <Notice tone="warning">Đang dùng tỉ giá cũ ngày {new Date(fx.fetchedAt).toLocaleDateString('vi-VN')}.</Notice>}

      <Grid>
        <Col span={6} className="lg:order-2">
          <Stats items={[
            { label: 'Quỹ dự phòng', value: money(vb) },
            { label: 'Ví', value: money(wb) },
            { label: 'cirBTC', value: cirBtc.balance === null ? DASH : money(cirValue) },
          ]} />
          <Btn variant="outline" className="hidden lg:flex" onClick={onOpenChat}>{p ? 'Cập nhật với agent' : 'Trò chuyện với agent'}</Btn>
        </Col>

        <Col span={6} className="lg:order-1">
          <GlassCard>
            <Row label="Giá trị ròng" sub="Quỹ + ví + cirBTC + tài sản khác − nợ" value={p ? money(netWorth) : DASH} />
            <Row label="Thanh khoản" sub={math.floorMonths ? `Quỹ + ví · sàn ${math.floorMonths} tháng` : 'Quỹ + ví'}
              value={p && liquidMonths !== null ? withMark(`${formatNumber(liquidMonths)} tháng`, liqOk) : DASH}
              color={liqOk === null ? undefined : liqOk ? good : bad} />
            <Row label="Nợ / tài sản" value={p ? withMark(formatPercent(debtRatio), debtRatio === null ? null : debtRatio === 0) : DASH}
              color={debtRatio === null ? undefined : debtRatio === 0 ? good : bad} />
            <Row label="Tỷ lệ tiết kiệm" sub="(Thu nhập − chi tiêu) / thu nhập" value={p ? formatPercent(savingRate) : DASH} />
            <Row label="Tài sản khác" value={p ? moneyOfField(p, 'otherAssets') : DASH} last />
          </GlassCard>
          <Btn variant="outline" className="lg:hidden" onClick={onOpenChat}>{p ? 'Cập nhật với agent' : 'Trò chuyện với agent'}</Btn>
        </Col>
      </Grid>
    </Screen>
  )
}
