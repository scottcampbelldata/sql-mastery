import { describe, it, expect } from 'vitest';
import { summarizeLog, type LogEvent } from './learningLog';

const ev = (e: Partial<LogEvent>): LogEvent => ({ t: 0, type: 'attempt', exerciseId: 'x', ...e } as LogEvent);

describe('summarizeLog', () => {
  it('aggregates attempts, wrongs, misconceptions and durations per skill, worst first', () => {
    const events: LogEvent[] = [
      ev({ type: 'start', skill: 'ap-null-handling' }),
      ev({ type: 'attempt', skill: 'ap-null-handling', outcome: 'incorrect', misconception: 'Comparing to NULL' }),
      ev({ type: 'attempt', skill: 'ap-null-handling', outcome: 'incorrect', misconception: 'Comparing to NULL' }),
      ev({ type: 'attempt', skill: 'ap-null-handling', outcome: 'correct' }),
      ev({ type: 'complete', skill: 'ap-null-handling', durationMs: 120000, attempts: 3 }),
      ev({ type: 'attempt', skill: 'ap-select-all', outcome: 'correct' }),
      ev({ type: 'complete', skill: 'ap-select-all', durationMs: 20000, attempts: 1 })
    ];
    const s = summarizeLog(events);
    expect(s.exercisesCompleted).toBe(2);
    expect(s.totalAttempts).toBe(4);
    const nullRow = s.bySkill.find((r) => r.skill === 'ap-null-handling')!;
    expect(nullRow.wrong).toBe(2);
    expect(nullRow.title).toBe('null handling');
    expect(nullRow.misconceptions['Comparing to NULL']).toBe(2);
    expect(nullRow.avgDurationMs).toBe(120000);
    expect(s.bySkill[0].skill).toBe('ap-null-handling'); // struggled most
    expect(s.topMisconceptions[0]).toEqual({ label: 'Comparing to NULL', count: 2 });
    expect(s.text).toContain('null handling');
  });

  it('handles an empty log', () => {
    const s = summarizeLog([]);
    expect(s.exercisesCompleted).toBe(0);
    expect(s.bySkill).toEqual([]);
    expect(s.text).toContain('No struggles');
  });
});
