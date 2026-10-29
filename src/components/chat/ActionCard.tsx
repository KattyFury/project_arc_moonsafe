// Confirmation card the agent puts in the chat (deposit, withdraw, buy cirBTC, DCA), so the
// conversation is not interrupted by a screen change. Nothing is signed until the user taps
// the card's button; the wallet then asks them to confirm.

import { useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, ExternalLink, Repeat, TrendingUp } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { explorerTx } from '@/lib/network'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { toAppKitAmount } from '@/hooks/useCirBtc'
import { overTargetWarning, spendable } from '@/lib/invest'
import { formatUsdc, formatUsd } from '@/lib/format'
import { Btn, GlassCard, IconBox, Notice } from '@/components/ui/kit'

export type ChatAction =
  | { id: number; at: number; kind: 'deposit' | 'withdraw' | 'buy'; amount: bigint; status?: 'done' | 'cancelled' }
  | { id: number; at: number; kind: 'dca'; amount: bigint; intervalDays: number; status?: 'done' | 'cancelled' }

type Status = 'idle' | 'busy' | 'done' | 'error' | 'cancelled'

const TITLES = { deposit: 'Add to emergency fund', withdraw: 'Withdraw to wallet', buy: 'Buy cirBTC', dca: 'Recurring buy (DCA)' } as const
const ICONS = { deposit: ArrowDownToLine, withdraw: ArrowUpFromLine, buy: TrendingUp, dca: Repeat } as const

/** onFinished: the card was signed or cancelled (stored, so a remounted chat shows it the same way). */
/** "every day" / "every 7 days". */
export const everyDays = (n: number) => (n === 1 ? 'every day' : `every ${n} days`)

