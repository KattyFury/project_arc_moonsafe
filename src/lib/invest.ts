// Buying cirBTC is the user's call (no cap since 2026-10-24); the app only warns when a buy
// pushes the BTC share above the MoonSafe target (spec 7: create it and mention the gap once). Shared by the Đầu tư screen and the chat cards.

import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'
import { shareOfLiquid, type Balance } from '@/lib/allocation'

/** Wallet USDC that can be spent, keeping the gas reserve; null while unknown. */
export function spendable(wallet: bigint | null): bigint | null {
  return wallet === null ? null : wallet > GAS_RESERVE_USDC6 ? wallet - GAS_RESERVE_USDC6 : 0n
}

/** Warning text if buying `amount` (6-dec USDC, moved from idle into BTC) ends above the BTC target; null otherwise. */
export function overTargetWarning(b: Balance, amount: bigint): string | null {
  if (!b.target || b.liquid <= 0) return null
  // Crypto is one bucket (framework v2): all coins held count against the whole crypto share.
  const after = shareOfLiquid(b, b.byGroup.btc + b.byGroup.large_cap + b.byGroup.altcoin + Number(amount) / 1_000_000)
  const target = b.target.btc + b.target.large_cap + b.target.altcoin
  if (after <= target + 0.5) return null
  return `After this buy, crypto would be about ${Math.round(after)}% of your liquid assets, above the ${Math.round(target)}% MoonSafe target for your age. Your call.`
}
