/**
 * Corpus loading. The corpus is a flat set of card-sized pattern docs (built by
 * scripts/ingest.ts from data/patterns/*.json), so there is no chunk/parent
 * split — each card IS a retrieval unit. Embeddings are static (precomputed at
 * ingest), base64-packed, and absent-tolerant: no embeddings file => the dense
 * leg is disabled and retrieval degrades to BM25-only, which says so.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Corpus, CorpusDoc } from './types';

let cached: Corpus | null = null;
let docIndex: Map<string, CorpusDoc> | null = null;

export function loadCorpus(): Corpus {
  if (!cached) {
    const p = path.join(process.cwd(), 'data', 'corpus.json');
    cached = JSON.parse(readFileSync(p, 'utf8')) as Corpus;
  }
  return cached;
}

export function getDoc(id: string): CorpusDoc | undefined {
  if (!docIndex) docIndex = new Map(loadCorpus().docs.map((d) => [d.id, d]));
  return docIndex.get(id);
}

export interface EmbeddingsFile {
  model: string;
  dims: number;
  corpusVersion: string;
  vectors: Record<string, string>; // docId -> base64(Float32)
}

let embCache: { present: boolean; dims: number; model: string; vectors: Map<string, Float32Array> } | null = null;

export function loadEmbeddings() {
  if (!embCache) {
    const p = path.join(process.cwd(), 'data', 'embeddings.json');
    if (!existsSync(p)) {
      embCache = { present: false, dims: 0, model: '', vectors: new Map() };
    } else {
      const raw = JSON.parse(readFileSync(p, 'utf8')) as EmbeddingsFile;
      const vectors = new Map<string, Float32Array>();
      for (const [id, b64] of Object.entries(raw.vectors)) {
        const buf = Buffer.from(b64, 'base64');
        vectors.set(id, new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4));
      }
      embCache = { present: true, dims: raw.dims, model: raw.model, vectors };
    }
  }
  return embCache;
}

/** Test seam: drop the in-process caches (used by ingest verification + tests). */
export function _resetCorpusCache() {
  cached = null;
  docIndex = null;
  embCache = null;
}
