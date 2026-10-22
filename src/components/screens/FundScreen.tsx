// Screens 7 / 7b — Quỹ dự phòng (Figma: hero 5 col + deposit/withdraw card 7 col on desktop).
// Withdrawals go to the owner's wallet; below the floor → warning sheet, still allowed.

import { useState } from 'react'
import { ShieldAlert, Vault } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatNumber, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import type { Prefill } from '@/types'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Toggle, glass } from '@/components/ui/kit'

type Tab = 'deposit' | 'withdraw'

export function FundScreen({ onOpenChat, prefill }: { onOpenChat: () => void; prefill?: Extract<Prefill, { kind: 'deposit' | 'withdraw' }> | null }) {
  const { vault, math, money, unit, profile } = useApp()
  const [tab, setTab] = useState<Tab>(prefill?.kind ?? 'deposit')
  const [amount, setAmount] = useState(prefill ? usdcToInput(prefill.amount) : '')
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
      <Grid>
        <Col span={5}>
          {/* Hero balance card: the one gradient region on this screen */}
          <section className="p-4 lg:p-8 flex flex-col gap-2" style={glass.hero}>
            <div className="flex items-center gap-2">
              <Vault size={20} color="white" />
              <span className="text-[14px] leading-5 font-semibold text-white">Quỹ dự phòng</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="display font-bold tabular-nums text-white text-[48px] leading-[56px] lg:text-[56px] lg:leading-[64px]">{num}</span>
              <span className="text-[20px] leading-7 font-semibold text-white">{unitLabel}</span>
            </div>
            {math.floorUsdc !== null ? (
              <>
                <p className="text-[16px] leading-6 text-white">
                  Sàn {math.floorMonths} tháng: {formatUsdc(math.floorUsdc, 0)} · đang có {formatNumber(math.vaultMonths)} tháng
                </p>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.24)' }}>
                  <div className="h-full rounded-full transition-all duration-700 bg-white" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[14px] leading-5 text-white">{formatUsdc(vb, 0)} / {formatUsdc(math.floorUsdc, 0)}</span>
                  <span className="text-[14px] leading-5 font-semibold text-white">{pct >= 100 ? 'Đủ sàn' : `Còn thiếu ${formatUsdc(math.shortfall, 0)}`}</span>
                </div>
              </>
            ) : (
              <button onClick={onOpenChat} className="text-left text-[16px] leading-6 text-white underline">
                {profile.complete ? 'Chưa có tỉ giá để tính mức sàn' : 'Kể chi tiêu hằng tháng cho agent để biết quỹ cần bao nhiêu'}
              </button>
            )}
          </section>
        </Col>

        <Col span={7}>
          {prefill && amount && (
            <Notice tone="info" title="Agent đã điền sẵn">Kiểm tra số tiền rồi bấm {tab === 'deposit' ? 'Nạp vào quỹ' : 'Rút về ví'} và ký trong ví.</Notice>
          )}

          {/* Deposit / withdraw card */}
          <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
            <Toggle value={tab} onChange={t => { setTab(t); setAmount(''); setError(null); setDone(null) }}
              options={[{ value: 'deposit', label: 'Nạp vào quỹ' }, { value: 'withdraw', label: 'Rút về ví' }]} />
            <Chips items={[
              { label: '25%', onClick: () => chip(25), disabled: !max },
              { label: '50%', onClick: () => chip(50), disabled: !max },
              { label: 'Tối đa', onClick: () => chip('max'), disabled: !max },
            ]} />
            <AmountField value={amount} onChange={v => { setAmount(v); setDone(null) }} disabled={vault.busy} />
            <p className="text-[14px] leading-5 -mt-2" style={{ color: 'var(--subtle)' }}>
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
          </GlassCard>
        </Col>
      </Grid>

      {/* 7b — below floor */}
      {sheet && (
        <Sheet>
          <div className="flex items-start gap-2">
            <IconBox tone="red"><ShieldAlert size={24} style={{ color: 'var(--danger)' }} /></IconBox>
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Rút dưới mức sàn</p>
              <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
                Sau khi rút, quỹ còn {formatUsdc(vb !== null ? vb - parsed : null)}, thấp hơn sàn {math.floorMonths} tháng ({formatUsdc(math.floorUsdc)}). Đầu tư sẽ bị khoá cho đến khi nạp đủ lại.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Btn variant="outline" disabled={vault.busy} onClick={() => setSheet(false)}>Hủy</Btn>
            <Btn variant="danger" loading={vault.busy} onClick={() => { void run() }}>Vẫn rút</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
