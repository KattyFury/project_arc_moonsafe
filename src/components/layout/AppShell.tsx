// The app after login (Figma MoonSafe · Mobile web 393 / Desktop web 1440): tabs on top
// (desktop: logo + tabs + wallet bar), status line at the bottom. Before a vault exists:
// 430 column with header + vault setup (screens 4/5).

import { useEffect, useState, type ReactNode } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { NET, networkLine } from '@/lib/network'
import { useServiceStatus } from '@/hooks/useServiceStatus'
import type { AgentAction } from '@/hooks/useAgent'
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
  return <div className={`h-dvh flex flex-col overflow-hidden mx-auto w-full max-w-[430px] ${wide ? 'lg:max-w-none' : ''}`} style={{ background: 'var(--page)' }}>{children}</div>
}

function SetupHeader({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="flex-shrink-0 px-4 pt-14 pb-4 flex items-center gap-2" style={{ background: 'white', borderBottom: '1px solid var(--border)' }}>
      <div>
        <h1><Wordmark size={22} /></h1>
        <p className="text-[14px] mono" style={{ color: 'var(--muted)' }}>{NET.name}</p>
      </div>
      <button onClick={onLogout} className="ml-auto text-[14px] font-semibold" style={{ color: 'var(--accent)' }}>Log out</button>
    </div>
  )
}

// After the Privy wallets load, wagmi needs a moment to take the active one.
const WALLET_SYNC_MS = 8000

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const { vault, math, cloud } = useApp()
  const service = useServiceStatus()
  const { connectWallet } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const { address } = useAccount()
  const [tab, setTab] = useState<NavTab>('chat')
  const [error, setError] = useState<string | null>(null)
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

  // Tabs open step by step (Hieu, 2026-10-29): Balance once the emergency fund is full, Invest once buying is open (fund full, no priority debt).
  const locked: Partial<Record<NavTab, boolean>> = { balance: !math.fundOk, invest: !math.investUnlocked }
  const go = (t: NavTab) => { if (locked[t]) return; setError(null); setTab(t) }
  // A tab that locks again (the fund dropped below its floor) sends the user back to the chat.
  useEffect(() => { if (locked[tab]) setTab('chat') }, [tab, locked.balance, locked.invest]) // eslint-disable-line react-hooks/exhaustive-deps
  const openChat = () => go('chat')

  // "Mở màn …" from the agent. Deposit / withdraw / buy / DCA stay in the chat as cards.
  const runActions = (actions: AgentAction[]) => {
    const map = { fund: 'fund', invest: 'invest', balance: 'balance', menu: 'menu' } as const
    const screen = actions.filter(a => a.type === 'open_screen' && a.screen).pop()?.screen
    // Short pause so the agent's reply is seen before the screen changes.
    if (screen) setTimeout(() => go(map[screen]), 700)
  }

  if (noWallet) {
    return (
      <Column>
        <SetupHeader onLogout={onLogout} />
        <div className="flex-1 px-4 py-6 flex flex-col gap-4">
          <Notice tone="warning" title="Wallet not connected">
            The wallet you signed in with is no longer connected to this browser (locked, removed, or you switched wallets). Reconnect it to see your vault.
          </Notice>
          <Btn onClick={() => connectWallet()}>Connect wallet</Btn>
          <Btn variant="outline" onClick={onLogout}>Log out</Btn>
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

  // No vault yet: straight into the chat. The agent offers the vault once the user has shared their numbers (Hieu, 2026-10-29),
  // and the Emergency tab shows the opening screen.

  return (
    <Column wide>
      <NavBar active={tab} onChange={go} locked={locked} />

      {cloud.error && (
        <div className="flex-shrink-0 px-4 py-2 text-[14px] leading-5 text-center" style={{ background: '#FEF5D9', color: '#8A5F00' }}>
          Could not load your saved data, using the copy on this device. Reload the page to try again.
        </div>
      )}
      {(service.notice || !service.chatEnabled || !service.cardsEnabled) && (
        <div className="flex-shrink-0 px-4 py-2 text-[14px] leading-5 text-center" style={{ background: '#FEF5D9', color: '#8A5F00' }}>
          {service.notice || (!service.chatEnabled ? 'The agent is paused for a moment.' : 'Deposits, withdrawals and purchases from the agent are paused for now.')}
        </div>
      )}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {tab === 'chat'    && <ChatScreen onError={setError} onActions={runActions} />}
        {tab === 'fund'    && (vault.vaultAddress ? <FundScreen onOpenChat={openChat} />
          : vault.readError ? (
            <div className="flex-1 px-4 py-6 flex flex-col gap-4">
              <Notice tone="warning" title={`Could not read data from ${NET.name}`}>The network may be slow. The app retries every 15 seconds.</Notice>
              <Btn variant="outline" onClick={() => { void vault.refresh() }}>Try again</Btn>
            </div>
          ) : <VaultSetup />)}
        {tab === 'invest'  && <InvestScreen onOpenFund={() => go('fund')} onOpenChat={openChat} />}
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
          <p className="text-[14px] w-full text-center mono" style={{ color: 'var(--muted)' }}>{networkLine}</p>
        )}
      </div>
    </Column>
  )
}
