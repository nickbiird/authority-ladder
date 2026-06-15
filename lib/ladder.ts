/**
 * The deterministic governance layer. The model decides the verdict, the tier,
 * and the risk class (behind a human gate); the obligations and the
 * autonomy-ceiling rule that FOLLOW from those decisions are principle, not
 * inference — so they are code, not a prompt. This mirrors the reference
 * architecture's rule: "obligations are code, not model output."
 */
import type { AiOrNot, AutonomyTier, RiskTier, CostOfError } from './types';

// ---------------------------------------------------------------------------
// Labels.
// ---------------------------------------------------------------------------

export const AI_OR_NOT_LABEL: Record<AiOrNot, { label: string; build_instead: string }> = {
  none: { label: 'Not an AI problem', build_instead: 'A SQL view, a workflow rule, or a script — the path is enumerable over structured data.' },
  classical_ml: { label: 'Classical ML', build_instead: 'A supervised model over tabular history (e.g. gradient boosting), not an LLM.' },
  single_llm: { label: 'One LLM call', build_instead: 'A single prompt + a structured-output schema. No retrieval, no agent loop.' },
  rag: { label: 'Retrieval-grounded (RAG)', build_instead: 'Hybrid retrieval over the source documents with citations; the model never answers from memory.' },
  agent: { label: 'Agent', build_instead: 'A bounded multi-step agent with scoped tools — the rarest legitimate case.' },
};

export const AUTONOMY_LABEL: Record<AutonomyTier, string> = {
  suggest: 'Suggest',
  draft: 'Draft',
  act_with_approval: 'Act with approval',
  act: 'Act',
};

export const RISK_LABEL: Record<RiskTier, string> = {
  prohibited: 'Prohibited',
  high: 'High risk',
  limited: 'Limited risk',
  minimal: 'Minimal risk',
};

// ---------------------------------------------------------------------------
// The autonomy-ceiling rule — the single deterministic guardrail.
// ---------------------------------------------------------------------------

const TIER_ORDER: AutonomyTier[] = ['suggest', 'draft', 'act_with_approval', 'act'];
export const tierRank = (t: AutonomyTier): number => TIER_ORDER.indexOf(t);

/**
 * The maximum autonomy a use case may be granted, given its cost-of-error.
 * Reversible-and-cheap automates aggressively; irreversible-or-expensive is
 * gated, never fully autonomous. (Solutioning playbook, Move 1 Q3.)
 */
export function autonomyCeiling(cost: CostOfError): AutonomyTier {
  switch (cost) {
    case 'low':
      return 'act'; // reversible + cheap: full autonomy within bounds is defensible
    case 'medium':
      return 'act_with_approval'; // gate the irreversible steps
    case 'high':
      return 'act_with_approval'; // never fully autonomous on high-stakes, irreversible actions
  }
}

/** True iff a recommended tier exceeds what its cost-of-error permits — a governance red flag. */
export function exceedsCeiling(tier: AutonomyTier, cost: CostOfError): boolean {
  return tierRank(tier) > tierRank(autonomyCeiling(cost));
}

/** The gate a tier requires + the oversight posture it implies. Deterministic. */
export const AUTONOMY_GATE: Record<AutonomyTier, { gate: string; oversight: string }> = {
  suggest: {
    gate: 'None — the system only surfaces options; a human takes every action.',
    oversight: 'Review by exception. The risk is decision-fatigue / ignored suggestions, not runaway action.',
  },
  draft: {
    gate: 'Implicit — a human reviews and edits the artefact before it is used or sent.',
    oversight: 'Every output is human-reviewed before it has any effect. Watch for rubber-stamping at volume.',
  },
  act_with_approval: {
    gate: 'Durable human-in-the-loop: the run pauses on a checkpointed interrupt before the irreversible step; a human approves out-of-band; only then does it execute.',
    oversight: 'Mandatory per-action approval on irreversible steps, with an audit artefact. The gate must survive a restart, or it is theatre.',
  },
  act: {
    gate: 'Bounded autonomy: hard caps, allowlists, and a kill-switch — but no per-action human approval.',
    oversight: 'Post-hoc monitoring + anomaly alerts + sampled audits. Only defensible when every action is cheap and reversible.',
  },
};

// ---------------------------------------------------------------------------
// EU AI Act obligations by tier — generic, public-knowledge shape. One
// governance input to the triage, deliberately lightweight (not a compliance
// product — see the sibling repo ai-act-triage for the deep version).
// ---------------------------------------------------------------------------

export const RISK_OBLIGATIONS: Record<RiskTier, { text: string; basis: string }[]> = {
  prohibited: [
    { text: 'Do not build or deploy: the practice is banned outright in the EU. Re-scope to an adjacent lawful design and re-triage.', basis: 'Article 5 family' },
    { text: 'Exposure is existential, not procedural — top penalty band (up to EUR 35M / 7% of worldwide turnover).', basis: 'Article 99' },
  ],
  high: [
    { text: 'Stand up a lifecycle risk-management system and data governance before launch.', basis: 'Articles 9–10' },
    { text: 'Maintain technical documentation, event logging, and instructions-for-use.', basis: 'Articles 11–13' },
    { text: 'Design effective human oversight — intervene / override / interrupt — and meet accuracy/robustness/security bars.', basis: 'Articles 14–15' },
    { text: 'Run conformity assessment + registration before market placement.', basis: 'Articles 43, 49' },
  ],
  limited: [
    { text: 'Disclose that users are interacting with an AI system, unless obvious from context.', basis: 'Article 50(1)' },
    { text: 'Label synthetic / AI-generated content in a machine-readable way where feasible.', basis: 'Article 50(2)' },
  ],
  minimal: [
    { text: 'No specific obligations under the Act. General law (GDPR, consumer protection, sector rules) still applies.', basis: 'Recital 165' },
    { text: 'Re-triage if scope changes: a minimal classification is a fact about today’s design, not a permanent grant.', basis: 'Article 6' },
  ],
};
