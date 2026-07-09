import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHint } from '../src/generator/hint';
import type { Template, Binding } from '../src/generator/types';

const template: Template = {
  skill: 'ap-hint-demo',
  database: 'aperture',
  family: 'single-table',
  sqlShape: 'SELECT {col} FROM orders',
  slots: [{ name: 'col', kind: 'projection' }],
  bindingRules: [],
  phrasings: ['x'],
  hintTemplate: 'Use column {col} on {col:human}',
  scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
  gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

const binding: Binding = {
  skill: 'ap-hint-demo',
  database: 'aperture',
  bindingIndex: 0,
  slots: { col: 'order_total' },
  literals: {}
};

test('renderHint fills hintTemplate placeholders', () => {
  assert.equal(renderHint(template, binding), 'Use column order_total on order total');
});
