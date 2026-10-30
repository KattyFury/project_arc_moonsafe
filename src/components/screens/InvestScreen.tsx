// Screens 9 / 9b — Invest. Locked: what is missing (conditions 6 col + actions 6 col). Open (Hieu, 2026-10-30, option 2a): the next
// step for each part of the split, Crypto (buy cirBTC here), Traditional (with a broker; "How" asks the agent), Safety (savings).
// Buying cirBTC has no cap and no warning above the target: how much is the user's call (Hieu, 2026-10-30).

import { useState, type ReactNode } from 'react'
import { Bitcoin, ExternalLink, Landmark, Lock, ShieldCheck, X, type LucideIcon } from 'lucide-react'
import { bucketStanding, standingLabel, type Standing } from '@/lib/allocation'
import { useApp } from '@/state/AppState'
import { explorerTx } from '@/lib/network'
import { spendable } from '@/lib/invest'
import { GAS_ESTIMATE_USDC6 } from '@/hooks/useVault'
import { dcaNextRun, formatCirBtc } from '@/hooks/useCirBtc'
import { DCA_AVAILABLE } from '@/lib/features'
import { useNow } from '@/hooks/useNow'
import { DASH, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Title, Toggle } from '@/components/ui/kit'
import { AllocationPies } from '@/components/ui/AllocationPies'

const DCA_WEEKS = 12
const DCA_INTERVAL_DAYS = 7
const MIN_DCA = 1_000_000n

export function InvestScreen({ onOpenFund, onOpenChat, onAsk }: { onOpenFund: () => void; onOpenChat: () => void; onAsk: (question: string) => void }) {
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
                  <div className="fill-in h-full rounded-full" style={{ width: `${Math.min(math.floorPct ?? 0, 100)}%`, background: 'var(--accent)' }} />
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
  return <InvestOpen onAsk={onAsk} />
}

/** One part of the split: what is held of its target, a bar, what is left and the next step (Hieu, 2026-10-30, option 2a). */
function PartRow({ icon: Icon, color, name, have, target, status, note, action }: {
  icon: LucideIcon; color: string; name: string; have: string; target: string; status: { text: string; good: boolean }; note: string; action?: ReactNode
  }) {
  const pct = (() => { const h = Number(have.replace(/[^0-9.]/g, '')), t = Number(target.replace(/[^0-9.]/g, '')); return t > 0 ? Math.min(100, h / t * 100) : 0 })()
  return (
    <div className="py-4 flex flex-col gap-2 border-b border-[var(--line)]">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: '1px solid var(--line)', color }}><Icon size={16} /></span>
        <span className="flex-1 text-[18px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>{name}</span>
        <span className="text-[16px] leading-6 tabular-nums"><strong style={{ color: 'var(--ink)' }}>{have}</strong> <span style={{ color: 'var(--subtle)' }}>of {target}</span></span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
        <div className="fill-in h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>
          <strong style={{ color: status.good ? 'var(--success)' : 'var(--ink)' }}>{status.text}. </strong>{note}
        </p>
        {action}
      </div>
    </div>
  )
}

