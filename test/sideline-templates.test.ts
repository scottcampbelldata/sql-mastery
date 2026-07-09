import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIDELINE_TEMPLATES,
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

test('every SIDELINE_SKILLS slug has at least one template', () => {
  const covered = new Set(SIDELINE_TEMPLATES.map((template) => template.skill));
  for (const skill of SIDELINE_SKILLS) assert.ok(covered.has(skill), `no template for ${skill}`);
});

test('every template skill is a known sideline skill and database is sideline', () => {
  for (const template of SIDELINE_TEMPLATES) {
    assert.ok(SIDELINE_SKILLS.includes(template.skill), `unknown skill ${template.skill}`);
    assert.equal(template.database, 'sideline');
  }
});

test('no sqlShape contains ORDER BY or ROUND because emit owns both', () => {
  for (const template of SIDELINE_TEMPLATES) {
    const upper = template.sqlShape.toUpperCase();
    assert.ok(!upper.includes('ORDER BY'), `${template.skill} sqlShape has ORDER BY`);
    assert.ok(!upper.includes('ROUND('), `${template.skill} sqlShape hand-writes ROUND`);
  }
});

test('each template carries the tiebreak slot its family requires', () => {
  for (const template of SIDELINE_TEMPLATES) {
    const kinds = new Set(template.slots.map((slot) => slot.kind));
    if (template.family === 'grouped') {
      assert.ok(kinds.has('groupCols'), `${template.skill} grouped needs groupCols slot`);
    } else if (template.family === 'windowed') {
      assert.ok(kinds.has('partitionCols') && kinds.has('rankKey'), `${template.skill} windowed needs partitionCols + rankKey`);
    } else {
      assert.ok(kinds.has('sortKey'), `${template.skill} ${template.family} needs a sortKey slot`);
    }
  }
});

test('every template has at least two phrasings, a hint, and gateHints', () => {
  for (const template of SIDELINE_TEMPLATES) {
    assert.ok(template.phrasings.length >= 2, `${template.skill} needs >= 2 phrasings`);
    assert.ok(template.hintTemplate.length > 0, `${template.skill} needs a hintTemplate`);
    assert.equal(template.gateHints.rowCeiling, 200);
    assert.equal(template.gateHints.boundedSlice, false);
  }
});

test('no source text uses banned dash characters', () => {
  const banned = /[\u2013\u2014\u2212\u2192]/;
  for (const template of SIDELINE_TEMPLATES) {
    const text = template.sqlShape + template.phrasings.join(' ') + template.hintTemplate;
    assert.ok(!banned.test(text), `${template.skill} contains a banned dash/arrow`);
  }
});
