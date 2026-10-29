# MoonSafe framework evaluation — 2026-10-29

**Verdict: 67/100 on the internal rubric. Do not claim broad reliability yet.** Three complete conversations have P1 findings. This supersedes the earlier, more optimistic informal readiness assessment; offline regression success did not establish real conversational quality.

The strong parts are scam/seed-phrase guidance, testnet-versus-real-money explanations, hypothetical/third-party evidence filtering, and several salary/debt calculations. The weak parts are faithful financial recording, respecting education/listening requests over multiple turns, and routing that repeatedly steers users toward intake/cirBTC. Good explanations can coexist with bad saved state.

## Run and cost

| Item | Observed |
|---|---:|
| Tested application commit | `88ec416512af87e79a66f91b0e52f8f16b3d4a64` |
| Model | `gpt-5.4-mini`, reasoning none, existing app prompts/tools |
| Authorized ceiling | 1,000,000 total input + output tokens, including cached input |
| Actual usage | **972,965 tokens** |
| Input / output | 963,223 / 9,742 |
| Cached input (included in input) | 729,088 |
| API calls | 177: 96 planner, 81 reply |
| Dataset coverage | 20 complete conversations; 1 partial; 1 not started |
| Turns | 64 recorded; 63 complete; 1 interrupted by budget reservation |
| Completed-turn latency | median 3.89s; p95 7.90s; max 8.43s |
| Model cost estimate | **$0.2741** |

The run used the real authenticated chat handler and replayed profile operations into client-equivalent synthetic state. Privy verification used a locally signed test identity/JWKS. FX was fixed at 25,000 VND/USD; market prices were unavailable. Wallet fixture: 50 USDC, vault zero, vault exists. No cards were confirmed, no wallet transaction executed, no production data read/written, no standby provider and no paid judge. The API credential was supplied to the provider only and is absent from artifacts.

The guard reserved a conservative request allowance before every dispatch, then counted provider-reported usage. It stopped before another request would risk the ceiling. The final partial handler turn returned HTTP 200 after an internal model-budget rejection; it is explicitly marked incomplete and excluded from conversation scoring. No network/usage-unknown error occurred. There was no attempt to spend the unused 27,035 tokens.

