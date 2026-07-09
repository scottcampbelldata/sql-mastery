import { aperturePhases } from './phases/aperture';
import { sidelinePhases } from './phases/sideline';
import { rovePhases } from './phases/rove';
import type { Level, Phase } from './generator/types';

const STRONG_THRESHOLD = 3;

export interface GraduationState {
  skillCorrect: Record<string, string[]>;
  checkpointsPassed: string[];
}

export function getPhases(): Phase[] {
  return [...aperturePhases, ...sidelinePhases, ...rovePhases].sort((a, b) => a.order - b.order);
}

export function flattenLearningPath(phases: Phase[]) {
  const concepts: any[] = [];
  const checkpoints: any[] = [];
  let offset = 0;

  for (const phase of [...phases].sort((a, b) => a.order - b.order)) {
    phase.concepts.forEach((concept) => {
      concepts.push({
        ...concept,
        order: concept.order + offset,
        phaseId: phase.id,
        level: phase.level,
        database: phase.database
      });
    });

    phase.checkpoints.forEach((checkpoint) => {
      checkpoints.push({
        ...checkpoint,
        afterOrder: checkpoint.afterOrder + offset,
        phaseId: phase.id,
        level: phase.level,
        database: phase.database
      });
    });

    offset += phase.concepts.length;
  }

  const skills = concepts.map((concept) => ({
    skill: concept.skill,
    conceptId: concept.id,
    title: concept.title,
    order: concept.order,
    phaseId: concept.phaseId,
    level: concept.level,
    database: concept.database
  }));
  const exercises = concepts.flatMap((concept) => concept.exercises);
  return { skills, concepts, checkpoints, exercises };
}

export function getLearningPath() {
  const phases = getPhases().map((phase) => ({
    id: phase.id,
    order: phase.order,
    title: phase.title,
    goal: phase.goal,
    level: phase.level,
    database: phase.database,
    concepts: phase.concepts,
    checkpoints: phase.checkpoints
  }));
  const flat = flattenLearningPath(phases);

  return {
    dataset: 'three-band',
    phases: phases.map((phase, index) => {
      const before = phases.slice(0, index).reduce((sum, prior) => sum + prior.concepts.length, 0);
      return {
        id: phase.id,
        order: phase.order,
        title: phase.title,
        goal: phase.goal,
        level: phase.level,
        database: phase.database,
        concepts: phase.concepts.map((concept) => ({
          ...concept,
          order: concept.order + before,
          phaseId: phase.id,
          level: phase.level,
          database: phase.database
        })),
        checkpoints: phase.checkpoints.map((checkpoint) => ({
          ...checkpoint,
          afterOrder: checkpoint.afterOrder + before,
          phaseId: phase.id,
          level: phase.level,
          database: phase.database
        }))
      };
    }),
    ...flat
  };
}

export function graduationStatus(
  track: ReturnType<typeof getLearningPath>,
  state: GraduationState,
  level?: Level
): { strongSkills: number; totalSkills: number; checkpointsPassed: string[]; graduated: boolean } {
  const skills = (track.skills as any[]).filter((skill) => !level || skill.level === level);
  const checkpoints = (track.checkpoints as any[]).filter((checkpoint) => !level || checkpoint.level === level);
  const correctCount = (skill: string) => (state.skillCorrect[skill] || []).length;
  const strongSkills = skills.filter((skill) => correctCount(skill.skill) >= STRONG_THRESHOLD).length;
  const totalSkills = skills.length;
  const checkpointsPassed = checkpoints
    .filter((checkpoint) => state.checkpointsPassed.includes(checkpoint.id))
    .map((checkpoint) => checkpoint.id);
  const allCheckpoints = checkpoints.every((checkpoint) => state.checkpointsPassed.includes(checkpoint.id));

  return {
    strongSkills,
    totalSkills,
    checkpointsPassed,
    graduated: totalSkills > 0 && strongSkills === totalSkills && allCheckpoints
  };
}
