# Changelog

## 2026-06-15 — classification scorecard recorded on Claude (24/24)

Recorded the full assessment scorecard live on Anthropic (Haiku 4.5 / Sonnet 4.6) and fixed five real bugs that only surfaced by running against the live API — each with a regression guard.

### Scorecard (committed, `evals/results/assessment-scorecard.json`)
- Core AI-or-not **75%** (12/16), contested 50% (4/8) — honest hard-set numbers (~70% is the calibration target; 100% would mean the set is too easy).
- **Cost-ceiling safety invariant 100%** on all 24 (the code-enforced clamp). Answer-judge 94% core / 88% contested. Risk-tier 56% core (the weakest dimension, disclosed).
- **€0.128/case**, 155 metered calls. Replay CI gate (cost-ceiling-all + core AI-or-not ≥ 70%) **passes**.

### Fixed (found by running live)
- **Silent `parsed:null` from Anthropic structured output** (an occasional validation failure under `includeRaw`) propagated as a cryptic downstream null-read → `structuredCall` now retries once with a nudge, meters both attempts, then throws an *explainable* error naming the node.
- **Supervisor `reject` on a real use case** produced no roadmap item (crash) → removed `reject` from routing (the deterministic guard already owns true rejection), clamp any stray `reject` to `diagnose_only`, and made `runCase` throw a clear reason instead of a null-read.
- **Economist/architect refused a *prohibited* practice** (the model declines to price a banned mechanic) → both are skipped for `risk_tier==='prohibited'` (do-not-build; no economics to price) with a deterministic sentinel — also saves two calls per prohibited case.
- **Injection gate false-flagged a legitimate use case** ("automatically approve refunds under €50" — a use case *about* approval) → tightened the meta-instruction patterns to require a triage-meta target (everything / all / the roadmap / use cases), added a benign-automation regression probe + unit tests (still catches "auto-approve everything").
- **Scorer conflated two different things** under "autonomy-ceiling" → split into `cost_ceiling_respected` (the deterministic safety invariant — GATED, 100%) and `within_golden_ceiling` (agreement with the rubric's stricter per-case ceiling — accuracy, reported). Aligns the gate with what the README always described. RUBRIC.md updated.

### Added
- `npm run evals -- --only=id,id` — re-run specific cases and merge into the committed fixtures, so fixing a few cases costs a few cents instead of a full re-run.

### Verified
- Replay CI gate passes; typecheck clean; tests 22/22; security probes 12/12; retrieval gate green; `next build` green.

## 2026-06-15 — provider-agnostic reasoning (Anthropic default)

Made the reasoning layer provider-agnostic so the repo runs on a Claude Console
key (the owner's Gemini key's prepaid balance was exhausted; Anthropic also has
no embeddings dependency).

- `lib/llm.ts`: `LLM_PROVIDER` (`anthropic` default | `google`) selects the
  backend. Anthropic tiers Haiku 4.5 (fast) / Sonnet 4.6 (deep) — cheap by design;
  Google tiers Flash / Pro. `structuredCall` is unchanged at the call site, so the
  graph and evals don't branch on provider. The SDKs read their key from the env
  (`ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`); the explicit `api_key` threading through
  the graph config was removed.
- **Embeddings stay decoupled:** only Google offers an embeddings API, so dense
  retrieval needs `GOOGLE_API_KEY` regardless of the reasoning provider; without
  one, retrieval is BM25-only (the just-added degradation handles it). The
  committed hybrid retrieval scorecard (71.8%) still stands — embeddings are Google.
- Routes, evals, and the MCP server now report the active provider's key var in
  their "key not configured" errors.

Verified offline (no key): typecheck clean, tests 20/20, security probes 10/10,
`next build` green, and a stubbed end-to-end run (pause/resume, autonomy clamp,
not-AI path) confirms the refactor didn't break the graph. The live Anthropic
classification scorecard is the owner's next step — set `ANTHROPIC_API_KEY` and
`npm run evals -- --record`.

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
