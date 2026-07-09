import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDELINE_SKILLS,
  SIDELINE_CONCEPT_META,
  SIDELINE_PHASES,
  SIDELINE_CHECKPOINTS
} from '../src/generator/templates/sideline/index';

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

test('SIDELINE_PHASES are the three canonical intermediate phases, order 1..3', () => {
  assert.deepEqual(SIDELINE_PHASES.map((phase) => phase.id), ['sideline-joins', 'sideline-subqueries', 'sideline-windows']);
  assert.deepEqual(SIDELINE_PHASES.map((phase) => phase.order), [1, 2, 3]);
  assert.ok(SIDELINE_PHASES.every((phase) => phase.level === 'intermediate'));
  assert.ok(SIDELINE_PHASES.every((phase) => phase.title.length > 0 && phase.goal.length > 0));
});

test('SIDELINE_CHECKPOINTS are cpF..cpH mid + cpI capstone; every phaseId valid; capstone draws all skills', () => {
  const ids = SIDELINE_CHECKPOINTS.map((checkpoint) => checkpoint.id);
  assert.deepEqual([...ids].sort(), ['cpF', 'cpG', 'cpH', 'cpI']);
  const phaseIds = new Set(SIDELINE_PHASES.map((phase) => phase.id));
  assert.ok(SIDELINE_CHECKPOINTS.every((checkpoint) => phaseIds.has(checkpoint.phaseId)));
  const cpI = SIDELINE_CHECKPOINTS.find((checkpoint) => checkpoint.id === 'cpI');
  assert.ok(cpI);
  assert.equal(cpI.phaseId, 'sideline-windows');
  assert.deepEqual([...cpI.drawFromSkills].sort(), [...SIDELINE_SKILLS].sort());
  assert.ok(SIDELINE_CHECKPOINTS.every((checkpoint) => SIDELINE_SKILLS.length > 0 && checkpoint.drawFromSkills.every((skill) => SIDELINE_SKILLS.includes(skill))));
});

test('SIDELINE_CONCEPT_META is 1:1 with SIDELINE_SKILLS', () => {
  assert.equal(SIDELINE_CONCEPT_META.length, 21);
  assert.deepEqual(
    [...SIDELINE_CONCEPT_META.map((concept) => concept.skill)].sort(),
    [...SIDELINE_SKILLS].sort()
  );
  assert.equal(new Set(SIDELINE_CONCEPT_META.map((concept) => concept.skill)).size, 21);
});

test('every concept has a valid phaseId and a non-empty teach block', () => {
  const phaseIds = new Set(SIDELINE_PHASES.map((phase) => phase.id));
  for (const concept of SIDELINE_CONCEPT_META) {
    assert.ok(phaseIds.has(concept.phaseId), `bad phaseId ${concept.phaseId}`);
    assert.ok(concept.title.length > 0);
    assert.ok(concept.teach.plain.length > 0 && concept.teach.mentalModel.length > 0);
    assert.ok(concept.teach.example.sql.length > 0 && concept.teach.example.note.length > 0);
  }
});

test('local concept.order is contiguous 1..n within each phase', () => {
  for (const phase of SIDELINE_PHASES) {
    const orders = SIDELINE_CONCEPT_META
      .filter((concept) => concept.phaseId === phase.id)
      .map((concept) => concept.order)
      .sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, index) => index + 1), `phase ${phase.id} order not contiguous`);
  }
});
