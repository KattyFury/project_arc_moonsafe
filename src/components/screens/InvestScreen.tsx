// Screens 9 / 9b — Đầu tư (Figma: locked = conditions 6 col + actions 6 col). The allocation
// chart (target by age vs now) shows in both states; buying cirBTC has no cap, the app only
// warns when a buy goes above the target (docs/FRAMEWORK-TAI-CHINH.md).

import { useState } from 'react'
import { ArrowRight, CheckCircle2, ExternalLink, Lock, XCircle } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { overTargetWarning, spendable } from '@/lib/invest'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n

export function InvestScreen({ onOpenFund, onOpenChat }: { onOpenFund: () => void; onOpenChat: () => void }) {
  const { math, profile, money } = useApp()

  if (!math.investUnlocked) {
    const checks = [
      { ok: profile.complete, label: profile.complete ? 'The agent knows your cash flow' : 'The agent does not know your cash flow yet' },
      { ok: math.noDebt === true, label: math.noDebt === false ? 'You still have outside debt' : 'No outside debt' },
      { ok: math.fundOk, label: math.fundOk ? 'Emergency fund at its floor' : 'Emergency fund below its floor' },
    ]
    return (
      <Screen>
        <Grid>
          <Col span={6}>
            <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <IconBox><Lock size={24} style={{ color: 'var(--accent)' }} /></IconBox>
                <div>
                  <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Investing is locked</p>
                  <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Order: clear debt → emergency fund → invest</p>
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
                  <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Still needed in the fund</p>
                  <p className="display font-bold text-[24px] leading-8 tabular-nums" style={{ color: 'var(--ink)' }}>{money(math.shortfall)}</p>
                </div>
              )}
            </GlassCard>
          </Col>
          <Col span={6}>
            {!profile.complete
              ? <Btn onClick={onOpenChat}>Talk to the agent</Btn>
              : math.noDebt === false
                ? <Notice tone="warning">Once your outside debt is paid off, tell the agent to unlock investing.</Notice>
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
  const { vault, cirBtc, alloc, money } = useApp()
  const now = useNow()
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'once' | 'dca'>('once')

  const room = spendable(vault.walletBalance)
  // What the chart suggests putting into investments, limited to the wallet.
  const toTarget = alloc.suggest && room !== null ? (() => {
    const t = BigInt(Math.floor(alloc.suggest.toInvest * 1_000_000))
    return t < room ? t : room
  })() : null

  const parsed = parseUsdcInput(amount)
  const overWallet = room !== null && parsed > room
  const overTarget = parsed > 0n && !overWallet ? overTargetWarning(alloc, parsed) : null

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
              options={[{ value: 'once', label: 'Buy once' }, { value: 'dca', label: due ? 'DCA · due' : 'Recurring (DCA)' }]} />

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
                      href={`https://explorer.testnet.arc.io/tx/${cirBtc.lastTxHash}`}>View transaction <ExternalLink size={16} /></a>
                  </Notice>
                )}
                <Btn loading={cirBtc.busy && !q} disabled={parsed <= 0n || overWallet || room === null}
                  onClick={() => { void cirBtc.estimate(parsed) }}>
                  {cirBtc.busy && !q ? 'Getting a quote…' : 'Get a quote · Buy cirBTC'}
                </Btn>
              </>
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
