// Buying cirBTC is the user's call (no cap since 2026-10-24); the app only warns when a buy
// pushes the invest share above the target by age. Shared by the Đầu tư screen and the chat cards.

import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'
import type { Allocation } from '@/lib/allocation'

/** Wallet USDC that can be spent, keeping the gas reserve; null while unknown. */
export function spendable(wallet: bigint | null): bigint | null {
  return wallet === null ? null : wallet > GAS_RESERVE_USDC6 ? wallet - GAS_RESERVE_USDC6 : 0n
}

/** Warning text if buying `amount` (6-dec USDC, moved from idle to invest) ends above the target; null otherwise. */
export function overTargetWarning(alloc: Allocation, amount: bigint): string | null {
  if (!alloc.target || alloc.total <= 0) return null
  const after = ((alloc.invest + Number(amount) / 1_000_000) / alloc.total) * 100
  if (after <= alloc.target.investPct + 0.5) return null
  return `Sau khi mua, đầu tư chiếm khoảng ${Math.round(after)}% tiền ngoài quỹ, cao hơn mục tiêu ${alloc.target.investPct}% theo tuổi. Quyết định là của bạn.`
}
