import { safeGet, safeSet } from '../lib/progress';

type Theme = 'light' | 'dark';

const THEME_KEY = 'sqlm:theme:v1';
const THEMES: string[] = ['light', 'dark'];

export function getTheme(): Theme {
  const saved = safeGet(THEME_KEY);
  return (saved !== null && THEMES.includes(saved)) ? saved as Theme : 'light'; // default light
}

export function applyTheme(theme: string | null | undefined): Theme {
  const value: Theme = (theme != null && THEMES.includes(theme)) ? theme as Theme : 'light';
  document.documentElement.setAttribute('data-theme', value);
  return value;
}

export function setTheme(theme: string | null | undefined): Theme {
  const value = applyTheme(theme);
  safeSet(THEME_KEY, value);
  return value;
}

// Call once before render so the first paint is already themed.
export function initTheme(): Theme {
  return applyTheme(getTheme());
}
