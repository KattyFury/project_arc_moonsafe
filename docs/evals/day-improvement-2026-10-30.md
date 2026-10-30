# Agent improvement session — 2026-10-30

Two repair/evaluation iterations were completed using synthetic conversations and the real chat handler with Claude Haiku (`claude-haiku-5-5`). No wallet action was executed. The selected sample shows improvements in explanations, but does not establish an overall score improvement or release readiness.

## Accounting

| Run | Verified tokens, including cache | Unknown usage reserved | Complete turns | Stop |
|---|---:|---:|---:|---|
| A | 0 | 30,072 | 0 | Restricted network |
| B | 591,373 | 0 | 23 | Budget reservation |
| C | 345,606 | 0 | 13 | Budget reservation |
| Total | **936,979** | **30,072** | **36** | **967,051 / 1,000,000 accounted** |

There were 98 provider responses with usage and one failed attempt without known usage. The remaining 32,949 tokens were not dispatched: the conservative per-request reservation prevents reliably completing another multi-call turn within this ceiling. Partial turns are retained and excluded from completed-turn counts. The two iterations repeat scenarios and are not independent samples. Run B completed seven scenarios; run C completed four repeated scenarios plus the first turn of another. This is eleven completed scenario executions, not eleven distinct scenarios.

The runner now preserves requested case order, rejects duplicate selections and records a hash of the runtime source diff, since the evaluated changes are uncommitted. Each raw file records HEAD and source-diff hash. The local Node loader enables the existing TypeScript harness on this Windows machine without Bun. Run with `--conditions=browser` so JOSE uses the intercepted Fetch API, matching the Workers environment; without it, Node JOSE uses its own network transport and synthetic JWT verification fails. No production auth rules were changed.

## Changes and evidence

- Added educational guidance for concrete examples and accumulation timing. Both iterations explicitly explain that saving 200,000 VND per month from zero reaches 1,000,000 after five months, assuming no withdrawals, and cannot pay today's bill.
- Separated a computed emergency target from pending savings. In run B, the sole-earner household retains its confirmed 21,600 target while its 5,000 savings declaration awaits confirmation. Run C did not finish that follow-up, so the final revision has no complete live recheck for this scenario.
- Explained that pooling household money is an agreement and private salary/balance remain unknown. Added cadence guidance after run B incorrectly described an unspecified contribution as monthly. Run C correctly distinguishes monthly from one-time contributions, but introduces a separate unsupported statement that private money "isn't zero". Unknown could be zero or nonzero; this remains an observed failure.
- Added guidance that affordability includes required debt payments and near-term goals. Run C's phone-purchase check explicitly mentions both, unlike run B.
- Corrected length-rewrite guidance that previously demanded a question even when the turn should end after answering. Live results still show repeated rewrites and excess length; no efficiency improvement is claimed. The comparable three new scenarios used 214,142 tokens in B and 236,474 in C.
- Run B's dedicated testnet scenario clearly says testnet USDC cannot cover real household bills. No actions or mutations were emitted in either run's nine fresh illustrative turns.

## Verification

Offline education/coaching/household: 296 checks pass. Response/mutation suite: 93 pass. Focused evidence probes: 35 pass. Scoped TypeScript, production build, English UI check and diff whitespace check pass. Build retains dependency annotation and bundle-size warnings. The generated live audit passes 21/22 narrowly defined checks, with the private-balance claim deliberately failing; these checks are not a quality percentage or complete semantic review. No paid grader was used.

## Remaining work

Unknown-versus-nonzero phrasing needs enforcement; lengthy replies, unsolicited offers to continue, and excessive numeric-grounding rewrites remain. The novice example can allocate every remaining dollar to wants without accounting for unlisted essentials. Saving-first wording still appears despite the added essentials-first guidance. Broader original-suite coverage, card interaction and an independent review are outstanding. Budget limits stopped this session's paid loop; additional paid iterations are not running in the background.

Raw results, complete/partial transcripts, source hashes and the consolidated ledger are adjacent to this report under `day-improvement-*`. Rebuild the ledger with:

```
node scripts/day-eval-report.mjs day-improvement-a-2026-10-30 day-improvement-b-2026-10-30 day-improvement-c-2026-10-30
```

No deployment or commit was made.
