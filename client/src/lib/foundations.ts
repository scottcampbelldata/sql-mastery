import { safeGet, safeSet } from './progress';
import { buildLessonSteps } from './lessonSteps';
import type { LearningState, Track, Concept, Checkpoint, Exercise } from '../types';

export const FOUNDATIONS_KEY = 'sqlm:foundations:v2';
export const STRONG_THRESHOLD = 3;
export const SPACING_GAP = 2;
export const MAX_REVIEWS_PER_SESSION = 2;
export const CHECKPOINT_SIZE = 6;
export const CHECKPOINT_PASS = 5;

function defaultState(): LearningState {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 };
}

function asObject(v: unknown): Record<string, any> { return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {}; }

function sanitizeState(parsed: Record<string, any>): LearningState {
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

// v2 clamp-on-load migration. Track-keyed state is pruned to the live curriculum, while
// exercise-keyed attempts and lastSql are only sanitized.
export function migrateFoundationsState(parsed: unknown, track: Track): LearningState {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultState();
  const base = sanitizeState(parsed as Record<string, any>);
  const validSkills = new Set(track.concepts.map((c) => c.skill));
  const validCheckpoints = new Set(track.checkpoints.map((cp) => cp.id));
  const pruneBySkill = <T>(m: Record<string, T>): Record<string, T> => {
    const out: Record<string, T> = {};
    Object.keys(m).forEach((k) => { if (validSkills.has(k)) out[k] = m[k]; });
    return out;
  };
  return {
    ...base,
    skillCorrect: pruneBySkill(base.skillCorrect),
    reviewsPassed: pruneBySkill(base.reviewsPassed),
    lastPracticedSession: pruneBySkill(base.lastPracticedSession),
    checkpointsPassed: base.checkpointsPassed.filter((id) => validCheckpoints.has(id)),
    maxUnlockedOrder: Math.min(base.maxUnlockedOrder, maxConceptOrder(track))
  };
}

export function loadFoundations(track?: Track): LearningState {
  let parsed: unknown = null;
  try { parsed = JSON.parse(safeGet(FOUNDATIONS_KEY) as string); } catch { parsed = null; }
  if (track) return migrateFoundationsState(parsed, track);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return sanitizeState(parsed as Record<string, any>);
  return defaultState();
}

export function saveFoundations(state: LearningState): void { safeSet(FOUNDATIONS_KEY, JSON.stringify(state)); }

export function skillLevel(state: LearningState, skill: string): { count: number; tier: string } {
  const count = (state.skillCorrect[skill] || []).length;
  const tier = count >= STRONG_THRESHOLD ? 'strong' : count > 0 ? 'learning' : 'new';
  return { count, tier };
}
export function isSkillStrong(state: LearningState, skill: string): boolean { return skillLevel(state, skill).count >= STRONG_THRESHOLD; }

export function conceptMasteryTarget(concept: Pick<Concept, 'exercises'>): number {
  return buildLessonSteps(concept).length || STRONG_THRESHOLD;
}

export function conceptLevel(state: LearningState, concept: Pick<Concept, 'skill' | 'exercises'>): { count: number; target: number; tier: string } {
  const count = (state.skillCorrect[concept.skill] || []).length;
  const target = conceptMasteryTarget(concept);
  const tier = count >= target ? 'strong' : count > 0 ? 'learning' : 'new';
  return { count, target, tier };
}

export function isConceptStrong(state: LearningState, concept: Pick<Concept, 'skill' | 'exercises'>): boolean {
  const level = conceptLevel(state, concept);
  return level.count >= level.target;
}

export interface SkillMastery { count: number; tier: string; pct: number; sessionsSince: number; }

// Visual mastery: progress toward "strong", dimmed by how long since you practiced.
// Purely for display and review ordering; it never changes count, isSkillStrong, or graduation.
export function skillMastery(state: LearningState, skill: string): SkillMastery {
  const { count, tier } = skillLevel(state, skill);
  const last = state.lastPracticedSession[skill];
  const sessionsSince = last === undefined ? 0 : Math.max(0, state.sessionCounter - last);
  const base = Math.min(1, count / STRONG_THRESHOLD);
  const decay = Math.max(0.5, 1 - 0.15 * Math.max(0, sessionsSince - SPACING_GAP));
  return { count, tier, pct: Math.round(base * decay * 100), sessionsSince };
}

export function conceptMastery(state: LearningState, concept: Pick<Concept, 'skill' | 'exercises'>): SkillMastery & { target: number } {
  const { count, target, tier } = conceptLevel(state, concept);
  const last = state.lastPracticedSession[concept.skill];
  const sessionsSince = last === undefined ? 0 : Math.max(0, state.sessionCounter - last);
  const base = Math.min(1, count / target);
  const decay = Math.max(0.5, 1 - 0.15 * Math.max(0, sessionsSince - SPACING_GAP));
  return { count, target, tier, pct: Math.round(base * decay * 100), sessionsSince };
}

// The lowest-mastery skills you have started (count > 0), weakest first.
export function weakSpots(track: Track, state: LearningState, n = 3): { skill: string; title: string; pct: number }[] {
  return track.concepts
    .filter((c) => (state.skillCorrect[c.skill] || []).length > 0)
    .map((c) => ({ skill: c.skill, title: c.title, pct: conceptMastery(state, c).pct }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, n);
}

export type ScaffoldTier = 'full' | 'half' | 'blank';

// Level band. beginner -> most help, advanced -> least help.
export type Level = 'beginner' | 'intermediate' | 'advanced';

// Numeric help-rank for the deterministic clamp. full = MOST help, blank = LEAST help.
export const TIER_RANK: Record<ScaffoldTier, number> = { full: 2, half: 1, blank: 0 };

// Inverse of TIER_RANK; index by rank (0..2) to recover a tier after a bump/clamp.
const RANK_TIER: ScaffoldTier[] = ['blank', 'half', 'full'];

// Band floor: the baseline scaffold each level starts from before earning reductions.
export function levelBaseTier(level: Level): ScaffoldTier {
  if (level === 'beginner') return 'full';
  if (level === 'intermediate') return 'half';
  return 'blank';
}

// Optional tapering context. Omitting it reproduces today's exact behavior.
export interface ScaffoldCtx {
  level: Level;
  priorBandCapstonePassed: boolean;
  firstExposure: boolean;
}

function lessHelpful(a: ScaffoldTier, b: ScaffoldTier): ScaffoldTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function bumpHelp(tier: ScaffoldTier): ScaffoldTier {
  return RANK_TIER[Math.min(TIER_RANK.full, TIER_RANK[tier] + 1)];
}

function reviewFade(state: LearningState, skill: string, isReview: boolean): ScaffoldTier {
  if (!isReview || !isSkillStrong(state, skill)) return 'full';
  const passes = state.reviewsPassed[skill] || 0;
  return passes === 0 ? 'half' : 'blank';
}

// How much starter to show for a step. With no ctx, this is the original review fade.
// With ctx, reduced help is earned by the prior-band capstone, first exposure bumps one
// step toward more help, and later attempts are clamped to the earned level floor.
export function scaffoldTier(state: LearningState, skill: string, isReview: boolean, ctx?: ScaffoldCtx): ScaffoldTier {
  const fade = reviewFade(state, skill, isReview);
  if (!ctx) return fade;
  const floor = ctx.priorBandCapstonePassed ? levelBaseTier(ctx.level) : 'full';
  if (ctx.firstExposure) return bumpHelp(floor);
  return lessHelpful(fade, floor);
}

export function recordReviewPass(state: LearningState, skill: string): LearningState {
  state.reviewsPassed = { ...state.reviewsPassed, [skill]: (state.reviewsPassed[skill] || 0) + 1 };
  return state;
}

// Mutating recorders (return the same state; callers persist). New leaf objects/arrays
// are created so a shallow snapshot of state is not corrupted.
export function recordCorrect(state: LearningState, exercise: Exercise): LearningState {
  const skill = exercise.skill as string;
  const list = state.skillCorrect[skill] ? [...state.skillCorrect[skill]] : [];
  if (!list.includes(exercise.id)) list.push(exercise.id);
  state.skillCorrect = { ...state.skillCorrect, [skill]: list };
  state.lastPracticedSession = { ...state.lastPracticedSession, [skill]: state.sessionCounter };
  return state;
}
export function recordAttempt(state: LearningState, exerciseId: string): LearningState {
  state.attempts = { ...state.attempts, [exerciseId]: (state.attempts[exerciseId] || 0) + 1 };
  return state;
}
export function advanceSession(state: LearningState): LearningState { state.sessionCounter += 1; return state; }

function isLearned(state: LearningState, skill: string): boolean { return (state.skillCorrect[skill] || []).length > 0; }

export interface DueReview {
  skill: string;
  concept: Concept;
  exercise: Exercise;
}

export function dueReviews(track: Track, state: LearningState): DueReview[] {
  const due: { skill: string; concept: Concept; count: number; last: number }[] = [];
  for (const s of track.skills) {
    if (!isLearned(state, s.skill)) continue;
    const last = state.lastPracticedSession[s.skill];
    if (last === undefined) continue;
    if (state.sessionCounter - last < SPACING_GAP) continue;
    const concept = track.concepts.find((c) => c.skill === s.skill);
    if (!concept) continue;
    due.push({ skill: s.skill, concept, count: (state.skillCorrect[s.skill] || []).length, last });
  }
  // Weakest first: fewest correct, then longest since practiced.
  due.sort((a, b) => (a.count - b.count) || (a.last - b.last));
  const out: DueReview[] = [];
  due.slice(0, MAX_REVIEWS_PER_SESSION).forEach((d, i) => {
    const answered = new Set(state.skillCorrect[d.skill] || []);
    const unseen = d.concept.exercises.find((e) => !answered.has(e.id));
    const exercise = unseen || d.concept.exercises[(state.sessionCounter + i) % d.concept.exercises.length];
    out.push({ skill: d.skill, concept: d.concept, exercise });
  });
  return out;
}

function checkpointPassed(state: LearningState, id: string): boolean { return state.checkpointsPassed.includes(id); }

// A concept of order N > the highest checkpoint boundary <= N-1 requires that checkpoint passed.
function conceptUnlocked(track: Track, state: LearningState, concept: Concept): boolean {
  const gating = track.checkpoints
    .filter((cp) => cp.afterOrder < concept.order)
    .sort((a, b) => b.afterOrder - a.afterOrder)[0];
  return !gating || checkpointPassed(state, gating.id);
}

export function isConceptUnlocked(track: Track, state: LearningState, concept: Concept): boolean {
  return conceptUnlocked(track, state, concept);
}

// The largest (already-globalized) concept.order present in the flattened track.
export function maxConceptOrder(track: Track): number {
  return track.concepts.reduce((m, c) => Math.max(m, c.order), 0);
}

// The learner's true frontier: the earliest not-strong, unlocked concept at or beyond the
// reached high-water mark. Concepts below the mark that are not strong are reset concepts and
// are handled as reviews, not as the headline lesson. Returns null when the next such concept
// is checkpoint-gated, or when none remains (every concept at or above the mark is strong).
export function frontierConcept(track: Track, state: LearningState): Concept | null {
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (concept.order < state.maxUnlockedOrder) continue;
    if (isConceptStrong(state, concept)) continue;
    if (!conceptUnlocked(track, state, concept)) return null;
    return concept;
  }
  return null;
}

export function frontierOrder(track: Track, state: LearningState): number {
  const f = frontierConcept(track, state);
  return f ? f.order : maxConceptOrder(track);
}

export type TileState = 'done' | 'now' | 'unlocked' | 'upcoming' | 'locked';

// The visual state of a concept tile on the lesson map.
export function tileState(track: Track, state: LearningState, concept: Concept): TileState {
  if (isConceptStrong(state, concept)) return 'done';
  if (!conceptUnlocked(track, state, concept)) return 'locked';
  const front = frontierOrder(track, state);
  const ceiling = Math.max(front, state.maxUnlockedOrder);
  if (concept.order > ceiling) return 'upcoming';
  if (concept.order === front) return 'now';
  return 'unlocked';
}

// The concept a focused-practice route may open, or null if the id is unknown, the concept is
// checkpoint-locked, beyond the reached frontier, or has no exercises. Drives the /learn/concept
// route guard.
export function conceptPracticeTarget(track: Track, state: LearningState, conceptId: string): Concept | null {
  const concept = track.concepts.find((c) => c.id === conceptId);
  if (!concept || !concept.exercises.length) return null;
  if (!conceptUnlocked(track, state, concept)) return null;
  const ceiling = Math.max(frontierOrder(track, state), state.maxUnlockedOrder);
  if (concept.order > ceiling) return null;
  return concept;
}

// Track-aware progress recorder. Records a correct answer (pure recordCorrect) and raises the
// unlock high-water mark if the concept just became strong. Used by every concept-exercise
// correct path so the guided frontier and the tile map stay in sync.
export function recordConceptProgress(track: Track, state: LearningState, exercise: Exercise): LearningState {
  recordCorrect(state, exercise);
  const concept = track.concepts.find((c) => c.skill === exercise.skill);
  if (concept && isConceptStrong(state, concept)) {
    state.maxUnlockedOrder = Math.max(state.maxUnlockedOrder, concept.order + 1);
  }
  return state;
}

// Clears one concept's mastery so its full scaffold returns, without touching the path, the
// high-water mark, checkpoints, or any other skill. Reassigns fresh maps (never mutates in
// place) so a prior state snapshot is not corrupted.
export function resetConcept(state: LearningState, skill: string): LearningState {
  const omit = (m: Record<string, unknown>) => { const n = { ...m }; delete n[skill]; return n; };
  state.skillCorrect = omit(state.skillCorrect) as Record<string, string[]>;
  state.reviewsPassed = omit(state.reviewsPassed) as Record<string, number>;
  state.lastPracticedSession = omit(state.lastPracticedSession) as Record<string, number>;
  return state;
}

export function nextConcept(track: Track, state: LearningState): Concept | null {
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (isConceptStrong(state, concept)) continue;
    if (!conceptUnlocked(track, state, concept)) return null;
    return concept;
  }
  return null;
}

