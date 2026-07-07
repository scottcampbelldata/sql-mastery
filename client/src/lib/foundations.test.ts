import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFoundations, saveFoundations, FOUNDATIONS_KEY,
  skillLevel, isSkillStrong, recordCorrect, recordAttempt,
  dueReviews, nextConcept, checkpointDue, buildTodaySession,
  recordCheckpointResult, advanceSession, graduationStatus,
  STRONG_THRESHOLD, SPACING_GAP, skillMastery, weakSpots
} from './foundations';
import type { Track, LearningState } from '../types';

// Minimal track fixture mirroring src/foundations.js shape.
const track = {
  dataset: 'chinook',
  skills: [
    { skill: 'select-all', conceptId: 'c1', title: 'A', order: 1 },
    { skill: 'select-columns', conceptId: 'c2', title: 'B', order: 2 },
    { skill: 'order-limit', conceptId: 'c3', title: 'C', order: 3 },
    { skill: 'distinct', conceptId: 'c4', title: 'D', order: 4 },
    { skill: 'where', conceptId: 'c5', title: 'E', order: 5 }
  ],
  concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [{ id: 'c1-r1', skill: 'select-all' }, { id: 'c1-r2', skill: 'select-all' }, { id: 'c1-r3', skill: 'select-all' }] },
    { id: 'c2', order: 2, skill: 'select-columns', title: 'B', exercises: [{ id: 'c2-r1', skill: 'select-columns' }, { id: 'c2-r2', skill: 'select-columns' }, { id: 'c2-r3', skill: 'select-columns' }] },
    { id: 'c3', order: 3, skill: 'order-limit', title: 'C', exercises: [{ id: 'c3-r1', skill: 'order-limit' }, { id: 'c3-r2', skill: 'order-limit' }, { id: 'c3-r3', skill: 'order-limit' }] },
    { id: 'c4', order: 4, skill: 'distinct', title: 'D', exercises: [{ id: 'c4-r1', skill: 'distinct' }, { id: 'c4-r2', skill: 'distinct' }, { id: 'c4-r3', skill: 'distinct' }] },
    { id: 'c5', order: 5, skill: 'where', title: 'E', exercises: [{ id: 'c5-r1', skill: 'where' }, { id: 'c5-r2', skill: 'where' }] }
  ],
  checkpoints: [
    { id: 'cpA', afterOrder: 4, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct'], title: 'A' },
    { id: 'cpB', afterOrder: 5, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct', 'where'], title: 'B' }
  ]
} as Track;

function strong(state: LearningState, skill: string, ids: string[]) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

describe('foundations engine', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default and round-trips under its own key', () => {
    const s = loadFoundations();
    expect(s).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 });
    s.attempts['x'] = 2; saveFoundations(s);
    expect(JSON.parse(localStorage.getItem(FOUNDATIONS_KEY)!).attempts.x).toBe(2);
  });

  it('skillLevel counts distinct correct exercises and tiers at STRONG_THRESHOLD', () => {
    const s = loadFoundations();
    expect(skillLevel(s, 'where')).toEqual({ count: 0, tier: 'new' });
    recordCorrect(s, { id: 'c5-r1', skill: 'where' });
    recordCorrect(s, { id: 'c5-r1', skill: 'where' }); // duplicate does not double-count
    expect(skillLevel(s, 'where').count).toBe(1);
    expect(skillLevel(s, 'where').tier).toBe('learning');
    recordCorrect(s, { id: 'c5-r2', skill: 'where' });
    recordCorrect(s, { id: 'c5-r3', skill: 'where' });
    expect(skillLevel(s, 'where').count).toBe(3);
    expect(isSkillStrong(s, 'where')).toBe(true);
    expect(STRONG_THRESHOLD).toBe(3);
  });

  it('nextConcept returns the first not-strong concept, gated by the prior checkpoint', () => {
    const s = loadFoundations();
    expect(nextConcept(track, s)!.id).toBe('c1');
    strong(s, 'select-all', ['c1-r1', 'c1-r2', 'c1-r3']);
    expect(nextConcept(track, s)!.id).toBe('c2');
    // make 1..4 strong; concept 5 is gated behind checkpoint cpA
    strong(s, 'select-columns', ['c2-r1', 'c2-r2', 'c2-r3']);
    strong(s, 'order-limit', ['c3-r1', 'c3-r2', 'c3-r3']);
    strong(s, 'distinct', ['c4-r1', 'c4-r2', 'c4-r3']);
    expect(nextConcept(track, s)).toBe(null); // c5 blocked until cpA passes
    expect(checkpointDue(track, s)!.id).toBe('cpA');
    recordCheckpointResult(s, track.checkpoints[0], 6);
    expect(nextConcept(track, s)!.id).toBe('c5');
  });

  it('dueReviews resurfaces learned skills after SPACING_GAP sessions, capped and preferring unseen exercises', () => {
    const s = loadFoundations();
    recordCorrect(s, { id: 'c1-r1', skill: 'select-all' }); // learned this session (counter 0)
    expect(dueReviews(track, s)).toEqual([]); // not due yet
    advanceSession(s); advanceSession(s); // counter 2, gap satisfied
    expect(SPACING_GAP).toBe(2);
    const due = dueReviews(track, s);
    expect(due.length).toBe(1);
    expect(due[0].skill).toBe('select-all');
    expect(['c1-r2', 'c1-r3']).toContain(due[0].exercise.id); // prefers an unanswered rep
  });

  it('buildTodaySession puts reviews before the new concept', () => {
    const s = loadFoundations();
    recordCorrect(s, { id: 'c1-r1', skill: 'select-all' });
    advanceSession(s); advanceSession(s);
    const session = buildTodaySession(track, s);
    expect(session.reviews.length).toBe(1);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c1'); // c1 not strong (1 correct) -> still the first not-strong concept
  });

  it('graduationStatus flips only when all skills strong and both checkpoints passed', () => {
    const s = loadFoundations();
    track.skills.forEach((sk) => strong(s, sk.skill, [`${sk.conceptId}-r1`, `${sk.conceptId}-r2`, `${sk.conceptId}-r3`]));
    let g = graduationStatus(track, s);
    expect(g.graduated).toBe(false); // checkpoints not passed
    recordCheckpointResult(s, track.checkpoints[0], 6);
    recordCheckpointResult(s, track.checkpoints[1], 6);
    g = graduationStatus(track, s);
    expect(g.graduated).toBe(true);
    expect(g.strongSkills).toBe(track.skills.length);
  });

  it('recordCheckpointResult passes at CHECKPOINT_PASS and forces missed skills due on fail', () => {
    const s = loadFoundations();
    recordCheckpointResult(s, track.checkpoints[0], 5);
    expect(s.checkpointsPassed).toContain('cpA');
    const s2 = loadFoundations();
    recordCheckpointResult(s2, track.checkpoints[0], 3, ['distinct']);
    expect(s2.checkpointsPassed).not.toContain('cpA');
  });

  it('skillMastery reaches 100 at the strong threshold and decays with time', () => {
    const s = loadFoundations();
    s.skillCorrect = { where: ['a', 'b', 'c'] };            // count 3 = strong
    s.lastPracticedSession = { where: 0 };
    s.sessionCounter = 0;
    expect(skillMastery(s, 'where').pct).toBe(100);         // fresh
    s.sessionCounter = 8;                                    // long unpracticed
    expect(skillMastery(s, 'where').pct).toBeLessThan(100);  // rusty
    expect(skillMastery(s, 'never-touched').pct).toBe(0);
  });

  it('weakSpots lists the lowest-mastery learned skills first', () => {
    const track = { skills: [], checkpoints: [], concepts: [
      { id: 'c1', order: 1, skill: 'where', title: 'Where', exercises: [] },
      { id: 'c2', order: 2, skill: 'group', title: 'Group', exercises: [] }
    ] } as any;
    const s = loadFoundations();
    s.skillCorrect = { where: ['a', 'b', 'c'], group: ['x'] };  // where strong, group weak
    s.lastPracticedSession = { where: 0, group: 0 };
    const weak = weakSpots(track, s, 2);
    expect(weak[0].skill).toBe('group');
  });

  it('dueReviews returns the weakest due skill first', () => {
    const track = { checkpoints: [], skills: [{ skill: 'where' }, { skill: 'group' }], concepts: [
      { id: 'c1', order: 1, skill: 'where', title: 'Where', exercises: [{ id: 'w1', skill: 'where' }, { id: 'w2', skill: 'where' }] },
      { id: 'c2', order: 2, skill: 'group', title: 'Group', exercises: [{ id: 'g1', skill: 'group' }, { id: 'g2', skill: 'group' }] }
    ] } as any;
    const s = loadFoundations();
    s.skillCorrect = { where: ['w1', 'w2', 'w3'], group: ['g1'] };  // where count 3, group count 1
    s.lastPracticedSession = { where: 0, group: 0 };
    s.sessionCounter = 3;                                            // both due (gap satisfied)
    const due = dueReviews(track, s);
    expect(due[0].skill).toBe('group');
  });
});
