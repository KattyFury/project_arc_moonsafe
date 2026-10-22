// Screens 9 / 9b — Đầu tư (cirBTC only, SPEC §2).
// 9  locked: checklist, progress, shortfall, "Nạp quỹ dự phòng"; "Mua cirBTC" disabled.
// 9b open: Normal / Risky cap by age, applied to money outside the vault and outside
//    "tài sản khác" (wallet USDC + cirBTC held); buy with a quote first; DCA the
//    user approves and signs each time; price-drop warning.

import { useState } from 'react'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useApp } from '@/state/AppState'
import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { Button, Card, Chips, Notice, Progress, Row, Segmented, UsdcInput } from '@/components/ui/kit'
import { PanelShell } from './PanelShell'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n // 1 USDC

export function InvestPanel({ onClose, onOpenFund, onDeclare }: { onClose: () => void; onOpenFund: () => void; onDeclare: () => void }) {
  const { math, profile } = useApp()
  return (
    <PanelShell title="Đầu tư" onClose={onClose}>
      {math.investUnlocked ? <InvestOpen /> : <InvestLocked onOpenFund={onOpenFund} onDeclare={onDeclare} declared={profile.complete} />}
    </PanelShell>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 min-h-12">
      {ok ? <CheckCircle2 size={24} className="text-green shrink-0" /> : <XCircle size={24} className="text-red shrink-0" />}
      <span className={clsx('text-app-secondary', ok ? 'text-green-text' : 'text-red-text')}>{label}</span>
    </div>
  )
}

function InvestLocked({ onOpenFund, onDeclare, declared }: { onOpenFund: () => void; onDeclare: () => void; declared: boolean }) {
  const { math, money } = useApp()
  return (
    <>
      <Card>
        <h3 className="text-app-title-card text-ink">Đầu tư đang khoá</h3>
        <p className="text-app-note text-grey">Thứ tự: hết nợ → quỹ dự phòng → đầu tư.</p>
        <div>
          <Check ok={declared} label={declared ? 'Đã khai báo tài chính' : 'Chưa khai báo tài chính'} />
          <Check ok={math.noDebt === true} label={math.noDebt === true ? 'Không có nợ' : math.noDebt === false ? 'Còn nợ bên ngoài' : 'Chưa khai báo nợ'} />
          <Check ok={math.fundOk} label={math.fundOk ? 'Quỹ đủ sàn' : 'Quỹ chưa đủ sàn'} />
        </div>
        {math.floorUsdc !== null && (
          <>
            <Progress pct={math.floorPct} />
            {math.shortfall !== null && math.shortfall > 0n && (
              <p className="text-app-secondary text-ink">Còn thiếu <strong className="tabular">{money(math.shortfall)}</strong></p>
            )}
          </>
        )}
      </Card>
      {!declared
        ? <Button block onClick={onDeclare}>Khai báo ở chat</Button>
        : math.noDebt === false
          ? <Notice tone="warning">Trả hết nợ bên ngoài rồi cập nhật khai báo để mở đầu tư.</Notice>
          : <Button block onClick={onOpenFund}>Nạp quỹ dự phòng</Button>}
      <Button block disabled>Mua cirBTC</Button>
    </>
  )
}

