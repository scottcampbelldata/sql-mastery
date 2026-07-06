import { describe, it, expect, beforeEach } from 'vitest';
import { LEARNING_KEY, loadLearning, saveLearning, currentPhase, phaseGraduation } from './learning-path';
import { recordCorrect, recordCheckpointResult } from './foundations';
import type { Phase, LearningState } from '../types';

const phases = [
  { id: 'foundations', order: 1, title: 'F', goal: '', concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
    { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] }
  ], checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: ['select-all', 'where'], title: 'B' }] },
  { id: 'joins', order: 2, title: 'J', goal: '', concepts: [
    { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
  ], checkpoints: [{ id: 'cpD', afterOrder: 3, drawFromSkills: ['inner-join'], title: 'D' }] }
] as Phase[];

function strong(state: LearningState, skill: string, ids: string[]) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

describe('learning-path client helpers', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default under its own key', () => {
    expect(loadLearning()).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 });
  });

  it('migrates an existing sqlm:foundations:v1 into sqlm:learning:v1 once', () => {
    const legacy = { skillCorrect: { 'select-all': ['c1-r1'] }, attempts: {}, lastSql: {}, lastPracticedSession: { 'select-all': 0 }, checkpointsPassed: ['cpA'], sessionCounter: 4 };
    localStorage.setItem('sqlm:foundations:v1', JSON.stringify(legacy));
    const loaded = loadLearning();
    expect(loaded.skillCorrect['select-all']).toEqual(['c1-r1']);
    expect(loaded.checkpointsPassed).toContain('cpA');
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)!).sessionCounter).toBe(4); // migrated + persisted
  });

  it('currentPhase stays on a phase until its concepts are strong AND its checkpoints pass', () => {
    const s = loadLearning();
    expect(currentPhase(phases, s).id).toBe('foundations');
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    // Concepts all strong, but cpB is not yet passed → foundations is not left, joins stays locked.
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
});
