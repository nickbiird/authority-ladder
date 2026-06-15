/**
 * The contract layer. Every agent -> code boundary crosses a Zod schema here, so a
 * model that drifts is caught at the boundary, not three nodes downstream
 * (design contract #6 — structured outputs everywhere).
 *
 * The domain is "where should AI act?": each candidate use case gets an AI-or-not
 * verdict, a placement on the autonomy ladder (sized to cost-of-error), a defended
 * architecture, an EU-AI-Act risk tier (one governance input, not the product), and
 * a price. The vocabulary is the solutioning motion: diagnose -> architect -> price.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enumerations — the three classifications the eval scores deterministically.
// ---------------------------------------------------------------------------

/** The AI-or-not gate. ~30% of honest answers are "none" — that is the credibility move. */
export const AiOrNot = z.enum([
  'none', // not an AI problem: an enumerable path over structured data -> a SQL view / a workflow
  'classical_ml', // prediction over tabular history -> sklearn, not an LLM
  'single_llm', // one LLM call, text in -> text out, no external knowledge
  'rag', // the answer lives in documents that change / must be cited
  'agent', // genuinely dynamic, multi-step tool use that cannot be scripted
]);
export type AiOrNot = z.infer<typeof AiOrNot>;

/** The autonomy ladder — escalating authority, gated by cost-of-error. */
export const AutonomyTier = z.enum([
  'suggest', // surfaces an option; the human decides everything
  'draft', // produces a reviewable artefact; the human edits and sends
  'act_with_approval', // acts, but every irreversible step is gated by a human
  'act', // acts autonomously within bounds
]);
export type AutonomyTier = z.infer<typeof AutonomyTier>;

/** EU AI Act risk tier — a lightweight governance flag, deliberately NOT the product. */
export const RiskTier = z.enum(['prohibited', 'high', 'limited', 'minimal']);
export type RiskTier = z.infer<typeof RiskTier>;

/** Cost-of-error band: the single input that sizes the autonomy ceiling. */
export const CostOfError = z.enum(['low', 'medium', 'high']);
export type CostOfError = z.infer<typeof CostOfError>;

/** Where a routed use case goes. `reject` drops obvious non-use-cases / injection probes pre-spend. */
export const Route = z.enum(['full', 'diagnose_only', 'reject']);
export type Route = z.infer<typeof Route>;

/** The sequencing call on the roadmap — scale-or-stall. */
export const Sequencing = z.enum(['now', 'next', 'later', 'do_not_build']);
export type Sequencing = z.infer<typeof Sequencing>;

export const PatternCategory = z.enum([
  'ai-or-not',
  'autonomy-ladder',
  'architecture',
  'governance',
  'adoption-failure',
]);
export type PatternCategory = z.infer<typeof PatternCategory>;

// ---------------------------------------------------------------------------
// Corpus — the clean-room pattern library (synthetic / public knowledge only).
// ---------------------------------------------------------------------------

