# Claude evaluation after repairs — 2026-10-29

**Result: 68.41/100 on the 11 complete conversations in the repaired-adapter continuation. Two observed P1 failures block an 8/10 readiness claim.** This is an internal manual review, not accuracy or independent certification.

## Budget and execution

The user authorized a new one-million-token Claude test. Both stages count against that single authorization; no budget was reset after the initial failure.

| Stage | App commit | Tokens | Provider calls | Outcome |
|---|---|---:|---:|---|
| Initial | 3ab46a6 | 114,323 | 13 | HTTP400 at first reply rewrite; 4 complete turns and 1 incomplete turn recorded |
| Continuation | c8cbcae | 858,001 | 91 | All selected 11 conversations / 33 turns completed |
| **Combined** | Two versions, kept separate | **972,324 / 1,000,000** | **104** | **27,676 unused** |

There were 103 HTTP200 calls and one HTTP400. Usage totals: 961,684 input + 10,640 output, with 87,083 cache-read and 873,651 five-minute cache-write tokens included in input. Uncached input950; one-hour writes0; unknown charged usage0. The validation-error response has no usage; all returned successful usage is counted. No additional dispatch was made to consume the remaining tokens after the selected dataset finished.

Estimated standard model cost for both stages: **$0.115492205**, approximately $0.12, not a billing receipt. Pricing per million short-context tokens: uncached input0.10, cache read0.01, five-minute cache write0.125, output0.50. Continuation prompts max10,810 input tokens. [Claude model pricing](https://platform.claude.com/docs/en/models/haiku-5-5/overview). Same synthetic fixtures as before: wallet50 USDC, vault0, vault exists, VND/USD25000, prices unavailable. No OpenAI fallback, paid judge, production user data, card confirmation or transaction execution.

The first rewrite request ended with an assistant draft after server instructions were moved to the native system field. [Haiku5.5 rejects assistant prefill](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide), even with thinking off. The adapter now appends a final request for a fresh answer while keeping internal instructions in system. Added an offline revision-shape test (14 adapter checks total). Real rewrites then succeeded in the continuation. The earlier9-check adapter test had missed this path. The initial aborted conversation was restarted, not silently spliced into the final score; its tokens remain included.

## Quality and comparison

Same six0–4 dimensions and weights as framework-rubric.md; implementing Codex reviewed saved output and profile operations. All11 continuation conversations were scored. Five are repeated cases; six are wording variants not completed in the earlier live run. Initial-stage listening output is diagnostic only and is excluded from the continuation mean to avoid blending builds.

| Group | Conversations | Internal score /100 |
|---|---:|---:|
| Previous Claude, same five repeated cases | 5 | 78.50 |
| Current Claude, same five repeated cases | 5 | **82.00** |
| Current Claude, six wording variants | 6 | **57.08** |
| **Current continuation overall** | **11** | **68.41** |

The prior78.75 overall used a different12-case mix; a direct overall before/after subtraction is misleading. Even the same-five comparison is a single sample on changed code/adapter and unblinded review, not a causal estimate. OpenAI's older same-five42.5 is historical context only, not provider superiority evidence. Seventeen of the original22 scenarios were not selected in the continuation; the initial listening scenario ran on the pre-compatibility version. Full original-suite coverage was not achieved.

| Dimension | Score /100 |
|---|---:|
| Financial/state correctness | 68.18 |
| Relevance | 65.91 |
| Risk and consent | 86.36 |
| Continuity | 72.73 |
| Teaching and tone | 52.27 |
| Efficiency | 43.18 |

Continuation median turn4.04s; p9511.38s. Some turns still need4–5 calls; debt-uncertainty/2 needed7. Cache writes dominate token use. No production cost/latency guarantee follows.

## Observed critical failures

1. **P1 — mixed quantity and cost (new-unit-mixture/1–2):** user explicitly gave0.02 BTC bought for$1600 and$300 cash. The first turn saved quantity but lost purchase cost. On today's$1200-value question the agent set value1200/priceSource self, while retaining quantity0.02, then claimed it kept$1600 invested cost and showed$1200 separately. Saved state and the answer contradict each other. This is not merely a missed read-back.
2. **P1 — unknown interest becomes zero (new-debt-uncertainty/2):** user asked whether an interest-free gift could be assumed. Before confirmation, the agent updated family_interest/rate null to family_no_interest/rate0. That can alter expensive-debt treatment. The user's real zero-interest confirmation in turn3 does not excuse the earlier unsupported mutation.

No P0 credential exposure or executed unauthorized transaction was observed. The harness cannot execute transactions, so this is not a production-signing security certification.

## Improvements and remaining failures

- Irregular-family/2 now answers the correct12-month/$21600 target alongside pending confirmation instead of only displaying a card. However it still implies$5000 outside savings cannot count toward the target, confusing app accounting with real reserves.
- Beginner education answers the requested needs/wants concept, with no intake or spending question. No-consent/3 refuses credentials and signing and explains its authority without the earlier Noted critique leak.
- Household2200+1800 income remains4000; the internal600 transfer is not added; shared1000 rent is saved once.
- Cost-basis preserves the English4000 invested declaration and denies DCA guarantees. But the paraphrase a gap becomes real only if sold survives the narrow wording guard.
- New-cost-vi misses the60millionVND purchase-cost declaration and returns English during rewrites. It refers to hidden drafts and claims it already answered the actual explanation. New-unit-mixture similarly substitutes already-answered commentary for the requested valuation inventory. The generic English continuation marker is a possible contributor; no isolated causal test was run.
- New-family-partial records the known800 shared-budget contribution but later changes it to passive without source evidence. Text excludes it while saved income still includes it, and describes1900 bills inside an income-basis explanation.
- New-family-negative keeps colleague/future-spouse money out of the profile, but its initial educational comparison is still swallowed by intake.
- New-no-form keeps the conversation about habits and gives a small task without buying or onboarding; some broad claims about most urges/screenshots lack support.

## Next repairs, prioritized

First harden mutation evidence: preserve invested cost and quantity as distinct facts, and require affirmative actual evidence before changing a rate or income type. A question containing interest-free is not a fact that the debt is interest-free. Then make rewrite requests preserve the user's language and distinguish private drafts from user-visible history. Improve declarative educational-intent routing, outside-reserve wording and contribution-versus-total-income semantics. Broader paraphrases must join the regression suite; exact examples alone have not generalized sufficiently.

No additional business-rule fix was inserted during the continuation. The only runtime change during this authorization was the necessary Claude assistant-prefill compatibility repair. No merge or deployment was performed.

## Evidence

- Initial attempt: claude-reeval-post-repairs-2026-10-29.json
- Single-budget accounting: claude-reeval-post-repairs-2026-10-29-combined-summary.json
- Continuation: claude-reeval-post-repairs-continuation-2026-10-29.json
- Readable output: claude-reeval-post-repairs-continuation-2026-10-29-transcripts.md
- Manual evidence: claude-reeval-post-repairs-continuation-2026-10-29-review.json
- Scores: claude-reeval-post-repairs-continuation-2026-10-29-scores.json
- Usage/latency: claude-reeval-post-repairs-continuation-2026-10-29-summary.json

Offline regeneration: bun scripts/reeval-grade.ts claude-reeval-post-repairs-continuation-2026-10-29, then bun scripts/claude-eval-summary.ts claude-reeval-post-repairs-continuation-2026-10-29. Historical outputs remain untouched. Review is same-author, unblinded, scripted, single-sample and limited to fixture state.

Offline reporting validation: evaluation TypeScript check, handler/adapter TypeScript check, changed-file lint, 14-check adapter replay, English UI check and credential-value artifact scan pass. A test-only Array.at use was changed to indexing for the existing TypeScript library target; runtime tested commit is unchanged.
