import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { bandGroups } from '../../lib/bands';
import { BandSection } from './BandSection';
import type { LearningState, Phase, Track } from '../../types';

const beginnerPhase = {
  id: 'ap-join',
  order: 5,
  title: 'Aperture joins',
  goal: 'Combine two tables.',
  level: 'beginner',
  database: 'aperture',
  concepts: [{ id: 'apc1', order: 1, skill: 'ap-join-intro', title: 'Join intro', exercises: [] }],
  checkpoints: [{ id: 'cpE', afterOrder: 1, title: 'Aperture capstone', drawFromSkills: [] }]
} as Phase;

const intermediatePhase = {
  id: 'sl-joins',
  order: 6,
  title: 'Sideline joins',
  goal: 'Inner and outer joins.',
  level: 'intermediate',
  database: 'sideline',
  concepts: [{ id: 'slc1', order: 2, skill: 'sl-join-inner', title: 'Inner join', exercises: [] }],
  checkpoints: []
} as Phase;

const phases = [beginnerPhase, intermediatePhase];
const track = {
  dataset: 'three-band',
  phases,
  skills: [],
  concepts: [...beginnerPhase.concepts, ...intermediatePhase.concepts],
  checkpoints: [...beginnerPhase.checkpoints],
  exercises: []
} as Track;

function makeState(checkpointsPassed: string[]): LearningState {
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

function renderIntermediate(state: LearningState) {
  const group = bandGroups(phases, state).find((candidate) => candidate.meta.level === 'intermediate')!;
  render(
    <MemoryRouter>
      <BandSection group={group} track={track} state={state} onReset={() => {}} />
    </MemoryRouter>
  );
  return group;
}

describe('BandSection band gating', () => {
  it('locks intermediate until the beginner capstone passes', () => {
    const group = renderIntermediate(makeState([]));
    expect(group.locked).toBe(true);
    expect(screen.getByText(/unlock Intermediate/i)).toBeInTheDocument();
    expect(screen.queryByText('Inner join')).toBeNull();
  });

  it('unlocks intermediate after the beginner capstone passes', () => {
    const group = renderIntermediate(makeState(['cpE']));
    expect(group.locked).toBe(false);
    expect(screen.getByText('Inner join')).toBeInTheDocument();
    expect(screen.queryByText(/unlock Intermediate/i)).toBeNull();
  });
});
