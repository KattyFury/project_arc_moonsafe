// Buying cirBTC is the user's call: no cap (since 2026-10-24) and no warning above the target (Hieu, 2026-10-30). Shared by the
// Invest screen and the chat cards.

import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'

/** Wallet USDC that can be spent, keeping the gas reserve; null while unknown. */
export function spendable(wallet: bigint | null): bigint | null {
  return wallet === null ? null : wallet > GAS_RESERVE_USDC6 ? wallet - GAS_RESERVE_USDC6 : 0n
}
