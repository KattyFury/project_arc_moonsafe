# Repairs from the live finance-agent evaluation

The 67/100 report remains the frozen score of commit `88ec416`. These changes address observed failures; they do not establish a new live score.

## Framework research and what was adopted

Reviewed 2026-10-29:

- [OpenAI Agents SDK, TypeScript](https://github.com/openai/openai-agents-js) — GitHub displayed approximately 4k stars. [Official guardrail guidance](https://developers.openai.com/api/docs/guides/agents/guardrails-approvals) distinguishes input, tool and output validation, and places side-effect checks at the tool boundary.
- [LangGraph](https://github.com/langchain-ai/langgraph) — GitHub displayed approximately 44.1k stars. Its stateful workflow design separates conversation state from individual model responses. Popularity is context, not evidence of financial accuracy.

Applied these design patterns in MoonSafe's existing TypeScript loop: explicit per-turn workflow policy, validation before mutation/action tools, reconciliation of supported facts, computed target responses and saved regression traces. No source code was copied. No claim that the OpenAI Agents SDK or LangGraph runtime was installed: swapping the runtime would add migration/dependency work without itself validating financial units. Existing model, provider fallback, quotas, client profile format and signature flow remain in place.

## Changes

- **Dimension checks:** market quantities need explicit matching coin/share/weight units. A dollar number occurring in the message is insufficient. A BTC investment cost declared separately from current market value is preserved as cost; the known English dollar-cost declaration is also recovered if the planner omits it.
- **Workflow state:** explicit education/listening/no-form instructions are carried through the supplied user history. Questions are answered before onboarding; placement confirmations and transaction tools are blocked for explanatory questions. Explicit new action requests can override the prior conversation preference; the existing transaction guards/signatures still apply.
- **Fact reconciliation:** after the planner, narrowly parsed current declarations are proposed through the same guarded tool handler. Covers explicit own age, age refusal, stable income, supported spouse/children with financial/sole-earner context, no debts/no near goal, current savings, and specific short-term goal declarations. This is not a general natural-language parser. Multiple candidate savings accounts are left unresolved rather than silently choosing one.
- **Age preference:** a normal chat response after intake no longer becomes an age refusal. An explicit refusal, or the existing app event indicating reviewed/skipped intake items, can retain the prior default-age behavior.
- **Household:** recognizes the natural Vietnamese disclosure “Nhà mình hai vợ chồng” and the holder's “I am married and 38”. Working spouses are still not automatically dependents; explicit individual scope still wins.
- **Computed answers:** direct fund-target questions use app calculations and distinguish vault balance from outside savings. Missing spending/stability/dependent facts prevent a definitive target. Explanatory deposit questions with unknown target cannot invent an X-of-Y gap or prepare a transaction.
- **Prompt conflicts:** suppress full-plan instructions, collection questions, promotional pattern briefs and forced cirBTC-offer checks when the user is asking or wants conversation only. Preserve the existing output checks and rewrite allowance; no extra paid classifier/judge is added.
- **Confirmation mapping:** keep the automatic household-scope readback aligned with its operation, so existing-profile confirmation items do not associate the wrong operation with a label.

The allocation formula, invested-cost principle, emergency-fund month rules, debt exceptions and user choices are preserved. No automatic migration guesses whether an old holding was corrupted; historical data needs review, not blanket rewriting.

## Verification

- **284 offline education/coaching/household checks pass** (252 previous plus 32 new assertions), using the real handler with local authentication and fake/hostile model calls. New assertions cover USD-versus-BTC, cost-versus-market-value, omitted USD/VND savings, real versus unstated age refusal, listening/no-form, hypothetical transfer versus recording card, explicit deposit consent, unknown target, 12-month/$21,600 family target, saved tuition goal and natural Vietnamese family scope.
- Existing flow suite and KB suite pass: 26 patterns, 27 personas, 14 profiles; formula/debt/lock compatibility remains covered.
- Education/eval typecheck and the new scoped **chat handler typecheck** pass. The latter imports the actual chat code and its dependencies with a minimal type-only Pages context for the price endpoint. Changed-file lint and language check pass.
- Production build passes with existing dependency-annotation and bundle-size warnings.
- A targeted live smoke attempt was **blocked before dispatch**: the remaining 27,035 tokens from the original one-million-token ceiling were smaller than the conservative reservation for the next request. **Zero calls and zero additional paid tokens**. [Recorded attempt](guardrail-smoke-2026-10-29.json). It is not a live pass or evidence of model quality improvement.

## Remaining limitations

Conversation-only memory currently follows the supplied history (at most 30 messages), not a new permanent preference store. Phrase recovery is intentionally narrow; unrecognized language, ownership ambiguity and different currencies can still require clarification. Quantity validation can reject an abbreviated quantity and ask for units. Some explanations still depend on model adherence after output checks, which are not a proof of factual correctness. The broader live dataset must be rerun under a separately authorized budget before claiming a new score or general reliability. Baseline trace files and scores are unchanged.
