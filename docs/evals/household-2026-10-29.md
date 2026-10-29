# Household planning and framework continuity — 2026-10-29

Continuation of review branch `codex/finance-coach-depth` / PR #30, based on `def8654`.

## What changes

- Optional persisted `planningScope` in the existing v2 financial profile. Existing profiles and amounts remain intact; no schema reset or new database.
- The existing six-card intake offers **Just me / Household**. Household labels cover combined salary, shared spending, income stability, dependents and one vs multiple earners. The age field explicitly uses the profile holder's age.
- A short explicit scope command is handled after authentication/quota checks, without model/FX calls. A question about combining finances does not select a scope or force intake.
- Planner/reply context and deterministic plan/status text retain household scope after history is shortened. The scope survives profile normalization and normal profile synchronization.
- A spouse's salary no longer falls through to updating the single generic legacy `Income` line. Combined totals and their component incomes of the same kind cannot silently coexist. Primary salary corrections to a legacy line remain supported; an explicitly additional side job can remain additional.
- A new partner income in an individual plan requires scope clarification. A spouse's age and a working spouse's presence cannot silently become the profile age/dependent count in a household plan.
- Existing deterministic DCA/diversification explanations now avoid implying guaranteed safety or guaranteed offsetting losses. Formula, target amounts, default schedule and user choice are unchanged.

See [the framework working contract](../AGENT-FRAMEWORK.md) for the preserved decisions and [the mobile preview](household-mobile.png).

## Tests and manual verification

- `bun run eval:education`: **225 offline checks pass**, including the previous education/coaching tests and new household persistence, totals, form, explicit scope, age/dependent attribution and deliberately incorrect planner calls.
- `bun run flow` and `bun scripts/kb-check.ts`: existing flow, formula, floor, debt and lock regressions pass.
- `bun run typecheck:education`: passes for the statically imported knowledge/coaching/household and eval code.
- Changed-file lint: no errors; existing unused-plan-variable and ChatScreen effect warnings remain. `node scripts/check-lang.mjs` passes.
- Production `bun run build` passes with existing dependency/bundle warnings. Whole-repo typecheck still reports the existing readonly-connector issue in ignored `src/preview-main.tsx`; that file is untouched.
- Real browser, isolated React fixture with synthetic values: verified desktop viewport 1280×720 and mobile 393×852, selected Household, entered age 34 / combined salary 3500 / spending 1200 / two dependents / multiple earners, completed all six cards and verified saved values. The income fields scroll within the existing fixed-height card. No Privy login, wallet interaction, production save or model call. Temporary fixture/server/tab were removed afterward.

No paid model calls were made for this continuation. This verifies deterministic behavior, not general LLM accuracy or production deployment. Earlier coaching live evidence remains a separate checkpoint.

## Synthetic financial example

Two salary rows of $2,000 and $1,500 produce $3,500 monthly income; $1,200 spending plus a $100 family-loan payment produces $1,300 spending, counted once. Stable household income with dependents gives the unchanged six-month floor: $7,800. Under the existing irregular-income rules it becomes nine months with multiple earners or twelve with a sole earner. Switching scope does not change the age-34 reference targets or silently alter holdings/debts.

## Limits

This provides a household planning basis, not separate personal/family ledgers, joint vault ownership, partner logins or consent to access another person's account. Switching scope retains the same records and requires review. Combined-income/source-name checks are conservative and operate within the income kind; ambiguous totals, currencies, ownership or component breakdowns can require clarification. Names alone cannot establish legal ownership or distinguish every real-world source.

Using the profile holder's age is an explicit compatibility decision, not a new claim that one person's age scientifically determines a couple's suitable portfolio. Users can discuss their circumstances; the agent must not invent an averaged-age formula.

The mobile screenshot and example contain synthetic data only. Sources checked for the explanation changes: [Investor.gov diversification](https://www.investor.gov/introduction-investing/getting-started/asset-allocation) and [Investor.gov DCA](https://www.investor.gov/introduction-investing/investing-basics/glossary/dollar-cost-averaging), 2026-10-29. These sources do not endorse MoonSafe's formula.