function InvestOpen({ onAsk }: { onAsk: (question: string) => void }) {
  const { vault, cirBtc, balance, money, moneyUsd } = useApp()
  const now = useNow()
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'once' | 'dca'>('once')
  const [buying, setBuying] = useState(false)

  const room = spendable(vault.walletBalance)
  // What the split suggests putting into BTC (cirBTC is the BTC part buyable here), limited to the wallet.
  const toTarget = balance.suggest && room !== null ? (() => {
    const t = BigInt(Math.floor(balance.suggest.to.btc * 1_000_000))
    return t < room ? t : room
  })() : null

  const parsed = parseUsdcInput(amount)
  const overWallet = room !== null && parsed > room

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
      setBuying(false)
    }
  }

  const standing = bucketStanding(balance)
  const part = (key: 'safe' | 'traditional' | 'crypto') => standing?.find(x => x.key === key)
  const crypto = part('crypto'), traditional = part('traditional'), safety = part('safe')
  const money0 = (n: number | undefined) => moneyUsd(n ?? 0)
  const status = (x: Standing | undefined) => x
    ? { text: standingLabel(x, moneyUsd), good: x.status === 'on_track' }
    : { text: `${moneyUsd(0)} to go`, good: false }
  // No buy button while Crypto is above target or below it only because prices fell (Hieu, 2026-10-29: never push buying a drop).
  const cryptoBuy = !crypto || (!crypto.priceDrop && crypto.status !== 'over')

  return (
    <Screen>
      <Grid>
        <Col span={7}>
          <div className="flex flex-col gap-2">
            <Title>Invest</Title>
            <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>Your emergency fund is full. Fill each part at your own pace; the split follows your age, {balance.age}.</p>
          </div>
          {cirBtc.valueUsdc6 === null && (cirBtc.balance ?? 0n) > 0n && (
            <Notice tone="warning">No BTC price yet, so cirBTC is left out of the totals for now. Try again in a few minutes.</Notice>
          )}
          {cirBtc.lastTxHash && (
            <Notice tone="success" title="cirBTC bought">
              <a className="inline-flex items-center gap-2 underline" target="_blank" rel="noopener noreferrer"
                href={explorerTx(cirBtc.lastTxHash)}>View transaction <ExternalLink size={16} /></a>
            </Notice>
          )}
          <div className="flex flex-col [&>*:last-child]:border-b-0">
            <PartRow icon={Bitcoin} color="#eb6834" name="Crypto" have={money0(crypto?.have)} target={money0(crypto?.target)} status={status(crypto)}
              note={cryptoBuy ? 'Buy cirBTC here, all at once or a bit each month.' : 'No need to buy more now; new money can go to the other parts.'}
              action={cryptoBuy && <Btn size="sm" className="!w-auto" onClick={() => setBuying(true)}>Buy cirBTC</Btn>} />
            <PartRow icon={Landmark} color="var(--accent)" name="Traditional" have={money0(traditional?.have)} target={money0(traditional?.target)} status={status(traditional)}
              note="An index fund such as VOO, or gold, with your own broker."
              action={<Btn size="sm" variant="outline" className="!w-auto" onClick={() => onAsk('How do I buy an index fund such as VOO, or gold, for the Traditional part of my plan?')}>How <ExternalLink size={14} /></Btn>} />
            <PartRow icon={ShieldCheck} color="#1baf7a" name="Safety" have={money0(safety?.have)} target={money0(safety?.target)} status={status(safety)}
              note="Savings you can reach any time, outside the app." />
          </div>
          <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>A suggestion, not investment advice. Prices can fall; only invest what you will not need soon.</p>
        </Col>
        <Col span={5} className="hidden lg:flex">
          <GlassCard className="p-8"><AllocationPies compact /></GlassCard>
        </Col>
      </Grid>

      {/* The cirBTC buy: opened from the Crypto row. */}
      {buying && !q && (
        <Sheet>
          <div className="flex items-center justify-between">
            <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Buy cirBTC</p>
            <button onClick={() => setBuying(false)} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-full" style={{ color: 'var(--subtle)' }}><X size={20} /></button>
          </div>
          {DCA_AVAILABLE && <Toggle value={mode} onChange={setMode}
            options={[{ value: 'once', label: 'Buy once' }, { value: 'dca', label: due ? 'DCA · due' : 'Recurring (DCA)' }]} />}
          {mode === 'once' || !DCA_AVAILABLE ? (
            <>
              <Chips items={[
                { label: 'To target', onClick: () => toTarget && setAmount(usdcToInput(toTarget)), disabled: !toTarget },
                { label: '50% wallet', onClick: () => room && setAmount(usdcToInput((room * 50n) / 100n)), disabled: !room },
                { label: 'All wallet', onClick: () => room && setAmount(usdcToInput(room)), disabled: !room },
              ]} />
              <AmountField value={amount} onChange={v => { setAmount(v); cirBtc.clearQuote() }} disabled={cirBtc.busy} />
              <p className="text-[14px] leading-5 -mt-2" style={{ color: 'var(--subtle)' }}>Wallet {money(vault.walletBalance)}, holding {formatCirBtc(cirBtc.balance)}</p>
              {overWallet && <Notice tone="danger">More than the USDC in your wallet. Max {money(room)}.</Notice>}
              {cirBtc.error && <Notice tone="danger">{cirBtc.error}</Notice>}
              <Btn loading={cirBtc.busy} disabled={parsed <= 0n || overWallet || room === null}
                onClick={() => { void cirBtc.estimate(parsed) }}>
                {cirBtc.busy ? 'Getting a quote…' : 'Get a quote'}
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
            </>
          ) : suggest !== null && suggest >= MIN_DCA ? (
            <>
              <p className="text-[16px] leading-6" style={{ color: 'var(--ink)' }}>Suggestion: buy {formatUsdc(suggest)} of cirBTC every week for {DCA_WEEKS} weeks instead of all at once.</p>
              <Btn onClick={() => cirBtc.startDca(suggest, DCA_INTERVAL_DAYS)}>Approve DCA</Btn>
            </>
          ) : (
            <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>No idle money for a DCA plan (minimum {formatUsdc(MIN_DCA)} per round).</p>
          )}
        </Sheet>
      )}

      {q && (
        <Sheet>
          {/* Laid out like a trading app's review step (Hieu, 2026-10-30): the amount first, then exactly the four lines such apps show. */}
          <div className="flex flex-col items-center gap-1 pt-2 text-center">
            <span className="text-[15px] leading-5" style={{ color: 'var(--subtle)' }}>You pay</span>
            <span className="display text-[40px] leading-[48px] font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>{q.amountInUsdc} USDC</span>
            <span className="text-[15px] leading-5" style={{ color: 'var(--subtle)' }}>You get about <strong style={{ color: 'var(--ink)' }}>{q.estimate.estimatedOutput.amount} cirBTC</strong></span>
          </div>
          <dl className="flex flex-col [&>div:last-child]:border-b-0" style={{ borderTop: '1px solid var(--line)' }}>
            {[
              ['Rate', `1 BTC = $${Math.round(q.pricePerBtc).toLocaleString('en-US')}`],
              ['Price vs market', q.premium !== null ? `${q.premium >= 0 ? '+' : ''}${(q.premium * 100).toFixed(1)}%` : DASH],
              ['Minimum received', `${q.estimate.stopLimit.amount} cirBTC`],
              ['Network fee', `about ${formatUsdc(GAS_ESTIMATE_USDC6)}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-3 border-b border-[var(--line)] text-[15px] leading-5">
                <dt style={{ color: 'var(--subtle)' }}>{k}</dt>
                <dd className="font-semibold tabular-nums text-right" style={{ color: 'var(--ink)' }}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[13px] leading-5 text-center" style={{ color: 'var(--muted)' }}>Prices can fall. The amount you get may differ slightly, never below the minimum.</p>
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
