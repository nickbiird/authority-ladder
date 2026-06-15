/**
 * Retrieval scorecard. Measures bm25-only / dense-only / hybrid head-to-head on
 * the golden set: for each case, the query is the use-case description and the
 * relevant docs are its labelled `relevant_pattern_ids`. Reports recall@5 + MRR.
 *
 * The DEFAULT is not assumed, it is the measured winner. The bm25-only leg runs
 * with NO API key — it is the deterministic CI gate (npm run evals:retrieval).
 * dense-only / hybrid need data/embeddings.json + GOOGLE_API_KEY; when absent,
 * they are reported as "skipped (no embeddings/key)", never silently as 0.
 *
 * Why this exists: a perfect generator over the wrong patterns gives a wrong
 * verdict. Retrieval quality caps triage quality, so it is measured first.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { retrieve, type RetrievalMode } from '../lib/retrieval';
import { loadEmbeddings } from '../lib/corpus';

interface Case {
  id: string;
  title: string;
  description: string;
  relevant_pattern_ids: string[];
}

interface ConfigScore {
  config: RetrievalMode;
  queries: number;
  recall_at_5: number;
  mrr: number;
  skipped?: string;
}

const K = 5;
const RESULTS = path.join(process.cwd(), 'evals', 'results');

function loadCases(): Case[] {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'evals', 'golden', 'cases.json'), 'utf8'));
  return raw as Case[];
}

async function scoreConfig(mode: RetrievalMode, cases: Case[]): Promise<ConfigScore> {
  let recallHits = 0;
  let recallTotal = 0;
  let mrrSum = 0;
  for (const c of cases) {
    const result = await retrieve(`${c.title}. ${c.description}`, { mode, k: K });
    const ids = result.docs.map((d) => d.doc.id);
    const relevant = new Set(c.relevant_pattern_ids);
    // recall@5: fraction of relevant docs that appear in the top-K
    const found = c.relevant_pattern_ids.filter((id) => ids.slice(0, K).includes(id)).length;
    recallHits += found;
    recallTotal += relevant.size;
    // MRR: reciprocal rank of the first relevant doc
    const firstRank = ids.findIndex((id) => relevant.has(id));
    if (firstRank >= 0) mrrSum += 1 / (firstRank + 1);
  }
  return {
    config: mode,
    queries: cases.length,
    recall_at_5: Number((recallHits / recallTotal).toFixed(3)),
    mrr: Number((mrrSum / cases.length).toFixed(3)),
  };
}

async function main() {
  const cases = loadCases();
  const emb = loadEmbeddings();
  const haveDense = emb.present && Boolean(process.env.GOOGLE_API_KEY);

  const scores: ConfigScore[] = [];
  // bm25-only: always runs (deterministic, no key) — the CI gate.
  scores.push(await scoreConfig('bm25-only', cases));
  // dense-only / hybrid: only when embeddings + key are present.
  for (const mode of ['dense-only', 'hybrid'] as RetrievalMode[]) {
    if (haveDense) {
      scores.push(await scoreConfig(mode, cases));
    } else {
      scores.push({ config: mode, queries: 0, recall_at_5: 0, mrr: 0, skipped: 'no embeddings or no GOOGLE_API_KEY' });
    }
  }

  // CI gate: BM25 must clear a floor, so a corpus/retrieval regression fails the build.
  const bm25 = scores.find((s) => s.config === 'bm25-only')!;
  const FLOOR = 0.5;
  const pass = bm25.recall_at_5 >= FLOOR;

  const scorecard = {
    run_at: new Date().toISOString(),
    corpus_query: 'golden case description; relevant = labelled relevant_pattern_ids',
    k: K,
    configs: scores,
    ci_gate: { metric: 'bm25-only recall@5', floor: FLOOR, value: bm25.recall_at_5, pass },
  };

  if (!existsSync(RESULTS)) mkdirSync(RESULTS, { recursive: true });
  writeFileSync(path.join(RESULTS, 'retrieval-scorecard.json'), JSON.stringify(scorecard, null, 2) + '\n');

  console.log(`Retrieval scorecard (recall@${K} / MRR over ${cases.length} cases):`);
  for (const s of scores) {
    if (s.skipped) console.log(`  ${s.config.padEnd(12)} skipped — ${s.skipped}`);
    else console.log(`  ${s.config.padEnd(12)} recall@5 ${(s.recall_at_5 * 100).toFixed(1)}%  MRR ${s.mrr}`);
  }
  console.log(`\nCI gate (bm25-only recall@5 >= ${FLOOR}): ${pass ? 'PASS' : 'FAIL'} (${bm25.recall_at_5})`);
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
