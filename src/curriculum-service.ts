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

function buildCurriculum() {
  const learningPath = getLearningPath();
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
    learningPath,
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
