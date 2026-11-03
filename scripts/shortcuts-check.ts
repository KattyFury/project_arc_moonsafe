// The shortcuts above the message box (Hieu, 2026-11-03): what they save obeys docs/CORE.md. No model, no network.
import assert from 'node:assert/strict'
import { groupOf } from '../src/lib/allocation'
import { applyOps, normalizeProfile } from '../src/lib/profile'
import {
  ASSET_CHOICES, SPLIT_CHOICES, addHoldingOp, addLineOp, btcPart, editHoldingOp, editLineOp, editableHoldings, monthLines, partOf, removeLineOp, shortcutsFor, splitAmount, splitOp, type Part,
} from '../src/lib/shortcuts'
import type { Holding } from '../src/types'

// Before investing opens, nothing about splitting; no fund button without a vault.
const ids = (unlocked: boolean, hasVault: boolean) => shortcutsFor({ unlocked, hasVault }).map(c => c.id)
assert.deepEqual(ids(false, true), ['fund', 'month', 'hold'])
assert.deepEqual(ids(false, false), ['month', 'hold'])
assert.deepEqual(ids(true, true), ['add', 'safe', 'traditional', 'crypto', 'split'])

// The Crypto cap: no choice above 50%, even if asked.
assert.ok(SPLIT_CHOICES.length > 1 && SPLIT_CHOICES.every(c => c <= 50))
assert.equal((splitOp(70) as { fields: { cryptoSplit: number } }).fields.cryptoSplit, 50)

// Everything added lands in the part the user tapped; Safety holds only low-volatility forms.
const base = normalizeProfile({ v: 2, age: 30 })
for (const part of ['safe', 'traditional', 'crypto'] as Part[]) {
  for (const choice of ASSET_CHOICES[part]) {
    const p = applyOps(base, [addHoldingOp(choice, 100, 'X')])
    const h = p.holdings[0]
    assert.equal(partOf(h), part, `${choice.label} belongs in ${part}`)
    assert.equal(h.value, 100)
    assert.equal(editableHoldings(p, part).length, 1)
    assert.equal(normalizeProfile(JSON.parse(JSON.stringify(p))).holdings[0].category, h.category, `${choice.label} survives a save`)
  }
}
assert.ok(ASSET_CHOICES.safe.every(c => !/gold|btc|top10|altcoin|stock/.test(c.type)))
assert.equal(groupOf(applyOps(base, [addHoldingOp(ASSET_CHOICES.safe.find(c => c.type === 'savings')!, 100)]).holdings[0]), 'safe')

// Coins stay a count; a declared value stays in its currency; cirBTC is read onchain, never edited here.
const coin: Holding = { id: 'c', type: 'eth', name: 'ETH', quantity: 2, unit: 'coins', priceSource: 'market', rebalanceable: true, updatedAt: 0 }
const vnd: Holding = { id: 'v', type: 'term_deposit', name: 'Sổ', value: 150_000_000, currency: 'VND', priceSource: 'self', rebalanceable: true, updatedAt: 0 } // lang-ok
const cir: Holding = { id: 'b', type: 'btc', name: 'cirBTC (bought in MoonSafe)', symbol: 'cirBTC', value: 5, currency: 'USDC', priceSource: 'self', rebalanceable: true, updatedAt: 0 }
const held = normalizeProfile({ v: 2, age: 30, holdings: [coin, vnd, cir] })
assert.equal(applyOps(held, [editHoldingOp(held.holdings[0], 3)]).holdings[0].quantity, 3)
const edited = applyOps(held, [editHoldingOp(held.holdings[1], 100_000_000)]).holdings[1]
assert.equal(edited.value, 100_000_000)
assert.equal(edited.currency, 'VND')
assert.ok(!editableHoldings(held, 'all').some(h => h.symbol === 'cirBTC'))

// The month: edits keep the line, a debt keeps its rate, removing clears it.
let month = applyOps(normalizeProfile({ v: 2, age: 30, debts: [{ id: 'd', name: 'Card', type: 'credit_card', balance: 1000, currency: 'USDC', ratePct: 24, monthlyPayment: 50 }] }), [addLineOp('income', 'Work', 3000), addLineOp('expense', '', 1500)])
assert.deepEqual(monthLines(month).map(l => l.kind), ['income', 'expense', 'debt'])
assert.equal(month.expenses[0].name, 'Spending')
const debt = monthLines(month)[2]
month = applyOps(month, [editLineOp(debt, 400)])
assert.equal(month.debts[0].balance, 400)
assert.equal(month.debts[0].ratePct, 24)
month = applyOps(month, [editLineOp(monthLines(month)[0], 3500)])
assert.equal(month.incomes.length, 1)
assert.equal(month.incomes[0].monthly, 3500)
assert.equal(applyOps(month, [removeLineOp(monthLines(month)[2])]).debts.length, 0)

assert.equal(btcPart(325), 227.5)
assert.equal(btcPart(10000), 7000)
// $1,000 at 35: the three add back to the amount.
const s = splitAmount(1000, { safe: 35, traditional: 32.5, crypto: 32.5 })
assert.deepEqual(s, { safe: 350, traditional: 325, crypto: 325 })
const odd = splitAmount(100.01, { safe: 31, traditional: 34.5, crypto: 34.5 })
assert.ok(Math.abs(odd.safe + odd.traditional + odd.crypto - 100.01) < 0.001)
console.log('shortcuts checks passed')
