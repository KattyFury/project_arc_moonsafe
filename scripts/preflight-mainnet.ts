// Read-only checks to run AFTER deploying the contracts and BEFORE pointing moonsafe.app at mainnet. Sends nothing, needs no key.
//
//   FACTORY=0x... SAFE=0x... bun scripts/preflight-mainnet.ts
//
// Optional: FEE_RECIPIENT (default 0xeb2d...52F6), SAFE_OWNERS (comma list, default the two wallets named on 2026-10-28), SAFE_THRESHOLD (2),
// ARC_RPC (default https://rpc.mainnet.arc.io), EXPECT_CHAIN (default 5042). Exit code 1 when any check FAILS.

import { createPublicClient, getAddress, http, parseAbi, zeroAddress, type Address } from 'viem'

const RPC = process.env.ARC_RPC || 'https://rpc.mainnet.arc.io'
const EXPECT_CHAIN = Number(process.env.EXPECT_CHAIN || 5042)
const FACTORY = process.env.FACTORY ? getAddress(process.env.FACTORY) : null
const SAFE = process.env.SAFE ? getAddress(process.env.SAFE) : null
const FEE_RECIPIENT = getAddress(process.env.FEE_RECIPIENT || '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6')
const OWNERS = (process.env.SAFE_OWNERS || '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6,0xb0A842fC50cA2F013adB506EcB425476C605c071').split(',').map(a => getAddress(a.trim()))
const THRESHOLD = BigInt(process.env.SAFE_THRESHOLD || '2')
const USDC: Address = '0x3600000000000000000000000000000000000000'
const CIRBTC: Address = '0x171A4217b86A807A64eB94757Db6849fb4bDbAA0'

const client = createPublicClient({ transport: http(RPC) })
const factoryAbi = parseAbi([
  'function owner() view returns (address)', 'function pendingOwner() view returns (address)', 'function feeRecipient() view returns (address)',
  'function fee() view returns (uint256)', 'function implementation() view returns (address)', 'function creationPaused() view returns (bool)',
  'function accruedFees() view returns (uint256)',
])
const safeAbi = parseAbi(['function getOwners() view returns (address[])', 'function getThreshold() view returns (uint256)'])
const erc20Abi = parseAbi(['function decimals() view returns (uint8)'])
const vaultAbi = parseAbi(['function initialize(address owner_)'])

let failed = 0
let skipped = 0
const row = (ok: boolean | null, name: string, detail = '') => {
  if (ok === false) failed++
  if (ok === null) skipped++
  console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
}
async function safeRead<T>(f: () => Promise<T>): Promise<T | undefined> { try { return await f() } catch { return undefined } }
const hasCode = async (a: Address) => ((await client.getCode({ address: a })) ?? '0x') !== '0x'

async function main() {
  const chain = await client.getChainId()
  row(chain === EXPECT_CHAIN, 'chain id', `${chain} (expected ${EXPECT_CHAIN})`)
  row(await hasCode(USDC), 'USDC contract has code', USDC)
  const ud = await safeRead(() => client.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' }))
  row(ud === 6, 'USDC decimals (ERC-20 view)', String(ud))
  const bd = await safeRead(() => client.readContract({ address: CIRBTC, abi: erc20Abi, functionName: 'decimals' }))
  row(bd === 8, 'cirBTC decimals', `${bd} at ${CIRBTC}`)

  if (!SAFE) row(null, 'Safe multisig', 'set SAFE=0x...')
  else {
    row(await hasCode(SAFE), 'Safe has code', SAFE)
    const owners = await safeRead(() => client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getOwners' }))
    const th = await safeRead(() => client.readContract({ address: SAFE, abi: safeAbi, functionName: 'getThreshold' }))
    row(!!owners && owners.length === OWNERS.length && OWNERS.every(o => owners.includes(o)), 'Safe owners are exactly the expected wallets', owners?.join(', '))
    row(th === THRESHOLD, 'Safe threshold', `${th} (expected ${THRESHOLD})`)
  }

  if (!FACTORY) { row(null, 'VaultFactory', 'set FACTORY=0x...'); return }
  row(await hasCode(FACTORY), 'VaultFactory has code', FACTORY)
  const owner = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'owner' }))
  row(!!SAFE && owner === SAFE, 'factory owner is the Safe', String(owner))
  const pending = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'pendingOwner' }))
  row(pending === undefined ? null : pending === zeroAddress, 'no pending ownership transfer', String(pending))
  const rec = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'feeRecipient' }))
  row(rec === FEE_RECIPIENT, 'fee recipient', String(rec))
  const fee = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'fee' }))
  row(fee !== undefined && fee <= 10n * 10n ** 18n, 'fee is within the 10 USDC cap', fee === undefined ? 'unreadable' : `${Number(fee) / 1e18} USDC`)
  const paused = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'creationPaused' }))
  row(paused === undefined ? null : paused === false, 'creation is not paused', String(paused))
  const impl = await safeRead(() => client.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'implementation' }))
  row(!!impl && (await hasCode(impl)), 'vault implementation has code', String(impl))
  if (impl) {
    // The implementation must be locked: initializing it has to revert.
    const locked = await safeRead(async () => { await client.simulateContract({ address: impl, abi: vaultAbi, functionName: 'initialize', args: ['0x000000000000000000000000000000000000dEaD'] }); return false })
    row(locked === undefined, 'implementation is locked (initialize reverts)')
  }
}
main().then(() => { console.log(failed ? `\n${failed} check(s) FAILED: do not point the app at this deployment.` : skipped ? `\nNo check failed, but ${skipped} were skipped: run again with FACTORY and SAFE set before going live.` : '\nAll checks passed.'); process.exit(failed ? 1 : 0) })
  .catch(e => { console.error('preflight error:', e instanceof Error ? e.message : e); process.exit(1) })
