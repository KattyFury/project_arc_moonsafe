// The app after login (Figma MoonSafe · Mobile web 393 / Desktop web 1440): tabs on top
// (desktop: logo + tabs + wallet bar), status line at the bottom. Before a vault exists:
// 430 column with header + vault setup (screens 4/5).

import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import type { AgentAction } from '@/hooks/useAgent'
import type { Prefill } from '@/types'
import { AlertCircle, Loader2 } from 'lucide-react'
import { NavBar, type NavTab } from './NavBar'
import { useApp } from '@/state/AppState'
import { VaultSetup } from '@/components/screens/VaultSetup'
import { ChatScreen } from '@/components/screens/ChatScreen'
import { FundScreen } from '@/components/screens/FundScreen'
import { InvestScreen } from '@/components/screens/InvestScreen'
import { BalanceSheet } from '@/components/screens/BalanceSheet'
import { SettingsScreen } from '@/components/screens/SettingsScreen'
import { Btn, Notice, Wordmark } from '@/components/ui/kit'

function Column({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={`h-dvh flex flex-col overflow-hidden mx-auto w-full max-w-[430px] ${wide ? 'lg:max-w-none' : ''}`} style={{ background: 'var(--bg)' }}>{children}</div>
}

function SetupHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex-shrink-0 px-4 pt-14 pb-4 flex items-center gap-2" style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
      <div>
        <h1><Wordmark size={22} /></h1>
        <p className="text-[14px] mono" style={{ color: 'var(--muted)' }}>Arc Testnet</p>
      </div>
      <button onClick={onLogout} className="ml-auto text-[14px] font-semibold" style={{ color: 'var(--accent)' }}>Đăng xuất</button>
    </div>
  )
}

// After the Privy wallets load, wagmi needs a moment to take the active one.
const WALLET_SYNC_MS = 8000

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const { vault, math, vndToUsdc, cloud } = useApp()
  const { connectWallet } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const { address } = useAccount()
  const [tab, setTab] = useState<NavTab>('chat')
  const [error, setError] = useState<string | null>(null)
  const [prefill, setPrefill] = useState<Prefill | null>(null)
  const [syncTimedOut, setSyncTimedOut] = useState(false)

  useEffect(() => {
    setSyncTimedOut(false)
    if (address || !walletsReady) return
    const id = setTimeout(() => setSyncTimedOut(true), WALLET_SYNC_MS)
    return () => clearTimeout(id)
  }, [address, walletsReady])

  // Logged in with an external wallet that is no longer connected (extension removed,
  // switched to another wallet app): no address, so the vault can never load.
  const noWallet = !address && walletsReady && (wallets.length === 0 || syncTimedOut)

  const go = (t: NavTab) => { setError(null); setTab(t) }
  const openChat = () => go('chat')

  // Agent tools → open the matching screen with the amount filled in. Nothing is signed here.
  const runActions = (actions: AgentAction[]) => {
    const a = actions[actions.length - 1]
    if (!a) return
    if (a.type === 'open_screen') {
      const map = { fund: 'fund', invest: 'invest', balance: 'balance', menu: 'menu' } as const
      if (a.screen) setTimeout(() => go(map[a.screen!]), 700)
      return
    }
    const amt = a.amount
    const usdc = !amt ? null : amt.currency === 'USDC' ? BigInt(Math.round(amt.amount * 1_000_000)) : vndToUsdc(amt.amount)
    if (usdc === null || usdc <= 0n) { toast.error('Chưa quy đổi được số tiền (thiếu tỉ giá). Hãy nhập bằng USDC.'); return }
    const key = Date.now()
    const next: Prefill = a.type === 'propose_dca'
      ? { kind: 'dca', amount: usdc, intervalDays: a.intervalDays && a.intervalDays > 0 ? a.intervalDays : 7, key }
      : a.type === 'prepare_deposit' ? { kind: 'deposit', amount: usdc, key }
      : a.type === 'prepare_withdraw' ? { kind: 'withdraw', amount: usdc, key }
      : { kind: 'buy', amount: usdc, key }
    setPrefill(next)
    // Short pause so the agent's reply is seen before the screen changes.
    setTimeout(() => go(next.kind === 'deposit' || next.kind === 'withdraw' ? 'fund' : 'invest'), 700)
  }

  if (noWallet) {
    return (
      <Column>
        <SetupHeader onLogout={onLogout} />
        <div className="flex-1 px-4 py-6 flex flex-col gap-4">
          <Notice tone="warning" title="Ví chưa kết nối">
            Ví bạn dùng để đăng nhập không còn kết nối với trình duyệt này (ví bị khoá, đã gỡ, hoặc bạn đã đổi sang ví khác). Kết nối lại ví để xem vault.
          </Notice>
          <Btn onClick={() => connectWallet()}>Kết nối ví</Btn>
          <Btn variant="outline" onClick={onLogout}>Đăng xuất</Btn>
        </div>
      </Column>
    )
  }

  if (!vault.ready || !cloud.ready) {
    return (
      <Column>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      </Column>
    )
  }

  if (!vault.vaultAddress) {
    return (
      <Column>
        <SetupHeader onLogout={onLogout} />
        {vault.readError ? (
          <div className="flex-1 px-4 py-6 flex flex-col gap-4">
            <Notice tone="warning" title="Chưa đọc được dữ liệu từ Arc Testnet">Mạng có thể đang chậm. App tự thử lại mỗi 15 giây.</Notice>
            <Btn variant="outline" onClick={() => { void vault.refresh() }}>Thử lại</Btn>
          </div>
        ) : <VaultSetup />}
      </Column>
    )
  }

  return (
    <Column wide>
      <NavBar active={tab} onChange={go} investLocked={!math.investUnlocked} />

      {cloud.error && (
        <div className="flex-shrink-0 px-4 py-2 text-[14px] leading-5 text-center" style={{ background: '#FEF5D9', color: '#8A5F00' }}>
          Chưa tải được dữ liệu đã lưu của bạn, đang dùng bản trên máy này. Tải lại trang để thử lại.
        </div>
      )}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {tab === 'chat'    && <ChatScreen onError={setError} onOpenInvest={() => go('invest')} onActions={runActions} />}
        {tab === 'fund'    && <FundScreen key={prefill?.key} onOpenChat={openChat} prefill={prefill && (prefill.kind === 'deposit' || prefill.kind === 'withdraw') ? prefill : null} />}
        {tab === 'invest'  && <InvestScreen key={prefill?.key} onOpenFund={() => go('fund')} onOpenChat={openChat} prefill={prefill && (prefill.kind === 'buy' || prefill.kind === 'dca') ? prefill : null} />}
        {tab === 'balance' && <BalanceSheet onOpenChat={openChat} />}
        {tab === 'menu'    && <SettingsScreen onLogout={onLogout} />}
      </main>

      {/* Status line */}
      <div className="flex-shrink-0 flex items-center px-4" style={{ height: 40, borderTop: '1px solid var(--border)', background: 'white' }}>
        {error ? (
          <div className="flex items-center gap-2 w-full">
            <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p className="text-[14px] leading-tight line-clamp-1" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        ) : (
          <p className="text-[14px] w-full text-center mono" style={{ color: 'var(--muted)' }}>Arc Testnet · chain 5042002</p>
        )}
      </div>
    </Column>
  )
}
