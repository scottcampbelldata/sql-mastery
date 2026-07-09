import { describe, expect, it } from 'vitest';
import { buildLessonSteps, MAX_LESSON_STEPS } from './lessonSteps';
import type { Concept } from '../types';

describe('lesson step builder', () => {
  it('keeps a one-query concept as one lesson step', () => {
    const concept = {
      id: 'c1',
      order: 1,
      skill: 'ap-select-all',
      title: 'Select every column',
      exercises: [{ id: 'ap-select-all-1', skill: 'ap-select-all', expectedSql: 'SELECT * FROM stars' }]
    } as Concept;

    const steps = buildLessonSteps(concept);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({
      id: 'ap-select-all-1',
      tier: 'full',
      exercise: { id: 'ap-select-all-1', expectedSql: 'SELECT * FROM stars' }
    });
  });

  it('keeps a larger generated set bounded for a single lesson', () => {
    const concept = {
      id: 'c2',
      order: 2,
      skill: 'ap-order-by',
      title: 'Order rows',
      exercises: Array.from({ length: 12 }, (_, index) => ({ id: `ex-${index + 1}`, skill: 'ap-order-by' }))
    } as Concept;

    const steps = buildLessonSteps(concept);
    expect(steps).toHaveLength(MAX_LESSON_STEPS);
    expect(steps.map((step) => step.id)).toEqual(['ex-1', 'ex-2', 'ex-3', 'ex-4', 'ex-5', 'ex-6', 'ex-7', 'ex-8']);
  });

  it('returns only distinct SQL exercises without cloning repeats', () => {
    const concept = {
      id: 'c3',
      order: 3,
      skill: 'ap-where',
      title: 'Filter rows',
      exercises: [
        { id: 'ex-1', skill: 'ap-where', expectedSql: 'SELECT * FROM stars WHERE color = "blue"' },
        { id: 'ex-2', skill: 'ap-where', expectedSql: 'SELECT * FROM stars WHERE color = "blue"' },
        { id: 'ex-3', skill: 'ap-where', expectedSql: 'SELECT * FROM stars WHERE color = "red"' }
      ]
    } as Concept;

    const steps = buildLessonSteps(concept);

    expect(steps).toHaveLength(2);
    expect(steps.map((step) => step.id)).toEqual(['ex-1', 'ex-3']);
    expect(new Set(steps.map((step) => step.exercise.expectedSql)).size).toBe(2);
    expect(steps.every((step) => !step.id.includes('__lesson_'))).toBe(true);
  });
});
