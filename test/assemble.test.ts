import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleExercise } from '../src/generator/assemble';
import type { Template, Binding } from '../src/generator/types';
import type { Catalog } from '../src/generator/schema-catalog';

const catalog = {
  database: 'aperture',
  tables: [{
    schema: 'public',
    name: 'orders',
    columns: [
      { name: 'order_id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
      { name: 'total', dataType: 'numeric', isNullable: false, isPrimaryKey: false }
    ],
    primaryKey: ['order_id'],
    foreignKeys: []
  }]
} as Catalog;

const template: Template = {
  skill: 'ap-assemble-demo',
  database: 'aperture',
  family: 'single-table',
  primaryTable: 'orders',
  sqlShape: 'SELECT {proj} FROM orders WHERE {flt}',
  slots: [
    { name: 'proj', kind: 'projection' },
    { name: 'flt', kind: 'literal', op: '>', col: 'total' },
    { name: 'sortKey', kind: 'sortKey' }
  ],
  bindingRules: [],
  phrasings: ['Report {proj} from orders'],
  hintTemplate: 'Filter total {flt}',
  scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
  gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: true, boundedSlice: false }
};

const binding: Binding = {
  skill: 'ap-assemble-demo',
  database: 'aperture',
  bindingIndex: 0,
  slots: { proj: 'total', sortKey: 'order_id' },
  literals: { flt: 'total > 100' }
};

test('assembleExercise is deterministic and produces a well-shaped DraftExercise', () => {
  const a = assembleExercise(template, binding, catalog);
  const b = assembleExercise(template, binding, catalog);
  assert.deepEqual(a, b);
  assert.ok(a.id.startsWith('ap-assemble-demo-'));
  assert.equal(a.skill, 'ap-assemble-demo');
  assert.equal(a.database, 'aperture');
  assert.equal(a.orderMatters, true);
  assert.equal(a.rowCeiling, 200);
  assert.ok(a.expectedSql.length > 0);
  for (const tier of ['full', 'half', 'blank'] as const) {
    assert.equal(typeof a.starterSql[tier], 'string');
    assert.equal(typeof a.blankMap[tier], 'object');
  }
  assert.ok(!('fingerprint' in a));
});

test('assembleExercise task contract includes aliases after FROM inside expressions', () => {
  const latencyTemplate: Template = {
    ...template,
    skill: 'rv-latency-demo',
    database: 'rove',
    family: 'grouped',
    sqlShape: 'SELECT AVG(EXTRACT(EPOCH FROM approved_at - applied_at)) AS avg_seconds FROM orders',
    slots: [{ name: 'groupCols', kind: 'groupCols' }],
    phrasings: ['Report average latency.']
  };
  const ex = assembleExercise(latencyTemplate, { ...binding, slots: { groupCols: 'avg_seconds' }, literals: {} }, catalog);
  assert.ok(ex.task.includes('avg_seconds'));
});

test('assembleExercise ids differ when the emitted SQL differs under the same binding', () => {
  const first = assembleExercise(template, binding, catalog);
  const second = assembleExercise({
    ...template,
    sqlShape: 'SELECT order_id FROM orders WHERE {flt}',
  }, binding, catalog);

  assert.notEqual(first.expectedSql, second.expectedSql);
  assert.notEqual(first.id, second.id);
});
