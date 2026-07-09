import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

const update = vi.fn();

function baseState() {
  return {
    skillCorrect: {},
    attempts: {},
    lastSql: {},
    lastPracticedSession: {},
    checkpointsPassed: [],
    sessionCounter: 0,
    reviewsPassed: {},
    maxUnlockedOrder: 0
  };
}

vi.mock('../../components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('./FoundationsRep', () => ({
  FoundationsRep: (props: { exercise: { id: string }; onCorrect?: () => void }) => (
    <div>
      <span>Exercise {props.exercise.id}</span>
      <button type="button" onClick={() => props.onCorrect?.()}>mark checked correct</button>
    </div>
  )
}));

vi.mock('../../state/FoundationsContext', () => ({
  useFoundations: () => ({
    track: {
      concepts: [],
      checkpoints: [{ id: 'cp1', title: 'Checkpoint 1', drawFromSkills: ['a'], afterOrder: 1 }],
      skills: [],
      phases: [],
      exercises: Array.from({ length: 6 }, (_, index) => ({
        id: `q${index + 1}`,
        skill: 'a',
        database: 'aperture',
        task: `Question ${index + 1}`,
        starterSql: 'SELECT 1'
      }))
    },
    phases: [],
    state: baseState(),
    update
  })
}));

import Checkpoint from './Checkpoint';

describe('Checkpoint verification gating', () => {
  beforeEach(() => {
    update.mockClear();
  });

  it('requires a successful check for the current exercise before marking it solved', () => {
    render(
      <MemoryRouter initialEntries={['/learn/checkpoint/cp1']}>
        <Routes>
          <Route path="/learn/checkpoint/:id" element={<Checkpoint />} />
        </Routes>
      </MemoryRouter>
    );

    const solved = screen.getByRole('button', { name: /i solved it/i });
    expect(solved).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /mark checked correct/i }));
    expect(solved).toBeEnabled();

    fireEvent.click(solved);
    expect(screen.getByRole('button', { name: /i solved it/i })).toBeDisabled();
  });

  it('does not double-count attempts when the solved button records a checked-correct answer', () => {
    render(
      <MemoryRouter initialEntries={['/learn/checkpoint/cp1']}>
        <Routes>
          <Route path="/learn/checkpoint/:id" element={<Checkpoint />} />
        </Routes>
      </MemoryRouter>
    );
    const currentExerciseId = screen.getByText(/Exercise q\d+/).textContent!.replace('Exercise ', '');

    fireEvent.click(screen.getByRole('button', { name: /mark checked correct/i }));
    fireEvent.click(screen.getByRole('button', { name: /i solved it/i }));

    expect(update).toHaveBeenCalledTimes(1);
    const state = baseState();
    update.mock.calls[0][0](state);
    expect(state.attempts[currentExerciseId]).toBeUndefined();
    expect(state.skillCorrect.a).toEqual([currentExerciseId]);
  });
});
