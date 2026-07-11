import type { Concept, Exercise } from '../types';

export const MAX_LESSON_STEPS = 8;

export interface LessonStep {
  id: string;
  exercise: Exercise;
}

function exerciseKey(exercise: Exercise): string {
  return exercise.dedupeKey || exercise.expectedSql?.trim() || exercise.id;
}

// Pick the distinct exercises that make up one lesson, bounded to MAX_LESSON_STEPS.
// The scaffold tier for each step is decided at render time by scaffoldTier() with the
// learner's band context, so the same lesson fades as the learner graduates bands.
export function buildLessonSteps(concept: Pick<Concept, 'exercises'>, exercises = concept.exercises): LessonStep[] {
  const sourceExercises = exercises.length ? exercises : concept.exercises;
  const seen = new Set<string>();
  const available: Exercise[] = [];

  for (const exercise of sourceExercises) {
    const key = exerciseKey(exercise);
    if (seen.has(key)) continue;

    seen.add(key);
    available.push(exercise);
    if (available.length === MAX_LESSON_STEPS) break;
  }

  return available.map((exercise): LessonStep => ({ id: exercise.id, exercise }));
}
