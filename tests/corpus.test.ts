import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCorpus, getDoc } from '../lib/corpus';
import { PatternCard } from '../lib/types';

test('corpus loads and is non-trivial', () => {
  const corpus = loadCorpus();
  assert.ok(corpus.docs.length >= 25, `expected >=25 cards, got ${corpus.docs.length}`);
  assert.ok(corpus.version.length > 0);
});

test('every category is represented', () => {
  const cats = new Set(loadCorpus().docs.map((d) => d.category));
  for (const c of ['ai-or-not', 'autonomy-ladder', 'architecture', 'governance', 'adoption-failure']) {
    assert.ok(cats.has(c as never), `missing category ${c}`);
  }
});

test('card ids are unique and resolvable', () => {
  const docs = loadCorpus().docs;
  const ids = new Set(docs.map((d) => d.id));
  assert.equal(ids.size, docs.length, 'duplicate card id');
  for (const id of ids) assert.ok(getDoc(id), `getDoc failed for ${id}`);
});

test('the five ai-or-not verdict rubrics all exist with implies_verdict', () => {
  const docs = loadCorpus().docs.filter((d) => d.category === 'ai-or-not');
  const verdicts = new Set(docs.map((d) => d.implies_verdict));
  for (const v of ['none', 'classical_ml', 'single_llm', 'rag', 'agent']) {
    assert.ok(verdicts.has(v as never), `missing ai-or-not rubric for ${v}`);
  }
});

test('the four autonomy-ladder tiers all exist with implies_tier', () => {
  const docs = loadCorpus().docs.filter((d) => d.category === 'autonomy-ladder');
  const tiers = new Set(docs.map((d) => d.implies_tier));
  for (const t of ['suggest', 'draft', 'act_with_approval', 'act']) {
    assert.ok(tiers.has(t as never), `missing ladder card for ${t}`);
  }
});

test('source pattern files validate against the PatternCard schema', async () => {
  // Spot-check: re-parse one card per file through the schema to catch drift.
  const { readdirSync, readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'data', 'patterns');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const arr = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(Array.isArray(arr) && arr.length > 0, `${f} empty`);
    for (const card of arr) PatternCard.parse(card); // throws on drift
  }
});
