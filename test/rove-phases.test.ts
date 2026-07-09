import test from 'node:test';
import assert from 'node:assert/strict';

import { flattenLearningPath } from '../src/learning-path';
import { rovePhases } from '../src/phases/rove/index';
import { APERTURE_PHASES } from '../src/generator/templates/aperture/index';
import { SIDELINE_PHASES } from '../src/generator/templates/sideline/index';
import { ROVE_SKILLS } from '../src/generator/templates/rove/index';

const ROVE_PHASE_IDS = ['rv-clean', 'rv-analytic', 'rv-behavioral'];

test('rove assembles exactly 3 advanced phases in canonical global order', () => {
  assert.equal(rovePhases.length, 3);
  assert.deepEqual(rovePhases.map((p) => p.id), ROVE_PHASE_IDS);
  const offset = APERTURE_PHASES.length + SIDELINE_PHASES.length;
  assert.deepEqual(rovePhases.map((p) => p.order), [offset + 1, offset + 2, offset + 3]);
  for (const p of rovePhases) {
    assert.equal(p.level, 'advanced');
    assert.equal(p.database, 'rove');
    assert.ok(typeof p.goal === 'string' && p.goal.length > 0);
  }
});

test('rove band totals 24 concepts with contiguous LOCAL order per phase', () => {
  const total = rovePhases.reduce((n, p) => n + p.concepts.length, 0);
  assert.equal(total, 24);
  assert.deepEqual(rovePhases.flatMap((p) => p.concepts.map((c) => c.skill)), ROVE_SKILLS);

  const skills = new Set<string>();
  for (const p of rovePhases) {
    const orders = p.concepts.map((c) => c.order);
    assert.deepEqual(orders, orders.map((_, i) => i + 1));
    for (const c of p.concepts) {
      assert.equal(c.phaseId, p.id);
      assert.ok(!skills.has(c.skill), `duplicate skill ${c.skill}`);
      skills.add(c.skill);
    }
  }
  assert.equal(skills.size, 24);
});

test('every rove concept carries a teach block and exactly one fingerprinted exercise', () => {
  const exerciseIds = new Set<string>();

  for (const p of rovePhases) {
    for (const c of p.concepts) {
      assert.ok(c.teach && typeof c.teach.plain === 'string' && c.teach.plain.length > 0);
      assert.equal(c.exercises.length, 1, `${c.skill} should have one frozen exercise`);

      const [ex] = c.exercises;
      assert.equal(ex.database, 'rove');
      assert.equal(ex.skill, c.skill);
      assert.ok(!exerciseIds.has(ex.id), `duplicate exercise id ${ex.id}`);
      exerciseIds.add(ex.id);
      assert.ok(ex.fingerprint && Array.isArray(ex.fingerprint.columns), `${ex.id} missing fingerprint`);
      assert.ok(ex.fingerprint.columns.length > 0, `${ex.id} missing fingerprint columns`);
      assert.ok(ex.fingerprint.rowCount >= 1, `${ex.id} fingerprint has no rows`);
      assert.match(ex.fingerprint.orderedRowHash, /^[a-f0-9]{64}$/);
      assert.match(ex.fingerprint.unorderedRowHash, /^[a-f0-9]{64}$/);
      assert.ok(ex.starterSql && typeof ex.starterSql.full === 'string');
    }
  }

  assert.equal(exerciseIds.size, 24);
});

test('checkpoints cp1..cp5 wired; cp5 capstone lives in rv-behavioral and draws every rove skill', () => {
  const ids = rovePhases.flatMap((p) => p.checkpoints.map((cp) => cp.id));
  assert.deepEqual(ids, ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']);

  const behavioral = rovePhases.find((p) => p.id === 'rv-behavioral');
  assert.ok(behavioral, 'rv-behavioral phase must exist');
  const cp5 = behavioral.checkpoints.find((cp) => cp.id === 'cp5');
  assert.ok(cp5, 'cp5 capstone must sit in rv-behavioral');
  assert.deepEqual([...cp5.drawFromSkills].sort(), [...ROVE_SKILLS].sort());

  for (const p of rovePhases) {
    for (const cp of p.checkpoints) {
      const maxLocal = Math.max(...p.concepts.map((c) => c.order));
      assert.ok(cp.afterOrder >= 1 && cp.afterOrder <= maxLocal, `${cp.id} afterOrder out of local range`);
      for (const skill of cp.drawFromSkills) {
        assert.ok(ROVE_SKILLS.includes(skill), `${cp.id} draws unknown skill ${skill}`);
      }
    }
  }
});

test('flattenLearningPath sees 24 rove concepts + 5 checkpoints', () => {
  const flat = flattenLearningPath([...rovePhases]);
  assert.equal(flat.concepts.length, 24);
  assert.equal(flat.checkpoints.length, 5);
  assert.equal(flat.exercises.length, 24);
  assert.deepEqual(flat.concepts.map((c: any) => c.order), Array.from({ length: 24 }, (_, i) => i + 1));
});
