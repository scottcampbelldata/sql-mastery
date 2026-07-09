import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAllExercises, buildExercisesFor } from '../src/generator/index';

test('buildExercisesFor short-circuits empty registries without DB access', async () => {
  assert.deepEqual(await buildExercisesFor('aperture'), []);
  assert.deepEqual(await buildExercisesFor('sideline'), []);
  assert.deepEqual(await buildExercisesFor('rove'), []);
});

test('buildAllExercises returns a record keyed by the three databases', async () => {
  const all = await buildAllExercises();
  assert.deepEqual(Object.keys(all).sort(), ['aperture', 'rove', 'sideline']);
  assert.deepEqual(all.aperture, []);
  assert.deepEqual(all.sideline, []);
  assert.deepEqual(all.rove, []);
});
