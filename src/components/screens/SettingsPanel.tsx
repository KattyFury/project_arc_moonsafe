// Screen 10 — Ví & cài đặt: address + copy, wallet balance, unit VND/USD,
// clear declaration (and chat), log out.

import { useState } from 'react'
import { CheckCircle2, ExternalLink, LogOut, Plus, Trash2, Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import clsx from 'clsx'
import { useWalletPref } from '@/state/WalletPref'
import { useApp } from '@/state/AppState'
import { Button, Card, CopyButton, Modal, Row, Segmented } from '@/components/ui/kit'
import { PanelShell } from './PanelShell'

export function SettingsPanel({ onClose, onLogout, onClearAll }: { onClose: () => void; onLogout: () => void; onClearAll: () => void }) {
  const { address } = useAccount()
  const { vault, unit, setUnit, money } = useApp()
  const [confirm, setConfirm] = useState(false)

  return (
    <PanelShell title="Ví & cài đặt" onClose={onClose}>
      <ActiveWalletPicker active={address} />
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

/** Every wallet linked to this login; the vault and balances follow the chosen one. */
function ActiveWalletPicker({ active }: { active?: string }) {
  const { wallets } = useWallets()
  const { user } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { setPreferred } = useWalletPref()

  const connected = wallets.filter(w => w.type === 'ethereum')
  const connectedSet = new Set(connected.map(w => w.address.toLowerCase()))
  // Linked to the account but not connected in this browser right now (extension locked, other device…)
  const offline = (user?.linkedAccounts ?? [])
    .flatMap(a => (a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType !== 'privy' ? [a.address] : []))
    .filter(a => !connectedSet.has(a.toLowerCase()))

  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

  return (
    <Card>
      <p className="text-app-label text-grey">Ví đang dùng</p>
      <p className="text-app-caption text-muted">Mỗi ví có vault và số dư riêng. Chọn ví bạn đã dùng để mở vault.</p>
      {connected.map(w => {
        const on = w.address.toLowerCase() === active?.toLowerCase()
        return (
          <button key={w.address} onClick={() => setPreferred(w.address)} aria-pressed={on}
            className={clsx('min-h-14 px-4 rounded-md flex items-center gap-2 text-left',
              on ? 'bg-blue-soft text-blue-strong' : 'bg-mist text-ink')}>
            <Wallet size={24} className="shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-app-btn-sm">{w.walletClientType === 'privy' ? 'Ví MoonSafe (tạo khi đăng nhập)' : w.meta.name}</span>
              <span className="block mono text-app-caption text-grey">{short(w.address)}</span>
            </span>
            {on && <CheckCircle2 size={24} className="shrink-0" />}
          </button>
        )
      })}
      {offline.map(a => (
        <div key={a} className="min-h-14 px-4 rounded-md flex items-center gap-2 border-2 border-dashed border-line">
          <Wallet size={24} className="shrink-0 text-muted" />
          <span className="flex-1 min-w-0">
            <span className="block text-app-btn-sm text-grey">Ví đã liên kết, chưa kết nối</span>
            <span className="block mono text-app-caption text-muted">{short(a)}</span>
          </span>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon={Plus} onClick={() => connectWallet()}>Kết nối ví khác</Button>
      </div>
    </Card>
  )
}
