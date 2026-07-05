const { foundationsPhase } = require('./phases/foundations');
const { joinsPhase } = require('./phases/joins');

// Ordered list of phases. Each phase's concepts use a LOCAL order (1..n) and its
// checkpoints a LOCAL afterOrder; flattening assigns global order by phase offset.
function getPhases() {
  return [foundationsPhase, joinsPhase];
}

// Flatten phases into the generic track the client engine consumes:
// { phases, skills, concepts, checkpoints, exercises } with globally-increasing
// concept.order and checkpoint.afterOrder, and phaseId stamped on each.
function flattenLearningPath(phases) {
  const concepts = [];
  const checkpoints = [];
  let offset = 0;
  for (const phase of [...phases].sort((a, b) => a.order - b.order)) {
    phase.concepts.forEach((c) => concepts.push({ ...c, order: c.order + offset, phaseId: phase.id }));
    phase.checkpoints.forEach((cp) => checkpoints.push({ ...cp, afterOrder: cp.afterOrder + offset, phaseId: phase.id }));
    offset += phase.concepts.length;
  }
  const skills = concepts.map((c) => ({ skill: c.skill, conceptId: c.id, title: c.title, order: c.order, phaseId: c.phaseId }));
  const exercises = concepts.flatMap((c) => c.exercises);
  return { skills, concepts, checkpoints, exercises };
}

function getLearningPath() {
  const phases = getPhases().map((p) => ({ id: p.id, order: p.order, title: p.title, goal: p.goal, concepts: p.concepts, checkpoints: p.checkpoints }));
  const flat = flattenLearningPath(phases);
  return {
    dataset: 'chinook',
    phases: phases.map((p, i) => {
      // stamp each phase's concepts/checkpoints with their global order for the UI
      const before = phases.slice(0, i).reduce((sum, q) => sum + q.concepts.length, 0);
      return {
        id: p.id, order: p.order, title: p.title, goal: p.goal,
        concepts: p.concepts.map((c) => ({ ...c, order: c.order + before, phaseId: p.id })),
        checkpoints: p.checkpoints.map((cp) => ({ ...cp, afterOrder: cp.afterOrder + before, phaseId: p.id }))
      };
    }),
    ...flat
  };
}

module.exports = { getLearningPath, flattenLearningPath, getPhases };
