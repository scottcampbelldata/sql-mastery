import type { DraftInterviewProblem, InterviewProblem, PublicInterviewProblem } from './types';
import { APERTURE_INTERVIEW } from './aperture';
import { SIDELINE_INTERVIEW } from './sideline';
import { ROVE_INTERVIEW } from './rove';
import { INTERVIEW_FINGERPRINTS } from './fingerprints.generated';

export type { DraftInterviewProblem, InterviewProblem, PublicInterviewProblem };

export const INTERVIEW_DRAFTS: DraftInterviewProblem[] = [
  ...APERTURE_INTERVIEW,
  ...SIDELINE_INTERVIEW,
  ...ROVE_INTERVIEW
];

// Only problems that have a baked fingerprint (i.e. passed validation) are served.
export function getInterviewProblems(): InterviewProblem[] {
  return INTERVIEW_DRAFTS
    .filter((problem) => INTERVIEW_FINGERPRINTS[problem.id])
    .map((problem) => ({ ...problem, fingerprint: INTERVIEW_FINGERPRINTS[problem.id] }));
}

export function getInterviewProblem(id: string): InterviewProblem | undefined {
  return getInterviewProblems().find((problem) => problem.id === id);
}

// Public metadata only: no expectedSql / modelAnswer / approachNote / fingerprint.
export function publicInterview(): PublicInterviewProblem[] {
  return getInterviewProblems().map((p) => ({
    id: p.id,
    database: p.database,
    level: p.level,
    pattern: p.pattern,
    difficulty: p.difficulty,
    scenario: p.scenario,
    task: p.task
  }));
}

// Served on demand when the learner reveals the answer or gives up.
export function interviewSolution(id: string): { modelAnswer: string; approachNote: string; pattern?: string } | undefined {
  const problem = getInterviewProblem(id);
  if (!problem) return undefined;
  return { modelAnswer: problem.modelAnswer, approachNote: problem.approachNote, pattern: problem.pattern };
}
