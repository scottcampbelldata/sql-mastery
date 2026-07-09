import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhases, getLearningPath, graduationStatus } from '../src/learning-path';
import type { GraduationState } from '../src/learning-path';
import type { Level } from '../src/generator/types';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const DBS = ['aperture', 'sideline', 'rove'];

function gatingCheckpoint(track: ReturnType<typeof getLearningPath>, order: number) {
  return track.checkpoints
    .filter((checkpoint: any) => checkpoint.afterOrder < order)
    .sort((a: any, b: any) => b.afterOrder - a.afterOrder)[0];
}

function unlocked(track: ReturnType<typeof getLearningPath>, passed: Set<string>, order: number): boolean {
  const gate = gatingCheckpoint(track, order);
  return !gate || passed.has(gate.id);
}

function firstConceptOfLevel(track: ReturnType<typeof getLearningPath>, level: Level) {
  return [...track.concepts]
    .filter((concept: any) => concept.level === level)
    .sort((a: any, b: any) => a.order - b.order)[0];
}

function fullyStrongState(track: ReturnType<typeof getLearningPath>): GraduationState {
  const skillCorrect: Record<string, string[]> = {};
  for (const skill of track.skills as any[]) skillCorrect[skill.skill] = ['a', 'b', 'c'];
  const checkpointsPassed = (track.checkpoints as any[]).map((checkpoint) => checkpoint.id);
  return { skillCorrect, checkpointsPassed };
}

test('getPhases unions the three bands with contiguous 1..N order, no gaps or dupes', () => {
  const phases = getPhases();
  const orders = phases.map((phase) => phase.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.deepEqual(orders, orders.map((_, index) => index + 1), 'orders are contiguous 1..N with no gaps');
  assert.ok(phases.length >= 3, 'at least one phase per band');
});

test('every phase carries a real level and an owned database', () => {
  for (const phase of getPhases()) {
    assert.ok(LEVELS.includes(phase.level), `${phase.id} has a level (${phase.level})`);
    assert.ok(DBS.includes(phase.database), `${phase.id} has an owned database (${phase.database})`);
  }
});

test('getLearningPath picks level+database onto phases, concepts, and skills', () => {
  const learningPath = getLearningPath();
  for (const phase of learningPath.phases as any[]) {
    assert.ok(LEVELS.includes(phase.level), `phase ${phase.id} carries level`);
    assert.ok(DBS.includes(phase.database), `phase ${phase.id} carries database`);
  }
  assert.ok(learningPath.concepts.every((concept: any) => LEVELS.includes(concept.level)), 'concepts carry level');
  assert.ok(learningPath.skills.every((skill: any) => LEVELS.includes(skill.level)), 'skills carry level');
});

test('fresh state locks intermediate/advanced; beginner capstone unlocks first intermediate concept', () => {
  const learningPath = getLearningPath();
  const firstIntermediate = firstConceptOfLevel(learningPath, 'intermediate');
  const firstAdvanced = firstConceptOfLevel(learningPath, 'advanced');
  assert.ok(firstIntermediate, 'there is a first intermediate concept');
  assert.ok(firstAdvanced, 'there is a first advanced concept');

  const fresh = new Set<string>();
  assert.equal(unlocked(learningPath, fresh, firstIntermediate.order), false, 'intermediate is locked when fresh');
  assert.equal(unlocked(learningPath, fresh, firstAdvanced.order), false, 'advanced is locked when fresh');

  const beginnerCapstone = gatingCheckpoint(learningPath, firstIntermediate.order);
  assert.ok(beginnerCapstone, 'a beginner boundary capstone gates the first intermediate concept');

  const afterBeginner = new Set<string>([beginnerCapstone.id]);
  assert.equal(unlocked(learningPath, afterBeginner, firstIntermediate.order), true, 'passing the beginner capstone unlocks intermediate');
  assert.equal(unlocked(learningPath, afterBeginner, firstAdvanced.order), false, 'advanced stays locked after only the beginner capstone');
});

test('graduationStatus: fresh state graduates neither a band nor the whole track', () => {
  const learningPath = getLearningPath();
  const fresh: GraduationState = { skillCorrect: {}, checkpointsPassed: [] };
  assert.equal(graduationStatus(learningPath, fresh, 'beginner').graduated, false);
  assert.equal(graduationStatus(learningPath, fresh, 'intermediate').graduated, false);
  assert.equal(graduationStatus(learningPath, fresh, 'advanced').graduated, false);
  assert.equal(graduationStatus(learningPath, fresh).graduated, false, 'whole track not graduated');
  assert.equal(graduationStatus(learningPath, fresh, 'beginner').strongSkills, 0);
});

test('graduationStatus: per-band totals are scoped to that band only', () => {
  const learningPath = getLearningPath();
  const fresh: GraduationState = { skillCorrect: {}, checkpointsPassed: [] };
  const beginner = graduationStatus(learningPath, fresh, 'beginner');
  const whole = graduationStatus(learningPath, fresh);
  assert.ok(beginner.totalSkills > 0, 'beginner band has skills');
  assert.ok(beginner.totalSkills < whole.totalSkills, 'a band is a strict subset of the whole track');
  const sumBands =
    graduationStatus(learningPath, fresh, 'beginner').totalSkills +
    graduationStatus(learningPath, fresh, 'intermediate').totalSkills +
    graduationStatus(learningPath, fresh, 'advanced').totalSkills;
  assert.equal(sumBands, whole.totalSkills, 'the three bands partition the whole-track skill set');
});

test('graduationStatus: a fully-strong state graduates every band and the whole track', () => {
  const learningPath = getLearningPath();
  const state = fullyStrongState(learningPath);
  for (const level of LEVELS) {
    const status = graduationStatus(learningPath, state, level);
    assert.equal(status.graduated, true, `${level} graduated`);
    assert.equal(status.strongSkills, status.totalSkills, `${level} all skills strong`);
  }
  assert.equal(graduationStatus(learningPath, state).graduated, true, 'whole track graduated');
});
