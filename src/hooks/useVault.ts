// Vault state — one instance for the whole app (see AppState).
// On Arc, USDC is the native gas token (18 decimals). The vault holds native USDC,
// so fees/deposits are msg.value and no approve is needed. The app works in
// 6-decimal USDC units and converts at the edge.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { encodeFunctionData, zeroAddress } from 'viem'
import { CHAIN_ID as NET_CHAIN_ID, FACTORY } from '@/lib/network'
import { nativeToUsdc6, usdc6ToNative } from '@/lib/format'
import { ensureArcChain } from '@/lib/chain'

const CHAIN_ID = NET_CHAIN_ID
// The factory of this build (src/lib/network.ts). A mainnet build without VITE_FACTORY_ADDRESS has none: FACTORY_CONFIGURED is false
// and nothing is read or sent (the zero address stands in only so the types stay simple).
export const FACTORY_CONFIGURED = FACTORY !== null
export const FACTORY_ADDRESS = (FACTORY ?? zeroAddress) as `0x${string}`
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
  { name: 'depositFor', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }, { name: 'to', type: 'address' }], outputs: [] },
  { name: 'getBalance', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
] as const

export interface VaultState {
  /** true once the first read for the current wallet finished (ok or failed). */
  ready: boolean
  vaultAddress: `0x${string}` | null
  /**
   * One vault per person (Hieu, 2026-10-29): the vault of whichever of the account's wallets owns one. Any of their wallets can add
   * money to it (depositFor); only the owner wallet can withdraw, and withdrawals always go back to the owner wallet.
   */
  vaultOwner: `0x${string}` | null
  /** The wallet in use owns the vault (withdrawals possible from here). */
  isOwner: boolean
  /** null = unknown (RPC failed) → UI shows "–". 6-decimal units. */
  vaultBalance: bigint | null
  walletBalance: bigint | null
  /** Vault opening fee read from the factory, 6-decimal units. */
  fee: bigint | null
  readError: boolean
  busy: boolean
  /** `shownFee` (USDC, 6 decimals): the fee the screen showed; if the contract now asks for more, nothing is sent. */
  createVault: (shownFee?: bigint) => Promise<void>
  deposit: (amount: bigint) => Promise<void>
  withdraw: (amount: bigint) => Promise<void>
  refresh: () => Promise<void>
}

