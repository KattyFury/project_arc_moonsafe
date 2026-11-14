# MoonSafe — notes for agents

Read first: [`docs/CORE.md`](docs/CORE.md) (the rules, settled 2026-11-01), then [`HANDOFF.md`](HANDOFF.md). Working rules for Claude are in [`CLAUDE.md`](CLAUDE.md).

## Live

- https://test.moonsafe.app = the current app, a **test** version on Arc **mainnet** (chain 5042). Cloudflare Pages project `moonsafe`, direct upload (a push does NOT deploy). moonsafe.app + www 302-redirect to test.moonsafe.app (CF Redirect Rule on zone moonsafe.app) until a main version exists.
- Deploy: `VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A bun run cf:deploy` (with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`); `scripts/check-deploy-env.mjs` refuses a build that points at the wrong network. After deploy: page 200, unauthenticated `POST /api/chat` 401, bundle contains `A9A5447a`.
- Contracts, the Safe owner and the testnet history: see `README.md` and `HANDOFF.md`.

## Environment

| Variable | Where | What |
|---|---|---|
| `VITE_PRIVY_APP_ID` | build | Privy app |
| `VITE_NETWORK`, `VITE_FACTORY_ADDRESS` | build | `mainnet` and the mainnet factory |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Pages secrets | advisor model (OpenAI) and fallback (Claude Haiku) |
| `USERDATA`, `DB` | Pages bindings | KV (profile + chat per user) and D1 `moonsafe-ledger` (usage) |

Secrets live in `D:\Files\Claude\.secrets\keys.env` on Hieu's machines, never in the repo.

## Code map

- Balance maths (the part furthest ahead sets the size): `src/lib/allocation.ts` (`bucketStanding`)
- Plan and fixed replies (no model): `functions/_lib/plan.ts`; first questions: `functions/_lib/intake.ts`
- Agent (planner tools, guards, reply): `functions/api/chat.ts`
- Record box ("I keep 500 USDC as Safety"): `src/lib/record.ts`
- Finance framework as data: `src/kb/moonsafe-kb.json` (check with `bun scripts/kb-check.ts`)

## Checks before a deploy

`npm run check:all`, `npm run test:agent`, `bunx tsc --noEmit -p scripts/tsconfig.chat.json`, `node scripts/check-lang.mjs` ("English only"). Live model runs: `bun scripts/claude-reeval.ts --live --budget N --run <name> --only <case ids>` (cases in `scripts/*-cases.ts`), only with a token budget Hieu approved.
