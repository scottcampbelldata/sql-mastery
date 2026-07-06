import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadProgress, saveProgress, markComplete, isLessonBoxChecked, setLessonBox } from './progress';

describe('progress store', () => {
  beforeEach(() => localStorage.clear());

  it('loads default shape when storage empty or corrupt', () => {
    expect(loadProgress()).toEqual({ completed: {}, attempts: {}, lastSql: {} });
    localStorage.setItem('sqlm:product-progress:v1', '{not json');
    expect(loadProgress()).toEqual({ completed: {}, attempts: {}, lastSql: {} });
  });

  it('round-trips under the legacy key sqlm:product-progress:v1', () => {
    const p = loadProgress();
    p.lastSql['ex1'] = 'SELECT 1;';
    saveProgress(p);
    expect(JSON.parse(localStorage.getItem('sqlm:product-progress:v1')!).lastSql.ex1).toBe('SELECT 1;');
  });

  it('markComplete stamps completedAt and attempt count', () => {
    const p = loadProgress();
    p.attempts['ex1'] = 3;
    markComplete(p, 'ex1');
    expect(p.completed.ex1.attempts).toBe(3);
    expect(typeof p.completed.ex1.completedAt).toBe('string');
  });

  it('lesson checkboxes use the legacy sqlm:<page>:<id> keys', () => {
    setLessonBox('m1', 'p1-1', true);
    expect(localStorage.getItem('sqlm:m1:p1-1')).toBe('1');
    expect(isLessonBoxChecked('m1', 'p1-1')).toBe(true);
    setLessonBox('m1', 'p1-1', false);
    expect(localStorage.getItem('sqlm:m1:p1-1')).toBe(null);
  });

  it('saveProgress does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      expect(() => saveProgress({ completed: {}, attempts: {}, lastSql: {} })).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it('loadProgress coerces non-object subkeys to {}', () => {
    localStorage.setItem('sqlm:product-progress:v1', JSON.stringify({ completed: 'oops', attempts: 7, lastSql: null }));
    expect(loadProgress()).toEqual({ completed: {}, attempts: {}, lastSql: {} });
  });
});
