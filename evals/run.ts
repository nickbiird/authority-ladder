/**
 * The assessment eval. For each golden case it runs the full graph (auto-approved
 * — the gate is process, not pipeline, so evals bypass it explicitly) and scores
 * three components independently, the way the appreciating-skill demands:
 *
 *   retrieval  — covered by evals/retrieval.ts (recall@5); here we record evidence coverage
 *   diagnosis  — ai_or_not match + risk match + autonomy-ceiling respected   (DETERMINISTIC)
 *   answer     — a binary judge grounded on the captured evidence            (MODEL, recorded)
 *
 * Modes:
 *   (default)  live run, needs GOOGLE_API_KEY; prints the scorecard.
 *   --record   live run + writes evals/fixtures/assessments.json + the scorecard (the committed gate input).
 *   --replay   NO model calls: re-scores committed fixtures deterministically and
 *              reuses the recorded judge verdict. This is the CI gate.
 *
 * Honesty: per-component accuracy is reported split core/contested (they mean
 * different things — see evals/golden/RUBRIC.md). Any ✗ prints the judge's
 * critique, so a failure is explainable, never a bare number.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { buildGraph } from '../lib/graph';
import { MemorySaver } from '@langchain/langgraph';
import { summarizeUsage } from '../lib/llm';
import { scoreDiagnosis, judgeAnswer, type GoldenExpected } from './score';
import type { RoadmapItem, UsageEntry } from '../lib/types';

interface Case {
  id: string;
  split: 'core' | 'contested';
  title: string;
  description: string;
  expected: GoldenExpected;
  note: string;
}

interface Fixture {
  id: string;
  split: 'core' | 'contested';
  expected: GoldenExpected;
  got: { ai_or_not: string; autonomy_tier: string; cost_of_error: string; risk_tier: string };
  evidence: { id: string; title: string; text: string }[];
  answer_verdict: { verdict: 'pass' | 'fail'; critique: string };
  usage: UsageEntry[];
}

const RESULTS = path.join(process.cwd(), 'evals', 'results');
const FIXTURES = path.join(process.cwd(), 'evals', 'fixtures', 'assessments.json');

function loadCases(): Case[] {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'evals', 'golden', 'cases.json'), 'utf8'));
}

async function runCase(c: Case, apiKey?: string): Promise<Fixture> {
  const graph = buildGraph().compile({ checkpointer: new MemorySaver() });
  const final = await graph.invoke(
    { backlog: { company_context: 'eval', use_cases: [{ id: c.id, title: c.title, description: c.description }] } },
    { configurable: { thread_id: `eval-${c.id}`, auto_approve: true, api_key: apiKey }, recursionLimit: 50 },
  );
  const item = (final.items as RoadmapItem[])[0];
  const evidence = (final.evidence as { use_case_id: string; passages: { id: string; title: string; text: string }[] }[])
    .filter((e) => e.use_case_id === c.id)
    .flatMap((e) => e.passages);
  // dedupe evidence passages by id
  const seen = new Set<string>();
  const groundedEvidence = evidence.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  const judged = await judgeAnswer(item, groundedEvidence, apiKey);

  return {
    id: c.id,
    split: c.split,
    expected: c.expected,
    got: {
      ai_or_not: item.diagnosis.ai_or_not,
      autonomy_tier: item.diagnosis.autonomy_tier,
      cost_of_error: item.diagnosis.cost_of_error,
      risk_tier: item.diagnosis.risk_tier,
    },
    evidence: groundedEvidence,
    answer_verdict: judged.verdict,
    usage: [...(final.usage as UsageEntry[]), judged.usage],
  };
}

interface Split {
  n: number;
  ai_or_not: number;
  risk: number;
  autonomy_ok: number;
  answer_pass: number;
}
const emptySplit = (): Split => ({ n: 0, ai_or_not: 0, risk: 0, autonomy_ok: 0, answer_pass: 0 });

function scoreFixtures(fixtures: Fixture[]) {
  const splits: Record<'core' | 'contested', Split> = { core: emptySplit(), contested: emptySplit() };
  const failures: string[] = [];
  let allUsage: UsageEntry[] = [];
  for (const f of fixtures) {
    const s = scoreDiagnosis(f.got as never, f.expected);
    const sp = splits[f.split];
    sp.n += 1;
    if (s.ai_or_not_match) sp.ai_or_not += 1;
    if (s.risk_match) sp.risk += 1;
    if (s.autonomy_ceiling_respected) sp.autonomy_ok += 1;
    if (f.answer_verdict.verdict === 'pass') sp.answer_pass += 1;
    allUsage = allUsage.concat(f.usage ?? []);
    if (!s.ai_or_not_match)
      failures.push(`✗ ${f.id} ai_or_not: expected ${f.expected.ai_or_not}, got ${f.got.ai_or_not}`);
    if (!s.risk_match) failures.push(`✗ ${f.id} risk: expected ${f.expected.risk_tier}, got ${f.got.risk_tier}`);
    if (!s.autonomy_ceiling_respected)
      failures.push(`✗ ${f.id} autonomy: ${f.got.autonomy_tier} exceeds ceiling (max ${f.expected.autonomy_max}, cost ${f.got.cost_of_error})`);
    if (f.answer_verdict.verdict === 'fail') failures.push(`✗ ${f.id} answer-judge: ${f.answer_verdict.critique}`);
  }
  const cost = summarizeUsage(allUsage);
  const costPerCase = fixtures.length ? Number((cost.eur / fixtures.length).toFixed(4)) : 0;
  return { splits, failures, cost, costPerCase };
}

function pct(a: number, b: number) {
  return b ? `${((a / b) * 100).toFixed(1)}%` : 'n/a';
}

function report(fixtures: Fixture[], mode: string) {
  const { splits, failures, cost, costPerCase } = scoreFixtures(fixtures);
  console.log(`\nAssessment scorecard (${mode}) — ${fixtures.length} cases\n`);
  for (const k of ['core', 'contested'] as const) {
    const s = splits[k];
    if (!s.n) continue;
    console.log(`[${k}] n=${s.n}`);
    console.log(`  ai_or_not   ${pct(s.ai_or_not, s.n)}   (${s.ai_or_not}/${s.n})`);
    console.log(`  risk_tier   ${pct(s.risk, s.n)}   (${s.risk}/${s.n})`);
    console.log(`  autonomy-ceiling respected   ${pct(s.autonomy_ok, s.n)}   (${s.autonomy_ok}/${s.n})  [safety property]`);
    console.log(`  answer-judge ${pct(s.answer_pass, s.n)}   (${s.answer_pass}/${s.n})  [model-judged, not gated]`);
  }
  if (cost.calls) console.log(`\nCost: €${cost.eur.toFixed(4)} total, €${costPerCase}/case (${cost.calls} calls, ${cost.inputTokens + cost.outputTokens} tokens)`);
  if (failures.length) {
    console.log(`\nExplained failures (${failures.length}):`);
    failures.forEach((f) => console.log('  ' + f));
  }
  return { splits, failures, cost, costPerCase };
}

function writeScorecard(fixtures: Fixture[]) {
  const { splits, cost, costPerCase } = scoreFixtures(fixtures);
  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });
  const scorecard = {
    run_at: new Date().toISOString(),
    n: fixtures.length,
    splits: {
      core: { ...splits.core, ai_or_not_pct: splits.core.ai_or_not / (splits.core.n || 1), risk_pct: splits.core.risk / (splits.core.n || 1) },
      contested: { ...splits.contested, ai_or_not_pct: splits.contested.ai_or_not / (splits.contested.n || 1), risk_pct: splits.contested.risk / (splits.contested.n || 1) },
    },
    autonomy_ceiling_respected_all: fixtures.every((f) => scoreDiagnosis(f.got as never, f.expected).autonomy_ceiling_respected),
    cost_eur_total: cost.eur,
    cost_eur_per_case: costPerCase,
  };
  writeFileSync(path.join(RESULTS, 'assessment-scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const replay = args.includes('--replay');
  const record = args.includes('--record');

  if (replay) {
    if (!existsSync(FIXTURES)) {
      console.log('No committed fixtures yet (evals/fixtures/assessments.json). Run `npm run evals:record` first.');
      console.log('Replay gate is a no-op until fixtures exist — this is expected on a fresh clone before a recorded run.');
      return; // not a failure: a fresh clone has no fixtures to gate on
    }
    const fixtures: Fixture[] = JSON.parse(readFileSync(FIXTURES, 'utf8'));
    const { splits } = report(fixtures, 'replay — committed fixtures, zero model calls');
    // CI gate: the deterministic safety property must hold for every case.
    const allCeilingOk = fixtures.every((f) => scoreDiagnosis(f.got as never, f.expected).autonomy_ceiling_respected);
    // CI gate: core ai_or_not accuracy must not regress below a floor.
    const FLOOR = 0.7;
    const coreAcc = splits.core.n ? splits.core.ai_or_not / splits.core.n : 1;
    const pass = allCeilingOk && coreAcc >= FLOOR;
    console.log(`\nCI gate: autonomy-ceiling-all=${allCeilingOk}, core ai_or_not ${(coreAcc * 100).toFixed(1)}% >= ${FLOOR * 100}% -> ${pass ? 'PASS' : 'FAIL'}`);
    if (!pass) process.exit(1);
    return;
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('Live/record runs need GOOGLE_API_KEY. For a zero-key gate use: npx tsx evals/run.ts --replay');
    process.exit(1);
  }
  const cases = loadCases();
  const fixtures: Fixture[] = [];
  for (const c of cases) {
    process.stdout.write(`  ${c.id} ... `);
    const f = await runCase(c, apiKey);
    const s = scoreDiagnosis(f.got as never, f.expected);
    process.stdout.write(`${s.ai_or_not_match ? '✓' : '✗'}aon ${s.risk_match ? '✓' : '✗'}risk ${f.answer_verdict.verdict === 'pass' ? '✓' : '✗'}ans\n`);
    fixtures.push(f);
  }
  report(fixtures, record ? 'record — live run' : 'live');
  writeScorecard(fixtures);
  if (record) {
    if (!existsSync(path.dirname(FIXTURES))) mkdirSync(path.dirname(FIXTURES), { recursive: true });
    writeFileSync(FIXTURES, JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`\nRecorded ${fixtures.length} fixtures -> ${path.relative(process.cwd(), FIXTURES)} (the CI replay gate now activates)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
