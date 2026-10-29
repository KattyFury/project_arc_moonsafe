// Gate for `bun run cf:deploy`: moonsafe.app is the MAINNET app since 2026-10-29, so a production build must say so.
// Without VITE_NETWORK=mainnet the build silently becomes the testnet app; without the factory the vault screens show "not configured".
const network = process.env.VITE_NETWORK
const factory = (process.env.VITE_FACTORY_ADDRESS ?? '').trim()
const problems = []
if (network !== 'mainnet') problems.push(`VITE_NETWORK is "${network ?? ''}", expected "mainnet"`)
if (!/^0x[0-9a-fA-F]{40}$/.test(factory)) problems.push('VITE_FACTORY_ADDRESS is missing or not an address')
if (problems.length) {
  console.error(`Deploy refused: ${problems.join('; ')}.\nSee HANDOFF.md (MAINNET) for the full command.`)
  process.exit(1)
}
console.log(`Deploy env OK: mainnet, factory ${factory}`)
