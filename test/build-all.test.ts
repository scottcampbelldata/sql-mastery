import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAllExercises, buildExercisesFor } from '../src/generator/index';

test('buildExercisesFor short-circuits empty registries without DB access', async () => {
  assert.deepEqual(await buildExercisesFor('sideline'), []);
  assert.deepEqual(await buildExercisesFor('rove'), []);
  assert.deepEqual(await buildExercisesFor('unknown'), []);
});

test('buildAllExercises remains exported', () => {
  assert.equal(typeof buildAllExercises, 'function');
});
