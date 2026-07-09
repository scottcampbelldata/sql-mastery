import test from 'node:test';
import assert from 'node:assert/strict';

import { flattenLearningPath } from '../src/learning-path';
import { APERTURE_PHASES } from '../src/generator/templates/aperture/index';
import { sidelinePhases } from '../src/phases/sideline/index';
import { MIN_EXERCISES_PER_SKILL } from '../src/generator/diversity';

const SIDELINE_PHASE_IDS = ['sideline-joins', 'sideline-subqueries', 'sideline-windows'];

test('sideline assembles exactly 3 intermediate phases in canonical global order', () => {
  assert.equal(sidelinePhases.length, 3);
  assert.deepEqual(sidelinePhases.map((p) => p.id), SIDELINE_PHASE_IDS);
  const offset = APERTURE_PHASES.length;
  assert.deepEqual(sidelinePhases.map((p) => p.order), [offset + 1, offset + 2, offset + 3]);
  for (const p of sidelinePhases) {
    assert.equal(p.level, 'intermediate');
    assert.equal(p.database, 'sideline');
    assert.ok(typeof p.goal === 'string' && p.goal.length > 0);
  }
});

test('sideline band totals 21 concepts with contiguous LOCAL order per phase', () => {
  const total = sidelinePhases.reduce((n, p) => n + p.concepts.length, 0);
  assert.equal(total, 21);
  const skills = new Set<string>();
  for (const p of sidelinePhases) {
    const orders = p.concepts.map((c) => c.order);
    assert.deepEqual(orders, orders.map((_, i) => i + 1));
    for (const c of p.concepts) {
      assert.equal(c.phaseId, p.id);
      assert.ok(!skills.has(c.skill), `duplicate skill ${c.skill}`);
      skills.add(c.skill);
    }
  }
  assert.equal(skills.size, 21);
});

test('every sideline concept carries a teach block and enough fingerprinted exercises', () => {
  const exercises = sidelinePhases.flatMap((p) => p.concepts.flatMap((c) => c.exercises));
  assert.ok(exercises.length >= 21 * MIN_EXERCISES_PER_SKILL);
  for (const p of sidelinePhases) {
    for (const c of p.concepts) {
      assert.ok(c.teach && typeof c.teach.plain === 'string' && c.teach.plain.length > 0);
      assert.ok(c.exercises.length >= MIN_EXERCISES_PER_SKILL, `${c.skill} has only ${c.exercises.length} exercises`);
      for (const ex of c.exercises) {
        assert.equal(ex.database, 'sideline');
        assert.equal(ex.skill, c.skill);
        assert.ok(ex.fingerprint && Array.isArray(ex.fingerprint.columns), `${ex.id} missing fingerprint`);
        assert.match(ex.fingerprint.orderedRowHash, /^[0-9a-f]{64}$/);
        assert.match(ex.fingerprint.unorderedRowHash, /^[0-9a-f]{64}$/);
        assert.ok(ex.starterSql && typeof ex.starterSql.full === 'string');
      }
    }
  }
});

test('checkpoints cpF..cpI wired; cpI capstone lives in sideline-windows and draws every sideline skill', () => {
  const ids = sidelinePhases.flatMap((p) => p.checkpoints.map((cp) => cp.id)).sort();
  assert.deepEqual(ids, ['cpF', 'cpG', 'cpH', 'cpI']);
  const windows = sidelinePhases.find((p) => p.id === 'sideline-windows');
  assert.ok(windows, 'sideline-windows phase must exist');
  const cpI = windows.checkpoints.find((cp) => cp.id === 'cpI');
  assert.ok(cpI, 'cpI capstone must sit in sideline-windows');
  const bandSkills = sidelinePhases.flatMap((p) => p.concepts.map((c) => c.skill));
  assert.deepEqual([...cpI.drawFromSkills].sort(), [...bandSkills].sort());
  for (const p of sidelinePhases) {
    for (const cp of p.checkpoints) {
      const maxLocal = Math.max(...p.concepts.map((c) => c.order));
      assert.ok(cp.afterOrder >= 1 && cp.afterOrder <= maxLocal, `${cp.id} afterOrder out of local range`);
    }
  }
});

test('flattenLearningPath sees 21 sideline concepts + 4 checkpoints', () => {
  const flat = flattenLearningPath([...sidelinePhases]);
  assert.equal(flat.concepts.length, 21);
  assert.equal(flat.checkpoints.length, 4);
  assert.deepEqual(flat.concepts.map((c: any) => c.order), Array.from({ length: 21 }, (_, i) => i + 1));
});
