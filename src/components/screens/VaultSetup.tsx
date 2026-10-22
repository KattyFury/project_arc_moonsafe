// Screens 4 / 4b / 5 / 5b — open the personal vault.
// 4  no vault yet: card + "Mở vault"
// 4b wallet lacks USDC: balance in red, QR + address + copy, "Mở vault" disabled
// 5  confirm: fee read from the factory, gas, network, total, immutable note
// 5b waiting for the wallet: spinner, both buttons disabled; on reject/error back
//    to 5 with the error; at most 5 attempts, then stop and say so.

import { useState } from 'react'
import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatUsdc } from '@/lib/format'
import { Button, Card, CopyButton, Notice, QrImage, Row, Spinner } from '@/components/ui/kit'

const MAX_TRIES = 5

export function VaultSetup() {
  const { vault } = useApp()
  const { address } = useAccount()
  const [step, setStep] = useState<'intro' | 'confirm'>('intro')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  const fee = vault.fee
  const total = fee !== null ? fee + GAS_ESTIMATE_USDC6 : null
  const wallet = vault.walletBalance
  const enough = wallet !== null && total !== null && wallet >= total

  const sign = async () => {
    setSigning(true)
    setError(null)
    try {
      await vault.createVault()
    } catch (e) {
      setError(txErrorMessage(e))
      setTries(t => t + 1)
    } finally {
      setSigning(false)
    }
  }

  if (step === 'confirm') {
    const out = tries >= MAX_TRIES
    return (
      <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4 py-2">
        <Card>
          <h2 className="text-app-title-card text-ink">Xác nhận mở vault</h2>
          <div>
            <Row label="Phí mở vault" value={formatUsdc(fee, 6)} />
            <Row label="Phí giao dịch" value={`~${formatUsdc(GAS_ESTIMATE_USDC6)}`} />
            <Row label="Mạng" value="Arc Testnet" />
            <Row label="Tổng" value={`~${formatUsdc(total, 6)}`} last />
          </div>
          <Notice tone="info">Vault là smart contract riêng của bạn, bất biến sau khi tạo. Chỉ ví này rút được tiền, và tiền rút luôn về ví này.</Notice>
          {signing && <Spinner label="Đang chờ xác nhận trong ví…" />}
          {error && !signing && (
            <Notice tone="danger" title="Chưa mở được vault">
              {error}
              {out ? ` Đã thử ${MAX_TRIES} lần, tạm dừng. Kiểm tra ví rồi tải lại trang để thử tiếp.` : ` Lần ${tries}/${MAX_TRIES}.`}
            </Notice>
          )}
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Button block variant="secondary" disabled={signing} onClick={() => { setStep('intro'); setError(null) }}>Hủy</Button>
          <Button block disabled={signing || out || !enough} onClick={() => { void sign() }}>Ký và mở vault</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4 py-2">
      <Card>
        <div className="flex items-center gap-2">
          <ShieldCheck size={24} className="text-blue shrink-0" />
          <h2 className="text-app-title-card text-ink">Mở vault quỹ dự phòng</h2>
        </div>
        <p className="text-app-note text-grey">
          Quỹ dự phòng nằm trong smart contract riêng, tách khỏi ví. Có quỹ đủ sàn thì mới được đầu tư.
        </p>
        <Row label="Số dư ví" value={formatUsdc(wallet)} valueClass={wallet !== null && !enough ? 'text-red-text' : undefined} />
        <Row label="Cần để mở vault" value={total !== null ? `~${formatUsdc(total, 6)}` : '–'} last />

        {vault.readError && wallet === null && (
          <Notice tone="warning" title="Chưa đọc được số dư">Mạng Arc đang chậm, app sẽ tự thử lại.</Notice>
        )}

        {wallet !== null && total !== null && !enough && address && (
          <div className="flex flex-col items-center gap-4 pt-2">
            <p className="text-app-btn-sm text-red-text text-center">Chưa đủ USDC để mở vault</p>
            <QrImage value={address} />
            <p className="mono text-app-caption text-grey break-all text-center">{address}</p>
            <CopyButton text={address} />
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-app-note text-blue">
              Lấy USDC testnet ở Circle Faucet <ExternalLink size={16} />
            </a>
          </div>
        )}
      </Card>
      <div className="flex justify-center">
        <Button disabled={!enough} onClick={() => setStep('confirm')}>Mở vault</Button>
      </div>
    </div>
  )
}
