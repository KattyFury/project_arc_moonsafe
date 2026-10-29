# Mainnet launch, step by step (for Claude Code and Hieu)

Scope decided on 2026-10-29: hackathon, friends only, small amounts. Review level: Arc Studio internal max-severity review + 154 Vault tests + Slither (no external audit). DCA stays OFF (`DCA_AVAILABLE=false`; no keeper or screens yet): do NOT deploy `DcaPlan`/`DcaFactory` today. Arc Studio never signs or sends anything on mainnet; every step below is run by you with your own wallets.

Read first: `HANDOFF.md`, `docs/mainnet-plan-2026-10-29.md`, `docs/audit-2026-10-27.md`. Tools: Foundry (`forge`, `cast`), bun, a hardware wallet or a keystore (`cast wallet import deployer --interactive`). Never put a private key in a command line or in `.env`.

## 1. Create the Safe (owner of the factory)
```
bun scripts/safe-plan.ts                       # prints `to` and `data` and the Safe address it will create
# send that one transaction (value 0) from one of the two owner wallets, e.g.:
cast send <TO> <DATA> --rpc-url https://rpc.mainnet.arc.io --account deployer
bun scripts/safe-plan.ts --check <SAFE_ADDRESS>   # must show both owners and threshold 2
```
Expected Safe address (default salt): `0xC4c428c635913e5937BA0DA6E060E495f5a664b9`. If you change owners, threshold or `SAFE_SALT`, the address changes: use what the script prints.

## 2. Deploy the vault contracts
```
export FACTORY_OWNER=<SAFE_ADDRESS> FEE_RECIPIENT=0xeb2d222d28f35fe7beb5387f8bc4ebf65f2652f6 VAULT_FEE=1000000000000000000   # 1 USDC; use e.g. 100000000000000000 for 0.1 USDC
DRY_RUN=1 forge script contracts/script/DeployMainnet.s.sol                       # local simulation, sends nothing
forge script contracts/script/DeployMainnet.s.sol --rpc-url https://rpc.mainnet.arc.io --account deployer --broadcast
```
The script refuses any chain other than 5042 and re-checks owner, fee and implementation after deploying. Note both printed addresses (implementation, factory). The deployer wallet needs a little mainnet USDC for gas. Verify both contracts on explorer.arc.io (see the Arc docs for contract verification).

## 3. Cloudflare and Privy
1. New KV namespace for mainnet users: `bunx wrangler kv namespace create USERDATA_MAINNET`, then put its id in `wrangler.toml` (`[[kv_namespaces]]` `id`). Keep the old id written down: it is the rollback.
2. Privy dashboard: the `moonsafe.app` origin must already be allowed (it is, for testnet). Nothing else to add.
3. Build and deploy with ONLY the Cloudflare variables plus the two network variables (do not source the whole `.env`):
```
env VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=<FACTORY_ADDRESS> CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... bun run cf:deploy
```
After this moonsafe.app is mainnet. Everyone's testnet data stays in the old KV; mainnet starts clean.

## 4. Smoke test with 1 to 2 USDC (you, in the browser)
Log in with email, open a vault (pays the fee), deposit 1 USDC, withdraw it, ask the agent for a plan, ask for a tiny cirBTC buy and compare the quote with the real BTC price (it must be close). Open `/admin`, sign in with an admin wallet, check Overview and the AI keys test. If anything looks wrong: Settings, "Pause transactions".

## 5. Before inviting friends
- Tell them: experimental, real USDC, keep amounts small (suggest 20 USDC or less), vault withdrawals always go back to their own wallet.
- Hand ownership to the Safe is already done at deploy (FACTORY_OWNER). Test one `setCreationPaused(true/false)` from the Safe later if you have time.

## Rollback
Cloudflare Pages, Deployments, "Rollback" to the last testnet deployment, and restore the previous KV `id` in `wrangler.toml`. Vault contracts cannot be undone; pause new vaults with `setCreationPaused(true)` from the Safe.
