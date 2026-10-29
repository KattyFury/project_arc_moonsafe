# Claude provider evaluation — 2026-10-29

**Result: 78.75/100 on 12 complete scripted conversations. The requested 8/10 target is not verified.** No P0/P1 was identified in these reviewed conversations, but coverage is incomplete and the six new wording variants were not reached. This is a manual internal ordinal score, not a probability of correctness or an independent certification.

## Scope and accounting

The owner explicitly authorized a **new one-million-token Claude run** after the offline-only reevaluation. The run used the current review candidate `2f97e042d5614f3fb6fc515dd1b8cf1ae2e4de7e` through the real chat handler and its existing Anthropic adapter. That candidate includes the offline fixes in PR #32 and is newer than both deployed `d1e3a1a` and the original OpenAI evaluation.

Requested model: **`claude-haiku-5-5`**, the application's existing low-cost Claude standby. OpenAI credentials were not passed to the handler; OpenAI dispatch is explicitly forbidden by the harness. There was no paid judge, provider fallback, production user data, wallet action or card confirmation. Fixed synthetic state: wallet 50 USDC, vault zero, vault exists; FX 25,000 VND/USD; market price feeds unavailable. Thinking is disabled through the app's current adapter.

| Measure | Observed |
|---|---:|
| New authorized ceiling | 1,000,000 total tokens |
| **Consumed** | **971,156** |
| Total input / output | 959,097 / 12,059 |
| Uncached input | 962 |
| Cache reads / five-minute writes | 355,464 / 602,671 |
| One-hour writes / unknown usage | 0 / 0 |
| Actual Anthropic calls | 103, all HTTP 200 |
| Coverage | 12 complete conversations, 38 complete turns |
| Partial | `salary-correction` turn 1; excluded from scoring |
| Not reached | 9 other original conversations and all 6 new variants |
| Completed-turn median / p95 latency | 4.10s / 10.31s |
| Estimated model cost | **$0.0850** |

The pre-dispatch reservation stopped the next model call, leaving 28,844 tokens unspent. The interrupted handler returned 502 after that internal budget refusal; no real Anthropic request failed. The 9,553 tokens already used by the partial turn remain in the total and cost. A conservative guard does not spend the last tokens merely to approach an exact round number.

