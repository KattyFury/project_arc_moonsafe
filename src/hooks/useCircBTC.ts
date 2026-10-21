import { useState, useCallback } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'
import type { DCASchedule } from '@/types'

const CHAIN_ID = arcTestnet.id

// cirBTC token address on Arc Testnet — set via VITE_CIRBTC_ADDRESS
const CIRBTC_ADDRESS_TESTNET = (import.meta.env.VITE_CIRBTC_ADDRESS ?? '0x0000000000000000000000000000000000000000') as `0x${string}`
const USDC_ADDRESS = getUsdc(CHAIN_ID)!.address as `0x${string}`

const DCA_KEY = 'moonsafe_dca_v1'

function readDCA(): DCASchedule {
  try {
    const raw = localStorage.getItem(DCA_KEY)
    return raw ? (JSON.parse(raw) as DCASchedule) : { enabled: false, amountUsdc: 0, intervalDays: 7, lastRunAt: null }
  } catch {
    return { enabled: false, amountUsdc: 0, intervalDays: 7, lastRunAt: null }
  }
}

function writeDCA(dca: DCASchedule) {
  try { localStorage.setItem(DCA_KEY, JSON.stringify(dca)) } catch { /* ignore */ }
}

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function useCircBTC() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

  const [dca, setDcaState] = useState<DCASchedule>(readDCA)
  const [loading, setLoading] = useState(false)
  const [cirBtcBalance, setCirBtcBalance] = useState<bigint>(0n)
  const [swapError, setSwapError] = useState<string | null>(null)

  const refreshCirBtcBalance = useCallback(async () => {
    if (!address || !publicClient || CIRBTC_ADDRESS_TESTNET === '0x0000000000000000000000000000000000000000') return
    try {
      const bal = await publicClient.readContract({
        address: CIRBTC_ADDRESS_TESTNET,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      setCirBtcBalance(bal)
    } catch {
      setCirBtcBalance(0n)
    }
  }, [address, publicClient])

  // Swap USDC → cirBTC via Circle App Kit (keyless permissionless)
  // AppKit.swap API shape: { from: { adapter, chain }, tokenIn, tokenOut, amountIn, config? }
  const swapUsdcToCirBtc = useCallback(async (amountUsdc: bigint) => {
    if (!address) throw new Error('Not connected')
    if (CIRBTC_ADDRESS_TESTNET === '0x0000000000000000000000000000000000000000') {
      throw new Error('cirBTC address not configured. Set VITE_CIRBTC_ADDRESS in .env')
    }
    setLoading(true)
    setSwapError(null)
    try {
      const { AppKit, SwapChain } = await import('@circle-fin/app-kit')
      const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')

      // Access browser EIP-1193 provider — type is complex, cast needed for oxlint
      // oxlint-disable typescript/no-unsafe-assignment
      const win = window as unknown as Record<string, unknown>
      const ethereum = win['ethereum'] as Parameters<typeof createViemAdapterFromProvider>[0]['provider'] | undefined
      // oxlint-enable typescript/no-unsafe-assignment
      if (!ethereum) throw new Error('No wallet provider')

      // oxlint-disable-next-line typescript/no-unsafe-argument
      const adapter = await createViemAdapterFromProvider({ provider: ethereum })
      const kit = new AppKit()

      // Amount in human-readable USDC (6 decimals → string)
      const amountStr = (Number(amountUsdc) / 1_000_000).toString()

      await kit.swap({
        from: { adapter, chain: SwapChain.Arc_Testnet },
        tokenIn: USDC_ADDRESS,
        tokenOut: CIRBTC_ADDRESS_TESTNET,
        amountIn: amountStr,
        config: { slippageBps: 50 }, // 0.5%
      })

      await refreshCirBtcBalance()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Swap failed'
      setSwapError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [address, refreshCirBtcBalance])

  const saveDCA = useCallback((d: DCASchedule) => {
    writeDCA(d)
    setDcaState(d)
  }, [])

  return { cirBtcBalance, dca, loading, swapError, swapUsdcToCirBtc, saveDCA, refreshCirBtcBalance, cirBtcAddress: CIRBTC_ADDRESS_TESTNET }
}
