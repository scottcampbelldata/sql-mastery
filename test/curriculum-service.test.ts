import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurriculum } from '../src/curriculum-service';

test('buildCurriculum exposes the three-band product and generated learning path', () => {
  const curriculum = buildCurriculum();
  const path = curriculum.learningPath;

  assert.equal(curriculum.product.name, 'SQL Mastery');
  assert.equal(curriculum.product.bands.length, 3);
  assert.deepEqual(
    curriculum.product.bands.map((band) => `${band.level}:${band.database}`),
    ['beginner:aperture', 'intermediate:sideline', 'advanced:rove']
  );

  assert.equal(path.dataset, 'three-band');
  assert.ok(Array.isArray(path.phases), 'phases is an array');
  assert.ok(Array.isArray(path.concepts), 'concepts is an array');
  assert.ok(Array.isArray(path.checkpoints), 'checkpoints is an array');
  assert.ok(Array.isArray(path.exercises), 'exercises is an array');
  assert.equal(path.phases.length > 0, true);
  assert.equal(path.concepts.length > 0, true);
  assert.equal(path.exercises.length > 0, true);
});

test('buildCurriculum does not expose answer contracts to the browser', () => {
  const curriculum = buildCurriculum();
  const leakedPaths: string[] = [];

  function walk(value: unknown, path: string) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'expectedSql' || key === 'fingerprint' || key === 'blankMap') leakedPaths.push(`${path}.${key}`);
      walk(child, `${path}.${key}`);
    }
  }

  walk(curriculum, 'curriculum');
  assert.deepEqual(leakedPaths, []);
  assert.match((curriculum.learningPath.exercises[0] as any).dedupeKey, /^[0-9a-f]{64}$/);
});

test('buildCurriculum reports band and path counts without retired scheduler fields', () => {
  const curriculum = buildCurriculum();
  const path = curriculum.learningPath;

  assert.equal(Object.hasOwn(curriculum, 'weeks'), false);
  assert.equal(Object.hasOwn(curriculum, 'sessions'), false);
  assert.equal(Object.hasOwn(curriculum.stats, 'totalWeeks'), false);
  assert.equal(Object.hasOwn(curriculum.stats, 'totalSessions'), false);

  assert.equal(curriculum.stats.totalPhases, path.phases.length);
  assert.equal(curriculum.stats.totalConcepts, path.concepts.length);
  assert.equal(curriculum.stats.totalExercises, path.exercises.length);
  assert.equal(curriculum.stats.totalCheckpoints, path.checkpoints.length);

  const phaseCount = curriculum.product.bands.reduce((sum, band) => sum + band.phaseCount, 0);
  const conceptCount = curriculum.product.bands.reduce((sum, band) => sum + band.conceptCount, 0);
  assert.equal(phaseCount, curriculum.stats.totalPhases);
  assert.equal(conceptCount, curriculum.stats.totalConcepts);

  curriculum.product.bands.forEach((band) => {
    const bandPhases = path.phases.filter((phase: any) => phase.level === band.level && phase.database === band.database);
    assert.equal(band.phaseCount, bandPhases.length);
    assert.equal(
      band.conceptCount,
      bandPhases.reduce((sum: number, phase: any) => sum + phase.concepts.length, 0)
    );
  });
});
