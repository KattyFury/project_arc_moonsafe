// cirBTC (Circle wrapped Bitcoin on Arc, 8 decimals) — balance, BTC price, swap, DCA plan.
// Swap: Circle App Kit, keyless, from the user's own wallet. On Arc Testnet App Kit
// swaps only USDC / EURC / cirBTC (docs.arc.network/app-kit/swap).

import { useCallback, useEffect, useState } from 'react'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { useAccount, usePublicClient, useSwitchChain } from 'wagmi'
import { CHAIN_ID, NET } from '@/lib/network'
import type { DcaPlan } from '@/types'
import { ensureArcChain } from '@/lib/chain'
import { DCA_AVAILABLE } from '@/lib/features'

/** docs.arc.network/arc/references/contract-addresses — testnet cirBTC. */
export const CIRBTC_ADDRESS = NET.cirBtc
export const CIRBTC_DECIMALS = 8
const SLIPPAGE_BPS = 300
/**
 * Price guard (mainnet, 2026-10-29): a quote whose price per BTC is more than this above the market BTC price (/api/price) is
 * refused, so a thin or broken pool can never sell cirBTC far above Bitcoin (the testnet pool once priced it at ~2.6x).
 */
const MAX_PREMIUM = 0.03
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
  /** USD per BTC this quote pays, and how far that is above the market price (0.01 = 1%); null when the market price is unknown. */
  pricePerBtc: number
  premium: number | null
}

/** USD per BTC a quote pays: what goes in over the cirBTC that comes out. */
export const quotePrice = (amountInUsdc: string, outCirBtc: string) => Number(amountInUsdc) / Number(outCirBtc)

function readDca(): DcaPlan | null {
  if (!DCA_AVAILABLE) return null // plans saved before DCA was switched off are ignored
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

export const toAppKitAmount = (u: bigint) => {
  const whole = u / 1_000_000n
  const frac = (u % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : `${whole}`
}

export function useCirBtcState(): CirBtcState {
  const { address, connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })

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
    if (!connector) throw new Error('Wallet not connected')
    await ensureArcChain(connector, switchChainAsync)
    const provider = await connector.getProvider() as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }, [connector, switchChainAsync])

  const estimate = useCallback(async (amountUsdc6: bigint) => {
    setError(null); setQuote(null); setLastTxHash(null)
    if (!address) { setError('Wallet not connected'); return }
    setBusy(true)
    try {
      const adapter = await getAdapter()
      const amountIn = toAppKitAmount(amountUsdc6)
      const est = await kit.estimateSwap({
        from: { adapter, chain: NET.appKitChain },
        tokenIn: 'USDC', tokenOut: 'cirBTC', amountIn,
        config: { slippageBps: SLIPPAGE_BPS },
      })
      const pricePerBtc = quotePrice(amountIn, est.estimatedOutput.amount)
      // The market price is read fresh here, so the guard never compares against a stale or missing number.
      let market = btcUsd
      try { const r = await fetch('/api/price'); const d = await r.json() as { btcUsd?: number }; if (d.btcUsd && d.btcUsd > 0) market = d.btcUsd } catch { /* keep the last one */ }
      const premium = market ? pricePerBtc / market - 1 : null
      if (!Number.isFinite(pricePerBtc) || pricePerBtc <= 0) throw new Error('The quote came back empty, please try again')
      if (premium === null) throw new Error('Could not check the BTC price right now, so no purchase. Please try again in a minute.')
      if (premium > MAX_PREMIUM) throw new Error(`This quote prices Bitcoin at ${Math.round(pricePerBtc).toLocaleString('en-US')} USD, ${(premium * 100).toFixed(1)}% above the market (${Math.round(market!).toLocaleString('en-US')} USD). MoonSafe does not buy above ${MAX_PREMIUM * 100}%, please try later.`)
      setQuote({ amountInUsdc: amountIn, estimate: est, address, pricePerBtc, premium })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get a quote')
    } finally {
      setBusy(false)
    }
  }, [address, getAdapter, btcUsd])

  const execute = useCallback(async (): Promise<boolean> => {
    if (!quote) return false
    if (address !== quote.address) { setError('Your wallet changed, please get a new quote'); setQuote(null); return false }
    setError(null); setBusy(true)
    try {
      const adapter = await getAdapter()
      const res = await kit.swap({
        from: { adapter, chain: NET.appKitChain },
        tokenIn: 'USDC', tokenOut: 'cirBTC', amountIn: quote.amountInUsdc,
        config: { slippageBps: SLIPPAGE_BPS },
      })
      setLastTxHash(res.txHash ?? null)
      setQuote(null)
      await refresh()
      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed'
      setError(/reject|denied/i.test(msg) ? 'You declined to sign in your wallet.' : msg)
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
  const s = (Number(units) / 10 ** CIRBTC_DECIMALS).toLocaleString('en-US', { maximumFractionDigits: 8 })
  return `${s} cirBTC`
}