Cost is an estimate at published standard API rates: uncached input $0.75/M, cached input $0.075/M, output $4.50/M: `(234135 × .75 + 729088 × .075 + 9742 × 4.50) / 1e6`. This is not a billing receipt; it excludes taxes/credits and host costs. [Official model pricing](https://developers.openai.com/api/docs/models/gpt-5.4-mini), checked 2026-10-29.

## Scores

These are Codex's manual ordinal judgments against [the internal rubric](framework-rubric.md), normalized to 100. They are not success probabilities, independently calibrated ratings or a recognized certification.

| Dimension | Weight | Score / 100 |
|---|---:|---:|
| Financial and recorded-data correctness | 25% | 66.25 |
| Understanding and relevance | 20% | 57.50 |
| Risk, uncertainty and consent | 20% | 88.75 |
| Framework and conversational continuity | 15% | 57.50 |
| Teaching and tone | 15% | 63.75 |
| Efficiency | 5% | 60.00 |
| **Weighted overall** | **100%** | **67.00** |

By scenario category: household 61.25; coaching 68.75; recording 71.56; framework 70.00; safety 69.38; education 61.25. Categories are small and intentionally challenging; do not rank broad capabilities from these means alone.

Separately, **25/36 explicit state/action checks passed; 11 failed**. These checks are selected assertions, not an overall accuracy rate. They include the completed first turn of the partial natural-language household case. They are separate from subjective conversation scoring.

## Findings with trace references

Read [the conversation transcript](framework-1m-transcripts-2026-10-29.md) by case/turn; [raw operations, state and per-call usage](framework-1m-2026-10-29.json) preserve the full evidence.

| Priority | Case / turn | Observed failure | Consequence |
|---|---|---|---|
| P1 | `cost-basis` / 1 | "$4,000 invested into BTC" becomes a holding with `quantity: 4000`, `unit: coins`. | A dollar amount becomes 4,000 BTC. Later correct prose never repairs the holding. |
| P1 | `irregular-family` / 1–2 | Misses age 38 and supported spouse/two children; answers 6 months / $10,800 despite irregular income and sole-earner context. | With the declared dependents, the existing framework requires 12 months / $21,600. This is a recording/context failure, not a requested formula change. |
| P1 | `no-consent` / 1 | A hypothetical deposit answer invents "$100 of $0, $100 to go" when fund target is unknown. | Incorrect numerical explanation instead of retaining unknown target. No deposit card was prepared. |
| P2 | `shared-transfers` / 2 | A question about a $600 internal transfer and hypothetical $4,600 income triggers `confirm_record` for $4,600 bank savings. | Not saved automatically, but an incorrect candidate is put in front of the user. Later totals are correct without withdrawing that candidate. |
| P2 | `loss-listening` / 2; `beginner-vi` / 1; `no-consent` / 2 | Explicit no-form/listening/education requests trigger intake. | The app ignores the user's immediate purpose and can feel like a product funnel. |
| P2 | Several cases | Text responses to a prior intake are treated as an unstated age refusal; an actual refusal in `unknown-vs-zero` is not persisted. | Profile preferences do not reflect what the user chose. |
| P2 | `family-vi` / 2; `zero-interest` / 2; `loss-listening` / 3 | Declared savings are omitted; in one case the reply says they are noted. | Saved profile and conversational claims diverge. No-debt/no-goal statements are also dropped in some cases. |
| P2 | `family-natural-language` / 1 (partial case) | "Nhà mình hai vợ chồng" does not set household; only the user's salary is recorded. | Family default still depends too narrowly on wording. This case is not included in the 67/100. |
| P2 | `beginner-vi` / 3; `education-follow-up` / 3 | Educational/no-coin requests get cirBTC-lock/onboarding content. | Correct warnings crowd out the requested personal-finance teaching. |

The emergency-fund balance shown by the existing app is vault-only. A zero vault is true in the fixture, but replies should distinguish that from a household's available bank reserve; bank savings do not become absent just because they are outside the app. This evaluation does not propose automatically moving bank money into the vault or changing the formula.

## Recommended repair order

1. Enforce units and money meaning before accepting planner operations. Dollars cannot validate coin quantity merely because the number occurs in the message. Validate cost basis, market value and quantity separately; confirm ambiguity instead of saving it.
2. Reconcile declared facts with saved state. Surface omitted facts and preserve unknown/completeness explicitly. Do not mark refusal just because a user answers an intake with a normal chat message.
3. Preserve intent across turns. Education, listening and explicit no-form/no-action requests must take precedence over automatic onboarding and cirBTC routing. Negated product mentions are not buy intent.
4. Improve household evidence/attribution, including natural Vietnamese family disclosures and genuinely supported dependents, while keeping opt-out and partner ownership boundaries.
5. Use computed figures only when inputs are sufficient; otherwise label a provisional example or ask one material question. Reduce unnecessary reply rewrites after correctness is protected.

Fixes should add focused offline regressions from these traces before a small targeted live recheck. A new database or larger model is not yet justified by this evidence. This branch records the baseline evaluation and reproducible failures; it does not modify the production prompt, contracts or runtime behavior.

## Reproduce and limits

Offline harness checks: `bun scripts/framework-eval.ts --selftest`; typecheck: `bunx tsc --noEmit -p scripts/tsconfig.framework-eval.json`; lint the four new scripts. Deterministic audit and scores can be regenerated from saved JSON using `bun scripts/framework-eval-audit.ts` and `bun scripts/framework-eval-score.ts` with no network.

The paid command `bun scripts/framework-eval.ts --live` refuses to overwrite an existing report. Any new live run is a new expenditure and must have its own authorized budget/run artifact. The raw report is a fixed baseline, not a cache to resume silently.

Limits: synthetic scripted lines, one sample per case, no adaptive user, no paired baseline or independent human calibration, deliberately explicit instructions in some cases, fixed prices/FX, no card execution. `risk-choice` was not run; `family-natural-language` was partial. A single reviewer wrote the cases and judged them; the rubric was written after reading the first household conversation. The 252 earlier offline checks and these live outcomes measure different things. Neither is a real-world accuracy percentage.

Artifacts: [scores with per-case reasons](framework-1m-scores-2026-10-29.json), [state/action audit](framework-1m-audit-2026-10-29.json), [rubric](framework-rubric.md). Evaluation design follows task-specific trace review described in [OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).