export function useVaultState(): VaultState {
  const { address, connector } = useAccount()
  const { user } = usePrivy()
  const { wallets } = useWallets()
  // Every EVM wallet of this account: the one in use first, then the others connected now or linked to the account.
  const accountWallets = useMemo(() => {
    const all = [address, ...wallets.filter(w => w.type === 'ethereum').map(w => w.address),
      ...(user?.linkedAccounts ?? []).flatMap(a => a.type === 'wallet' && a.chainType === 'ethereum' ? [a.address] : [])]
    return [...new Set(all.filter((a): a is string => !!a).map(a => a.toLowerCase()))] as `0x${string}`[]
  }, [address, wallets, user?.linkedAccounts])
  const walletsKey = accountWallets.join(',')
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()

  const [ready, setReady] = useState(false)
  const [vaultAddress, setVaultAddress] = useState<`0x${string}` | null>(null)
  const [vaultOwner, setVaultOwner] = useState<`0x${string}` | null>(null)
  const [vaultBalance, setVaultBalance] = useState<bigint | null>(null)
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null)
  const [fee, setFee] = useState<bigint | null>(null)
  const [readError, setReadError] = useState(false)
  const [busy, setBusy] = useState(false)

  // Each wallet/account change starts a new epoch; a read that finishes in an older one is dropped, so a slow answer for the previous
  // account can never become the vault a deposit is sent to (security review 2026-10-29).
  const epochRef = useRef(0)
  const refresh = useCallback(async () => {
    if (!address || !publicClient || !FACTORY_CONFIGURED) return
    const epoch = epochRef.current
    try {
      const [walletNative, feeNative] = await Promise.all([
        publicClient.getBalance({ address }),
        publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'fee' }),
      ])
      // The account's vault: the wallet in use first, then its other wallets; current factory first, then the earlier ones.
      let found: `0x${string}` = zeroAddress
      let owner: `0x${string}` | null = null
      const candidates = walletsKey ? (walletsKey.split(',') as `0x${string}`[]) : [address]
      for (const f of [FACTORY_ADDRESS, ...LEGACY_FACTORIES]) {
        for (const w of candidates) {
          const v = await publicClient.readContract({ address: f, abi: VAULT_FACTORY_ABI, functionName: 'getVault', args: [w] })
          if (v !== zeroAddress) { found = v; owner = w; break }
        }
        if (found !== zeroAddress) break
      }
      const has = found !== zeroAddress
      let vb: bigint | null = 0n
      if (has) {
        const native = await publicClient.readContract({ address: found, abi: VAULT_PROXY_ABI, functionName: 'getBalance' })
        vb = nativeToUsdc6(native)
      }
      if (epoch !== epochRef.current) return
      setVaultAddress(has ? found : null)
      setVaultOwner(has ? owner : null)
      setVaultBalance(has ? vb : null)
      setWalletBalance(nativeToUsdc6(walletNative))
      setFee(nativeToUsdc6(feeNative))
      setReadError(false)
    } catch (e) {
      if (epoch !== epochRef.current) return
      console.error('vault refresh failed', e)
      setReadError(true)
    } finally {
      if (epoch === epochRef.current) setReady(true)
    }
  }, [address, publicClient, walletsKey])

  // Reset when the wallet changes, then load + poll.
  useEffect(() => {
    epochRef.current += 1
    setReady(false)
    setVaultAddress(null)
    setVaultOwner(null)
    setVaultBalance(null)
    setWalletBalance(null)
    if (!address) return
    void refresh()
    const id = setInterval(() => { void refresh() }, POLL_MS)
    return () => clearInterval(id)
  }, [address, refresh])

  const send = useCallback(async (tx: { to: `0x${string}`; value?: bigint; data: `0x${string}` }) => {
    if (!publicClient) throw new Error('Not connected to the Arc network')
    if (!FACTORY_CONFIGURED) throw new Error('This build has no vault factory address')
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

  const createVault = useCallback(async (shownFee?: bigint) => {
    if (!address || !publicClient) throw new Error('Wallet not connected')
    // Read the fee right before signing so the value always matches the contract.
    const feeNative = await publicClient.readContract({ address: FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI, functionName: 'fee' })
    // The card showed a fee; if the contract now asks for more than that, stop and let the user look again (review 2026-10-29).
    if (shownFee !== undefined && nativeToUsdc6(feeNative) > shownFee) throw new Error('The vault fee changed since this was shown, so nothing was sent. Please look at the new fee and try again.')
    await send({
      to: FACTORY_ADDRESS,
      value: feeNative,
      data: encodeFunctionData({ abi: VAULT_FACTORY_ABI, functionName: 'createVault', args: [] }),
    })
  }, [address, publicClient, send])

  const isOwner = !!address && !!vaultOwner && vaultOwner.toLowerCase() === address.toLowerCase()

  // From the owner wallet: deposit(); from another wallet of the same person: depositFor() (anyone may add to a vault).
  const deposit = useCallback(async (amount: bigint) => {
    if (!vaultAddress) throw new Error('No vault yet')
    if (!isOwner) {
      // Money from another wallet of the same person goes in with depositFor. Right before sending, check that the vault really belongs
      // to one of this account's wallets, so a stale or wrong read can never aim a deposit at a stranger's vault (review 2026-10-29).
      const mine = vaultOwner && accountWallets.includes(vaultOwner.toLowerCase() as `0x${string}`)
      const onchainOwner = mine && publicClient ? await publicClient.readContract({ address: vaultAddress, abi: VAULT_PROXY_ABI, functionName: 'owner' }) : null
      if (!onchainOwner || onchainOwner.toLowerCase() !== vaultOwner!.toLowerCase()) throw new Error('This vault does not belong to one of your wallets, so nothing was sent.')
    }
    await send({
      to: vaultAddress,
      value: usdc6ToNative(amount),
      data: encodeFunctionData({ abi: VAULT_PROXY_ABI, functionName: isOwner ? 'deposit' : 'depositFor', args: [] }),
    })
  }, [vaultAddress, vaultOwner, accountWallets, publicClient, send, isOwner])

  // Withdrawals always go back to the owner's own wallet, and only the owner wallet can sign them.
  const withdraw = useCallback(async (amount: bigint) => {
    if (!vaultAddress || !address) throw new Error('No vault yet')
    if (!isOwner) throw new Error(`Only the wallet that opened the emergency fund (${vaultOwner?.slice(0, 6)}…${vaultOwner?.slice(-4)}) can withdraw. Switch to it in Menu.`)
    await send({
      to: vaultAddress,
      data: encodeFunctionData({ abi: VAULT_PROXY_ABI, functionName: 'withdraw', args: [usdc6ToNative(amount), address] }),
    })
  }, [vaultAddress, address, send, isOwner, vaultOwner])

  return { ready, vaultAddress, vaultOwner, isOwner, vaultBalance, walletBalance, fee, readError, busy, createVault, deposit, withdraw, refresh }
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
