/**
 * Ingest: compile data/patterns/*.json (authored PatternCards) into the
 * retrievable data/corpus.json. Each card becomes one flat CorpusDoc whose
 * `text` concatenates the searchable surface (title + summary + body + failure
 * modes + rejected alternatives + tags), so BM25 and dense both have the full
 * card to match against. Validates every card against the Zod schema and fails
 * loudly on a bad card — a malformed corpus is a build error, not a silent skip.
 *
 * Run: npm run ingest
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PatternCard, type Corpus, type CorpusDoc, type PatternCard as Card } from '../lib/types';

const PATTERNS_DIR = path.join(process.cwd(), 'data', 'patterns');
const OUT = path.join(process.cwd(), 'data', 'corpus.json');

// A fixed version stamp so the corpus is reproducible. Bump when cards change
// materially; every roadmap stamps this, so a stale stamp is a reportable bug.
const CORPUS_VERSION = 'patterns-v1-2026-06';
// Fixed ingest timestamp keeps the artifact byte-identical across re-runs (no Date.now()).
const INGESTED_AT = '2026-06-15T00:00:00.000Z';

function buildText(c: Card): string {
  return [
    c.title,
    c.summary,
    c.body,
    c.failure_modes.join(' '),
    c.rejected_alternatives.join(' '),
    c.tags.join(' '),
  ]
    .filter(Boolean)
    .join('\n');
}

function main() {
  const files = readdirSync(PATTERNS_DIR).filter((f) => f.endsWith('.json'));
  if (files.length === 0) throw new Error(`No pattern files in ${PATTERNS_DIR}`);

  const docs: CorpusDoc[] = [];
  const seen = new Set<string>();
  let total = 0;

  for (const f of files.sort()) {
    const raw = JSON.parse(readFileSync(path.join(PATTERNS_DIR, f), 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${f} is not a JSON array of cards`);
    for (const item of raw) {
      const card = PatternCard.parse(item); // throws on a malformed card
      if (seen.has(card.id)) throw new Error(`Duplicate card id "${card.id}" (in ${f})`);
      seen.add(card.id);
      docs.push({
        id: card.id,
        title: card.title,
        category: card.category,
        text: buildText(card),
        implies_verdict: card.implies_verdict,
        implies_tier: card.implies_tier,
      });
      total += 1;
    }
  }

  const corpus: Corpus = { version: CORPUS_VERSION, ingested_at: INGESTED_AT, docs };
  writeFileSync(OUT, JSON.stringify(corpus, null, 2) + '\n');

  const byCat = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Ingested ${total} cards -> ${path.relative(process.cwd(), OUT)} (version ${CORPUS_VERSION})`);
  console.log('By category:', byCat);
}

main();
