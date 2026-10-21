import type { PrivyClientConfig } from '@privy-io/react-auth'
import { arcTestnet } from 'viem/chains'

export const PRIVY_APP_ID: string = (import.meta.env.VITE_PRIVY_APP_ID as string | undefined) ?? ''

// Arc Testnet with correct RPC — override the default rpc.testnet.arc.network URL
const arcTestnetWithRpc = {
  ...arcTestnet,
  rpcUrls: {
    ...arcTestnet.rpcUrls,
    default: { http: ['https://rpc.testnet.arc.io'] },
    public: { http: ['https://rpc.testnet.arc.io'] },
  },
}

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['email', 'google', 'wallet'],
  appearance: {
    theme: 'light',
    accentColor: '#3b82f6',
    logo: undefined,
    loginMessage: 'Đăng nhập vào MoonSafe',
    walletChainType: 'ethereum-only',
  },
  defaultChain: arcTestnetWithRpc,
  supportedChains: [arcTestnetWithRpc],
  embeddedWallets: {
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
}
