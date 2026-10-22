// Screens 9 / 9b — Đầu tư, cirBTC only (Arc Studio look).
// Cap by age applies to money outside the vault (wallet USDC + cirBTC held).

import { useState } from 'react'
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Lock, TrendingUp, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, GlassCard, IconBox, Notice, Row, Screen, Sheet, glass } from '@/components/ui/kit'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n

export function InvestScreen({ onOpenFund, onDeclare }: { onOpenFund: () => void; onDeclare: () => void }) {
  const { math, profile, money } = useApp()

  if (!math.investUnlocked) {
    const checks = [
      { ok: profile.complete, label: profile.complete ? 'Đã khai báo tài chính' : 'Chưa khai báo tài chính' },
      { ok: math.noDebt === true, label: math.noDebt === false ? 'Còn nợ bên ngoài' : 'Không có nợ ngoài' },
      { ok: math.fundOk, label: math.fundOk ? 'Quỹ dự phòng đủ sàn' : 'Quỹ dự phòng chưa đủ sàn' },
    ]
    return (
      <Screen>
        <GlassCard className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconBox><Lock size={20} style={{ color: 'var(--accent)' }} /></IconBox>
            <div>
              <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Đầu tư đang khoá</p>
              <p className="text-[12px]" style={{ color: 'var(--muted)' }}>Thứ tự: hết nợ → quỹ dự phòng → đầu tư</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {checks.map(({ ok, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: ok ? 'rgba(15,157,88,0.08)' : 'rgba(224,52,74,0.08)', border: `1px solid ${ok ? 'rgba(15,157,88,0.2)' : 'rgba(224,52,74,0.2)'}` }}>
                {ok ? <CheckCircle2 size={18} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <XCircle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                <span className="text-[14px] font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{label}</span>
              </div>
            ))}
          </div>
          {math.floorUsdc !== null && (
            <div className="h-[6px] rounded-full" style={{ background: 'var(--surface-muted)' }}>
              <div className="h-full rounded-full" style={{ width: `${math.floorPct ?? 0}%`, background: 'var(--accent)' }} />
            </div>
          )}
          {math.shortfall !== null && math.shortfall > 0n && (
            <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
              <p className="text-[12px]" style={{ color: 'var(--subtle)' }}>Còn thiếu vào quỹ</p>
              <p className="display font-bold text-[22px] tabular-nums mt-0.5" style={{ color: 'var(--ink)' }}>{money(math.shortfall)}</p>
            </div>
          )}
        </GlassCard>
        {!profile.complete
          ? <Btn onClick={onDeclare}>Khai báo với agent</Btn>
          : math.noDebt === false
            ? <Notice tone="warning">Trả hết nợ bên ngoài rồi cập nhật khai báo để mở đầu tư.</Notice>
            : <Btn onClick={onOpenFund}>Nạp quỹ dự phòng</Btn>}
        <Btn disabled><Lock size={15} />Mua cirBTC</Btn>
      </Screen>
    )
  }
  return <InvestOpen />
}

