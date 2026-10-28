// Make sure the wallet itself is on the Arc network this build uses (Arc or Arc Testnet) before sending.
// wagmi's account chainId is not enough: @privy-io/wagmi reports the first configured
// chain when the wallet sits on an unsupported one (e.g. Rabby on Ethereum, id 1),
// so we ask the wallet provider directly and switch (adding the chain if needed).

import type { Connector } from 'wagmi'
import { CHAIN_ID, NET } from './network'

export const ARC_CHAIN_ID = CHAIN_ID

export async function ensureArcChain(
  connector: Connector | undefined,
  switchChainAsync: (args: { chainId: typeof ARC_CHAIN_ID; connector?: Connector }) => Promise<unknown>,
): Promise<void> {
  if (!connector) throw new Error('Wallet not connected')
  const current = await connector.getChainId()
  if (current === ARC_CHAIN_ID) return
  try {
    await switchChainAsync({ chainId: ARC_CHAIN_ID, connector })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/reject|denied/i.test(msg)) throw new Error(`You declined to switch your wallet to ${NET.name}.`)
    throw new Error(`Could not switch your wallet to ${NET.name}. Pick ${NET.name} in your wallet and try again.`)
  }
  if ((await connector.getChainId()) !== ARC_CHAIN_ID) {
    throw new Error(`Your wallet is still not on ${NET.name}. Pick ${NET.name} in your wallet and try again.`)
  }
}
