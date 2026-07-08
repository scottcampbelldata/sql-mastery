import {
  APERTURE_CHECKPOINTS,
  APERTURE_CONCEPT_META,
  APERTURE_PHASES,
  APERTURE_SKILLS,
  APERTURE_TEMPLATES
} from './templates/aperture/index';
import {
  SIDELINE_CHECKPOINTS,
  SIDELINE_CONCEPT_META,
  SIDELINE_PHASES,
  SIDELINE_SKILLS,
  SIDELINE_TEMPLATES
} from './templates/sideline/index';
import {
  ROVE_CHECKPOINTS,
  ROVE_CONCEPT_META,
  ROVE_PHASES,
  ROVE_SKILLS,
  ROVE_TEMPLATES
} from './templates/rove/index';
import type { DraftExercise } from './types';

type CurriculumDatabase = 'aperture' | 'sideline' | 'rove';

const REGISTRIES = {
  aperture: {
    templates: APERTURE_TEMPLATES,
    skills: APERTURE_SKILLS,
    conceptMeta: APERTURE_CONCEPT_META,
    phases: APERTURE_PHASES,
    checkpoints: APERTURE_CHECKPOINTS
  },
  sideline: {
    templates: SIDELINE_TEMPLATES,
    skills: SIDELINE_SKILLS,
    conceptMeta: SIDELINE_CONCEPT_META,
    phases: SIDELINE_PHASES,
    checkpoints: SIDELINE_CHECKPOINTS
  },
  rove: {
    templates: ROVE_TEMPLATES,
    skills: ROVE_SKILLS,
    conceptMeta: ROVE_CONCEPT_META,
    phases: ROVE_PHASES,
    checkpoints: ROVE_CHECKPOINTS
  }
} satisfies Record<CurriculumDatabase, unknown>;

export async function buildAllExercises(): Promise<Record<CurriculumDatabase, DraftExercise[]>> {
  return {
    aperture: await buildExercisesFor('aperture'),
    sideline: await buildExercisesFor('sideline'),
    rove: await buildExercisesFor('rove')
  };
}

export async function buildExercisesFor(database: string): Promise<DraftExercise[]> {
  const registry = REGISTRIES[database as CurriculumDatabase];
  void registry;
  return [];
}
