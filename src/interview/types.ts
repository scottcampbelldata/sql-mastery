import type { Fingerprint } from '../fingerprint';
export type { Fingerprint };

export type InterviewDb = 'aperture' | 'sideline' | 'rove';
export type InterviewLevel = 'beginner' | 'intermediate' | 'advanced';

// Hand-authored, business-framed, unscaffolded interview problem (pre-fingerprint).
export interface DraftInterviewProblem {
  id: string;
  database: InterviewDb;
  level: InterviewLevel;
  pattern?: string;
  difficulty: 1 | 2 | 3;
  scenario: string;       // the business framing
  task: string;           // the precise, gradeable ask (output columns + sort)
  expectedSql: string;    // canonical answer, validated + fingerprinted at build time
  modelAnswer: string;    // idiomatic solution shown on reveal
  approachNote: string;   // why this approach + common wrong turns
  orderMatters: boolean;
  rowCeiling: number;     // bound the result (<= 200)
}

export interface InterviewProblem extends DraftInterviewProblem {
  fingerprint: Fingerprint;
}

// Public payload: no expectedSql / modelAnswer / approachNote / fingerprint.
export interface PublicInterviewProblem {
  id: string;
  database: InterviewDb;
  level: InterviewLevel;
  pattern?: string;
  difficulty: number;
  scenario: string;
  task: string;
}
