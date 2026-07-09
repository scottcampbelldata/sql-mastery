import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  exerciseDiversityIssues,
  MIN_EXERCISES_PER_SKILL
} from '../src/generator/diversity';
import { APERTURE_CONCEPT_META } from '../src/generator/templates/aperture/index';
import { SIDELINE_CONCEPT_META } from '../src/generator/templates/sideline/index';
import { ROVE_CONCEPT_META } from '../src/generator/templates/rove/index';
import { GENERATED_EXERCISES as APERTURE_EXERCISES } from '../src/phases/aperture/exercises.generated';
import { GENERATED_EXERCISES as SIDELINE_EXERCISES } from '../src/phases/sideline/exercises.generated';
import { GENERATED_EXERCISES as ROVE_EXERCISES } from '../src/phases/rove/exercises.generated';
import type { ConceptMeta, DraftExercise, Exercise } from '../src/generator/types';

function flatten(generated: Record<string, Exercise[]>): DraftExercise[] {
  return Object.values(generated).flat();
}

function assertGeneratedDiversity(
  database: string,
  generated: Record<string, Exercise[]>,
  meta: ConceptMeta[]
): void {
  const issues = exerciseDiversityIssues(flatten(generated), meta);
  assert.deepEqual(
    issues,
    [],
    `${database} concepts need at least ${MIN_EXERCISES_PER_SKILL} distinct expectedSql exercises`
  );
}

test('generated curriculum has enough distinct SQL exercises per concept', () => {
  assertGeneratedDiversity('aperture', APERTURE_EXERCISES, APERTURE_CONCEPT_META);
  assertGeneratedDiversity('sideline', SIDELINE_EXERCISES, SIDELINE_CONCEPT_META);
  assertGeneratedDiversity('rove', ROVE_EXERCISES, ROVE_CONCEPT_META);
});
