# Reevaluation protocol: user target 8/10

Target requested by the owner: **at least 80/100 with no observed P0/P1**, using the same six dimensions and weights as [the original rubric](framework-rubric.md). The original rubric's proposed 85 threshold is superseded by the owner's 80 target for this run; the evidence and critical-failure gate are retained. Do not alter weights or lower individual judgments to manufacture a pass.

Keep the previous 67/100 score and raw run immutable. Reevaluate the deployed application commit `d1e3a1a` locally through the real handler with the same synthetic wallet/FX fixtures. Score outputs and actual saved state, not prose alone. No wallet execution, production profile mutation, private user examples, fallback provider or paid judge.

Run the same 22 original conversations and six newly written wording variants, subject to an explicitly authorized new token ceiling. Prioritize the known high-impact failures and new variants. Report coverage and partial conversations. Compute separately:

1. Same-case comparison on complete cases shared with the original scored set.
2. New wording variants, written before seeing the new outputs.
3. Overall ordinal score on all complete reviewed conversations.

The desired 8/10 claim requires both the comparable original set and new variants to average at least 80, with no observed P0/P1. A small budget that only covers selected cases yields a limited, provisional result rather than a full readiness claim. The reviewer is the same Codex agent who implemented repairs; this is not blinded or independently human-calibrated. Do not call the result an accuracy probability or certification.

All input/output tokens, including cached input, count against the approved ceiling. Reserve before each model dispatch and stop on provider error or unknown usage. New runs must have separate output names, never overwrite previous evidence, and share the total budget authorized for this reevaluation. Repairs after a failed run go to a review branch; they require a distinct follow-up result within the remaining authorized ceiling before being called verified. No automatic merge or deployment follows from an evaluation request.

Before paid execution: offline 284 checks and actual-chat-handler typecheck pass. The new runner's budget/dataset selftest makes no network calls. The owner selected offline-only evaluation. No new API run is authorized or executed; the live runner and six conversation variants are prepared for possible future use only. Offline outcomes cannot establish the 8/10 live-conversation target.
