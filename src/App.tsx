/**
 * MoonSafe — App quỹ dự phòng cho người dùng Web3
 * "Có đường lui thì mới dám liều."
 */

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useAccount } from 'wagmi'
import { LoginScreen } from '@/components/screens/LoginScreen'
import { WarningModal } from '@/components/screens/WarningModal'
import { NoVaultScreen } from '@/components/screens/VaultSetup/NoVaultScreen'
import { ConfirmVaultScreen } from '@/components/screens/VaultSetup/ConfirmVaultScreen'
import { AppShell } from '@/components/layout/AppShell'
import { useVault } from '@/hooks/useVault'
import { LanguageProvider, useLanguageState } from '@/hooks/useLanguage'

const WARNED_KEY = 'moonsafe_warned_v1'
function getSessionWarned() {
  try { return sessionStorage.getItem(WARNED_KEY) === 'true' } catch { return false }
}

function AppInner() {
  const { ready, authenticated, logout } = usePrivy()
  const { address } = useAccount()
  const { vaultAddress, walletUsdcBalance, createVault, refreshBalances } = useVault()

  const [warned, setWarned] = useState<boolean>(getSessionWarned)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleAcknowledge = () => {
    try { sessionStorage.setItem(WARNED_KEY, 'true') } catch { /* ignore */ }
    setWarned(true)
  }

  const handleCreateVault = async () => {
    await createVault()
    await refreshBalances()
    setShowConfirm(false)
  }

  const handleLogout = async () => {
    try { sessionStorage.removeItem(WARNED_KEY) } catch { /* ignore */ }
    setWarned(false)
    await logout()
  }

  // Loading
  if (!ready) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ background:'linear-gradient(160deg,#0a2470 0%,#0F3DB2 45%,#1E6DF7 100%)' }}
      >
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white animate-spin"
          />
          <p className="text-[14px] text-white/50">Đang tải…</p>
        </div>
      </div>
    )
  }

  if (!authenticated) return <LoginScreen />

  if (!warned) {
    return (
      <div className="min-h-dvh" style={{ background:'var(--bg)' }}>
        <WarningModal onAcknowledge={handleAcknowledge} />
      </div>
    )
  }

  if (!vaultAddress) {
    return (
      <div
        className="h-dvh flex flex-col overflow-hidden mx-auto"
        style={{ maxWidth:430, background:'var(--bg)' }}
      >
        {/* Vault setup header */}
        <div
          className="flex-shrink-0 px-5 pt-14 pb-4 flex items-center justify-between"
          style={{ background:'white', borderBottom:'1px solid var(--border)' }}
        >
          <div>
            <h1 className="display font-bold text-[20px]" style={{ color:'var(--ink)', letterSpacing:'-0.03em' }}>MoonSafe</h1>
            <p className="text-[11px] mono" style={{ color:'var(--muted)' }}>Arc Testnet</p>
          </div>
        </div>

        {showConfirm ? (
          <ConfirmVaultScreen
            onConfirm={handleCreateVault}
            onCancel={() => setShowConfirm(false)}
          />
        ) : (
          <NoVaultScreen
            walletAddress={address ?? ''}
            walletUsdcBalance={walletUsdcBalance}
            onOpenVault={() => setShowConfirm(true)}
          />
        )}
      </div>
    )
  }

  return <AppShell onLogout={() => { void handleLogout() }} />
}

export default function App() {
  const langCtx = useLanguageState()
  return (
    <LanguageProvider value={langCtx}>
      <AppInner />
    </LanguageProvider>
  )
}
