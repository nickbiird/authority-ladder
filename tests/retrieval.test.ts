import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retrieve } from '../lib/retrieval';

// These run BM25-only (no embeddings / no key), the deterministic path.

test('BM25 retrieves the churn pattern for a churn query', async () => {
  const r = await retrieve('predict which customers will cancel from CRM history', { mode: 'bm25-only', k: 5 });
  assert.equal(r.mode, 'bm25-only');
  const ids = r.docs.map((d) => d.doc.id);
  assert.ok(ids.includes('pat-aon-classical-ml'), `got ${ids.join(', ')}`);
});

test('BM25 retrieves the not-AI pattern for a SQL-shaped query', async () => {
  const r = await retrieve('flag invoices more than 30 days overdue', { mode: 'bm25-only', k: 5 });
  const ids = r.docs.map((d) => d.doc.id);
  assert.ok(ids.includes('pat-aon-none'), `got ${ids.join(', ')}`);
});

test('category filter isolates the specialist slice', async () => {
  const r = await retrieve('autonomy and human approval for an agent that writes', {
    mode: 'bm25-only',
    k: 5,
    categories: ['architecture'],
  });
  assert.ok(r.docs.length > 0);
  for (const d of r.docs) assert.equal(d.doc.category, 'architecture', `leaked ${d.doc.category}`);
});

test('falls back to bm25-only when dense is requested without embeddings', async () => {
  // No embeddings.json in the test env -> hybrid degrades to bm25-only, transparently.
  const r = await retrieve('summarise support tickets', { mode: 'hybrid', k: 3 });
  assert.equal(r.mode, 'bm25-only');
});

test('retrieval returns at most k docs', async () => {
  const r = await retrieve('agent supervisor durable human gate', { mode: 'bm25-only', k: 3 });
  assert.ok(r.docs.length <= 3);
});
