# Second repair pass: fund evidence and cheaper education

## Concrete before/after evidence

The prior candidate b73e543 was replayed offline through a temporary copy of its chat handler, with the new regression fixture. A declared $900 monthly expense and stable income, but unknown dependents, still produced a three-month/$2,700 floor in the reply model context. The new test failed on the prior handler (exit 1). Temporary files were removed.

The repaired handler passes that same fixture: the target is unknown, dependents are named as missing, and no $2,700 default target appears in the reply figures. The test also caught a second leak through the buy-lock explanation; that amount is now withheld too. Advice on using idle money is withheld while the personalized fund target is unresolved. A final-output check rejects a personalized target from those defaults if the model still proposes it; persistent failure uses the existing honest fallback.

For an irregular-income household with dependents, the framework chooses nine or twelve months depending on sole-earner status. That status must now be known before quoting one target. The underlying formula and transaction locks are unchanged. With stable income, explicitly zero dependents and $900 spending, the original $2,700/three-month result remains available and passes the positive control.

## Cheaper, more focused teaching

Added a reviewed standalone needs-versus-wants lesson in English and Vietnamese, including one private practical exercise. Exact supported questions use zero model calls, no price/FX fetch, no profile mutation and no card. Compound questions containing income declarations, action requests or override instructions still reach the guarded agent. This extends the existing lesson mechanism without new infrastructure.

Lesson source checked 2026-10-29: [FCAC, Making a budget](https://www.canada.ca/en/financial-consumer-agency/services/make-budget.html), especially needs/wants and context-dependent essentials. The practical single-purchase exercise is a local teaching choice based on that distinction.

## Validation and limits

- Response regressions: 75 checks pass, up from 51 (24 additional checks).
- Education/coaching/household suite: 296 checks pass, up from 284 (new lesson coverage).
- Scoped TypeScript, lint and English UI checks pass.
- All model requests were mocked; zero new paid calls. No production user data, transactions, merge or deployment.

This is evidence of specific workflow and context improvements, not a new live model score. The frozen Claude evaluation remains 78.75/100. The numerical output check is a narrow heuristic and can miss paraphrases or reject some legitimate examples. The changes govern reply context and response validation; default calculations remain in the underlying framework/app, and this does not claim every possible route through planning has been eliminated. A complete live comparison still needs its own authorized budget.

Reproduce using bun scripts/response-quality-check.ts and bun scripts/education-eval.ts. Raw current regression summary: response-quality-offline-2026-10-29.json. Earlier repair evidence remains in response-quality-repairs-2026-10-29.md.
