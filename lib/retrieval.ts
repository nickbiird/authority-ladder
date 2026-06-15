/**
 * Hybrid retrieval over the clean-room pattern corpus: BM25 (MiniSearch) +
 * dense cosine (static Gemini embeddings), fused with Reciprocal Rank Fusion.
 *
 * Why hybrid is the principled DEFAULT here (and was NOT in the sibling
 * ai-act-triage repo): this corpus is queried two ways at once. A specialist
 * sees the use-case text, which is paraphrase ("we want the bot to email
 * customers back") — dense territory — but the pattern cards are named in
 * terms-of-art ("durable HITL", "NL2SQL", "RRF") — BM25 territory. Neither leg
 * alone covers both. The retrieval scorecard (npm run evals:retrieval) measures
 * bm25-only / dense-only / hybrid head-to-head so the default is the MEASURED
 * winner, not an assumed one. If the scorecard shows a leg is net-negative on
 * this corpus, the default flips — exactly as it did for ai-act-triage.
 *
 * The `category` filter is the context-isolation mechanism: each specialist
 * retrieves only its slice of the corpus (the diagnostician sees ai-or-not +
 * autonomy cards; the architect sees architecture cards; the economist sees
 * architecture + adoption-failure cards), so no specialist's context is
 * polluted by patterns it has no use for (design contract: isolated specialists).
 *
 * Degradation: no embeddings file or no API key -> BM25-only, and the result
 * says which mode actually ran.
 */
import MiniSearch from 'minisearch';
import { loadCorpus, loadEmbeddings, getDoc } from './corpus';
import type { CorpusDoc, PatternCategory, RetrievedDoc } from './types';

export type RetrievalMode = 'hybrid' | 'bm25-only' | 'dense-only';

const RRF_K = 60;
const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001';

let mini: MiniSearch<CorpusDoc> | null = null;

function bm25Index(): MiniSearch<CorpusDoc> {
  if (!mini) {
    mini = new MiniSearch<CorpusDoc>({
      fields: ['title', 'text'],
      storeFields: ['id', 'category'],
      searchOptions: { boost: { title: 2 }, fuzzy: 0.1, prefix: true },
    });
    mini.addAll(loadCorpus().docs);
  }
  return mini;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedQuery(query: string, apiKey: string, dims: number): Promise<Float32Array> {
  // The embed endpoint is a raw fetch (the generation calls retry via langchain),
  // so it gets its own backoff: free-tier RPM throttling returns 429, and a
  // 24-case eval makes enough query-embeds to trip it. Honour Retry-After,
  // otherwise exponential backoff. 5 attempts clears the per-minute window.
  const MAX = 5;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: query }] },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: dims || 768,
        }),
      },
    );
    if (res.ok) {
      const json = (await res.json()) as { embedding: { values: number[] } };
      const v = json.embedding.values;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return new Float32Array(v.map((x) => x / norm));
    }
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= MAX) throw new Error(`query embed HTTP ${res.status}`);
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 32000);
    await sleep(waitMs);
  }
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export interface RetrieveOptions {
  k?: number;
  mode?: RetrievalMode;
  /** Restrict to these categories — the specialist context-isolation filter. */
  categories?: PatternCategory[];
  apiKey?: string;
}

export interface RetrievalResult {
  mode: RetrievalMode;
  docs: RetrievedDoc[];
}

export async function retrieve(query: string, opts: RetrieveOptions = {}): Promise<RetrievalResult> {
  const k = opts.k ?? 5;
  const corpus = loadCorpus();
  const allow = opts.categories ? new Set(opts.categories) : null;
  const docById = new Map(corpus.docs.map((d) => [d.id, d]));
  const inScope = (id: string) => !allow || allow.has(docById.get(id)!.category);

  const emb = loadEmbeddings();
  const apiKey = opts.apiKey ?? process.env.GOOGLE_API_KEY;

  let mode: RetrievalMode = opts.mode ?? 'hybrid';
  if (mode !== 'bm25-only' && (!emb.present || !apiKey)) mode = 'bm25-only';

  // BM25 leg
  const bm25Ranked: string[] =
    mode === 'dense-only'
      ? []
      : bm25Index()
          .search(query)
          .map((r) => r.id as string)
          .filter(inScope)
          .slice(0, 30);

  // dense leg
  let denseRanked: string[] = [];
  if (mode !== 'bm25-only') {
    const qv = await embedQuery(query, apiKey!, emb.dims);
    denseRanked = [...emb.vectors.entries()]
      .filter(([id]) => inScope(id))
      .map(([id, v]) => [id, dot(qv, v)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([id]) => id);
  }

  // Reciprocal Rank Fusion
  const fused = new Map<string, { score: number; legs: Array<'bm25' | 'dense'> }>();
  const addLeg = (ranked: string[], leg: 'bm25' | 'dense') => {
    ranked.forEach((id, rank) => {
      const cur = fused.get(id) ?? { score: 0, legs: [] };
      cur.score += 1 / (RRF_K + rank + 1);
      cur.legs.push(leg);
      fused.set(id, cur);
    });
  };
  addLeg(bm25Ranked, 'bm25');
  addLeg(denseRanked, 'dense');

  const docs: RetrievedDoc[] = [...fused.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, k)
    .map(([id, { score, legs }]) => ({ doc: getDoc(id)!, score, legs }))
    .filter((d) => d.doc !== undefined);

  return { mode, docs };
}

/** Flatten retrieved docs into the evidence-passage shape the judge grounds on. */
export function toPassages(result: RetrievalResult) {
  return result.docs.map((d) => ({ id: d.doc.id, title: d.doc.title, text: d.doc.text }));
}
