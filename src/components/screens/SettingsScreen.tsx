// Screen 10 — Ví & cài đặt (Figma: three 4-col cards on desktop). Fits one phone screen:
// the wallet card carries address copy, balance and vault; the unit is a one-row toggle.

import { useState } from 'react'
import { Check, ChevronRight, Copy, ExternalLink, Globe, LogOut, Plus, Trash2, Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { useApp, type Unit } from '@/state/AppState'
import { useWalletPref } from '@/state/WalletPref'
import { clearChatStorage } from '@/hooks/useAgent'
import { Btn, Caps, Col, GlassCard, Grid, Screen, Sheet, Title, Toggle } from '@/components/ui/kit'

const UNITS: { value: Unit; label: string }[] = [
  { value: 'VND', label: 'VND (₫)' },
  { value: 'USD', label: 'USD (USDC)' },
]

export function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { address } = useAccount()
  const { vault, profile, unit, setUnit, money } = useApp()
  const [confirm, setConfirm] = useState(false)

  return (
    <Screen>
      <Title>Ví & cài đặt</Title>

      <Grid>
        <Col span={4}>
          <GlassCard className="p-4 lg:p-6 flex flex-col gap-2">
            <div>
              <p className="text-[20px] leading-7 font-semibold" style={{ color: 'var(--ink)' }}>Ví đang dùng</p>
              <p className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Mỗi ví có vault và số dư riêng.</p>
            </div>
            <WalletList active={address} />
            <div className="pt-2"><Caps>Số dư ví</Caps></div>
            <span className="display font-bold tabular-nums text-[32px] leading-10" style={{ color: 'var(--ink)' }}>{money(vault.walletBalance)}</span>
            {vault.vaultAddress && (
              <a className="flex items-center justify-between gap-2" target="_blank" rel="noopener noreferrer"
                href={`https://explorer.testnet.arc.io/address/${vault.vaultAddress}`}>
                <span className="text-[14px] leading-5" style={{ color: 'var(--subtle)' }}>Vault của bạn</span>
                <span className="text-[14px] leading-5 font-semibold flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                  {vault.vaultAddress.slice(0, 6)}…{vault.vaultAddress.slice(-4)} <ExternalLink size={16} />
                </span>
              </a>
            )}
          </GlassCard>
        </Col>

        <Col span={4}>
          <GlassCard className="p-4 lg:p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Globe size={20} style={{ color: 'var(--accent)' }} />
              <span className="text-[20px] leading-7 font-semibold" style={{ color: 'var(--ink)' }}>Đơn vị hiển thị</span>
            </div>
            <Toggle value={unit} onChange={setUnit} options={UNITS} />
          </GlassCard>
        </Col>

        <Col span={4}>
          <GlassCard>
            <button onClick={() => setConfirm(true)} className="w-full min-h-14 flex items-center gap-2 px-4 py-4 lg:px-6" style={{ borderBottom: '1px solid var(--line)' }}>
              <Trash2 size={20} style={{ color: 'var(--danger)' }} />
              <span className="flex-1 text-left text-[16px] leading-6 font-semibold" style={{ color: 'var(--danger)' }}>Xoá dữ liệu tài chính</span>
              <ChevronRight size={20} style={{ color: 'var(--muted)' }} />
            </button>
            <button onClick={onLogout} className="w-full min-h-14 flex items-center gap-2 px-4 py-4 lg:px-6">
              <LogOut size={20} style={{ color: 'var(--ink)' }} />
              <span className="flex-1 text-left text-[16px] leading-6 font-semibold" style={{ color: 'var(--ink)' }}>Đăng xuất</span>
              <ChevronRight size={20} style={{ color: 'var(--muted)' }} />
            </button>
          </GlassCard>
        </Col>
      </Grid>

      {confirm && (
        <Sheet>
          <p className="font-semibold text-[20px] leading-7" style={{ color: 'var(--ink)' }}>Xoá dữ liệu tài chính?</p>
          <p className="text-[16px] leading-6" style={{ color: 'var(--subtle)' }}>
            Toàn bộ thông tin tài chính và lịch sử chat sẽ bị xoá khỏi trình duyệt. Vault và USDC không bị ảnh hưởng.
          </p>
          <div className="flex gap-4">
            <Btn variant="outline" onClick={() => setConfirm(false)}>Hủy</Btn>
            <Btn variant="danger" onClick={() => { profile.clearProfile(); clearChatStorage(); setConfirm(false) }}>Xoá</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}

/** Every wallet linked to this login; vault and balances follow the chosen one. */
function WalletList({ active }: { active?: string }) {
  const { wallets } = useWallets()
  const { user } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { setPreferred } = useWalletPref()
  const [copied, setCopied] = useState(false)

  const connected = wallets.filter(w => w.type === 'ethereum')
  const connectedSet = new Set(connected.map(w => w.address.toLowerCase()))
  const offline = (user?.linkedAccounts ?? [])
    .flatMap(a => (a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType !== 'privy' ? [a.address] : []))
    .filter(a => !connectedSet.has(a.toLowerCase()))
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
  const copy = (a: string) => { void navigator.clipboard?.writeText(a).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }

  return (
    <>
      {connected.map(w => {
        const on = w.address.toLowerCase() === active?.toLowerCase()
        return (
          <div key={w.address} className="w-full flex items-center gap-2 pl-4 pr-2 py-2 min-h-14 rounded-2xl"
            style={{ background: on ? 'var(--accent-soft)' : 'var(--surface-muted)' }}>
            <button onClick={() => setPreferred(w.address)} aria-pressed={on} className="flex-1 min-w-0 flex items-center gap-2 text-left">
              <Wallet size={20} style={{ color: on ? 'var(--accent)' : 'var(--subtle)', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-[16px] leading-6 font-semibold truncate" style={{ color: on ? 'var(--accent-dark)' : 'var(--ink)' }}>
                  {w.walletClientType === 'privy' ? 'Ví MoonSafe (tạo khi đăng nhập)' : w.meta.name}
                </p>
                <p className="text-[14px] leading-5" style={{ color: on ? 'var(--accent-dark)' : 'var(--subtle)' }}>
                  {on && copied ? 'Đã sao chép địa chỉ' : short(w.address)}
                </p>
              </div>
            </button>
            {on && (
              <button onClick={() => copy(w.address)} aria-label="Sao chép địa chỉ ví" className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--bg)', color: 'var(--accent)', boxShadow: 'var(--shadow-y2)' }}>
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            )}
          </div>
        )
      })}
      {offline.map(a => (
        <div key={a} className="w-full flex items-center gap-2 px-4 py-2 min-h-14 rounded-2xl" style={{ border: '1px dashed var(--line)' }}>
          <Wallet size={20} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <div className="flex-1 min-w-0">
            <p className="text-[16px] leading-6 font-semibold" style={{ color: 'var(--subtle)' }}>Ví đã liên kết, chưa kết nối</p>
            <p className="text-[14px] leading-5" style={{ color: 'var(--muted)' }}>{short(a)}</p>
          </div>
        </div>
      ))}
      <button onClick={() => connectWallet()} className="flex items-center gap-2 text-[16px] leading-6 font-semibold" style={{ color: 'var(--accent)' }}>
        <Plus size={20} /> Kết nối ví khác
      </button>
    </>
  )
}
