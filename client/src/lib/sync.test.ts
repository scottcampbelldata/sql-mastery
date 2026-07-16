import { describe, it, expect, vi } from 'vitest';
import { collectProgress, deepMerge, mergeProgress, mergeLearningState, syncNow } from './sync';
import { resetConcept } from './foundations';
import * as apiModule from './api';
import type { LearningState } from '../types';

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

  it('propagates a lesson reset: the higher reset epoch voids the other side\'s progress', async () => {
    const before = { skillCorrect: { a: ['a1', 'a2'], b: ['b1'] }, reviewsPassed: { a: 2, b: 1 }, lastPracticedSession: { a: 4, b: 4 } };
    const afterReset = { skillCorrect: { b: ['b1'] }, reviewsPassed: { b: 1 }, lastPracticedSession: { b: 4 }, skillResets: { a: 1 } };

    // Both directions: whichever side carries the newer epoch for skill a wins skill a wholesale.
    for (const merged of [mergeLearningState(before, afterReset), mergeLearningState(afterReset, before)]) {
      expect(merged.skillCorrect.a).toBeUndefined();
      expect(merged.reviewsPassed.a).toBeUndefined();
      expect(merged.lastPracticedSession.a).toBeUndefined();
      expect(merged.skillCorrect.b).toEqual(['b1']); // untouched skill still unions
      expect(merged.skillResets.a).toBe(1);
    }
  });

  it('progress earned after the reset survives; equal epochs still merge loss-free', async () => {
    const stale = { skillCorrect: { a: ['old1', 'old2'] }, reviewsPassed: {}, lastPracticedSession: {} };
    const resetThenPracticed = { skillCorrect: { a: ['new1'] }, reviewsPassed: {}, lastPracticedSession: { a: 9 }, skillResets: { a: 1 } };
    const merged = mergeLearningState(stale, resetThenPracticed);
    expect(merged.skillCorrect.a).toEqual(['new1']);
    expect(merged.lastPracticedSession.a).toBe(9);

    const sameEpochA = { skillCorrect: { a: ['x1'] }, skillResets: { a: 1 } };
    const sameEpochB = { skillCorrect: { a: ['x2'] }, skillResets: { a: 1 } };
    expect(mergeLearningState(sameEpochA, sameEpochB).skillCorrect.a.sort()).toEqual(['x1', 'x2']);
  });

  it('resetConcept bumps the synced epoch alongside clearing local progress', () => {
    const state = {
      skillCorrect: { a: ['a1'] }, attempts: {}, lastSql: {}, lastPracticedSession: { a: 3 },
      checkpointsPassed: [], sessionCounter: 5, reviewsPassed: { a: 1 }, maxUnlockedOrder: 4
    } as LearningState;
    resetConcept(state, 'a');
    expect(state.skillCorrect.a).toBeUndefined();
    expect(state.skillResets).toEqual({ a: 1 });
    resetConcept(state, 'a');
    expect(state.skillResets).toEqual({ a: 2 });
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
