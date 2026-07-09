import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTask } from '../src/generator/task-text';
import type { Template, Binding } from '../src/generator/types';

const template: Template = {
  skill: 'ap-task-demo',
  database: 'aperture',
  family: 'single-table',
  sqlShape: 'SELECT {col} FROM orders',
  slots: [{ name: 'col', kind: 'projection' }, { name: 'table', kind: 'table' }],
  bindingRules: [],
  phrasings: ['Show {col} labelled {col:human} from {table}'],
  hintTemplate: 'x',
  scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
  gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

const binding: Binding = {
  skill: 'ap-task-demo',
  database: 'aperture',
  bindingIndex: 3,
  slots: { col: 'unit_price', table: 'orders' },
  literals: {}
};

test('renderTask substitutes exact and humanized placeholders, deterministically', () => {
  const t1 = renderTask(template, binding);
  const t2 = renderTask(template, binding);
  assert.equal(t1, t2);
  assert.equal(t1, 'Show unit_price labelled unit price from orders');
  assert.ok(!t1.includes('{'));
});
