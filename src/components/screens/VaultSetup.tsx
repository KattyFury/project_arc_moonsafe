// Screens 4 / 4b / 5 / 5b — open the personal vault (Arc Studio look).
// Fee is read from the factory; at most 5 signing attempts.

import { useState } from 'react'
import { CheckCircle2, ExternalLink, Lock, Shield } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useApp } from '@/state/AppState'
import { GAS_ESTIMATE_USDC6, txErrorMessage } from '@/hooks/useVault'
import { formatUsdc } from '@/lib/format'
import { Btn, CopyButton, GlassCard, IconBox, Notice, QrImage, Row, Screen, Spinner, glass } from '@/components/ui/kit'

const MAX_TRIES = 5

export function VaultSetup() {
  const { vault } = useApp()
  const { address } = useAccount()
  const [step, setStep] = useState<'intro' | 'confirm'>('intro')
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)

  const total = vault.fee !== null ? vault.fee + GAS_ESTIMATE_USDC6 : null
  const wallet = vault.walletBalance
  const enough = wallet !== null && total !== null && wallet >= total

  const sign = async () => {
    setSigning(true); setError(null)
    try { await vault.createVault() }
    catch (e) { setError(txErrorMessage(e)); setTries(t => t + 1) }
    finally { setSigning(false) }
  }

  if (step === 'confirm') {
    const out = tries >= MAX_TRIES
    return (
      <Screen>
        <GlassCard className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconBox><Lock size={20} style={{ color: 'var(--accent)' }} /></IconBox>
            <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Xác nhận mở vault</p>
          </div>
          <div className="overflow-hidden" style={{ border: '1px solid var(--border)', borderRadius: 16 }}>
            <Row label="Phí mở vault" value={formatUsdc(vault.fee, 6)} />
            <Row label="Gas ước tính" value={`~${formatUsdc(GAS_ESTIMATE_USDC6)}`} />
            <Row label="Mạng" value="Arc Testnet" />
            <Row label="Tổng" value={`~${formatUsdc(total, 6)}`} last />
          </div>
          <Notice tone="info">Ví sẽ yêu cầu ký 1 lần — phí và vault được tạo trong cùng giao dịch.</Notice>
          <Notice tone="warning">Vault bất biến sau khi tạo — chỉ ví của bạn mới rút được, và tiền rút luôn về ví này.</Notice>
          {signing && <Spinner label="Đang chờ xác nhận trong ví…" />}
          {error && !signing && (
            <Notice tone="danger" title="Giao dịch thất bại">
              {error} {out ? `Đã thử ${MAX_TRIES} lần, tạm dừng. Kiểm tra ví rồi tải lại trang để thử tiếp.` : `(Lần ${tries}/${MAX_TRIES})`}
            </Notice>
          )}
        </GlassCard>
        <div className="flex gap-3">
          <Btn variant="outline" disabled={signing} onClick={() => { setStep('intro'); setError(null) }}>Hủy</Btn>
          <Btn loading={signing} disabled={out || !enough} onClick={() => { void sign() }}>{signing ? 'Đang ký…' : 'Ký và mở vault'}</Btn>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <section className="p-5" style={glass.hero}>
        <p className="text-[13px] font-semibold text-white/70 mb-2">Số dư ví</p>
        <div className="flex items-baseline gap-2">
          <span className="display font-bold tabular-nums text-white" style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em' }}>
            {formatUsdc(wallet).replace(' USDC', '')}
          </span>
          <span className="text-[18px] font-medium text-white/60">USDC</span>
        </div>
      </section>

      <GlassCard className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <IconBox><Shield size={20} style={{ color: 'var(--accent)' }} /></IconBox>
          <div>
            <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Mở vault quỹ dự phòng</p>
            <p className="text-[12px]" style={{ color: 'var(--muted)' }}>Smart contract riêng, chỉ bạn rút được</p>
          </div>
        </div>
        <p className="text-[14px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
          Vault là smart contract độc lập trên Arc Testnet, tách hoàn toàn khỏi ví. Chỉ địa chỉ ví của bạn mới có quyền rút tiền.
        </p>

        {vault.readError && wallet === null && <Notice tone="warning">Chưa đọc được số dư, app sẽ tự thử lại.</Notice>}

        {wallet !== null && total !== null && !enough && address && (
          <div className="p-4 flex flex-col gap-3" style={{ background: 'rgba(224,52,74,0.06)', border: '1px solid rgba(224,52,74,0.2)', borderRadius: 16 }}>
            <p className="font-semibold text-[14px]" style={{ color: 'var(--danger)' }}>Chưa đủ USDC để mở vault</p>
            <p className="text-[12px]" style={{ color: 'var(--danger)' }}>Cần khoảng {formatUsdc(total, 6)} (phí mở vault + gas)</p>
            <div className="flex flex-col items-center gap-3 pt-1">
              <QrImage value={address} />
              <p className="mono text-[11px] text-center break-all" style={{ color: 'var(--subtle)' }}>{address}</p>
              <CopyButton text={address} />
              <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>
                Lấy USDC testnet ở Circle Faucet <ExternalLink size={13} />
              </a>
            </div>
          </div>
        )}

        {enough && address && (
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'rgba(15,157,88,0.07)', border: '1px solid rgba(15,157,88,0.2)', borderRadius: 14 }}>
            <CheckCircle2 size={15} style={{ color: 'var(--success)' }} />
            <p className="font-semibold text-[14px]" style={{ color: 'var(--success)' }}>Ví sẵn sàng</p>
            <p className="mono text-[12px] ml-auto" style={{ color: 'var(--success)' }}>{address.slice(0, 8)}…{address.slice(-6)}</p>
          </div>
        )}
      </GlassCard>

      <Btn disabled={!enough} onClick={() => setStep('confirm')}>Mở vault</Btn>
    </Screen>
  )
}
