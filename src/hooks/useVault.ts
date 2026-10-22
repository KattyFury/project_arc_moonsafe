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
export const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? '') as `0x${string}`

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
      const has = vault !== zeroAddress
      let vb: bigint | null = 0n
      if (has) {
        const native = await publicClient.readContract({ address: vault, abi: VAULT_PROXY_ABI, functionName: 'getBalance' })
        vb = nativeToUsdc6(native)
      }
      setVaultAddress(has ? vault : null)
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
    if (!publicClient) throw new Error('Chưa kết nối mạng Arc')
    setBusy(true)
    try {
      await ensureArcChain(connector, switchChainAsync)
      const hash = await sendTransactionAsync({ ...tx, chainId: CHAIN_ID })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Giao dịch bị từ chối trên chuỗi')
      await refresh()
    } finally {
      setBusy(false)
    }
  }, [publicClient, sendTransactionAsync, refresh, connector, switchChainAsync])

  const createVault = useCallback(async () => {
    if (!address || !publicClient) throw new Error('Chưa kết nối ví')
    // Read the fee right before signing so the value always matches the contract.
    const feeNative = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'fee' })
    await send({
      to: FACTORY_ADDRESS,
      value: feeNative,
      data: encodeFunctionData({ abi: VAULT_FACTORY_ABI, functionName: 'createVault', args: [] }),
    })
  }, [address, publicClient, send])

  const deposit = useCallback(async (amount: bigint) => {
    if (!vaultAddress) throw new Error('Chưa có vault')
    await send({
      to: vaultAddress,
      value: usdc6ToNative(amount),
      data: encodeFunctionData({ abi: VAULT_PROXY_ABI, functionName: 'deposit', args: [] }),
    })
  }, [vaultAddress, send])

  // Withdrawals always go back to the owner's own wallet.
  const withdraw = useCallback(async (amount: bigint) => {
    if (!vaultAddress || !address) throw new Error('Chưa có vault')
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
  if (/reject|denied|cancel/i.test(msg)) return 'Bạn đã từ chối ký trong ví.'
  if (/insufficient funds|exceeds balance/i.test(msg)) return 'Ví không đủ USDC để trả số tiền và phí giao dịch.'
  if (/VaultAlreadyExists/i.test(msg)) return 'Ví này đã có vault.'
  const first = msg.split('\n')[0] ?? msg
  return first.length > 160 ? `${first.slice(0, 160)}…` : first
}
