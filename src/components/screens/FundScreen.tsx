// Screens 7 / 7b — Quỹ dự phòng (Arc Studio look).
// Withdrawals go to the owner's wallet; below the floor → warning sheet, still allowed.

import { useState } from 'react'
import { ShieldAlert, TrendingUp } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatNumber, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, GlassCard, Notice, Screen, Sheet, glass } from '@/components/ui/kit'

type Tab = 'deposit' | 'withdraw'

export function FundScreen({ onDeclare }: { onDeclare: () => void }) {
  const { vault, math, money, unit, profile } = useApp()
  const [tab, setTab] = useState<Tab>('deposit')
  const [amount, setAmount] = useState('')
  const [sheet, setSheet] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const vb = vault.vaultBalance
  const wb = vault.walletBalance
  const parsed = parseUsdcInput(amount)
  const maxDeposit = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const max = tab === 'deposit' ? maxDeposit : vb
  const tooMuch = max !== null && parsed > max
  const belowFloor = tab === 'withdraw' && math.floorUsdc !== null && vb !== null && vb - parsed < math.floorUsdc
  const pct = math.floorPct ?? 0

  const run = async () => {
    setError(null); setDone(null)
    try {
      if (tab === 'deposit') await vault.deposit(parsed)
      else await vault.withdraw(parsed)
      setDone(tab === 'deposit' ? `Đã nạp ${formatUsdc(parsed)} vào quỹ` : `Đã rút ${formatUsdc(parsed)} về ví`)
      setAmount('')
    } catch (e) {
      setError(txErrorMessage(e))
    } finally {
      setSheet(false)
    }
  }

  const chip = (p: number | 'max') => {
    if (max === null) return
    setAmount(usdcToInput(p === 'max' ? max : (max * BigInt(p)) / 100n))
  }

  const [num, unitLabel] = (() => {
    const s = money(vb)
    if (unit === 'USD') return [s.replace(' USDC', ''), 'USDC']
    return [s.replace(' ₫', ''), '₫']
  })()

  return (
    <Screen>
      {/* Hero balance card */}
      <section className="p-5 relative overflow-hidden" style={glass.hero}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.18)' }}>
            <TrendingUp size={14} color="white" />
          </div>
          <span className="text-[13px] font-semibold text-white/70 tracking-wide">Quỹ dự phòng</span>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="display font-bold tabular-nums text-white" style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em' }}>{num}</span>
          <span className="text-[18px] font-medium text-white/60">{unitLabel}</span>
        </div>
        {math.floorUsdc !== null ? (
          <>
            <p className="text-[12px] text-white/70 mb-4">
              Sàn {math.floorMonths} tháng: {formatUsdc(math.floorUsdc, 0)} · đang có {formatNumber(math.vaultMonths)} tháng
            </p>
            <div className="h-[6px] rounded-full mb-1" style={{ background: 'rgba(255,255,255,0.18)' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: pct >= 100 ? '#4ade80' : 'white' }} />
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] text-white/70">{formatUsdc(vb, 0)} / {formatUsdc(math.floorUsdc, 0)}</span>
              <span className="text-[11px] text-white/70">{pct >= 100 ? 'Đủ sàn' : `Còn thiếu ${formatUsdc(math.shortfall, 0)}`}</span>
            </div>
          </>
        ) : (
          <button onClick={onDeclare} className="text-[12px] text-white/80 mt-1 underline">
            {profile.complete ? 'Chưa có tỉ giá để tính mức sàn' : 'Khai báo chi tiêu với agent để biết mức sàn'}
          </button>
        )}
      </section>

      {/* Action card */}
      <GlassCard>
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {(['deposit', 'withdraw'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setAmount(''); setError(null); setDone(null) }}
              className="flex-1 py-3.5 text-[15px] font-semibold transition-colors"
              style={{ color: tab === t ? 'var(--accent)' : 'var(--muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {t === 'deposit' ? 'Nạp vào quỹ' : 'Rút về ví'}
            </button>
          ))}
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Chips items={[
            { label: '25%', onClick: () => chip(25), disabled: !max },
            { label: '50%', onClick: () => chip(50), disabled: !max },
            { label: 'Tối đa', onClick: () => chip('max'), disabled: !max },
          ]} />
          <AmountField value={amount} onChange={v => { setAmount(v); setDone(null) }} disabled={vault.busy} />
          <p className="text-[12px]" style={{ color: 'var(--muted)' }}>
            {tab === 'deposit'
              ? `Trong ví: ${formatUsdc(wb)} · giữ lại ${formatUsdc(GAS_RESERVE_USDC6)} làm phí`
              : `Trong quỹ: ${formatUsdc(vb)} · tiền rút về ví của bạn`}
          </p>

          {tab === 'withdraw' && wb !== null && wb < GAS_ESTIMATE_USDC6 && (
            <Notice tone="warning">Ví cần khoảng {formatUsdc(GAS_ESTIMATE_USDC6)} để trả phí giao dịch rút.</Notice>
          )}
          {tooMuch && <Notice tone="danger">{tab === 'deposit' ? 'Vượt số USDC có thể nạp từ ví.' : 'Vượt số dư trong quỹ.'}</Notice>}
          {done && <Notice tone="success">{done}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}

          <Btn loading={vault.busy} disabled={parsed <= 0n || tooMuch || max === null}
            onClick={() => { if (belowFloor) setSheet(true); else void run() }}>
            {vault.busy ? 'Đang chờ ví…' : tab === 'deposit' ? 'Nạp vào quỹ' : 'Rút về ví'}
          </Btn>
        </div>
      </GlassCard>

      {/* 7b — below floor */}
      {sheet && (
        <Sheet>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(224,52,74,0.1)' }}>
              <ShieldAlert size={20} style={{ color: 'var(--danger)' }} />
            </div>
            <div>
              <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Rút dưới mức sàn</p>
              <p className="text-[14px] mt-1 leading-relaxed" style={{ color: 'var(--subtle)' }}>
                Sau khi rút, quỹ còn {formatUsdc(vb !== null ? vb - parsed : null)}, thấp hơn sàn {math.floorMonths} tháng ({formatUsdc(math.floorUsdc)}). Đầu tư sẽ bị khoá cho đến khi nạp đủ lại.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Btn variant="outline" disabled={vault.busy} onClick={() => setSheet(false)}>Hủy</Btn>
            <Btn variant="danger" loading={vault.busy} onClick={() => { void run() }}>Vẫn rút</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
