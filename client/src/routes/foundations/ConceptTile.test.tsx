import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConceptTile } from './ConceptTile';
import type { Concept } from '../../types';

const concept = { id: 'c1', order: 1, skill: 'select-all', title: 'SELECT basics', exercises: [] } as Concept;

function renderTile(props: Partial<React.ComponentProps<typeof ConceptTile>> = {}) {
  const onReset = vi.fn();
  render(
    <MemoryRouter>
      <ConceptTile concept={concept} state="now" count={0} target={5} masteryPct={0} onReset={onReset} {...props} />
    </MemoryRouter>
  );
  return { onReset };
}

describe('ConceptTile', () => {
  it('a now tile is a link labeled Start here with no reset control', () => {
    renderTile({ state: 'now', count: 0 });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/learn/concept/c1');
    expect(link).toHaveAccessibleName(/start here/i);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('a done tile is clickable and offers a reset that confirms before firing', () => {
    const { onReset } = renderTile({ state: 'done', count: 5, target: 5 });
    expect(screen.getByRole('link')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reset lesson/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalledWith('select-all');
  });

  it('an upcoming tile is not a link and shows a label', () => {
    renderTile({ state: 'upcoming', count: 0 });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/upcoming/i)).toBeInTheDocument();
  });

  it('a locked tile is not a link and shows a locked label', () => {
    renderTile({ state: 'locked', count: 0 });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });

  it('an unlocked (reset, in-progress) tile is a clickable link that still offers a reset', () => {
    const { onReset } = renderTile({ state: 'unlocked', count: 1 });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/learn/concept/c1');
    expect(link).toHaveAccessibleName(/practice/i);
    fireEvent.click(screen.getByRole('button', { name: /reset lesson/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalledWith('select-all');
  });
});
