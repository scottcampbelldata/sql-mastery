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

// Visual prefs and sign-in are kept across a progress reset; everything else under the
// sqlm: namespace (foundations mastery, curriculum completion, lesson checkboxes, saved
// SQL, the active session pointer) is wiped.
const KEEP_ON_RESET = new Set<string>([
  'sqlm:theme:v1',
  SIDEBAR_KEY,
  'sqlm:auth-token:v1',
  'sqlm:welcome-dismissed:v1'
]);

// Wipe all learning progress back to zero. Best-effort (storage can throw). The caller
// should reload the page afterwards so the in-memory state re-initializes from empty.
export function resetAllProgress(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sqlm:') && !KEEP_ON_RESET.has(key)) doomed.push(key);
    }
    doomed.forEach((k) => safeRemove(k));
  } catch { /* best-effort: ignore */ }
}
