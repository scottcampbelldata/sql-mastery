import { describe, it, expect, beforeEach } from 'vitest';
import { LEARNING_KEY, loadLearning, saveLearning, currentPhase, phaseGraduation } from './learning-path.js';
import { recordCorrect, recordCheckpointResult } from './foundations.js';

const phases = [
  { id: 'foundations', order: 1, title: 'F', goal: '', concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
    { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] }
  ], checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: ['select-all', 'where'], title: 'B' }] },
  { id: 'joins', order: 2, title: 'J', goal: '', concepts: [
    { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
  ], checkpoints: [{ id: 'cpD', afterOrder: 3, drawFromSkills: ['inner-join'], title: 'D' }] }
];

function strong(state, skill, ids) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

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
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)).sessionCounter).toBe(4); // migrated + persisted
  });

  it('currentPhase is the first phase with a not-strong concept', () => {
    const s = loadLearning();
    expect(currentPhase(phases, s).id).toBe('foundations');
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    expect(currentPhase(phases, s).id).toBe('joins'); // foundations skills all strong
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
