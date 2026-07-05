const PROGRESS_KEY = 'sqlm:product-progress:v1';
export const ACTIVE_SESSION_KEY = 'sqlm:product-active-session:v1';
export const SIDEBAR_KEY = 'sqlm:sidebar-collapsed:v1';

/* localStorage can throw (Safari private mode, quota, disabled storage) —
   like the legacy shared.js, treat storage as best-effort. */
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* best-effort: ignore */ }
}
function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch { /* best-effort: ignore */ }
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function loadProgress() {
  try {
    const parsed = JSON.parse(safeGet(PROGRESS_KEY));
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

export function saveProgress(progress) {
  safeSet(PROGRESS_KEY, JSON.stringify(progress));
}

export function markComplete(progress, exerciseId) {
  progress.completed[exerciseId] = {
    completedAt: new Date().toISOString(),
    attempts: progress.attempts[exerciseId] || 0
  };
}

/* legacy lesson checkbox keys: sqlm:<data-page>:<data-id> = '1' */
export function isLessonBoxChecked(page, id) {
  return safeGet(`sqlm:${page}:${id}`) === '1';
}
export function setLessonBox(page, id, checked) {
  if (checked) safeSet(`sqlm:${page}:${id}`, '1');
  else safeRemove(`sqlm:${page}:${id}`);
}
