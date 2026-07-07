import type { Session, Exercise } from '../types';
import { LESSONS } from '../lessons/manifest';

export function percent(done: number, total: number): number {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
// `completed` is only tested for truthiness, so any value-shaped map works.
export function completedCount(ids: string[], completed: Record<string, unknown>): number {
  return ids.filter((id) => completed[id]).length;
}
export function sessionComplete(session: Session, completed: Record<string, unknown>): boolean {
  return completedCount(session.exerciseIds, completed) === session.exerciseIds.length;
}
/* Returns null when there are no sessions: consumers must handle null. */
export function currentSession(sessions: Session[] | null | undefined, completed: Record<string, unknown>, activeSessionId: string | null | undefined): Session | null {
  if (!sessions || !sessions.length) return null;
  const active = sessions.find((s) => s.id === activeSessionId);
  if (active) return active;
  return sessions.find((s) => !sessionComplete(s, completed)) || sessions[0];
}
export function lessonSlug(sourceFile: string | undefined): string {
  return String(sourceFile || '').replace(/\.html$/, '');
}

// The lesson slug an exercise's "Read the full lesson" link should point at, or null when no
// real lesson exists (so the caller can omit the link rather than render a dead one). Prefers
// the exercise's sourceFile when it names a real lesson; falls back to the exercise's module
// (the manifest keys each lesson to a module via `page`). Some academy exercises default
// sourceFile to a non-existent "index.html", so the module fallback is what keeps their link alive.
export function lessonForExercise(exercise: Pick<Exercise, 'sourceFile' | 'moduleId'>): string | null {
  const bySource = LESSONS.find((l) => l.slug === lessonSlug(exercise.sourceFile));
  if (bySource) return bySource.slug;
  const byModule = exercise.moduleId ? LESSONS.find((l) => l.page === exercise.moduleId) : undefined;
  return byModule ? byModule.slug : null;
}
