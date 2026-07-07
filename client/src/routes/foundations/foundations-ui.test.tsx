import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { act, render, screen, renderHook } from '@testing-library/react';
import { TeachCard } from './TeachCard';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { editorPlaceholder } from './FoundationsRep';
import type { Concept, Exercise } from '../../types';
import * as apiModule from '../../lib/api';

const concept = {
  id: 'c1', order: 1, skill: 'select-all', title: 'Ask a table for everything',
  teach: {
    plain: 'A database table is like a spreadsheet.',
    mentalModel: 'SELECT = show me, * = all columns.',
    example: { sql: 'SELECT * FROM genre;', note: 'Returns all 25 genres.' }
  }
} as Concept;

describe('Foundations teach + scaffolding', () => {
  it('TeachCard renders the concept title, plain explanation, and worked example', () => {
    render(<TeachCard concept={concept} />);
    expect(screen.getByRole('heading', { name: 'Ask a table for everything' })).toBeInTheDocument();
    expect(screen.getByText(/like a spreadsheet/)).toBeInTheDocument();
    expect(screen.getByText('SELECT * FROM genre;')).toBeInTheDocument();
    expect(screen.getByText('Returns all 25 genres.')).toBeInTheDocument();
  });

  it('useSqlCheck seeds the editor value from the exercise starterSql (scaffolding prefill)', () => {
    const exercise = { id: 'c1-r1', skill: 'select-all', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' } as Exercise;
    const { result } = renderHook(() => useSqlCheck(exercise));
    expect(result.current.sql).toBe('SELECT ____\nFROM genre;');
  });

  it('useSqlCheck creates scaffold SQL when the exercise has no starter code', () => {
    const exercise = { id: 'c2-r2', skill: 'select-columns', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT name FROM genre;' } as Exercise;
    const { result } = renderHook(() => useSqlCheck(exercise));
    expect(result.current.sql).toBe('SELECT ____\nFROM ____;');
  });

  it('useSqlCheck resets the editor when the exercise changes', () => {
    const first = { id: 'c1-r1', skill: 'select-all', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' } as Exercise;
    const second = { id: 'c1-r2', skill: 'select-all', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT * FROM media_type;' } as Exercise;
    const { result, rerender } = renderHook(({ exercise }) => useSqlCheck(exercise), { initialProps: { exercise: first } });

    act(() => result.current.setSql('SELECT * FROM genre;'));
    rerender({ exercise: second });

    expect(result.current.sql).toBe('SELECT ____\nFROM ____;');
  });

  it('does not use the model answer as placeholder when there is no starter SQL', () => {
    const exercise = { id: 'c1-r2', starterSql: '', expectedSql: 'SELECT * FROM media_type;' } as Exercise;

    expect(editorPlaceholder(exercise)).not.toBe('SELECT * FROM media_type;');
    expect(editorPlaceholder(exercise)).toMatch(/replace/i);
  });

  it('running an untouched scaffold asks for blanks instead of treating it as empty', async () => {
    const exercise = { id: 'c1-r2', skill: 'select-all', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT * FROM media_type;' } as Exercise;
    const { result } = renderHook(() => useSqlCheck(exercise));

    await act(async () => {
      await result.current.runCheck();
    });

    expect(result.current.feedback!.title).toMatch(/fill/i);
    expect(result.current.feedback!.title).not.toMatch(/write your query first/i);
  });

  it('carries the server diff into feedback on a mismatch', async () => {
    const ex = { id: 'd1', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT 1' };
    vi.spyOn(apiModule.api, 'check').mockResolvedValue({
      correct: false, feedbackType: 'mismatch', hint: 'h',
      diff: { reason: 'row-count', yourRowCount: 3, expectedRowCount: 2, orderOnly: false, extraRows: 1, missingRows: 0 }
    });
    const { result } = renderHook(() => useSqlCheck(ex as Exercise));
    act(() => result.current.setSql('SELECT 1'));
    await act(async () => { await result.current.runCheck(); });
    expect(result.current.feedback!.diff!.reason).toBe('row-count');
    expect(result.current.feedback!.diff!.extraRows).toBe(1);
  });

  it('seeds the editor from the seed option (blank for a cold review)', () => {
    const ex = { id: 'c1-r1', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' };
    const { result } = renderHook(() => useSqlCheck(ex, { seed: '' }));
    expect(result.current.sql).toBe('');
  });
});