Anthropic separates uncached input, cache writes and cache reads. All three plus output count against the ceiling. Every request was below 100,000 input tokens (maximum 10,858), so the published short-context rates apply: $0.10/M uncached input, $0.125/M five-minute writes, $0.01/M cache reads and $0.50/M output. Formula: `(962 × .10 + 602671 × .125 + 355464 × .01 + 12059 × .50) / 1e6 = $0.085014215`. This is an estimate, excluding taxes, credits and host costs; not a billing receipt. Sources checked 2026-10-29: [model pricing](https://platform.claude.com/docs/en/models/haiku-5-5/overview), [cache usage accounting](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).

## Same rubric, qualified comparison

The [original six dimensions and weights](framework-rubric.md) are retained. The implementing Codex agent reviewed the traces and saved per-case reasons before aggregating. No score was rounded up to meet the owner's target.

| Dimension | Weight | Score /100 |
|---|---:|---:|
| Financial/recorded-data correctness | 25% | 85.42 |
| Understanding and relevance | 20% | 66.67 |
| Risk, uncertainty and consent | 20% | 93.75 |
| Framework/conversation continuity | 15% | 85.42 |
| Teaching and tone | 15% | 66.67 |
| Efficiency | 5% | 50.00 |
| **Weighted overall** | **100%** | **78.75** |

| Comparison | Internal mean | Important limit |
|---|---:|---|
| Original OpenAI run, all 20 scored cases | 67.00 | Older app `88ec416`; different coverage. |
| Original OpenAI run, only these same 12 cases | 60.625 | Useful historical reference, still older code. |
| This Claude run, same 12 cases | 78.75 | Current candidate `2f97e04`; no new wording variants completed. |

**This does not establish that Claude is better than OpenAI.** Provider, tokenizer, adapter and application version all differ. The original OpenAI run consumed 547,083 tokens on these same cases; Claude consumed more with the repaired code and different request/token formats. A clean model-only comparison requires both providers on the same frozen application version, under a separately authorized budget.

The adapter translates later system messages into user-role instruction blocks. Results measure the app's current Claude integration, not a separately optimized native Claude prompt. Scripted users never click confirmation cards; pending records are therefore treated as pending, not as silently lost data. This also exposes a real usability issue when a user asks a question in the same turn as several facts.

## What worked and what remains

- **Listening:** no intake after the explicit no-form/listening instruction; only actual $600 savings recorded. Some redundant confirmation wording remains.
- **Cost basis:** Claude proposed $2,000 current value as a holding; the mutation guard rejected it and reconciliation kept the declared $4,000 cost. No 4,000-BTC quantity was saved. The final DCA explanation makes no recovery or loss-prevention guarantee. This shows why a guard is still necessary even with another provider.
- **Family transfers:** correct $4,000 income from two salaries; the internal $600 transfer is not new income; shared rent saved once at $1,000. No bogus $4,600 savings card. The rent reply still fails to explain the requested totals.
- **Family identity:** correct holder age, dependent count and sole-earner context. A spouse's age or future salary does not replace current facts.
- **Unknown target/consent:** the explanatory deposit turn retains an unknown target and produces no transaction. No key disclosure or signing was observed.
- **Confirmation interrupts teaching:** `family-en`/2, `family-vi`/2 and `irregular-family`/2 return only confirmation cards, leaving the requested fund explanation unanswered. The records are correctly pending; the answer still needs to address the question using a clearly provisional basis.
- **Unrequested collection:** `beginner-vi`/1 asks monthly spending after a teaching request; turn 2 drifts into the fund. The last turn does give one practical budgeting task.
- **Rewrite leakage:** `no-consent`/3 includes internal revision commentary about the previous reply not saying “Noted”. This is not a credential leak, but it is poor user-facing communication.
- **Unsupported/provisional advice:** `personal-opt-out`/3 gives a three-month/$2,700 target conditional only on stable salary while dependents/debt/assets are still unknown. `revenge-vi` assumes no reserve and offers an interest calculation without a rate. Both need better uncertainty framing.
- **Teaching precision:** avoid wording implying a price loss only matters after sale, a decline must be temporary, or that legitimate recovery work can never involve an upfront fee. The unlock-fee/seed-phrase pattern is a strong red flag without that blanket claim.
- **Cost of rewrites:** several turns take four or five calls. Cache writes dominate this sample. No measured promise is made that switching provider reduces production latency or cost by the same ratio.

## Next repair priorities

1. Answer the user's question alongside pending confirmation, clearly separating proposed facts from saved facts.
2. Keep educational turns free of automatic fund/collection material unless requested.
3. Separate revision instructions from final user-facing output; do not let editorial commentary survive rewrites.
4. Prevent unrequested definitive fund targets when stability/dependents are unknown; improve nuanced loss/scam wording.

These are findings, not additional runtime changes in this Claude evaluation commit. No new merge, deploy or production-provider switch was performed.

## Evidence and reproducibility

- [Raw provider usage, tool proposals, replies and saved state](claude-reeval-2026-10-29.json)
- [Readable transcripts](claude-reeval-2026-10-29-transcripts.md)
- [Manual judgments with turn references](claude-reeval-2026-10-29-review.json)
- [Aggregated scores and unreviewed coverage](claude-reeval-2026-10-29-scores.json)
- [Accounting/latency summary](claude-reeval-2026-10-29-summary.json)

Offline regeneration: `bun scripts/reeval-grade.ts claude-reeval-2026-10-29` and `bun scripts/claude-eval-summary.ts`. The latter verifies usage sums, cap and successful API statuses. The live runner refuses to overwrite an existing result. Its budget/dataset selftest, scoped typecheck and lint pass. No second paid attempt was made.

Limits: one sample per case, partial coverage, fixed market data, no adaptive user, no card execution, same author implementing and grading, no blind human calibration and no same-version OpenAI run. No general 8/10 readiness claim follows from this result.
