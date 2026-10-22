// Make sure the wallet itself is on Arc Testnet before sending.
// wagmi's account chainId is not enough: @privy-io/wagmi reports the first configured
// chain when the wallet sits on an unsupported one (e.g. Rabby on Ethereum, id 1),
// so we ask the wallet provider directly and switch (adding the chain if needed).

import type { Connector } from 'wagmi'
import { arcTestnet } from 'viem/chains'

export const ARC_CHAIN_ID = arcTestnet.id

export async function ensureArcChain(
  connector: Connector | undefined,
  switchChainAsync: (args: { chainId: typeof ARC_CHAIN_ID; connector?: Connector }) => Promise<unknown>,
): Promise<void> {
  if (!connector) throw new Error('Ví chưa kết nối')
  const current = await connector.getChainId()
  if (current === ARC_CHAIN_ID) return
  try {
    await switchChainAsync({ chainId: ARC_CHAIN_ID, connector })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/reject|denied/i.test(msg)) throw new Error('Bạn đã từ chối chuyển ví sang mạng Arc Testnet.')
    throw new Error('Không chuyển được ví sang mạng Arc Testnet. Hãy chọn mạng Arc Testnet trong ví rồi thử lại.')
  }
  if ((await connector.getChainId()) !== ARC_CHAIN_ID) {
    throw new Error('Ví vẫn chưa ở mạng Arc Testnet. Hãy chọn mạng Arc Testnet trong ví rồi thử lại.')
  }
}
