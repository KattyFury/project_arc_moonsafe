/**
 * wagmi configuration — MoonSafe
 * Built with @privy-io/wagmi so Privy wallets (email / Google embedded wallets and
 * external wallets) are the connected wagmi account.
 */

import { http } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { createConfig } from '@privy-io/wagmi'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
