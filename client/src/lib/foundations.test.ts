import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFoundations, saveFoundations, FOUNDATIONS_KEY,
  skillLevel, isSkillStrong, recordCorrect, recordAttempt,
  dueReviews, nextConcept, checkpointDue, buildTodaySession,
  recordCheckpointResult, advanceSession, graduationStatus,
  STRONG_THRESHOLD, SPACING_GAP, skillMastery, weakSpots,
  scaffoldTier, recordReviewPass, levelBaseTier, TIER_RANK,
  isConceptUnlocked, frontierConcept, frontierOrder, recordConceptProgress, resetConcept,
  tileState, conceptPracticeTarget, conceptMasteryTarget
} from './foundations';
import type { Level, ScaffoldCtx } from './foundations';
import type { Track, LearningState } from '../types';

// Minimal track fixture mirroring src/foundations.js shape.
const track = {
  dataset: 'three-band',
  skills: [
    { skill: 'select-all', conceptId: 'c1', title: 'A', order: 1 },
    { skill: 'select-columns', conceptId: 'c2', title: 'B', order: 2 },
    { skill: 'order-limit', conceptId: 'c3', title: 'C', order: 3 },
    { skill: 'distinct', conceptId: 'c4', title: 'D', order: 4 },
    { skill: 'where', conceptId: 'c5', title: 'E', order: 5 }
  ],
  concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [{ id: 'c1-r1', skill: 'select-all' }, { id: 'c1-r2', skill: 'select-all' }, { id: 'c1-r3', skill: 'select-all' }, { id: 'c1-r4', skill: 'select-all' }, { id: 'c1-r5', skill: 'select-all' }] },
    { id: 'c2', order: 2, skill: 'select-columns', title: 'B', exercises: [{ id: 'c2-r1', skill: 'select-columns' }, { id: 'c2-r2', skill: 'select-columns' }, { id: 'c2-r3', skill: 'select-columns' }, { id: 'c2-r4', skill: 'select-columns' }, { id: 'c2-r5', skill: 'select-columns' }] },
    { id: 'c3', order: 3, skill: 'order-limit', title: 'C', exercises: [{ id: 'c3-r1', skill: 'order-limit' }, { id: 'c3-r2', skill: 'order-limit' }, { id: 'c3-r3', skill: 'order-limit' }, { id: 'c3-r4', skill: 'order-limit' }, { id: 'c3-r5', skill: 'order-limit' }] },
    { id: 'c4', order: 4, skill: 'distinct', title: 'D', exercises: [{ id: 'c4-r1', skill: 'distinct' }, { id: 'c4-r2', skill: 'distinct' }, { id: 'c4-r3', skill: 'distinct' }, { id: 'c4-r4', skill: 'distinct' }, { id: 'c4-r5', skill: 'distinct' }] },
    { id: 'c5', order: 5, skill: 'where', title: 'E', exercises: [{ id: 'c5-r1', skill: 'where' }, { id: 'c5-r2', skill: 'where' }, { id: 'c5-r3', skill: 'where' }, { id: 'c5-r4', skill: 'where' }, { id: 'c5-r5', skill: 'where' }] }
  ],
  checkpoints: [
    { id: 'cpA', afterOrder: 4, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct'], title: 'A' },
    { id: 'cpB', afterOrder: 5, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct', 'where'], title: 'B' }
  ]
} as Track;

function strong(state: LearningState, skill: string, ids: string[]) {
  ids.forEach((id) => recordCorrect(state, { id, skill }));
  if (ids.length < STRONG_THRESHOLD) return;
  const concept = track.concepts.find((candidate) => candidate.skill === skill);
  const target = concept ? conceptMasteryTarget(concept) : STRONG_THRESHOLD;
  for (let i = ids.length; i < target; i += 1) {
    recordCorrect(state, { id: `${skill}-lesson-${i + 1}`, skill });
  }
}

describe('foundations engine', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default and round-trips under its own key', () => {
    const s = loadFoundations();
    expect(s).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 });
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

  it('scaffoldTier keeps the full scaffold for beginners and fades only mastered reviews', () => {
    const s = loadFoundations();
    // A new lesson always gets the full scaffold.
    expect(scaffoldTier(s, 'where', false)).toBe('full');
    // A review of a not-yet-strong skill still gets the full scaffold.
    strong(s, 'where', ['w1']); // count 1, learning
    expect(scaffoldTier(s, 'where', true)).toBe('full');
    // A review of a mastered (strong) skill starts at half, then goes blank.
    strong(s, 'where', ['w2', 'w3']); // count 3, strong
    expect(scaffoldTier(s, 'where', true)).toBe('half');
    recordReviewPass(s, 'where');
    expect(scaffoldTier(s, 'where', true)).toBe('blank');
  });

  it('isConceptUnlocked follows the checkpoint gate', () => {
    const s = loadFoundations();
    expect(isConceptUnlocked(track, s, track.concepts[4])).toBe(false); // c5 gated by cpA
    recordCheckpointResult(s, track.checkpoints[0], 6);                  // pass cpA
    expect(isConceptUnlocked(track, s, track.concepts[4])).toBe(true);
  });

  it('recordConceptProgress raises maxUnlockedOrder only when a concept becomes strong', () => {
    const s = loadFoundations();
    recordConceptProgress(track, s, { id: 'c1-r1', skill: 'select-all' });
    expect(s.maxUnlockedOrder).toBe(0);                                  // count 1, not strong
    recordConceptProgress(track, s, { id: 'c1-r2', skill: 'select-all' });
    recordConceptProgress(track, s, { id: 'c1-r3', skill: 'select-all' });
    recordConceptProgress(track, s, { id: 'select-all-lesson-4', skill: 'select-all' });
    expect(s.maxUnlockedOrder).toBe(0);                                  // count 4, not strong
    recordConceptProgress(track, s, { id: 'select-all-lesson-5', skill: 'select-all' });
    expect(s.maxUnlockedOrder).toBe(2);                                  // c1 order 1 + 1
    expect(s.sessionCounter).toBe(0);                                    // never advances the clock
    expect(s.reviewsPassed).toEqual({});                                 // never touches the fade counter
  });

  it('unlock is monotonic: resetting a concept does not lower the mark or re-lock later ones', () => {
    const s = loadFoundations();
    ['c1-r1', 'c1-r2', 'c1-r3', 'select-all-lesson-4', 'select-all-lesson-5'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'select-all' }));
    ['c2-r1', 'c2-r2', 'c2-r3', 'select-columns-lesson-4', 'select-columns-lesson-5'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'select-columns' }));
    ['c3-r1', 'c3-r2', 'c3-r3', 'order-limit-lesson-4', 'order-limit-lesson-5'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'order-limit' }));
    expect(s.maxUnlockedOrder).toBe(4);
    resetConcept(s, 'select-columns');
    expect(s.maxUnlockedOrder).toBe(4);                                  // unchanged
  });

  it('frontierConcept skips a reset concept and points at the true next lesson', () => {
    const s = loadFoundations();
    s.skillCorrect = {
      'select-all': ['a', 'b', 'c', 'd', 'e'],
      'select-columns': ['a', 'b', 'c', 'd', 'e'],
      'order-limit': ['a', 'b', 'c', 'd', 'e']
    };
    s.maxUnlockedOrder = 4;                                              // mastered c1..c3, on c4
    resetConcept(s, 'select-columns');                                  // reset c2 (order 2 < 4)
    expect(frontierConcept(track, s)!.id).toBe('c4');                   // not c2
    expect(frontierOrder(track, s)).toBe(4);
  });

  it('resetConcept clears only that skill and reassigns fresh maps (snapshot safe)', () => {
    const s = loadFoundations();
    s.skillCorrect = { where: ['a', 'b', 'c'], grp: ['x'] };
    s.reviewsPassed = { where: 2 };
    s.lastPracticedSession = { where: 1, grp: 0 };
    s.checkpointsPassed = ['cpA'];
    s.sessionCounter = 5;
    s.maxUnlockedOrder = 6;
    const beforeSkill = s.skillCorrect;
    const beforeReviews = s.reviewsPassed;
    resetConcept(s, 'where');
    expect(s.skillCorrect).toEqual({ grp: ['x'] });
    expect(s.reviewsPassed).toEqual({});
    expect(s.lastPracticedSession).toEqual({ grp: 0 });
    expect(s.checkpointsPassed).toEqual(['cpA']);
    expect(s.sessionCounter).toBe(5);
    expect(s.maxUnlockedOrder).toBe(6);
    expect(beforeSkill).toEqual({ where: ['a', 'b', 'c'], grp: ['x'] }); // old ref not mutated
    expect(beforeReviews).toEqual({ where: 2 });
  });

  it('reset restarts the scaffold fade from full', () => {
    const s = loadFoundations();
    strong(s, 'where', ['w1', 'w2', 'w3']);
    expect(scaffoldTier(s, 'where', true)).toBe('half');
    recordReviewPass(s, 'where');
    expect(scaffoldTier(s, 'where', true)).toBe('blank');
    resetConcept(s, 'where');
    expect(isSkillStrong(s, 'where')).toBe(false);
    expect(scaffoldTier(s, 'where', false)).toBe('full');
    strong(s, 'where', ['w1', 'w2', 'w3']);
    expect(scaffoldTier(s, 'where', true)).toBe('half');                // fade restarted
  });

  it('tileState: default state has exactly one now tile and gates the rest', () => {
    const s = loadFoundations();
    const states = track.concepts.map((c) => tileState(track, s, c));
    expect(states.filter((x) => x === 'now').length).toBe(1);
    expect(tileState(track, s, track.concepts[0])).toBe('now');       // c1 frontier
    expect(tileState(track, s, track.concepts[1])).toBe('upcoming');  // c2 ahead of frontier
    expect(tileState(track, s, track.concepts[4])).toBe('locked');    // c5 behind cpA
  });

  it('tileState: a reset concept reads unlocked and a mastered one reads done', () => {
    const s = loadFoundations();
    s.skillCorrect = {
      'select-all': ['a', 'b', 'c', 'd', 'e'],
      'select-columns': ['a', 'b', 'c', 'd', 'e'],
      'order-limit': ['a', 'b', 'c', 'd', 'e']
    };
    s.maxUnlockedOrder = 4;
    resetConcept(s, 'select-columns');
    expect(tileState(track, s, track.concepts[2])).toBe('done');      // c3 still mastered
    expect(tileState(track, s, track.concepts[1])).toBe('unlocked');  // c2 reset, clickable, not frontier
    expect(tileState(track, s, track.concepts[3])).toBe('now');       // c4 frontier
  });

  it('buildTodaySession keeps the true frontier as main and rides a reset concept in as review', () => {
    const s = loadFoundations();
    s.skillCorrect = {
      'select-all': ['a', 'b', 'c', 'd', 'e'],
      'select-columns': ['a', 'b', 'c', 'd', 'e'],
      'order-limit': ['a', 'b', 'c', 'd', 'e']
    };
    s.maxUnlockedOrder = 4;
    resetConcept(s, 'select-columns');
    const session = buildTodaySession(track, s);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c4');
    expect(session.reviews.some((r) => r.skill === 'select-columns')).toBe(true);
  });

  it('buildTodaySession falls back to the reset concept as main when nothing is ahead', () => {
    const s = loadFoundations();
    recordConceptProgress(track, s, { id: 'c1-r1', skill: 'select-all' });
    resetConcept(s, 'select-all');
    const session = buildTodaySession(track, s);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c1');
    expect(session.reviews.some((r) => r.skill === 'select-all')).toBe(false); // not also a review
  });

  it('buildTodaySession routes a reset to main via the fallback branch once the learner has graduated', () => {
    const s = loadFoundations();
    // Every concept strong, both checkpoints passed, mark past the last concept: nothing is ahead.
    track.concepts.forEach((c) => strong(s, c.skill, [`${c.id}-r1`, `${c.id}-r2`, `${c.id}-r3`]));
    s.checkpointsPassed = ['cpA', 'cpB'];
    s.maxUnlockedOrder = 6;
    resetConcept(s, 'order-limit');                                                 // reset c3 (order 3 < 6)
    expect(frontierConcept(track, s)).toBeNull();                                   // no not-strong concept at order >= 6
    const session = buildTodaySession(track, s);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c3');    // the reset concept becomes main
    expect(session.reviews.some((r) => r.skill === 'order-limit')).toBe(false);     // filtered out of reviews in the fallback branch
  });

  it('conceptPracticeTarget returns the concept only when reachable and non-empty', () => {
    const s = loadFoundations();
    expect(conceptPracticeTarget(track, s, 'c1')!.id).toBe('c1'); // frontier, has exercises
    expect(conceptPracticeTarget(track, s, 'c2')).toBeNull();     // upcoming
    expect(conceptPracticeTarget(track, s, 'c5')).toBeNull();     // locked
    expect(conceptPracticeTarget(track, s, 'nope')).toBeNull();   // unknown id
    const emptyTrack = { ...track, concepts: [{ id: 'e1', order: 1, skill: 'x', title: 'E', exercises: [] }] } as Track;
    expect(conceptPracticeTarget(emptyTrack, loadFoundations(), 'e1')).toBeNull(); // no exercises
  });

  it('buildTodaySession picks the earliest at-or-above-frontier lesson after two resets and does not re-offer a passed checkpoint', () => {
    const s = loadFoundations();
    s.skillCorrect = {
      'select-all': ['a', 'b', 'c', 'd', 'e'], 'select-columns': ['a', 'b', 'c', 'd', 'e'],
      'order-limit': ['a', 'b', 'c', 'd', 'e'], 'distinct': ['a', 'b', 'c', 'd', 'e']
    };
    s.checkpointsPassed = ['cpA'];
    s.maxUnlockedOrder = 5;
    resetConcept(s, 'select-all');
    resetConcept(s, 'select-columns');
    expect(checkpointDue(track, s)).toBeNull();                        // cpA already passed
    const session = buildTodaySession(track, s);
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c5'); // where, frontier
    expect(session.reviews.map((r) => r.skill).sort()).toEqual(['select-all', 'select-columns']);
  });
});

