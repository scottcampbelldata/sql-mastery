import { describe, it, expect } from 'vitest';
import { act, render, screen, renderHook } from '@testing-library/react';
import { TeachCard } from './TeachCard.jsx';
import { useSqlCheck } from '../../lib/useSqlCheck.js';
import { editorPlaceholder } from './FoundationsRep.jsx';

const concept = {
  id: 'c1', order: 1, skill: 'select-all', title: 'Ask a table for everything',
  teach: {
    plain: 'A database table is like a spreadsheet.',
    mentalModel: 'SELECT = show me, * = all columns.',
    example: { sql: 'SELECT * FROM genre;', note: 'Returns all 25 genres.' }
  }
};

describe('Foundations teach + scaffolding', () => {
  it('TeachCard renders the concept title, plain explanation, and worked example', () => {
    render(<TeachCard concept={concept} />);
    expect(screen.getByRole('heading', { name: 'Ask a table for everything' })).toBeInTheDocument();
    expect(screen.getByText(/like a spreadsheet/)).toBeInTheDocument();
    expect(screen.getByText('SELECT * FROM genre;')).toBeInTheDocument();
    expect(screen.getByText('Returns all 25 genres.')).toBeInTheDocument();
  });

  it('useSqlCheck seeds the editor value from the exercise starterSql (scaffolding prefill)', () => {
    const exercise = { id: 'c1-r1', skill: 'select-all', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' };
    const { result } = renderHook(() => useSqlCheck(exercise));
    expect(result.current.sql).toBe('SELECT ____ FROM genre;');
  });

  it('useSqlCheck creates scaffold SQL when the exercise has no starter code', () => {
    const exercise = { id: 'c2-r2', skill: 'select-columns', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT name FROM genre;' };
    const { result } = renderHook(() => useSqlCheck(exercise));
    expect(result.current.sql).toBe('SELECT ____ FROM ____;');
  });

  it('useSqlCheck resets the editor when the exercise changes', () => {
    const first = { id: 'c1-r1', skill: 'select-all', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' };
    const second = { id: 'c1-r2', skill: 'select-all', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT * FROM media_type;' };
    const { result, rerender } = renderHook(({ exercise }) => useSqlCheck(exercise), { initialProps: { exercise: first } });

    act(() => result.current.setSql('SELECT * FROM genre;'));
    rerender({ exercise: second });

    expect(result.current.sql).toBe('SELECT ____ FROM ____;');
  });

  it('does not use the model answer as placeholder when there is no starter SQL', () => {
    const exercise = { id: 'c1-r2', starterSql: '', expectedSql: 'SELECT * FROM media_type;' };

    expect(editorPlaceholder(exercise)).not.toBe('SELECT * FROM media_type;');
    expect(editorPlaceholder(exercise)).toMatch(/replace/i);
  });

  it('running an untouched scaffold asks for blanks instead of treating it as empty', async () => {
    const exercise = { id: 'c1-r2', skill: 'select-all', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT * FROM media_type;' };
    const { result } = renderHook(() => useSqlCheck(exercise));

    await act(async () => {
      await result.current.runCheck();
    });

    expect(result.current.feedback.title).toMatch(/fill/i);
    expect(result.current.feedback.title).not.toMatch(/write your query first/i);
  });
});
