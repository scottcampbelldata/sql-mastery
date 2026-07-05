const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCurriculum } = require('../src/curriculum-service');

test('curriculum includes a foundations block', () => {
  const curriculum = buildCurriculum();
  assert.ok(curriculum.foundations, 'foundations present');
  assert.equal(curriculum.foundations.dataset, 'chinook');
  assert.equal(curriculum.foundations.concepts.length, 8, 'eight concepts');
  assert.equal(curriculum.foundations.checkpoints.length, 2, 'two checkpoints');
});

test('every foundations exercise is checkable against chinook', () => {
  const { foundations } = buildCurriculum();
  for (const exercise of foundations.exercises) {
    assert.equal(exercise.database, 'chinook', `${exercise.id} targets chinook`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((s) => s.trim()).length, 1, `${exercise.id} is a single statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill tag`);
  }
});

test('checkpoints reference real skills, concepts are ordered 1..8', () => {
  const { foundations } = buildCurriculum();
  const skills = new Set(foundations.skills.map((s) => s.skill));
  for (const cp of foundations.checkpoints) {
    for (const skill of cp.drawFromSkills) {
      assert.ok(skills.has(skill), `checkpoint ${cp.id} references known skill ${skill}`);
    }
  }
  assert.deepEqual(foundations.concepts.map((c) => c.order), [1, 2, 3, 4, 5, 6, 7, 8]);
});
