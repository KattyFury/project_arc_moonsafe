// Screen 10 — Ví & cài đặt (Arc Studio look): active wallet, address, balance,
// display unit, clear declaration, log out.

import { useState } from 'react'
import { ChevronRight, Copy, ExternalLink, Globe, LogOut, Plus, Trash2, Wallet } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useConnectWallet, usePrivy, useWallets } from '@privy-io/react-auth'
import { useApp, type Unit } from '@/state/AppState'
import { useWalletPref } from '@/state/WalletPref'
import { clearChatStorage } from '@/hooks/useAgent'
import { GlassCard, Screen, Sheet, Btn, Title } from '@/components/ui/kit'

const UNITS: { value: Unit; label: string; sub: string }[] = [
  { value: 'VND', label: '🇻🇳 VND (₫)', sub: 'Hiển thị số tiền bằng đồng' },
  { value: 'USD', label: '🇺🇸 USD (USDC)', sub: 'Hiển thị số tiền bằng USDC' },
]

export function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { address } = useAccount()
  const { vault, profile, unit, setUnit, money } = useApp()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const copy = async () => {
    if (!address) return
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Screen>
      <Title>Ví & cài đặt</Title>

      <ActiveWallet active={address} />

      <GlassCard>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--muted)' }}>Địa chỉ ví</p>
          <div className="flex items-center justify-between gap-3">
            <p className="mono text-[13px] truncate" style={{ color: 'var(--ink)' }}>{address ? `${address.slice(0, 10)}…${address.slice(-8)}` : '–'}</p>
            <button onClick={() => { void copy() }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold flex-shrink-0 transition-colors"
              style={{ background: copied ? 'rgba(15,157,88,0.1)' : 'var(--surface-muted)', color: copied ? 'var(--success)' : 'var(--accent)', border: '1px solid var(--border)' }}>
              <Copy size={13} />{copied ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
        </div>
        <div className="px-5 py-4" style={{ borderBottom: vault.vaultAddress ? '1px solid var(--border)' : 'none' }}>
          <p className="text-[11px] font-semibold tracking-widest uppercase mb-1" style={{ color: 'var(--muted)' }}>Số dư ví</p>
          <span className="display font-bold tabular-nums" style={{ fontSize: 30, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{money(vault.walletBalance)}</span>
        </div>
        {vault.vaultAddress && (
          <a className="px-5 py-4 flex items-center justify-between" target="_blank" rel="noopener noreferrer"
            href={`https://explorer.testnet.arc.io/address/${vault.vaultAddress}`}>
            <span className="text-[14px]" style={{ color: 'var(--subtle)' }}>Vault của bạn</span>
            <span className="mono text-[13px] flex items-center gap-1" style={{ color: 'var(--accent)' }}>
              {vault.vaultAddress.slice(0, 6)}…{vault.vaultAddress.slice(-4)} <ExternalLink size={13} />
            </span>
          </a>
        )}
      </GlassCard>

      <GlassCard>
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <Globe size={18} style={{ color: 'var(--accent)' }} />
          <span className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Đơn vị hiển thị</span>
        </div>
        <div className="p-3 flex flex-col gap-2">
          {UNITS.map(u => (
            <button key={u.value} onClick={() => setUnit(u.value)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all text-left"
              style={{ background: unit === u.value ? 'rgba(30,109,247,0.08)' : 'var(--surface-muted)', border: unit === u.value ? '1.5px solid var(--accent)' : '1.5px solid transparent' }}>
              <div>
                <p className="text-[15px] font-semibold" style={{ color: unit === u.value ? 'var(--accent)' : 'var(--ink)' }}>{u.label}</p>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>{u.sub}</p>
              </div>
              {unit === u.value && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard>
        <button onClick={() => setConfirm(true)} className="w-full flex items-center justify-between px-5 py-4 transition-colors active:bg-red-50" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <Trash2 size={18} style={{ color: 'var(--danger)' }} />
            <span className="text-[15px] font-medium" style={{ color: 'var(--danger)' }}>Xoá khai báo tài chính</span>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
        </button>
        <button onClick={onLogout} className="w-full flex items-center justify-between px-5 py-4 transition-colors active:bg-gray-50">
          <div className="flex items-center gap-3">
            <LogOut size={18} style={{ color: 'var(--subtle)' }} />
            <span className="text-[15px] font-medium" style={{ color: 'var(--ink)' }}>Đăng xuất</span>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--muted)' }} />
        </button>
      </GlassCard>

      <p className="text-[11px] text-center mono" style={{ color: 'var(--muted)' }}>MoonSafe · Arc Testnet · chain 5042002</p>

      {confirm && (
        <Sheet>
          <p className="font-semibold text-[17px]" style={{ color: 'var(--ink)' }}>Xoá khai báo?</p>
          <p className="text-[14px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
            Toàn bộ thông tin tài chính và lịch sử chat sẽ bị xoá khỏi trình duyệt. Vault và USDC không bị ảnh hưởng.
          </p>
          <div className="flex gap-3">
            <Btn variant="outline" onClick={() => setConfirm(false)}>Hủy</Btn>
            <Btn variant="danger" onClick={() => { profile.clearProfile(); clearChatStorage(); setConfirm(false) }}>Xoá</Btn>
          </div>
        </Sheet>
      )}
    </Screen>
  )
}

/** Every wallet linked to this login; vault and balances follow the chosen one. */
function ActiveWallet({ active }: { active?: string }) {
  const { wallets } = useWallets()
  const { user } = usePrivy()
  const { connectWallet } = useConnectWallet()
  const { setPreferred } = useWalletPref()

  const connected = wallets.filter(w => w.type === 'ethereum')
  const connectedSet = new Set(connected.map(w => w.address.toLowerCase()))
  const offline = (user?.linkedAccounts ?? [])
    .flatMap(a => (a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType !== 'privy' ? [a.address] : []))
    .filter(a => !connectedSet.has(a.toLowerCase()))
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

  return (
    <GlassCard>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="text-[15px] font-semibold" style={{ color: 'var(--ink)' }}>Ví đang dùng</p>
        <p className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>Mỗi ví có vault và số dư riêng.</p>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {connected.map(w => {
          const on = w.address.toLowerCase() === active?.toLowerCase()
          return (
            <button key={w.address} onClick={() => setPreferred(w.address)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all"
              style={{ background: on ? 'rgba(30,109,247,0.08)' : 'var(--surface-muted)', border: on ? '1.5px solid var(--accent)' : '1.5px solid transparent' }}>
              <Wallet size={18} style={{ color: on ? 'var(--accent)' : 'var(--subtle)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold" style={{ color: on ? 'var(--accent)' : 'var(--ink)' }}>
                  {w.walletClientType === 'privy' ? 'Ví MoonSafe (tạo khi đăng nhập)' : w.meta.name}
                </p>
                <p className="mono text-[12px]" style={{ color: 'var(--muted)' }}>{short(w.address)}</p>
              </div>
              {on && <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>Đang dùng</span>}
            </button>
          )
        })}
        {offline.map(a => (
          <div key={a} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ border: '1.5px dashed var(--border)' }}>
            <Wallet size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: 'var(--subtle)' }}>Ví đã liên kết, chưa kết nối</p>
              <p className="mono text-[12px]" style={{ color: 'var(--muted)' }}>{short(a)}</p>
            </div>
          </div>
        ))}
        <button onClick={() => connectWallet()} className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>
          <Plus size={14} /> Kết nối ví khác
        </button>
      </div>
    </GlassCard>
  )
}
