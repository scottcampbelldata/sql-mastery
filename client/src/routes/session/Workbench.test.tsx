import { describe, it, expect } from 'vitest';
import { initialWorkbenchSql } from './Workbench';
import type { Exercise } from '../../types';

describe('Workbench SQL starter', () => {
  it('seeds a checkable exercise with scaffold SQL when no saved SQL exists', () => {
    const exercise = {
      id: 'p1',
      starterSql: '',
      expectedSql: 'SELECT order_id FROM orders WHERE total_amount > 100 ORDER BY order_id LIMIT 20;'
    } as Exercise;

    expect(initialWorkbenchSql(exercise, { lastSql: {} }))
      .toBe('SELECT ____\nFROM ____\nWHERE ____\nORDER BY ____\nLIMIT ____;');
  });

  it('keeps the learner saved SQL over a generated scaffold', () => {
    const exercise = {
      id: 'p1',
      starterSql: '',
      expectedSql: 'SELECT order_id FROM orders;'
    } as Exercise;

    expect(initialWorkbenchSql(exercise, { lastSql: { p1: 'SELECT order_id FROM orders;' } }))
      .toBe('SELECT order_id FROM orders;');
  });
});
