import { safeGet, safeSet } from './progress.js';

export const FOUNDATIONS_KEY = 'sqlm:foundations:v1';
export const STRONG_THRESHOLD = 3;
export const SPACING_GAP = 2;
export const MAX_REVIEWS_PER_SESSION = 2;
export const CHECKPOINT_SIZE = 6;
export const CHECKPOINT_PASS = 5;

function defaultState() {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 };
}

function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

export function loadFoundations() {
  try {
    const parsed = JSON.parse(safeGet(FOUNDATIONS_KEY));
    if (parsed && typeof parsed === 'object') {
      return {
        skillCorrect: asObject(parsed.skillCorrect),
        attempts: asObject(parsed.attempts),
        lastSql: asObject(parsed.lastSql),
        lastPracticedSession: asObject(parsed.lastPracticedSession),
        checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
        sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0
      };
    }
  } catch { /* fall through */ }
  return defaultState();
}

export function saveFoundations(state) { safeSet(FOUNDATIONS_KEY, JSON.stringify(state)); }

export function skillLevel(state, skill) {
  const count = (state.skillCorrect[skill] || []).length;
  const tier = count >= STRONG_THRESHOLD ? 'strong' : count > 0 ? 'learning' : 'new';
  return { count, tier };
}
export function isSkillStrong(state, skill) { return skillLevel(state, skill).count >= STRONG_THRESHOLD; }

// Mutating recorders (return the same state; callers persist). New leaf objects/arrays
// are created so a shallow snapshot of state is not corrupted.
export function recordCorrect(state, exercise) {
  const list = state.skillCorrect[exercise.skill] ? [...state.skillCorrect[exercise.skill]] : [];
  if (!list.includes(exercise.id)) list.push(exercise.id);
  state.skillCorrect = { ...state.skillCorrect, [exercise.skill]: list };
  state.lastPracticedSession = { ...state.lastPracticedSession, [exercise.skill]: state.sessionCounter };
  return state;
}
export function recordAttempt(state, exerciseId) {
  state.attempts = { ...state.attempts, [exerciseId]: (state.attempts[exerciseId] || 0) + 1 };
  return state;
}
export function advanceSession(state) { state.sessionCounter += 1; return state; }

function isLearned(state, skill) { return (state.skillCorrect[skill] || []).length > 0; }

export function dueReviews(track, state) {
  const out = [];
  for (const s of track.skills) {
    if (!isLearned(state, s.skill)) continue;
    const last = state.lastPracticedSession[s.skill];
    if (last === undefined) continue;
    if (state.sessionCounter - last < SPACING_GAP) continue;
    const concept = track.concepts.find((c) => c.skill === s.skill);
    if (!concept) continue;
    const answered = new Set(state.skillCorrect[s.skill] || []);
    const unseen = concept.exercises.find((e) => !answered.has(e.id));
    const exercise = unseen || concept.exercises[(state.sessionCounter + out.length) % concept.exercises.length];
    out.push({ skill: s.skill, concept, exercise });
    if (out.length >= MAX_REVIEWS_PER_SESSION) break;
  }
  return out;
}

function checkpointPassed(state, id) { return state.checkpointsPassed.includes(id); }

// A concept of order N > the highest checkpoint boundary <= N-1 requires that checkpoint passed.
function conceptUnlocked(track, state, concept) {
  const gating = track.checkpoints
    .filter((cp) => cp.afterOrder < concept.order)
    .sort((a, b) => b.afterOrder - a.afterOrder)[0];
  return !gating || checkpointPassed(state, gating.id);
}

export function nextConcept(track, state) {
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (isSkillStrong(state, concept.skill)) continue;
    if (!conceptUnlocked(track, state, concept)) return null;
    return concept;
  }
  return null;
}

export function checkpointDue(track, state) {
  const ordered = [...track.checkpoints].sort((a, b) => a.afterOrder - b.afterOrder);
  for (const cp of ordered) {
    if (checkpointPassed(state, cp.id)) continue;
    const conceptsBefore = track.concepts.filter((c) => c.order <= cp.afterOrder);
    if (conceptsBefore.every((c) => isSkillStrong(state, c.skill))) return cp;
  }
  return null;
}

export function buildTodaySession(track, state) {
  const reviews = dueReviews(track, state);
  const cp = checkpointDue(track, state);
  if (cp) return { reviews, main: { kind: 'checkpoint', checkpoint: cp } };
  const concept = nextConcept(track, state);
  if (!concept) return { reviews, main: { kind: 'graduated' } };
  const answered = new Set(state.skillCorrect[concept.skill] || []);
  const reps = concept.exercises.filter((e) => !answered.has(e.id));
  return { reviews, main: { kind: 'lesson', concept, reps: reps.length ? reps : concept.exercises } };
}

export function recordCheckpointResult(state, checkpoint, score, missedSkills = []) {
  if (score >= CHECKPOINT_PASS) {
    if (!state.checkpointsPassed.includes(checkpoint.id)) state.checkpointsPassed = [...state.checkpointsPassed, checkpoint.id];
  } else {
    const forced = { ...state.lastPracticedSession };
    missedSkills.forEach((skill) => { forced[skill] = state.sessionCounter - SPACING_GAP; });
    state.lastPracticedSession = forced;
  }
  return state;
}

export function graduationStatus(track, state) {
  const strongSkills = track.skills.filter((s) => isSkillStrong(state, s.skill)).length;
  const totalSkills = track.skills.length;
  const allCheckpoints = track.checkpoints.every((cp) => checkpointPassed(state, cp.id));
  return { strongSkills, totalSkills, checkpointsPassed: [...state.checkpointsPassed], graduated: strongSkills === totalSkills && allCheckpoints };
}
