import { getLearningPath } from './learning-path';

// Back-compat: the original getFoundations() returned { dataset, concepts, checkpoints, skills, exercises }.
// It now returns the full flattened learning path (same shape, more concepts).
function getFoundations() {
  return getLearningPath();
}

export { getFoundations };
