// Which Privy wallet is the wagmi account.
// @privy-io/wagmi picks the Privy embedded wallet after an email/Google login by
// default, which hid vaults opened from an external wallet (Rabby, MetaMask…).
// Rule: the wallet the user chose in Settings → else a connected external wallet
// → else the embedded wallet.

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { WagmiProvider, type SetActiveWalletForWagmiType } from '@privy-io/wagmi'
import { config } from '@/config'

const KEY = 'moonsafe_wallet_v1'

function readPref(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}

interface WalletPref {
  preferred: string | null
  setPreferred: (address: string) => void
}

const Ctx = createContext<WalletPref>({ preferred: null, setPreferred: () => undefined })

export function WalletPrefProvider({ children }: { children: ReactNode }) {
  const [preferred, setPref] = useState<string | null>(readPref)

  const setPreferred = useCallback((address: string) => {
    const a = address.toLowerCase()
    try { localStorage.setItem(KEY, a) } catch { /* storage blocked */ }
    setPref(a)
  }, [])

  // Must stay referentially stable between renders: Privy re-syncs wagmi whenever it changes.
  const pick = useCallback<SetActiveWalletForWagmiType>(({ wallets }) => {
    const eth = wallets.filter(w => w.type === 'ethereum')
    return eth.find(w => w.address.toLowerCase() === preferred)
      ?? eth.find(w => w.walletClientType !== 'privy')
      ?? eth[0]
  }, [preferred])

  return (
    <Ctx.Provider value={{ preferred, setPreferred }}>
      <WagmiProvider config={config} setActiveWalletForWagmi={pick}>{children}</WagmiProvider>
    </Ctx.Provider>
  )
}

export const useWalletPref = () => useContext(Ctx)