function InvestOpen() {
  const { profile, vault, cirBtc, money } = useApp()
  const [risk, setRisk] = useState<'normal' | 'risky'>('normal')
  const [amount, setAmount] = useState('')
  const now = useNow()
  const age = profile.profile?.age ?? 0
  const capPct = Math.max(0, Math.min(100, (risk === 'normal' ? 110 : 120) - age))

  const wb = vault.walletBalance
  const spendable = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const invested = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const base = spendable !== null && invested !== null ? spendable + invested : null
  const capUsdc = base !== null ? (base * BigInt(capPct)) / 100n : null
  // Room left under the cap, never more than what the wallet can actually spend.
  let roomPos: bigint | null = null
  if (capUsdc !== null && invested !== null && spendable !== null) {
    const r = capUsdc - invested
    roomPos = r <= 0n ? 0n : r > spendable ? spendable : r
  }

  const parsed = parseUsdcInput(amount)
  const overCap = roomPos !== null && parsed > roomPos

  const dca = cirBtc.dca
  const next = dcaNextRun(dca)
  const due = next !== null && next <= now
  const dcaAmount = dca ? BigInt(dca.amountUsdc) : null
  const suggest = roomPos !== null ? (roomPos / BigInt(DCA_WEEKS) / 10_000n) * 10_000n : null

  const buy = async () => {
    const ok = await cirBtc.execute()
    if (ok) {
      if (due && dcaAmount !== null && parsed === dcaAmount) cirBtc.markDcaRun()
      setAmount('')
    }
  }

  const q = cirBtc.quote
  return (
    <>
      <Segmented value={risk} onChange={setRisk} options={[{ value: 'normal', label: `Normal · ${Math.max(0, 110 - age)}%` }, { value: 'risky', label: `Risky · ${Math.max(0, 120 - age)}%` }]} />

      <Card>
        <Row label="Trần đầu tư" sub={`${risk === 'normal' ? '110' : '120'} − tuổi ${age}, trên tiền ngoài quỹ`} value={`${capPct}%`} />
        <Row label="Đang giữ cirBTC" sub={formatCirBtc(cirBtc.balance)} value={money(invested)} />
        <Row label="Còn được mua tối đa" value={money(roomPos)} last />
        <p className="text-app-caption text-muted">Phần còn lại giữ bằng tiền mặt (USDC) — khuyến nghị, không bắt buộc.</p>
      </Card>

      {invested === null && (cirBtc.balance ?? 0n) > 0n && (
        <Notice tone="warning">Chưa lấy được giá BTC nên chưa tính được trần. Thử lại sau ít phút.</Notice>
      )}

      <Notice tone="warning" title="Giá cirBTC có thể giảm sâu">Chỉ đầu tư số tiền bạn chấp nhận mất. Đây là tham khảo, không phải tư vấn đầu tư.</Notice>

      {/* DCA */}
      <Card flat>
        <h3 className="text-app-btn-sm text-ink">Mua đều hàng tuần (DCA)</h3>
        {dca && dcaAmount !== null ? (
          <>
            <p className="text-app-note text-grey">
              {formatUsdc(dcaAmount)} mỗi {dca.intervalDays} ngày. {due ? 'Đã đến kỳ mua.' : `Kỳ tới: ${next ? new Date(next).toLocaleDateString('vi-VN') : DASH}.`}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Button block variant="secondary" onClick={cirBtc.stopDca}>Dừng DCA</Button>
              <Button block disabled={!due} onClick={() => setAmount(usdcToInput(dcaAmount))}>Mua kỳ này</Button>
            </div>
            <p className="text-app-caption text-muted">Mỗi kỳ bạn tự xem báo giá và ký. Có thể nói “dừng DCA” trong chat.</p>
          </>
        ) : suggest !== null && suggest >= MIN_DCA ? (
          <>
            <p className="text-app-note text-grey">Đề xuất: mua {formatUsdc(suggest)} cirBTC mỗi tuần trong {DCA_WEEKS} tuần, thay vì mua một lần.</p>
            <Button block variant="secondary" onClick={() => cirBtc.startDca(suggest, DCA_INTERVAL_DAYS)}>Duyệt DCA</Button>
          </>
        ) : (
          <p className="text-app-note text-grey">Chưa đủ hạn mức để chia DCA (tối thiểu {formatUsdc(MIN_DCA)} mỗi kỳ).</p>
        )}
      </Card>

      {/* Buy */}
      <div className="flex flex-col gap-2">
        <UsdcInput label="Mua cirBTC bằng" value={amount} onChange={v => { setAmount(v); cirBtc.clearQuote() }} disabled={cirBtc.busy} />
        <Chips items={[
          { label: '25%', onClick: () => roomPos && setAmount(usdcToInput((roomPos * 25n) / 100n)), disabled: !roomPos },
          { label: '50%', onClick: () => roomPos && setAmount(usdcToInput((roomPos * 50n) / 100n)), disabled: !roomPos },
          { label: 'Tối đa', onClick: () => roomPos && setAmount(usdcToInput(roomPos)), disabled: !roomPos },
        ]} />
      </div>
      {overCap && <Notice tone="danger">Vượt trần đầu tư theo tuổi. Tối đa {money(roomPos)}.</Notice>}
      {cirBtc.error && <Notice tone="danger">{cirBtc.error}</Notice>}
      {cirBtc.lastTxHash && (
        <Notice tone="success" title="Đã mua cirBTC">
          <a className="inline-flex items-center gap-1 underline" target="_blank" rel="noopener noreferrer"
            href={`https://explorer.testnet.arc.io/tx/${cirBtc.lastTxHash}`}>Xem giao dịch <ExternalLink size={16} /></a>
        </Notice>
      )}

      {q ? (
        <Card>
          <h3 className="text-app-title-card text-ink">Xác nhận mua</h3>
          <Row label="Bạn trả" value={`${q.amountInUsdc.replace('.', ',')} USDC`} />
          <Row label="Nhận ước tính" value={`${q.estimate.estimatedOutput.amount} cirBTC`} />
          <Row label="Nhận tối thiểu" sub="Trượt giá tối đa 3%" value={`${q.estimate.stopLimit.amount} cirBTC`} last />
          <div className="grid grid-cols-2 gap-4">
            <Button block variant="secondary" disabled={cirBtc.busy} onClick={cirBtc.clearQuote}>Hủy</Button>
            <Button block loading={cirBtc.busy} onClick={() => { void buy() }}>Mua cirBTC</Button>
          </div>
        </Card>
      ) : (
        <Button block loading={cirBtc.busy} disabled={parsed <= 0n || overCap || roomPos === null}
          onClick={() => { void cirBtc.estimate(parsed) }}>
          Xem báo giá
        </Button>
      )}
    </>
  )
}