/** A source pattern card, authored in data/patterns/*.json. The product's substance. */
export const PatternCard = z.object({
  id: z.string(),
  title: z.string(),
  category: PatternCategory,
  summary: z.string(),
  body: z.string(),
  implies_verdict: AiOrNot.optional(),
  implies_tier: AutonomyTier.optional(),
  failure_modes: z.array(z.string()).default([]),
  rejected_alternatives: z.array(z.string()).default([]),
  cost_envelope: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type PatternCard = z.infer<typeof PatternCard>;

/** The indexed/retrievable unit derived from a card at ingest time. */
export interface CorpusDoc {
  id: string;
  title: string;
  category: PatternCategory;
  /** The concatenated, searchable text (title + summary + body + tags). */
  text: string;
  implies_verdict?: AiOrNot;
  implies_tier?: AutonomyTier;
}

export interface Corpus {
  version: string;
  ingested_at: string;
  docs: CorpusDoc[];
}

/** A retrieval hit: the doc plus its fused score and which leg(s) surfaced it. */
export interface RetrievedDoc {
  doc: CorpusDoc;
  score: number;
  legs: Array<'bm25' | 'dense'>;
}

// ---------------------------------------------------------------------------
// Input — the backlog.
// ---------------------------------------------------------------------------

export const UseCase = z.object({
  id: z.string(),
  title: z.string(),
  /** Plain-language description of the candidate workflow. */
  description: z.string(),
});
export type UseCase = z.infer<typeof UseCase>;

export const Backlog = z.object({
  company_context: z.string(),
  use_cases: z.array(UseCase).min(1).max(20),
});
export type Backlog = z.infer<typeof Backlog>;

// ---------------------------------------------------------------------------
// Structured specialist outputs — one schema per agent -> code boundary.
// ---------------------------------------------------------------------------

/** Supervisor route decision, per use case. The highest-leverage prompt in the graph. */
export const RoutePlan = z.object({
  use_case_id: z.string(),
  route: Route,
  rationale: z.string(),
});
export type RoutePlan = z.infer<typeof RoutePlan>;

/** Diagnostician — the authoritative AI-or-not + autonomy-tier + risk-tier verdict. */
export const Diagnosis = z.object({
  use_case_id: z.string(),
  ai_or_not: AiOrNot,
  ai_or_not_rationale: z.string(),
  autonomy_tier: AutonomyTier,
  autonomy_rationale: z.string(),
  cost_of_error: CostOfError,
  knowledge_location: z.string(),
  risk_tier: RiskTier,
  risk_rationale: z.string(),
  /** Pattern-card ids the diagnostician actually grounded on (design contract #8). */
  evidence_ids: z.array(z.string()).default([]),
});
export type Diagnosis = z.infer<typeof Diagnosis>;

const Component = z.object({ box: z.string(), choice: z.string() });
const RejectedAlternative = z.object({ alternative: z.string(), flip_condition: z.string() });

/** Architect — the defended reference architecture, with the 3-2-1 baked into the schema. */
export const Architecture = z.object({
  use_case_id: z.string(),
  headline: z.string(),
  components: z.array(Component),
  failure_modes: z.array(z.string()).min(3), // the "3" of 3-2-1
  rejected_alternatives: z.array(RejectedAlternative).min(2), // the "2"
  key_number: z.string(), // the "1"
  evidence_ids: z.array(z.string()).default([]),
});
export type Architecture = z.infer<typeof Architecture>;

/** Economist — the CFO translation. Costs are model-estimated; the UI brackets them. */
export const Economics = z.object({
  use_case_id: z.string(),
  cost_per_task_eur: z.number().nullable(),
  cost_basis: z.string(),
  human_baseline: z.string(),
  payback: z.string(),
  latency_budget: z.string(),
  evidence_ids: z.array(z.string()).default([]),
});
export type Economics = z.infer<typeof Economics>;

/** The binary judge verdict. Pass/revise, never a 1-5 score (design contract #5). */
export const CriticVerdict = z.object({
  use_case_id: z.string(),
  verdict: z.enum(['pass', 'revise']),
  critique: z.string(),
  targets: z.array(z.enum(['ai_or_not', 'autonomy_tier', 'architecture', 'economics', 'risk_tier'])).default([]),
});
export type CriticVerdict = z.infer<typeof CriticVerdict>;

// ---------------------------------------------------------------------------
// Assembled artefacts.
// ---------------------------------------------------------------------------

export interface RoadmapItem {
  use_case_id: string;
  title: string;
  route: Route;
  diagnosis: Diagnosis;
  architecture: Architecture | null; // null when ai_or_not === 'none'
  economics: Economics;
  critique: { rounds: number; final: CriticVerdict };
  sequencing: Sequencing;
  sequencing_rationale: string;
}

export interface Roadmap {
  roadmap_id: string;
  company_context: string;
  items: RoadmapItem[];
  ordered_by: 'value-over-effort';
  corpus_version: string;
  total_cost_eur: number;
  generated_at: string;
  approver_note: string;
}

// ---------------------------------------------------------------------------
// Cross-cutting state channels.
// ---------------------------------------------------------------------------

/** One metered model call. Accumulated into the `usage` channel with an append reducer. */
export interface UsageEntry {
  model: string;
  node: string;
  inputTokens: number;
  outputTokens: number;
}

/** The reduced cost view, derived from UsageEntry[] at report time (never estimated). */
export interface CostSummary {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  eur: number;
}

/** What a specialist actually retrieved — the judge grounds on THIS, not a re-search. */
export interface EvidenceEntry {
  use_case_id: string;
  stage: 'diagnose' | 'architect' | 'economist';
  doc_ids: string[];
  /** The retrieved passages, captured verbatim so the judge can ground without re-querying. */
  passages: Array<{ id: string; title: string; text: string }>;
}

/** Per-node latency, recorded by the _timed wrapper for the observability trace. */
export interface NodeTiming {
  node: string;
  ms: number;
}

/** Resume payload posted to the human gate. */
export interface ApprovalDecision {
  approved: boolean;
  note: string;
}

export type CheckpointerMode = 'postgres' | 'memory';
