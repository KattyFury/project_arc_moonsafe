// The app after login, Arc Studio layout: 430px column, 5 tabs on top, status line
// at the bottom. Before a vault exists: header + vault setup (screens 4/5).

import { useState, type ReactNode } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { NavBar, type NavTab } from './NavBar'
import { useApp } from '@/state/AppState'
import { VaultSetup } from '@/components/screens/VaultSetup'
import { ChatScreen } from '@/components/screens/ChatScreen'
import { FundScreen } from '@/components/screens/FundScreen'
import { InvestScreen } from '@/components/screens/InvestScreen'
import { BalanceSheet } from '@/components/screens/BalanceSheet'
import { SettingsScreen } from '@/components/screens/SettingsScreen'
import { Btn, Notice } from '@/components/ui/kit'

function Column({ children }: { children: ReactNode }) {
  return <div className="h-dvh flex flex-col overflow-hidden mx-auto" style={{ maxWidth: 430, background: 'var(--bg)' }}>{children}</div>
}

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const { vault, math } = useApp()
  const [tab, setTab] = useState<NavTab>('chat')
  const [error, setError] = useState<string | null>(null)
  const [declareKey, setDeclareKey] = useState(0)

  const go = (t: NavTab) => { setError(null); setTab(t) }
  const openDeclare = () => { setDeclareKey(k => k + 1); go('chat') }

  if (!vault.ready) {
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
        <div className="flex-shrink-0 px-5 pt-14 pb-4 flex items-center gap-3" style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
          <img src="/logo.svg" alt="" width={36} height={36} />
          <div>
            <h1 className="display font-bold text-[20px]" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>MoonSafe</h1>
            <p className="text-[11px] mono" style={{ color: 'var(--muted)' }}>Arc Testnet</p>
          </div>
          <button onClick={onLogout} className="ml-auto text-[13px] font-semibold" style={{ color: 'var(--accent)' }}>Đăng xuất</button>
        </div>
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
    <Column>
      <NavBar active={tab} onChange={go} investLocked={!math.investUnlocked} />

      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {tab === 'chat'    && <ChatScreen declareKey={declareKey} onError={setError} onOpenInvest={() => go('invest')} />}
        {tab === 'fund'    && <FundScreen onDeclare={openDeclare} />}
        {tab === 'invest'  && <InvestScreen onOpenFund={() => go('fund')} onDeclare={openDeclare} />}
        {tab === 'balance' && <BalanceSheet onDeclare={openDeclare} />}
        {tab === 'menu'    && <SettingsScreen onLogout={onLogout} />}
      </main>

      {/* Status line */}
      <div className="flex-shrink-0 flex items-center px-4" style={{ height: 40, borderTop: '1px solid var(--border)', background: 'white' }}>
        {error ? (
          <div className="flex items-center gap-2 w-full">
            <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p className="text-[12px] leading-tight line-clamp-1" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        ) : (
          <p className="text-[11px] w-full text-center mono" style={{ color: 'var(--muted)' }}>Arc Testnet · chain 5042002</p>
        )}
      </div>
    </Column>
  )
}
