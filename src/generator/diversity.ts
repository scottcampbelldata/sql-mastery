import type { ConceptMeta, DraftExercise } from './types';

export const MIN_EXERCISES_PER_SKILL = 5;

export interface ExerciseDiversityIssue {
  skill: string;
  count: number;
  required: number;
}

export function normalizeExpectedSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function countDistinctExpectedSqlBySkill(exercises: DraftExercise[]): Map<string, number> {
  const bySkill = new Map<string, Set<string>>();

  for (const exercise of exercises) {
    const set = bySkill.get(exercise.skill) ?? new Set<string>();
    set.add(normalizeExpectedSql(exercise.expectedSql));
    bySkill.set(exercise.skill, set);
  }

  return new Map(Array.from(bySkill.entries(), ([skill, values]) => [skill, values.size]));
}

export function exerciseDiversityIssues(
  exercises: DraftExercise[],
  meta: ConceptMeta[],
  required = MIN_EXERCISES_PER_SKILL
): ExerciseDiversityIssue[] {
  const counts = countDistinctExpectedSqlBySkill(exercises);
  return meta
    .map((concept) => ({
      skill: concept.skill,
      count: counts.get(concept.skill) ?? 0,
      required
    }))
    .filter((issue) => issue.count < issue.required);
}
