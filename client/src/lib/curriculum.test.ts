import { describe, it, expect } from 'vitest';
import { percent, completedCount, sessionComplete, currentSession, lessonSlug, lessonForExercise } from './curriculum';
import type { Session, CompletionRecord } from '../types';

const sessions = [
  { id: 's1', exerciseIds: ['a', 'b'] },
  { id: 's2', exerciseIds: ['c'] }
] as Session[];

describe('curriculum helpers', () => {
  it('percent rounds and handles zero total', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
  it('completedCount / sessionComplete', () => {
    const completed = { a: {}, b: {} } as unknown as Record<string, CompletionRecord>;
    expect(completedCount(sessions[0].exerciseIds, completed)).toBe(2);
    expect(sessionComplete(sessions[0], completed)).toBe(true);
    expect(sessionComplete(sessions[1], completed)).toBe(false);
  });
  it('currentSession prefers explicit active id, else first incomplete', () => {
    const completed = { a: {}, b: {} } as unknown as Record<string, CompletionRecord>;
    expect(currentSession(sessions, completed, 's1')!.id).toBe('s1');
    expect(currentSession(sessions, completed, '')!.id).toBe('s2');
    expect(currentSession(sessions, { a: {}, b: {}, c: {} } as unknown as Record<string, CompletionRecord>, '')!.id).toBe('s1');
  });
  it('currentSession returns null when sessions is empty', () => {
    expect(currentSession([], {}, '')).toBe(null);
    expect(currentSession(null, {}, '')).toBe(null);
  });
  it('lessonSlug strips .html from sourceFile', () => {
    expect(lessonSlug('m1-fundamentals.html')).toBe('m1-fundamentals');
  });
  it('lessonForExercise resolves by sourceFile when it names a real lesson', () => {
    expect(lessonForExercise({ sourceFile: 'm3-joins.html' })).toBe('m3-joins');
    expect(lessonForExercise({ sourceFile: 'schemas.html' })).toBe('schemas');
  });
  it('lessonForExercise falls back to the module lesson when sourceFile does not resolve', () => {
    // Academy exercises default sourceFile to index.html (no such lesson); resolve via moduleId.
    expect(lessonForExercise({ sourceFile: 'index.html', moduleId: 'm0' })).toBe('schemas');
    expect(lessonForExercise({ sourceFile: 'index.html', moduleId: 'm7' })).toBe('m7-interview-patterns');
  });
  it('lessonForExercise returns null when nothing resolves, so no dead link is rendered', () => {
    expect(lessonForExercise({ sourceFile: 'index.html', moduleId: 'nope' })).toBeNull();
    expect(lessonForExercise({})).toBeNull();
  });
});
