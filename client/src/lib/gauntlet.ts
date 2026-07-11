import { phaseBand } from './bands';
import type { Track, Exercise, LearningState, GauntletRecord, GauntletRun } from '../types';

// The gauntlet is the high-stakes end of each band: a timed screen with no scaffolds, no
// hints, and no coach. Questions are drawn one-per-skill across the band so a pass means
// breadth, not one memorized query. Results live in the learning state (so they sync) and
// the pass verdict is always derived from bestScore against the config.

export interface GauntletConfig {
  id: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  database: string;
  title: string;
  blurb: string;
  questions: number;
  minutes: number;
  pass: number;
}

export const GAUNTLETS: GauntletConfig[] = [
  {
    id: 'gt-aperture',
    level: 'beginner',
    database: 'aperture',
    title: 'Aperture gauntlet',
    blurb: 'A timed screen over the whole beginner band: reading tables, filtering, shaping, grouping, and a join.',
    questions: 6,
    minutes: 20,
    pass: 5
  },
  {
    id: 'gt-sideline',
    level: 'intermediate',
    database: 'sideline',
    title: 'Sideline gauntlet',
    blurb: 'A timed screen over the intermediate band: joins, subqueries, dates, CASE, and window functions.',
    questions: 6,
    minutes: 30,
    pass: 5
  },
  {
    id: 'gt-rove',
    level: 'advanced',
    database: 'rove',
    title: 'Rove gauntlet',
    blurb: 'A timed screen over the advanced band: messy-data cleanup, dedup, ranking, funnels, and temporal logic.',
    questions: 6,
    minutes: 40,
    pass: 5
  }
];

export function gauntletById(id: string | undefined): GauntletConfig | undefined {
  return GAUNTLETS.find((g) => g.id === id);
}

// Same LCG family as the checkpoint shuffle: deterministic for a given seed, so a rerun
// with the same attempt count shows the same paper, and the next attempt shows a new one.
function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// One exercise per skill, distinct skills, across the band's phases in shuffled order.
// Falls back below `questions` only if the band has fewer skills than that.
export function drawGauntletQuestions(track: Track, config: GauntletConfig, seed: number): Exercise[] {
  const rand = lcg(seed * 2654435761 + config.id.length);
  const bandSkills = track.phases
    .filter((phase) => phaseBand(phase) === config.level)
    .flatMap((phase) => phase.concepts.map((concept) => concept.skill));
  const bySkill = new Map<string, Exercise[]>();
  for (const exercise of track.exercises) {
    if (!bandSkills.includes(exercise.skill as string)) continue;
    const list = bySkill.get(exercise.skill as string) || [];
    list.push(exercise);
    bySkill.set(exercise.skill as string, list);
  }
  const skills = shuffled([...bySkill.keys()], rand).slice(0, config.questions);
  return skills.map((skill) => {
    const pool = bySkill.get(skill) as Exercise[];
    return pool[Math.floor(rand() * pool.length)];
  });
}

const EMPTY_RECORD: GauntletRecord = { attempts: 0, bestScore: 0, history: [] };

export function gauntletRecord(state: LearningState, id: string): GauntletRecord {
  const raw = state.gauntlets?.[id];
  if (!raw || typeof raw !== 'object') return { ...EMPTY_RECORD, history: [] };
  return {
    attempts: Number.isFinite(raw.attempts) ? raw.attempts : 0,
    bestScore: Number.isFinite(raw.bestScore) ? raw.bestScore : 0,
    history: Array.isArray(raw.history) ? raw.history : []
  };
}

export function gauntletPassed(record: GauntletRecord, config: GauntletConfig): boolean {
  return record.bestScore >= config.pass;
}

// Mutating recorder in the style of the other record* helpers: callers wrap it in
// FoundationsContext.update() so the state persists and syncs.
export function recordGauntletRun(state: LearningState, id: string, run: GauntletRun): LearningState {
  const current = gauntletRecord(state, id);
  const next: GauntletRecord = {
    attempts: current.attempts + 1,
    bestScore: Math.max(current.bestScore, run.score),
    history: [...current.history, run].slice(-8)
  };
  state.gauntlets = { ...(state.gauntlets || {}), [id]: next };
  return state;
}
