// MoonSafe — Investment Hub swap hook using Circle App Kit (keyless, browser wallet)
// Follows swap-tokens skill: estimate first, show quote, user clicks swap button.

import { useState, useCallback } from 'react'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'

const kit = new AppKit()

// Investment tokens available on Arc Testnet
// cirBTC is specified by contract address since it's not a standard alias
export interface InvestToken {
  symbol: string
  name: string
  address?: string   // contract address if not a standard alias
  icon: string       // emoji fallback
  decimals: number
  category: 'crypto' | 'stock' | 'other'
}

export const INVEST_TOKENS: InvestToken[] = [
  { symbol: 'WBTC',  name: 'Wrapped Bitcoin', icon: '₿', decimals: 8,  category: 'crypto' },
  { symbol: 'WETH',  name: 'Wrapped Ethereum', icon: 'Ξ', decimals: 18, category: 'crypto' },
]

// cirBTC is added when VITE_CIRBTC_ADDRESS is set
const cirBtcAddress = import.meta.env.VITE_CIRBTC_ADDRESS as string | undefined
if (cirBtcAddress) {
  INVEST_TOKENS.unshift({ symbol: 'cirBTC', name: 'Circle BTC', address: cirBtcAddress, icon: '₿', decimals: 8, category: 'crypto' })
}

export interface SwapQuote {
  tokenIn: string
  tokenOut: string
  amountIn: string
  estimate: SwapEstimate
  address: string
}

export function useSwap() {
  const { connector, address } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  const getAdapter = useCallback(async () => {
    if (!connector) throw new Error('Ví chưa kết nối')
    if (chainId !== arcTestnet.id) {
      await switchChainAsync({ chainId: arcTestnet.id })
    }
    const provider = await connector.getProvider() as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }, [connector, chainId, switchChainAsync])

  const estimateSwap = useCallback(async (tokenOut: InvestToken, amountInUsdc: string): Promise<void> => {
    setError(null)
    setQuote(null)
    setTxHash(null)
    setLoading(true)
    try {
      const adapter = await getAdapter()
      const tokenOutId = tokenOut.address ?? tokenOut.symbol
      const estimate = await kit.estimateSwap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: 'USDC',
        tokenOut: tokenOutId,
        amountIn: amountInUsdc,
        config: { slippageBps: 300 },
      })
      if (!address) throw new Error('Không có địa chỉ ví')
      setQuote({ tokenIn: 'USDC', tokenOut: tokenOut.symbol, amountIn: amountInUsdc, estimate, address })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lấy được báo giá')
    } finally {
      setLoading(false)
    }
  }, [getAdapter, address])

  const executeSwap = useCallback(async (q: SwapQuote, tokenOut: InvestToken): Promise<void> => {
    if (!q) return
    if (address !== q.address) { setError('Ví đã thay đổi, lấy báo giá lại'); return }
    setError(null)
    setLoading(true)
    try {
      const adapter = await getAdapter()
      const tokenOutId = tokenOut.address ?? tokenOut.symbol
      const result = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: 'USDC',
        tokenOut: tokenOutId,
        amountIn: q.amountIn,
        config: { slippageBps: 300 },
      })
      setTxHash(result.txHash ?? null)
      setQuote(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Swap thất bại')
    } finally {
      setLoading(false)
    }
  }, [getAdapter, address])

  const clearQuote = useCallback(() => {
    setQuote(null)
    setError(null)
    setTxHash(null)
  }, [])

  return { quote, loading, error, txHash, estimateSwap, executeSwap, clearQuote }
}
