import { safeGet, safeSet } from './progress.js';
import { isSkillStrong } from './foundations.js';

export const LEARNING_KEY = 'sqlm:learning:v1';
const LEGACY_KEY = 'sqlm:foundations:v1';

function defaultState() {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 };
}
function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function normalize(parsed) {
  return {
    skillCorrect: asObject(parsed.skillCorrect),
    attempts: asObject(parsed.attempts),
    lastSql: asObject(parsed.lastSql),
    lastPracticedSession: asObject(parsed.lastPracticedSession),
    checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
    sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0
  };
}

export function loadLearning() {
  try {
    const current = JSON.parse(safeGet(LEARNING_KEY));
    if (current && typeof current === 'object') return normalize(current);
  } catch { /* fall through */ }
  // One-time migration from the Foundations-only key.
  try {
    const legacy = JSON.parse(safeGet(LEGACY_KEY));
    if (legacy && typeof legacy === 'object') {
      const migrated = normalize(legacy);
      safeSet(LEARNING_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* fall through */ }
  return defaultState();
}

export function saveLearning(state) { safeSet(LEARNING_KEY, JSON.stringify(state)); }

// The first phase that has not yet fully graduated (any concept not-strong OR any
// checkpoint unpassed), or the last phase if every phase is complete. A phase whose
// concepts are all strong but whose trailing checkpoint has not passed stays active,
// so later phases stay locked — matching the engine's checkpoint/concept gating.
export function currentPhase(phases, state) {
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  for (const phase of ordered) {
    if (!phaseGraduation(phase, state).complete) return phase;
  }
  return ordered[ordered.length - 1];
}

export function phaseGraduation(phase, state) {
  const strong = phase.concepts.filter((c) => isSkillStrong(state, c.skill)).length;
  const total = phase.concepts.length;
  const checkpointsDone = phase.checkpoints.every((cp) => state.checkpointsPassed.includes(cp.id));
  return { strong, total, checkpointsDone, complete: strong === total && checkpointsDone };
}
