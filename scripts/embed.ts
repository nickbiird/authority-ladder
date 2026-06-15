/**
 * Precomputes dense embeddings for every corpus doc and writes
 * data/embeddings.json (base64-encoded Float32Arrays, 768 dims).
 *
 * Why static embeddings instead of a vector database: the corpus is ~30 pattern
 * cards. At that scale a brute-force cosine scan is sub-millisecond, the file is
 * tiny, and the deployed demo needs ZERO retrieval infrastructure. pgvector is
 * the right call at 100k+ docs or a mutable corpus — this one changes only when
 * a card is re-authored, i.e. rarely and by re-ingest.
 *
 * Run: GOOGLE_API_KEY=... npm run ingest:embed   (one-off, costs a fraction of a cent)
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MODEL = process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001';
const DIMS = 768; // MRL truncation: 768 keeps near-full quality at 1/4 the size of 3072
const BATCH = 32;

interface Doc { id: string; title: string; text: string }

async function embedBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: DIMS,
        })),
      }),
    },
  );
  if (!res.ok) throw new Error(`embed HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { embeddings: { values: number[] }[] };
  return json.embeddings.map((e) => e.values);
}

function toBase64(vec: number[]): string {
  // L2-normalise at write time so retrieval cosine = dot product
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return Buffer.from(new Float32Array(vec.map((v) => v / norm)).buffer).toString('base64');
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY is required (Google AI Studio key). Retrieval works BM25-only without this step.');
    process.exit(1);
  }
  const corpus = JSON.parse(await readFile(path.join(process.cwd(), 'data', 'corpus.json'), 'utf8'));
  const docs: Doc[] = corpus.docs;
  console.log(`Embedding ${docs.length} docs with ${MODEL} @ ${DIMS} dims...`);

  const vectors: Record<string, string> = {};
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const embs = await embedBatch(batch.map((d) => `${d.title}\n${d.text}`), apiKey);
    batch.forEach((d, j) => {
      vectors[d.id] = toBase64(embs[j]);
    });
    console.log(`  ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }

  await writeFile(
    path.join(process.cwd(), 'data', 'embeddings.json'),
    JSON.stringify({ model: MODEL, dims: DIMS, corpusVersion: corpus.version, vectors }),
  );
  console.log(`Wrote data/embeddings.json (${Object.keys(vectors).length} vectors)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
