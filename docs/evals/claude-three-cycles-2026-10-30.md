# Three Claude repair/evaluation cycles — 2026-10-30

**Final sample:89.375/100 across14 complete conversations/42 turns, with no observed P0/P1 in that sample.** This exceeds80 on the tested cases, but is not broad-release certification. Full original-suite coverage is incomplete and teaching remains the weakest major dimension. Scores are manual internal judgments by the implementing Codex, not accuracy percentages or independent validation.

The owner authorized two to three more repair/test cycles. We used three, each with its own1,000,000-token ceiling including cache reads/writes. Total **2,606,246/3,000,000 tokens**, estimated API cost **$0.31112291**, not a billing receipt. There were274 real Anthropic calls, all HTTP200,108 recorded/complete turns including repeated scenarios, and no unknown usage. Unused393,754 tokens were not spent merely to fill the ceiling. Earlier independently authorized evaluations are excluded from this accounting.

| Cycle | Runtime commit | Tokens | Calls | Complete conversations/turns | Internal mean | Observed P1 |
|---|---|---:|---:|---|---:|---|
| 1 | 844a4d9 | 911,002 | 96 | 11/33 | 85.68 | Wrong shared-budget income explanation |
| 2 | fd5f24c | 807,933 | 85 | 11/33 | 83.52 | Question changes repayment to optional |
| 3 | 23a541b | 887,311 | 93 | 14/42 | **89.38** | **None observed** |

Cycle3 first ran8 repeated scenarios plus3 fresh wording probes (659,984 tokens). The remaining340,016-token cap was used to recheck3 original scenarios on exactly the same runtime commit; this used227,327. Both parts are included once in the887,311 total. It is one cycle, not an extra budget. Raw parts remain separate; the combined JSON concatenates disjoint cases for scoring/accounting and is not a third set of paid calls.

## Comparable evidence

On the **same11 scenarios**, the prior pre-cycle evaluation scored68.41, cycle1 scored85.68, cycle2 scored83.52 and final cycle3 scored89.55. The3 additional fresh probes averaged88.75, giving89.38 across the final14. These fresh probes were designed after cycle2 and are not an independent blinded holdout. Iterative repairs necessarily make repeated fixtures familiar; one sample per scenario cannot establish causal or statistical improvement.

Same11-scenario model use fell from91 calls/858,001 tokens in the prior evaluation to72 calls/687,694 tokens in the final candidate. This is observed fixture efficiency, not a production latency/cost guarantee. Final42-turn median3.12s and p958.03s; one scenario still needed5 calls. Invariants over final live traces pass66/66; these are explicit state/format checks, not a substitute for the manual review.

| Final dimension | Score /100 |
|---|---:|
| Financial/state correctness | 96.43 |
| Relevance | 89.29 |
| Risk/consent | 96.43 |
| Continuity | 94.64 |
| Teaching/tone | 71.43 |
| Efficiency | 64.29 |

The grading script still reports achieved:false because its original full-coverage gate requires all baseline cases, which were not all run. The product rubric's broad beta criterion also calls for no major category below75, so the teaching score is another reason not to call this a general release certification. The user's8/10 numerical target is exceeded **in this selected sample**.

## What changed

### Cycle1 — enforce facts at the mutation boundary

- Added assertion-aware evidence for interest rates and passive income: interrogative, hypothetical and uncertain wording is not an affirmative financial fact.
- BTC purchase cost and actual coin quantity coexist in the existing holding fields. Cost parsing supports English/Vietnamese, including invested dollars and Vietnamese millions. Explicit reconciliation fills omitted cost facts without guessing coin quantity.
- Current valuation cannot overwrite an existing BTC purchase cost. The model may propose an incorrect mutation, but the guard refuses it.
- Removed private failed drafts from reply history. The original user request stays the latest real user message during correction; output checks detect language drift and hidden-draft commentary.
- Loosened cosmetic length thresholds to avoid paying for unnecessary rewrites. No model upgrade, database, new agent or framework replacement.

Live result: the original cost/quantity and rate-zeroing defects no longer reproduced. But an800 partner contribution was retained in state while text incorrectly excluded it from declared resources. That consequential accounting explanation remained a P1 despite a mean above80.

