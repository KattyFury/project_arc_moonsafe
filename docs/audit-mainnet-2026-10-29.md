# Post-launch audit, MoonSafe on Arc mainnet (2026-10-29)

Scope: what is live on moonsafe.app right after the mainnet launch: the two vault contracts, the Safe, the Cloudflare configuration, the public surface, the server code and the dependencies. Internal review (Arc Studio), not an independent audit; accepted for a hackathon with friends and small amounts.

## 1. Onchain (Arc mainnet, read-only checks)
| Item | Address | Result |
|---|---|---|
| VaultFactory | `0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A` | owner = the Safe, no pending transfer, fee recipient `0xEb2D...52F6`, fee 1 USDC (cap 10), creation not paused, 0 fees accrued, balance 0 |
| Vault implementation | `0xd139b06b1bb5303a4fbA25E2B2297Cf1515cAACE` | has code, locked (initialize reverts) |
| Safe | `0xC4c428c635913e5937BA0DA6E060E495f5a664b9` | owners exactly `0xEb2D...52F6` and `0xb0A8...c071`, threshold 2 |
| USDC / cirBTC | `0x3600...0000` / `0x171A...AA0` | 6 / 8 decimals |

- `scripts/preflight-mainnet.ts` ends with `All checks passed.`
- Deployed bytecode vs the repo build (`forge build`, evm cancun, optimizer 200): VaultProxy is **byte-identical**; VaultFactory differs in 80 bytes = the 20-byte `implementation` immutable in 4 places. So the deployed code is the reviewed v2 source (154 tests, max-severity review, Slither 0).
- **Not verifiable from here:** whether the source is verified on explorer.arc.io (the lookup tool cannot see it). Verify both contracts there so users can read them.

## 2. Public surface (moonsafe.app)
- Live bundle is the mainnet build (chain 5042, "real USDC and cirBTC", rpc/explorer of Arc, no testnet factory). No secret patterns in the bundle (OpenAI, Anthropic, Google, Cloudflare, GitHub, private keys). No source maps (the `.map` URL returns the HTML shell). No repo files exposed (every other path returns the HTML shell).
- API without a session: `/api/chat`, `/api/power`, `/api/userdata`, `/api/admin` all 401; `/api/status` public by design.
- **Fixed in this PR:** the site sent only `nosniff` and a referrer policy. `public/_headers` now adds `X-Frame-Options: DENY`, HSTS and a minimal Permissions-Policy. **No CSP yet** (Privy, WalletConnect and the RPCs need a long allowlist; try it in Report-Only first).

## 3. Cloudflare configuration
- Production KV binding is `4dca45d1...` (the mainnet store) and preview is the old testnet store `f5f9fd48...`. **The repo's `wrangler.toml` still had the testnet id** while production used another: a deploy from the repo could have re-bound production to the testnet store. Fixed (id = production, preview_id = testnet). `bun run cf:deploy` (main already gates it with `scripts/check-deploy-env.mjs`) must be run with `VITE_NETWORK=mainnet VITE_FACTORY_ADDRESS=0xA9A5447a1Dd9874c25238d69E285249Fa1c9E10A`: a plain build would point the live site at testnet.
- Secrets present: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and a stale `GEMINI_API_KEY` (**delete it**). The **preview** environment also holds `OPENAI_API_KEY`: remove it (a preview deployment is a second way to reach the paid model).

