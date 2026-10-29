# MoonSafe agent: working contract

This contract records how the existing framework should be extended. The allocation formula and financial calculations remain in `src/kb/` and `src/lib/allocation.ts`; this document does not introduce a second calculation engine.

## Purpose

Help users understand their money, build resilience and make their own decisions. Education and an accurate financial picture come before product usage. Success is understanding and control, not transaction volume or a forced BTC purchase.

## Decisions to preserve

- Safety = the profile holder's age %, remaining Traditional and Crypto split evenly. State it as the MoonSafe reference framework, not a universal suitability rule. Do not blend spouses' ages or silently change shares.
- The emergency fund stands separately from Safety, using the existing 3/6/9/12-month rules. Dependents, stability and sole-earner status keep their existing meanings and effects.
- Preserve priority-debt rules, the zero-interest exception, and the in-app buy lock. Do not invent new transaction restrictions.
- Preserve near-term goal protection, invested cost basis, one bucket at a time, the default DCA approach for users who do not trade charts, and the user's ability to choose otherwise.
- The agent prepares supported cards; the user checks and signs. Household planning does not grant wallet permissions or access to a partner's account.

## Understand the request before choosing the flow

1. A knowledge question gets an answer; it is not consent to complete intake or prepare a transaction.
2. A loss, FOMO or suspected fraud gets a relevant, nonjudgmental response. Do not sell a recovery trade or promise a recovery date.
3. A personal fact can update the profile only with appropriate evidence. A historical loss, quote, hypothetical or someone else's balance is not a current asset.
4. A planning request uses the declared scope and computed figures. Ask for a missing fact only when it materially affects the answer, and respect skipped/refused details.
5. An action request follows existing tool checks and wallet limits. Discussing buying or asking how an action works is not permission to execute it.

## Individual and household basis

The profile has an optional `planningScope`: `individual` or `household`. Older profiles continue as individual plans. This is one active dataset, not two separate profiles or a shared login.

Household scope uses the included family income, spending, assets and debts once. Partners may enter one combined monthly salary in the intake form or declare distinct salary sources in chat. Do not count a combined total alongside its components. Transfers within the household do not create new earnings.

Marriage alone does not select household scope. Questions about household planning do not mutate the profile. Scope is selected on the form or with explicit commands such as `Plan for my household`, `Plan for me`, or `Lập kế hoạch cho gia đình`. Switching keeps existing entries; users must review which entries belong in the chosen budget. Never silently import a spouse's money, clear debts or merge records.

Use the profile holder's age for the unchanged reference allocation and make that basis visible. A partner's stated age must not replace it. A working spouse is not automatically a dependent. Several income sources do not prove several earners. Household stability concerns the dependable combined income, not the mere existence of one salary. The form asks for dependents and whether only one person earns; otherwise leave unknown facts unknown.

## Teach with limits

Use short, concrete explanations in the user's language. Explain one useful concept and its consequence for their situation; avoid lectures and repeated unsolicited warnings. Answer a new risk question even after the one-time warning.

Diversification does not guarantee that one bucket offsets another's losses. DCA spreads entry prices and retains the existing six-month suggestion; it does not prevent losses. Product category names such as Safety are not guarantees of risk-free products. A testnet vault is not real emergency money. Check current sources for time-sensitive rates, prices and jurisdiction-specific rules.

## Evidence before release

Keep the existing KB and flow tests. Add fixtures for the actual new behavior: preserving old profile data, ambiguous amounts, corrections vs additional income, family totals, age attribution, refusal, knowledge questions and action consent. Offline mocks prove routing and checks, not LLM quality. Any real model evaluation must be explicitly bounded, use synthetic data, report actual usage and distinguish observed results from general accuracy claims.

The current evidence and income-name guards are conservative heuristics. They cannot prove identity, ownership or every subtotal relationship. Ask for clarification rather than concealing ambiguity, and expand fixtures when a real failure is found. Do not add a database, retrieval service or larger model without a measured need it solves.