export function checkpointDue(track: Track, state: LearningState): Checkpoint | null {
  const ordered = [...track.checkpoints].sort((a, b) => a.afterOrder - b.afterOrder);
  for (const cp of ordered) {
    if (checkpointPassed(state, cp.id)) continue;
    const conceptsBefore = track.concepts.filter((c) => c.order <= cp.afterOrder);
    if (conceptsBefore.every((c) => isConceptStrong(state, c))) return cp;
  }
  return null;
}

export type TodaySession = {
  reviews: DueReview[];
  main:
    | { kind: 'checkpoint'; checkpoint: Checkpoint }
    | { kind: 'graduated' }
    | { kind: 'lesson'; concept: Concept; reps: Exercise[] };
};

// Reset concepts (not strong, unlocked, below the reached frontier) surface as reviews so a
// reset re-strengthens under spacing instead of yanking the headline lesson backward.
function resetReviews(track: Track, state: LearningState): DueReview[] {
  const out: DueReview[] = [];
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (concept.order >= state.maxUnlockedOrder) continue;
    if (isConceptStrong(state, concept)) continue;
    if (!conceptUnlocked(track, state, concept)) continue;
    if (!concept.exercises.length) continue;
    out.push({ skill: concept.skill, concept, exercise: concept.exercises[0] });
  }
  return out;
}

