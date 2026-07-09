export const SIDEBAR_KEY = 'sqlm:sidebar-collapsed:v1';

// localStorage can throw in private mode, quota exhaustion, or locked-down browsers.
// Treat storage as best-effort so the app remains usable.
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
  } catch {
    // Best effort: ignore.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Best effort: ignore.
  }
}

const KEEP_ON_RESET = new Set<string>([
  'sqlm:theme:v1',
  SIDEBAR_KEY,
  'sqlm:auth-token:v1'
]);

export function resetAllProgress(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sqlm:') && !KEEP_ON_RESET.has(key)) doomed.push(key);
    }
    doomed.forEach((key) => safeRemove(key));
  } catch {
    // Best effort: ignore.
  }
}
