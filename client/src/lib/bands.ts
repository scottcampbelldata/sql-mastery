import { levelBaseTier, type Level as FoundationLevel, type ScaffoldTier } from './foundations';
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
  full: 'Scaffold: fill in the blanks',
  half: 'Scaffold: half blanked',
  blank: 'Scaffold: write it from memory'
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
