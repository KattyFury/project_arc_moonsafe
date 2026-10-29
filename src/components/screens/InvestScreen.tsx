// Screens 9 / 9b — Đầu tư (Figma: locked = conditions 6 col + actions 6 col). The allocation
// chart (target by age vs now) shows in both states; buying cirBTC has no cap, the app only
// warns when a buy goes above the BTC target (docs/SPEC-FRAMEWORK-2026-10-25.md 5.3, 7).

import { useState } from 'react'
import { ArrowRight, ExternalLink, Lock } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { explorerTx } from '@/lib/network'
import { overTargetWarning, spendable } from '@/lib/invest'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { DCA_AVAILABLE } from '@/lib/features'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n

export function InvestScreen({ onOpenFund, onOpenChat }: { onOpenFund: () => void; onOpenChat: () => void }) {
  const { math, balance: b, profile } = useApp()

  if (!math.investUnlocked) {
    // Spec 5.3: one sentence, what is missing and how much. Only the in-app cirBTC buy is blocked.
    const p = profile.profile
    const needsAgent = b.cashflow.spending === null || p?.incomeStable === null || p?.incomeStable === undefined || (!p?.debtsComplete && !b.debts.priorityCount)
    return (
      <Screen>
        <Grid>
          <Col span={6}>
            <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <IconBox><Lock size={24} style={{ color: 'var(--accent)' }} /></IconBox>
                <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>cirBTC buying is locked</p>
              </div>
              <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>{b.lock.text}</p>
              {math.floorUsdc !== null && (
                <div className="h-2 rounded-full" style={{ background: 'var(--surface-muted)' }} role="img" aria-label={`Emergency fund at ${Math.round(math.floorPct ?? 0)}% of its floor`}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(math.floorPct ?? 0, 100)}%`, background: 'var(--accent)' }} />
                </div>
              )}
              <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Only the in-app cirBTC buy waits. What you buy elsewhere is your call.</p>
            </GlassCard>
          </Col>
          <Col span={6}>
            {needsAgent
              ? <Btn onClick={onOpenChat}>Talk to the agent</Btn>
              : b.debts.priorityCount
                ? <Notice tone="warning">Once your priority debt is paid off, tell the agent.</Notice>
                : <Btn onClick={onOpenFund}>Add to emergency fund</Btn>}
            <Btn disabled><Lock size={16} />Buy cirBTC</Btn>
            <GlassCard className="p-4 lg:p-8"><AllocationPies compact /></GlassCard>
          </Col>
        </Grid>
      </Screen>
    )
  }
  return <InvestOpen />
}

function InvestOpen() {
  const { vault, cirBtc, balance, money } = useApp()
  const now = useNow()
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'once' | 'dca'>('once')

  const room = spendable(vault.walletBalance)
  // What the split suggests putting into BTC (cirBTC is the BTC part buyable here), limited to the wallet.
  const toTarget = balance.suggest && room !== null ? (() => {
    const t = BigInt(Math.floor(balance.suggest.to.btc * 1_000_000))
    return t < room ? t : room
  })() : null

  const parsed = parseUsdcInput(amount)
  const overWallet = room !== null && parsed > room
  const overTarget = parsed > 0n && !overWallet ? overTargetWarning(balance, parsed) : null

  const dca = cirBtc.dca
  const next = dcaNextRun(dca)
  const due = next !== null && next <= now
  const dcaAmount = dca ? BigInt(dca.amountUsdc) : null
  const suggest = toTarget !== null ? (toTarget / BigInt(DCA_WEEKS) / 10_000n) * 10_000n : null
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
          <GlassCard className="p-4 lg:p-8"><AllocationPies compact /></GlassCard>
        </Col>

        <Col span={7}>
          {cirBtc.valueUsdc6 === null && (cirBtc.balance ?? 0n) > 0n && (
            <Notice tone="warning">No BTC price yet, so cirBTC is left out of the chart for now. Try again in a few minutes.</Notice>
          )}

          {/* One card: buy once or set a weekly DCA */}
          <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
            <Toggle value={mode} onChange={setMode}
              options={[{ value: 'once', label: 'Buy once' }, { value: 'dca', label: !DCA_AVAILABLE ? 'DCA · not available' : due ? 'DCA · due' : 'Recurring (DCA)' }]} />

            {mode === 'once' ? (
              <>
                <Chips items={[
                  { label: 'To target', onClick: () => toTarget && setAmount(usdcToInput(toTarget)), disabled: !toTarget },
                  { label: '50% wallet', onClick: () => room && setAmount(usdcToInput((room * 50n) / 100n)), disabled: !room },
                  { label: 'All wallet', onClick: () => room && setAmount(usdcToInput(room)), disabled: !room },
                ]} />
                <AmountField value={amount} onChange={v => { setAmount(v); cirBtc.clearQuote() }} disabled={cirBtc.busy} />
                <p className="text-[14px] leading-5 -mt-2" style={{ color: 'var(--subtle)' }}>Wallet {money(vault.walletBalance)} · holding {formatCirBtc(cirBtc.balance)}</p>
                <Notice tone="warning">cirBTC can fall sharply. Only invest money you can afford to lose. For information only, not investment advice.</Notice>
                {overWallet && <Notice tone="danger">More than the USDC in your wallet. Max {money(room)}.</Notice>}
                {overTarget && <Notice tone="warning">{overTarget}</Notice>}
                {cirBtc.error && !q && <Notice tone="danger">{cirBtc.error}</Notice>}
                {cirBtc.lastTxHash && (
                  <Notice tone="success" title="cirBTC bought">
                    <a className="inline-flex items-center gap-2 underline" target="_blank" rel="noopener noreferrer"
                      href={explorerTx(cirBtc.lastTxHash)}>View transaction <ExternalLink size={16} /></a>
                  </Notice>
                )}
                <Btn loading={cirBtc.busy && !q} disabled={parsed <= 0n || overWallet || room === null}
                  onClick={() => { void cirBtc.estimate(parsed) }}>
                  {cirBtc.busy && !q ? 'Getting a quote…' : 'Get a quote · Buy cirBTC'}
                </Btn>
              </>
            ) : !DCA_AVAILABLE ? (
              <Notice tone="info" title="DCA is not available yet">Recurring buys are coming on mainnet. For now you can buy cirBTC once.</Notice>
            ) : dca && dcaAmount !== null ? (
              <>
                <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>
                  {formatUsdc(dcaAmount)} every {dca.intervalDays} days. {due ? 'A buy is due.' : `Next: ${next ? new Date(next).toLocaleDateString('en-US') : DASH}.`}
                </p>
                <div className="flex gap-4">
                  <Btn variant="outline" onClick={cirBtc.stopDca}>Stop DCA</Btn>
                  <Btn disabled={!due} onClick={() => { setAmount(usdcToInput(dcaAmount)); setMode('once') }}>Buy this round</Btn>
                </div>
                <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Each round you review the quote and sign. You can say “stop DCA” in the chat.</p>
              </>
            ) : suggest !== null && suggest >= MIN_DCA ? (
              <>
                <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>Suggestion: buy {formatUsdc(suggest)} of cirBTC every week for {DCA_WEEKS} weeks instead of all at once.</p>
                <Btn onClick={() => cirBtc.startDca(suggest, DCA_INTERVAL_DAYS)}>Approve DCA</Btn>
              </>
            ) : (
              <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>No idle money to move into investments for a DCA plan (minimum {formatUsdc(MIN_DCA)} per round). For a different recurring amount, ask the agent.</p>
            )}
          </GlassCard>
        </Col>
      </Grid>

      {q && (
        <Sheet>
          <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Confirm purchase</p>
          <div className="flex items-center gap-2 px-4 py-4 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.amountInUsdc} USDC</p>
              <p className="text-[14px]" style={{ color: 'var(--muted)' }}>You pay</p>
            </div>
            <ArrowRight size={18} style={{ color: 'var(--muted)' }} className="flex-shrink-0" />
            <div className="text-center flex-1">
              <p className="font-bold text-[16px]" style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</p>
              <p className="text-[14px]" style={{ color: 'var(--muted)' }}>You get (estimate)</p>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-[14px]" style={{ color: 'var(--muted)' }}>Price per BTC</span>
            <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>{`${Math.round(q.pricePerBtc).toLocaleString('en-US')} USD per BTC${q.premium !== null ? `, ${q.premium >= 0 ? '+' : ''}${(q.premium * 100).toFixed(1)}% vs market` : ''}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[14px]" style={{ color: 'var(--muted)' }}>Minimum received (slippage ≤ 3%)</span>
            <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>{q.estimate.stopLimit.amount} cirBTC</span>
          </div>
          <Notice tone="warning">The final price may differ from the estimate. Only invest money you can afford to lose.</Notice>
          {cirBtc.error && <Notice tone="danger">{cirBtc.error}</Notice>}
          <div className="flex gap-4">
            <Btn variant="outline" disabled={cirBtc.busy} onClick={cirBtc.clearQuote}>Cancel</Btn>
            <Btn loading={cirBtc.busy} onClick={() => { void buy() }}>{cirBtc.busy ? 'Buying…' : 'Buy cirBTC'}</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
