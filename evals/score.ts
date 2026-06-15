/**
 * Shared eval scoring. Two kinds of scorer, kept apart on purpose:
 *
 *  - DETERMINISTIC scorers (classification match, autonomy-ceiling) re-run on
 *    --replay with ZERO model calls — they are the CI regression gate.
 *  - The ANSWER JUDGE is model-based; it is recorded on --record and its verdict
 *    is reused on --replay (judges drift, so a judged metric is never the gate;
 *    it is reported, labelled as judged).
 *
 * The answer judge grounds on the evidence the specialists ACTUALLY retrieved —
 * passed in, never a re-search of the raw query (scaffold design contract #8).
 */
import { z } from 'zod';
import { structuredCall } from '../lib/llm';
import { autonomyCeiling, tierRank } from '../lib/ladder';
import type { AiOrNot, AutonomyTier, RiskTier, RoadmapItem, CostOfError } from '../lib/types';

export interface GoldenExpected {
  ai_or_not: AiOrNot;
  autonomy_max: AutonomyTier;
  risk_tier: RiskTier;
}

export interface DiagnosisScore {
  ai_or_not_match: boolean;
  risk_match: boolean;
  autonomy_ceiling_respected: boolean; // recommended tier <= expected ceiling AND <= cost-of-error ceiling
}

/** Pure, deterministic — the replayable component. */
export function scoreDiagnosis(
  got: { ai_or_not: AiOrNot; autonomy_tier: AutonomyTier; cost_of_error: CostOfError; risk_tier: RiskTier },
  expected: GoldenExpected,
): DiagnosisScore {
  const withinGoldenCeiling = tierRank(got.autonomy_tier) <= tierRank(expected.autonomy_max);
  const withinCostCeiling = tierRank(got.autonomy_tier) <= tierRank(autonomyCeiling(got.cost_of_error));
  return {
    ai_or_not_match: got.ai_or_not === expected.ai_or_not,
    risk_match: got.risk_tier === expected.risk_tier,
    autonomy_ceiling_respected: withinGoldenCeiling && withinCostCeiling,
  };
}

export const AnswerVerdict = z.object({
  verdict: z.enum(['pass', 'fail']),
  critique: z.string(),
});
export type AnswerVerdict = z.infer<typeof AnswerVerdict>;

/**
 * Binary answer judge, grounded on the evidence the item actually used. Checks:
 * is the verdict SUPPORTED by the retrieved patterns (not hallucinated), and is
 * the architecture coherent with the diagnosis? The 3-2-1 completeness is already
 * guaranteed by the Zod schema, so the judge focuses on grounding + coherence +
 * honesty (no invented cost precision).
 */
export async function judgeAnswer(
  item: RoadmapItem,
  evidencePassages: { id: string; title: string; text: string }[],
) {
  const ev = evidencePassages.length
    ? evidencePassages.map((p) => `=== [${p.id}] ${p.title} ===\n${p.text}`).join('\n\n')
    : '(no evidence captured)';
  const { value, usage } = await structuredCall({
    model: 'deep',
    node: 'eval_judge',
    schema: AnswerVerdict,
    system:
      'You are grading one triage verdict. Ground ONLY on the EVIDENCE below — the patterns the specialists actually retrieved — not a fresh search or your own priors. ' +
      'Pass iff: (1) the ai_or_not verdict is supported by the evidence; (2) any architecture is coherent with that verdict and the autonomy tier; (3) the economics does not invent false precision (an estimate is labelled as one). ' +
      'Fail with a specific critique otherwise. A sound, grounded, honest verdict passes even if you personally might have argued a different tier — you are checking grounding and coherence, not re-deciding.',
    user:
      `VERDICT: ai_or_not=${item.diagnosis.ai_or_not}; autonomy=${item.diagnosis.autonomy_tier}; risk=${item.diagnosis.risk_tier}\n` +
      (item.architecture
        ? `ARCHITECTURE: ${item.architecture.headline}\n  components: ${item.architecture.components.map((c) => `${c.box}=${c.choice}`).join('; ')}\n  number: ${item.architecture.key_number}\n`
        : 'ARCHITECTURE: none (not-AI verdict)\n') +
      `ECONOMICS: cost/task=${item.economics.cost_per_task_eur ?? 'n/a'} (${item.economics.cost_basis})\n\n` +
      `EVIDENCE:\n${ev}`,
  });
  return { verdict: value, usage };
}
