import { describe, it, expect } from 'vitest';
import { GAUNTLETS, drawGauntletQuestions, gauntletRecord, gauntletPassed, recordGauntletRun, gauntletById } from './gauntlet';
import { deepMerge } from './sync';
import type { Track, Exercise, LearningState, Phase } from '../types';

function ex(id: string, skill: string): Exercise {
  return { id, skill, database: 'aperture', task: 't', starterSql: { full: '', half: '', blank: '' }, hint: '' } as unknown as Exercise;
}

function trackWith(skills: string[], perSkill = 3): Track {
  const concepts = skills.map((skill, i) => ({ id: `c-${skill}`, order: i + 1, skill, title: skill, exercises: [] }));
  const phase = {
    id: 'p1', order: 1, title: 'P', level: 'beginner', database: 'aperture',
    concepts, checkpoints: []
  } as unknown as Phase;
  const exercises = skills.flatMap((skill) => Array.from({ length: perSkill }, (_, n) => ex(`${skill}-${n}`, skill)));
  return { phases: [phase], skills: [], concepts, checkpoints: [], exercises } as unknown as Track;
}

function state(): LearningState {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 };
}

describe('gauntlet configs', () => {
  it('covers the three bands with sane pass bars', () => {
    expect(GAUNTLETS.map((g) => g.level)).toEqual(['beginner', 'intermediate', 'advanced']);
    for (const g of GAUNTLETS) {
      expect(g.pass).toBeLessThanOrEqual(g.questions);
      expect(g.minutes).toBeGreaterThan(0);
      expect(gauntletById(g.id)).toBe(g);
    }
  });
});

describe('question draw', () => {
  const config = GAUNTLETS[0];

  it('draws one exercise per distinct skill, deterministically per seed', () => {
    const track = trackWith(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']);
    const a = drawGauntletQuestions(track, config, 1);
    const b = drawGauntletQuestions(track, config, 1);
    const c = drawGauntletQuestions(track, config, 2);
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a).toHaveLength(config.questions);
    expect(new Set(a.map((q) => q.skill)).size).toBe(config.questions);
    expect(c.map((q) => q.id)).not.toEqual(a.map((q) => q.id));
  });

  it('falls back gracefully when the band has fewer skills than questions', () => {
    const track = trackWith(['only-a', 'only-b']);
    const drawn = drawGauntletQuestions(track, config, 1);
    expect(drawn).toHaveLength(2);
  });
});

describe('gauntlet records', () => {
  const config = GAUNTLETS[0];

  it('records runs, keeps the best score, and derives the verdict', () => {
    const s = state();
    expect(gauntletPassed(gauntletRecord(s, config.id), config)).toBe(false);

    recordGauntletRun(s, config.id, { score: 3, total: 6, seconds: 700, at: 1 });
    recordGauntletRun(s, config.id, { score: 5, total: 6, seconds: 640, at: 2 });
    recordGauntletRun(s, config.id, { score: 4, total: 6, seconds: 610, at: 3 });

    const record = gauntletRecord(s, config.id);
    expect(record.attempts).toBe(3);
    expect(record.bestScore).toBe(5);
    expect(record.history).toHaveLength(3);
    expect(gauntletPassed(record, config)).toBe(true);
  });

  it('survives the cross-device deep merge without losing a pass', () => {
    const local = state();
    recordGauntletRun(local, config.id, { score: 5, total: 6, seconds: 640, at: 2 });
    const remote = state();
    recordGauntletRun(remote, config.id, { score: 3, total: 6, seconds: 900, at: 1 });

    // Both directions: numbers take max, histories union, so the pass survives.
    for (const merged of [deepMerge(local, remote), deepMerge(remote, local)]) {
      const record = gauntletRecord(merged as LearningState, config.id);
      expect(record.bestScore).toBe(5);
      expect(gauntletPassed(record, config)).toBe(true);
      expect(record.history.length).toBe(2);
    }
  });
});
