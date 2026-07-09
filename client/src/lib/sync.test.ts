import { describe, it, expect, vi } from 'vitest';
import { collectProgress, deepMerge, mergeProgress, syncNow } from './sync';
import * as apiModule from './api';

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

describe('learning progress sync', () => {
  it('collectProgress only includes the learning-state blob', () => {
    localStorage.clear();
    localStorage.setItem('sqlm:learning:v1', '{}');
    localStorage.setItem('sqlm:runner:sql', 'SELECT 1;');
    localStorage.setItem('sqlm:any-old-checkbox', '1');

    expect(collectProgress()).toEqual({ 'sqlm:learning:v1': '{}' });
  });

  it('deep-merges the learning-state blob', () => {
    const local = JSON.stringify({ skillCorrect: { a: ['a1'] }, attempts: { e1: 3 }, checkpointsPassed: ['cpA'] });
    const remote = JSON.stringify({ skillCorrect: { a: ['a2'], b: ['b1'] }, attempts: { e1: 5 }, checkpointsPassed: ['cpB'] });
    const out = mergeProgress(
      { 'sqlm:learning:v1': local },
      { 'sqlm:learning:v1': remote }
    );
    const merged = JSON.parse(out['sqlm:learning:v1']!);
    expect(merged.skillCorrect.a.sort()).toEqual(['a1', 'a2']);
    expect(merged.skillCorrect.b).toEqual(['b1']);
    expect(merged.attempts).toEqual({ e1: 5 });
    expect(merged.checkpointsPassed.sort()).toEqual(['cpA', 'cpB']);
  });

  it('syncNow merges account progress into local and pushes the union', async () => {
    localStorage.clear();
    localStorage.setItem('sqlm:learning:v1', JSON.stringify({ skillCorrect: { a: ['a1'] }, attempts: {}, checkpointsPassed: [] }));
    const put = vi.spyOn(apiModule.api, 'putProgress').mockResolvedValue({ ok: true, updatedAt: 'now' });
    vi.spyOn(apiModule.api, 'getProgress').mockResolvedValue({
      data: { 'sqlm:learning:v1': JSON.stringify({ skillCorrect: { b: ['b1'] }, attempts: {}, checkpointsPassed: [] }) },
      updatedAt: 'then'
    });

    await syncNow();

    const merged = JSON.parse(localStorage.getItem('sqlm:learning:v1') as string);
    expect(Object.keys(merged.skillCorrect).sort()).toEqual(['a', 'b']);
    expect(put).toHaveBeenCalled();
  });
});
