// Interview-readiness report, derived entirely from existing mastery state (no new
// tracking). Each concept is mastered (the same "strong" bar the engine uses), practicing
// (started but not yet strong), or not-started. Grouped by band -> phase for display.
import type { Concept, Phase, LearningState } from '../types';
import { conceptMastery, isConceptStrong } from './foundations';
import { BAND_ORDER, BAND_META, phaseBand, type BandLevel } from './bands';

export type ReadinessStatus = 'mastered' | 'practicing' | 'not-started';

export function conceptReadiness(
  state: LearningState,
  concept: Pick<Concept, 'skill' | 'exercises'>
): { status: ReadinessStatus; pct: number } {
  const mastery = conceptMastery(state, concept);
  if (isConceptStrong(state, concept)) return { status: 'mastered', pct: Math.max(mastery.pct, 100) };
  if (mastery.count > 0) return { status: 'practicing', pct: mastery.pct };
  return { status: 'not-started', pct: 0 };
}

export interface ConceptReadiness {
  concept: Concept;
  status: ReadinessStatus;
  pct: number;
}

export interface PhaseReadiness {
  id: string;
  title: string;
  concepts: ConceptReadiness[];
}

export interface BandReadiness {
  level: BandLevel;
  title: string;
  badge: string;
  mastered: number;
  practicing: number;
  total: number;
  pct: number; // mastered / total as a percent
  phases: PhaseReadiness[];
}

export function bandReadiness(phases: Phase[], state: LearningState, level: BandLevel): BandReadiness {
  const meta = BAND_META[level];
  const bandPhases = phases.filter((phase) => phaseBand(phase) === level);
  let mastered = 0;
  let practicing = 0;
  let total = 0;
  const phaseRows: PhaseReadiness[] = bandPhases.map((phase) => ({
    id: phase.id,
    title: phase.title,
    concepts: phase.concepts.map((concept) => {
      const r = conceptReadiness(state, concept);
      total += 1;
      if (r.status === 'mastered') mastered += 1;
      else if (r.status === 'practicing') practicing += 1;
      return { concept, status: r.status, pct: r.pct };
    })
  }));
  return {
    level,
    title: meta.title,
    badge: meta.badge,
    mastered,
    practicing,
    total,
    pct: total ? Math.round((mastered / total) * 100) : 0,
    phases: phaseRows
  };
}

export interface ReadinessReport {
  bands: BandReadiness[];
  mastered: number;
  total: number;
  pct: number;
}

export function readinessReport(phases: Phase[], state: LearningState): ReadinessReport {
  const bands = BAND_ORDER.map((level) => bandReadiness(phases, state, level));
  const mastered = bands.reduce((sum, band) => sum + band.mastered, 0);
  const total = bands.reduce((sum, band) => sum + band.total, 0);
  return { bands, mastered, total, pct: total ? Math.round((mastered / total) * 100) : 0 };
}
