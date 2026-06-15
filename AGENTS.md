# AGENTS.md — contract for an AI agent continuing this build

You are picking up a multi-agent, write-enabled triage system built on LangGraph.js + Next.js. Read this before editing. It tells you the design contracts (what must not break), the seams (what's meant to be swapped), and what "improving it" actually means here. The human-facing tour is `README.md`; the box-by-box failure map is `ARCHITECTURE.md`; the why-this-project is `CONCEPT.md`.

## Orientation (read in this order)
1. `lib/types.ts` — the contract layer. Every agent→code boundary crosses a Zod schema here, including `evidence` (what the specialist actually retrieved — the judge grounds on this, not a re-search) and the three classifications (`AiOrNot`, `AutonomyTier`, `RiskTier`).
2. `lib/graph.ts` — the topology + the per-item self-loop + the nodes. The whole control flow is one screen: `guard → supervise → triage_one* → gate → commit_roadmap`.
3. `lib/ladder.ts` — the deterministic governance layer: the autonomy-ceiling clamp + the obligations. The model decides; this code enforces. Never move the clamp into a prompt.
4. `evals/` — the point of the repo. `retrieval.ts` (deterministic CI gate), `run.ts` (per-component, record/replay), `probes.ts` (security gate), `score.ts` (the evidence-grounded judge), `golden/` (the labelled set + rubric).

## Design contracts (do NOT break these — they are the lessons the repo exists to teach)
1. **Eval-first.** Any new capability ships with a golden case that exercises it and a scorer. The three components (retrieval / diagnosis / answer) are scored independently — keep that separation; it's how you localise failures.
2. **Single-threaded writer.** There is exactly one path to the one irreversible action (`commit_roadmap`), and it goes through the human gate. Do **not** add parallel write-agents. Multi-agent is allowed only for the read-side specialists.
3. **The dangerous action stays out of the agent loop.** `commit_roadmap` runs only after `gate` approves. Never expose "commit/publish/execute" as a tool a specialist can call. The `containment:writer-only-after-gate` probe asserts this on the compiled graph — if you refactor the topology, that probe must still pass.
4. **Durable HITL.** The gate is `interrupt()` + a checkpointer, resumed via `Command(resume=...)`. If you "simplify" it by reading input inside a node, you've rebuilt the ephemeral pattern this repo contrasts against. Don't.
5. **Binary rubrics, never numeric.** The critic and the eval judge return pass/fail + a critique. 1–5 scales drift; banned here.
6. **Structured outputs at every boundary.** Every agent→code handoff is a Zod model. The architect's 3-2-1 is enforced *by the schema* (`min(3)` / `min(2)`), not by hope.
7. **Clean-room data only.** `data/patterns/` is synthetic, vendor-neutral enterprise-AI knowledge. Never add real client data, real PII, or anything from outside this repo. It is open-sourceable by construction.
8. **Ground the judge on captured evidence.** The critic and the eval judge grade against `state.evidence` — the passages the specialists actually retrieved — NOT a fresh search of the raw query. A re-search breaks on the verb-heavy, multi-classification verdicts here. If you add a specialist, populate `evidence`.
9. **The autonomy ceiling is deterministic.** `lib/ladder.ts::autonomyCeiling/exceedsCeiling` clamps an over-granted tier in code. The model may argue for `act`; cost-of-error decides. This clamp is a safety property and a CI gate.

## Seams (these ARE meant to be swapped)
- **Corpus:** `data/patterns/*.json` (authored `PatternCard`s) → `npm run ingest` → `data/corpus.json`. Add/edit cards, re-ingest, re-embed. Don't edit `corpus.json` by hand (CI checks it's fresh).
- **Reasoning provider:** `LLM_PROVIDER` (`anthropic` default | `google`) in `lib/llm.ts`. Anthropic tiers = `ANTHROPIC_MODEL_FAST`/`_DEEP` (Haiku 4.5 / Sonnet 4.6); Google tiers = `GEMINI_MODEL_FAST`/`_DEEP`. The SDKs read their key from the env (`ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`) — `structuredCall` is provider-agnostic, so graph/eval code never branches on provider. **Embeddings are decoupled:** only Google has an embeddings API, so dense retrieval needs `GOOGLE_API_KEY` regardless of `LLM_PROVIDER`; without it, retrieval is BM25-only (the degradation handles this).
- **Retrieval default:** `lib/retrieval.ts` — the default mode is `hybrid`; the scorecard decides whether to keep it. If `dense-only` wins on this corpus, flip the default and keep `hybrid` as a measured config (don't delete the trade-off).
- **Checkpointer:** env-gated via `getCheckpointer()` (`DATABASE_URL` set → `PostgresSaver`, else `MemorySaver`). The factory degrades safely.
- **Golden set:** `evals/golden/cases.json` + `RUBRIC.md`. Harden the DATA when accuracy is suspiciously high; never write unfair questions to hit a number.

## Current state (2026-06-15)
- **Compiles + typechecks clean; `next build` green** (6 pages, 3 API routes incl. the MCP server).
- **Offline tests 20/20**, **security probes 10/10** (incl. the compiled-graph containment assertion).
- **Retrieval scorecard fully recorded (all three legs, committed):** bm25-only 69.2% / dense-only 66.7% / **hybrid 71.8% recall@5 (MRR 0.847)** over 24 cases. Hybrid is the measured winner here — embeddings (`data/embeddings.json`, 29 vectors) are committed so dense/hybrid work on a clone + key.
- **Runtime loop validated end-to-end with stubbed models**: the self-loop triages the whole backlog, pauses at the durable gate, resumes and commits; the autonomy clamp fires (agent + high cost-of-error → `act_with_approval`); the not-AI path routes to `do_not_build` with a null architecture.
- **The schema layer is verified against the live Gemini API** (the first `--record` attempt surfaced two real issues, both fixed): (a) Gemini's `response_schema` rejects `.nullable()` (list-valued `type`) → `Economics.cost_per_task_eur` is now `.optional()`; (b) the embed endpoint needed its own 429 backoff (`lib/retrieval.ts`) + `maxRetries` on the generation model (`lib/llm.ts`); (c) standalone scripts/evals now load `.env` via `lib/loadenv.ts` (Node's built-in `loadEnvFile`).
- **The classification + cost rows are NOT recorded yet** — the available API key's prepayment credit was depleted partway through the first real run (it got through core-01..04 cleanly, proving the pipeline works, then 429'd on credit). The eval now records partial progress honestly and stops early on a credit/quota error (`evals/run.ts`), so the next attempt with a topped-up key keeps what it gets. This is the one open item, stated in the README, not a hidden gap.

## High-value next steps (in priority order, if asked to extend)
1. **Record the assessment fixtures** with a key that has credit: `npm run evals -- --record` → `npm run trust-report` → commit. This is the one thing between the repo and a complete scorecard. The pipeline + schemas are already proven live (4 cases ran clean before the credit ran out); this just needs credit.
2. **Verify the Postgres durable-gate path live** — the seam is wired and env-gated but unexercised against a real DB; stand one up, run the pause/restart/resume cycle, capture it.
3. **Token-streaming the architect's prose** (`astream_events`) — deferred; node-level SSE already gives the live per-item stepper.
4. **A real cross-encoder reranker** after RRF once a model is installable, for a larger corpus.

## Validation
- `npm run typecheck` — types.
- `npm test` — offline tests (corpus, retrieval, PII, ladder), no key.
- `npm run evals:retrieval && npm run evals:probes` — the deterministic CI gates, no key.
- `npm run evals -- --record` — the real acceptance test; needs a model key.
- `npm run build` — the Vercel build, locally.
