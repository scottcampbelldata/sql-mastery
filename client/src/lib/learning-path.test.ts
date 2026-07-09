import { describe, it, expect, beforeEach } from 'vitest';
import { LEARNING_KEY, loadLearning, saveLearning, currentPhase, phaseGraduation, reconcileUnlock, duplicateSkills } from './learning-path';
import { recordCorrect, recordCheckpointResult } from './foundations';
import type { Phase, LearningState } from '../types';

const phases = [
  { id: 'foundations', order: 1, title: 'F', goal: '', level: 'beginner', database: 'aperture', concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
    { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] }
  ], checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: ['select-all', 'where'], title: 'B' }] },
  { id: 'joins', order: 2, title: 'J', goal: '', level: 'intermediate', database: 'sideline', concepts: [
    { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
  ], checkpoints: [{ id: 'cpD', afterOrder: 3, drawFromSkills: ['inner-join'], title: 'D' }] }
] as Phase[];

function strong(state: LearningState, skill: string, ids: string[]) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

describe('learning-path client helpers', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default under its own key', () => {
    expect(loadLearning()).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 });
  });

  it('ignores old storage keys and starts from the learning key only', () => {
    localStorage.setItem('sqlm:foundations:v1', JSON.stringify({ skillCorrect: { 'select-all': ['c1-r1'] } }));
    const loaded = loadLearning();
    expect(loaded.skillCorrect).toEqual({});
    expect(localStorage.getItem(LEARNING_KEY)).toBeNull();
  });

  it('currentPhase stays on a phase until its concepts are strong AND its checkpoints pass', () => {
    const s = loadLearning();
    expect(currentPhase(phases, s).id).toBe('foundations');
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    // Concepts all strong, but cpB is not yet passed, so foundations is not left.
    expect(currentPhase(phases, s).id).toBe('foundations');
    recordCheckpointResult(s, phases[0].checkpoints[0], 6); // pass cpB
    expect(currentPhase(phases, s).id).toBe('joins'); // now foundations has fully graduated
  });

  it('phaseGraduation reports per-phase strong counts and completion', () => {
    const s = loadLearning();
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    let g = phaseGraduation(phases[0], s);
    expect(g.strong).toBe(2);
    expect(g.total).toBe(2);
    expect(g.complete).toBe(false); // checkpoint cpB not passed
    recordCheckpointResult(s, phases[0].checkpoints[0], 6);
    expect(phaseGraduation(phases[0], s).complete).toBe(true);
  });

  it('coerces a missing maxUnlockedOrder to 0 (returning user upgrade)', () => {
    const blob = { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 2, reviewsPassed: {} };
    localStorage.setItem(LEARNING_KEY, JSON.stringify(blob));
    const loaded = loadLearning();
    expect(Number.isFinite(loaded.maxUnlockedOrder)).toBe(true);
    expect(loaded.maxUnlockedOrder).toBe(0);
  });

  it('coerces a non-finite or negative maxUnlockedOrder to 0 and preserves a valid one', () => {
    localStorage.setItem(LEARNING_KEY, JSON.stringify({ maxUnlockedOrder: -3 }));
    expect(loadLearning().maxUnlockedOrder).toBe(0);
    localStorage.setItem(LEARNING_KEY, JSON.stringify({ maxUnlockedOrder: 5 }));
    expect(loadLearning().maxUnlockedOrder).toBe(5);
  });

  const track = {
    dataset: 'three-band', phases, skills: [], exercises: [],
    concepts: [
      { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
      { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] },
      { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
    ],
    checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: [], title: 'B' }]
  } as any;

  it('reconcileUnlock raises the mark from strong concepts and passed checkpoints, never lowers it', () => {
    const s = loadLearning();
    strong(s, 'select-all', ['a', 'b', 'c']);   // c1 strong -> order 1 + 1 = 2
    s.checkpointsPassed = ['cpB'];                // cpB afterOrder 2 -> 2 + 1 = 3
    expect(reconcileUnlock(track, s)).toBe(3);
    s.maxUnlockedOrder = 9;                        // already higher
    expect(reconcileUnlock(track, s)).toBe(9);    // never lowers
  });

  it('duplicateSkills flags a skill shared by two concepts', () => {
    expect(duplicateSkills(track)).toEqual([]);
    const dup = { ...track, concepts: [...track.concepts, { id: 'c4', order: 4, skill: 'where', title: 'D', exercises: [] }] } as any;
    expect(duplicateSkills(dup)).toContain('where');
  });
});
