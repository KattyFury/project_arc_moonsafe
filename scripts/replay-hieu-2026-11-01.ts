// Hieu's chat of 2026-11-01 ("who said my safety is 20$"): age 20, $2 a month steady, $1 spending, airdrops, $10 in the bank,
// $10 of stablecoins, $10 of gold, $10.94 of cirBTC onchain. Prints the plan with the fund empty, then with the fund full.
// Run: bun scripts/replay-hieu-2026-11-01.ts

import { computeBalance } from '../src/lib/allocation'
import { normalizeProfile } from '../src/lib/profile'
import { buildPlan, buildAfterSign } from '../functions/_lib/plan'

const H = (o: Record<string, unknown>) => ({ priceSource: 'self', rebalanceable: true, updatedAt: 1, currency: 'USDC', ...o })
const p = normalizeProfile({ v: 2, age: 20, incomeStable: true, dependents: 0, debtsComplete: true, noNearGoal: true, hasWindfalls: true, cryptoSplit: 50,
  incomes: [{ id: 'i', name: 'Pay', monthly: 2, currency: 'USDC', kind: 'active', updatedAt: 1 }],
  expenses: [{ id: 'e', name: 'Spending', monthly: 1, currency: 'USDC', kind: 'variable', updatedAt: 1 }],
  holdings: [H({ id: 'b', type: 'savings', name: 'Bank', value: 10 }), H({ id: 's', type: 'stable_wallet', name: 'Stablecoins', value: 10 }), H({ id: 'g', type: 'gold_physical', name: 'Gold', value: 10 })] })
const bal = (vault: number) => computeBalance({ profile: p, walletUsd: 37, vaultUsd: vault, cirBtcUsd: 10.94, prices: { goldUsdPerOz: null, usd: {} }, vndPerUsd: 25000 })

console.log('--- fund empty ---\n' + buildPlan({ p, b: bal(0), shares: [20, 40, 40], cover: 3, vi: false }))
console.log('\n--- after signing the 3 USDC deposit ---\n' + buildAfterSign({ b: bal(3), vi: false, kind: 'deposit' }))
