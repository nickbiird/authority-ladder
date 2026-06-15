# Golden-set rubric

This set has **24 labelled use cases**, split on purpose:

- **16 core** cases (`core-*`): labels fall near-deterministically out of the
  AI-or-not gate and the EU AI Act tier families. `core` accuracy measures **the
  system**.
- **8 contested** cases (`contested-*`): genuinely arguable — Article 6(3)
  derogation edges, the act/act-with-approval boundary, the RAG/long-context
  boundary. These are labelled against **one documented reading**, written in
  each case's `note`. `contested` accuracy measures **agreement with that
  reading**, not ground truth. Conflating the two numbers is how a triage demo
  lies; splitting them is the honest alternative.

## What each label means

### `ai_or_not` (the headline classification)
The five-way verdict. Scored **exact-match**. The taxonomy:

| Label | Tell |
|---|---|
| `none` | Enumerable path over structured data → a SQL view / workflow. ~⅓ of intake. |
| `classical_ml` | Prediction over tabular history; need calibrated probabilities + feature importances. |
| `single_llm` | One-shot transform of text already in hand; knowledge is in-prompt or in-weights. |
| `rag` | Answer lives in private/changing documents (or a SQL schema) and must be grounded/cited. |
| `agent` | Genuinely data-dependent multi-step tool use that cannot be drawn as a fixed DAG. |

### `autonomy_max` (the safety ceiling)
The **highest** tier the use case may be granted, given its cost-of-error and
reversibility. It is scored as a **ceiling, not an exact match**: the system
passes if its recommended tier does **not exceed** `autonomy_max`. This is the
deterministic safety property — over-granting authority is the failure that
matters, and the `autonomyCeiling` clamp in `lib/ladder.ts` enforces it. (Under-
granting is conservative and allowed.)

Ladder order: `suggest` < `draft` < `act_with_approval` < `act`.

### `risk_tier` (the governance input)
EU AI Act tier — `prohibited` / `high` / `limited` / `minimal`. Scored
exact-match on `core`, agreement-with-rubric on `contested`. This is **one
lightweight governance input** to the triage, not a full compliance assessment
(see the sibling repo `ai-act-triage` for the deep version).

## Why the contested cases exist

Each contested case has a near-twin in the core set, to expose the boundary:

- `core-11` (CV **scorer**, high-risk) vs `contested-03` (CV **parser**,
  derogation → minimal) — the Article 6(3) profiling line.
- `contested-08` (small static handbook → `single_llm` long-context) vs
  `core-04` (HR policy library → `rag`) — the over-engineering line.
- `contested-05` (auto-approve refunds) — the `act` vs `act_with_approval` line
  on bounded, money-touching actions.

A system that gets every contested case "right" is probably overfit to this
rubric; ~70% agreement on the contested split is the honest target. The
disclosed expectation is that the system errs **toward caution** (a stricter
tier / more human oversight than the label) — for a triage tool that decides
which pilots deserve scrutiny, over-routing to review is the correct asymmetry.