## 4. Server code: independent review (read-only sub-review of `functions/`)
No critical or high finding, no authentication bypass, no cross-user data path, no route from model output to a destination address. Findings and status:
| # | Severity | Finding | Status |
|---|---|---|---|
| M1 | Medium | A regex (`PAYMENT_NUM`) was cubic: one 2,000-character message could burn seconds of CPU | **Fixed** (bounded quantifiers, whitespace runs collapsed; test in `bun run flow`) |
| M2 | Medium | Sign-up is open, so per-account limits can be dodged and the shared token budget drained | **Your action:** Privy dashboard: restrict sign-up (allowlist or invite) while friends-only; add a Cloudflare rate-limit rule on `/api/chat` and `/api/*` per IP |
| M3 | Medium | Everything failed open without the KV binding (a preview with an LLM key = free tap) | **Fixed** (the chat answers 503 without KV; `LOCAL_DEV=1` only in offline scripts) |
| M4 | Medium | Cloudflare **free-plan** limits (50 subrequests per request, 1,000 KV writes a day) are exposed; the audit log and counters can silently degrade | **Your action:** check the plan; Workers Paid is advised for mainnet. Open |
| L1 | Low | `[app event]` messages are client-forgeable and use a cheaper quota (up to 20 extra model calls a day) | Open (low) |
| L2 | Low | Non-atomic KV counters; refund even after tokens were spent; one throw skipped later bookkeeping | **Fixed** partly (refund only if nothing was spent; each closing step isolated). Atomic counters (Durable Object/D1) open |
| L3 | Low | The model could override the card `type` via the spread | **Fixed** (`type` set last) |
| L4 | Low | Client history forwarded with extra fields | **Fixed** (only role + text) |
| L5 | Low | A huge profile makes every turn many times costlier | **Fixed** partly (lists capped at 60). Per-turn estimate open |
| L6 | Low | Admin/owner proof had no site binding; challenge listed the admin wallets | **Fixed** for admin (proof names the domain; wallets removed from the challenge; `ADMIN_WALLETS=""` now switches admin off). Owner proof still unbound (open) |
| L7 | Low | Public `/api/prices` can burn upstream calls | Open: rate-limit rule |
| L8 | Low | Body read fully before the size check | Open |
| L9 | Low | Wrong types in the request could throw a 500 | **Fixed** for chat messages |
| L10 | Low | Provider state ("account out of credit") shown to users; message prefixes in logs | Open |
| I1 | Info | `web_search` text could print a scam address as plain text | Open (optional: strip addresses/URLs) |
| I2 | Info | `debug:true` returns internal figures to the caller; JWT algorithm not pinned | JWT now pinned to ES256 with required `exp`; debug flag open |
Checked and fine: Privy JWT verification (fails closed), user id only from the verified token, admin proof (account-bound, 30 minutes, allowlist), owner proof separation, KV key namespaces, no SSRF or redirects, no secret in responses, plain-text rendering of chat (no markdown/HTML injection), per-turn and token caps.

## 5. Dependencies
`bun audit`: 16 advisories (7 high, 8 moderate, 1 low), all transitive: elliptic (Privy/ethers/Circle SDKs), stream-json, qs/zod, ws and a toml parser (build and wallet tooling). None is in the server request path of `functions/`; the browser-side ones come with the Privy and Circle SDKs. Action: `bun update` after the hackathon with a full test run; watch Privy/Circle SDK releases.

## 6. Accepted risks for this launch
- No independent audit (internal max-severity review only); vault ownership is permanent and there is no recovery yet (`docs/vault-recovery-spec.md`). Friends only, small amounts.
- DCA contracts are not deployed; the DCA screens and keeper do not exist.
- The cirBTC buy on mainnet (Swap Kit chain `Arc`) has not been exercised by Arc Studio: compare the first quote with the real BTC price before trusting it.
- The admin and cost controls rely on Cloudflare KV, which is not atomic.


---

# Second round (2026-10-29, after the app went to mainnet with new code)

