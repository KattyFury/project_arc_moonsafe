// cirBTC (Circle wrapped Bitcoin on Arc, 8 decimals) — balance, BTC price, swap, DCA plan.
// Swap: Circle App Kit, keyless, from the user's own wallet. On Arc Testnet App Kit
// swaps only USDC / EURC / cirBTC (docs.arc.network/app-kit/swap).

import { useCallback, useEffect, useState } from 'react'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { useAccount, useChainId, usePublicClient, useSwitchChain } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import type { DcaPlan } from '@/types'

/** docs.arc.network/arc/references/contract-addresses — testnet cirBTC. */
export const CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as const
export const CIRBTC_DECIMALS = 8
const SLIPPAGE_BPS = 300
const POLL_MS = 30_000
const DCA_KEY = 'moonsafe_dca_v1'

const kit = new AppKit()

const ERC20_BALANCE_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

export interface CirBtcQuote {
  amountInUsdc: string   // "12.5" (dot decimal, App Kit format)
  estimate: SwapEstimate
  address: string
}

function readDca(): DcaPlan | null {
  try {
    const raw = localStorage.getItem(DCA_KEY)
    return raw ? (JSON.parse(raw) as DcaPlan) : null
  } catch { return null }
}
function writeDca(p: DcaPlan | null) {
  try {
    if (p) localStorage.setItem(DCA_KEY, JSON.stringify(p))
    else localStorage.removeItem(DCA_KEY)
  } catch { /* storage blocked */ }
}

export interface CirBtcState {
  /** 8-decimal units; null = unknown. */
  balance: bigint | null
  /** USD per BTC; null = unavailable → holdings value shows "–". */
  btcUsd: number | null
  /** Holdings value in 6-decimal USDC units, null if balance or price unknown. */
  valueUsdc6: bigint | null
  quote: CirBtcQuote | null
  busy: boolean
  error: string | null
  lastTxHash: string | null
  estimate: (amountUsdc6: bigint) => Promise<void>
  execute: () => Promise<boolean>
  clearQuote: () => void
  dca: DcaPlan | null
  startDca: (amountUsdc6: bigint, intervalDays: number) => void
  stopDca: () => void
  markDcaRun: () => void
  refresh: () => Promise<void>
}

const toAppKitAmount = (u: bigint) => {
  const whole = u / 1_000_000n
  const frac = (u % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export function useCirBtcState(): CirBtcState {
  const { address, connector } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: arcTestnet.id })

  const [balance, setBalance] = useState<bigint | null>(null)
  const [btcUsd, setBtcUsd] = useState<number | null>(null)
  const [quote, setQuote] = useState<CirBtcQuote | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastTxHash, setLastTxHash] = useState<string | null>(null)
  const [dca, setDca] = useState<DcaPlan | null>(readDca)

  const refresh = useCallback(async () => {
    if (!address || !publicClient) return
    try {
      const b = await publicClient.readContract({ address: CIRBTC_ADDRESS, abi: ERC20_BALANCE_ABI, functionName: 'balanceOf', args: [address] })
      setBalance(b)
    } catch { /* keep last known */ }
    try {
      const r = await fetch('/api/price')
      if (r.ok) {
        const d = await r.json() as { btcUsd?: number }
        if (d.btcUsd && d.btcUsd > 0) setBtcUsd(d.btcUsd)
      }
    } catch { /* price stays unknown */ }
  }, [address, publicClient])

  useEffect(() => {
    setBalance(null)
    if (!address) return
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [address, refresh])

  const getAdapter = useCallback(async () => {
    if (!connector) throw new Error('Ví chưa kết nối')
    if (chainId !== arcTestnet.id) await switchChainAsync({ chainId: arcTestnet.id })
    const provider = await connector.getProvider() as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }, [connector, chainId, switchChainAsync])

  const estimate = useCallback(async (amountUsdc6: bigint) => {
    setError(null); setQuote(null); setLastTxHash(null)
    if (!address) { setError('Ví chưa kết nối'); return }
    setBusy(true)
    try {
      const adapter = await getAdapter()
      const amountIn = toAppKitAmount(amountUsdc6)
      const est = await kit.estimateSwap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: 'USDC', tokenOut: 'cirBTC', amountIn,
        config: { slippageBps: SLIPPAGE_BPS },
      })
      setQuote({ amountInUsdc: amountIn, estimate: est, address })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lấy được báo giá')
    } finally {
      setBusy(false)
    }
  }, [address, getAdapter])

  const execute = useCallback(async (): Promise<boolean> => {
    if (!quote) return false
    if (address !== quote.address) { setError('Ví đã đổi, hãy lấy báo giá lại'); setQuote(null); return false }
    setError(null); setBusy(true)
    try {
      const adapter = await getAdapter()
      const res = await kit.swap({
        from: { adapter, chain: 'Arc_Testnet' },
        tokenIn: 'USDC', tokenOut: 'cirBTC', amountIn: quote.amountInUsdc,
        config: { slippageBps: SLIPPAGE_BPS },
      })
      setLastTxHash(res.txHash ?? null)
      setQuote(null)
      await refresh()
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Mua thất bại'
      setError(/reject|denied/i.test(msg) ? 'Bạn đã từ chối ký trong ví.' : msg)
      return false
    } finally {
      setBusy(false)
    }
  }, [quote, address, getAdapter, refresh])

  const clearQuote = useCallback(() => { setQuote(null); setError(null) }, [])

  const startDca = useCallback((amountUsdc6: bigint, intervalDays: number) => {
    const p: DcaPlan = { amountUsdc: amountUsdc6.toString(), intervalDays, startedAt: Date.now(), lastRunAt: null }
    writeDca(p); setDca(p)
  }, [])
  const stopDca = useCallback(() => { writeDca(null); setDca(null) }, [])
  const markDcaRun = useCallback(() => {
    setDca(prev => {
      if (!prev) return prev
      const next = { ...prev, lastRunAt: Date.now() }
      writeDca(next)
      return next
    })
  }, [])

  const valueUsdc6 = balance !== null && btcUsd !== null
    ? BigInt(Math.round((Number(balance) / 10 ** CIRBTC_DECIMALS) * btcUsd * 1_000_000))
    : null

  return { balance, btcUsd, valueUsdc6, quote, busy, error, lastTxHash, estimate, execute, clearQuote, dca, startDca, stopDca, markDcaRun, refresh }
}

/** Next DCA run time (ms) or null. Due when <= now. */
export function dcaNextRun(p: DcaPlan | null): number | null {
  if (!p) return null
  return (p.lastRunAt ?? p.startedAt - p.intervalDays * 86_400_000) + p.intervalDays * 86_400_000
}

export function formatCirBtc(units: bigint | null): string {
  if (units === null) return '–'
  const s = (Number(units) / 10 ** CIRBTC_DECIMALS).toLocaleString('vi-VN', { maximumFractionDigits: 8 })
  return `${s} cirBTC`
}
