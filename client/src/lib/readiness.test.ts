import { describe, it, expect } from 'vitest';
import { conceptReadiness, bandReadiness, readinessReport } from './readiness';
import type { Concept, Phase, LearningState } from '../types';

// Concepts with no exercises have a mastery target of STRONG_THRESHOLD (3).
function concept(skill: string): Concept {
  return { id: skill + '-c', order: 1, skill, title: skill, exercises: [] };
}
function emptyState(): LearningState {
  return {
    skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {},
    checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0
  };
}
function phase(id: string, level: 'beginner' | 'intermediate' | 'advanced', database: string, skills: string[]): Phase {
  return {
    id, order: 1, title: id, level, database,
    concepts: skills.map((s, i) => ({ ...concept(s), order: i + 1, phaseId: id, level, database })),
    checkpoints: []
  };
}

describe('conceptReadiness', () => {
  it('mastered when strong (target correct answers reached)', () => {
    const s = emptyState();
    s.skillCorrect = { 'ap-select-all': ['a', 'b', 'c'] };
    expect(conceptReadiness(s, concept('ap-select-all')).status).toBe('mastered');
  });
  it('practicing when started but not yet strong', () => {
    const s = emptyState();
    s.skillCorrect = { 'ap-order-by': ['a'] };
    expect(conceptReadiness(s, concept('ap-order-by')).status).toBe('practicing');
  });
  it('not-started when no correct answers', () => {
    expect(conceptReadiness(emptyState(), concept('ap-distinct')).status).toBe('not-started');
  });
});

describe('bandReadiness and readinessReport', () => {
  const phases: Phase[] = [
    phase('beg', 'beginner', 'aperture', ['ap-a', 'ap-b', 'ap-c']),
    phase('int', 'intermediate', 'sideline', ['sl-a'])
  ];
  const state = (() => {
    const s = emptyState();
    s.skillCorrect = { 'ap-a': ['1', '2', '3'], 'ap-b': ['1'] }; // ap-a mastered, ap-b practicing, ap-c not started
    return s;
  })();

  it('counts mastered / practicing / total per band', () => {
    const b = bandReadiness(phases, state, 'beginner');
    expect(b.total).toBe(3);
    expect(b.mastered).toBe(1);
    expect(b.practicing).toBe(1);
    expect(b.pct).toBe(33);
  });

  it('rolls up an overall report across all three bands', () => {
    const r = readinessReport(phases, state);
    expect(r.bands.map((x) => x.level)).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(r.total).toBe(4);
    expect(r.mastered).toBe(1);
    expect(r.bands[1].total).toBe(1); // intermediate
    expect(r.bands[2].total).toBe(0); // advanced (none in this fixture)
  });
});
