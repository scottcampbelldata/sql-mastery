import type { Session } from '../types';

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
