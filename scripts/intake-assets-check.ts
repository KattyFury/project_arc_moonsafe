// Intake form, assets step (2026-10-30): one "Stablecoin onchain" and one "Crypto" field. Checks that what the form saves is
// counted where it belongs (the Crypto bucket, the app wallet) and is never called BTC. No model, no network: `bun scripts/intake-assets-check.ts`.

import { EMPTY_FORM, formToItems } from '../src/lib/intakeForm'
import { applyOps, appWalletHolding, walletMoveOps } from '../src/lib/profile'
import { computeBalance } from '../src/lib/allocation'
import { EMPTY_PROFILE } from '../src/types'

let bad = 0
const expect = (ok: boolean, what: string) => { if (!ok) { bad++; console.log('FAIL', what) } }

const items = formToItems({ ...EMPTY_FORM, age: '30', bank: '1000', usdcThis: '500', crypto: '2000', gold: '300', stocks: '700' }, null)
let p = { ...EMPTY_PROFILE, holdings: [] as typeof EMPTY_PROFILE.holdings }
p = applyOps(p, items.flatMap(i => i.ops))
const crypto = p.holdings.find(h => h.name === 'Crypto')
expect(crypto?.type === 'crypto' && crypto.value === 2000, 'the Crypto field saves one crypto holding of 2,000')
expect(appWalletHolding(p)?.name === 'Stablecoin onchain' && appWalletHolding(p)?.value === 500, 'Stablecoin onchain is the app-wallet holding the app updates')
expect(!p.holdings.some(h => h.type === 'btc' || h.type === 'altcoin'), 'no Bitcoin or Altcoins holding is made from the Crypto total')

const b = computeBalance({ profile: p, walletUsd: 500, vaultUsd: 0, cirBtcUsd: 0, prices: null, vndPerUsd: null })
const cryptoNow = b.byGroup.btc + b.byGroup.large_cap + b.byGroup.altcoin
expect(Math.abs(cryptoNow - 2000) < 0.01, `the Crypto bucket holds the 2,000 (got ${cryptoNow})`)
expect(Math.abs(b.byGroup.traditional - 1000) < 0.01, `gold and stocks are Traditional (got ${b.byGroup.traditional})`)
expect(Math.abs(b.liquid - 4500) < 0.01, `liquid counts every field once (got ${b.liquid})`)

const after = applyOps(p, walletMoveOps(p, -200))
expect(appWalletHolding(after)?.value === 300, 'a 200 deposit from the app wallet lowers Stablecoin onchain to 300 (not counted twice)')

console.log(bad ? `${bad} FAILED` : 'intake assets OK')
if (bad) process.exit(1)
