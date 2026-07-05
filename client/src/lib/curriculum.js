export function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
export function completedCount(ids, completed) {
  return ids.filter((id) => completed[id]).length;
}
export function sessionComplete(session, completed) {
  return completedCount(session.exerciseIds, completed) === session.exerciseIds.length;
}
/* Returns null when there are no sessions — consumers must handle null. */
export function currentSession(sessions, completed, activeSessionId) {
  if (!sessions || !sessions.length) return null;
  const active = sessions.find((s) => s.id === activeSessionId);
  if (active) return active;
  return sessions.find((s) => !sessionComplete(s, completed)) || sessions[0];
}
export function lessonSlug(sourceFile) {
  return String(sourceFile || '').replace(/\.html$/, '');
}
