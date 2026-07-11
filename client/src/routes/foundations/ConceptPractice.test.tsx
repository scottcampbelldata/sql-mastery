import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('../../components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('./FoundationsRep', () => ({
  FoundationsRep: (props: { kind: string; tier: string; stepText: string }) =>
    <div data-testid="rep" data-kind={props.kind} data-tier={props.tier}>{props.stepText}</div>
}));

vi.mock('../../state/FoundationsContext', () => ({
  useFoundations: () => ({
    track: {
      concepts: [{
        id: 'c1',
        order: 1,
        skill: 'a',
        title: 'A',
        exercises: [
          { id: 'c1-r1' },
          { id: 'c1-r2' },
          { id: 'c1-r3' },
          { id: 'c1-r4' },
          { id: 'c1-r5' }
        ]
      }],
      checkpoints: [], skills: [], phases: [], exercises: []
    },
    phases: [],
    state: { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 },
    update: () => {}
  })
}));

import ConceptPractice from './ConceptPractice';

describe('ConceptPractice route guard', () => {
  it('redirects an unknown or locked concept id back to /learn', () => {
    render(
      <MemoryRouter initialEntries={['/learn/concept/nope']}>
        <Routes>
          <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
          <Route path="/learn" element={<div>foundations home</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('foundations home')).toBeInTheDocument();
  });

  it('drives focused practice at full scaffold when the skill has no band context', () => {
    render(
      <MemoryRouter initialEntries={['/learn/concept/c1']}>
        <Routes>
          <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
        </Routes>
      </MemoryRouter>
    );
    const rep = screen.getByTestId('rep');
    expect(rep.getAttribute('data-kind')).toBe('new');   // never 'review'
    expect(rep.getAttribute('data-tier')).toBe('full');  // no band ctx -> full scaffold, today's behavior
    expect(rep).toHaveTextContent('Step 1 of 5');
    expect(screen.getByRole('button', { name: /next exercise/i })).toBeDisabled();
  });
});
