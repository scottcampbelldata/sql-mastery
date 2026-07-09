import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurriculum } from '../src/curriculum-service';

test('buildCurriculum exposes a learning path (three-band body lands in Task 17)', () => {
  const curriculum = buildCurriculum();
  assert.ok(curriculum.learningPath, 'learningPath present');
  assert.ok(Array.isArray(curriculum.learningPath.phases), 'phases is an array');
});
