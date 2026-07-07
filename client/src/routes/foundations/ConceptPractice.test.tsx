import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('../../components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('./FoundationsRep', () => ({
  FoundationsRep: (props: { kind: string; tier: string }) => <div data-testid="rep" data-kind={props.kind} data-tier={props.tier} />
}));

vi.mock('../../state/FoundationsContext', () => ({
  useFoundations: () => ({
    track: {
      concepts: [{ id: 'c1', order: 1, skill: 'a', title: 'A', exercises: [{ id: 'c1-r1' }] }],
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

  it('drives focused practice at full scaffold with the new-lesson kind (no fade, no clock tick)', () => {
    render(
      <MemoryRouter initialEntries={['/learn/concept/c1']}>
        <Routes>
          <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
        </Routes>
      </MemoryRouter>
    );
    const rep = screen.getByTestId('rep');
    expect(rep.getAttribute('data-kind')).toBe('new');   // never 'review', so the scaffold never fades
    expect(rep.getAttribute('data-tier')).toBe('full');  // focused practice always shows the full scaffold
  });
});
