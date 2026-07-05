import { safeGet, safeSet } from '../lib/progress.js';

const THEME_KEY = 'sqlm:theme:v1';
const THEMES = ['light', 'dark'];

export function getTheme() {
  const saved = safeGet(THEME_KEY);
  return THEMES.includes(saved) ? saved : 'light'; // default light
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'light';
  document.documentElement.setAttribute('data-theme', value);
  return value;
}

export function setTheme(theme) {
  const value = applyTheme(theme);
  safeSet(THEME_KEY, value);
  return value;
}

// Call once before render so the first paint is already themed.
export function initTheme() {
  return applyTheme(getTheme());
}
