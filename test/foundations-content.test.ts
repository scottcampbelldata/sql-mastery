import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurriculum } from '../src/curriculum-service';

test('curriculum exposes a multi-phase learning path', () => {
  const { learningPath } = buildCurriculum();
  assert.ok(learningPath, 'learningPath present');
  assert.equal(learningPath.dataset, 'chinook');
  assert.equal(learningPath.phases.length, 2, 'foundations + joins');
  assert.deepEqual(learningPath.phases.map((p: any) => p.id), ['foundations', 'joins']);
});

test('flattened concepts have globally increasing order and a phaseId', () => {
  const { learningPath } = buildCurriculum();
  const orders = learningPath.concepts.map((c: any) => c.order);
  assert.deepEqual(orders, [...orders].sort((a: number, b: number) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.equal(learningPath.concepts.length, 14, '9 foundations + 5 joins concepts');
  assert.ok(learningPath.concepts.every((c: any) => c.phaseId), 'every concept has a phaseId');
});

test('every learning-path exercise is checkable', () => {
  const { learningPath } = buildCurriculum();
  for (const exercise of learningPath.exercises) {
    assert.ok(exercise.database, `${exercise.id} has a database`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((s: string) => s.trim()).length, 1, `${exercise.id} is one statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill`);
  }
});

test('checkpoints reference real skills; joins checkpoints sit after their concepts', () => {
  const { learningPath } = buildCurriculum();
  const skills = new Set(learningPath.skills.map((s: any) => s.skill));
  for (const cp of learningPath.checkpoints) {
    for (const skill of cp.drawFromSkills) assert.ok(skills.has(skill), `${cp.id} → known skill ${skill}`);
  }
  const cpD = learningPath.checkpoints.find((c: any) => c.id === 'cpD');
  assert.equal(cpD.afterOrder, 14, 'cpD sits after the last joins concept (global order 14)');
});
