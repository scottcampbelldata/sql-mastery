// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadFoundations, migrateFoundationsState, maxConceptOrder, FOUNDATIONS_KEY } from './foundations';
import type { Track } from '../types';

// Live flattened track: 3 concepts (global order 1..3), one checkpoint.
const track = {
  dataset: 'aperture',
  skills: [
    { skill: 'ap-select-all', conceptId: 'c1', title: 'A', order: 1 },
    { skill: 'ap-order-by', conceptId: 'c2', title: 'B', order: 2 },
    { skill: 'ap-where-comparison', conceptId: 'c3', title: 'C', order: 3 }
  ],
  concepts: [
    { id: 'c1', order: 1, skill: 'ap-select-all', title: 'A', exercises: [] },
    { id: 'c2', order: 2, skill: 'ap-order-by', title: 'B', exercises: [] },
    { id: 'c3', order: 3, skill: 'ap-where-comparison', title: 'C', exercises: [] }
  ],
  checkpoints: [
    { id: 'cpA', afterOrder: 3, drawFromSkills: ['ap-select-all', 'ap-order-by', 'ap-where-comparison'], title: 'A' }
  ],
  phases: [],
  exercises: []
} as unknown as Track;

describe('FOUNDATIONS_KEY v2 clamp-on-load migration', () => {
  beforeEach(() => localStorage.clear());

  it('uses the v2 storage key', () => {
    expect(FOUNDATIONS_KEY).toBe('sqlm:foundations:v2');
  });

  it('maxConceptOrder returns the largest concept.order in the track', () => {
    expect(maxConceptOrder(track)).toBe(3);
  });

  it('safely migrates a stale v1 blob: clamps out-of-range maxUnlockedOrder and drops unknown ids', () => {
    const stale = {
      skillCorrect: { 'ap-select-all': ['c1-r1'], 'legacy-window-fn': ['z9'] },
      attempts: { 'c1-r1': 2 },
      lastSql: { 'c1-r1': 'select 1' },
      lastPracticedSession: { 'ap-select-all': 4, 'legacy-window-fn': 7 },
      checkpointsPassed: ['cpA', 'cp-legacy'],
      sessionCounter: 9,
      reviewsPassed: { 'ap-select-all': 1, 'legacy-window-fn': 3 },
      maxUnlockedOrder: 999
    };
    const migrated = migrateFoundationsState(stale, track);

    expect(migrated.maxUnlockedOrder).toBe(3);
    expect(migrated.skillCorrect).toEqual({ 'ap-select-all': ['c1-r1'] });
    expect(migrated.reviewsPassed).toEqual({ 'ap-select-all': 1 });
    expect(migrated.lastPracticedSession).toEqual({ 'ap-select-all': 4 });
    expect(migrated.checkpointsPassed).toEqual(['cpA']);
    expect(migrated.attempts).toEqual({ 'c1-r1': 2 });
    expect(migrated.lastSql).toEqual({ 'c1-r1': 'select 1' });
    expect(migrated.sessionCounter).toBe(9);
  });

  it('returns a clean default state for a non-object blob', () => {
    const empty = {
      skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {},
      checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0
    };
    expect(migrateFoundationsState(null, track)).toEqual(empty);
    expect(migrateFoundationsState('nope', track)).toEqual(empty);
    expect(migrateFoundationsState(['array'], track)).toEqual(empty);
  });

  it('loadFoundations(track) reads the v2 key and applies the clamp end-to-end', () => {
    localStorage.setItem(FOUNDATIONS_KEY, JSON.stringify({
      skillCorrect: { 'ghost-skill': ['x'] },
      maxUnlockedOrder: 500,
      checkpointsPassed: ['cpA', 'ghost-cp']
    }));
    const s = loadFoundations(track);
    expect(s.maxUnlockedOrder).toBe(3);
    expect(s.skillCorrect).toEqual({});
    expect(s.checkpointsPassed).toEqual(['cpA']);
  });

  it('loadFoundations() without a track preserves the sanitized blob (no clamp)', () => {
    localStorage.setItem(FOUNDATIONS_KEY, JSON.stringify({ maxUnlockedOrder: 500, skillCorrect: { 'ghost-skill': ['x'] } }));
    const s = loadFoundations();
    expect(s.maxUnlockedOrder).toBe(500);
    expect(s.skillCorrect).toEqual({ 'ghost-skill': ['x'] });
  });
});
