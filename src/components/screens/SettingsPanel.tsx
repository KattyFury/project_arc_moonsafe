// Screen 10 — Ví & cài đặt: address + copy, wallet balance, unit VND/USD,
// clear declaration (and chat), log out.

import { useState } from 'react'
import { ExternalLink, LogOut, Trash2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useApp } from '@/state/AppState'
import { Button, Card, CopyButton, Modal, Row, Segmented } from '@/components/ui/kit'
import { PanelShell } from './PanelShell'

export function SettingsPanel({ onClose, onLogout, onClearAll }: { onClose: () => void; onLogout: () => void; onClearAll: () => void }) {
  const { address } = useAccount()
  const { vault, unit, setUnit, money } = useApp()
  const [confirm, setConfirm] = useState(false)

  return (
    <PanelShell title="Ví & cài đặt" onClose={onClose}>
      <Card>
        <p className="text-app-label text-grey">Địa chỉ ví</p>
        <p className="mono text-app-note text-ink break-all">{address ?? '–'}</p>
        {address && <div><CopyButton text={address} /></div>}
        <Row label="Số dư ví" value={money(vault.walletBalance)} />
        {vault.vaultAddress && (
          <Row label="Vault của bạn" last value={
            <a className="inline-flex items-center gap-1 text-blue mono" target="_blank" rel="noopener noreferrer"
              href={`https://explorer.testnet.arc.io/address/${vault.vaultAddress}`}>
              {vault.vaultAddress.slice(0, 6)}…{vault.vaultAddress.slice(-4)} <ExternalLink size={16} />
            </a>
          } />
        )}
      </Card>

      <div className="flex flex-col gap-2">
        <p className="text-app-label text-grey">Đơn vị hiển thị</p>
        <Segmented value={unit} onChange={setUnit} options={[{ value: 'VND', label: 'VND (₫)' }, { value: 'USD', label: 'USD (USDC)' }]} />
      </div>

      <Card flat>
        <button onClick={() => setConfirm(true)} className="min-h-14 flex items-center gap-2 text-red-text text-app-secondary">
          <Trash2 size={24} /> Xoá khai báo
        </button>
        <button onClick={onLogout} className="min-h-14 flex items-center gap-2 text-ink text-app-secondary border-t border-line">
          <LogOut size={24} /> Đăng xuất
        </button>
      </Card>

      <p className="text-app-caption text-muted text-center">MoonSafe · Arc Testnet</p>

      {confirm && (
        <Modal title="Xoá khai báo?" onClose={() => setConfirm(false)}>
          <p className="text-app-note text-grey">Khai báo tài chính và lịch sử chat trong trình duyệt này sẽ bị xoá. Vault và USDC không bị ảnh hưởng.</p>
          <div className="grid grid-cols-2 gap-4">
            <Button block variant="secondary" onClick={() => setConfirm(false)}>Hủy</Button>
            <Button block variant="danger" onClick={() => { onClearAll(); setConfirm(false) }}>Xoá</Button>
          </div>
        </Modal>
      )}
    </PanelShell>
  )
}
