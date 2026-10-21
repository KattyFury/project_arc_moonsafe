import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useSendTransaction } from 'wagmi'
import { encodeFunctionData, parseUnits, zeroAddress } from 'viem'
import { arcTestnet } from 'viem/chains'

const CHAIN_ID = arcTestnet.id // 5042002
const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? '') as `0x${string}`

// On Arc, USDC is the native gas token — fee is sent as msg.value, no approve needed.
// 1 USDC = 1_000_000 in ERC-20 terms (6 decimals) but native has 18 decimals.
// Factory fee is stored as native units (1e12 = 1 USDC in native 18-decimal terms).
export const VAULT_FACTORY_ABI = [
  {
    name: 'createVault',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  {
    name: 'getVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    name: 'hasVault',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'vaultMeetsMinimum',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'minAmount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'fee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const VAULT_PROXY_ABI = [
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'getBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'meetsMinimum',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'minAmount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// On Arc: 1 USDC displayed = 1_000_000 ERC-20 units = 1_000_000_000_000 native units (1e12)
// Vault getBalance() returns native units. We display in USDC (6-decimal) by dividing by 1e6.
// Conversion factor: Arc native USDC has 18 decimals, display/ERC-20 USDC has 6 decimals
const _NATIVE_PER_USDC = 1_000_000n // kept for reference; actual conversions use 1e12 multiplier

export function nativeToUsdc6(native: bigint): bigint {
  // Arc native USDC has 6 decimals (same as ERC-20 USDC on Arc)
  return native
}

export function usdc6ToNative(usdc6: bigint): bigint {
  return usdc6
}

export function useVault() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()

  const [vaultAddress, setVaultAddress] = useState<`0x${string}` | null>(null)
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n)
  const [walletBalance, setWalletBalance] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)

  const refreshBalances = useCallback(async () => {
    if (!address || !publicClient) return
    try {
      const vault = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: VAULT_FACTORY_ABI,
        functionName: 'getVault',
        args: [address],
      })
      const hasV = vault !== zeroAddress
      setVaultAddress(hasV ? vault : null)

      if (hasV) {
        const balNative = await publicClient.readContract({
          address: vault,
          abi: VAULT_PROXY_ABI,
          functionName: 'getBalance',
        })
        setVaultBalance(balNative / 1_000_000_000_000n) // 18 → 6 decimals
      } else {
        setVaultBalance(0n)
      }

      // Native USDC balance (Arc: native IS USDC, 18 decimals → convert to 6 decimals for display)
      const wBalNative = await publicClient.getBalance({ address })
      setWalletBalance(wBalNative / 1_000_000_000_000n) // 18 → 6 decimals
    } catch (e) {
      console.error('refreshBalances error', e)
    }
  }, [address, publicClient])

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    void refreshBalances()
  }, [refreshBalances])

  // Create vault — single tx, fee paid as msg.value (native USDC)
  const createVault = useCallback(async (): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error('Not connected')
    setLoading(true)
    try {
      const fee = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: VAULT_FACTORY_ABI,
        functionName: 'fee',
      })

      const hash = await sendTransactionAsync({
        to: FACTORY_ADDRESS,
        value: fee,
        data: encodeFunctionData({
          abi: VAULT_FACTORY_ABI,
          functionName: 'createVault',
          args: [],
        }),
        chainId: CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances()
      const vault = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: VAULT_FACTORY_ABI,
        functionName: 'getVault',
        args: [address],
      })
      return vault
    } finally {
      setLoading(false)
    }
  }, [address, publicClient, sendTransactionAsync, refreshBalances])

  // Deposit native USDC into vault — single tx, amount as msg.value
  // amount is in 6-decimal USDC units; native requires 18-decimal units
  const deposit = useCallback(async (amount: bigint) => {
    if (!address || !vaultAddress || !publicClient) throw new Error('No vault')
    setLoading(true)
    try {
      const hash = await sendTransactionAsync({
        to: vaultAddress,
        value: amount * 1_000_000_000_000n, // 6 → 18 decimals
        data: encodeFunctionData({
          abi: VAULT_PROXY_ABI,
          functionName: 'deposit',
          args: [],
        }),
        chainId: CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances()
    } finally {
      setLoading(false)
    }
  }, [address, vaultAddress, publicClient, sendTransactionAsync, refreshBalances])

  // Withdraw native USDC from vault
  // amount is in 6-decimal USDC units; contract expects 18-decimal native units
  const withdraw = useCallback(async (amount: bigint, to: `0x${string}`) => {
    if (!address || !vaultAddress || !publicClient) throw new Error('No vault')
    setLoading(true)
    try {
      const hash = await sendTransactionAsync({
        to: vaultAddress,
        data: encodeFunctionData({
          abi: VAULT_PROXY_ABI,
          functionName: 'withdraw',
          args: [amount * 1_000_000_000_000n, to], // 6 → 18 decimals
        }),
        chainId: CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances()
    } finally {
      setLoading(false)
    }
  }, [address, vaultAddress, publicClient, sendTransactionAsync, refreshBalances])

  return {
    vaultAddress,
    vaultBalance,
    walletBalance,
    walletUsdcBalance: walletBalance, // alias — on Arc, native IS USDC
    loading,
    createVault,
    deposit,
    withdraw,
    refreshBalances,
    factoryAddress: FACTORY_ADDRESS,
  }
}

// Format native USDC (6 decimals on Arc) to display string
// e.g. 116660000n → "116.66", 1234567890000n → "1,234,567.89"
export function formatUsdc(units: bigint, decimals = 2): string {
  if (units === 0n) return '0'
  const divisor = 10 ** 6
  const whole = Number(units / BigInt(divisor))
  const frac = Number(units % BigInt(divisor)) / divisor
  const value = whole + frac
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// Parse display string to USDC units (6 decimals)
export function parseUsdcInput(val: string): bigint {
  if (!val || isNaN(Number(val))) return 0n
  return parseUnits(val, 6)
}
