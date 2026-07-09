import type { Checkpoint, Concept, Phase } from '../../generator/types';
import {
  ROVE_CHECKPOINTS,
  ROVE_CONCEPT_META,
  ROVE_PHASES
} from '../../generator/templates/rove/index';
import { APERTURE_PHASES } from '../../generator/templates/aperture/index';
import { SIDELINE_PHASES } from '../../generator/templates/sideline/index';
import { GENERATED_EXERCISES as ROVE_EXERCISES } from './exercises.generated';

const DATABASE = 'rove';
const BAND_OFFSET = APERTURE_PHASES.length + SIDELINE_PHASES.length;

function buildRovePhases(): Phase[] {
  return [...ROVE_PHASES]
    .sort((a, b) => a.order - b.order)
    .map((phaseMeta): Phase => {
      const concepts: Concept[] = ROVE_CONCEPT_META
        .filter((meta) => meta.phaseId === phaseMeta.id)
        .sort((a, b) => a.order - b.order)
        .map((meta): Concept => {
          const exercises = ROVE_EXERCISES[meta.skill];
          if (!exercises || exercises.length === 0) {
            throw new Error(
              `rove assembly: no generated exercises for skill ${meta.skill}; ` +
                're-run npm run generate-exercises -- --db rove'
            );
          }
          return {
            id: `concept:${meta.skill}`,
            order: meta.order,
            skill: meta.skill,
            title: meta.title,
            teach: meta.teach,
            exercises,
            phaseId: phaseMeta.id
          };
        });

      const checkpoints: Checkpoint[] = ROVE_CHECKPOINTS
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
        order: BAND_OFFSET + phaseMeta.order,
        title: phaseMeta.title,
        goal: phaseMeta.goal,
        level: phaseMeta.level,
        database: DATABASE,
        concepts,
        checkpoints
      };
    });
}

export const rovePhases: Phase[] = buildRovePhases();