### Cycle2 — code owns accounting answers and unresolved loan terms

- Render declared budget resources/spending from computed state, with explicit distinction between a partner contribution and unknown full salary. Internal household transfers do not create income.
- Render a complete unknown-rate checklist rather than deleting question lines and leaving empty numbered bullets.
- Stop planning after two consecutive rounds with no state/action progress, bounding repeated rejected proposals.

Live result:3200resources and1900listed bills were correctly explained, no invented passive source. However the model found another unsupported field: required:false on a speculative gift question. The rate stayed unknown but repayment obligation changed. This P1 was preserved in the cycle2 report rather than hidden by the otherwise passing rate check.

### Cycle3 — protect obligations and present saved valuation facts

- Require affirmative evidence for optional or mandatory repayment, including explicit must-repay/mandatory wording. Questions do not forgive debt.
- Require an explicit purchase-cost declaration to change crypto cost, rather than relying only on a list of market-value phrases.
- Code-render purchase-cost explanations and known/unknown holding inventories from saved facts. User-quoted resale value is labelled self-reported; no claim that a separate price field was saved. Live price valuation is only shown when actual quantity and a price feed are available.
- Keep explicit incomplete-expense context from recent user turns; do not quote a complete personal fund target or plan from partial expenses. The underlying allocation formula and transaction locks remain unchanged.
- Added fresh wording probes.935cost/0.011BTC/275cash survived a710 resale quote; a speculative interest-free/optional question did not mutate1400debt, and actual12% APR/mandatory/80payment were recorded.900rent+300food stayed a partial1200expense list, with no invented3600fund target.

## Remaining observed limitations

- The sole-earner explanation can still conflate an unconfirmed savings entry with whether the already-computed fund target itself is confirmed.
- Some educational examples omit timing, such as200000 monthly savings and a1000000 surprise bill without saying how long accumulation takes.
- Broad most-impulses-fade statements, overly general family pooling descriptions, redundant forms after factual followups and occasional self-correction about dollar/USDC display remain.
- A confirmed positive rate can coexist with an unknown debt category; the rate still drives the existing expensive-debt logic. Additional loan metadata questions can be unsolicited.
- Evidence parsers and language checks are conservative heuristics, not full semantic understanding. Ambiguous declarations may be left unrecorded. Incomplete-expense context is derived from the recent chat window and is not a new persistent completeness field.
- No executed transactions, card clicks, production user data or independent human review were tested. The harness cannot certify production signing security. No testnet-as-real-savings claim was observed in selected cases, but the dedicated original testnet scenario was not covered in these cycles.

## Verification and artifacts

Offline suites:296 education/coaching/household checks;93 response/mutation checks;35 focused probes;5 hostile handler replays. Scoped TypeScript, lint and English UI checks pass. Budget runner selftest makes no requests. Per-run raw data, transcripts, manual score arrays, usage summaries and invariant audits are retained under claude-cycle1*,claude-cycle2* and claude-cycle3*. See claude-three-cycles-2026-10-30-summary.json for the budget ledger. The initial cycle1 audit had52 checks; cycle2 adds the repayment-obligation check and correctly flags its failure; final combined audit66/66 includes fresh cases. Do not compare audit pass counts as a quality percentage.

Reproduce offline with bun scripts/cycle-report.ts; individual scores with bun scripts/reeval-grade.ts LABEL; transcripts/usage with bun scripts/claude-eval-summary.ts LABEL; invariants with bun scripts/cycle-audit.ts LABEL. Combined cycle3 is a manifest-like concatenation of its two disjoint raw parts, not an additional model run.

Pricing uses the same verified short-context Haiku5.5 rates: input$0.10/M, five-minute cache writes$0.125/M, reads$0.01/M and output$0.50/M; all prompts below100k. [Claude model pricing](https://platform.claude.com/docs/en/models/haiku-5-5/overview). No OpenAI fallback, paid grader, chain execution, merge or deployment. Runtime snapshot is23a541b; later commits add reporting/tests only.

Final production build passes; existing dependency annotation and large-bundle warnings remain. Evaluation artifact scan found no configured OpenAI/Anthropic credential values.
