# Changelog

## 2026-06-15 — live-API hardening + retrieval recorded

Took the build to the live Gemini API. The first `--record` attempt surfaced two real, fixed issues, and recorded the full retrieval scorecard before the key's credit ran out.

### Fixed (found by running against the real API)
- **Gemini `response_schema` rejects `.nullable()`** (it compiles to a list-valued `type`, which the proto refuses). `Economics.cost_per_task_eur` is now `.optional()` — every consumer already handled the absent case via `?? ` / `!= null`. All five structured-output schemas re-verified clean.
- **Embed endpoint had no retry.** Added exponential backoff with `Retry-After` support to the query-embed call (`lib/retrieval.ts`) and `maxRetries: 6` on the generation model (`lib/llm.ts`), for free-tier 429s.
- **Standalone scripts/evals didn't load `.env`** (only Next.js did). Added `lib/loadenv.ts` (Node's built-in `loadEnvFile`, no dependency) wired into the script entrypoints.

### Recorded
- **Embeddings generated + committed** (`data/embeddings.json`, 29 vectors, gemini-embedding-001 @ 768d) so dense/hybrid retrieval works on a clone + key.
- **Retrieval scorecard, all three legs:** bm25-only 69.2% · dense-only 66.7% · **hybrid 71.8% recall@5 (MRR 0.847)**. Hybrid is the measured winner on this corpus; the trust report now states the verdict from the data.

### Resilience
- The assessment eval now records partial progress and **stops early on a credit/quota error** instead of losing everything (`evals/run.ts`); the scorecard self-describes as `partial`. The retrieval scorecard degrades dense/hybrid legs to "skipped (reason)" on a dead key rather than crashing.

### Still open
- **Classification accuracy + cost rows not recorded:** the available key's prepayment credit depleted partway through the first run (core-01..04 ran clean — the pipeline + schemas are proven live — then 429'd on credit). Re-run `npm run evals -- --record` with a topped-up key to complete; the partial-resilience means progress isn't lost.

## 2026-06-15 — initial build

The first end-to-end vertical slice: a multi-agent, write-enabled AI-transformation triage system, built to the design contracts in `AGENTS.md`.

### Built
- **Domain + contract layer** (`lib/types.ts`): the autonomy ladder, the AI-or-not gate, the EU-AI-Act risk tier, and a Zod schema at every agent→code boundary (the 3-2-1 is enforced *by* the architect's schema).
- **Deterministic governance** (`lib/ladder.ts`): the autonomy-ceiling clamp (a high-cost-of-error action can never be granted full autonomy, in code), plus tier obligations as code, not model output.
- **Clean-room pattern corpus** (`data/patterns/`, 29 cards across 5 categories): AI-or-not rubrics, autonomy-ladder tiers, 10 reference architectures, EU-AI-Act governance tiers, adoption-failure patterns. Synthetic, vendor-neutral, open-sourceable. 19 cards authored by a fanned-out workflow against the `PatternCard` schema; the 10 architecture cards authored directly (the workflow's architecture agent hit a session limit). `npm run ingest` compiles + validates them.
- **Hybrid retrieval** (`lib/retrieval.ts`): BM25 + dense + RRF, with a per-category filter that isolates each specialist's context. The default is the measured winner; BM25-only is the deterministic, no-key CI gate.
- **The graph** (`lib/graph.ts`): `guard → supervise → triage_one* → gate → commit_roadmap`. A supervisor routes each use case; a self-loop runs the three isolated read-side specialists (diagnostician / architect / economist) + a binary critic grounded on captured evidence with one revision; a durable `interrupt()` gate; a single-threaded `commit_roadmap` writer outside the agent loop.
- **Eval harness** (`evals/`): per-component scoring (retrieval / diagnosis / answer), a 24-case golden set (16 core + 8 contested) with a published rubric, deterministic + replayable gates, an evidence-grounded answer judge, and a security-probe suite. `trust-report.ts` assembles `TRUST_REPORT.md` from committed artifacts.
- **App + API** (`app/`): a Next.js 14 UI (backlog editor → streaming per-item triage → durable approval gate → committed roadmap), SSE `/api/assess` + `/api/resume`, and an **MCP server** (`/api`, streamable HTTP) exposing `retrieve_pattern` / `get_pattern` / `diagnose_use_case`, with the honest `ungated_draft` asymmetry.
- **CI** (`.github/workflows/ci.yml`): typecheck, unit tests, corpus-freshness, retrieval gate, security-probe gate, replay gate, build — all the no-key gates run in CI.

### Verified
- `npm run typecheck` clean; `npm run build` green (6 pages, 3 routes).
- Offline tests **20/20**; retrieval **BM25 69.2% recall@5 / MRR 0.842** (24 cases); security probes **10/10** (incl. the compiled-graph containment assertion that `commit_roadmap` is reachable only from the gate).
- Full runtime loop validated with **stubbed models** (no key): whole-backlog self-loop, durable pause/resume, the autonomy clamp firing, and the not-AI → do_not_build path.

### Deliberately left simple / not done (with the reason)
- **Classification accuracy + cost rows are not recorded.** They are model-dependent and this build used **no API key** — the sibling repo's key was deliberately not borrowed (clean-room boundary). The owner records them with `npm run evals -- --record`. Stated openly in the README; not a hidden gap.
- **Dense/hybrid retrieval rows are skipped** until `npm run ingest:embed` runs with a key — the scorecard says "skipped (no embeddings/key)", never a silent 0.
- **The Postgres durable-gate path is wired but unexercised** against a real DB; it falls back to in-memory with a printed warning.
- **PII masking is a regex rail**, not Presidio — the placement (before the model boundary) is the argument; a real NER masker is the production note.
- **The rate limiter is in-memory** (resets on cold start) — documented demo-grade, not a silent cap.
- **No GitHub remote created and nothing pushed** — awaiting the owner's explicit go (see the publish runbook in the handover).