describe('scaffold tapering (ctx) and the deterministic clamp', () => {
  beforeEach(() => localStorage.clear());

  it('levelBaseTier maps each band to its help floor', () => {
    const cases: Array<[Level, ReturnType<typeof levelBaseTier>]> = [
      ['beginner', 'full'],
      ['intermediate', 'half'],
      ['advanced', 'blank']
    ];
    cases.forEach(([level, tier]) => expect(levelBaseTier(level)).toBe(tier));
  });

  it('TIER_RANK orders help full > half > blank', () => {
    expect(TIER_RANK.full).toBe(2);
    expect(TIER_RANK.half).toBe(1);
    expect(TIER_RANK.blank).toBe(0);
  });

  it('omitting ctx reproduces todays exact behavior', () => {
    const s = loadFoundations();
    expect(scaffoldTier(s, 'where', false)).toBe('full');
    strong(s, 'where', ['w1', 'w2', 'w3']);
    expect(scaffoldTier(s, 'where', true)).toBe('half');
    recordReviewPass(s, 'where');
    expect(scaffoldTier(s, 'where', true)).toBe('blank');
  });

  it('reduced floor applies only once the prior-band capstone is passed, else degrades to full', () => {
    const s = loadFoundations();
    const notEarned: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: false, firstExposure: true };
    expect(scaffoldTier(s, 'rv-x', false, notEarned)).toBe('full');
    const earned: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'rv-x', false, earned)).toBe('half');
  });

  it('first non-review sighting bumps one step MORE help than the floor', () => {
    const s = loadFoundations();
    const inter: ScaffoldCtx = { level: 'intermediate', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'sl-x', false, inter)).toBe('full');
    const beg: ScaffoldCtx = { level: 'beginner', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'ap-x', false, beg)).toBe('full');
  });

  it('advanced reviews taper down to the band floor (blank)', () => {
    const s = loadFoundations();
    strong(s, 'rv-y', ['a', 'b', 'c']);
    const advReview: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: false };
    expect(scaffoldTier(s, 'rv-y', true, advReview)).toBe('blank');
  });

  it('a mastered beginner review never shows more help than a fresh advanced first attempt', () => {
    const beg = loadFoundations();
    strong(beg, 'ap-z', ['a', 'b', 'c']);
    const begCtx: ScaffoldCtx = { level: 'beginner', priorBandCapstonePassed: true, firstExposure: false };
    const begReview = scaffoldTier(beg, 'ap-z', true, begCtx);

    const adv = loadFoundations();
    const advCtx: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: true };
    const advFirst = scaffoldTier(adv, 'rv-new', false, advCtx);

    expect(TIER_RANK[begReview]).toBeLessThanOrEqual(TIER_RANK[advFirst]);
  });
});
