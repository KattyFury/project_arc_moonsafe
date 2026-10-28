import type { PrivyClientConfig } from '@privy-io/react-auth'
import { NET } from '@/lib/network'

// Public value (it ships in the client bundle; same as DEFAULT_APP_ID in functions/_lib): a build with no .env
// (cloud session) still logs in. VITE_PRIVY_APP_ID overrides it.
export const PRIVY_APP_ID: string = (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) || 'cmvhlli8900mk0gjmwdeypxh2'

// The Arc network this build uses (src/lib/network.ts), with the current RPC.
const arcWithRpc = NET.chain

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'google', 'wallet'],
  appearance: {
    theme: 'light',
    accentColor: '#1E6DF7',
    logo: `${window.location.origin}/logo.svg`,
    loginMessage: 'Log in to MoonSafe',
    walletChainType: 'ethereum-only',
  },
  defaultChain: arcWithRpc,
  supportedChains: [arcWithRpc],
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
}
