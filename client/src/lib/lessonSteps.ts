import type { Concept, Exercise, ScaffoldTier } from '../types';

export const MIN_LESSON_STEPS = 5;
export const MAX_LESSON_STEPS = 8;

const TIER_SEQUENCE: ScaffoldTier[] = ['full', 'full', 'half', 'half', 'blank', 'blank', 'blank', 'blank'];

export interface LessonStep {
  id: string;
  exercise: Exercise;
  tier: ScaffoldTier;
}

export function buildLessonSteps(concept: Pick<Concept, 'exercises'>, exercises = concept.exercises): LessonStep[] {
  const available = exercises.length ? exercises.slice(0, MAX_LESSON_STEPS) : concept.exercises.slice(0, MAX_LESSON_STEPS);
  if (!available.length) return [];

  const count = Math.min(MAX_LESSON_STEPS, Math.max(MIN_LESSON_STEPS, available.length));
  return Array.from({ length: count }, (_, index): LessonStep => {
    const source = available[index % available.length];
    const repeated = index >= available.length;
    const tier = available.length >= MIN_LESSON_STEPS ? 'full' : TIER_SEQUENCE[index];
    const exercise = repeated
      ? { ...source, id: `${source.id}__lesson_${index + 1}_${tier}` }
      : source;

    return { id: exercise.id, exercise, tier };
  });
}
