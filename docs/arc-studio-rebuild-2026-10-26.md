# Arc Studio rebuild — 2026-10-26 (footprint)

> Arc Studio rebuilt MoonSafe from scratch from the 3-part spec (Desktop `MoonSafe-SPEC-ArcStudio-2026-10-26-part1..3.md`). The rebuild was NOT merged as a whole; only these parts were taken into this repo: Privy sign-in check on `/api/chat` (`functions/_lib/privyAuth.ts`), `wrangler.toml` + `build` / `cf:deploy` scripts, the hardened `VaultProxy` / `VaultFactory` (fee cap 10 USDC, ReentrancyGuard, renounce disabled, direct transfers rejected, implementation locked) with its 86 Foundry tests. Below is Arc Studio's plan, kept as written.

---

## Implementation Plan: MoonSafe (replaces the earlier Arc Finance Coach plan)

Based on the 3-part spec. The earlier plan (browser wallet, rule-based chat, Vietnamese UI) is fully replaced.

### Summary
MoonSafe is an onchain personal finance app for Web3 users on Arc Testnet (chain 5042002). A chat agent learns your money (income, spending, debts, every asset), keeps a USDC emergency fund in your own vault contract, shows your balance sheet, and unlocks in-app cirBTC buying only once the fund reaches its floor and no priority debt remains. The agent never moves money: every transaction is signed by the user. UI is English only. The agent replies in the language the user writes (English or Vietnamese).

### External inputs needed from you
- `VITE_PRIVY_APP_ID`: Privy App ID (public). Add this session's preview hostname to Privy allowed origins.
- `OPENAI_API_KEY`: secret for the agent (gpt-4o-mini), server-side only. You paste it into `.env` yourself.
- Cloudflare Pages deploy (wrangler, KV) is done by you outside Arc Studio. Code and config are prepared for it.

### Architecture
- Chain: Arc Testnet. USDC is gas. 6/18 decimal conversion only via `@/onchain-money`; chain and USDC facts from `@/onchain-facts`.
- Contracts (Solidity ^0.8.20, Foundry, OpenZeppelin):
  - `VaultProxy`: per-user minimal clone. `initialize(owner)` once, `deposit()` owner only, `depositFor()` anyone, `withdraw(amount, to)` owner only + nonReentrant, `getBalance`, `owner`, `meetsMinimum`. No admin, no upgrade.
  - `VaultFactory` (Ownable): immutable `implementation`, `feeRecipient`, `fee` (default 1e18 = 1 USDC native). `createVault()` payable: requires fee, one vault per wallet, forwards fee, clones + initializes, emits `VaultCreated`, refunds excess. Views: `getVault`, `hasVault`, `vaultMeetsMinimum`.
  - Deploy order: `VaultProxy`, then `VaultFactory(implementation, feeRecipient, fee, owner)`. Factory address goes to `VITE_FACTORY_ADDRESS`. Default owner and feeRecipient: the platform deployer wallet (testnet).
  - The app always sends exactly the `fee()` it just read. Consider a cap on `setFee`.
- Login/wallet: Privy (`@privy-io/react-auth` 2.x + `@privy-io/wagmi` 1.0.6). Wallet preference: chosen wallet > external wallet > Privy embedded. Ask the wallet for its real chain and switch to Arc before every transaction.
- Server (`functions/api/*.ts`, Cloudflare Pages Functions shape): `/api/chat`, `/api/prices`, `/api/rates`, `/api/userdata`. A local Bun dev server runs the same handlers in the sandbox, Vite proxies `/api`, KV is simulated with a local file. `wrangler.toml` for Cloudflare.
  - Prices: BTC Coinbase first, CoinGecko fallback; gold/US stocks/coins cached 10 min. FX from open.er-api.com cached 24h, last cached rate on failure, never a guess.
  - User data: localStorage as fast local copy, synced to KV per Privy user. Server verifies the Privy token.
