// Investment cap by age, on money outside the fund (spendable wallet USDC + cirBTC held).
// Normal = 110 − age %, Risky = 120 − age %. Shared by the Đầu tư screen and the chat cards.

import { GAS_RESERVE_USDC6 } from '@/hooks/useVault'

export type Risk = 'normal' | 'risky'

/** room = how much more cirBTC may be bought (6-dec USDC), null while balances are unknown. */
export function investRoom(age: number, risk: Risk, wallet: bigint | null, invested: bigint | null): { capPct: number; spendable: bigint | null; room: bigint | null } {
  const capPct = Math.max(0, Math.min(100, (risk === 'normal' ? 110 : 120) - age))
  const spendable = wallet !== null ? (wallet > GAS_RESERVE_USDC6 ? wallet - GAS_RESERVE_USDC6 : 0n) : null
  if (spendable === null || invested === null) return { capPct, spendable, room: null }
  const r = ((spendable + invested) * BigInt(capPct)) / 100n - invested
  return { capPct, spendable, room: r <= 0n ? 0n : r > spendable ? spendable : r }
}
