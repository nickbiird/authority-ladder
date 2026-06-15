# Concept — why this project exists

> The Phase-1 decision memo. Recorded so the "why this, and why not the alternatives" survives the build.

## The pick: an agentic AI-transformation triage copilot

**Outcome it sells:** a transformation lead drops a backlog of candidate AI use cases and gets a defended, priced, prioritized roadmap — per use case: an AI-or-not verdict, a place on the autonomy ladder (sized to cost-of-error), a defended architecture, an EU-AI-Act risk tier, and a cost-per-task. It productizes the consulting motion *diagnose → architect → defend → price* over a portfolio of use cases, and it answers the 2026 C-suite question — **"where do we grant AI the authority to act?"** — rather than the solved "can AI assist?".

## Why this shape

Three selection forces converged:

1. **It exercises the architecture richly.** It is the only candidate that needs *both* a supervisor over isolated read-side specialists *and* a guarded, single-threaded write path. That combination claims the two biggest gaps in the surrounding portfolio: the first **multi-agent** repo (the read side) and the first **write-enabled agent with structural containment** (the write side). Architectural security on a mutating action is the named blocker on every enterprise deployment.
2. **It has a crisp, honest eval target.** AI-or-not, autonomy tier, and risk tier are *labelable* classifications, so a golden set can score them per-component — which makes the appreciating skill (evaluation engineering) the centre of the repo, not a bolt-on. The distinctive move is that ~⅓ of honest answers are "this isn't AI, it's a SQL view," which is a clean, scoreable classification *and* the credibility move of the whole genre.
3. **It is maximally on-thesis and distinct.** "AI-Driven Organizational Transformation" is a problem type, not an industry; this tool is that problem type, productized. It is deliberately *not* the sibling `ai-act-triage` (one compliance tier, read-only) — this is the multi-dimensional, write-enabled build-and-authority question, and the README states the complementarity.

## The 3-2-1 on the three headline choices

| Choice | 3 failure modes | 2 rejected alternatives (+ flip) | 1 number |
|---|---|---|---|
| Supervisor → 3 isolated specialists (read-side) | misroute (highest-leverage prompt); context bleed; loop/token burn | one mega-prompt (flip if routing eval ≥ specialists); parallel *write* agents (flip never — ~⅓ coordination tax) | route accuracy gated on the golden set; max-iterations + token cap |
| Hybrid retrieval over a clean-room pattern corpus | paraphrase gap (BM25-only); fragment context; RRF pollution by a weak leg | dense-only (flip if the scorecard shows BM25 net-negative here); GraphRAG (flip on multi-hop, with the token-cost caveat) | BM25 baseline measured at **69.2% recall@5** |
| Durable HITL + single-threaded `commit_roadmap` | ephemeral approval dies with the process; agent self-authorizes the write; injection in a retrieved card triggers commit | in-memory `await input()` (flip never); write-as-a-tool (flip never) | gate survives restart (Postgres checkpointer); write gated on user intent, asserted by the containment probe |

## The two alternatives, and why they lost

- **`pilot-to-scale` ("why your AI pilots stall").** Most consulting-legible, but the eval target is fuzzy — "why it stalls" is far harder to label than AI-or-not — the write-action is weaker, and it risks reading deck-like rather than buildable.
- **`vendor-decoder` (build-vs-buy across Bedrock/Foundry/Vertex/AI-Refinery).** Genuinely differentiated IP and very legible, but vendor capabilities drift fast (the corpus rots), the "irreversible action" for the gate is artificial, and the build/buy verdict is subjective, so the eval is contestable.

The pick won on all five selection criteria at once: crispest eval, richest architecture exercise, most distinct from the existing repos, most on-thesis, and it claims the appreciating skill (write-path architectural security) that no sibling repo covers.

## Price (the CFO line)

≈ €0.02–0.05 per use case [to be confirmed from real token traces on the owner's recorded run] → a 40-item backlog triaged for ~€1–2 and seconds, against days of senior transformation-consultant time. It prices the **triage decision** — which pilots deserve the build, at what autonomy — not the build.
