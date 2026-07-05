const PROGRESS_KEY = 'sqlm:product-progress:v1';
export const ACTIVE_SESSION_KEY = 'sqlm:product-active-session:v1';
export const SIDEBAR_KEY = 'sqlm:sidebar-collapsed:v1';

export function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (parsed && typeof parsed === 'object') {
      return { completed: parsed.completed || {}, attempts: parsed.attempts || {}, lastSql: parsed.lastSql || {} };
    }
  } catch { /* fall through */ }
  return { completed: {}, attempts: {}, lastSql: {} };
}

export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function markComplete(progress, exerciseId) {
  progress.completed[exerciseId] = {
    completedAt: new Date().toISOString(),
    attempts: progress.attempts[exerciseId] || 0
  };
}

/* legacy lesson checkbox keys: sqlm:<data-page>:<data-id> = '1' */
export function isLessonBoxChecked(page, id) {
  return localStorage.getItem(`sqlm:${page}:${id}`) === '1';
}
export function setLessonBox(page, id, checked) {
  if (checked) localStorage.setItem(`sqlm:${page}:${id}`, '1');
  else localStorage.removeItem(`sqlm:${page}:${id}`);
}
