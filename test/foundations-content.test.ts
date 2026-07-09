import test from 'node:test';
import assert from 'node:assert/strict';

import { getLearningPath } from '../src/learning-path';

const LEVELS = ['beginner', 'intermediate', 'advanced'];

test('learning path is a multi-band, multi-phase path', () => {
  const learningPath = getLearningPath();
  assert.ok(learningPath, 'learningPath present');
  assert.equal(learningPath.dataset, 'three-band');
  assert.ok(learningPath.phases.length >= 3, 'at least one phase per band');
  const levels = new Set((learningPath.phases as any[]).map((phase) => phase.level));
  for (const level of LEVELS) assert.ok(levels.has(level), `has a ${level} phase`);
});

test('flattened concepts have globally increasing unique order, a phaseId, and a level', () => {
  const learningPath = getLearningPath();
  const orders = learningPath.concepts.map((concept: any) => concept.order);
  assert.deepEqual(orders, [...orders].sort((a: number, b: number) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.ok(learningPath.concepts.every((concept: any) => concept.phaseId), 'every concept has a phaseId');
  assert.ok(learningPath.concepts.every((concept: any) => LEVELS.includes(concept.level)), 'every concept has a level');
});

test('every learning-path exercise is checkable', () => {
  const learningPath = getLearningPath();
  for (const exercise of learningPath.exercises) {
    assert.ok(exercise.database, `${exercise.id} has a database`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((statement: string) => statement.trim()).length, 1, `${exercise.id} is one statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill`);
  }
});

test('checkpoints reference real skills in the flattened track', () => {
  const learningPath = getLearningPath();
  const skills = new Set(learningPath.skills.map((skill: any) => skill.skill));
  for (const checkpoint of learningPath.checkpoints) {
    for (const skill of checkpoint.drawFromSkills) assert.ok(skills.has(skill), `${checkpoint.id} -> known skill ${skill}`);
  }
});
