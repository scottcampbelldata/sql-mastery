import type { Progress } from '../types';

const PROGRESS_KEY = 'sqlm:product-progress:v1';
export const ACTIVE_SESSION_KEY = 'sqlm:product-active-session:v1';
export const SIDEBAR_KEY = 'sqlm:sidebar-collapsed:v1';

/* localStorage can throw (Safari private mode, quota, disabled storage).
   Like the legacy shared.js, treat storage as best-effort. */
export function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* best-effort: ignore */ }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch { /* best-effort: ignore */ }
}

function asPlainObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

export function loadProgress(): Progress {
  try {
    const parsed = JSON.parse(safeGet(PROGRESS_KEY) as string);
    if (parsed && typeof parsed === 'object') {
      return {
        completed: asPlainObject(parsed.completed),
        attempts: asPlainObject(parsed.attempts),
        lastSql: asPlainObject(parsed.lastSql)
      };
    }
  } catch { /* fall through */ }
  return { completed: {}, attempts: {}, lastSql: {} };
}

export function saveProgress(progress: Progress): void {
  safeSet(PROGRESS_KEY, JSON.stringify(progress));
}

export function markComplete(progress: Progress, exerciseId: string): void {
  progress.completed[exerciseId] = {
    completedAt: new Date().toISOString(),
    attempts: progress.attempts[exerciseId] || 0
  };
}

/* legacy lesson checkbox keys: sqlm:<data-page>:<data-id> = '1' */
export function isLessonBoxChecked(page: string, id: string): boolean {
  return safeGet(`sqlm:${page}:${id}`) === '1';
}
export function setLessonBox(page: string, id: string, checked: boolean): void {
  if (checked) safeSet(`sqlm:${page}:${id}`, '1');
  else safeRemove(`sqlm:${page}:${id}`);
}
