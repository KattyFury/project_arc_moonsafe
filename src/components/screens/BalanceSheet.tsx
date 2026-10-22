// Screens 8 / 8b — Bảng cân đối (Arc Studio look). Unknown values show "–".

import { CheckCircle2, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { DASH, formatNumber, formatPercent } from '@/lib/format'
import { Btn, GlassCard, Notice, Row, Screen, Title } from '@/components/ui/kit'

export function BalanceSheet({ onDeclare }: { onDeclare: () => void }) {
  const { profile, vault, cirBtc, fx, math, money, moneyFromVnd, vndToUsdc } = useApp()
  const p = profile.complete ? profile.profile : null

  const cirValue = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const other = p ? (p.otherAssets === null ? 0n : vndToUsdc(p.otherAssets)) : null
  const debt = p ? vndToUsdc(p.debtAmount) : null
  const vb = vault.vaultBalance
  const wb = vault.walletBalance

  const assets = p && vb !== null && wb !== null && cirValue !== null && other !== null ? vb + wb + cirValue + other : null
  const netWorth = assets !== null && debt !== null ? assets - debt : null
  const liquidMonths = p && math.monthlyExpUsdc && vb !== null && wb !== null ? Number(vb + wb) / Number(math.monthlyExpUsdc) : null
  const debtRatio = assets !== null && debt !== null ? (assets > 0n ? (Number(debt) / Number(assets)) * 100 : debt > 0n ? null : 0) : null
  const savingRate = p && p.monthlyIncome ? ((p.monthlyIncome - (p.monthlyExpenses ?? 0)) / p.monthlyIncome) * 100 : null

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
        <div className="p-4 rounded-2xl" style={{ background: 'rgba(245,179,1,0.10)', border: '1px solid rgba(245,179,1,0.25)' }}>
          <p className="font-semibold text-[14px] mb-1" style={{ color: '#8A5F00' }}>Chưa có khai báo</p>
          <p className="text-[13px]" style={{ color: '#8A5F00' }}>Khai báo tài chính với agent ở tab Chat để xem bảng cân đối.</p>
        </div>
      )}
      {p && fx.vndPerUsd === null && <Notice tone="warning">Chưa lấy được tỉ giá, các số quy đổi tạm hiện “–”.</Notice>}
      {p && fx.stale && fx.fetchedAt && <Notice tone="warning">Đang dùng tỉ giá cũ ngày {new Date(fx.fetchedAt).toLocaleDateString('vi-VN')}.</Notice>}

      <GlassCard>
        <Row label="Giá trị ròng" sub="Quỹ + ví + cirBTC + tài sản khác − nợ" value={p ? money(netWorth) : DASH} />
        <Row label="Thanh khoản" sub={math.floorMonths ? `Quỹ + ví · sàn ${math.floorMonths} tháng` : 'Quỹ + ví'}
          value={p && liquidMonths !== null ? withMark(`${formatNumber(liquidMonths)} tháng`, liqOk) : DASH}
          color={liqOk === null ? undefined : liqOk ? good : bad} />
        <Row label="Nợ / tài sản" value={p ? withMark(formatPercent(debtRatio), debtRatio === null ? null : debtRatio === 0) : DASH}
          color={debtRatio === null ? undefined : debtRatio === 0 ? good : bad} />
        <Row label="Tỷ lệ tiết kiệm" sub="(Thu nhập − chi tiêu) / thu nhập" value={p ? formatPercent(savingRate) : DASH} />
        <Row label="Tài sản khác" value={p ? moneyFromVnd(p.otherAssets) : DASH} last />
      </GlassCard>

      <GlassCard>
        <Row label="Quỹ dự phòng" value={money(vb)} />
        <Row label="Số dư ví" value={money(wb)} />
        <Row label="cirBTC" value={cirBtc.balance === null ? DASH : money(cirValue)} last />
      </GlassCard>

      <Btn variant="outline" onClick={onDeclare}>{p ? 'Sửa khai báo' : 'Khai báo ở chat'}</Btn>
    </Screen>
  )
}
