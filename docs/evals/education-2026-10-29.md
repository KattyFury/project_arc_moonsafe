# Agent education and cost evaluation — 2026-10-29

Base: `25e5f4eff07818527bb78192da177c6340a90b95`. Model stays `gpt-5.4-mini`.

## Changes

Five reviewed English/Vietnamese lessons cover personal finance, emergency funds, DCA, diversification and BTC risk. Only standalone allowlisted questions use these answers. They return no profile operations or transaction cards and need no model, FX, prices, database, vector search or external skill service. Authentication, maintenance, account blocking and existing quotas still apply; a lesson still counts as one chat message.

All other requests keep the existing planner, financial calculations and tool checks. Requests such as “Explain…” and “Giải thích…” without a question mark now take precedence over onboarding. The reply policy distinguishes product allocation rules from financial facts, prohibits guarantees, treats external text as untrusted data and explicitly identifies Arc Testnet as a testing environment. Knowledge questions no longer receive the automatic post-plan deposit/bucket offer instruction.

The old “BTC never goes to 0” wording meant a positive **allocation** in the formula; the new wording removes the possible price guarantee interpretation. The allocation formula itself is unchanged.

## Live comparison

Six independent questions with empty synthetic profiles and fixed FX, once per variant. No production data or model judge. Each process permits at most 12 OpenAI calls and 100,000 reported tokens, checked before dispatch (one response can exceed the token threshold). No Claude fallback or retries after an error.

| Question | Before | After |
| --- | --- | --- |
| What is personal finance? | Answer plus product onboarding explanation, 2 calls | Direct lesson with source, 0 calls |
| What is DCA? | 4 calls, including 2 rewrites | Definition, limitations and manual-signing behavior, 0 calls |
| Can BTC go to zero? | 4 calls; pivoted to buy lock and personal-data collection | Risk answer without purchase pitch, 0 calls |
| Explain needs vs wants | Returned intake form, 0 calls | Explained the distinction, 1 call |
| Same request in Vietnamese | Returned intake form, 0 calls | Answered in Vietnamese, 2 calls |
| Testnet for real emergency savings? | Correct initial “no”, then asked for age, 2 calls | Answered “no”; initial candidate implied a real vault, so policy was tightened and retested |

| Metric | Before | Candidate |
| --- | ---: | ---: |
| Model calls | 12 | 5 |
| Input tokens (including cached) | 56,616 | 25,621 |
| Output tokens | 644 | 460 |
| Cached input tokens | 34,176 | 10,368 |
| Total tokens | 57,260 | 26,081 |
| Estimated API cost | $0.02229 | $0.01429 |

This sample used **54.5% fewer tokens** and about **35.9% less estimated API spend**. These are sample-specific measurements, not projected savings for the whole app. The first three common questions alone dropped from 10 calls to zero. Novel questions can still need rewrites; the Vietnamese answer used one.

The final testnet-policy retest used 2 calls / 9,736 tokens / ~$0.00442. It correctly said the vault is for testing and discussed accessible real-world savings without inventing a mainnet MoonSafe vault. Total evaluation estimate: **$0.0410**, before tax/account-specific adjustments. Pricing used: $0.75 input, $0.075 cached input, $4.50 output per million tokens, from [OpenAI's model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini), checked 2026-10-29. This is a usage-based estimate, not an invoice.

After these live runs, main advanced to `4fb902b` (audit round 2). It was merged into this branch and the offline education, knowledge-base and standalone type checks were rerun successfully. The final network wording is deployment-agnostic: the app supports testnet and mainnet builds, and the agent must not invent which is configured. No further paid comparison was run for this small wording adjustment; the saved live evidence describes the earlier tested revisions exactly.

See [the saved responses and usage](education-2026-10-29.json), including the initial answer that required correction.

## Validation

- `bun run eval:education`: 79 checks pass; covers both languages, case/punctuation, mixed requests, injection-like text falling through, authentication, maintenance, blocked users, zero model/network calls on lessons and continued fallback for unfamiliar questions. Offline model responses are mocks, not evidence of LLM quality.
- `bun run typecheck:education`: passes for the new knowledge module and evaluation harness plus their statically imported dependencies. It does not typecheck every Pages endpoint.
- `bun scripts/kb-check.ts`: passes (26 patterns, 27 personas, 14 real profiles and existing model-adapter checks).
- `bunx oxlint functions/_lib/education.ts functions/api/chat.ts scripts/education-eval.ts`: passes.
- `node scripts/check-lang.mjs`: passes.
- `bun run build`: passes, with existing dependency annotation / chunk-size warnings.
- `bun run typecheck`: blocked by pre-existing local issues: missing `js-tiktoken` module in `scripts/token-report.ts`, and readonly connector type mismatch in ignored `src/preview-main.tsx`. The same errors occurred before adding the new module/harness; they were not changed here.

## Repeat cheaply

`bun run eval:education` is offline and does not spend API credit. `bun scripts/education-eval.ts --live` explicitly enables the bounded six-question live run; `--only testnet` runs just the named case. Bun can load the existing local `.env`; never paste a credential into arguments or commit it. Raw local reports are ignored; the reviewed, compact evidence above contains only synthetic conversations.

For the original baseline, restore `functions/api/chat.ts` at the base commit into the ignored sibling `functions/api/.education-baseline.ts`, then run `bun scripts/education-eval.ts --live --baseline`. Remove that temporary sibling afterward. Keep sources/SDK code from the matching base when comparing future architectural changes.

## Limits and next steps

This is a bounded first improvement, not a full multilingual or financial-advice certification. Allowlisted wording is intentionally narrow: paraphrases and personal/multi-part requests still use the model. Broader coverage should be added from anonymized, consented real failure cases with a source and a regression fixture. No user messages are newly persisted or collected by this change. Reviewed lessons need review when facts or product features change; DCA availability reads the existing feature flag.

A database or vector retrieval service adds cost and operational work without helping these five fixed concepts. Reconsider retrieval once there is a larger reviewed corpus or a measured failure it solves. Keep live evaluations opt-in; broaden to full personalized recording/action conversations before changing models or allocation rules.

## References

- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering): prompts in code and representative evaluations.
- [FCAC budgeting](https://www.canada.ca/en/financial-consumer-agency/services/make-budget.html): income, spending, goals, needs/wants.
- [CFPB emergency funds](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/): accessible reserves for unexpected expenses.
- [Investor.gov DCA](https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging): equal amounts at regular intervals.
- [Investor.gov diversification](https://www.investor.gov/introduction-investing/getting-started/asset-allocation): allocation depends on horizon and risk tolerance; diversification has limits.
- [FCA crypto risks](https://www.fca.org.uk/investsmart/investing-crypto): possibility of losing invested money.

All references reviewed 2026-10-29. Definitions are paraphrased. These sources are not endorsements of MoonSafe or its age-based formula.