function mergedReviews(track: Track, state: LearningState): DueReview[] {
  const resets = resetReviews(track, state);
  const due = dueReviews(track, state).filter((d) => !resets.some((r) => r.skill === d.skill));
  return [...resets, ...due].slice(0, MAX_REVIEWS_PER_SESSION);
}

function lessonMain(concept: Concept): TodaySession['main'] {
  // Keep the whole lesson as the plan so the step count ("Step 1 of N") stays stable
  // across visits; the session view resumes at the first unanswered step rather than
  // shrinking the total as exercises are completed.
  return { kind: 'lesson', concept, reps: concept.exercises };
}

export function buildTodaySession(track: Track, state: LearningState): TodaySession {
  const reviews = mergedReviews(track, state);
  const cp = checkpointDue(track, state);
  if (cp) return { reviews, main: { kind: 'checkpoint', checkpoint: cp } };
  const frontier = frontierConcept(track, state);
  if (frontier) return { reviews, main: lessonMain(frontier) };
  const fallback = nextConcept(track, state);
  if (!fallback) return { reviews, main: { kind: 'graduated' } };
  return { reviews: reviews.filter((r) => r.skill !== fallback.skill), main: lessonMain(fallback) };
}

export function recordCheckpointResult(state: LearningState, checkpoint: Checkpoint, score: number, missedSkills: string[] = []): LearningState {
  if (score >= CHECKPOINT_PASS) {
    if (!state.checkpointsPassed.includes(checkpoint.id)) state.checkpointsPassed = [...state.checkpointsPassed, checkpoint.id];
  } else {
    const forced = { ...state.lastPracticedSession };
    missedSkills.forEach((skill) => { forced[skill] = state.sessionCounter - SPACING_GAP; });
    state.lastPracticedSession = forced;
  }
  return state;
}

export function graduationStatus(track: Track, state: LearningState): { strongSkills: number; totalSkills: number; checkpointsPassed: string[]; graduated: boolean } {
  const strongSkills = track.concepts.filter((c) => isConceptStrong(state, c)).length;
  const totalSkills = track.concepts.length;
  const allCheckpoints = track.checkpoints.every((cp) => checkpointPassed(state, cp.id));
  return { strongSkills, totalSkills, checkpointsPassed: [...state.checkpointsPassed], graduated: strongSkills === totalSkills && allCheckpoints };
}
