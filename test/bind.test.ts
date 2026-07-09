import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindTemplate } from '../src/generator/bind';
import type { LiteralProbe } from '../src/generator/bind';
import type { Template } from '../src/generator/types';
import { REF_WHERE, REF_JOIN, REFERENCE_CATALOG } from './reference-templates';

const LITERAL_ONLY: Template = {
  ...REF_JOIN,
  skill: 'ap-literal-only',
  slots: [
    { name: 'stype', kind: 'literal', op: '=', col: 'spectral_type', table: 'stars', sampleStrategy: 'single' }
  ],
  bindingRules: []
};

const DATE_LITERAL: Template = {
  ...REF_JOIN,
  skill: 'ap-date-literal',
  slots: [
    { name: 'createdAt', kind: 'literal', op: '=', col: 'created_at', table: 'orders', sampleStrategy: 'single' }
  ],
  bindingRules: []
};

// Fake probe: compound planets rows for the AND case, distinct stars types for the literal-only case.
const PLANET_ROWS: (string | null)[][] = [
  ['Gas Giant', 'true'],
  ['Terrestrial', 'false'],
  ['Neptune-like', 'false']
];
const STAR_TYPES: (string | null)[][] = [['G'], ['K'], ['M']];
const probe: LiteralProbe = async (sql: string) => {
  if (/distinct\s+spectral_type/i.test(sql)) return STAR_TYPES;
  return PLANET_ROWS;
};

test('bind rejects non-pk sortKey candidates via predicate; keeps planet_id only', async () => {
  const bindings = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  assert.ok(bindings.length >= 1);
  for (const bnd of bindings) assert.equal(bnd.slots['sortKey'], 'planet_id');
});

test('compound AND literals are lifted from ONE co-occurring row (non-empty by construction)', async () => {
  const bindings = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  const rowSet = new Set(PLANET_ROWS.map((r) => `${r[0]}|${r[1]}`));
  for (const bnd of bindings) {
    assert.ok(bnd.literals['ptype'] && bnd.literals['ptype'].length > 0);
    assert.ok(bnd.literals['hz'] && bnd.literals['hz'].length > 0);
    // ptype/hz came from the SAME real row -> the AND predicate matches at least that row.
    assert.ok(rowSet.has(`${bnd.literals['ptype']}|${bnd.literals['hz']}`));
  }
});

test('bind is deterministic for a fixed seed', async () => {
  const a = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  const b = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((x) => x.bindingIndex), a.map((_x, i) => i)); // 0..n contiguous
});

test('bind draws a single literal for a template with no structural slots', async () => {
  const bindings = await bindTemplate(LITERAL_ONLY, REFERENCE_CATALOG, probe);
  assert.ok(bindings.length >= 1);
  for (const bnd of bindings) {
    assert.ok(['G', 'K', 'M'].includes(bnd.literals['stype']));
    assert.deepEqual(bnd.slots, {});
  }
});

test('bind serializes Date literal values as ISO strings', async () => {
  const dateProbe: LiteralProbe = async () => [[new Date('2021-04-05T12:34:56.000Z')]];
  const bindings = await bindTemplate(DATE_LITERAL, REFERENCE_CATALOG, dateProbe);
  assert.ok(bindings.length >= 1);
  for (const bnd of bindings) {
    assert.equal(bnd.literals['createdAt'], '2021-04-05T12:34:56.000Z');
  }
});
