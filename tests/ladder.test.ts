import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autonomyCeiling, exceedsCeiling, tierRank, RISK_OBLIGATIONS, AUTONOMY_GATE } from '../lib/ladder';

test('cost-of-error sizes the autonomy ceiling', () => {
  assert.equal(autonomyCeiling('low'), 'act');
  assert.equal(autonomyCeiling('medium'), 'act_with_approval');
  assert.equal(autonomyCeiling('high'), 'act_with_approval');
});

test('exceedsCeiling flags over-granted autonomy', () => {
  // high cost-of-error must never reach full autonomy
  assert.equal(exceedsCeiling('act', 'high'), true);
  assert.equal(exceedsCeiling('act_with_approval', 'high'), false);
  // low cost-of-error tolerates full autonomy
  assert.equal(exceedsCeiling('act', 'low'), false);
  // suggest is always within ceiling
  assert.equal(exceedsCeiling('suggest', 'high'), false);
});

test('tier order is strict', () => {
  assert.ok(tierRank('suggest') < tierRank('draft'));
  assert.ok(tierRank('draft') < tierRank('act_with_approval'));
  assert.ok(tierRank('act_with_approval') < tierRank('act'));
});

test('every risk tier has obligations and every autonomy tier has a gate', () => {
  for (const t of ['prohibited', 'high', 'limited', 'minimal'] as const) {
    assert.ok(RISK_OBLIGATIONS[t].length > 0, `no obligations for ${t}`);
  }
  for (const t of ['suggest', 'draft', 'act_with_approval', 'act'] as const) {
    assert.ok(AUTONOMY_GATE[t].gate.length > 0, `no gate description for ${t}`);
  }
});
