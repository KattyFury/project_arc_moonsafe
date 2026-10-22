// Screens 7 / 7b — Quỹ dự phòng: progress vs floor, Nạp / Rút.
// Withdrawals always go to the owner's wallet. Going below the floor shows the
// red warning (7b); the user can still withdraw, and investing locks again.

import { useState } from 'react'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, GAS_RESERVE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatNumber, formatUsdc, parseUsdcInput, usdcToInput } from '@/lib/format'
import { Button, Chips, Notice, Progress, Segmented, UsdcInput } from '@/components/ui/kit'
import { PanelShell } from './PanelShell'

type Tab = 'deposit' | 'withdraw'

export function FundPanel({ onClose, onDeclare }: { onClose: () => void; onDeclare: () => void }) {
  const { vault, math, money, profile } = useApp()
  const [tab, setTab] = useState<Tab>('deposit')
  const [amount, setAmount] = useState('')
  const [confirmLow, setConfirmLow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const vb = vault.vaultBalance
  const wb = vault.walletBalance
  const parsed = parseUsdcInput(amount)
  const maxDeposit = wb !== null ? (wb > GAS_RESERVE_USDC6 ? wb - GAS_RESERVE_USDC6 : 0n) : null
  const max = tab === 'deposit' ? maxDeposit : vb
  const tooMuch = max !== null && parsed > max
  const belowFloor = tab === 'withdraw' && math.floorUsdc !== null && vb !== null && vb - parsed < math.floorUsdc

  const switchTab = (t: Tab) => { setTab(t); setAmount(''); setError(null); setConfirmLow(false); setDone(null) }

  const run = async () => {
    setError(null); setDone(null)
    try {
      if (tab === 'deposit') await vault.deposit(parsed)
      else await vault.withdraw(parsed)
      setDone(tab === 'deposit' ? `Đã nạp ${formatUsdc(parsed)} vào quỹ.` : `Đã rút ${formatUsdc(parsed)} về ví.`)
      setAmount('')
      setConfirmLow(false)
    } catch (e) {
      setError(txErrorMessage(e))
    }
  }

  const onPrimary = () => {
    if (belowFloor && !confirmLow) { setConfirmLow(true); return }
    void run()
  }

  const chip = (pct: number | 'max') => {
    if (max === null) return
    setAmount(usdcToInput(pct === 'max' ? max : (max * BigInt(pct)) / 100n))
    setConfirmLow(false)
  }

  return (
    <PanelShell title="Quỹ dự phòng" onClose={onClose}>
      {/* The one gradient region on this screen */}
      <section className="rounded-md p-4 flex flex-col gap-2 text-on-blue shadow-y2" style={{ background: 'var(--gradient)' }}>
        <p className="text-app-secondary">Trong quỹ</p>
        <p className="text-app-large-title tabular">{money(vb)}</p>
        {math.floorUsdc !== null ? (
          <>
            <Progress pct={math.floorPct} tone="on-blue" />
            <p className="text-app-note tabular">
              {formatUsdc(vb, 0)} / {formatUsdc(math.floorUsdc, 0)} · {formatNumber(math.vaultMonths)}/{math.floorMonths} tháng
            </p>
          </>
        ) : (
          <p className="text-app-note">
            {profile.complete ? 'Chưa có tỉ giá để tính mức sàn.' : 'Khai báo chi tiêu để biết mức sàn của bạn.'}
          </p>
        )}
      </section>

      {!profile.complete && (
        <Button variant="secondary" block onClick={onDeclare}>Khai báo ở chat</Button>
      )}

      <Segmented value={tab} onChange={switchTab} options={[{ value: 'deposit', label: 'Nạp' }, { value: 'withdraw', label: 'Rút' }]} />

      <div className="flex flex-col gap-2">
        <UsdcInput value={amount} onChange={v => { setAmount(v); setConfirmLow(false); setDone(null) }} disabled={vault.busy} />
        <Chips items={[
          { label: '25%', onClick: () => chip(25), disabled: !max },
          { label: '50%', onClick: () => chip(50), disabled: !max },
          { label: 'Tối đa', onClick: () => chip('max'), disabled: !max },
        ]} />
        <p className="text-app-caption text-grey">
          {tab === 'deposit'
            ? `Trong ví: ${formatUsdc(wb)} · giữ lại ${formatUsdc(GAS_RESERVE_USDC6)} làm phí`
            : `Trong quỹ: ${formatUsdc(vb)} · tiền rút về ví của bạn`}
        </p>
      </div>

      {tab === 'withdraw' && wb !== null && wb < GAS_ESTIMATE_USDC6 && (
        <Notice tone="warning">Ví cần khoảng {formatUsdc(GAS_ESTIMATE_USDC6)} để trả phí giao dịch rút.</Notice>
      )}
      {tooMuch && <Notice tone="danger">{tab === 'deposit' ? 'Vượt số USDC có thể nạp từ ví.' : 'Vượt số dư trong quỹ.'}</Notice>}

      {confirmLow && belowFloor && (
        <Notice tone="danger" title="Dưới mức sàn">
          Sau khi rút, quỹ còn {formatUsdc(vb !== null ? vb - parsed : null)}, thấp hơn sàn {math.floorMonths} tháng ({formatUsdc(math.floorUsdc)}). Đầu tư sẽ bị khoá cho tới khi nạp đủ lại.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      {confirmLow && belowFloor ? (
        <div className="grid grid-cols-2 gap-4">
          <Button block variant="secondary" disabled={vault.busy} onClick={() => setConfirmLow(false)}>Hủy</Button>
          <Button block variant="danger" loading={vault.busy} onClick={() => { void run() }}>Vẫn rút</Button>
        </div>
      ) : (
        <Button block loading={vault.busy} disabled={parsed <= 0n || tooMuch || max === null} onClick={onPrimary}>
          {vault.busy ? 'Đang chờ ví…' : tab === 'deposit' ? 'Nạp' : 'Rút'}
        </Button>
      )}
    </PanelShell>
  )
}
