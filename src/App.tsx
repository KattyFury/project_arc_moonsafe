/**
 * MoonSafe — App quỹ dự phòng cho người dùng Web3
 * "Nên đầu tư nhưng phải có đường lui."
 *
 * Flow (SPEC §3): 1 Đăng nhập → 3 Cảnh báo → (no vault) 4 / 4b → 5 / 5b → 6 Chat → 7–10 via row 1.
 */

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { LoginScreen } from '@/components/screens/LoginScreen'
import { WarningModal } from '@/components/screens/WarningModal'
import { AppShell } from '@/components/layout/AppShell'
import { AppStateProvider } from '@/state/AppState'

// The warning shows once per login (cleared on logout and when the tab session ends).
const WARNED_KEY = 'moonsafe_warned_v1'
function getSessionWarned() {
  try { return sessionStorage.getItem(WARNED_KEY) === 'true' } catch { return false }
}

export default function App() {
  const { ready, authenticated, logout } = usePrivy()
  const [warned, setWarned] = useState<boolean>(getSessionWarned)

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: 'linear-gradient(160deg,#0a2470 0%,#0F3DB2 45%,#1E6DF7 100%)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          <p className="text-[14px] text-white/60">Đang tải…</p>
        </div>
      </div>
    )
  }

  if (!authenticated) return <LoginScreen />

  const acknowledge = () => {
    try { sessionStorage.setItem(WARNED_KEY, 'true') } catch { /* storage blocked */ }
    setWarned(true)
  }

  const handleLogout = async () => {
    try { sessionStorage.removeItem(WARNED_KEY) } catch { /* storage blocked */ }
    setWarned(false)
    await logout()
  }

  return (
    <AppStateProvider>
      <AppShell onLogout={() => { void handleLogout() }} />
      {!warned && <WarningModal onAcknowledge={acknowledge} />}
    </AppStateProvider>
  )
}
