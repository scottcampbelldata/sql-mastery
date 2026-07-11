import { levelBaseTier, type Level as FoundationLevel, type ScaffoldTier, type ScaffoldCtx } from './foundations';
import { phaseGraduation } from './learning-path';
import type { LearningState, Phase } from '../types';

export type BandLevel = 'beginner' | 'intermediate' | 'advanced';

export const BAND_ORDER: BandLevel[] = ['beginner', 'intermediate', 'advanced'];

export interface BandMeta {
  level: BandLevel;
  title: string;
  badge: string;
  dataset: string;
  blurb: string;
}

export const BAND_META: Record<BandLevel, BandMeta> = {
  beginner: {
    level: 'beginner',
    title: 'Beginner',
    badge: 'Aperture',
    dataset: 'aperture',
    blurb: 'Single-table foundations on the Aperture catalog.'
  },
  intermediate: {
    level: 'intermediate',
    title: 'Intermediate',
    badge: 'Sideline',
    dataset: 'sideline',
    blurb: 'Joins, subqueries, and windows on the Sideline league data.'
  },
  advanced: {
    level: 'advanced',
    title: 'Advanced',
    badge: 'Rove',
    dataset: 'rove',
    blurb: 'Real-world cleanup and analytics on the Rove marketplace data.'
  }
};

const TIER_LABEL: Record<ScaffoldTier, string> = {
  full: 'Fill in the blanks',
  half: 'Fewer hints',
  blank: 'From memory'
};

export interface BandGroup {
  meta: BandMeta;
  phases: Phase[];
  locked: boolean;
  strong: number;
  total: number;
  complete: boolean;
}

export function phaseBand(phase: Pick<Phase, 'level' | 'database'>): BandLevel {
  if (phase.level === 'beginner' || phase.level === 'intermediate' || phase.level === 'advanced') {
    return phase.level;
  }
  if (phase.database === 'sideline') return 'intermediate';
  if (phase.database === 'rove') return 'advanced';
  return 'beginner';
}

export function bandCapstoneId(phases: Phase[]): string | undefined {
  const checkpoints = phases.flatMap((phase) => phase.checkpoints);
  if (!checkpoints.length) return undefined;
  return [...checkpoints].sort((a, b) => b.afterOrder - a.afterOrder)[0].id;
}

export function bandCapstonePassed(phases: Phase[], state: LearningState): boolean {
  const id = bandCapstoneId(phases);
  return id === undefined ? true : state.checkpointsPassed.includes(id);
}

export function bandGroups(phases: Phase[], state: LearningState): BandGroup[] {
  const byLevel: Record<BandLevel, Phase[]> = { beginner: [], intermediate: [], advanced: [] };
  phases.forEach((phase) => byLevel[phaseBand(phase)].push(phase));
  BAND_ORDER.forEach((level) => byLevel[level].sort((a, b) => a.order - b.order));

  const groups: BandGroup[] = [];
  let priorPassed = true;
  for (const level of BAND_ORDER) {
    const bandPhases = byLevel[level];
    const rollup = bandPhases.reduce(
      (acc, phase) => {
        const phaseStatus = phaseGraduation(phase, state);
        return {
          strong: acc.strong + phaseStatus.strong,
          total: acc.total + phaseStatus.total,
          complete: acc.complete && phaseStatus.complete
        };
      },
      { strong: 0, total: 0, complete: true }
    );

    groups.push({
      meta: BAND_META[level],
      phases: bandPhases,
      locked: !priorPassed,
      strong: rollup.strong,
      total: rollup.total,
      complete: bandPhases.length > 0 && rollup.complete
    });
    priorPassed = priorPassed && bandCapstonePassed(bandPhases, state);
  }
  return groups;
}

export function bandTierLabel(group: BandGroup): string {
  return TIER_LABEL[levelBaseTier(group.meta.level as FoundationLevel)];
}

// Scaffold context for a skill: its band level, whether the learner has earned that band's
// reduced-help floor (every prior band capstone passed), and whether this is their first
// exposure to the skill (no correct solutions yet). This wires the fade the product
// promises - beginner lessons stay fully scaffolded, intermediate fades to fewer hints,
// advanced works from memory - into lesson reps, focused practice, and checkpoints.
// Returns undefined when the skill has no band (ctx-less callers keep today's behavior).
export function scaffoldCtxFor(phases: Phase[] | undefined, state: LearningState, skill: string): ScaffoldCtx | undefined {
  const phase = (phases || []).find((p) => (p.concepts || []).some((concept) => concept.skill === skill));
  if (!phase) return undefined;
  const level = phaseBand(phase);
  const group = bandGroups(phases || [], state).find((g) => g.meta.level === level);
  return {
    level,
    priorBandCapstonePassed: group ? !group.locked : true,
    firstExposure: (state.skillCorrect[skill] || []).length === 0
  };
}
