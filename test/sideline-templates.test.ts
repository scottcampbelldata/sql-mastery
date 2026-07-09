import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIDELINE_SKILLS } from '../src/generator/templates/sideline/index';

const EXPECTED_SKILLS = [
  'sl-join-inner',
  'sl-join-multi',
  'sl-join-left',
  'sl-anti-join',
  'sl-semi-join',
  'sl-self-join-match',
  'sl-self-join-compare',
  'sl-join-right-full',
  'sl-join-aggregate',
  'sl-case-expression',
  'sl-subquery-scalar',
  'sl-subquery-in',
  'sl-subquery-correlated',
  'sl-cte',
  'sl-set-ops',
  'sl-date-functions',
  'sl-scd-asof',
  'sl-window-rank',
  'sl-window-lag-lead',
  'sl-window-running',
  'sl-window-frame-basic',
];

test('SIDELINE_SKILLS is exactly the 21 canonical slugs', () => {
  assert.equal(SIDELINE_SKILLS.length, 21);
  assert.deepEqual([...SIDELINE_SKILLS].sort(), [...EXPECTED_SKILLS].sort());
});

test('SIDELINE_SKILLS are all sl- prefixed and unique', () => {
  assert.ok(SIDELINE_SKILLS.every((skill) => skill.startsWith('sl-')));
  assert.equal(new Set(SIDELINE_SKILLS).size, 21);
});
