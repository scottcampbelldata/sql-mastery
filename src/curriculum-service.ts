import { getLearningPath } from './learning-path';

// The HTML "academy" workbook (content/*.html), the StackOverflow identifier
// adapter, the schema-orientation set, the expansion packs, and the week/session
// scheduler have all been retired. This is a minimal compiling stub: Task 17
// rebuilds the three-band return shape ({ product, learningPath, stats }) on top
// of getLearningPath(). Do not add fields here; that is Task 17's job.
function buildCurriculum(_options: any = {}) {
  return {
    learningPath: getLearningPath()
  };
}

export {
  buildCurriculum
};
