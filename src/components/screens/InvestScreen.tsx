// Screens 9 / 9b — Đầu tư, cirBTC only (Figma: locked = conditions 6 col + actions 6 col).
// Cap by age applies to money outside the vault (wallet USDC + cirBTC held).

import { useState } from 'react'
import { ArrowRight, CheckCircle2, ExternalLink, Lock, TrendingUp, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { investRoom } from '@/lib/invest'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Toggle, glass } from '@/components/ui/kit'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n

export function InvestScreen({ onOpenFund, onOpenChat }: { onOpenFund: () => void; onOpenChat: () => void }) {
  const { math, profile, money } = useApp()

  if (!math.investUnlocked) {
    const checks = [
      { ok: profile.complete, label: profile.complete ? 'Agent đã biết thu chi của bạn' : 'Agent chưa biết thu chi của bạn' },
      { ok: math.noDebt === true, label: math.noDebt === false ? 'Còn nợ bên ngoài' : 'Không có nợ ngoài' },
      { ok: math.fundOk, label: math.fundOk ? 'Quỹ dự phòng đủ sàn' : 'Quỹ dự phòng chưa đủ sàn' },
    ]
    return (
      <Screen>
        <Grid>
          <Col span={6}>
            <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <IconBox><Lock size={24} style={{ color: 'var(--accent)' }} /></IconBox>
                <div>
                  <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Đầu tư đang khoá</p>
                  <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Thứ tự: hết nợ → quỹ dự phòng → đầu tư</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                {checks.map(({ ok, label }) => (
                  <div key={label} className="min-h-12 flex items-center gap-2 px-4 py-2 rounded-2xl" style={{ background: ok ? '#E3F5EC' : '#FDE8EB' }}>
                    {ok ? <CheckCircle2 size={20} style={{ color: 'var(--success)', flexShrink: 0 }} /> : <XCircle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />}
                    <span className="text-[16px] leading-6 font-semibold" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>{label}</span>
                  </div>
                ))}
              </div>
              {math.floorUsdc !== null && (
                <div className="h-2 rounded-full" style={{ background: 'var(--surface-muted)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(math.floorPct ?? 0, 100)}%`, background: 'var(--accent)' }} />
                </div>
              )}
              {math.shortfall !== null && math.shortfall > 0n && (
                <div className="p-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
                  <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Còn thiếu vào quỹ</p>
                  <p className="display font-bold text-[24px] leading-8 tabular-nums" style={{ color: 'var(--ink)' }}>{money(math.shortfall)}</p>
                </div>
              )}
            </GlassCard>
          </Col>
          <Col span={6}>
            {!profile.complete
              ? <Btn onClick={onOpenChat}>Trò chuyện với agent</Btn>
              : math.noDebt === false
                ? <Notice tone="warning">Khi đã trả hết nợ bên ngoài, báo agent một tiếng để mở đầu tư.</Notice>
                : <Btn onClick={onOpenFund}>Nạp quỹ dự phòng</Btn>}
            <Btn disabled><Lock size={16} />Mua cirBTC</Btn>
          </Col>
        </Grid>
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
  const [mode, setMode] = useState<'once' | 'dca'>('once')
  const age = profile.profile?.age ?? 0

  const wb = vault.walletBalance
  const invested = cirBtc.balance === 0n ? 0n : cirBtc.valueUsdc6
  const { capPct, room } = investRoom(age, risk, wb, invested)

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
      <Grid>
        <Col span={5}>
          {/* Hero: the one gradient region on this screen. Holds the cap figures so the screen fits without scrolling. */}
          <section className="p-4 lg:p-8 flex flex-col gap-2" style={glass.hero}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} color="white" />
                <span className="text-[14px] leading-5 font-semibold text-white">Đầu tư cirBTC</span>
              </div>
              <div className="flex gap-2 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.16)' }}>
                {(['normal', 'risky'] as const).map(r => (
                  <button key={r} onClick={() => setRisk(r)} className="h-8 px-2 text-[14px] leading-5 font-semibold rounded-2xl"
                    style={{ background: risk === r ? 'white' : 'transparent', color: risk === r ? 'var(--accent)' : 'white' }}>
                    {r === 'normal' ? 'Normal' : 'Risky'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[14px] leading-5 text-white">Số dư trong ví</p>
              <p className="display font-bold tabular-nums text-white text-[32px] leading-10">{money(wb)}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[
                { label: `Trần (${risk === 'normal' ? '110' : '120'} − ${age})`, value: `${capPct}%` },
                { label: 'Đang giữ', value: money(invested) },
                { label: 'Còn mua được', value: money(room) },
              ].map(i => (
                <div key={i.label} className="min-w-0">
                  <p className="text-[14px] leading-5 text-white truncate">{i.label}</p>
                  <p className="text-[16px] leading-6 font-semibold text-white tabular-nums break-words">{i.value}</p>
                </div>
              ))}
            </div>
          </section>
          <p className="text-[14px] leading-5 -mt-2 lg:-mt-4" style={{ color: 'var(--subtle)' }}>
            Đang giữ {formatCirBtc(cirBtc.balance)}. Phần còn lại giữ bằng USDC — khuyến nghị, không bắt buộc.
          </p>
        </Col>

        <Col span={7}>
          {invested === null && (cirBtc.balance ?? 0n) > 0n && (
            <Notice tone="warning">Chưa lấy được giá BTC nên chưa tính được trần. Thử lại sau ít phút.</Notice>
          )}

          {/* One card: buy once or set a weekly DCA */}
          <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
            <Toggle value={mode} onChange={setMode}
              options={[{ value: 'once', label: 'Mua một lần' }, { value: 'dca', label: due ? 'DCA · đến kỳ' : 'Mua đều (DCA)' }]} />

            {mode === 'once' ? (
              <>
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
                    <a className="inline-flex items-center gap-2 underline" target="_blank" rel="noopener noreferrer"
                      href={`https://explorer.testnet.arc.io/tx/${cirBtc.lastTxHash}`}>Xem giao dịch <ExternalLink size={16} /></a>
                  </Notice>
                )}
                <Btn loading={cirBtc.busy && !q} disabled={parsed <= 0n || overCap || room === null}
                  onClick={() => { void cirBtc.estimate(parsed) }}>
                  {cirBtc.busy && !q ? 'Đang lấy báo giá…' : 'Xem báo giá · Mua cirBTC'}
                </Btn>
              </>
            ) : dca && dcaAmount !== null ? (
              <>
                <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(dcaAmount)} mỗi {dca.intervalDays} ngày. {due ? 'Đã đến kỳ mua.' : `Kỳ tới: ${next ? new Date(next).toLocaleDateString('vi-VN') : DASH}.`}
                </p>
                <div className="flex gap-4">
                  <Btn variant="outline" onClick={cirBtc.stopDca}>Dừng DCA</Btn>
                  <Btn disabled={!due} onClick={() => { setAmount(usdcToInput(dcaAmount)); setMode('once') }}>Mua kỳ này</Btn>
                </div>
                <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Mỗi kỳ bạn tự xem báo giá và ký. Có thể nói “dừng DCA” trong chat.</p>
              </>
            ) : suggest !== null && suggest >= MIN_DCA ? (
              <>
                <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>Đề xuất: mua {formatUsdc(suggest)} cirBTC mỗi tuần trong {DCA_WEEKS} tuần, thay vì mua một lần.</p>
                <Btn onClick={() => cirBtc.startDca(suggest, DCA_INTERVAL_DAYS)}>Duyệt DCA</Btn>
              </>
            ) : (
              <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>Chưa đủ hạn mức để chia DCA (tối thiểu {formatUsdc(MIN_DCA)} mỗi kỳ).</p>
            )}
          </GlassCard>
        </Col>
      </Grid>

      {q && (
        <Sheet>
          <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Xác nhận mua</p>
          <div className="flex items-center gap-2 px-4 py-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.amountInUsdc.replace('.', ',')} USDC</p>
              <p className="text-[14px]" style={{ color: 'var(--muted)' }}>Bạn trả</p>
            </div>
            <ArrowRight size={18} style={{ color: 'var(--muted)' }} className="flex-shrink-0" />
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</p>
              <p className="text-[14px]" style={{ color: 'var(--muted)' }}>Nhận ước tính</p>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-[14px]" style={{ color: 'var(--muted)' }}>Nhận tối thiểu (trượt giá ≤ 3%)</span>
            <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>{q.estimate.stopLimit.amount} cirBTC</span>
          </div>
          <Notice tone="warning">Giá thực tế có thể khác ước tính. Chỉ đầu tư số tiền sẵn sàng mất.</Notice>
          {cirBtc.error && <Notice tone="danger">{cirBtc.error}</Notice>}
          <div className="flex gap-4">
            <Btn variant="outline" disabled={cirBtc.busy} onClick={cirBtc.clearQuote}>Huỷ</Btn>
            <Btn loading={cirBtc.busy} onClick={() => { void buy() }}>{cirBtc.busy ? 'Đang mua…' : 'Mua cirBTC'}</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
