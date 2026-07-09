import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildScaffold } from '../src/generator/scaffold';
import type { Template, Binding } from '../src/generator/types';

const template: Template = {
  skill: 'ap-scaffold-demo',
  database: 'aperture',
  family: 'single-table',
  primaryTable: 'track',
  sqlShape: 'SELECT {proj} FROM track WHERE {flt}',
  slots: [
    { name: 'proj', kind: 'projection' },
    { name: 'flt', kind: 'literal', op: '>', col: 'milliseconds' },
    { name: 'sortKey', kind: 'sortKey' },
    { name: 'lim', kind: 'limit' }
  ],
  bindingRules: [],
  phrasings: ['x'],
  hintTemplate: 'x',
  scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
  gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: true, boundedSlice: false }
};

const binding: Binding = {
  skill: 'ap-scaffold-demo',
  database: 'aperture',
  bindingIndex: 0,
  slots: { proj: 'name, milliseconds', sortKey: 'track_id', lim: '10' },
  literals: { flt: 'milliseconds > 300000' }
};

const expectedSql =
  'SELECT name, milliseconds FROM track WHERE milliseconds > 300000 ORDER BY track_id LIMIT 10;';

function fillBack(starter: string, map: Record<string, string>): string {
  let s = starter;
  for (const [tok, ans] of Object.entries(map)) s = s.split(tok).join(ans);
  return s;
}

function blankCount(s: string): number {
  return (s.match(/__BLANK_\d+__/g) ?? []).length;
}

test('every tier fills back byte-for-byte to expectedSql', () => {
  const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
  for (const tier of ['full', 'half', 'blank'] as const) {
    assert.equal(fillBack(starterSql[tier], blankMap[tier]), expectedSql, `tier ${tier}`);
  }
});

test('blank-count equals answer-token count per tier', () => {
  const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
  for (const tier of ['full', 'half', 'blank'] as const) {
    assert.equal(blankCount(starterSql[tier]), Object.keys(blankMap[tier]).length, `tier ${tier}`);
  }
});

test('full keeps keywords visible; blank blanks whole clauses', () => {
  const { starterSql } = buildScaffold(expectedSql, binding, template);
  assert.ok(starterSql.full.includes('SELECT') && starterSql.full.includes('FROM'));
  assert.match(starterSql.blank, /SELECT __BLANK_\d+__/);
});
