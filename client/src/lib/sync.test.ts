import { describe, it, expect } from 'vitest';
import { deepMerge, mergeProgress } from './sync';

describe('deepMerge (monotonic)', () => {
  it('takes the max of numbers', () => {
    expect(deepMerge(2, 5)).toBe(5);
    expect(deepMerge(9, 1)).toBe(9);
  });
  it('unions arrays without duplicates', () => {
    expect(deepMerge([1, 2], [2, 3]).sort()).toEqual([1, 2, 3]);
  });
  it('recurses objects and keeps keys from both sides', () => {
    expect(deepMerge({ a: 1, c: [1] }, { a: 3, b: 2, c: [2] })).toEqual({ a: 3, b: 2, c: [1, 2] });
  });
});

describe('mergeProgress', () => {
  it('unions lesson checkboxes from both devices', () => {
    const merged = mergeProgress({ 'sqlm:m1:p1-1': '1' }, { 'sqlm:m2:p2-1': '1' });
    expect(merged['sqlm:m1:p1-1']).toBe('1');
    expect(merged['sqlm:m2:p2-1']).toBe('1');
  });

  it('deep-merges the product-progress blob (completed union, attempts max)', () => {
    const local = JSON.stringify({ completed: { a: {} }, attempts: { a: 3 }, lastSql: {} });
    const remote = JSON.stringify({ completed: { b: {} }, attempts: { a: 5, b: 2 }, lastSql: {} });
    const out = mergeProgress(
      { 'sqlm:product-progress:v1': local },
      { 'sqlm:product-progress:v1': remote }
    );
    const merged = JSON.parse(out['sqlm:product-progress:v1']!);
    expect(Object.keys(merged.completed).sort()).toEqual(['a', 'b']);
    expect(merged.attempts).toEqual({ a: 5, b: 2 });
  });
});
