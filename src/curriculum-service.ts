import { createHash } from 'node:crypto';

import { getLearningPath } from './learning-path';
import type { Level } from './generator/types';

const BAND_COPY: Array<{
  level: Level;
  database: string;
  title: string;
  story: string;
}> = [
  {
    level: 'beginner',
    database: 'aperture',
    title: 'Beginner - Aperture',
    story: 'Build clean SQL fundamentals in a compact product-analytics database.'
  },
  {
    level: 'intermediate',
    database: 'sideline',
    title: 'Intermediate - Sideline',
    story: 'Practice joins, aggregation, and reporting tradeoffs across a sports-operations database.'
  },
  {
    level: 'advanced',
    database: 'rove',
    title: 'Advanced - Rove',
    story: 'Work through ranking, funnels, temporal logic, and messy analytics in a marketplace database.'
  }
];

function stripAnswerContract(exercise: any): any {
  if (!exercise || typeof exercise !== 'object') return exercise;
  const { expectedSql, fingerprint, blankMap, ...publicExercise } = exercise;
  const dedupeKey = typeof expectedSql === 'string'
    ? createHash('sha256').update(expectedSql.trim()).digest('hex')
    : publicExercise.dedupeKey;
  return dedupeKey ? { ...publicExercise, dedupeKey } : publicExercise;
}

function sanitizeConcept(concept: any): any {
  if (!concept || typeof concept !== 'object') return concept;
  return {
    ...concept,
    exercises: Array.isArray(concept.exercises) ? concept.exercises.map(stripAnswerContract) : concept.exercises
  };
}

function sanitizeLearningPath(path: any): any {
  return {
    ...path,
    phases: Array.isArray(path.phases)
      ? path.phases.map((phase: any) => ({
          ...phase,
          concepts: Array.isArray(phase.concepts) ? phase.concepts.map(sanitizeConcept) : phase.concepts
        }))
      : path.phases,
    concepts: Array.isArray(path.concepts) ? path.concepts.map(sanitizeConcept) : path.concepts,
    exercises: Array.isArray(path.exercises) ? path.exercises.map(stripAnswerContract) : path.exercises
  };
}

function buildCurriculum(options: { includeAnswerContracts?: boolean } = {}) {
  const learningPath = getLearningPath();
  const publicLearningPath = options.includeAnswerContracts ? learningPath : sanitizeLearningPath(learningPath);
  const phases = learningPath.phases || [];
  const concepts = learningPath.concepts || [];
  const exercises = learningPath.exercises || [];
  const checkpoints = learningPath.checkpoints || [];
  const bands = BAND_COPY.map((band) => {
    const bandPhases = phases.filter((phase) => phase.level === band.level && phase.database === band.database);
    const conceptCount = bandPhases.reduce((sum, phase) => sum + phase.concepts.length, 0);

    return {
      ...band,
      phaseCount: bandPhases.length,
      conceptCount
    };
  });

  return {
    product: {
      name: 'SQL Mastery',
      promise: 'Go from absolute beginner to senior-level SQL across three real PostgreSQL databases: Aperture, Sideline, and Rove.',
      cadence: 'Concept, practice, checkpoint, with scaffolding that fades as you graduate each band.',
      bands
    },
    learningPath: publicLearningPath,
    stats: {
      totalPhases: phases.length,
      totalConcepts: concepts.length,
      totalExercises: exercises.length,
      totalCheckpoints: checkpoints.length
    }
  };
}

export {
  buildCurriculum
};
