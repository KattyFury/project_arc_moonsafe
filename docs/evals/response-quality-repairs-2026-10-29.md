# Response and workflow repairs — 2026-10-29

The Claude evaluation scored 78.75/100 on candidate 2f97e04. This follow-up repairs observed workflow and wording failures; it does not assign a new live quality score.

## Changes

- Questions continue to the answer stage when three or more new facts need confirmation. Pending operations remain exclusively in the existing confirmation card; saved profile and figures are restored before advice. Other cards derived from provisional state are removed. The server appends the pending notice independently of model wording.
- The base prompt now distinguishes a general emergency reserve from the app's USDC vault, permits only verified X-of-Y totals, and limits beginner replies to the requested concept or task. A zero vault does not establish absent outside savings.
- Saved facts can be acknowledged naturally. Removed the mandatory Noted opening and matching rewrite check. Questions need not become a read-back or a full intake.
- Revised DCA guidance keeps the six-month framework default as an option without relying on assumed future growth. Wording distinguishes reduced market value from realizing a loss on sale. Recovery-fee warnings concern specific red flags, not an absolute claim that every legitimate service is free.
- Server-owned instructions retain their system role in the Claude adapter. User messages stay user messages; tool-use/result pairing is preserved. This addresses the earlier adapter's user-message instruction wrapper.
- Narrow output checks detect editorial leakage, the observed only-real-when-sold wording, blanket recovery-fee claims and personal intake questions during answer-first turns. The existing maximum of two rewrites remains. Persistent detected failures, or a provider failure during their correction, return a short honest fallback instead of the rejected draft.

## Offline validation

All requests in the new tests are mocked; no production data or credentials are used for dispatch.

- Existing education/coaching/household suite: 284 checks pass.
- Existing focused guard probes: 35/35 pass.
- Existing hostile quantity/preference handler replay: 5/5 pass.
- New response regression suite: 51 checks pass. Includes English and Vietnamese explanations with pending facts; confirming those operations preserves age/dependents/income stability. Includes a successful corrected answer, persistent bad outputs, and a simulated provider error during rewriting.
- New native Claude adapter check: 9 checks pass, including instruction separation and tool pairing.
- Natural saved-fact explanation fixture: three mocked model calls (record, no_action, answer), with no rewrite for omitting Noted.
- TypeScript check for handler and new scripts, lint, and English UI check pass. Production build passes (existing dependency annotation and large-bundle warnings remain).

Commands:

```text
bun scripts/education-eval.ts
bun scripts/offline-guard-probes.ts --candidate
bun scripts/offline-negative-replay.ts --candidate
bun scripts/response-quality-check.ts
bun scripts/claude-adapter-check.ts
bunx tsc --noEmit -p scripts/tsconfig.response-quality.json
bunx oxlint functions/_lib/agentGuards.ts functions/_lib/llm.ts functions/api/chat.ts scripts/response-quality-check.ts scripts/claude-adapter-check.ts
node scripts/check-lang.mjs
```

## Limits and next evaluation

No additional paid model calls were made. The existing 78.75 score remains frozen; passing mocked regressions does not establish 8/10 live performance. Output checks are intentionally narrow heuristics and can miss paraphrases or reject some legitimate wording. The fallback trades an unreliable explanation for an explicit failure; it is not counted as a useful answer. The Claude instruction-role change has native request-shape coverage but still needs a budgeted live quality comparison. It can affect prompt-cache behavior; no live cost reduction is claimed.

No database, extra agent, framework dependency, model upgrade or automatic transaction was added. The formula, fund-month rules, debt locks, cost-basis guards, household opt-out and wallet signatures remain intact. No merge or deployment in this follow-up.

Prompt workflow reference: [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering), reviewed 2026-10-29: explicit instructions and representative evaluation fixtures. Implementation details and validation are local evidence, not a claim of endorsement.