/** title: overrides the heading (the DCA round that is due is a plain buy card). */
export function ActionCard({ action, title, onFinished }: { action: ChatAction; title?: string; onFinished?: (status: 'done' | 'cancelled', summary: string) => void }) {
  const { vault, math, cirBtc, balance, money, unit } = useApp()
  const [status, setStatus] = useState<Status>(action.status ?? 'idle')
  const [error, setError] = useState<string | null>(null)
  const { kind, amount } = action
  const Icon = ICONS[kind]

  const wb = vault.walletBalance
  const vb = vault.vaultBalance
  const maxDeposit = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const room = spendable(wb)
  // One quote lives in the app: a card uses it only when it is for this card's amount (a quote for another card once showed here).
  const q = cirBtc.quote && cirBtc.quote.amountInUsdc === toAppKitAmount(amount) ? cirBtc.quote : null

  // What blocks the button, and what the user should know before signing.
  let block: string | null = null
  const warnings: string[] = []
  if (kind === 'deposit') {
    if (maxDeposit !== null && amount > maxDeposit) block = `More than the wallet can add (up to ${formatUsdc(maxDeposit)}, keeping ${formatUsdc(GAS_RESERVE_USDC6)} for fees).`
  } else if (kind === 'withdraw') {
    if (vb !== null && amount > vb) block = `More than the emergency fund holds (${formatUsdc(vb)}).`
    else if (wb !== null && wb < GAS_ESTIMATE_USDC6) block = `The wallet needs about ${formatUsdc(GAS_ESTIMATE_USDC6)} to pay the withdrawal fee.`
    else if (math.floorUsdc !== null && vb !== null && vb - amount < math.floorUsdc) {
      warnings.push(`After this, the emergency fund holds ${formatUsdc(vb - amount)}, below the ${math.floorMonths}-month floor (${formatUsd(math.floorUsdc)}). cirBTC buying locks until you top it back up.`)
    }
  } else {
    if (!math.investUnlocked) block = balance.lock.text
    else if (kind === 'buy' && room !== null && amount > room) block = `More than the USDC in your wallet (up to ${formatUsdc(room)}).`
    else {
      const over = kind === 'buy' ? overTargetWarning(balance, amount) : null
      if (over) warnings.push(over)
      warnings.push('cirBTC can fall sharply. Only invest money you can afford to lose. For information only, not investment advice.')
    }
  }

  const run = async () => {
    setStatus('busy'); setError(null)
    try {
      if (kind === 'deposit') await vault.deposit(amount)
      else if (kind === 'withdraw') await vault.withdraw(amount)
      else if (kind === 'dca') cirBtc.startDca(amount, action.intervalDays)
      else if (!q) { await cirBtc.estimate(amount); setStatus('idle'); return }
      else if (!(await cirBtc.execute())) throw new Error(cirBtc.error ?? 'The cirBTC purchase did not go through')
      setStatus('done')
      onFinished?.('done', doneText)
    } catch (e) {
      setError(txErrorMessage(e)); setStatus('error')
    }
  }
  const cancel = () => { if (kind === 'buy' && q) cirBtc.clearQuote(); setStatus('cancelled'); onFinished?.('cancelled', `Cancelled: ${TITLES[kind]} ${formatUsdc(amount)}.`) }

  const doneText = kind === 'deposit' ? `Added ${formatUsdc(amount)} to your emergency fund.`
    : kind === 'withdraw' ? `Withdrew ${formatUsdc(amount)} to your wallet.`
    : kind === 'dca' ? `DCA approved: ${formatUsdc(amount)} ${everyDays(action.intervalDays)}. Each round you still review the quote and sign.`
    : 'cirBTC bought.'
  const signLabel = kind === 'dca' ? 'Approve DCA' : kind === 'buy' && !q ? 'Get a quote' : kind === 'buy' ? 'Sign purchase' : kind === 'withdraw' && warnings.length ? 'Withdraw anyway' : 'Sign transaction'
  const busyLabel = kind === 'buy' && !q ? 'Getting a quote…' : 'Waiting for wallet…'

  return (
    <GlassCard className="ml-10 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <IconBox><Icon size={24} style={{ color: 'var(--accent)' }} /></IconBox>
        <div className="min-w-0">
          <p className="text-[14px] leading-5 font-semibold" style={{ color: 'var(--subtle)' }}>{title ?? TITLES[kind]}</p>
          <p className="display font-bold text-[24px] leading-8 tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(amount)}{kind === 'dca' ? <span className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}> / {action.intervalDays === 1 ? 'day' : `${action.intervalDays} days`}</span> : null}
          </p>
          {unit === 'VND' && <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>≈ {money(amount)}</p>}
        </div>
      </div>

      {kind === 'buy' && q && status !== 'done' && (
        <div className="flex items-center gap-2 p-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
          <div className="flex-1 text-center">
            <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{q.amountInUsdc} USDC</p>
            <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>You pay</p>
          </div>
          <ArrowRight size={20} style={{ color: 'var(--muted)' }} />
          <div className="flex-1 text-center">
            <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</p>
            <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>You get, estimated (min {q.estimate.stopLimit.amount})</p>
          </div>
        </div>
      )}
      {kind === 'buy' && q && status !== 'done' && (
        <p className="text-[14px] leading-5 text-center -mt-2" style={{ color: 'var(--subtle)' }}>{`Price ${Math.round(q.pricePerBtc).toLocaleString('en-US')} USD per BTC${q.premium !== null ? `, ${q.premium >= 0 ? '+' : ''}${(q.premium * 100).toFixed(1)}% vs market` : ''}`}</p>
      )}

      {status === 'done' ? (
        <Notice tone="success" title={doneText}>
          {kind === 'buy' && cirBtc.lastTxHash && (
            <a className="inline-flex items-center gap-2 underline" target="_blank" rel="noopener noreferrer"
              href={explorerTx(cirBtc.lastTxHash)}>View transaction <ExternalLink size={16} /></a>
          )}
        </Notice>
      ) : status === 'cancelled' ? (
        <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>Cancelled. Message the agent whenever you need it.</p>
      ) : (
        <>
          {block && <Notice tone="danger">{block}</Notice>}
          {!block && warnings.map(w => <Notice key={w} tone="warning">{w}</Notice>)}
          {error && <Notice tone="danger">{error}</Notice>}
          {!block && kind === 'buy' && cirBtc.error && !error && <Notice tone="danger">{cirBtc.error}</Notice>}
          <div className="flex gap-4">
            <Btn variant="outline" disabled={status === 'busy'} onClick={cancel}>Cancel</Btn>
            <Btn variant={kind === 'withdraw' && warnings.length ? 'danger' : 'primary'} loading={status === 'busy'} disabled={!!block} onClick={() => { void run() }}>
              {status === 'busy' ? busyLabel : signLabel}
            </Btn>
          </div>
        </>
      )}
    </GlassCard>
  )
}
