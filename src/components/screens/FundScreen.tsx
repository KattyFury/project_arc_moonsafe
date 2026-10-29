// Screens 7 / 7b — Quỹ dự phòng (Figma: hero 5 col + deposit/withdraw card 7 col on desktop).
// Withdrawals go to the owner's wallet; below the floor → warning sheet, still allowed.

import { useState } from 'react'
import { ShieldAlert, Vault } from 'lucide-react'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatNumber, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { AmountField, Btn, Chips, Col, GlassCard, Grid, IconBox, Notice, Screen, Sheet, Toggle, glass } from '@/components/ui/kit'

type Tab = 'deposit' | 'withdraw'

export function FundScreen({ onOpenChat }: { onOpenChat: () => void }) {
  const { vault, math, money, unit, balance } = useApp()
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
      setDone(tab === 'deposit' ? `Added ${formatUsdc(parsed)} to your emergency fund` : `Withdrew ${formatUsdc(parsed)} to your wallet`)
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
              <span className="text-[14px] leading-5 font-semibold text-white">Emergency fund</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="display font-bold tabular-nums text-white text-[48px] leading-[56px] lg:text-[56px] lg:leading-[64px]">{num}</span>
              <span className="text-[20px] leading-7 font-semibold text-white">{unitLabel}</span>
            </div>
            {math.floorUsdc !== null ? (
              <>
                <p className="text-[16px] leading-6 text-white">
                  {math.floorMonths}-month floor: {formatUsdc(math.floorUsdc, 0)} · you have {formatNumber(math.vaultMonths)} months
                </p>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.24)' }}>
                  <div className="h-full rounded-full transition-all duration-700 bg-white" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <div className="flex justify-between">
                  <span className="text-[14px] leading-5 text-white">{formatUsdc(vb, 0)} / {formatUsdc(math.floorUsdc, 0)}</span>
                  <span className="text-[14px] leading-5 font-semibold text-white">{pct >= 100 ? 'Floor reached' : `${formatUsdc(math.shortfall, 0)} to go`}</span>
                </div>
              </>
            ) : (
              <button onClick={onOpenChat} className="text-left text-[16px] leading-6 text-white">
                {balance.cashflow.spending !== null ? 'No exchange rate yet to work out the floor' : 'Tell the agent your monthly spending to see how big the fund should be'}
              </button>
            )}
          </section>
        </Col>

        <Col span={7}>
          {/* Deposit / withdraw card */}
          <GlassCard className="p-4 lg:p-8 flex flex-col gap-4">
            <Toggle value={tab} onChange={t => { setTab(t); setAmount(''); setError(null); setDone(null) }}
              options={[{ value: 'deposit', label: 'Add money' }, { value: 'withdraw', label: 'Withdraw' }]} />
            <Chips items={[
              { label: '25%', onClick: () => chip(25), disabled: !max },
              { label: '50%', onClick: () => chip(50), disabled: !max },
              { label: 'Max', onClick: () => chip('max'), disabled: !max },
            ]} />
            <AmountField value={amount} onChange={v => { setAmount(v); setDone(null) }} disabled={vault.busy} />
            <p className="text-[14px] leading-5 -mt-2" style={{ color: 'var(--subtle)' }}>
              {tab === 'deposit'
                ? `In wallet: ${formatUsdc(wb)} · keeping ${formatUsdc(GAS_RESERVE_USDC6)} for fees`
                : `In emergency fund: ${formatUsdc(vb)} · goes back to your own wallet`}
            </p>

            {tab === 'withdraw' && !vault.isOwner && vault.vaultOwner && (
              <Notice tone="info">Only the wallet that opened your emergency fund ({vault.vaultOwner.slice(0, 6)}…{vault.vaultOwner.slice(-4)}) can withdraw. Switch to it in Menu; the money goes back to that wallet.</Notice>
            )}
            {tab === 'withdraw' && wb !== null && wb < GAS_ESTIMATE_USDC6 && (
              <Notice tone="warning">The wallet needs about {formatUsdc(GAS_ESTIMATE_USDC6)} to pay the withdrawal fee.</Notice>
            )}
            {tooMuch && <Notice tone="danger">{tab === 'deposit' ? 'More than the wallet can add.' : 'More than the emergency fund holds.'}</Notice>}
            {done && <Notice tone="success">{done}</Notice>}
            {error && <Notice tone="danger">{error}</Notice>}

            <Btn loading={vault.busy} disabled={parsed <= 0n || tooMuch || max === null || (tab === 'withdraw' && !vault.isOwner)}
              onClick={() => { if (belowFloor) setSheet(true); else void run() }}>
              {vault.busy ? 'Waiting for wallet…' : tab === 'deposit' ? 'Add to emergency fund' : 'Withdraw to wallet'}
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
              <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Withdraw below the floor</p>
              <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
                After this, the emergency fund holds {formatUsdc(vb !== null ? vb - parsed : null)}, below the {math.floorMonths}-month floor ({formatUsdc(math.floorUsdc)}). cirBTC buying locks until you top it back up.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <Btn variant="outline" disabled={vault.busy} onClick={() => setSheet(false)}>Cancel</Btn>
            <Btn variant="danger" loading={vault.busy} onClick={() => { void run() }}>Withdraw anyway</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}
