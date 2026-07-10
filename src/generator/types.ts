import type { Fingerprint } from '../fingerprint';

export type { Fingerprint };

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type ScaffoldTier = 'full' | 'half' | 'blank';

export interface StarterSql {
  full: string;
  half: string;
  blank: string;
}

export type BlankMap = Record<ScaffoldTier, Record<string, string>>;

export interface Exercise {
  id: string;
  skill: string;
  database: string;
  task: string;
  starterSql: StarterSql;
  blankMap: BlankMap;
  hint: string;
  expectedSql: string;
  orderMatters: boolean;
  rowCeiling: number;
  fingerprint: Fingerprint;
}

export type DraftExercise = Omit<Exercise, 'fingerprint'>;

export interface TeachBlock {
  plain: string;
  mentalModel: string;
  example: { sql: string; note: string };
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
  teach: TeachBlock;
  exercises: Exercise[];
  phaseId?: string;
}

export interface Checkpoint {
  id: string;
  afterOrder: number;
  drawFromSkills: string[];
  title: string;
}

export interface Phase {
  id: string;
  order: number;
  title: string;
  goal: string;
  level: Level;
  database: string;
  concepts: Concept[];
  checkpoints: Checkpoint[];
}

export interface ConceptMeta {
  skill: string;
  order: number;
  title: string;
  teach: TeachBlock;
  phaseId: string;
}

export interface PhaseMeta {
  id: string;
  title: string;
  goal: string;
  level: Level;
  order: number;
}

export interface CheckpointMeta {
  id: string;
  phaseId: string;
  afterOrder: number;
  drawFromSkills: string[];
  title: string;
}

export type SlotKind =
  | 'table' | 'column' | 'projection' | 'literal'
  | 'groupCols' | 'sortKey' | 'partitionCols' | 'rankKey' | 'limit';

export interface Slot {
  name: string;
  kind: SlotKind;
  table?: string;
  op?: string;
  col?: string;
  sampleStrategy?: string;
}

export interface BindingRule {
  slot: string;
  predicate: (value: string, catalog: any) => boolean;
}

export interface ScaffoldPlan {
  full: 'all-value-slots';
  half: 'harder-half';
  blank: 'whole-clauses';
}

export interface GateHints {
  minRows: number;
  minDistinct: number;
  rowCeiling: number;
  orderMatters: boolean;
  boundedSlice: boolean;
}

export interface Template {
  skill: string;
  database: string;
  family: string;
  primaryTable?: string;
  sqlShape: string;
  slots: Slot[];
  bindingRules: BindingRule[];
  phrasings: string[];
  hintTemplate: string;
  scaffoldPlan: ScaffoldPlan;
  // Blank the clause that actually carries the concept - the SELECT list, the FROM joins,
  // the WHERE filter, or the HAVING - in the full/half tiers, instead of the incidental
  // ORDER BY the deterministic emitter always adds. Most concepts are mapped centrally in
  // the scaffold module; this per-template override is for the SELECT-only beginner lessons.
  scaffoldFocus?: 'projection' | 'from' | 'where' | 'having';
  gateHints: GateHints;
}

export interface Binding {
  skill: string;
  database: string;
  bindingIndex: number;
  slots: Record<string, string>;
  literals: Record<string, string>;
}
