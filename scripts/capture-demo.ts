/**
 * Capture ONE real graph run on the built-in 6-item DEMO backlog and write it to
 * public/demo-run.json. The web "Run recorded demo" button replays THIS run
 * client-side with ZERO API calls — so the live deployment shows a genuine end-to-
 * end triage for free (no visitor key, no spend), and a recorded GIF can never 429
 * mid-take. This script is the ONLY step that costs anything: one run, a handful of
 * cents on Claude (Haiku fast / Sonnet deep) over six cases.
 *
 * The data is the same clean-room DEMO backlog shown in the textarea — synthetic,
 * vendor-neutral, no PII — so the fixture is open-sourceable by construction.
 *
 * It auto-approves the gate (config.auto_approve), exactly as the eval harness
 * does (evals/run.ts): the gate is process, not pipeline, so a capture bypasses the
 * interrupt and commits the roadmap in a single invoke. The replay UI re-introduces
 * the durable-gate pause for honesty — the pause is real on the live path.
 *
 * Run:  npm run capture:demo   (needs ANTHROPIC_API_KEY in .env; LLM_PROVIDER=anthropic default)
 */
import '../lib/loadenv';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { MemorySaver } from '@langchain/langgraph';
import { buildGraph } from '../lib/graph';
import { hasModelKey, MODEL_KEY_VAR, PROVIDER, FAST_MODEL, DEEP_MODEL } from '../lib/llm';
import type { RoadmapItem, Roadmap } from '../lib/types';

type Seq = 'now' | 'next' | 'later' | 'do_not_build';

const COMPANY = 'A 200-person mid-market services company, first serious AI push.';

// Mirrors the DEMO backlog prefilled in app/page.tsx — six use cases spanning the
// whole AI-or-not range (none -> classical_ml -> single_llm -> rag -> high-risk ->
// agent), so the replay shows the verdict spread AND the autonomy-ceiling clamp.
const USE_CASES = [
  { id: 'uc-1', title: 'Overdue-invoice flagging', description: 'Automatically flag any customer invoice more than 30 days past due so finance can chase it.' },
  { id: 'uc-2', title: 'Churn prediction', description: 'From two years of CRM history, predict which accounts will cancel next quarter, with the drivers.' },
  { id: 'uc-3', title: 'Support-reply drafting', description: 'Generate a first-draft reply to each customer email for an agent to review, edit, and send.' },
  { id: 'uc-4', title: 'Policy Q&A', description: 'Let employees ask questions about our internal HR policies and get an answer that cites the exact clause.' },
  { id: 'uc-5', title: 'CV scoring', description: 'Score and rank incoming job applicants against the role and surface the top candidates to recruiters.' },
  { id: 'uc-6', title: 'Autonomous refund agent', description: 'When a customer complains, investigate the order across systems and issue a refund automatically.' },
];

async function main() {
  if (!hasModelKey()) {
    console.error(`capture:demo needs ${MODEL_KEY_VAR} (LLM_PROVIDER=${PROVIDER}). Add it to .env, then re-run.`);
    process.exit(1);
  }
  console.log(`Capturing one real run on the ${USE_CASES.length}-item DEMO backlog (provider=${PROVIDER}, fast=${FAST_MODEL}, deep=${DEEP_MODEL})...`);

  const graph = buildGraph().compile({ checkpointer: new MemorySaver() });
  const final = await graph.invoke(
    { backlog: { company_context: COMPANY, use_cases: USE_CASES } },
    { configurable: { thread_id: 'capture-demo', auto_approve: true }, recursionLimit: 100 },
  );

  const items = (final.items ?? []) as RoadmapItem[];
  const roadmap = (final.roadmap ?? null) as Roadmap | null;
  if (!items.length || !roadmap) {
    console.error('No items/roadmap produced — check the key has credit. guardFail:', (final.guardFail as string | null) ?? '(none)');
    process.exit(1);
  }

  const count = (s: Seq) => items.filter((i) => i.sequencing === s).length;
  const summary = { total: items.length, now: count('now'), next: count('next'), later: count('later'), do_not_build: count('do_not_build') };

  const out = {
    version: 1,
    provenance:
      `Real graph run captured via 'npm run capture:demo' on ${PROVIDER} (${FAST_MODEL} fast / ${DEEP_MODEL} deep). ` +
      'The web "Run recorded demo" button replays THIS run client-side with zero API calls. ' +
      'Synthetic clean-room backlog; no PII; open-sourceable by construction.',
    captured_at: new Date().toISOString(),
    company_context: COMPANY,
    items, // triage (stream) order — replayed one card at a time
    summary, // drives the durable-gate panel
    roadmap: { ...roadmap, generated_at: roadmap.generated_at || new Date().toISOString() }, // committed, sorted view shown after approve
  };

  const dir = path.join(process.cwd(), 'public');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'demo-run.json');
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n');

  console.log(`\nWrote ${path.relative(process.cwd(), file)} — ${items.length} items, roadmap cost EUR ${roadmap.total_cost_eur.toFixed(4)}.`);
  console.log(`Verdicts: ${items.map((i) => `${i.title.split(' ')[0]}=${i.diagnosis.ai_or_not}/${i.diagnosis.autonomy_tier}`).join(', ')}`);
  console.log(`Summary: now=${summary.now} next=${summary.next} later=${summary.later} dont=${summary.do_not_build}`);
  console.log('Done. Click "Run recorded demo" in the app — it replays this with no key.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
