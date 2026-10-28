// Prepares the Safe multisig that will own the MoonSafe factory on Arc mainnet. It sends NOTHING and holds no key.
//
//   bun scripts/safe-plan.ts                  prints the transaction to send (to / data) and the Safe address it will create
//   bun scripts/safe-plan.ts --check 0xSAFE   after you sent it: reads the Safe back and confirms owners and threshold
//
// Environment (all optional): SAFE_OWNERS (comma separated; default the two wallets Hieu named on 2026-10-28), SAFE_THRESHOLD
// (default 2), SAFE_SALT (default 0), ARC_RPC (default https://rpc.mainnet.arc.io).
// The Safe contracts are the official 1.4.1 deployments that exist on Arc (addresses from @safe-global/safe-deployments, and
// confirmed to have code on Arc mainnet on 2026-10-28). You send the printed transaction from ONE of the owner wallets, with a
// hardware wallet or a keystore. Reading from the chain here is the only network use.

import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, getCreate2Address, http, keccak256, parseAbi, concat, zeroAddress, type Address, type Hex } from 'viem'

const RPC = process.env.ARC_RPC || 'https://rpc.mainnet.arc.io'
const OWNERS = (process.env.SAFE_OWNERS || '0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6,0xb0A842fC50cA2F013adB506EcB425476C605c071').split(',').map(a => getAddress(a.trim()))
const THRESHOLD = BigInt(process.env.SAFE_THRESHOLD || '2')
const SALT = BigInt(process.env.SAFE_SALT || '0')

const SAFE_L2_SINGLETON: Address = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'
const PROXY_FACTORY: Address = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'
const FALLBACK_HANDLER: Address = '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99'

const factoryAbi = parseAbi([
  'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address proxy)',
  'function proxyCreationCode() view returns (bytes)',
])
const safeAbi = parseAbi([
  'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function VERSION() view returns (string)',
])

const client = createPublicClient({ transport: http(RPC) })
const out = (s = '') => console.log(s)

async function check(safe: Address) {
  const [owners, threshold, version] = await Promise.all([
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }),
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }),
    client.readContract({ address: safe, abi: safeAbi, functionName: 'VERSION' }),
  ])
  out(`Safe ${safe} (version ${version})`); out(`Owners (${owners.length}): ${owners.join(', ')}`); out(`Threshold: ${threshold}`)
  const same = owners.length === OWNERS.length && OWNERS.every(o => owners.some(x => x.toLowerCase() === o.toLowerCase())) && threshold === THRESHOLD
  out(same ? 'OK: owners and threshold match the plan.' : 'MISMATCH: do not use this Safe as the factory owner.')
  if (!same) process.exit(1)
}

async function plan() {
  if (OWNERS.length < 2 || THRESHOLD < 2n || THRESHOLD > BigInt(OWNERS.length) || new Set(OWNERS.map(o => o.toLowerCase())).size !== OWNERS.length) {
    throw new Error('Need at least 2 distinct owners and a threshold between 2 and the number of owners')
  }
  const initializer = encodeFunctionData({ abi: safeAbi, functionName: 'setup', args: [OWNERS, THRESHOLD, zeroAddress, '0x', FALLBACK_HANDLER, zeroAddress, 0n, zeroAddress] })
  const data = encodeFunctionData({ abi: factoryAbi, functionName: 'createProxyWithNonce', args: [SAFE_L2_SINGLETON, initializer, SALT] })
  // The address the factory will give the Safe: CREATE2 over the proxy creation code + the singleton.
  const creation = await client.readContract({ address: PROXY_FACTORY, abi: factoryAbi, functionName: 'proxyCreationCode' }) as Hex
  const salt = keccak256(concat([keccak256(initializer), encodeAbiParameters([{ type: 'uint256' }], [SALT])]))
  const predicted = getCreate2Address({ from: PROXY_FACTORY, salt, bytecodeHash: keccak256(concat([creation, encodeAbiParameters([{ type: 'uint256' }], [BigInt(SAFE_L2_SINGLETON)])])) })
  const code = await client.getCode({ address: predicted })
  out('Safe multisig plan (Arc mainnet, chain 5042)'); out()
  out(`Owners:    ${OWNERS.join('\n           ')}`)
  out(`Threshold: ${THRESHOLD} of ${OWNERS.length}`)
  out(`Will be created at: ${predicted}${code && code !== '0x' ? '   <-- ALREADY EXISTS: change SAFE_SALT' : ''}`); out()
  out('Send this transaction from one owner wallet (value 0):')
  out(`  to:   ${PROXY_FACTORY}`); out(`  data: ${data}`); out()
  out('Then confirm:  bun scripts/safe-plan.ts --check ' + predicted)
  out('Both owner wallets must be able to sign for as long as the Safe is the owner (2 of 2). Add a third owner later if you want a spare.')
}

const arg = process.argv.indexOf('--check')
if (arg > 0) await check(getAddress(process.argv[arg + 1])); else await plan()
