# Offline reevaluation of the finance agent

The owner selected **offline only; no API calls**. Tested deployed baseline: `d1e3a1aa5ecf70d192bb20ec62fd84f394abd16e`. The previous 67/100 is the historical live score before the earlier repairs. **There is no new live score and no verified 8/10 claim.**

## What was found on the deployed build

The existing 284 regression checks, flow suite, KB suite and chat-handler typecheck pass. Fresh negative/ambiguous wording probes passed **27/32**. Five failures were then reproduced through the real authenticated handler with deliberately wrong planner calls or a follow-up text response:

| Case | Observed baseline behavior |
|---|---|
| `I do not have 0.5 BTC` | An incorrect model call could save 0.5 BTC. |
| Vietnamese investment cost followed by `không phải mình có 60 BTC` | An incorrect model call could save the explicitly denied 60 BTC. |
| `That 2 BTC belongs to my brother, not me` | An incorrect model call could save another person's 2 BTC. |
| `I am not sure if I own 0.5 BTC` | An incorrect model call could save an uncertain quantity as definite. |
| `Skip the questionnaire for now` followed by a conversation about habits | The handler could open intake on the next turn. |

These are failures of the deterministic defenses, not evidence that the real model chooses the injected tool calls at any measured frequency. The first four are consequential saved-data failures in the replay. This prevents a claim that all important guard conditions already hold on production.

Evidence is preserved separately: [fresh baseline probes](offline-guard-probes-2026-10-29.json) and [baseline handler replay](offline-negative-replay-2026-10-29.json).

## Review-branch repair

The numeric evidence filter now rejects clauses containing denied amounts, explicit third-party ownership or uncertainty before a mutation tool can use their numbers. Positive later declarations still use the existing reset behavior. Absence facts without a numeric amount, such as “I do not have any debts” or “Mình không có nợ”, remain eligible so the fix does not erase valid zero-debt/dependent declarations. The conversation policy also recognizes requests to skip/pause/avoid a form, intake or questionnaire and carries them through supplied user history.

After the repair:

- **284 existing offline checks pass.**
- **35/35 new probes pass:** the original 32 plus three absence-fact regressions.
- **5/5 hostile-model handler replays are blocked as expected:** no denied/uncertain/other-person BTC is saved; the skip-questionnaire follow-up receives no intake form.
- Flow, KB, scoped reevaluation typecheck, actual-chat-handler typecheck, changed-file lint and language checks pass.
- **Zero paid API calls, zero additional model tokens and zero wallet transactions.** The fixtures intercept all network routes; any reported calls/external counts are mocks.

Candidate evidence: [probes](offline-guard-probes-2026-10-29-candidate.json), [handler replay](offline-negative-replay-2026-10-29-candidate.json). The baseline evidence has not been overwritten. No production deployment or merge is part of this reevaluation.

## What the result means for 8/10

Selected deterministic cases now pass. That is not an 8/10 conversational score or a probability of correctness. A model may still omit facts, misunderstand ownership, give an unhelpful explanation or mishandle a new expression. The filter is conservative, depends on recognizable clauses, and can require clarification for mixed/ambiguous wording. It does not claim to understand all languages or all negation scopes.

The six new conversation variants and a capped reevaluation runner are prepared, but **were not run against a live model** under the offline-only instruction. The proposed [comparison protocol](reevaluation-protocol-2026-10-29.md) keeps the original rubric and separates same-case results from new wording. Future live execution needs a new explicit token budget. No score has been raised by converting the offline pass rate into a conversation rating.

Reproduce with no network:

```text
bun run eval:education
bun scripts/offline-guard-probes.ts --candidate
bun scripts/offline-negative-replay.ts --candidate
bun run flow
bun scripts/kb-check.ts
bunx tsc --noEmit -p scripts/tsconfig.reeval.json
bunx tsc --noEmit -p scripts/tsconfig.chat.json
```
