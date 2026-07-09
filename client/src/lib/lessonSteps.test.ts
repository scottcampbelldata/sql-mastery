import { describe, expect, it } from 'vitest';
import { buildLessonSteps, MAX_LESSON_STEPS, MIN_LESSON_STEPS } from './lessonSteps';
import type { Concept } from '../types';

describe('lesson step builder', () => {
  it('turns a one-query concept into a five-step fading drill', () => {
    const concept = {
      id: 'c1',
      order: 1,
      skill: 'ap-select-all',
      title: 'Select every column',
      exercises: [{ id: 'ap-select-all-1', skill: 'ap-select-all', expectedSql: 'SELECT * FROM stars' }]
    } as Concept;

    const steps = buildLessonSteps(concept);
    expect(steps).toHaveLength(MIN_LESSON_STEPS);
    expect(steps.map((step) => step.tier)).toEqual(['full', 'full', 'half', 'half', 'blank']);
    expect(new Set(steps.map((step) => step.id)).size).toBe(MIN_LESSON_STEPS);
    expect(steps.every((step) => step.exercise.expectedSql === 'SELECT * FROM stars')).toBe(true);
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
});
