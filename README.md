# MoonSafe

**Your personal finance agent for Web3.** An AI advisor that helps crypto users build an emergency fund in their own USDC vault on Arc, then split the rest of their money sensibly, before they invest.

Live on Arc mainnet: **https://moonsafe.app**

## The problem

Most Web3 users hold nearly everything in volatile assets and keep no cash buffer. One bad month (a lost job, a medical bill, a market crash) forces them to sell at the bottom. Basic personal finance (an emergency fund first, then a split that fits your age) rarely reaches crypto-native people, and no wallet helps them do it.

## What MoonSafe does

1. **Talk to the advisor.** In a short chat it learns your income, spending, savings, debts and holdings, and explains each idea in plain words.
2. **Get a plan.** It sizes your emergency fund (3 to 12 months of spending, depending on how stable your income is and who depends on you) and suggests how to split the rest by age: Safety, Traditional (index funds, gold) and Crypto (mostly BTC).
3. **Fund your vault.** The emergency fund sits in your own vault contract on Arc. Only your wallet can withdraw, and the app always sends withdrawals back to that wallet.
4. **Invest when you are ready.** Buy cirBTC in the app through Circle App Kit. The advisor warns you if your fund is not full yet or you carry expensive debt.

You sign every transaction yourself. The AI never moves money.

## Why Arc

USDC is the native gas token, so the vault holds plain USDC and users never need another token. Fees are small and predictable, finality is sub-second, and cirBTC is native on Arc.

## Contracts (Arc mainnet, chain 5042)

| Contract | Address |
|---|---|
| VaultFactory | [`0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A`](https://explorer.arc.io/address/0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A) |
| VaultProxy (implementation) | [`0xd139b06b1bb5303a4fbA25E2B2297Cf1515cAACE`](https://explorer.arc.io/address/0xd139b06b1bb5303a4fbA25E2B2297Cf1515cAACE) |
| Owner: Safe 2-of-2 | [`0xC4c428c635913e5937BA0DA6E060E495f5a664b9`](https://explorer.arc.io/address/0xC4c428c635913e5937BA0DA6E060E495f5a664b9) |

Example transaction (opening a vault): [`0xd46987c299d807db1456d1034d2ba438d93cf25c85cec37fce081e7133515bc3`](https://explorer.arc.io/tx/0xd46987c299d807db1456d1034d2ba438d93cf25c85cec37fce081e7133515bc3)

Both contracts are verified on Sourcify (exact match). Each user gets one minimal-proxy vault. Vaults are not upgradeable and have a single permanent owner. Opening a vault costs 1 USDC. The factory owner can only change the fee or pause new vaults; it can never touch vault funds.

## Tech stack

- **Contracts:** Solidity, Foundry, OpenZeppelin (Clones, Ownable2Step, ReentrancyGuard). 322 tests, including fuzz and invariant tests.
- **App:** React, Vite, Tailwind, wagmi and viem, Privy (email, Google or wallet login, embedded wallets).
- **Swap:** Circle App Kit (USDC to cirBTC on Arc).
- **Backend:** Cloudflare Pages Functions and KV. The AI advisor runs on OpenAI gpt-5.4-mini with Claude Haiku as fallback; the plan figures are computed in code, not by the model.

## Run it

```bash
bun install
bun run dev          # app (testnet by default)
forge test           # contracts
```

Production build: `VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=<factory> bun run cf:deploy`.

## Repo map

- `contracts/`: VaultFactory, VaultProxy, tests, deploy script (DCA contracts are written and tested but not deployed)
- `src/`: the app; `src/kb/`: the finance framework as data
- `functions/`: API for chat, user data, prices, admin
- `scripts/`: mainnet preflight, Safe setup, checks
- `docs/`: framework spec, vault recovery design; `docs/archive/`: older plans and audits
