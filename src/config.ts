/**
 * wagmi configuration — MoonSafe
 * Built with @privy-io/wagmi so Privy wallets (email / Google embedded wallets and
 * external wallets) are the connected wagmi account.
 */

import { http } from 'wagmi'
import type { arcTestnet } from 'viem/chains'
import { CHAIN_ID, NET } from './lib/network'
import { createConfig } from '@privy-io/wagmi'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(NET.chainId, NET.rpc)

export const config = createConfig({
  // NET.chain is Arc or Arc Testnet depending on the build; typed as the testnet chain so the wagmi Register type stays simple.
  chains: [NET.chain as unknown as typeof arcTestnet],
  transports: {
    [CHAIN_ID]: http(NET.rpc),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
