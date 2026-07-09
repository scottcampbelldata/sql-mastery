import test from 'node:test';
import assert from 'node:assert/strict';

import { aperturePhases } from '../src/phases/aperture/index';
import { flattenLearningPath } from '../src/learning-path';

const APERTURE_PHASE_IDS = ['ap-basics', 'ap-filtering', 'ap-shaping', 'ap-aggregation', 'ap-join'];

test('aperture assembles exactly 5 beginner phases in canonical global order', () => {
  assert.equal(aperturePhases.length, 5);
  assert.deepEqual(aperturePhases.map((p) => p.id), APERTURE_PHASE_IDS);
  assert.deepEqual(aperturePhases.map((p) => p.order), [1, 2, 3, 4, 5]);
  for (const p of aperturePhases) {
    assert.equal(p.level, 'beginner');
    assert.equal(p.database, 'aperture');
    assert.ok(typeof p.goal === 'string' && p.goal.length > 0);
  }
});

test('aperture band totals 17 concepts with contiguous LOCAL order per phase', () => {
  const total = aperturePhases.reduce((n, p) => n + p.concepts.length, 0);
  assert.equal(total, 17);
  const skills = new Set<string>();
  for (const p of aperturePhases) {
    const orders = p.concepts.map((c) => c.order);
    assert.deepEqual(orders, orders.map((_, i) => i + 1));
    for (const c of p.concepts) {
      assert.equal(c.phaseId, p.id);
      assert.ok(!skills.has(c.skill), `duplicate skill ${c.skill}`);
      skills.add(c.skill);
    }
  }
  assert.equal(skills.size, 17);
});

test('every concept carries a teach block and >=1 fingerprinted exercise', () => {
  for (const p of aperturePhases) {
    for (const c of p.concepts) {
      assert.ok(c.teach && typeof c.teach.plain === 'string' && c.teach.plain.length > 0);
      assert.ok(c.exercises.length >= 1, `${c.skill} has no exercises`);
      for (const ex of c.exercises) {
        assert.equal(ex.database, 'aperture');
        assert.ok(ex.fingerprint && Array.isArray(ex.fingerprint.columns), `${ex.id} missing fingerprint`);
        assert.ok(ex.starterSql && typeof ex.starterSql.full === 'string');
      }
    }
  }
});

test('checkpoints cpA..cpE wired; cpE capstone lives in ap-join and draws every beginner skill', () => {
  const ids = aperturePhases.flatMap((p) => p.checkpoints.map((cp) => cp.id)).sort();
  assert.deepEqual(ids, ['cpA', 'cpB', 'cpC', 'cpD', 'cpE']);
  const join = aperturePhases.find((p) => p.id === 'ap-join');
  assert.ok(join, 'ap-join phase must exist');
  const cpE = join.checkpoints.find((cp) => cp.id === 'cpE');
  assert.ok(cpE, 'cpE capstone must sit in ap-join');
  const bandSkills = aperturePhases.flatMap((p) => p.concepts.map((c) => c.skill));
  assert.deepEqual([...cpE.drawFromSkills].sort(), [...bandSkills].sort());
  for (const p of aperturePhases) {
    for (const cp of p.checkpoints) {
      const maxLocal = Math.max(...p.concepts.map((c) => c.order));
      assert.ok(cp.afterOrder >= 1 && cp.afterOrder <= maxLocal, `${cp.id} afterOrder out of local range`);
    }
  }
});

test('flattenLearningPath sees 17 concepts + 5 checkpoints', () => {
  const flat = flattenLearningPath([...aperturePhases]);
  assert.equal(flat.concepts.length, 17);
  assert.equal(flat.checkpoints.length, 5);
  assert.deepEqual(flat.concepts.map((c: any) => c.order), Array.from({ length: 17 }, (_, i) => i + 1));
});