Live at the time of the check: production deployments `42546185` (commit `5ed1aab`) and `726c22de` (commit `10ab3e3`), both containing the first-round hardening (PR #27). Contracts did not change (no diff in `contracts/` since the first audit); on-chain state re-read: factory owner = the Safe, threshold 2, fee 1 USDC, not paused, `preflight-mainnet.ts` passes.

## Public surface, re-checked
- Headers now live: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, HSTS, Permissions-Policy, nosniff, referrer policy. No full CSP yet.
- Bundle: mainnet build, factory `0xA9A5...E10A`, no secret patterns. All authenticated endpoints 401 without a session.
- Cloudflare: production KV `4dca45d1...`, preview KV `f5f9fd48...`. **Still open:** `GEMINI_API_KEY` secret exists (unused), and the preview environment still holds `OPENAI_API_KEY`.

## New code reviewed (independent read-only review + manual checks)
New since the first audit: the AI-power purchase (1 USDC for 100 messages, paid to the owner wallet with a memo, verified onchain), the open-vault card, deterministic yes/no/price/amount responders, one-vault-per-person wallet discovery (`deposit` vs `depositFor`), the cirBTC price guard, the landing page.

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | High | `buyPower` is check-then-act on non-atomic KV: one payment can be credited more than once by parallel requests (KV also caches reads up to 60 s) | **Narrowed, not closed.** The claim is now written before the slow onchain check and a failed check releases it; an in-memory test shows one extra credit, never double, but real KV can still race. The real fix is a Durable Object or D1. Until then: reconcile credited purchases against payments to the owner wallet |
| 2 | High (conditional) | The client signed a payment to the address and amount in the SERVER response | **Fixed.** The app now pays only the address and price compiled into it (`src/lib/power.ts`) and refuses if the server says otherwise |
| 3 | Medium | A slow confirmation led to a second payment; smart-contract wallets pay but are never credited | **Fixed.** An unconfirmed payment is remembered and re-checked instead of paid twice; only plain/email wallets (or 7702) may pay; blocked accounts cannot buy |
| 4 | Medium | The purchase check trusted one RPC without checks | **Fixed.** HTTPS-only RPC and a mistyped payment address fail closed, chain id must be 5042, hash and block hash must match, "not found" is separated from "RPC problem" |
| 5 | Medium/Low | `buy` is two RPC calls per request with no throttle | **Fixed partly.** 10 failed checks an hour per account, 8 s timeout, one retry. A Cloudflare rate-limit rule on `/api/power` is still advised |
| 6 | Medium | The cirBTC price guard checks the estimate, but the swap re-quotes and runs without a `stopLimit` or a quote expiry (worst case ~3% guard + 3% slippage) | **Open.** Compute `stopLimit` from the market price at signing time and expire quotes after ~60 s. Compare the first real quote with the BTC price by hand |
| 7 | Medium | A slow vault read for the previous account could finish after a wallet switch and become the vault a `depositFor` is sent to | **Fixed.** Reads are tied to an epoch, and a deposit from a non-owner wallet re-checks `vault.owner()` is one of the account's wallets right before sending |
| 8 | Medium | `hasVault` was sent as false while the vault read was unfinished or failed (offering a second vault and fee); the open-vault card ignored the pause switch | **Fixed.** Unknown is no longer "no vault"; the pause-transactions switch stops the card |
| 9 | Medium | The price/open responders fired on ordinary sentences ("my landlord lets me stay for free, rent is 0", "I don't want to open a vault") | **Fixed.** Price answers need a short, number-free question; the open-vault request ignores questions and negations and "yes, but..." |
| 10 | Low | The open-vault card shows the fee read earlier, `createVault` sends a fresh read (cap 10 USDC, excess refunded) | Open |
| 11 | Low | A `depositFor` card does not say the money goes to a vault only another wallet can withdraw from | Open |
| 12 | Low | The power counter is not atomic (lost update between a purchase and a spend) | Open (same fix as #1) |
| 13 | Info | Self-pay, a public static memo | Accepted |
Also noted: the new fast path "yes to an offered amount" and "a new amount after an offer" creates deposit/buy cards without the server-side buy lock; the client (`ActionCard`) still enforces the lock and wallet balance, so this is advisory only.

Checked and fine: the payment verification itself (status, exact `to`, exact value, exact calldata, per-account memo, lowercase hash), vault addresses only from the pinned factory, withdrawals only to the owner wallet by the owner, no address can be injected by chat or stored cards, `RecordCard` is off-chain, amounts are exact bigint conversions.

## Tests added
`bun run flow` now covers the purchase (correct payment, replay, other account, wrong memo/amount/destination/hash, unknown transaction, wrong chain, mistyped address, non-https RPC, parallel claim, attempt limit) against a fake Arc RPC, and the open-vault/price responder rules.

## Still yours
Privy sign-up restriction, Cloudflare rate-limit rules (`/api/chat`, `/api/power`, `/api/*`), a paid Workers plan, delete the `GEMINI_API_KEY` secret and the preview `OPENAI_API_KEY`, verify the contracts on explorer.arc.io, and move the purchase ledger and quotas to a Durable Object or D1 before the user count grows.


---

# Third round (2026-10-30)

Live: production deployments `884777bb`..`6594e4cf`, all from commit `e170b64` (UI refresh, agent re-evaluation work of PR #32). Contracts: no diff since the first audit; on-chain state re-read and `preflight-mainnet.ts` passes. New code since round 2: `functions/_lib/agentGuards.ts`, `coaching.ts`, `education.ts`, `mutationEvidence.ts` (regex guards and prompt policy only: no network, no env, no secrets), `llm.ts` (server-owned system messages now stay in the Claude `system` field), a larger `chat.ts`, 130 eval/record files under `docs/evals` and `scripts/`.

## Checks
- Secrets: none in the tracked tree (patterns for OpenAI, Anthropic, Google, Cloudflare, GitHub, private keys); the eval records contain no emails, wallet addresses or Privy ids; `.env`, `.dev.vars` and recovery files are not tracked.
- **A red test was sitting on main:** `scripts/kb-check.ts` crashed on the Claude adapter case after the `llm.ts` change (the test still expected the old "late system note becomes a user message"). `cf:deploy` does not run tests, so it shipped. Fixed the test to the new behaviour and added `bun run check:all` (language check, typecheck, `kb-check`, `bun run flow`); run it before every deploy. A Vietnamese comment line had also lost its `// lang-ok` marker in a merge (the language check would have refused the deploy): fixed.

## Regex denial of service, round 3
New heuristic regexes (guards, coaching, education) were tested end to end: 23 adversarial 2,000-character messages (digit runs, spaced digits, thousands separators, dollars, dots, "k", "usdc a month", "maybe", Vietnamese words, long words...) sent as the user message and again as the previous agent reply. Worst case before the fix: 264 ms (a long digit run). Fixed: digit runs over 18 digits are cut and 8+ repeated punctuation marks are collapsed before any regex runs; worst case now ~100 ms, and `bun run flow` fails the build if any message takes 800 ms or more.

## Round 2 leftovers, now closed
| Finding | Fix |
|---|---|
| #6 cirBTC swap re-quoted without a floor | The swap now carries a `stopLimit` = amount / (market BTC price x 1.03), the market price read at signing time, and a quote older than 60 s must be redone |
| #10 vault fee on the card vs the fee sent | `createVault` refuses if the contract's fee is now higher than the one shown |
| #11 deposit from another wallet | The deposit card says which wallet's vault receives the money and that only that wallet can withdraw |
| fast paths ("yes" to an offered amount, a new amount after an offer) | They now obey the pause-transactions switch, need a vault for deposits and need the buy lock to be open for buys (this also fixed a latent use-before-definition that the typechecker caught) |

## Still open
- Purchase ledger and quotas on KV (not atomic): needs a Durable Object or D1. The Cloudflare token currently has no D1 or Durable Object binding configured on the project; this is a Cloudflare setup step.
- The model prompts include user-typed names (holding and goal names) inside system-role figures. A user can only influence their own chat, and no tool can move money without a signed card, so this is informational.
- Your list from before: Privy sign-up restriction, Cloudflare rate-limit rules, paid Workers plan, delete the `GEMINI_API_KEY` secret and the preview `OPENAI_API_KEY`, verify the contracts on explorer.arc.io.
