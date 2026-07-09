import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetAllProgress, safeGet, safeSet, SIDEBAR_KEY } from './progress';

describe('storage helpers', () => {
  beforeEach(() => localStorage.clear());

  it('safeSet and safeGet round-trip values', () => {
    safeSet('sqlm:runner:sql', 'SELECT 1;');
    expect(safeGet('sqlm:runner:sql')).toBe('SELECT 1;');
  });

  it('safeSet does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      expect(() => safeSet('sqlm:runner:sql', 'SELECT 1;')).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('resetAllProgress keeps device prefs and auth while clearing learning data', () => {
    localStorage.setItem('sqlm:learning:v1', '{}');
    localStorage.setItem('sqlm:runner:sql', 'SELECT 1;');
    localStorage.setItem(SIDEBAR_KEY, '1');
    localStorage.setItem('sqlm:auth-token:v1', 'token');

    resetAllProgress();

    expect(localStorage.getItem('sqlm:learning:v1')).toBeNull();
    expect(localStorage.getItem('sqlm:runner:sql')).toBeNull();
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    expect(localStorage.getItem('sqlm:auth-token:v1')).toBe('token');
  });
});
