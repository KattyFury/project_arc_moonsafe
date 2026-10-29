// Buying AI power (Hieu, 2026-10-29): 1 USDC per purchase on Arc mainnet, sent to the owner wallet, adds 100 messages that never
// expire. Shared by the app (builds the payment) and the server (functions/_lib/quota.ts checks it onchain).
//
// The payment carries a memo in its calldata: a hash of the MoonSafe account id. The server only credits the account whose memo
// is in the transaction, so nobody can claim someone else's payment by copying its hash.

import { keccak256, toHex } from 'viem'

export const POWER_PRICE_NATIVE = 1_000_000_000_000_000_000n // 1 USDC (native USDC on Arc has 18 decimals)
export const POWER_PER_PURCHASE = 100
export const DEFAULT_POWER_PAYMENT_ADDRESS = '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6'

export const powerMemo = (accountId: string) => keccak256(toHex(`MoonSafe AI power\n${accountId}`))
