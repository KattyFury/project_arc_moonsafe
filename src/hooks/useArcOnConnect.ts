// Ask the wallet to move to this build's Arc network as soon as it is in the app (e.g. OKX sitting on Ethereum).
// Once per wallet per page load: if the user declines, nothing nags them; the next transaction asks again through ensureArcChain.

import { useEffect, useRef } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { ensureArcChain } from '@/lib/chain'

export function useArcOnConnect() {
  const { address, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const asked = useRef<string | null>(null)

  useEffect(() => {
    if (!address || !connector) return
    const key = `${connector.uid}:${address}`
    if (asked.current === key) return
    asked.current = key
    ensureArcChain(connector, switchChainAsync).catch(e => console.warn('wallet stayed off Arc', e))
  }, [address, connector, switchChainAsync])
}
