import type { Concept, Exercise, ScaffoldTier } from '../types';

export const MIN_LESSON_STEPS = 5;
export const MAX_LESSON_STEPS = 8;

const TIER_SEQUENCE: ScaffoldTier[] = ['full', 'full', 'half', 'half', 'blank', 'blank', 'blank', 'blank'];

export interface LessonStep {
  id: string;
  exercise: Exercise;
  tier: ScaffoldTier;
}

function exerciseKey(exercise: Exercise): string {
  return exercise.dedupeKey || exercise.expectedSql?.trim() || exercise.id;
}

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

  if (!available.length) return [];

  return available.map((exercise, index): LessonStep => {
    const tier = available.length >= MIN_LESSON_STEPS ? 'full' : TIER_SEQUENCE[index];

    return { id: exercise.id, exercise, tier };
  });
}
