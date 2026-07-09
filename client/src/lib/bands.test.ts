import { describe, it, expect } from 'vitest';
import { bandCapstoneId, bandGroups, phaseBand } from './bands';
import type { LearningState, Phase } from '../types';

const beginnerPhase = {
  id: 'ap-join',
  order: 5,
  title: 'Aperture joins',
  goal: '',
  level: 'beginner',
  database: 'aperture',
  concepts: [{ id: 'apc1', order: 1, skill: 'ap-join-intro', title: 'Join intro', exercises: [] }],
  checkpoints: [{ id: 'cpE', afterOrder: 1, title: 'Aperture capstone', drawFromSkills: [] }]
} as Phase;

const intermediatePhase = {
  id: 'sl-joins',
  order: 6,
  title: 'Sideline joins',
  goal: '',
  level: 'intermediate',
  database: 'sideline',
  concepts: [{ id: 'slc1', order: 2, skill: 'sl-join-inner', title: 'Inner join', exercises: [] }],
  checkpoints: [{ id: 'cpI', afterOrder: 2, title: 'Sideline capstone', drawFromSkills: [] }]
} as Phase;

const advancedPhase = {
  id: 'rv-cleaning',
  order: 9,
  title: 'Rove cleaning',
  goal: '',
  level: 'advanced',
  database: 'rove',
  concepts: [],
  checkpoints: []
} as Phase;

function state(checkpointsPassed: string[] = []): LearningState {
  return {
    skillCorrect: {},
    attempts: {},
    lastSql: {},
    lastPracticedSession: {},
    checkpointsPassed,
    sessionCounter: 0,
    reviewsPassed: {},
    maxUnlockedOrder: 0
  };
}

describe('band grouping', () => {
  it('groups phases into the three level/database bands in display order', () => {
    const groups = bandGroups([intermediatePhase, advancedPhase, beginnerPhase], state(['cpE']));

    expect(groups.map((group) => group.meta.level)).toEqual(['beginner', 'intermediate', 'advanced']);
    expect(groups[0].phases.map((phase) => phase.id)).toEqual(['ap-join']);
    expect(groups[1].phases.map((phase) => phase.id)).toEqual(['sl-joins']);
    expect(groups[2].phases.map((phase) => phase.id)).toEqual(['rv-cleaning']);
  });

  it('locks a band until prior band capstones pass', () => {
    expect(bandGroups([beginnerPhase, intermediatePhase], state())[1].locked).toBe(true);
    expect(bandGroups([beginnerPhase, intermediatePhase], state(['cpE']))[1].locked).toBe(false);
  });

  it('resolves phase bands and capstone ids', () => {
    expect(phaseBand(beginnerPhase)).toBe('beginner');
    expect(phaseBand({ ...beginnerPhase, level: undefined as any, database: 'rove' })).toBe('advanced');
    expect(bandCapstoneId([beginnerPhase])).toBe('cpE');
  });
});
