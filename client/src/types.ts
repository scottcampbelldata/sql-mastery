export type Level = 'beginner' | 'intermediate' | 'advanced';
export type ScaffoldTier = 'full' | 'half' | 'blank';

export interface StarterSql {
  full: string;
  half: string;
  blank: string;
}

export type ExerciseStarterSql = string | StarterSql;

export interface Exercise {
  id: string;
  title?: string;
  task?: string;
  database?: string;
  level?: Level;
  hint?: string;
  dedupeKey?: string;
  expectedSql?: string;
  starterSql?: ExerciseStarterSql;
  blankMap?: Record<ScaffoldTier, Record<string, string>>;
  orderMatters?: boolean;
  rowCeiling?: number;
  fingerprint?: unknown;
  solutionNote?: string;
  workedExample?: string;
  checkable?: boolean;
  skill?: string;
  moduleId?: string;
  moduleTitle?: string;
  stage?: string;
  sourceFile?: string;
}

export interface TeachExample {
  sql: string;
  note?: string;
}

export interface Teach {
  plain: string;
  mentalModel: string;
  example: TeachExample;
  whyWhen?: string;
  watchOut?: string;
  interviewNote?: string;
  interviewPattern?: string;
}

export interface Concept {
  id: string;
  order: number;
  skill: string;
  title: string;
  teach?: Teach;
  exercises: Exercise[];
  phaseId?: string;
  level?: Level;
  database?: string;
}

export interface Checkpoint {
  id: string;
  afterOrder: number;
  drawFromSkills?: string[];
  title: string;
  phaseId?: string;
  level?: Level;
  database?: string;
}

export interface Phase {
  id: string;
  order: number;
  title: string;
  goal?: string;
  level: Level;
  database: string;
  concepts: Concept[];
  checkpoints: Checkpoint[];
}

export interface SkillRef {
  skill: string;
  conceptId: string;
  title: string;
  order: number;
  phaseId?: string;
  level?: Level;
  database?: string;
}

export interface Track {
  dataset?: string;
  phases: Phase[];
  skills: SkillRef[];
  concepts: Concept[];
  checkpoints: Checkpoint[];
  exercises: Exercise[];
}

export interface Curriculum {
  product: {
    name: string;
    promise: string;
    cadence: string;
    bands?: Array<{
      level: Level;
      database: string;
      title: string;
      story: string;
      phaseCount?: number;
      conceptCount?: number;
    }>;
  };
  learningPath: Track;
  stats: Record<string, number>;
}

// One finished gauntlet run. Whether a gauntlet is passed is always derived from
// bestScore (never stored as a flag) so the union/max cross-device merge in sync.ts can
// only improve a record, never regress it.
export interface GauntletRun {
  score: number;
  total: number;
  seconds: number;
  at: number;
}

export interface GauntletRecord {
  attempts: number;
  bestScore: number;
  history: GauntletRun[];
}

export interface LearningState {
  skillCorrect: Record<string, string[]>;
  attempts: Record<string, number>;
  lastSql: Record<string, string>;
  lastPracticedSession: Record<string, number>;
  checkpointsPassed: string[];
  sessionCounter: number;
  reviewsPassed: Record<string, number>;
  maxUnlockedOrder: number;
  gauntlets?: Record<string, GauntletRecord>;
}

export type DbSchemaMap = Record<string, string[]>;

export interface SchemaColumn { name: string; type?: string }
export interface SchemaTable { name: string; columns?: SchemaColumn[] }
export interface SchemaResponse { tables?: SchemaTable[] }

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount?: number;
}

export interface SqlDiff {
  reason: 'columns' | 'row-count' | 'row-values';
  yourColumns?: string[];
  expectedColumns?: string[];
  yourRowCount: number;
  expectedRowCount: number;
  orderOnly: boolean;
  extraRows: number;
  missingRows: number;
}

export interface Coaching {
  label: string;
  text: string;
}

export interface CheckResponse {
  correct: boolean;
  message?: string;
  why?: string;
  hint?: string;
  feedbackType?: string;
  result?: QueryResult | null;
  diff?: SqlDiff;
  coaching?: Coaching;
}

export interface PublicInterviewProblem {
  id: string;
  database: string;
  level: string;
  pattern?: string;
  difficulty: number;
  scenario: string;
  task: string;
}

export interface InterviewSolution {
  modelAnswer: string;
  approachNote: string;
  pattern?: string;
}

export interface Feedback {
  tone?: string;
  toneClass?: string;
  title: string;
  message: string;
  diff?: SqlDiff | null;
}

export interface ApiError extends Error {
  code?: string;
  hint?: string;
  position?: string;
  detail?: string;
}
