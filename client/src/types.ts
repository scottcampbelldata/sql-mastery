// Shared domain types for the SQL Mastery client. Kept broad where the server sends
// loosely shaped data and different sources populate different field subsets; tightened
// where the client relies on structure. Runtime data crossing the API boundary is cast
// to these shapes in lib/api.ts.

export interface CompletionRecord {
  completedAt: string;
  attempts: number;
}

// Product progress persisted to localStorage.
export interface Progress {
  completed: Record<string, CompletionRecord>;
  attempts: Record<string, number>;
  lastSql: Record<string, string>;
}

// An exercise parsed from lesson content or defined in a learning-path phase. Most
// fields are optional because the schema-recon, curriculum, expansion, and phase
// sources each populate a different subset.
export interface Exercise {
  id: string;
  title?: string;
  task?: string;
  database?: string;
  level?: string;
  hint?: string;
  expectedSql?: string;
  starterSql?: string;
  solutionNote?: string;
  workedExample?: string;
  checkable?: boolean;
  skill?: string;
  moduleId?: string;
  moduleTitle?: string;
  stage?: string;
  sourceFile?: string;
}

export interface Session {
  id: string;
  sequence?: number;
  week?: number;
  day?: number;
  moduleId?: string;
  moduleTitle?: string;
  stage?: string;
  title: string;
  durationMinutes?: number;
  type?: string;
  goal?: string;
  exerciseIds: string[];
}

export interface Week {
  id: string;
  number: number;
  title: string;
  outcome?: string;
  sessions: string[];
  minutes?: number;
}

export interface TeachExample {
  sql: string;
  note?: string;
}

export interface Teach {
  plain: string;
  mentalModel: string;
  example: TeachExample;
}

export interface Concept {
  id: string;
  order: number;
  skill: string;
  title: string;
  teach?: Teach;
  exercises: Exercise[];
  phaseId?: string;
}

export interface Checkpoint {
  id: string;
  afterOrder: number;
  drawFromSkills?: string[];
  title: string;
  phaseId?: string;
}

export interface Phase {
  id: string;
  order: number;
  title: string;
  goal?: string;
  concepts: Concept[];
  checkpoints: Checkpoint[];
}

export interface SkillRef {
  skill: string;
  conceptId: string;
  title: string;
  order: number;
  phaseId?: string;
}

// The flattened learning-path track the foundations engine consumes.
export interface Track {
  dataset?: string;
  phases: Phase[];
  skills: SkillRef[];
  concepts: Concept[];
  checkpoints: Checkpoint[];
  exercises: Exercise[];
}

export interface Curriculum {
  product: { name: string; promise: string; cadence: string };
  weeks: Week[];
  sessions: Session[];
  exercises: Exercise[];
  learningPath: Track;
  stats: Record<string, number>;
}

// Foundations / learning progression state persisted to localStorage.
export interface LearningState {
  skillCorrect: Record<string, string[]>;
  attempts: Record<string, number>;
  lastSql: Record<string, string>;
  lastPracticedSession: Record<string, number>;
  checkpointsPassed: string[];
  sessionCounter: number;
}

// A { tableName: columnNames[] } map for editor autocomplete and the schema browser.
export type DbSchemaMap = Record<string, string[]>;

export interface SchemaColumn { name: string; type?: string }
export interface SchemaTable { name: string; columns?: SchemaColumn[] }
export interface SchemaResponse { tables?: SchemaTable[] }

// Result set returned by /api/query and /api/check. Rows are pg row objects keyed by
// column name (DataTable reads row[columnName]).
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

export interface CheckResponse {
  correct: boolean;
  message?: string;
  why?: string;
  hint?: string;
  feedbackType?: string;
  result?: QueryResult | null;
  diff?: SqlDiff;
}

// A UI feedback banner. Session uses `tone`; the foundations hook uses `toneClass`.
export interface Feedback {
  tone?: string;
  toneClass?: string;
  title: string;
  message: string;
  diff?: SqlDiff | null;
}

// A fetch error decorated with server-provided fields.
export interface ApiError extends Error {
  code?: string;
  hint?: string;
  position?: string;
  detail?: string;
}
