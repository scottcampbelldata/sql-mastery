import type { Checkpoint, Concept, Phase } from '../../generator/types';
import {
  APERTURE_CHECKPOINTS,
  APERTURE_CONCEPT_META,
  APERTURE_PHASES
} from '../../generator/templates/aperture/index';
import { GENERATED_EXERCISES as APERTURE_EXERCISES } from './exercises.generated';

function buildAperturePhases(): Phase[] {
  return [...APERTURE_PHASES]
    .sort((a, b) => a.order - b.order)
    .map((phaseMeta): Phase => {
      const concepts: Concept[] = APERTURE_CONCEPT_META
        .filter((meta) => meta.phaseId === phaseMeta.id)
        .sort((a, b) => a.order - b.order)
        .map((meta): Concept => ({
          id: `concept:${meta.skill}`,
          order: meta.order,
          skill: meta.skill,
          title: meta.title,
          teach: meta.teach,
          exercises: APERTURE_EXERCISES[meta.skill] ?? [],
          phaseId: phaseMeta.id
        }));

      const checkpoints: Checkpoint[] = APERTURE_CHECKPOINTS
        .filter((checkpoint) => checkpoint.phaseId === phaseMeta.id)
        .sort((a, b) => a.afterOrder - b.afterOrder || a.id.localeCompare(b.id))
        .map((checkpoint): Checkpoint => ({
          id: checkpoint.id,
          afterOrder: checkpoint.afterOrder,
          drawFromSkills: checkpoint.drawFromSkills,
          title: checkpoint.title
        }));

      return {
        id: phaseMeta.id,
        order: phaseMeta.order,
        title: phaseMeta.title,
        goal: phaseMeta.goal,
        level: phaseMeta.level,
        database: 'aperture',
        concepts,
        checkpoints
      };
    });
}

export const aperturePhases: Phase[] = buildAperturePhases();
