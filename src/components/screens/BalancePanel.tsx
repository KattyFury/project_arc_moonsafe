// Screens 8 / 8b — Bảng cân đối. 5 lines; anything that can't be computed shows "–".
// 8b: nothing declared yet → every line "–" + "Khai báo ở chat".

import { useApp } from '@/state/AppState'
import { DASH, formatNumber, formatPercent } from '@/lib/format'
import { Button, Card, Notice, Row } from '@/components/ui/kit'
import { PanelShell } from './PanelShell'

export function BalancePanel({ onClose, onDeclare }: { onClose: () => void; onDeclare: () => void }) {
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

  return (
    <PanelShell title="Bảng cân đối" onClose={onClose}>
      {!p && <Notice tone="info" title="Chưa có khai báo">Khai báo thu nhập, chi tiêu và nợ ở chat để xem bảng cân đối.</Notice>}
      {p && fx.vndPerUsd === null && <Notice tone="warning">Chưa lấy được tỉ giá, các số quy đổi tạm hiện “–”.</Notice>}
      {p && fx.stale && fx.fetchedAt && <Notice tone="warning">Đang dùng tỉ giá cũ ngày {new Date(fx.fetchedAt).toLocaleDateString('vi-VN')}.</Notice>}

      <Card>
        <Row label="Giá trị ròng" sub="Quỹ + ví + cirBTC + tài sản khác − nợ" value={p ? money(netWorth) : DASH} />
        <Row label="Thanh khoản" sub={math.floorMonths ? `Quỹ + ví, sàn ${math.floorMonths} tháng` : 'Quỹ + ví'}
          value={p && liquidMonths !== null ? `${formatNumber(liquidMonths)} tháng` : DASH} />
        <Row label="Nợ / tài sản" value={p ? formatPercent(debtRatio) : DASH}
          valueClass={debtRatio !== null && debtRatio > 0 ? 'text-red-text' : undefined} />
        <Row label="Tỷ lệ tiết kiệm" sub="(Thu nhập − chi tiêu) / thu nhập" value={p ? formatPercent(savingRate) : DASH} />
        <Row label="Tài sản khác" value={p ? moneyFromVnd(p.otherAssets) : DASH} last />
      </Card>

      <Card flat>
        <Row label="Quỹ dự phòng" value={money(vb)} />
        <Row label="Số dư ví" value={money(wb)} />
        <Row label="cirBTC" value={cirBtc.balance === null ? DASH : cirBtc.balance === 0n ? money(0n) : money(cirBtc.valueUsdc6)} last />
      </Card>

      <Button variant="secondary" block onClick={onDeclare}>{p ? 'Sửa khai báo' : 'Khai báo ở chat'}</Button>
    </PanelShell>
  )
}
