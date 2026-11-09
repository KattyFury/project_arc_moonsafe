// Deploy the V2 environment: Cloudflare Pages project moonsafe-v2 at v2.moonsafe.app (noindex, not linked).
// Pages can't take a custom config path, so this builds a throwaway folder with wrangler.v2.toml as its
// wrangler.toml. moonsafe.app and its KV/D1 are never touched.
//   node scripts/deploy-v2.mjs             build + deploy
//   node scripts/deploy-v2.mjs --migrate   also apply D1 migrations to moonsafe-ledger-v2
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Set V2_FACTORY once the V2 factory is deployed.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const OUT = '.v2-deploy'
const V1_FACTORY = '0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A'
const factory = process.env.V2_FACTORY || V1_FACTORY

for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
  if (!process.env[name]) throw new Error(`${name} is not set`)
}
if (!process.env.V2_FACTORY) console.log('V2_FACTORY not set: the app build still points at the V1 factory.')

const env = { ...process.env, VITE_NETWORK: 'mainnet', VITE_FACTORY_ADDRESS: factory }
delete env.VITE_PRIVY_APP_ID
delete env.VITE_CIRBTC_ADDRESS

execSync('bun run build', { stdio: 'inherit', env })

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT)
for (const dir of ['dist', 'functions', 'src', 'migrations']) fs.cpSync(dir, path.join(OUT, dir), { recursive: true })
fs.copyFileSync('wrangler.v2.toml', path.join(OUT, 'wrangler.toml'))
fs.cpSync('v2/passkey-test', path.join(OUT, 'dist/passkey-test'), { recursive: true })
fs.appendFileSync(path.join(OUT, 'dist/_headers'), '\n/*\n  X-Robots-Tag: noindex, nofollow\n')
fs.writeFileSync(path.join(OUT, 'dist/robots.txt'), 'User-agent: *\nDisallow: /\n')

const run = cmd => execSync(cmd, { stdio: 'inherit', env, cwd: OUT })
if (process.argv.includes('--migrate')) run('bunx wrangler d1 migrations apply moonsafe-ledger-v2 --remote')
run('bunx wrangler pages deploy dist --project-name moonsafe-v2 --branch main --commit-dirty=true')
fs.rmSync(OUT, { recursive: true, force: true })