- Framework library `src/framework/` (shared by app, server, tests): 6 categories, 28 asset types, split by age, fund floor, debt priority (10%/yr), buy lock, suggestion order, cash flow and Passive/Spending. `applyOps(profile, ops)` is the only way profile changes.
- Agent, two stages:
  - PLAN: tool loop (max 10 steps, `tool_choice: required`, temperature 0) ending in `no_action`. Tools: update_profile, add/set/remove_holding, move, add/update/remove_debt, set/remove_income, set/remove_expense, show_allocation, show_cashflow, prepare_deposit, prepare_withdraw, prepare_buy_cirbtc, propose_dca, stop_dca, open_screen, no_action.
  - REPLY: written from actions taken, server-computed figures, matching situations, next collection question. A checker rewrites up to 3 times on rule breaks.
  - Server guards per spec 6.4. Situation library (26 records) as JSON with a checker script; only matching ones are sent each turn.
  - Out of credit or bad key: clear error in chat, no silent retry. Token logging per stage.
- cirBTC buying: Circle App Kit / Swap Kit, keyless USDC to cirBTC (`cirBTC` on `Arc_Testnet`, 8 decimals), slippage up to 3%. Risk: confirm the pair is supported on Arc Testnet from current Circle docs before building; report to you if not.
- Design (spec overrides Arc defaults): #1E6DF7 blue, black, white; at most one gradient per screen; Apple system font; 8px spacing; radius 16; Lucide icons; no emoji. Chart colors: Safe green, Traditional blue, BTC orange, Big caps #c2389b, Low caps violet, Idle amber, grey for non-rebalanceable.
- Layout: mobile 393x852 = 5-tab row only; desktop 1440x900 = top bar + 1200px 12-col grid. Every screen fits one frame with no scroll (chat messages excepted).

### Files
1. Contracts: `contracts/VaultProxy.sol`, `contracts/VaultFactory.sol`, tests in `contracts/test/`.
2. Framework: `src/framework/{types,categories,split,floor,debt,lock,cashflow,suggestions,applyOps,facts,index}.ts`, `situations.json`, `*.test.ts`, `scripts/check-situations.ts`.
3. Server: `functions/api/{chat,prices,rates,userdata}.ts`, `functions/_lib/{plan,reply,tools,guards,checks,openai,privyAuth,kv}.ts`, `server/dev.ts`, `vite.config.ts` proxy, `wrangler.toml`.
4. Frontend: `src/config.ts`, `src/main.tsx`, `src/lib/*`, `src/state/*`, `src/screens/{Login,BeforeYouStart,VaultSetup,Chat,Fund,Balance,Invest,Menu}.tsx`, `src/components/*`.
5. Icons and manifest in `public/`; `.env`, `.gitignore`, `README.md`, `AGENTS.md`.

### Build sequence
1. Contracts: write, review, unit tests, deploy to Arc Testnet, set `VITE_FACTORY_ADDRESS`.
2. Privy + wagmi, chain switch helper, wallet preference.
3. Shared state + `/api/prices`, `/api/rates`, `/api/userdata`.
4. Login, Before you start, Vault setup.
5. Fund screen.
6. Framework library + situations + checker + tests.
7. `/api/chat` PLAN, guards, REPLY, checks, collection flow.
8. Chat UI with cards and charts.
9. Balance, Invest (lock, buy cirBTC, DCA), Menu.
10. Icons, one-frame checks at 393x852 and 1440x900, English-only check, no-secret-in-bundle check, Cloudflare config.

### Done when
- [ ] New wallet opens a vault for 1 USDC and deposits/withdraws.
- [ ] Chat from zero collects age, income, spending, stability, every asset and debt, one question at a time, and Balance fills in correctly.
- [ ] Credit-card debt locks buying; interest-free family debt does not; unknown-rate debt makes the agent ask the rate.
- [ ] Fund below floor: agent says exactly what is missing and offers the exact deposit card. At the floor with no priority debt: buying opens.
- [ ] 50% BTC is respected; 50% low caps gets the reality check once.
- [ ] Agent never moves money; every transaction needs the user's signature.
- [ ] No secret in the client bundle; every screen fits one frame; UI is English only.
- [ ] Framework tests and situation checker pass.