function InvestOpen() {
  const { profile, vault, cirBtc, money } = useApp()
  const now = useNow()
  const [risk, setRisk] = useState<'normal' | 'risky'>('normal')
  const [amount, setAmount] = useState('')
  const age = profile.profile?.age ?? 0
  const capPct = Math.max(0, Math.min(100, (risk === 'normal' ? 110 : 120) - age))

  const wb = vault.walletBalance
  const spendable = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const invested = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  let room: bigint | null = null
  if (spendable !== null && invested !== null) {
    const r = ((spendable + invested) * BigInt(capPct)) / 100n - invested
    room = r <= 0n ? 0n : r > spendable ? spendable : r
  }

  const parsed = parseUsdcInput(amount)
  const overCap = room !== null && parsed > room

  const dca = cirBtc.dca
  const next = dcaNextRun(dca)
  const due = next !== null && next <= now
  const dcaAmount = dca ? BigInt(dca.amountUsdc) : null
  const suggest = room !== null ? (room / BigInt(DCA_WEEKS) / 10_000n) * 10_000n : null
  const q = cirBtc.quote

  const buy = async () => {
    const ok = await cirBtc.execute()
    if (ok) {
      if (due && dcaAmount !== null && parsed === dcaAmount) cirBtc.markDcaRun()
      setAmount('')
    }
  }

  return (
    <Screen>
      {/* Hero */}
      <section className="p-5" style={glass.hero}>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={14} color="rgba(255,255,255,0.7)" />
          <span className="text-[13px] font-semibold text-white/70">Đầu tư cirBTC</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] text-white/70 mb-1">Số dư trong ví</p>
            <p className="display font-bold tabular-nums text-white" style={{ fontSize: 28, letterSpacing: '-0.03em' }}>{money(wb)}</p>
            <p className="text-[11px] text-white/70 mt-1">Trần đầu tư: {capPct}% tiền ngoài quỹ</p>
          </div>
          <div className="flex-shrink-0 flex gap-1" style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 24, padding: '6px 8px' }}>
            {(['normal', 'risky'] as const).map(r => (
              <button key={r} onClick={() => setRisk(r)} className="text-[12px] font-semibold px-2 py-1 rounded-full transition-all"
                style={{ background: risk === r ? 'white' : 'transparent', color: risk === r ? 'var(--accent)' : 'rgba(255,255,255,0.75)' }}>
                {r === 'normal' ? 'Normal' : 'Risky'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <GlassCard>
        <Row label="Trần đầu tư" sub={`${risk === 'normal' ? '110' : '120'} − tuổi ${age}`} value={`${capPct}%`} />
        <Row label="Đang giữ cirBTC" sub={formatCirBtc(cirBtc.balance)} value={money(invested)} />
        <Row label="Còn được mua tối đa" value={money(room)} last />
      </GlassCard>
      <p className="text-[11px] -mt-2 px-1" style={{ color: 'var(--muted)' }}>Phần còn lại giữ bằng USDC — khuyến nghị, không bắt buộc.</p>

      {invested === null && (cirBtc.balance ?? 0n) > 0n && (
        <Notice tone="warning">Chưa lấy được giá BTC nên chưa tính được trần. Thử lại sau ít phút.</Notice>
      )}

      {/* DCA */}
      <GlassCard className="p-4 flex flex-col gap-3">
        <p className="font-semibold text-[15px]" style={{ color: 'var(--ink)' }}>Mua đều hàng tuần (DCA)</p>
        {dca && dcaAmount !== null ? (
          <>
            <p className="text-[13px]" style={{ color: 'var(--subtle)' }}>
              {formatUsdc(dcaAmount)} mỗi {dca.intervalDays} ngày. {due ? 'Đã đến kỳ mua.' : `Kỳ tới: ${next ? new Date(next).toLocaleDateString('vi-VN') : DASH}.`}
            </p>
            <div className="flex gap-3">
              <Btn variant="outline" onClick={cirBtc.stopDca}>Dừng DCA</Btn>
              <Btn disabled={!due} onClick={() => setAmount(usdcToInput(dcaAmount))}>Mua kỳ này</Btn>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Mỗi kỳ bạn tự xem báo giá và ký. Có thể nói “dừng DCA” trong chat.</p>
          </>
        ) : suggest !== null && suggest >= MIN_DCA ? (
          <>
            <p className="text-[13px]" style={{ color: 'var(--subtle)' }}>Đề xuất: mua {formatUsdc(suggest)} cirBTC mỗi tuần trong {DCA_WEEKS} tuần, thay vì mua một lần.</p>
            <Btn variant="outline" onClick={() => cirBtc.startDca(suggest, DCA_INTERVAL_DAYS)}>Duyệt DCA</Btn>
          </>
        ) : (
          <p className="text-[13px]" style={{ color: 'var(--subtle)' }}>Chưa đủ hạn mức để chia DCA (tối thiểu {formatUsdc(MIN_DCA)} mỗi kỳ).</p>
        )}
      </GlassCard>

      {/* Buy */}
      <GlassCard className="p-4 flex flex-col gap-3">
        <p className="text-[12px] font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>Mua cirBTC bằng USDC</p>
        <Chips items={[
          { label: '25%', onClick: () => room && setAmount(usdcToInput((room * 25n) / 100n)), disabled: !room },
          { label: '50%', onClick: () => room && setAmount(usdcToInput((room * 50n) / 100n)), disabled: !room },
          { label: 'Tối đa', onClick: () => room && setAmount(usdcToInput(room)), disabled: !room },
        ]} />
        <AmountField value={amount} onChange={v => { setAmount(v); cirBtc.clearQuote() }} disabled={cirBtc.busy} />
        <Notice tone="warning">Giá cirBTC có thể giảm sâu. Chỉ đầu tư số tiền sẵn sàng mất. Đây là thông tin tham khảo, không phải tư vấn đầu tư.</Notice>
        {overCap && <Notice tone="danger">Vượt trần đầu tư theo tuổi. Tối đa {money(room)}.</Notice>}
        {cirBtc.error && !q && <Notice tone="danger">{cirBtc.error}</Notice>}
        {cirBtc.lastTxHash && (
          <Notice tone="success" title="Đã mua cirBTC">
            <a className="inline-flex items-center gap-1 underline" target="_blank" rel="noopener noreferrer"
              href={`https://explorer.testnet.arc.io/tx/${cirBtc.lastTxHash}`}>Xem giao dịch <ExternalLink size={12} /></a>
          </Notice>
        )}
        <Btn loading={cirBtc.busy && !q} disabled={parsed <= 0n || overCap || room === null}
          onClick={() => { void cirBtc.estimate(parsed) }}>
          {cirBtc.busy && !q ? 'Đang lấy báo giá…' : 'Xem báo giá · Mua cirBTC'}
        </Btn>
      </GlassCard>

      {q && (
        <Sheet>
          <p className="font-bold text-[19px]" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Xác nhận mua</p>
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.amountInUsdc.replace('.', ',')} USDC</p>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Bạn trả</p>
            </div>
            <ArrowRight size={18} style={{ color: 'var(--muted)' }} className="flex-shrink-0" />
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</p>
              <p className="text-[11px]" style={{ color: 'var(--muted)' }}>Nhận ước tính</p>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-[12px]" style={{ color: 'var(--muted)' }}>Nhận tối thiểu (trượt giá ≤ 3%)</span>
            <span className="text-[12px] font-medium" style={{ color: 'var(--ink)' }}>{q.estimate.stopLimit.amount} cirBTC</span>
          </div>
          <div className="px-3 py-2 rounded-xl flex items-start gap-2" style={{ background: 'rgba(245,179,1,0.08)', border: '1px solid rgba(245,179,1,0.2)' }}>
            <AlertTriangle size={13} style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: 1 }} />
            <p className="text-[11px] leading-relaxed" style={{ color: '#8A5F00' }}>Giá thực tế có thể khác ước tính. Chỉ đầu tư số tiền sẵn sàng mất.</p>
          </div>
          {cirBtc.error && <Notice tone="danger">{cirBtc.error}</Notice>}
          <div className="flex gap-3">
            <Btn variant="outline" disabled={cirBtc.busy} onClick={cirBtc.clearQuote}>Huỷ</Btn>
            <Btn loading={cirBtc.busy} onClick={() => { void buy() }}>{cirBtc.busy ? 'Đang mua…' : 'Mua cirBTC'}</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
