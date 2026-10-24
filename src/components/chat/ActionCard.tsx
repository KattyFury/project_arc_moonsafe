// Confirmation card the agent puts in the chat (deposit, withdraw, buy cirBTC, DCA), so the
// conversation is not interrupted by a screen change. Nothing is signed until the user taps
// the card's button; the wallet then asks them to confirm.

import { useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ExternalLink, Repeat, TrendingUp } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { overTargetWarning, spendable } from '@/lib/invest'
import { formatUsdc } from '@/lib/format'
import { Btn, GlassCard, IconBox, Notice } from '@/components/ui/kit'

export type ChatAction =
  | { id: number; anchor: number; kind: 'deposit' | 'withdraw' | 'buy'; amount: bigint }
  | { id: number; anchor: number; kind: 'dca'; amount: bigint; intervalDays: number }

type Status = 'idle' | 'busy' | 'done' | 'error' | 'cancelled'

const TITLES = { deposit: 'Nạp vào quỹ', withdraw: 'Rút về ví', buy: 'Mua cirBTC', dca: 'Mua đều (DCA)' } as const
const ICONS = { deposit: ArrowDownToLine, withdraw: ArrowUpFromLine, buy: TrendingUp, dca: Repeat } as const

export function ActionCard({ action }: { action: ChatAction }) {
  const { vault, math, cirBtc, alloc, money, unit } = useApp()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const { kind, amount } = action
  const Icon = ICONS[kind]

  const wb = vault.walletBalance
  const vb = vault.vaultBalance
  const maxDeposit = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const room = spendable(wb)
  const q = cirBtc.quote

  // What blocks the button, and what the user should know before signing.
  let block: string | null = null
  const warnings: string[] = []
  if (kind === 'deposit') {
    if (maxDeposit !== null && amount > maxDeposit) block = `Vượt số USDC có thể nạp từ ví (tối đa ${formatUsdc(maxDeposit)}, giữ lại ${formatUsdc(GAS_RESERVE_USDC6)} làm phí).`
  } else if (kind === 'withdraw') {
    if (vb !== null && amount > vb) block = `Vượt số dư trong quỹ (${formatUsdc(vb)}).`
    else if (wb !== null && wb < GAS_ESTIMATE_USDC6) block = `Ví cần khoảng ${formatUsdc(GAS_ESTIMATE_USDC6)} để trả phí giao dịch rút.`
    else if (math.floorUsdc !== null && vb !== null && vb - amount < math.floorUsdc) {
      warnings.push(`Sau khi rút, quỹ còn ${formatUsdc(vb - amount)}, thấp hơn sàn ${math.floorMonths} tháng (${formatUsdc(math.floorUsdc)}). Đầu tư sẽ bị khoá cho đến khi nạp đủ lại.`)
    }
  } else {
    if (!math.investUnlocked) block = 'Đầu tư đang khoá: cần không còn nợ và quỹ dự phòng đủ mốc.'
    else if (kind === 'buy' && room !== null && amount > room) block = `Vượt số USDC trong ví (dùng được tối đa ${formatUsdc(room)}).`
    else {
      const over = kind === 'buy' ? overTargetWarning(alloc, amount) : null
      if (over) warnings.push(over)
      warnings.push('Giá cirBTC có thể giảm sâu. Chỉ đầu tư số tiền sẵn sàng mất. Đây là thông tin tham khảo, không phải tư vấn đầu tư.')
    }
  }

  const run = async () => {
    setStatus('busy'); setError(null)
    try {
      if (kind === 'deposit') await vault.deposit(amount)
      else if (kind === 'withdraw') await vault.withdraw(amount)
      else if (kind === 'dca') cirBtc.startDca(amount, action.intervalDays)
      else if (!q) { await cirBtc.estimate(amount); setStatus('idle'); return }
      else if (!(await cirBtc.execute())) throw new Error(cirBtc.error ?? 'Mua cirBTC không thành công')
      setStatus('done')
    } catch (e) {
      setError(txErrorMessage(e)); setStatus('error')
    }
  }
  const cancel = () => { if (kind === 'buy') cirBtc.clearQuote(); setStatus('cancelled') }

  const doneText = kind === 'deposit' ? `Đã nạp ${formatUsdc(amount)} vào quỹ.`
    : kind === 'withdraw' ? `Đã rút ${formatUsdc(amount)} về ví.`
    : kind === 'dca' ? `Đã duyệt DCA: ${formatUsdc(amount)} mỗi ${action.intervalDays} ngày. Mỗi kỳ bạn vẫn tự xem báo giá và ký.`
    : 'Đã mua cirBTC.'
  const signLabel = kind === 'dca' ? 'Duyệt DCA' : kind === 'buy' && !q ? 'Xem báo giá' : kind === 'buy' ? 'Ký mua' : kind === 'withdraw' && warnings.length ? 'Vẫn ký rút' : 'Ký giao dịch'
  const busyLabel = kind === 'buy' && !q ? 'Đang lấy báo giá…' : 'Đang chờ ví…'

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <IconBox><Icon size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <div className="min-w-0">
          <p className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{TITLES[kind]}</p>
          <p className="display font-bold text-[24px] leading-8 tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(amount)}{kind === 'dca' ? <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}> / {action.intervalDays} ngày</span> : null}
          </p>
          {unit === 'VND' && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>≈ {money(amount)}</p>}
        </div>
      </div>

      {kind === 'buy' && q && status !== 'done' && (
        <div className="flex items-center gap-2 p-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <div className="flex-1 text-center">
            <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{q.amountInUsdc.replace('.', ',')} USDC</p>
            <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Bạn trả</p>
          </div>
          <ArrowRight size={20} style={{ color: 'var(--muted)' }} />
          <div className="flex-1 text-center">
            <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</p>
            <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Nhận ước tính (tối thiểu {q.estimate.stopLimit.amount})</p>
          </div>
        </div>
      )}

      {status === 'done' ? (
        <Notice tone="success" title={doneText}>
          {kind === 'buy' && cirBtc.lastTxHash && (
            <a className="inline-flex items-center gap-2 underline" target="_blank" rel="noopener noreferrer"
              href={`https://explorer.testnet.arc.io/tx/${cirBtc.lastTxHash}`}>Xem giao dịch <ExternalLink size={16} /></a>
          )}
        </Notice>
      ) : status === 'cancelled' ? (
        <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Đã huỷ. Cần thì cứ nhắn lại agent.</p>
      ) : (
        <>
          {block && <Notice tone="danger">{block}</Notice>}
          {!block && warnings.map(w => <Notice key={w} tone="warning">{w}</Notice>)}
          {error && <Notice tone="danger">{error}</Notice>}
          {!block && kind === 'buy' && cirBtc.error && !error && <Notice tone="danger">{cirBtc.error}</Notice>}
          <div className="flex gap-4">
            <Btn variant="outline" disabled={status === 'busy'} onClick={cancel}>Huỷ</Btn>
            <Btn variant={kind === 'withdraw' && warnings.length ? 'danger' : 'primary'} loading={status === 'busy'} disabled={!!block} onClick={() => { void run() }}>
              {status === 'busy' ? busyLabel : signLabel}
            </Btn>
          </div>
        </>
      )}
    </GlassCard>
  )
}
