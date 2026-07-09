import type { Checkpoint, Concept, Phase } from '../../generator/types';
import {
  SIDELINE_CHECKPOINTS,
  SIDELINE_CONCEPT_META,
  SIDELINE_PHASES
} from '../../generator/templates/sideline/index';
import { APERTURE_PHASES } from '../../generator/templates/aperture/index';
import { GENERATED_EXERCISES as SIDELINE_EXERCISES } from './exercises.generated';

const DATABASE = 'sideline';
const BAND_OFFSET = APERTURE_PHASES.length;

function buildSidelinePhases(): Phase[] {
  return [...SIDELINE_PHASES]
    .sort((a, b) => a.order - b.order)
    .map((phaseMeta): Phase => {
      const concepts: Concept[] = SIDELINE_CONCEPT_META
        .filter((meta) => meta.phaseId === phaseMeta.id)
        .sort((a, b) => a.order - b.order)
        .map((meta): Concept => {
          const exercises = SIDELINE_EXERCISES[meta.skill];
          if (!exercises || exercises.length === 0) {
            throw new Error(
              `sideline assembly: no generated exercises for skill ${meta.skill}; ` +
                're-run npm run generate-exercises -- --db sideline'
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

      const checkpoints: Checkpoint[] = SIDELINE_CHECKPOINTS
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

export const sidelinePhases: Phase[] = buildSidelinePhases();
