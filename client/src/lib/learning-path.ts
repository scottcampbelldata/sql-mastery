import { safeGet, safeSet } from './progress';
import { isConceptStrong } from './foundations';
import type { LearningState, Phase, Track } from '../types';

export const LEARNING_KEY = 'sqlm:learning:v1';
function defaultState(): LearningState {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 };
}
function asObject(v: unknown): Record<string, any> { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}; }
function normalize(parsed: any): LearningState {
  return {
    skillCorrect: asObject(parsed.skillCorrect),
    attempts: asObject(parsed.attempts),
    lastSql: asObject(parsed.lastSql),
    lastPracticedSession: asObject(parsed.lastPracticedSession),
    checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
    sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0,
    reviewsPassed: asObject(parsed.reviewsPassed),
    maxUnlockedOrder: Number.isFinite(parsed.maxUnlockedOrder) && parsed.maxUnlockedOrder > 0 ? parsed.maxUnlockedOrder : 0
  };
}

export function loadLearning(): LearningState {
  try {
    const current = JSON.parse(safeGet(LEARNING_KEY) as string);
    if (current && typeof current === 'object') return normalize(current);
  } catch { /* fall through */ }
  return defaultState();
}

export function saveLearning(state: LearningState): void { safeSet(LEARNING_KEY, JSON.stringify(state)); }

// The first phase that has not yet fully graduated (any concept not-strong OR any
// checkpoint unpassed), or the last phase if every phase is complete. A phase whose
// concepts are all strong but whose trailing checkpoint has not passed stays active,
// so later phases stay locked: matching the engine's checkpoint/concept gating.
export function currentPhase(phases: Phase[], state: LearningState): Phase {
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  for (const phase of ordered) {
    if (!phaseGraduation(phase, state).complete) return phase;
  }
  return ordered[ordered.length - 1];
}

export function phaseGraduation(phase: Phase, state: LearningState): { strong: number; total: number; checkpointsDone: boolean; complete: boolean } {
  const strong = phase.concepts.filter((c) => isConceptStrong(state, c)).length;
  const total = phase.concepts.length;
  const checkpointsDone = phase.checkpoints.every((cp) => state.checkpointsPassed.includes(cp.id));
  return { strong, total, checkpointsDone, complete: strong === total && checkpointsDone };
}

// Back-fill the unlock high-water mark for a returning learner from what they have already
// achieved, so no reached lesson re-locks after this feature ships. Returns a value greater
// than or equal to the current mark; callers persist only if it increased.
export function reconcileUnlock(track: Track, state: LearningState): number {
  let mark = state.maxUnlockedOrder;
  for (const c of track.concepts) {
    if (isConceptStrong(state, c)) mark = Math.max(mark, c.order + 1);
  }
  for (const cp of track.checkpoints) {
    if (state.checkpointsPassed.includes(cp.id)) mark = Math.max(mark, cp.afterOrder + 1);
  }
  return mark;
}

// Dev-time integrity: every concept.skill must be unique across the flattened track, because
// the engine and per-lesson reset key by skill. Returns the list of skills used more than once.
export function duplicateSkills(track: Track): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of track.concepts) {
    if (seen.has(c.skill)) dups.add(c.skill);
    seen.add(c.skill);
  }
  return [...dups];
}
