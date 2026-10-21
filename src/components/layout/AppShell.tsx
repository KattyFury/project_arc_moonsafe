import { useState } from 'react'
import { NavBar, type NavTab } from './NavBar'
import { FundScreen } from '@/components/screens/FundScreen'
import { InvestScreen } from '@/components/screens/InvestScreen'
import { BalanceSheet } from '@/components/screens/BalanceSheet'
import { SettingsScreen } from '@/components/screens/SettingsScreen'
import { ChatScreen } from '@/components/screens/ChatScreen'
import { useFinancialProfile } from '@/hooks/useFinancialProfile'
import { useVault } from '@/hooks/useVault'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { AlertCircle } from 'lucide-react'

interface AppShellProps { onLogout: () => void }

export function AppShell({ onLogout }: AppShellProps) {
  const [activeTab, setActiveTab] = useState<NavTab>('chat')
  const [globalError, setGlobalError] = useState<string | null>(null)
  const { profile } = useFinancialProfile()
  const { vaultBalance } = useVault()
  const { vndToUsdc } = useExchangeRate()

  const floorMonths = profile?.incomeStable ? 3 : 6
  // monthlyExpenses stored in VND — convert to USDC 6-decimal bigint
  const expVnd = profile?.monthlyExpenses ?? profile?.monthlyEssentials ?? 0
  const floorUsdc = vndToUsdc(expVnd) * BigInt(floorMonths)
  const investUnlocked = vaultBalance >= floorUsdc && floorUsdc > 0n && !profile?.hasExternalDebt

  const handleTabChange = (tab: NavTab) => {
    setGlobalError(null)
    setActiveTab(tab)
  }

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden mx-auto"
      style={{ maxWidth: 430, background: 'var(--bg)' }}
    >
      {/* Row 1 — NavBar */}
      <NavBar
        active={activeTab}
        onChange={handleTabChange}
        investLocked={!investUnlocked}
        balanceLocked={false}
      />

      {/* Rows 2–9 — content */}
      <main className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'chat'    && <ChatScreen    onError={setGlobalError} />}
        {activeTab === 'fund'    && <FundScreen    onError={setGlobalError} />}
        {activeTab === 'invest'  && <InvestScreen  locked={!investUnlocked} floorUsdc={floorUsdc} vaultBalance={vaultBalance} onError={setGlobalError} />}
        {activeTab === 'balance' && <BalanceSheet  onError={setGlobalError} />}
        {activeTab === 'menu'    && <SettingsScreen onLogout={onLogout} />}
      </main>

      {/* Row 10 — error buffer */}
      <div
        className="flex-shrink-0 flex items-center px-4"
        style={{ height: 40, borderTop: `1px solid var(--border)`, background: 'white' }}
      >
        {globalError ? (
          <div className="flex items-center gap-2 w-full">
            <AlertCircle size={13} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <p className="text-[12px] leading-tight line-clamp-1" style={{ color: 'var(--danger)' }}>
              {globalError}
            </p>
          </div>
        ) : (
          <p className="text-[11px] w-full text-center mono" style={{ color: 'var(--muted)', opacity: 0.5 }}>
            Arc Testnet · chain 5042002
          </p>
        )}
      </div>
    </div>
  )
}
