// Vault state — one instance for the whole app (see AppState).
// On Arc, USDC is the native gas token (18 decimals). The vault holds native USDC,
// so fees/deposits are msg.value and no approve is needed. The app works in
// 6-decimal USDC units and converts at the edge.

import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { encodeFunctionData, zeroAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { nativeToUsdc6, usdc6ToNative } from '@/lib/format'
import { ensureArcChain } from '@/lib/chain'

const CHAIN_ID = arcTestnet.id // 5042002
// Current factory (HANDOFF -25, public); VITE_FACTORY_ADDRESS overrides it.
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS || '0xAd064AdD8d4C6C36964981d1f1aeBFF697e3941b') as `0x${string}`
/**
 * Earlier factories whose vaults the app should still find (optional, comma-separated env).
 * Empty since the 2026-10-26 factory: the old ones (0x358e, 0x7E0f) held no funds, so every
 * wallet opens a vault on FACTORY_ADDRESS.
 */
export const LEGACY_FACTORIES = [
  ...String(import.meta.env.VITE_LEGACY_FACTORY_ADDRESSES ?? '').split(',').map(a => a.trim()).filter(Boolean),
].filter(a => a.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) as `0x${string}`[]

/** Kept in the wallet for gas when the user taps "Tối đa" (0,02 USDC). */
export const GAS_RESERVE_USDC6 = 20_000n
/** Shown as the gas estimate (~0,01 USDC). */
export const GAS_ESTIMATE_USDC6 = 10_000n

const POLL_MS = 15_000

export const VAULT_FACTORY_ABI = [
  { name: 'createVault', type: 'function', stateMutability: 'payable', inputs: [], outputs: [{ name: 'vault', type: 'address' }] },
  { name: 'getVault', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'address' }] },
  { name: 'fee', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

export const VAULT_PROXY_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [] },
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

export interface VaultState {
  /** true once the first read for the current wallet finished (ok or failed). */
  ready: boolean
  vaultAddress: `0x${string}` | null
  /** null = unknown (RPC failed) → UI shows "–". 6-decimal units. */
  vaultBalance: bigint | null
  walletBalance: bigint | null
  /** Vault opening fee read from the factory, 6-decimal units. */
  fee: bigint | null
  readError: boolean
  busy: boolean
  createVault: () => Promise<void>
  deposit: (amount: bigint) => Promise<void>
  withdraw: (amount: bigint) => Promise<void>
  refresh: () => Promise<void>
}

export function useVaultState(): VaultState {
  const { address, connector } = useAccount()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [ready, setReady] = useState(false)
  const [vaultAddress, setVaultAddress] = useState<`0x${string}` | null>(null)
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null)
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null)
  const [fee, setFee] = useState<bigint | null>(null)
  const [readError, setReadError] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!address || !publicClient) return
    try {
      const [vault, walletNative, feeNative] = await Promise.all([
        publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'getVault', args: [address] }),
        publicClient.getBalance({ address }),
        publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'fee' }),
      ])
      // No vault on the current factory → look on the earlier ones.
      let found = vault
      for (const f of LEGACY_FACTORIES) {
        if (found !== zeroAddress) break
        found = await publicClient.readContract({ address: f, abi: VAULT_FACTORY_ABI, functionName: 'getVault', args: [address] })
      }
      const has = found !== zeroAddress
      let vb: bigint | null = 0n
      if (has) {
        const native = await publicClient.readContract({ address: found, abi: VAULT_PROXY_ABI, functionName: 'getBalance' })
        vb = nativeToUsdc6(native)
      }
      setVaultAddress(has ? found : null)
      setVaultBalance(has ? vb : null)
      setWalletBalance(nativeToUsdc6(walletNative))
      setFee(nativeToUsdc6(feeNative))
      setReadError(false)
    } catch (e) {
      console.error('vault refresh failed', e)
      setReadError(true)
    } finally {
      setReady(true)
    }
  }, [address, publicClient])

  // Reset when the wallet changes, then load + poll.
  useEffect(() => {
    setReady(false)
    setVaultAddress(null)
    setVaultBalance(null)
    setWalletBalance(null)
    if (!address) return
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [address, refresh])

  const send = useCallback(async (tx: { to: `0x${string}`; value?: bigint; data: `0x${string}` }) => {
    if (!publicClient) throw new Error('Not connected to the Arc network')
    setBusy(true)
    try {
      await ensureArcChain(connector, switchChainAsync)
      const hash = await sendTransactionAsync({ ...tx, chainId: CHAIN_ID })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The transaction was rejected onchain')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [publicClient, sendTransactionAsync, refresh, connector, switchChainAsync])

  const createVault = useCallback(async () => {
    if (!address || !publicClient) throw new Error('Wallet not connected')
    // Read the fee right before signing so the value always matches the contract.
    const feeNative = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'fee' })
    await send({
      to: FACTORY_ADDRESS,
      value: feeNative,
      data: encodeFunctionData({ abi: VAULT_FACTORY_ABI, functionName: 'createVault', args: [] }),
    })
  }, [address, publicClient, send])

  const deposit = useCallback(async (amount: bigint) => {
    if (!vaultAddress) throw new Error('No vault yet')
    await send({
      to: vaultAddress,
      value: usdc6ToNative(amount),
      data: encodeFunctionData({ abi: VAULT_PROXY_ABI, functionName: 'deposit', args: [] }),
    })
  }, [vaultAddress, send])

  // Withdrawals always go back to the owner's own wallet.
  const withdraw = useCallback(async (amount: bigint) => {
    if (!vaultAddress || !address) throw new Error('No vault yet')
    await send({
      to: vaultAddress,
      data: encodeFunctionData({ abi: VAULT_PROXY_ABI, functionName: 'withdraw', args: [usdc6ToNative(amount), address] }),
    })
  }, [vaultAddress, address, send])

  return { ready, vaultAddress, vaultBalance, walletBalance, fee, readError, busy, createVault, deposit, withdraw, refresh }
}

/** Short Vietnamese message for wallet / tx errors (user rejection, gas, …). */
export function txErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/reject|denied|cancel/i.test(msg)) return 'You declined to sign in your wallet.'
  if (/insufficient funds|exceeds balance/i.test(msg)) return 'The wallet does not have enough USDC for the amount and the fee.'
  if (/VaultAlreadyExists/i.test(msg)) return 'This wallet already has a vault.'
  const first = msg.split('\n')[0] ?? msg
  return first.length > 160 ? `${first.slice(0, 160)}…` : first
}
