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
- Production KV binding is `4dca45d1...` (the mainnet store) and preview is the old testnet store `f5f9fd48...`. **The repo's `wrangler.toml` still had the testnet id** while production used another: a deploy from the repo could have re-bound production to the testnet store. Fixed (id = production, preview_id = testnet). Also `bun run cf:deploy` now refuses to run (a plain build points the site at testnet); use `bun run cf:deploy:mainnet`.
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
