# 3-Level Generator-Driven Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chinook/stackoverflow Foundations/Joins phases and the HTML academy with a generator-driven, fully validated three-level SQL curriculum (Beginner = Aperture, Intermediate = Sideline, Advanced = Rove) that takes a total beginner to senior data-analyst / BI interview readiness, with guidance that tapers as proficiency is demonstrated.

**Architecture:** A new `src/generator/` layer reads the real seeded Postgres schema, binds concept templates only to columns that exist, and emits `foundations.ts`-shaped phase modules whose exercises are validated against the seeded databases by a blocking G0-G9 harness. Grading is refactored to a precomputed result fingerprint so `expectedSql` never runs in production. Phases are banded by level with per-band capstone gating, and scaffold guidance tapers by a level floor composed with the existing fade. The engine (scaffold fade, spaced repetition, checkpoints, tile map, DB-backed grading) is reused unchanged.

**Tech Stack:** TypeScript (strict), Node `--test` on compiled `dist/`, Express, PostgreSQL via `pg`, React + Vite. Deterministic seeded PRNG from `src/datasets/framework/prng.ts`.

## Global Constraints

- ASCII only. No en dashes, em dashes, minus look-alikes, or unicode arrows in any file, code, or copy. ASCII hyphen and the two-char arrow (hyphen, greater-than) only. Hard project rule.
- Determinism: never use `Math.random`, `Date.now`, or argless `new Date`. Reuse the seeded PRNG (`mulberry32` / `deriveStream` / `fnv1a`) in `src/datasets/framework/prng.ts`; anchor dates with the existing `ANCHOR_MS` pattern.
- TypeScript strict. Server compiles with `tsc -p tsconfig.json` to `dist/`; server tests run as `node --test dist/test/*.test.js` (author `.test.ts` that compile into `dist/test`). Client is React + Vite strict TS.
- Grading and validation run against the LOCAL seeded Postgres (databases `aperture`, `sideline`, `rove` exist and are seeded). The DB password is supplied only as the `PGPASSWORD` env var at runtime and must NEVER be written into any file, test, or committed artifact.
- Skill ids are globally unique and namespaced `ap-` / `sl-` / `rv-`, 1:1 with concepts, asserted at build time.
- Grading uses the precomputed result fingerprint only; `expectedSql` never executes on the production grading path.
- Every Advanced (Rove) exercise is scoped to a single city and/or fixed date range with a hard `rowCeiling <= 200`.
- TDD with frequent commits: write the failing test, run it red, implement minimal code, run it green, commit.

---

## Authoritative Interface Contract

These names and types are binding across all tasks. Do not rename or invent alternatives.

CONTRACT v2 follows. This is the binding deliverable.

---

# CONTRACT v2: Curriculum 3-Level Generator - Single Binding Interface

Spec: `C:\Dev\Projects\sql-mastery\docs\superpowers\specs\2026-07-08-curriculum-3-level-design.md`
Supersedes contract v1. On any conflict, the encoded contract below governs.

This document is **verbatim law** for all 19 tasks (0-18). Authors may not rename, re-case, re-path, or invent alternatives to any symbol below.

## Global constraints (copy into any code you write)
- ASCII ONLY. ASCII hyphen `-` and the two-char arrow `->` only. No en/em dashes, minus look-alikes, or unicode arrows.
- Determinism: NEVER `Math.random`, `Date.now`, or argless `new Date`. Reuse `src/datasets/framework/prng.ts` (`mulberry32` / `deriveStream` / `fnv1a`). Anchor dates with `ANCHOR_MS`.
- CommonJS with extensionless relative imports. NEVER a `.js` suffix on a relative import. NEVER ESM JSON import assertions (`with { type: 'json' }`); load JSON via `fs.readFileSync` + `JSON.parse` or a `.ts` constant.
- Server tests live at top-level `test/<name>.test.ts`, compile to `dist/test/<name>.test.js`, run by `node --test dist/test/*.test.js`. NEVER `src/test`.
- TypeScript strict; server compiles `tsc -p tsconfig.json` to `dist/`. Client is React + Vite strict TS.
- Grading + validation run against LOCAL seeded Postgres (aperture, sideline, rove). Password is `PGPASSWORD` at runtime only; it MUST NOT appear in any file, test, or artifact.
- TDD with frequent commits: red, minimal green, commit.

---

## 1. Primitive types

Live in `src/generator/types.ts`.

```ts
// Level band. Used by Phase, ScaffoldCtx, levelBaseTier, graduationStatus.
export type Level = 'beginner' | 'intermediate' | 'advanced';

// Scaffold tiers. Help-scale ordering: full > half > blank (full = MOST help, blank = LEAST).
// Value strings match StarterSql keys and client lib/foundations.ts.
export type ScaffoldTier = 'full' | 'half' | 'blank';
```

---

## 2. Exercise / phase-tree types (`src/generator/types.ts`)

`src/generator/types.ts` is created by **T0** and is the SOLE home of these types. It re-exports `Fingerprint` from `src/fingerprint` (see section 3).

```ts
import type { Fingerprint } from '../fingerprint';
export type { Fingerprint };

// starterSql tiers. Keys are exactly full/half/blank (== ScaffoldTier values).
export interface StarterSql {
  full: string;   // keyword skeleton visible, every value slot blanked
  half: string;   // harder half blanked
  blank: string;  // whole clauses blanked
}

// blankMap[tier][blankToken] -> answerToken. Drives client tier fill + G8 fill-back verifier.
export type BlankMap = Record<ScaffoldTier, Record<string, string>>;

// The authoritative generated/hand-authored exercise. Field names the client already
// consumes (id, skill, database, task, hint, expectedSql) are UNCHANGED from today.
// starterSql moves from a bare string to the three-tier StarterSql object. New fields additive.
export interface Exercise {
  id: string;                 // deterministic hash of (skill, canonical binding)
  skill: string;              // globally-unique namespaced slug: ap-/sl-/rv- prefix
  database: string;           // 'aperture' | 'sideline' | 'rove' (per-exercise, from template)
  task: string;               // prompt; names exact output columns/aliases + tiebreak
  starterSql: StarterSql;     // three pre-generated tiers (was: string)
  blankMap: BlankMap;         // per-tier map of each blank token -> its answer token
  hint: string;               // hint text
  expectedSql: string;        // canonical deterministic answer, .trim()'d, stable ORDER BY
  orderMatters: boolean;      // true -> compare orderedRowHash; false -> unorderedRowHash
  rowCeiling: number;         // G3 hard cap on expectedSql rowCount (default 200; Advanced <= 200)
  fingerprint: Fingerprint;   // baked in by the validation harness (section 5, g9)
}

// Pre-fingerprint draft produced by assembleExercise(); harness attaches fingerprint.
export type DraftExercise = Omit<Exercise, 'fingerprint'>;

export interface TeachBlock {
  plain: string;
  mentalModel: string;
  example: { sql: string; note: string };
}

export interface Concept {
  id: string;
  order: number;            // LOCAL 1..n within its phase, contiguous, no gaps/dupes
  skill: string;            // namespaced ap-/sl-/rv-, globally unique, 1:1 with concept
  title: string;
  teach: TeachBlock;
  exercises: Exercise[];
  phaseId?: string;         // owning phase id
}

export interface Checkpoint {
  id: string;
  afterOrder: number;       // LOCAL concept order this checkpoint follows
  drawFromSkills: string[]; // skill slugs sampled; band capstone = all that band's skills
  title: string;
}

// Add level + database vs today's phase. All keys load-bearing.
export interface Phase {
  id: string;
  order: number;            // GLOBAL, unique, monotonic across bands (see invariant)
  title: string;
  goal: string;
  level: Level;             // 'beginner' | 'intermediate' | 'advanced'
  database: string;         // 'aperture' | 'sideline' | 'rove'
  concepts: Concept[];
  checkpoints: Checkpoint[];
}

// Per-concept authoring record owned by the per-dataset TEMPLATES task (section 7).
// Phase-assembly pairs one ConceptMeta with the generated exercises for its skill to build a Concept.
export interface ConceptMeta {
  skill: string;            // MUST be a member of the same dataset's <DB>_SKILLS
  order: number;            // LOCAL order within phaseId
  title: string;
  teach: TeachBlock;
  phaseId: string;          // which phase this concept belongs to
}
```

**phase.order invariant (all authors MUST preserve):**
- `getPhases()` returns phases pre-sorted ascending by `order`; array position == sorted position (required because `flattenLearningPath` sorts by `order` while `getLearningPath` computes `before` by raw array index; they agree only if already ascending).
- Contiguous monotonic bands: aperture `1..k`, sideline `k+1..m`, rove `m+1..n`.
- Local `concept.order` inside each phase is contiguous `1..count`; `checkpoint.afterOrder` references a valid local boundary. Do NOT pre-globalize; the flatten step adds the offset.

---

## 3. Fingerprint + positional hashing (`src/fingerprint.ts`)

Created by **T0**, at `src/` (NOT under `generator/`). This is the ONLY hashing/normalization module. `src/generator/types.ts` re-exports `Fingerprint`. `query-service.ts` imports hashing + normalization from here. One-way dependency: query-service -> fingerprint; generator -> fingerprint. No `src/generator/fingerprint.ts` exists.

```ts
export interface Fingerprint {
  columns: string[];        // ORDERED output column names (result.fields.map(f => f.name))
  rowCount: number;         // raw pg row count of expectedSql (== rows.length)
  orderedRowHash: string;   // sha256 hex over normalized rows IN result order (orderMatters)
  unorderedRowHash: string; // sha256 hex over the MULTISET of normalized rows (!orderMatters)
}

// Cell serialization (UNCHANGED from query-service normalizeCell semantics):
//   null/undefined -> null; Date -> toISOString(); Buffer -> base64;
//   object -> JSON.stringify(value); else -> String(value).
export function normalizeCell(value: unknown): string | null;

// Build positional (index-aligned) string rows from an array-mode QueryResult, so duplicate
// output column names cannot collapse. Requires rows fetched with rowMode 'array'.
export function toPositionalRows(result: {
  fields: { name: string }[];
  rows: unknown[][];
}): (string | null)[][];   // = result.rows.map(row => row.map(normalizeCell)), by INDEX

// One stable string per row: JSON.stringify of the positional (string|null)[] array.
export function rowKey(row: (string | null)[]): string; // = JSON.stringify(row)

// orderedRowHash: sha256 hex over rowKey(row) joined in result order.
// unorderedRowHash: sha256 hex over rowKey(row) sorted lexicographically (multiset-invariant).
export function hashRowsOrdered(rows: (string | null)[][]): string;
export function hashRowsUnordered(rows: (string | null)[][]): string;

// Whole fingerprint from an array-mode QueryResult.
export function buildFingerprint(result: {
  fields: { name: string }[];
  rows: unknown[][];        // array-mode rows (rowMode: 'array')
}): Fingerprint;
```

Hashing uses `node:crypto` `createHash('sha256')` over `rowKey`-stringified rows. `fnv1a` from `prng.ts` is reserved for PRNG stream derivation and id hashing, NOT fingerprints. `columns` come only from `result.fields`. Fingerprints are valid only across identical DB snapshots (enforced by g0).

---

## 4. Template DSL + emit/bind invariants (`src/generator/types.ts` + emit/bind)

### 4a. DSL types (in `src/generator/types.ts`)

```ts
// SlotKind union: EXACTLY these nine members (resolutions C.6). No other kinds exist.
export type SlotKind =
  | 'table' | 'column' | 'projection' | 'literal'
  | 'groupCols' | 'sortKey' | 'partitionCols' | 'rankKey' | 'limit';

// A slot. Literal slots additionally carry op + col (and optional sampleStrategy);
// there is NO lit:-prefixed slot-name scheme. Slot names are plain identifiers.
export interface Slot {
  name: string;              // referenced by sqlShape, phrasings, hintTemplate, scaffoldPlan
  kind: SlotKind;
  table?: string;            // when the slot is scoped to a table
  op?: string;               // literal slots: comparison/op context, e.g. '=', '>', 'BETWEEN', 'IN', 'LIKE'
  col?: string;              // literal slots: the column the DISTINCT probe samples from
  sampleStrategy?: string;   // literal slots: optional draw strategy, e.g. 'single' | 'compound-row'
}

// Predicate over a candidate binding value; false rejects the binding.
export interface BindingRule {
  slot: string;              // Slot.name this rule constrains
  predicate: (value: string, catalog: Catalog) => boolean;
}

// Per-tier blanking policy over tagged answer tokens produced by emit/scaffold.
export interface ScaffoldPlan {
  full: 'all-value-slots';
  half: 'harder-half';
  blank: 'whole-clauses';
}

export interface GateHints {
  minRows: number;           // feeds g2
  minDistinct: number;       // feeds g5 non-degeneracy
  rowCeiling: number;        // feeds g3 (Advanced templates MUST set <= 200)
  orderMatters: boolean;     // stamped onto the emitted Exercise
  boundedSlice: boolean;     // Advanced (rove) templates MUST set true
}

export interface Template {
  skill: string;             // namespaced ap-/sl-/rv-
  database: string;          // 'aperture' | 'sideline' | 'rove'
  family: string;            // 'single-table' | 'grouped' | 'windowed' | 'join' | ... (drives emit tiebreak)
  primaryTable?: string;     // optional; when no 'table' slot, bind derives the primary table from here or sqlShape
  sqlShape: string;          // parametrized SQL with {slot} placeholders; NO ORDER BY, NO ROUND
  slots: Slot[];
  bindingRules: BindingRule[];
  phrasings: string[];       // >= 2 natural-language variants
  hintTemplate: string;
  scaffoldPlan: ScaffoldPlan;
  gateHints: GateHints;
}

// One concrete binding of a template's slots.
export interface Binding {
  skill: string;
  database: string;
  bindingIndex: number;              // deterministic sampling index
  slots: Record<string, string>;     // Slot.name -> chosen identifier/table/expression
  literals: Record<string, string>;  // Slot.name -> real literal value (probe-drawn)
}
```

### 4b. emit / bind INVARIANTS (resolutions C; the root-cause fix, stated as rules)

1. `sqlShape` contains **NO ORDER BY** and **NO ROUND**. emit OWNS both.
2. emit appends **exactly one** deterministic tiebreak ORDER BY per family, reading FIXED slot names: `sortKey` (single-table), `groupCols` (grouped), `partitionCols` + `rankKey` (windowed). `pk` is derived from schema-catalog, NOT a slot. A missing required tiebreak slot is a template authoring error surfaced by a unit test, NOT a silent throw at generate time.
3. emit ensures every projected expression has a **UNIQUE `AS <alias>`**. Templates MAY omit `AS`; emit adds a deterministic unique alias. `SELECT *` is allowed for `ap-select-all` only and is exempt from aliasing.
4. emit wraps float/AVG aggregates in ROUND **exactly once**; it detects an existing ROUND and does NOT double-wrap. Templates never hand-write ROUND.
5. Literal slots are `{ kind: 'literal', op, col, sampleStrategy? }`. bind fills them from a `SELECT DISTINCT col` probe (or a co-occurring real row for compound AND/BETWEEN/IN). NO `lit:`-prefixed slot names.
6. A single-table template MAY hard-code the table in sqlShape and declare **no `table` slot**; bind derives the primary table from `template.primaryTable` or the sqlShape and MUST NOT throw when a `table` slot is absent.
7. The probe reads values positionally as `rows[i][0]` from `executeQuery({ database, sql, rowMode: 'array' })`.
8. Beginner aperture templates (T7) MUST follow this exact convention. T4 (emit) provides 2-3 fully worked reference templates so T7 conforms.

---

## 5. Generator + harness public function signatures (MODULE MAP names exactly)

### 5a. `src/generator/schema-catalog.ts` [T3]

```ts
export interface ColumnInfo {
  name: string;
  dataType: string;      // pg formatted_type / data_type from describeDatabase
  isNullable: boolean;
  isPrimaryKey: boolean;
}
export interface ForeignKey {
  fromTable: string; fromColumn: string;
  toTable: string;   toColumn: string;
}
export type JoinPair = ForeignKey;
export interface TableCatalog {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}
export interface Catalog {
  database: string;
  tables: TableCatalog[];
}

// Loader: reuse the query-service describeDatabase() method; binds only to names/types that exist.
export function loadCatalog(database: string): Promise<Catalog>;

export function numericCols(catalog: Catalog, table: string): ColumnInfo[];
export function textCols(catalog: Catalog, table: string): ColumnInfo[];
export function dateCols(catalog: Catalog, table: string): ColumnInfo[];
export function boolCols(catalog: Catalog, table: string): ColumnInfo[];
export function nullableCols(catalog: Catalog, table: string): ColumnInfo[];
export function pk(catalog: Catalog, table: string): string[];
export function fksFrom(catalog: Catalog, table: string): ForeignKey[];
export function fksTo(catalog: Catalog, table: string): ForeignKey[];
export function joinPairs(catalog: Catalog): JoinPair[];
```

### 5b. `src/generator/bind.ts` [T4]

```ts
// Live DISTINCT-probe used to draw REAL literals (and co-occurring compound literals).
// Backed by executeQuery({ database, sql, rowMode: 'array' }); values read as rows[i][0].
export type LiteralProbe = (sql: string) => Promise<(string | null)[][]>;

export function bindTemplate(
  template: Template,
  catalog: Catalog,
  probe: LiteralProbe
): Promise<Binding[]>;
// Enumerates the legal slot cross-product, rejects predicate failures, samples deterministically
// via deriveStream(seed, `${template.skill}:${bindingIndex}`) from prng.ts.
```

### 5c. `src/generator/emit.ts` [T4]

```ts
// Render final deterministic expectedSql. Per-family tiebreak ORDER BY, unique AS aliases,
// single ROUND wrap for float aggregates, determinism BY CONSTRUCTION (invariants 4b).
export function emitSql(template: Template, binding: Binding, catalog: Catalog): string;
```

### 5d. `src/generator/task-text.ts` [T5]

```ts
// Fill one phrasing from the SAME binding used by emit; name exact columns/aliases + tiebreak.
export function renderTask(template: Template, binding: Binding): string;
```

### 5e. `src/generator/scaffold.ts` [T5]

```ts
// Tokenize expectedSql, tag keyword vs answer-token, produce all three tiers + blankMap.
export function buildScaffold(
  expectedSql: string,
  binding: Binding,
  template: Template
): { starterSql: StarterSql; blankMap: BlankMap };
```

### 5f. `src/generator/hint.ts` [T5]

```ts
export function renderHint(template: Template, binding: Binding): string;
```

### 5g. `src/generator/assemble.ts` [T5]

```ts
// Deterministic id = hash(skill + canonical binding) via fnv1a from prng.ts.
// Emits the client-shaped object plus new fields; fingerprint attached later by the harness.
export function assembleExercise(
  template: Template,
  binding: Binding,
  catalog: Catalog
): DraftExercise;
```

### 5h. `src/generator/curate.ts` [T5]

```ts
// Skeleton dedup (literal-agnostic) + difficulty ordering + per-concept sampler.
// meta supplies concept order/skill membership so counts are honest per concept.
export function curate(drafts: DraftExercise[], meta: ConceptMeta[]): DraftExercise[];

// Honest per-skill counts (thin concepts like ap-select-all legitimately ~3-6).
export function honestCounts(drafts: DraftExercise[]): Record<string, number>;
```

### 5i. `src/generator/index.ts` [T0 stub signature + reads registries; T5 real body]

```ts
export function buildAllExercises(): Promise<
  Record<'aperture' | 'sideline' | 'rove', DraftExercise[]>
>;
export function buildExercisesFor(database: string): Promise<DraftExercise[]>;
```

### 5j. `src/snapshot.ts` [T6] - single snapshot mechanism

```ts
// The ONLY snapshot hash function. Recorded hashes stored at scripts/snapshots/<db>.snapshot.json.
// Imported by validate-exercises g0 (T6) AND the serve-time assertion (T18). No duplicate exists.
export function computeSnapshotHash(database: string): Promise<string>;
```

### 5k. `scripts/validate-exercises.ts` [T6] - harness + gates g0..g9

```ts
export interface GateContext {
  exercise: Exercise;
  database: string;                 // exercise.database; harness fails fast if not allowed
  result: {                         // from executeQuery({ database, sql, rowMode: 'array' })
    fields: { name: string }[];
    rows: unknown[][];
    rowCount: number;
  };
  validationSnapshot: string;       // computeSnapshotHash of the seeded DB used for validation
  servedSnapshot: string;           // recorded hash for the served DB (scripts/snapshots/<db>.snapshot.json)
}

export interface GateResult {
  gate: string;   // 'G0'..'G9'
  pass: boolean;
  message: string;
}
export type Gate = (ctx: GateContext) => GateResult | Promise<GateResult>;

export const g0SnapshotIdentity: Gate; // FIRST in GATES; the ONLY G0; uses src/snapshot
export const g1Runs: Gate;
export const g2NonEmpty: Gate;
export const g3RowCeiling: Gate;
export const g4StableOrder: Gate;
export const g5NonDegenerate: Gate;
export const g6DuplicateColumnName: Gate;
export const g7TaskAnswerDeterminism: Gate;
export const g8ScaffoldFillBack: Gate;
export const g9SelfCheck: Gate;

// Harness entry: iterate ALL exercises + checkpoint pool items, run every gate,
// then produce fingerprints for passers. Non-zero exit on any failure (CI gate).
export function validateExercises(exercises: Exercise[]): Promise<{
  passed: Exercise[];               // with fingerprint attached (post g9)
  failures: Array<{ id: string; results: GateResult[] }>;
}>;
```

Gate contracts:

| Gate | Name | Inspects | Pass / fail |
|------|------|----------|-------------|
| `g0SnapshotIdentity` | snapshot-identity | `validationSnapshot`, `servedSnapshot` | PASS iff the two hashes are equal; else FAIL (guarantees do not transfer across differing snapshots). |
| `g1Runs` | runs | executes `exercise.expectedSql` | PASS iff no throw; any pg error -> FAIL. |
| `g2NonEmpty` | non-empty | `result.rowCount` | PASS iff `rowCount >= 1` unless template is explicitly empty-valid; else FAIL. |
| `g3RowCeiling` | row-ceiling | `result.rowCount`, `exercise.rowCeiling` | PASS iff `rowCount <= exercise.rowCeiling` (default 200; Advanced mandatory); else FAIL. |
| `g4StableOrder` | stable-order | ORDER BY key set of `expectedSql` | PASS iff the ORDER BY key set is unique across all rows (deterministic order); else FAIL. |
| `g5NonDegenerate` | non-degenerate | filtered vs unfiltered counts, group count, Rove dedup/timezone deltas | PASS iff filtered != unfiltered, answer is not a single constant, GROUP BY yields >1 group where required, Rove dedup returns fewer rows than raw AND timezone value differs from naive read; else FAIL. |
| `g6DuplicateColumnName` | duplicate-column-name | `result.fields` names | PASS iff output column names all distinct; else FAIL. |
| `g7TaskAnswerDeterminism` | task<->answer-determinism | `exercise.task`, `expectedSql` | PASS iff every ORDER BY key and every projected name/alias in `expectedSql` is referenced by `task`, and when `orderMatters === false` the `expectedSql` still carries a stable ORDER BY for fingerprinting; else FAIL. |
| `g8ScaffoldFillBack` | scaffold-fill-back | `starterSql[tier]`, `blankMap[tier]`, `expectedSql` | PASS iff, for EACH tier, substituting `blankMap` answers back into `starterSql[tier]` (normalize whitespace/case) equals `expectedSql` AND blank-count == answer-token count; else FAIL. |
| `g9SelfCheck` | self-check | `expectedSql` via the fingerprint comparator (section 8) | PASS iff comparator returns `correct === true` against the exercise's own fingerprint; else FAIL. Fingerprint is produced here after G0..G8 pass. |

### 5l. `scripts/generate-exercises.ts` [T6]

```ts
// CLI: runs buildAllExercises + curate, writes src/phases/<db>/index.ts. Parameterizable by --db.
// npm scripts wired: "generate-exercises" and "validate-exercises".
```

---

## 6. MODULE MAP (path -> exported symbols -> created / filled-by)

Authors MUST use these exact paths and symbol names. **STUB-FIRST rule:** T0 creates every registry/phase module below as a compiling stub with empty typed exports, so the tree compiles green at every task. Dataset tasks FILL these exact modules; they never create new ones.

| Path | Exported symbols | Created | Filled / modified |
|------|------------------|---------|-------------------|
| `src/fingerprint.ts` | `Fingerprint`, `rowKey`, `hashRowsOrdered`, `hashRowsUnordered`, `buildFingerprint`, `normalizeCell`, `toPositionalRows` | T0 | - |
| `src/generator/types.ts` | `Level`, `ScaffoldTier`, `Exercise`, `DraftExercise`, `StarterSql`, `BlankMap`, `TeachBlock`, `Concept`, `Checkpoint`, `Phase`, `ConceptMeta`, `Template`, `Slot`, `SlotKind`, `BindingRule`, `ScaffoldPlan`, `GateHints`, `Binding`; re-exports `Fingerprint` | T0 | - |
| `src/generator/index.ts` | `buildAllExercises`, `buildExercisesFor` | T0 (stub reads registries) | T5 (real body) |
| `src/generator/schema-catalog.ts` | `loadCatalog`, `Catalog`, `numericCols`, `textCols`, `dateCols`, `boolCols`, `nullableCols`, `pk`, `fksFrom`, `fksTo`, `joinPairs` | T3 | - |
| `src/generator/bind.ts` | `bindTemplate`, `Binding` (re-export), `LiteralProbe` | T4 | - |
| `src/generator/emit.ts` | `emitSql` | T4 | - |
| `src/generator/task-text.ts` | `renderTask` | T5 | - |
| `src/generator/scaffold.ts` | `buildScaffold` | T5 | - |
| `src/generator/hint.ts` | `renderHint` | T5 | - |
| `src/generator/assemble.ts` | `assembleExercise` | T5 | - |
| `src/generator/curate.ts` | `curate`, `honestCounts` | T5 | - |
| `src/generator/templates/aperture/index.ts` | `APERTURE_TEMPLATES`, `APERTURE_SKILLS`, `APERTURE_CONCEPT_META` | T0 (stub) | T7 |
| `src/generator/templates/sideline/index.ts` | `SIDELINE_TEMPLATES`, `SIDELINE_SKILLS`, `SIDELINE_CONCEPT_META` | T0 (stub) | T10 |
| `src/generator/templates/rove/index.ts` | `ROVE_TEMPLATES`, `ROVE_SKILLS`, `ROVE_CONCEPT_META` | T0 (stub) | T12 |
| `src/phases/aperture/index.ts` | `aperturePhases: Phase[]` | T0 (stub) | T8 |
| `src/phases/sideline/index.ts` | `sidelinePhases: Phase[]` | T0 (stub) | T11 |
| `src/phases/rove/index.ts` | `rovePhases: Phase[]` | T0 (stub) | T13 |
| `src/snapshot.ts` | `computeSnapshotHash` | T6 | - |
| `scripts/generate-exercises.ts` | CLI (`--db`) | T6 | - |
| `scripts/validate-exercises.ts` | `validateExercises`, `g0SnapshotIdentity`..`g9SelfCheck`, `GateContext`, `GateResult`, `Gate` | T6 | - |
| `src/query-service.ts` | `createQueryService` (method `executeQuery`, `describeDatabase`, `checkQuery`) | exists | T1 |
| `src/learning-path.ts` | `getPhases`, `getLearningPath`, `graduationStatus` | exists | T14 |
| `src/db-config.ts` | `DEFAULT_DATABASES` | exists | T16 |
| `src/curriculum-service.ts` | `buildCurriculum` | exists | T17 |
| `client/src/lib/foundations.ts` | `FOUNDATIONS_KEY`, `migrateFoundationsState`, `maxConceptOrder`, `levelBaseTier`, `scaffoldTier`, `TIER_RANK`, `graduationStatus` | exists | T2 (partial: key/clamp/call-site), T15 (tapering) |

STUB exports T0 writes verbatim (empty typed):
```ts
export const APERTURE_TEMPLATES: Template[] = [];
export const APERTURE_SKILLS: string[] = [];
export const APERTURE_CONCEPT_META: ConceptMeta[] = [];   // (and SIDELINE_/ROVE_ equivalents)
export const aperturePhases: Phase[] = [];                // (and sideline/rove equivalents)
```

---

## 7. Canonical skill slugs (single source of truth = the per-dataset templates task)

RULE: the TEMPLATES task for each dataset is the SOLE definer of that dataset's skill slugs and `ConceptMeta`; templates + ConceptMeta are authored in the SAME task so their skills cannot drift. The phase-assembly task IMPORTS `<DB>_SKILLS` / `<DB>_CONCEPT_META` (never redefines them). The build-time 1:1 skill<->concept guardrail (T2) asserts exact correspondence.

**BEGINNER (17, fixed):** `ap-select-all`, `ap-select-columns`, `ap-order-by`, `ap-limit-topn`, `ap-distinct`, `ap-where-comparison`, `ap-where-boolean-logic`, `ap-where-between-in`, `ap-where-like`, `ap-null-handling`, `ap-computed-columns`, `ap-column-alias`, `ap-aggregate-scalar`, `ap-group-by`, `ap-having`, `ap-group-by-sort-top`, `ap-join-intro`.

**INTERMEDIATE (21; templates task may adjust slugs but keeps count ~21 and the concepts):** `sl-join-inner`, `sl-join-multi`, `sl-join-left`, `sl-anti-join`, `sl-semi-join`, `sl-self-join-match`, `sl-self-join-compare`, `sl-join-right-full`, `sl-join-aggregate`, `sl-case-expression`, `sl-subquery-scalar`, `sl-subquery-in`, `sl-subquery-correlated`, `sl-cte`, `sl-set-ops`, `sl-date-functions`, `sl-scd-asof`, `sl-window-rank`, `sl-window-lag-lead`, `sl-window-running`, `sl-window-frame-basic`.

**ADVANCED (24, incl. recursive CTE):** `rv-profile-dirty-data`, `rv-text-normalize`, `rv-case-canonicalize`, `rv-null-coalesce-nullif`, `rv-money-text-cast`, `rv-regex-clean-contacts`, `rv-timezone-city-join`, `rv-dedup-rownumber`, `rv-orphan-anti-join`, `rv-soft-delete-valid`, `rv-payment-dedup`, `rv-rating-outlier-clean`, `rv-rank-leaderboard`, `rv-topn-per-group`, `rv-lag-lead-deltas`, `rv-running-total`, `rv-moving-average-frame`, `rv-ntile-bucketing`, `rv-sessionization`, `rv-funnel-conversion`, `rv-retention-cohort`, `rv-lifecycle-latency`, `rv-clean-layer-capstone`, `rv-recursive-cte`.

---

## 8. Grading + client-side runtime contracts

### 8a. `checkQuery` NEW signature (fingerprint fast path) [T1]

`checkQuery` is a METHOD of the service returned by `createQueryService`. It runs ONLY the learner query and compares against the stored fingerprint; `expectedSql` is NEVER executed on the grading hot path.

```ts
export interface CheckQueryInput {
  database: string;
  sql: string;                 // learner SQL (executeQuery guards emptiness)
  fingerprint: Fingerprint;    // baked onto the exercise
  orderMatters: boolean;       // selects orderedRowHash vs unorderedRowHash
}

// Return shape preserved from today (untyped in source):
//   error:    { correct:false, feedbackType:'error',    message, code, hint, detail, position }
//   mismatch: { correct:false, feedbackType:'mismatch', reason, orderOnly?, yourRowCount,
//               expectedRowCount, expectedSummary }
//   success:  { correct:true,  feedbackType:'success', ... }
// expectedSummary comes from the fingerprint: { columns: fingerprint.columns, rowCount: fingerprint.rowCount }.
// checkQuery is a method on createQueryService(...); it is NOT a named export.
```

Comparison order: (1) columns name-array equality vs `fingerprint.columns`; (2) row-count vs `fingerprint.rowCount`; (3) row-hash equality vs `orderedRowHash` (when `orderMatters`) else `unorderedRowHash`. Only the source of the expected side changes (stored fingerprint, not a live query).

### 8b. positional `normalizeRows` [T1]

```ts
// POSITIONAL (index-based) so duplicate output column names cannot collapse.
// Delegates to src/fingerprint toPositionalRows. Requires executeQuery to request array-mode rows.
function normalizeRows(result: {
  fields: { name: string }[];
  rows: unknown[][];
}): (string | null)[][];   // = toPositionalRows(result)
```

### 8c. `scaffoldTier(state, skill, isReview, ctx?)` + `levelBaseTier` [T15]

```ts
// Numeric help-rank for the deterministic clamp. full = MOST help.
export const TIER_RANK: Record<ScaffoldTier, number>; // { full: 2, half: 1, blank: 0 }

// Band floor. beginner -> 'full', intermediate -> 'half', advanced -> 'blank'.
export function levelBaseTier(level: Level): ScaffoldTier;

// Optional context. Omitting ctx reproduces TODAY's exact behavior (FoundationsRep passes none).
export interface ScaffoldCtx {
  level: Level;                     // band of the concept being practiced
  priorBandCapstonePassed: boolean; // tapering is EARNED; false -> floor degrades to 'full'
  firstExposure: boolean;           // first non-review sighting of a not-strong skill
}

// NEW signature: first three params unchanged; ctx is the only addition.
export function scaffoldTier(
  state: LearningState,
  skill: string,
  isReview: boolean,
  ctx?: ScaffoldCtx
): ScaffoldTier;
```

Composition (deterministic clamp; unit-tested so a mastered beginner review never shows more help than a fresh advanced first attempt):
- No `ctx`: today's logic - non-review OR not-strong -> `'full'`; strong review with `reviewsPassed[skill] === 0` -> `'half'`; else `'blank'`.
- With `ctx`: floor = `ctx.priorBandCapstonePassed ? levelBaseTier(ctx.level) : 'full'`. If `ctx.firstExposure`, bump one step toward MORE help (raise `TIER_RANK`, clamp at `'full'`). Then clamp against the `reviewsPassed`-driven fade so the level floor never fights the full -> half -> blank review progression (final tier = the more-helpful of floor and the review-derived tier when appropriate).

### 8d. `FOUNDATIONS_KEY` v2 + migration/clamp [T2]

```ts
// Was 'sqlm:foundations:v1'. Referenced in exactly two spots (loadFoundations read, saveFoundations write).
export const FOUNDATIONS_KEY = 'sqlm:foundations:v2';

// Max local concept.order present in a track.
export function maxConceptOrder(track: Track): number;

// Clamp-on-load migration. Runs inside loadFoundations AFTER JSON.parse / per-field sanitize,
// BEFORE return. Returns a normalized LearningState; defaultState() on parse failure.
//   - clamp: state.maxUnlockedOrder = min(sanitized maxUnlockedOrder, maxConceptOrder(track))
//   - drop skillCorrect keys whose skill is NOT in the current track
//   - drop checkpointsPassed / reviewsPassed / lastPracticedSession entries not in the current track
//   -> prevents a regeneration/renumber from producing a false "graduated".
export function migrateFoundationsState(parsed: unknown, track: Track): LearningState;
```

`LearningState` (8 fields) unchanged: `skillCorrect`, `attempts`, `lastSql`, `lastPracticedSession`, `checkpointsPassed`, `sessionCounter`, `reviewsPassed`, `maxUnlockedOrder`. **T2 also updates the `loadFoundations(track)` call site** so the clamp actually runs in the app.

Per-band graduation (additive; do NOT rename existing keys):
```ts
export function graduationStatus(
  track: Track,
  state: LearningState,
  level?: Level
): { strongSkills: number; totalSkills: number; checkpointsPassed: string[]; graduated: boolean };
```

### 8e. curriculum-service return shape [T17]

DROP weeks and sessions entirely (the HTML academy is retired). Only T17 touches curriculum-service (T16 does NOT), so there is no T12/T13-style conflict. The single test asserting weeks/sessions is REPLACED in T17.

```ts
export function buildCurriculum(): {
  product: unknown;                 // three-band product copy/metadata (existing stable client-facing key)
  learningPath: unknown;           // from getLearningPath() (preserved top-level key)
  stats: {
    totalPhases: number;
    totalConcepts: number;
    totalExercises: number;
    totalCheckpoints: number;
  };
  // NO weeks. NO sessions.
};
```

---

## 9. Repo fact: query-service is service-scoped (all callers bind to this)

`src/query-service.ts` exports `createQueryService` (a factory). `executeQuery`, `describeDatabase`, and `checkQuery` are METHODS of the returned service object.

- `executeQuery` takes a SINGLE object `{ database, sql, rowMode }` (NOT a named export, NOT positional). T1 adds `rowMode: 'array'` support (current impl runs `getPool(database).query(sql)`; T1 must pass `rowMode` through to pg so `result.rows` are index-aligned `unknown[][]` and `result.fields` preserves order).
- ALL probe/harness callers obtain it via the service and call it object-style:
  ```ts
  const svc = createQueryService();
  const res = await svc.executeQuery({ database, sql, rowMode: 'array' }); // rows[i][0] positional
  const schema = await svc.describeDatabase({ database });
  ```
- `loadCatalog` (T3) uses `describeDatabase`; the bind probe (T4) and the validation harness (T6) use `executeQuery` with `rowMode: 'array'`. No file uses a `import { executeQuery }` named import or a positional `executeQuery(database, sql)` call.

---

## Binding notes for all 19 authors
- Every random draw comes from `deriveStream(seed, '<distinct-label>')` (`prng.ts`); dates from `ANCHOR_MS` window helpers. Never `Math.random` / `Date.now` / argless `new Date`.
- `DEFAULT_DATABASES = Object.freeze(['aperture', 'sideline', 'rove'])` (T16, lowercase, keep the freeze). A set `SQL_MASTERY_DATABASES` env fully overrides the code default.
- Advanced (rove) templates MUST set `gateHints.boundedSlice = true` and `gateHints.rowCeiling <= 200`; every rove `expectedSql` is scoped to a single city and/or fixed date range or a small aggregate.
- Single snapshot mechanism only: `src/snapshot.ts` `computeSnapshotHash`; recorded at `scripts/snapshots/<db>.snapshot.json`; one `g0SnapshotIdentity`. No `.snapshot` vs `snapshots.json` split, no second G0.
- ASCII only in all emitted SQL, task text, hints, schema comments, and source (plain apostrophes, hyphen, `->`).

---

## Tasks

### Task 0: Shared generator foundation + stubs

**Files:**
- Create `C:\Dev\Projects\sql-mastery\test\fingerprint.test.ts`
- Create `C:\Dev\Projects\sql-mastery\src\fingerprint.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\types.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\templates\aperture\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\templates\rove\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\phases\aperture\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\phases\sideline\index.ts`
- Create `C:\Dev\Projects\sql-mastery\src\phases\rove\index.ts`

**Interfaces:**

Consumes (already exist; bind to these exactly):
- `node:crypto` -> `createHash('sha256')` (Node global `Buffer` for `Buffer.isBuffer`).
- Repo convention (verified): server tests live at top-level `test/<name>.test.ts`, import source extensionless as `'../src/<module>'`, compile via `tsc -p tsconfig.json` to `dist/`, and run with `node --test dist/test/*.test.js`.
- Nothing from `prng.ts` is imported in T0 (fingerprints use `node:crypto`, NOT `fnv1a`); `fnv1a`/`deriveStream` are consumed by later tasks.

Produces (later tasks rely on these EXACT names/types):
- `src/fingerprint.ts`: `Fingerprint`, `normalizeCell`, `toPositionalRows`, `rowKey`, `hashRowsOrdered`, `hashRowsUnordered`, `buildFingerprint`.
- `src/generator/types.ts`: `Level`, `ScaffoldTier`, `StarterSql`, `BlankMap`, `Exercise`, `DraftExercise`, `TeachBlock`, `Concept`, `Checkpoint`, `Phase`, `ConceptMeta`, `PhaseMeta`, `CheckpointMeta`, `SlotKind`, `Slot`, `BindingRule`, `ScaffoldPlan`, `GateHints`, `Template`, `Binding`; re-exports `Fingerprint`. (Does NOT define `Catalog` -> owned by `schema-catalog.ts` in T3; `BindingRule.predicate` catalog param is typed `any`.)
- `src/generator/index.ts`: `buildAllExercises(): Promise<Record<'aperture'|'sideline'|'rove', DraftExercise[]>>`, `buildExercisesFor(database: string): Promise<DraftExercise[]>` (stub body reading the three template registries; T5 fills the real body).
- Template stubs: `APERTURE_TEMPLATES`/`APERTURE_SKILLS`/`APERTURE_CONCEPT_META`/`APERTURE_PHASES`/`APERTURE_CHECKPOINTS` (and `SIDELINE_`/`ROVE_` equivalents), all empty typed arrays.
- Phase stubs: `aperturePhases`/`sidelinePhases`/`rovePhases`, empty `Phase[]`.

---

- [ ] **Step 1: Write the failing fingerprint test (rowKey stability + unordered multiset-invariance).**

  Create `C:\Dev\Projects\sql-mastery\test\fingerprint.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import {
    normalizeCell,
    toPositionalRows,
    rowKey,
    hashRowsOrdered,
    hashRowsUnordered,
    buildFingerprint
  } from '../src/fingerprint';

  test('normalizeCell matches query-service semantics', () => {
    assert.equal(normalizeCell(null), null);
    assert.equal(normalizeCell(undefined), null);
    assert.equal(normalizeCell(42), '42');
    assert.equal(normalizeCell('x'), 'x');
    assert.equal(normalizeCell(new Date('2020-01-02T03:04:05.000Z')), '2020-01-02T03:04:05.000Z');
    assert.equal(normalizeCell(Buffer.from('hi')), Buffer.from('hi').toString('base64'));
    assert.equal(normalizeCell({ a: 1 }), '{"a":1}');
  });

  test('toPositionalRows keeps duplicate column values distinct by index', () => {
    const positional = toPositionalRows({
      fields: [{ name: 'n' }, { name: 'n' }],
      rows: [[1, 2], [3, 4]]
    });
    assert.deepEqual(positional, [['1', '2'], ['3', '4']]);
  });

  test('rowKey is stable and JSON-stringify based', () => {
    const row: (string | null)[] = ['a', null, '3'];
    assert.equal(rowKey(row), JSON.stringify(row));
    assert.equal(rowKey(row), rowKey(['a', null, '3']));
  });

  test('hashRowsUnordered is multiset-invariant; ordered is order-sensitive', () => {
    const a: (string | null)[][] = [['1'], ['2'], ['3']];
    const b: (string | null)[][] = [['3'], ['1'], ['2']];
    assert.equal(hashRowsUnordered(a), hashRowsUnordered(b));
    assert.notEqual(hashRowsOrdered(a), hashRowsOrdered(b));

    const c: (string | null)[][] = [['1'], ['1'], ['2']];
    const d: (string | null)[][] = [['1'], ['2'], ['2']];
    assert.notEqual(hashRowsUnordered(c), hashRowsUnordered(d));
  });

  test('buildFingerprint reads columns from fields and counts raw rows', () => {
    const fp = buildFingerprint({
      fields: [{ name: 'id' }, { name: 'label' }],
      rows: [[1, 'x'], [2, null]]
    });
    assert.deepEqual(fp.columns, ['id', 'label']);
    assert.equal(fp.rowCount, 2);
    assert.equal(typeof fp.orderedRowHash, 'string');
    assert.equal(fp.orderedRowHash.length, 64);
    assert.equal(fp.unorderedRowHash.length, 64);
  });
  ```

- [ ] **Step 2: Run the test red (module does not exist yet).**

  ```bash
  cd "C:\Dev\Projects\sql-mastery" && npx tsc -p tsconfig.json
  ```

  Expected failure: `tsc` errors with `Cannot find module '../src/fingerprint' or its corresponding type declarations.` (the compile step of `npm test` fails before `node --test` runs). This is the red state.

- [ ] **Step 3: Implement `src/fingerprint.ts` (minimal, contract section 3).**

  Create `C:\Dev\Projects\sql-mastery\src\fingerprint.ts`:

  ```ts
  import { createHash } from 'node:crypto';

  // The ONLY hashing/normalization module. query-service and the generator both depend on it.
  // fnv1a from prng.ts is reserved for PRNG stream derivation, NOT fingerprints.
  export interface Fingerprint {
    columns: string[];        // ORDERED output column names (result.fields.map(f => f.name))
    rowCount: number;         // raw pg row count of expectedSql (== rows.length)
    orderedRowHash: string;   // sha256 hex over normalized rows IN result order (orderMatters)
    unorderedRowHash: string; // sha256 hex over the MULTISET of normalized rows (!orderMatters)
  }

  // Cell serialization (UNCHANGED from query-service normalizeCell semantics).
  export function normalizeCell(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (Buffer.isBuffer(value)) return value.toString('base64');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  // Positional (index-aligned) string rows so duplicate output column names cannot collapse.
  // Requires rows fetched with rowMode 'array'.
  export function toPositionalRows(result: {
    fields: { name: string }[];
    rows: unknown[][];
  }): (string | null)[][] {
    return result.rows.map((row) => row.map((cell) => normalizeCell(cell)));
  }

  // One stable string per row.
  export function rowKey(row: (string | null)[]): string {
    return JSON.stringify(row);
  }

  function sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  // sha256 hex over rowKey(row) joined in result order.
  export function hashRowsOrdered(rows: (string | null)[][]): string {
    return sha256Hex(rows.map(rowKey).join('\n'));
  }

  // sha256 hex over rowKey(row) sorted lexicographically (multiset-invariant).
  export function hashRowsUnordered(rows: (string | null)[][]): string {
    return sha256Hex(rows.map(rowKey).sort().join('\n'));
  }

  // Whole fingerprint from an array-mode QueryResult.
  export function buildFingerprint(result: {
    fields: { name: string }[];
    rows: unknown[][];
  }): Fingerprint {
    const positional = toPositionalRows(result);
    return {
      columns: result.fields.map((field) => field.name),
      rowCount: positional.length,
      orderedRowHash: hashRowsOrdered(positional),
      unorderedRowHash: hashRowsUnordered(positional)
    };
  }
  ```

- [ ] **Step 4: Run the fingerprint test green.**

  ```bash
  cd "C:\Dev\Projects\sql-mastery" && npx tsc -p tsconfig.json && node --test dist/test/fingerprint.test.js
  ```

  Expected: `tsc` exits 0, and `node --test` reports `# pass 5` / `# fail 0` for the five fingerprint tests.

- [ ] **Step 5: Create `src/generator/types.ts` (all shared types + Template DSL; re-export Fingerprint; NO Catalog).**

  Create `C:\Dev\Projects\sql-mastery\src\generator\types.ts`:

  ```ts
  import type { Fingerprint } from '../fingerprint';
  export type { Fingerprint };

  // ---- Section 1: primitives ----
  export type Level = 'beginner' | 'intermediate' | 'advanced';

  // Help-scale ordering: full > half > blank (full = MOST help, blank = LEAST).
  export type ScaffoldTier = 'full' | 'half' | 'blank';

  // ---- Section 2: exercise / phase-tree types ----
  export interface StarterSql {
    full: string;   // keyword skeleton visible, every value slot blanked
    half: string;   // harder half blanked
    blank: string;  // whole clauses blanked
  }

  // blankMap[tier][blankToken] -> answerToken.
  export type BlankMap = Record<ScaffoldTier, Record<string, string>>;

  export interface Exercise {
    id: string;                 // deterministic hash of (skill, canonical binding)
    skill: string;              // globally-unique namespaced slug: ap-/sl-/rv- prefix
    database: string;           // 'aperture' | 'sideline' | 'rove'
    task: string;               // prompt; names exact output columns/aliases + tiebreak
    starterSql: StarterSql;     // three pre-generated tiers
    blankMap: BlankMap;         // per-tier map of each blank token -> its answer token
    hint: string;
    expectedSql: string;        // canonical deterministic answer, trimmed, stable ORDER BY
    orderMatters: boolean;      // true -> orderedRowHash; false -> unorderedRowHash
    rowCeiling: number;         // G3 hard cap (default 200; Advanced <= 200)
    fingerprint: Fingerprint;   // baked in by the validation harness
  }

  // Pre-fingerprint draft produced by assembleExercise(); harness attaches fingerprint.
  export type DraftExercise = Omit<Exercise, 'fingerprint'>;

  export interface TeachBlock {
    plain: string;
    mentalModel: string;
    example: { sql: string; note: string };
  }

  export interface Concept {
    id: string;
    order: number;            // LOCAL 1..n within its phase, contiguous
    skill: string;            // namespaced ap-/sl-/rv-, globally unique, 1:1 with concept
    title: string;
    teach: TeachBlock;
    exercises: Exercise[];
    phaseId?: string;         // owning phase id
  }

  export interface Checkpoint {
    id: string;
    afterOrder: number;       // LOCAL concept order this checkpoint follows
    drawFromSkills: string[]; // skill slugs sampled; band capstone = all that band's skills
    title: string;
  }

  export interface Phase {
    id: string;
    order: number;            // GLOBAL, unique, monotonic across bands
    title: string;
    goal: string;
    level: Level;
    database: string;
    concepts: Concept[];
    checkpoints: Checkpoint[];
  }

  // Per-concept authoring record owned by the per-dataset TEMPLATES task.
  export interface ConceptMeta {
    skill: string;            // MUST be a member of the same dataset's <DB>_SKILLS
    order: number;            // LOCAL order within phaseId
    title: string;
    teach: TeachBlock;
    phaseId: string;
  }

  // ---- Phase-model authoring records (resolutions H1) ----
  export interface PhaseMeta {
    id: string;
    title: string;
    goal: string;
    level: Level;
    order: number;            // 1..k within the band
  }

  export interface CheckpointMeta {
    id: string;
    phaseId: string;
    afterOrder: number;
    drawFromSkills: string[];
    title: string;
  }

  // ---- Section 4a: Template DSL ----
  // EXACTLY these nine members (resolutions C.6).
  export type SlotKind =
    | 'table' | 'column' | 'projection' | 'literal'
    | 'groupCols' | 'sortKey' | 'partitionCols' | 'rankKey' | 'limit';

  export interface Slot {
    name: string;              // referenced by sqlShape, phrasings, hintTemplate, scaffoldPlan
    kind: SlotKind;
    table?: string;            // when the slot is scoped to a table
    op?: string;               // literal slots: '=', '>', 'BETWEEN', 'IN', 'LIKE'
    col?: string;              // literal slots: the column the DISTINCT probe samples from
    sampleStrategy?: string;   // literal slots: 'single' | 'compound-row'
  }

  // Predicate over a candidate binding value; false rejects the binding.
  // catalog is typed `any` here: Catalog is owned by schema-catalog.ts (T3), not types.ts (resolutions H6).
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
    minRows: number;           // feeds g2
    minDistinct: number;       // feeds g5 non-degeneracy
    rowCeiling: number;        // feeds g3 (Advanced templates MUST set <= 200)
    orderMatters: boolean;
    boundedSlice: boolean;     // Advanced (rove) templates MUST set true
  }

  export interface Template {
    skill: string;             // namespaced ap-/sl-/rv-
    database: string;          // 'aperture' | 'sideline' | 'rove'
    family: string;            // 'single-table' | 'grouped' | 'windowed' | 'join' | ...
    primaryTable?: string;     // when no 'table' slot, bind derives primary table from here or sqlShape
    sqlShape: string;          // parametrized SQL with {slot} placeholders; NO ORDER BY, NO ROUND
    slots: Slot[];
    bindingRules: BindingRule[];
    phrasings: string[];       // >= 2 natural-language variants
    hintTemplate: string;
    scaffoldPlan: ScaffoldPlan;
    gateHints: GateHints;
  }

  // One concrete binding of a template's slots.
  export interface Binding {
    skill: string;
    database: string;
    bindingIndex: number;
    slots: Record<string, string>;     // Slot.name -> chosen identifier/table/expression
    literals: Record<string, string>;  // Slot.name -> real literal value (probe-drawn)
  }
  ```

- [ ] **Step 6: Create the three template registry stubs (empty typed exports incl. phase-model stubs).**

  Create `C:\Dev\Projects\sql-mastery\src\generator\templates\aperture\index.ts`:

  ```ts
  import type {
    Template,
    ConceptMeta,
    PhaseMeta,
    CheckpointMeta
  } from '../../types';

  // Filled by T7. Stubs keep the tree compiling green at every task.
  export const APERTURE_TEMPLATES: Template[] = [];
  export const APERTURE_SKILLS: string[] = [];
  export const APERTURE_CONCEPT_META: ConceptMeta[] = [];
  export const APERTURE_PHASES: PhaseMeta[] = [];
  export const APERTURE_CHECKPOINTS: CheckpointMeta[] = [];
  ```

  Create `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\index.ts`:

  ```ts
  import type {
    Template,
    ConceptMeta,
    PhaseMeta,
    CheckpointMeta
  } from '../../types';

  // Filled by T10.
  export const SIDELINE_TEMPLATES: Template[] = [];
  export const SIDELINE_SKILLS: string[] = [];
  export const SIDELINE_CONCEPT_META: ConceptMeta[] = [];
  export const SIDELINE_PHASES: PhaseMeta[] = [];
  export const SIDELINE_CHECKPOINTS: CheckpointMeta[] = [];
  ```

  Create `C:\Dev\Projects\sql-mastery\src\generator\templates\rove\index.ts`:

  ```ts
  import type {
    Template,
    ConceptMeta,
    PhaseMeta,
    CheckpointMeta
  } from '../../types';

  // Filled by T12.
  export const ROVE_TEMPLATES: Template[] = [];
  export const ROVE_SKILLS: string[] = [];
  export const ROVE_CONCEPT_META: ConceptMeta[] = [];
  export const ROVE_PHASES: PhaseMeta[] = [];
  export const ROVE_CHECKPOINTS: CheckpointMeta[] = [];
  ```

- [ ] **Step 7: Create the three phase stubs (empty `Phase[]`).**

  Create `C:\Dev\Projects\sql-mastery\src\phases\aperture\index.ts`:

  ```ts
  import type { Phase } from '../../generator/types';

  // Assembled by T8 from APERTURE_PHASES + APERTURE_CONCEPT_META + curated exercises.
  export const aperturePhases: Phase[] = [];
  ```

  Create `C:\Dev\Projects\sql-mastery\src\phases\sideline\index.ts`:

  ```ts
  import type { Phase } from '../../generator/types';

  // Assembled by T11.
  export const sidelinePhases: Phase[] = [];
  ```

  Create `C:\Dev\Projects\sql-mastery\src\phases\rove\index.ts`:

  ```ts
  import type { Phase } from '../../generator/types';

  // Assembled by T13.
  export const rovePhases: Phase[] = [];
  ```

- [ ] **Step 8: Create `src/generator/index.ts` (signatures + stub body that reads the three registries).**

  Create `C:\Dev\Projects\sql-mastery\src\generator\index.ts`:

  ```ts
  import type { DraftExercise, Template } from './types';
  import { APERTURE_TEMPLATES } from './templates/aperture/index';
  import { SIDELINE_TEMPLATES } from './templates/sideline/index';
  import { ROVE_TEMPLATES } from './templates/rove/index';

  type GeneratorDatabase = 'aperture' | 'sideline' | 'rove';

  // Reads the three template registries. T5 replaces the stub body with the real
  // bind -> emit -> assemble pipeline (importing bind/emit/assemble/schema-catalog).
  const TEMPLATE_REGISTRIES: Record<GeneratorDatabase, Template[]> = {
    aperture: APERTURE_TEMPLATES,
    sideline: SIDELINE_TEMPLATES,
    rove: ROVE_TEMPLATES
  };

  export async function buildExercisesFor(database: string): Promise<DraftExercise[]> {
    const templates = TEMPLATE_REGISTRIES[database as GeneratorDatabase] ?? [];
    // STUB (T0): registries are empty until dataset tasks fill them; T5 binds + emits here.
    void templates;
    return [];
  }

  export async function buildAllExercises(): Promise<Record<GeneratorDatabase, DraftExercise[]>> {
    return {
      aperture: await buildExercisesFor('aperture'),
      sideline: await buildExercisesFor('sideline'),
      rove: await buildExercisesFor('rove')
    };
  }
  ```

- [ ] **Step 9: Compile the whole tree green and re-run the fingerprint test.**

  ```bash
  cd "C:\Dev\Projects\sql-mastery" && npx tsc -p tsconfig.json && node --test dist/test/fingerprint.test.js
  ```

  Expected: `tsc` exits 0 (every new file compiles, no unused-import or strict errors), and the fingerprint test still reports `# pass 5` / `# fail 0`. Also confirm no `.js` suffix appears on any relative import in the new files.

- [ ] **Step 10: Commit.**

  ```bash
  cd "C:\Dev\Projects\sql-mastery" && git add src/fingerprint.ts src/generator/types.ts src/generator/index.ts src/generator/templates/aperture/index.ts src/generator/templates/sideline/index.ts src/generator/templates/rove/index.ts src/phases/aperture/index.ts src/phases/sideline/index.ts src/phases/rove/index.ts test/fingerprint.test.ts && git commit -m "T0: shared generator foundation (fingerprint + types + registry/phase stubs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

  Expected: one commit containing exactly the ten files above; `git status` clean afterward.

---

### Task 1: query-service fingerprint grading refactor

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\query-service.ts`
- Modify: `C:\Dev\Projects\sql-mastery\test\query-service.test.ts`

**Interfaces:**

Consumes (created by T0 in `src/fingerprint.ts`; import extensionless as `./fingerprint`):
```ts
export interface Fingerprint {
  columns: string[];
  rowCount: number;
  orderedRowHash: string;   // sha256 hex over rows IN result order
  unorderedRowHash: string; // sha256 hex over the MULTISET of rows
}
export function toPositionalRows(result: { fields: { name: string }[]; rows: unknown[][] }): (string | null)[][];
export function hashRowsOrdered(rows: (string | null)[][]): string;
export function hashRowsUnordered(rows: (string | null)[][]): string;
export function normalizeCell(value: unknown): string | null;
export function buildFingerprint(result: { fields: { name: string }[]; rows: unknown[][] }): Fingerprint; // used by the TEST only
```

Produces (later tasks + the harness in T6 rely on these EXACT shapes):
```ts
// executeQuery gains rowMode passthrough + an always-present positional `fields` array.
// executeQuery({ database, sql, rowMode?: 'array' }) ->
//   { database, sql, columns: string[], fields: { name: string }[], rows, rowCount, command, durationMs }
//   rowMode 'array' -> rows is unknown[][] (index-aligned); omitted -> rows is object-mode (unchanged).

// checkQuery fingerprint fast path (expectedSql NEVER runs here):
//   checkQuery({ database, sql, fingerprint: Fingerprint, orderMatters: boolean }) ->
//     success  { correct:true,  feedbackType:'success', ... }
//     mismatch { correct:false, feedbackType:'mismatch', reason, orderOnly?, yourRowCount, expectedRowCount, expectedSummary, ... }
//     error    { correct:false, feedbackType:'error', message, code, hint, detail, position }
//   expectedSummary = { columns: fingerprint.columns, rowCount: fingerprint.rowCount }.
// Legacy checkQuery({ database, sql, expectedSql }) path is RETAINED unchanged for exercises
// that carry no fingerprint yet (foundations/joins during transition).
```

Notes for the executor: this is CommonJS with extensionless relative imports (never a `.js` suffix). `executeQuery`/`checkQuery` are METHODS of the object returned by `createQueryService`, called object-style. ASCII only. No `Math.random`/`Date.now`/argless `new Date` is introduced by this task.

---

- [ ] **Step 1: Write the failing test for `rowMode: 'array'` passthrough + positional `fields`.**

  Add these imports and one test to `C:\Dev\Projects\sql-mastery\test\query-service.test.ts`. Put the import next to the existing top imports, and append the test at the end of the file.

  ```ts
  // add to the existing import block at the top of the file:
  import { buildFingerprint } from '../src/fingerprint';

  // append at the end of the file:
  test('executeQuery passes rowMode array to pg and exposes a positional fields array', async () => {
    let received: any = null;
    class ArrayPool {
      async query(config: any) {
        received = config;
        return {
          command: 'SELECT',
          rowCount: 2,
          fields: [{ name: 'n' }, { name: 'n' }],
          rows: [['1', '2'], ['3', '4']]
        };
      }
      async end() {}
    }

    const service = createQueryService({ Pool: ArrayPool, env: {} });
    const result = await service.executeQuery({
      database: 'aperture',
      sql: 'SELECT 1 AS n, 2 AS n',
      rowMode: 'array'
    });

    assert.deepEqual(received, { text: 'SELECT 1 AS n, 2 AS n', rowMode: 'array' });
    assert.deepEqual(result.columns, ['n', 'n']);
    assert.deepEqual(result.fields, [{ name: 'n' }, { name: 'n' }]);
    assert.deepEqual(result.rows, [['1', '2'], ['3', '4']]);
  });
  ```

- [ ] **Step 2: Run it red.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected failure: the test throws because `src/fingerprint` does not yet export what T0 must provide OR (if T0 already landed) the assertion on `received` fails with `AssertionError` showing the pool received the string `'SELECT 1 AS n, 2 AS n'` instead of `{ text: ..., rowMode: 'array' }`, and `result.fields` is `undefined`.

- [ ] **Step 3: Implement `rowMode` passthrough + `fields`, and add the fingerprint imports.**

  In `C:\Dev\Projects\sql-mastery\src\query-service.ts`, add the import directly under the existing `import { ... } from './db-config';` line:

  ```ts
  import { toPositionalRows, hashRowsOrdered, normalizeCell } from './fingerprint';
  ```

  Delete the local `normalizeCell` definition (lines 59-65 in the current file) since it now comes from `./fingerprint` (identical semantics per the contract). Then replace the current `normalizeRows` (lines 67-69) with a positional version plus a retained legacy helper:

  ```ts
  // POSITIONAL (index-based) so duplicate output column names cannot collapse.
  // Delegates to src/fingerprint toPositionalRows; requires array-mode rows.
  function normalizeRows(result: { fields: { name: string }[]; rows: unknown[][] }): (string | null)[][] {
    return toPositionalRows(result);
  }

  // Legacy name-keyed normalization retained ONLY for the transitional expectedSql diff path.
  function normalizeRowsByName(result: any): (string | null)[][] {
    return result.rows.map((row: any) => result.columns.map((column: string) => normalizeCell(row[column])));
  }
  ```

  In `mismatchFeedback`, change the two calls that read `normalizeRows(userResult)` / `normalizeRows(expectedResult)` (current lines 205-206) to use the legacy helper:

  ```ts
    const userRows = normalizeRowsByName(userResult);
    const expectedRows = normalizeRowsByName(expectedResult);
  ```

  Replace the body of `executeQuery` (current lines 253-285) with this version (adds `rowMode` and an always-present `fields`):

  ```ts
  async function executeQuery(input: any = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql.trim() : '';
    const rowMode = input.rowMode === 'array' ? 'array' : undefined;

    if (!sql) {
      throw new QueryServiceError('SQL is required.', 400, 'EMPTY_SQL');
    }

    if (sql.length > 200000) {
      throw new QueryServiceError('SQL is too large to run from the browser.', 400, 'SQL_TOO_LARGE');
    }

    const startedAt = clock();

    try {
      const queryConfig = rowMode === 'array' ? { text: sql, rowMode: 'array' } : sql;
      const result = await getPool(database).query(queryConfig);
      const durationMs = Math.max(0, Math.round(clock() - startedAt));
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const fields = Array.isArray(result.fields)
        ? result.fields.map((field: any) => ({ name: field.name }))
        : [];

      return {
        database,
        sql,
        columns: fields.map((field: any) => field.name),
        fields,
        rows,
        rowCount: Number.isInteger(result.rowCount) ? result.rowCount : rows.length,
        command: result.command || 'QUERY',
        durationMs
      };
    } catch (error) {
      if (error instanceof QueryServiceError) throw error;
      throw makePgError(error);
    }
  }
  ```

- [ ] **Step 4: Run it green.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected: all tests pass, including the new `rowMode array` test. The existing object-mode tests still pass because `rowMode` is omitted there (the pool still receives the raw SQL string and rows stay object-mode).

- [ ] **Step 5: Commit.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && git add src/query-service.ts test/query-service.test.ts && git commit -m "query-service: rowMode array passthrough + positional normalizeRows

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

- [ ] **Step 6: Write failing tests for the checkQuery fingerprint fast path (ordered compare + duplicate-column positional).**

  Append to `C:\Dev\Projects\sql-mastery\test\query-service.test.ts`. `poolReturning` is a tiny helper; declare it once above these tests.

  ```ts
  function poolReturning(result: any) {
    return class {
      async query() { return result; }
      async end() {}
    };
  }

  test('checkQuery fingerprint path grades a correct ordered answer without running expectedSql', async () => {
    const expected = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['austin'], ['dallas']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });

    const service = createQueryService({ Pool: poolReturning(expected), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT city FROM cities ORDER BY city',
      fingerprint: fp,
      orderMatters: true
    });

    assert.equal(feedback.correct, true);
    assert.equal(feedback.feedbackType, 'success');
    assert.deepEqual(feedback.expectedSummary, { columns: ['city'], rowCount: 2 });
  });

  test('checkQuery fingerprint path reports a column mismatch', async () => {
    const expected = { command: 'SELECT', rowCount: 1, fields: [{ name: 'city' }], rows: [['austin']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });
    const learner = { command: 'SELECT', rowCount: 1, fields: [{ name: 'town' }], rows: [['austin']] };

    const service = createQueryService({ Pool: poolReturning(learner), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT city AS town FROM cities',
      fingerprint: fp,
      orderMatters: true
    });

    assert.equal(feedback.correct, false);
    assert.equal(feedback.feedbackType, 'mismatch');
    assert.equal(feedback.reason, 'columns');
  });

  test('checkQuery fingerprint path reports a row-count mismatch', async () => {
    const expected = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['austin'], ['dallas']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });
    const learner = { command: 'SELECT', rowCount: 1, fields: [{ name: 'city' }], rows: [['austin']] };

    const service = createQueryService({ Pool: poolReturning(learner), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT city FROM cities LIMIT 1',
      fingerprint: fp,
      orderMatters: true
    });

    assert.equal(feedback.correct, false);
    assert.equal(feedback.reason, 'row-count');
    assert.equal(feedback.yourRowCount, 1);
    assert.equal(feedback.expectedRowCount, 2);
  });

  test('checkQuery fingerprint path keeps duplicate output columns positional', async () => {
    // expected: two columns share the name 'n' but hold different values by INDEX.
    const expected = { command: 'SELECT', rowCount: 1, fields: [{ name: 'n' }, { name: 'n' }], rows: [['1', '2']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });
    // learner differs ONLY in the first positional column; a name-keyed compare would collapse
    // both columns to the last value and wrongly pass. Positional compare must reject it.
    const learner = { command: 'SELECT', rowCount: 1, fields: [{ name: 'n' }, { name: 'n' }], rows: [['9', '2']] };

    const service = createQueryService({ Pool: poolReturning(learner), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT 9 AS n, 2 AS n',
      fingerprint: fp,
      orderMatters: true
    });

    assert.equal(feedback.correct, false);
    assert.equal(feedback.reason, 'row-values');
  });
  ```

- [ ] **Step 7: Run it red.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected failure: the four new tests fail. `checkQuery` currently ignores `input.fingerprint` and requires `expectedSql`, so it throws `QueryServiceError` with code `MISSING_EXPECTED_SQL` ("This exercise does not have a checkable answer yet."), surfacing as an unhandled rejection / assertion failure in each new test.

- [ ] **Step 8: Implement the fingerprint fast path (ordered compare only for now); keep the legacy path.**

  In `C:\Dev\Projects\sql-mastery\src\query-service.ts`, add a new helper function directly ABOVE the existing `async function checkQuery` and branch into it at the top of `checkQuery`.

  Add this helper (ordered comparison only in this step; `orderMatters` is accepted but the unordered branch lands in Step 11):

  ```ts
  async function checkAgainstFingerprint(database: string, sql: string, fingerprint: any, _orderMatters: boolean) {
    let userResult;
    try {
      userResult = await executeQuery({ database, sql, rowMode: 'array' });
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string };
      return {
        correct: false,
        feedbackType: 'error',
        message: err.message || 'Your SQL did not run.',
        code: err.code || 'QUERY_FAILED',
        hint: hintForError(error),
        detail: err.detail,
        position: err.position
      };
    }

    const expectedSummary = { columns: fingerprint.columns, rowCount: fingerprint.rowCount };
    const yourRowCount = userResult.rows.length;
    const expectedRowCount = fingerprint.rowCount;

    if (!arraysMatch(userResult.columns, fingerprint.columns)) {
      return {
        correct: false,
        feedbackType: 'mismatch',
        message: 'Your SQL ran, but it does not match the expected result yet.',
        reason: 'columns',
        hint: 'Your query ran, but the output columns do not match. Check the SELECT list, aliases, and column order.',
        yourRowCount,
        expectedRowCount,
        result: userResult,
        expectedSummary
      };
    }

    if (yourRowCount !== expectedRowCount) {
      return {
        correct: false,
        feedbackType: 'mismatch',
        message: 'Your SQL ran, but it does not match the expected result yet.',
        reason: 'row-count',
        hint: 'Your query ran, but it returned a different number of rows. Check filters, joins, grouping, and LIMIT.',
        yourRowCount,
        expectedRowCount,
        result: userResult,
        expectedSummary
      };
    }

    const rows = normalizeRows({ fields: userResult.fields, rows: userResult.rows });
    const learnerOrdered = hashRowsOrdered(rows);

    if (learnerOrdered !== fingerprint.orderedRowHash) {
      return {
        correct: false,
        feedbackType: 'mismatch',
        message: 'Your SQL ran, but it does not match the expected result yet.',
        reason: 'row-values',
        yourRowCount,
        expectedRowCount,
        result: userResult,
        expectedSummary
      };
    }

    return {
      correct: true,
      feedbackType: 'success',
      message: 'You got it right.',
      why: 'Your columns, row count, and row values match the model answer on this database.',
      result: userResult,
      expectedSummary
    };
  }
  ```

  Then, at the very top of the existing `async function checkQuery(input: any = {})` body (before the current `const expectedSql = ...` line), insert the branch so a supplied fingerprint takes the fast path and everything else falls through to today's legacy expectedSql logic unchanged:

  ```ts
  async function checkQuery(input: any = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql : '';

    // Fingerprint fast path: run ONLY the learner query; expectedSql never executes here.
    const fingerprint = input.fingerprint;
    if (fingerprint && typeof fingerprint === 'object' && Array.isArray(fingerprint.columns)) {
      return await checkAgainstFingerprint(database, sql, fingerprint, input.orderMatters === true);
    }

    // Legacy expectedSql path (transitional): kept so foundations/joins still grade.
    const expectedSql = typeof input.expectedSql === 'string' ? input.expectedSql.trim() : '';
    // ... existing legacy body continues unchanged from here ...
  ```

  Leave the rest of the legacy `checkQuery` body (the `MISSING_EXPECTED_SQL` guard, both `executeQuery` calls, `mismatchFeedback`, and the returns) exactly as it is today.

- [ ] **Step 9: Run it green.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected: all tests pass, including the four fingerprint tests from Step 6 and every pre-existing legacy `checkQuery` / `mismatchFeedback` test (the legacy path is untouched).

- [ ] **Step 10: Commit.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && git add src/query-service.ts test/query-service.test.ts && git commit -m "query-service: checkQuery fingerprint fast path (ordered), legacy path retained

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

- [ ] **Step 11: Write failing tests for unordered (multiset) grading + order-only detection.**

  Append to `C:\Dev\Projects\sql-mastery\test\query-service.test.ts`.

  ```ts
  test('checkQuery fingerprint path accepts reordered rows when order does not matter', async () => {
    const expected = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['austin'], ['dallas']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });
    const learner = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['dallas'], ['austin']] };

    const service = createQueryService({ Pool: poolReturning(learner), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT city FROM cities',
      fingerprint: fp,
      orderMatters: false
    });

    assert.equal(feedback.correct, true);
    assert.equal(feedback.feedbackType, 'success');
  });

  test('checkQuery fingerprint path flags an order-only difference when order matters', async () => {
    const expected = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['austin'], ['dallas']] };
    const fp = buildFingerprint({ fields: expected.fields, rows: expected.rows });
    const learner = { command: 'SELECT', rowCount: 2, fields: [{ name: 'city' }], rows: [['dallas'], ['austin']] };

    const service = createQueryService({ Pool: poolReturning(learner), env: {} });
    const feedback = await service.checkQuery({
      database: 'rove',
      sql: 'SELECT city FROM cities ORDER BY city DESC',
      fingerprint: fp,
      orderMatters: true
    });

    assert.equal(feedback.correct, false);
    assert.equal(feedback.reason, 'row-values');
    assert.equal(feedback.orderOnly, true);
  });
  ```

- [ ] **Step 12: Run it red.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected failure: the accept-reordered test fails because Step 8 always compares `orderedRowHash`, so reordered rows return a `row-values` mismatch instead of success; the order-only test fails because `feedback.orderOnly` is `undefined`.

- [ ] **Step 13: Add the ordered/unordered branch and order-only detection.**

  In `C:\Dev\Projects\sql-mastery\src\query-service.ts`, extend the import added in Step 3 to also pull in `hashRowsUnordered`:

  ```ts
  import { toPositionalRows, hashRowsOrdered, hashRowsUnordered, normalizeCell } from './fingerprint';
  ```

  In `checkAgainstFingerprint`, rename the unused `_orderMatters` parameter to `orderMatters` and replace the row-hash block (the `const rows = ...` through the `row-values` mismatch return) with the ordered/unordered selection:

  ```ts
    const rows = normalizeRows({ fields: userResult.fields, rows: userResult.rows });
    const learnerOrdered = hashRowsOrdered(rows);
    const learnerUnordered = hashRowsUnordered(rows);

    const expectedHash = orderMatters ? fingerprint.orderedRowHash : fingerprint.unorderedRowHash;
    const learnerHash = orderMatters ? learnerOrdered : learnerUnordered;

    if (learnerHash !== expectedHash) {
      const orderOnly = orderMatters && learnerUnordered === fingerprint.unorderedRowHash;
      return {
        correct: false,
        feedbackType: 'mismatch',
        message: 'Your SQL ran, but it does not match the expected result yet.',
        reason: 'row-values',
        orderOnly,
        hint: orderOnly
          ? 'Your rows are right, but the order differs. Check your ORDER BY.'
          : 'Your query returned the right shape, but the values differ. Check expressions and NULL handling.',
        yourRowCount,
        expectedRowCount,
        result: userResult,
        expectedSummary
      };
    }
  ```

  Update the signature line to drop the underscore:

  ```ts
  async function checkAgainstFingerprint(database: string, sql: string, fingerprint: any, orderMatters: boolean) {
  ```

- [ ] **Step 14: Run it green.**

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/query-service.test.js
  ```

  Expected: every test passes, including the two new order tests. The Step 6 ordered/duplicate-column tests still pass (ordered path unchanged for `orderMatters: true`), and the full legacy suite still passes.

- [ ] **Step 15: Full-suite guard, then commit.**

  Run the whole server test build once to confirm nothing else regressed:

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && npm run build:server && node --test dist/test/*.test.js
  ```

  Expected: the entire server test suite passes. Then commit:

  ```bash
  cd "C:/Dev/Projects/sql-mastery" && git add src/query-service.ts test/query-service.test.ts && git commit -m "query-service: unordered multiset grading + order-only detection on fingerprint path

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 2: Skill-id guardrail + FOUNDATIONS_KEY v2 clamp + call-site

Owns the build-time guardrail that flattened concept skill ids stay globally unique and 1:1 with concepts, plus the client `FOUNDATIONS_KEY` v2 bump, the clamp-on-load migration (`migrateFoundationsState` + exported `maxConceptOrder`), and the app call-site wiring so the clamp actually runs.

**Reality reconciliation (read first):** the contract names the loader `loadFoundations(track)`, but in this repo the app persists learner state under `LEARNING_KEY` (`client/src/lib/learning-path.ts` `loadLearning`) while `client/src/lib/foundations.ts` owns the engine (`FOUNDATIONS_KEY`, `scaffoldTier`, `graduationStatus`, `maxConceptOrder`). This task therefore (a) makes all contract-mandated changes in `client/src/lib/foundations.ts` and (b) wires the clamp into the true runtime load site, the `FoundationsProvider` effect in `client/src/state/FoundationsContext.tsx`, where the live `track` first becomes available. Do NOT change `LEARNING_KEY` or `loadLearning`.

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\client\src\lib\foundations-migrate.test.ts` (vitest, client)
- Create: `C:\Dev\Projects\sql-mastery\test\skill-id-guardrail.test.ts` (node:test, server, top-level `test/`)
- Modify: `C:\Dev\Projects\sql-mastery\client\src\lib\foundations.ts` (key v2, `sanitizeState`, `migrateFoundationsState`, export `maxConceptOrder`, `loadFoundations(track?)`)
- Modify: `C:\Dev\Projects\sql-mastery\client\src\state\FoundationsContext.tsx` (apply clamp against live track in the one-time effect)

**Interfaces:**
- Consumes: `LearningState`, `Track`, `Concept`, `Checkpoint` from `client/src/types`; `getLearningPath()` from `src/learning-path` (returns `{ dataset, phases, skills, concepts, checkpoints, exercises }`); existing private helpers in `foundations.ts` (`defaultState()`, `asObject()`, `safeGet`/`safeSet`); existing `reconcileUnlock(track, state)` and `duplicateSkills(track)` from `client/src/lib/learning-path`.
- Produces (later tasks bind to these exact names/types): `FOUNDATIONS_KEY = 'sqlm:foundations:v2'`; `export function maxConceptOrder(track: Track): number`; `export function migrateFoundationsState(parsed: unknown, track: Track): LearningState`; `export function loadFoundations(track?: Track): LearningState`. T15 (scaffold tapering) and T18 (level-aware UI) consume these.

---

- [ ] **Step 1: Write the failing client migration unit test.**
  Create `C:\Dev\Projects\sql-mastery\client\src\lib\foundations-migrate.test.ts`:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';
  import { loadFoundations, migrateFoundationsState, maxConceptOrder, FOUNDATIONS_KEY } from './foundations';
  import type { Track } from '../types';

  // Live flattened track: 3 concepts (global order 1..3), one checkpoint.
  const track = {
    dataset: 'aperture',
    skills: [
      { skill: 'ap-select-all', conceptId: 'c1', title: 'A', order: 1 },
      { skill: 'ap-order-by', conceptId: 'c2', title: 'B', order: 2 },
      { skill: 'ap-where-comparison', conceptId: 'c3', title: 'C', order: 3 }
    ],
    concepts: [
      { id: 'c1', order: 1, skill: 'ap-select-all', title: 'A', exercises: [] },
      { id: 'c2', order: 2, skill: 'ap-order-by', title: 'B', exercises: [] },
      { id: 'c3', order: 3, skill: 'ap-where-comparison', title: 'C', exercises: [] }
    ],
    checkpoints: [
      { id: 'cpA', afterOrder: 3, drawFromSkills: ['ap-select-all', 'ap-order-by', 'ap-where-comparison'], title: 'A' }
    ],
    phases: [],
    exercises: []
  } as unknown as Track;

  describe('FOUNDATIONS_KEY v2 clamp-on-load migration', () => {
    beforeEach(() => localStorage.clear());

    it('uses the v2 storage key', () => {
      expect(FOUNDATIONS_KEY).toBe('sqlm:foundations:v2');
    });

    it('maxConceptOrder returns the largest concept.order in the track', () => {
      expect(maxConceptOrder(track)).toBe(3);
    });

    it('safely migrates a stale v1 blob: clamps out-of-range maxUnlockedOrder and drops unknown ids', () => {
      const stale = {
        skillCorrect: { 'ap-select-all': ['c1-r1'], 'legacy-window-fn': ['z9'] },
        attempts: { 'c1-r1': 2 },
        lastSql: { 'c1-r1': 'select 1' },
        lastPracticedSession: { 'ap-select-all': 4, 'legacy-window-fn': 7 },
        checkpointsPassed: ['cpA', 'cp-legacy'],
        sessionCounter: 9,
        reviewsPassed: { 'ap-select-all': 1, 'legacy-window-fn': 3 },
        maxUnlockedOrder: 999
      };
      const migrated = migrateFoundationsState(stale, track);

      expect(migrated.maxUnlockedOrder).toBe(3);                          // clamped to maxConceptOrder(track)
      expect(migrated.skillCorrect).toEqual({ 'ap-select-all': ['c1-r1'] }); // unknown skill dropped
      expect(migrated.reviewsPassed).toEqual({ 'ap-select-all': 1 });
      expect(migrated.lastPracticedSession).toEqual({ 'ap-select-all': 4 });
      expect(migrated.checkpointsPassed).toEqual(['cpA']);                // unknown checkpoint dropped
      expect(migrated.attempts).toEqual({ 'c1-r1': 2 });                  // attempts/lastSql are preserved
      expect(migrated.lastSql).toEqual({ 'c1-r1': 'select 1' });
      expect(migrated.sessionCounter).toBe(9);
    });

    it('returns a clean default state for a non-object blob', () => {
      const empty = {
        skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {},
        checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0
      };
      expect(migrateFoundationsState(null, track)).toEqual(empty);
      expect(migrateFoundationsState('nope', track)).toEqual(empty);
      expect(migrateFoundationsState(['array'], track)).toEqual(empty);
    });

    it('loadFoundations(track) reads the v2 key and applies the clamp end-to-end', () => {
      localStorage.setItem(FOUNDATIONS_KEY, JSON.stringify({
        skillCorrect: { 'ghost-skill': ['x'] },
        maxUnlockedOrder: 500,
        checkpointsPassed: ['cpA', 'ghost-cp']
      }));
      const s = loadFoundations(track);
      expect(s.maxUnlockedOrder).toBe(3);
      expect(s.skillCorrect).toEqual({});
      expect(s.checkpointsPassed).toEqual(['cpA']);
    });

    it('loadFoundations() without a track preserves the sanitized blob (no clamp)', () => {
      localStorage.setItem(FOUNDATIONS_KEY, JSON.stringify({ maxUnlockedOrder: 500, skillCorrect: { 'ghost-skill': ['x'] } }));
      const s = loadFoundations();
      expect(s.maxUnlockedOrder).toBe(500);
      expect(s.skillCorrect).toEqual({ 'ghost-skill': ['x'] });
    });
  });
  ```

- [ ] **Step 2: Run the client test red.**
  ```bash
  npm --prefix client exec -- vitest run src/lib/foundations-migrate.test.ts
  ```
  Expected failure: the run errors because `migrateFoundationsState` and `maxConceptOrder` are not exported (SyntaxError / "does not provide an export named 'migrateFoundationsState'"), and `FOUNDATIONS_KEY` is still `'sqlm:foundations:v1'`. Zero tests pass.

- [ ] **Step 3: Implement the v2 key, sanitizer, migration, and track-aware loader in `foundations.ts`.**
  In `C:\Dev\Projects\sql-mastery\client\src\lib\foundations.ts`, bump the key. Replace:
  ```ts
  export const FOUNDATIONS_KEY = 'sqlm:foundations:v1';
  ```
  with:
  ```ts
  export const FOUNDATIONS_KEY = 'sqlm:foundations:v2';
  ```
  Then replace the entire existing `loadFoundations` block (the `export function loadFoundations(): LearningState { ... }` function) with the sanitizer, the migration, and the track-aware loader:
  ```ts
  // Normalize a raw parsed blob into a well-typed LearningState (no track-awareness).
  function sanitizeState(parsed: Record<string, any>): LearningState {
    return {
      skillCorrect: asObject(parsed.skillCorrect),
      attempts: asObject(parsed.attempts),
      lastSql: asObject(parsed.lastSql),
      lastPracticedSession: asObject(parsed.lastPracticedSession),
      checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
      sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0,
      reviewsPassed: asObject(parsed.reviewsPassed),
      maxUnlockedOrder: Number.isFinite(parsed.maxUnlockedOrder) && parsed.maxUnlockedOrder > 0 ? parsed.maxUnlockedOrder : 0
    };
  }

  // v2 clamp-on-load migration. After JSON.parse + per-field sanitize, before return:
  //   - clamp maxUnlockedOrder to maxConceptOrder(track)
  //   - drop skillCorrect / reviewsPassed / lastPracticedSession entries whose skill is not in the track
  //   - drop checkpointsPassed ids not in the track
  // attempts / lastSql (keyed by exercise id) are left sanitized only. Returns defaultState()
  // for a non-object blob. Prevents a regeneration or renumber from resurrecting a false "graduated".
  export function migrateFoundationsState(parsed: unknown, track: Track): LearningState {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return defaultState();
    const base = sanitizeState(parsed as Record<string, any>);
    const validSkills = new Set(track.concepts.map((c) => c.skill));
    const validCheckpoints = new Set(track.checkpoints.map((cp) => cp.id));
    const pruneBySkill = <T>(m: Record<string, T>): Record<string, T> => {
      const out: Record<string, T> = {};
      Object.keys(m).forEach((k) => { if (validSkills.has(k)) out[k] = m[k]; });
      return out;
    };
    return {
      ...base,
      skillCorrect: pruneBySkill(base.skillCorrect),
      reviewsPassed: pruneBySkill(base.reviewsPassed),
      lastPracticedSession: pruneBySkill(base.lastPracticedSession),
      checkpointsPassed: base.checkpointsPassed.filter((id) => validCheckpoints.has(id)),
      maxUnlockedOrder: Math.min(base.maxUnlockedOrder, maxConceptOrder(track))
    };
  }

  // Load persisted foundations state. With a track, runs the v2 clamp-on-load migration so a
  // regenerated or renumbered curriculum can never resurrect a stale "graduated". Without a
  // track, returns the sanitized blob unchanged (today's behavior; used by unit fixtures).
  export function loadFoundations(track?: Track): LearningState {
    let parsed: unknown = null;
    try { parsed = JSON.parse(safeGet(FOUNDATIONS_KEY) as string); } catch { parsed = null; }
    if (track) return migrateFoundationsState(parsed, track);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return sanitizeState(parsed as Record<string, any>);
    return defaultState();
  }
  ```
  `defaultState`, `asObject`, and `maxConceptOrder` are hoisted function declarations, so referencing `maxConceptOrder` here is safe even though it is defined lower in the file. Now export the existing private `maxConceptOrder`. Replace:
  ```ts
  function maxConceptOrder(track: Track): number {
    return track.concepts.reduce((m, c) => Math.max(m, c.order), 0);
  }
  ```
  with:
  ```ts
  // The largest (already-globalized) concept.order present in the flattened track.
  export function maxConceptOrder(track: Track): number {
    return track.concepts.reduce((m, c) => Math.max(m, c.order), 0);
  }
  ```

- [ ] **Step 4: Run the client migration test green.**
  ```bash
  npm --prefix client exec -- vitest run src/lib/foundations-migrate.test.ts
  ```
  Expected: all 6 tests pass. Then confirm the pre-existing suite still passes (the v2 key rename is read via the exported constant, so `foundations.test.ts` is unaffected):
  ```bash
  npm --prefix client run typecheck
  npm --prefix client test
  ```
  Expected: typecheck clean, full vitest suite green.

- [ ] **Step 5: Wire the clamp into the app call site (`FoundationsContext.tsx`).**
  In `C:\Dev\Projects\sql-mastery\client\src\state\FoundationsContext.tsx`, add the import just below the existing learning-path import. Replace:
  ```tsx
  import { loadLearning, saveLearning, reconcileUnlock, duplicateSkills } from '../lib/learning-path';
  ```
  with:
  ```tsx
  import { loadLearning, saveLearning, reconcileUnlock, duplicateSkills } from '../lib/learning-path';
  import { migrateFoundationsState } from '../lib/foundations';
  ```
  Then replace the entire one-time reconcile effect. Replace:
  ```tsx
  const reconciled = useRef(false);
  useEffect(() => {
    if (!track || reconciled.current) return;
    reconciled.current = true;
    const mark = reconcileUnlock(track, state);
    if (mark > state.maxUnlockedOrder) update((s) => { s.maxUnlockedOrder = mark; });
    if (import.meta.env.DEV) {
      const dups = duplicateSkills(track);
      if (dups.length) console.error('Duplicate concept skills in learning track:', dups);
    }
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
  ```
  with:
  ```tsx
  const reconciled = useRef(false);
  useEffect(() => {
    if (!track || reconciled.current) return;
    reconciled.current = true;
    // v2 clamp-on-load: prune keys not in the live track and clamp the unlock mark to the
    // track's real ceiling (so a regenerated / renumbered curriculum cannot resurrect a stale
    // "graduated"), THEN back-fill the unlock high-water mark from real achievements.
    update((s) => {
      Object.assign(s, migrateFoundationsState(s, track));
      const mark = reconcileUnlock(track, s);
      if (mark > s.maxUnlockedOrder) s.maxUnlockedOrder = mark;
    });
    if (import.meta.env.DEV) {
      const dups = duplicateSkills(track);
      if (dups.length) console.error('Duplicate concept skills in learning track:', dups);
    }
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
  ```
  `update((mutate) => ...)` shallow-clones the prior state into `s`, runs the mutator, then persists via `saveLearning`; `Object.assign(s, migrateFoundationsState(s, track))` copies the pruned/clamped fields (including `maxUnlockedOrder`, `sessionCounter`) onto `s` before `reconcileUnlock` back-fills. Run the client checks again to confirm the provider still mounts cleanly:
  ```bash
  npm --prefix client run typecheck
  npm --prefix client test
  ```
  Expected: typecheck clean; full vitest suite (including `foundations-ui.test.tsx` and `ConceptPractice.test.tsx`) green.

- [ ] **Step 6: Add the build-time skill-id guardrail test and run it.**
  Create `C:\Dev\Projects\sql-mastery\test\skill-id-guardrail.test.ts` (top-level `test/`, node:test):
  ```ts
  import test from 'node:test';
  import assert from 'node:assert/strict';

  import { getLearningPath } from '../src/learning-path';

  // Detector: returns any concept skill used by more than one concept.
  function duplicateConceptSkills(concepts: Array<{ skill: string }>): string[] {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const c of concepts) {
      if (seen.has(c.skill)) dups.add(c.skill);
      seen.add(c.skill);
    }
    return [...dups];
  }

  test('flattened learning path skill ids are globally unique and 1:1 with concepts', () => {
    const path = getLearningPath();
    const concepts = path.concepts as Array<{ skill: string }>;
    const skills = path.skills as Array<{ skill: string }>;

    const dups = duplicateConceptSkills(concepts);
    assert.deepEqual(dups, [], `duplicate concept skill ids: ${dups.join(', ')}`);

    assert.equal(skills.length, concepts.length, 'skills[] length must equal concepts[] length');
    const conceptSkillSet = new Set(concepts.map((c) => c.skill));
    const skillSet = new Set(skills.map((s) => s.skill));
    assert.equal(conceptSkillSet.size, concepts.length, 'concept skills must be unique');
    assert.equal(skillSet.size, skills.length, 'skill entries must be unique');
    assert.deepEqual([...skillSet].sort(), [...conceptSkillSet].sort(), 'skills[] must be exactly the concept skill set');
  });

  test('the duplicate-skill detector catches a collision (guard bites)', () => {
    const collided = [{ skill: 'ap-x' }, { skill: 'ap-y' }, { skill: 'ap-x' }];
    assert.deepEqual(duplicateConceptSkills(collided), ['ap-x']);
  });
  ```
  Compile the server and run only this test file:
  ```bash
  npx tsc -p tsconfig.json
  node --test dist/test/skill-id-guardrail.test.js
  ```
  Expected: both tests pass. The first test is the build-time gate over the real flattened path (currently clean); the second proves the detector flags a collision, so once T14 wires in the aperture/sideline/rove phases any accidental duplicate skill slug will fail this test. Then confirm the whole server suite is still green:
  ```bash
  npm test
  ```
  Expected: server `node --test dist/test/*.test.js` passes and the client suite passes.

- [ ] **Step 7: Commit.**
  ```bash
  git add client/src/lib/foundations.ts client/src/lib/foundations-migrate.test.ts client/src/state/FoundationsContext.tsx test/skill-id-guardrail.test.ts
  git commit -m "$(cat <<'EOF'
  Task 2: skill-id guardrail + FOUNDATIONS_KEY v2 clamp + call-site

  - Bump FOUNDATIONS_KEY to sqlm:foundations:v2
  - Add migrateFoundationsState clamp-on-load: clamp maxUnlockedOrder to
    maxConceptOrder(track), drop skillCorrect/reviewsPassed/lastPracticedSession
    keys and checkpointsPassed ids not in the current track
  - Export maxConceptOrder; loadFoundations(track?) runs the clamp
  - Apply the clamp at the real load site (FoundationsProvider effect) before
    reconcileUnlock back-fills the unlock high-water mark
  - Build-time test: flattened concept skill ids are globally unique and 1:1
    with concepts (fails the suite on collision)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 3: schema-catalog + typed helpers

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\src\generator\schema-catalog.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\schema-catalog.test.ts`

**Interfaces:**
- Consumes (existing, unchanged): `createQueryService()` from `src/query-service.ts`; its returned service exposes the method `describeDatabase({ database })`, which resolves to `{ database, tables: Array<{ schema: string; name: string; estimatedRows: number|null; columns: Array<{ name: string; type: string; nullable: boolean; defaultValue: string|null; position: number; isPrimaryKey: boolean; foreignKey: { schema: string; table: string; column: string } | null }> }>, stats }`. The service also exposes `close()`.
- Produces (later tasks T4 bind/emit, T0 `types.ts` `BindingRule.predicate`, T5 assemble rely on these EXACT names/types):
  - `export interface ColumnInfo { name: string; dataType: string; isNullable: boolean; isPrimaryKey: boolean; }`
  - `export interface ForeignKey { fromTable: string; fromColumn: string; toTable: string; toColumn: string; }`
  - `export type JoinPair = ForeignKey;`
  - `export interface TableCatalog { schema: string; name: string; columns: ColumnInfo[]; primaryKey: string[]; foreignKeys: ForeignKey[]; }`
  - `export interface Catalog { database: string; tables: TableCatalog[]; }`
  - `export function loadCatalog(database: string): Promise<Catalog>;`
  - `export function numericCols(catalog: Catalog, table: string): ColumnInfo[];`
  - `export function textCols(catalog: Catalog, table: string): ColumnInfo[];`
  - `export function dateCols(catalog: Catalog, table: string): ColumnInfo[];`
  - `export function boolCols(catalog: Catalog, table: string): ColumnInfo[];`
  - `export function nullableCols(catalog: Catalog, table: string): ColumnInfo[];`
  - `export function pk(catalog: Catalog, table: string): string[];`
  - `export function fksFrom(catalog: Catalog, table: string): ForeignKey[];`
  - `export function fksTo(catalog: Catalog, table: string): ForeignKey[];`
  - `export function joinPairs(catalog: Catalog): JoinPair[];`

Notes carried from the global constraints: ASCII only (hyphen `-` and two-char arrow `->` only); CommonJS extensionless relative imports (NEVER a `.js` suffix); no `Math.random` / `Date.now` / argless `new Date` (this module is pure schema reflection, so no PRNG is needed, but do not introduce any of those calls); server tests live at top-level `test/`, compile to `dist/test/`, run via `node --test dist/test/*.test.js`; the DB password is supplied only as `PGPASSWORD` at runtime and must NEVER appear in any file.

---

- [ ] **Step 1: Write the failing test.** Create `C:\Dev\Projects\sql-mastery\test\schema-catalog.test.ts`. It loads the REAL seeded `aperture` catalog and asserts against real column names (`planets` / `stars` / `facility`), then exercises every helper. Import extensionless from `../src/generator/schema-catalog`.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadCatalog,
  numericCols,
  textCols,
  dateCols,
  boolCols,
  nullableCols,
  pk,
  fksFrom,
  fksTo,
  joinPairs,
  type Catalog
} from '../src/generator/schema-catalog';

// Loaded once; every helper test reuses the same real aperture catalog.
let catalog: Catalog;

test('loadCatalog(aperture) returns the seeded base tables', async () => {
  catalog = await loadCatalog('aperture');
  assert.equal(catalog.database, 'aperture');
  const names = catalog.tables.map((t) => t.name);
  assert.ok(names.includes('planets'), 'planets table present');
  assert.ok(names.includes('stars'), 'stars table present');
  assert.ok(names.includes('facility'), 'facility table present');
});

test('numericCols reports the real numeric columns', () => {
  const starsNum = numericCols(catalog, 'stars').map((c) => c.name);
  assert.ok(starsNum.includes('temperature_k'), 'integer counts as numeric');
  assert.ok(starsNum.includes('distance_ly'), 'numeric(8,2) counts as numeric');
  assert.ok(starsNum.includes('mass_solar'), 'nullable numeric counts as numeric');
  assert.ok(!starsNum.includes('star_name'), 'text is not numeric');
});

test('textCols reports the real text columns', () => {
  const starsText = textCols(catalog, 'stars').map((c) => c.name);
  assert.ok(starsText.includes('star_name'), 'text column');
  assert.ok(starsText.includes('spectral_type'), 'char(1) column is text');
  assert.ok(!starsText.includes('temperature_k'), 'integer is not text');
});

test('boolCols reports only boolean columns', () => {
  assert.deepEqual(
    boolCols(catalog, 'planets').map((c) => c.name),
    ['in_habitable_zone']
  );
});

test('dateCols is empty for aperture (no date/timestamp columns)', () => {
  assert.deepEqual(dateCols(catalog, 'stars'), []);
  assert.deepEqual(dateCols(catalog, 'planets'), []);
});

test('nullableCols reflects the real NULL-able columns', () => {
  const planetsNullable = nullableCols(catalog, 'planets').map((c) => c.name);
  assert.ok(planetsNullable.includes('equilibrium_temp_k'), 'nullable teaching column');
  assert.ok(planetsNullable.includes('mass_earth'), 'nullable numeric');
  assert.ok(!planetsNullable.includes('planet_id'), 'primary key is NOT NULL');
});

test('pk reports the primary key of each table', () => {
  assert.deepEqual(pk(catalog, 'planets'), ['planet_id']);
  assert.deepEqual(pk(catalog, 'stars'), ['star_id']);
  assert.deepEqual(pk(catalog, 'facility'), ['facility_id']);
});

test('fksFrom reports the outgoing foreign keys of planets', () => {
  const pf = fksFrom(catalog, 'planets');
  assert.ok(
    pf.some((fk) => fk.fromColumn === 'star_id' && fk.toTable === 'stars' && fk.toColumn === 'star_id'),
    'planets.star_id -> stars.star_id'
  );
  assert.ok(
    pf.some((fk) => fk.fromColumn === 'facility_id' && fk.toTable === 'facility' && fk.toColumn === 'facility_id'),
    'planets.facility_id -> facility.facility_id'
  );
});

test('fksTo reports the incoming foreign keys of stars', () => {
  const tf = fksTo(catalog, 'stars');
  assert.ok(
    tf.some((fk) => fk.fromTable === 'planets' && fk.fromColumn === 'star_id'),
    'planets.star_id references stars'
  );
});

test('joinPairs flattens every FK in the catalog', () => {
  const jp = joinPairs(catalog);
  assert.ok(jp.length >= 2, 'at least the two planets FKs');
  assert.ok(jp.some((p) => p.fromTable === 'planets' && p.toTable === 'stars'));
  assert.ok(jp.some((p) => p.fromTable === 'planets' && p.toTable === 'facility'));
});

test('helpers bind only to names that exist (unknown table -> empty)', () => {
  assert.deepEqual(numericCols(catalog, 'does_not_exist'), []);
  assert.deepEqual(pk(catalog, 'does_not_exist'), []);
  assert.deepEqual(fksFrom(catalog, 'does_not_exist'), []);
});
```

- [ ] **Step 2: Run the test RED.** From the repo root `C:\Dev\Projects\sql-mastery`, compile then run only this test. Compilation MUST fail because the module does not exist yet.

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json
```

Expected failure: `tsc` exits non-zero with an error like `test/schema-catalog.test.ts: error TS2307: Cannot find module '../src/generator/schema-catalog' or its corresponding type declarations.` No `dist/test/schema-catalog.test.js` is produced.

- [ ] **Step 3: Implement `schema-catalog.ts` (minimal, real code).** Create `C:\Dev\Projects\sql-mastery\src\generator\schema-catalog.ts`. `loadCatalog` reuses the existing `describeDatabase` method and closes its pools; helpers are pure over the returned `Catalog`. Type classification uses anchored regexes on the pg-formatted type string so substrings (e.g. the `int` inside `interval`) cannot misclassify.

```ts
import { createQueryService } from '../query-service';

export interface ColumnInfo {
  name: string;
  dataType: string;      // pg formatted_type / data_type from describeDatabase
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export type JoinPair = ForeignKey;

export interface TableCatalog {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}

export interface Catalog {
  database: string;
  tables: TableCatalog[];
}

// Anchored on the START of the pg-formatted type so e.g. 'interval' is NOT numeric
// and 'point' cannot match via a substring. Formatted types look like:
//   integer, bigint, numeric(8,2), character(1), text, boolean, timestamp without time zone.
function isNumericType(dataType: string): boolean {
  return /^(smallint|integer|bigint|int2|int4|int8|int|smallserial|bigserial|serial|numeric|decimal|real|double precision|money|float4|float8)/.test(
    dataType.toLowerCase()
  );
}

function isTextType(dataType: string): boolean {
  return /^(text|character varying|character|varchar|bpchar|char|citext|uuid|name)/.test(dataType.toLowerCase());
}

function isDateType(dataType: string): boolean {
  return /^(timestamptz|timestamp|date|timetz|time|interval)/.test(dataType.toLowerCase());
}

function isBoolType(dataType: string): boolean {
  return /^bool/.test(dataType.toLowerCase());
}

function tableOf(catalog: Catalog, table: string): TableCatalog | undefined {
  return catalog.tables.find((t) => t.name === table);
}

function colsOf(catalog: Catalog, table: string): ColumnInfo[] {
  const found = tableOf(catalog, table);
  return found ? found.columns : [];
}

export async function loadCatalog(database: string): Promise<Catalog> {
  const svc = createQueryService();
  try {
    const described = await svc.describeDatabase({ database });
    const rawTables: any[] = Array.isArray(described.tables) ? described.tables : [];

    const tables: TableCatalog[] = rawTables.map((t: any) => {
      const rawColumns: any[] = Array.isArray(t.columns) ? t.columns : [];

      const columns: ColumnInfo[] = rawColumns.map((c: any) => ({
        name: c.name,
        dataType: typeof c.type === 'string' ? c.type : '',
        isNullable: c.nullable === true,
        isPrimaryKey: c.isPrimaryKey === true
      }));

      const foreignKeys: ForeignKey[] = rawColumns
        .filter((c: any) => c.foreignKey)
        .map((c: any) => ({
          fromTable: t.name,
          fromColumn: c.name,
          toTable: c.foreignKey.table,
          toColumn: c.foreignKey.column
        }));

      const primaryKey: string[] = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

      return {
        schema: t.schema,
        name: t.name,
        columns,
        primaryKey,
        foreignKeys
      };
    });

    return { database, tables };
  } finally {
    await svc.close();
  }
}

export function numericCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsOf(catalog, table).filter((c) => isNumericType(c.dataType));
}

export function textCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsOf(catalog, table).filter((c) => isTextType(c.dataType));
}

export function dateCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsOf(catalog, table).filter((c) => isDateType(c.dataType));
}

export function boolCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsOf(catalog, table).filter((c) => isBoolType(c.dataType));
}

export function nullableCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsOf(catalog, table).filter((c) => c.isNullable);
}

export function pk(catalog: Catalog, table: string): string[] {
  const found = tableOf(catalog, table);
  return found ? found.primaryKey.slice() : [];
}

export function fksFrom(catalog: Catalog, table: string): ForeignKey[] {
  const found = tableOf(catalog, table);
  return found ? found.foreignKeys.slice() : [];
}

export function fksTo(catalog: Catalog, table: string): ForeignKey[] {
  const out: ForeignKey[] = [];
  for (const t of catalog.tables) {
    for (const fk of t.foreignKeys) {
      if (fk.toTable === table) out.push(fk);
    }
  }
  return out;
}

export function joinPairs(catalog: Catalog): JoinPair[] {
  const out: JoinPair[] = [];
  for (const t of catalog.tables) {
    for (const fk of t.foreignKeys) out.push(fk);
  }
  return out;
}
```

- [ ] **Step 4: Run the test GREEN.** Ensure a local seeded Postgres is reachable and `PGPASSWORD` is exported in the shell (never written to any file). Compile the whole project, then run just this test file.

```bash
cd /c/Dev/Projects/sql-mastery
export PGPASSWORD="$PGPASSWORD"   # already set in the environment; do NOT hardcode a value
npx tsc -p tsconfig.json
node --test dist/test/schema-catalog.test.js
```

Expected success: `tsc` exits 0, and `node --test` prints `# pass 11`, `# fail 0` (all eleven `test(...)` cases pass). If it reports `MISSING_DATABASE_PASSWORD` or `DATABASE_UNAVAILABLE`, the seeded Postgres is not running or `PGPASSWORD` is unset - start/seed the local `aperture` DB and re-run; do not change the code.

- [ ] **Step 5: Confirm no regressions in the full server test build.** Compile plus run the whole server suite to prove the new module did not break the tree.

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/*.test.js
```

Expected: `tsc` exits 0 and the aggregate run ends with `# fail 0`.

- [ ] **Step 6: Commit.** Stage the two new files and commit.

```bash
cd /c/Dev/Projects/sql-mastery
git add src/generator/schema-catalog.ts test/schema-catalog.test.ts
git commit -m "T3: schema-catalog loadCatalog + typed column/FK helpers

Add src/generator/schema-catalog.ts: loadCatalog(database) reflects the
seeded schema via the existing describeDatabase method into a typed
Catalog (tables, columns with dataType/nullable/pk, foreign keys), plus
numericCols/textCols/dateCols/boolCols/nullableCols/pk/fksFrom/fksTo/
joinPairs. Helpers bind only to names that exist. Unit-tested against the
real aperture schema (planets/stars/facility).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Generation core: DSL semantics + bind + emit

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\src\generator\emit.ts`
- Create: `C:\Dev\Projects\sql-mastery\src\generator\bind.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\reference-templates.ts` (worked aperture reference fixtures + fake catalog that T7 copies from; NOT a `*.test.ts`, so `node --test` skips it)
- Create: `C:\Dev\Projects\sql-mastery\test\emit.test.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\bind.test.ts`

**Interfaces:**

Consumes (exact signatures, do not redefine):
- From `src/generator/types` (T0): `Template`, `Slot`, `SlotKind`, `BindingRule`, `Binding`, `ScaffoldPlan`, `GateHints`.
  - `Slot = { name: string; kind: SlotKind; table?: string; op?: string; col?: string; sampleStrategy?: string }`
  - `Binding = { skill: string; database: string; bindingIndex: number; slots: Record<string,string>; literals: Record<string,string> }`
- From `src/generator/schema-catalog` (T3): `Catalog`, `TableCatalog`, `ColumnInfo`, `pk(catalog: Catalog, table: string): string[]`.
  - `Catalog = { database: string; tables: TableCatalog[] }`
  - `TableCatalog = { schema: string; name: string; columns: ColumnInfo[]; primaryKey: string[]; foreignKeys: ForeignKey[] }`
  - `ColumnInfo = { name: string; dataType: string; isNullable: boolean; isPrimaryKey: boolean }`
- From `src/datasets/framework/prng` (exists): `deriveStream(baseSeed: number, name: string): () => number`, `fnv1a(str: string): number`.

Produces (later tasks bind to these exact names):
- `src/generator/emit.ts` -> `export function emitSql(template: Template, binding: Binding, catalog: Catalog): string`
- `src/generator/bind.ts` -> `export function bindTemplate(template: Template, catalog: Catalog, probe: LiteralProbe): Promise<Binding[]>`, `export type LiteralProbe = (sql: string) => Promise<(string | null)[][]>`, and `export type { Binding } from './types'`.

Copy into every file: ASCII only (ASCII hyphen `-` and two-char arrow `->` only; no en/em dashes, no unicode arrows). Never `Math.random`, `Date.now`, or argless `new Date`; all randomness flows through `deriveStream` from `prng.ts`. CommonJS, extensionless relative imports (never a `.js` suffix).

---

- [ ] **Step 1: Write the worked reference-template fixture + fake catalog that emit and bind tests consume (and T7 copies).**

  Create `C:\Dev\Projects\sql-mastery\test\reference-templates.ts` verbatim. These three templates are the authoring convention for T7: no trailing ORDER BY, no hand ROUND, plain-identifier literal slots, `sortKey`/`groupCols` tiebreak slots, `pk`-from-catalog for joins.

```ts
// Worked aperture reference templates for Task 4 (emit/bind convention).
// T7 copies this exact shape. NOT a *.test.ts file, so node --test ignores it.
import type { Template } from '../src/generator/types';
import type { Catalog } from '../src/generator/schema-catalog';

const SCAFFOLD_PLAN = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' } as const;

// Reference 1: single-table WHERE with a compound AND lifted from ONE real row.
export const REF_WHERE: Template = {
  skill: 'ap-where-comparison',
  database: 'aperture',
  family: 'single-table',
  primaryTable: 'planets',
  // NO ORDER BY, NO ROUND in sqlShape. emit owns both.
  sqlShape:
    "SELECT planet_name, planet_type, orbital_period_days FROM planets " +
    "WHERE planet_type = '{ptype}' AND in_habitable_zone = {hz}",
  slots: [
    { name: 'ptype', kind: 'literal', op: '=', col: 'planet_type', sampleStrategy: 'compound-row' },
    { name: 'hz', kind: 'literal', op: '=', col: 'in_habitable_zone', sampleStrategy: 'compound-row' },
    { name: 'sortKey', kind: 'sortKey' }
  ],
  bindingRules: [
    // Deterministic tiebreak: sortKey must be a primary-key column of planets.
    { slot: 'sortKey', predicate: (v: string, cat: any) =>
        cat.tables.find((t: any) => t.name === 'planets').primaryKey.includes(v) }
  ],
  phrasings: [
    'List {ptype} planets in the habitable zone.',
    'Which {ptype} planets sit in the habitable zone?'
  ],
  hintTemplate: 'Filter planet_type and in_habitable_zone together in one WHERE.',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

// Reference 2: GROUP BY / HAVING with an AVG that emit must ROUND exactly once.
export const REF_GROUPED: Template = {
  skill: 'ap-group-by',
  database: 'aperture',
  family: 'grouped',
  primaryTable: 'planets',
  sqlShape:
    "SELECT {groupCols}, COUNT(*), AVG(orbital_period_days) FROM planets " +
    "GROUP BY {groupCols} HAVING COUNT(*) >= {minCount}",
  slots: [
    { name: 'groupCols', kind: 'groupCols' },
    { name: 'minCount', kind: 'limit' }
  ],
  bindingRules: [
    { slot: 'groupCols', predicate: (v: string) =>
        ['planet_type', 'discovery_method', 'discovery_year'].includes(v) }
  ],
  phrasings: [
    'Count planets and the average orbital period per {groupCols}.',
    'For each {groupCols}, show the planet count and average orbital period.'
  ],
  hintTemplate: 'GROUP BY {groupCols}, then filter groups with HAVING COUNT(*).',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

// Reference 3: intro JOIN. No sortKey/groupCols slot: emit tiebreaks on pk-from-catalog.
export const REF_JOIN: Template = {
  skill: 'ap-join-intro',
  database: 'aperture',
  family: 'join',
  primaryTable: 'planets',
  sqlShape:
    "SELECT planets.planet_name, stars.star_name FROM planets " +
    "JOIN stars ON planets.star_id = stars.star_id WHERE stars.spectral_type = '{stype}'",
  slots: [
    { name: 'stype', kind: 'literal', op: '=', col: 'spectral_type', table: 'stars', sampleStrategy: 'single' }
  ],
  bindingRules: [],
  phrasings: [
    'Show each planet with its host star for spectral type {stype}.',
    'Join planets to their host stars, keeping only spectral type {stype}.'
  ],
  hintTemplate: 'JOIN planets to stars on star_id, then filter stars.spectral_type.',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

export const REFERENCE_TEMPLATES: Template[] = [REF_WHERE, REF_GROUPED, REF_JOIN];

// Minimal in-memory Catalog matching datasets/schema/aperture.sql, used by both test files.
const col = (name: string, dataType: string, isNullable: boolean, isPrimaryKey: boolean) =>
  ({ name, dataType, isNullable, isPrimaryKey });

export const REFERENCE_CATALOG: Catalog = {
  database: 'aperture',
  tables: [
    {
      schema: 'public',
      name: 'planets',
      columns: [
        col('planet_id', 'integer', false, true),
        col('star_id', 'integer', false, false),
        col('planet_name', 'text', false, false),
        col('planet_type', 'text', false, false),
        col('orbital_period_days', 'numeric', false, false),
        col('in_habitable_zone', 'boolean', false, false)
      ],
      primaryKey: ['planet_id'],
      foreignKeys: [
        { fromTable: 'planets', fromColumn: 'star_id', toTable: 'stars', toColumn: 'star_id' }
      ]
    },
    {
      schema: 'public',
      name: 'stars',
      columns: [
        col('star_id', 'integer', false, true),
        col('star_name', 'text', false, false),
        col('spectral_type', 'char', false, false)
      ],
      primaryKey: ['star_id'],
      foreignKeys: []
    }
  ]
};
```

  Confirm it compiles before writing any test against it:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

  Expected: exit 0. (`reference-templates.ts` only imports existing T0/T3 types.)

---

- [ ] **Step 2: Write the failing emit test, plus a throwing emit stub so the test compiles and runs red.**

  First create the stub `C:\Dev\Projects\sql-mastery\src\generator\emit.ts`:

```ts
import type { Template, Binding } from './types';
import type { Catalog } from './schema-catalog';

export function emitSql(_template: Template, _binding: Binding, _catalog: Catalog): string {
  throw new Error('emitSql not implemented');
}
```

  Then create `C:\Dev\Projects\sql-mastery\test\emit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emitSql } from '../src/generator/emit';
import type { Template, Binding } from '../src/generator/types';
import { REF_WHERE, REF_GROUPED, REF_JOIN, REFERENCE_CATALOG } from './reference-templates';

const b = (slots: Record<string, string>, literals: Record<string, string>): Binding => ({
  skill: 'x', database: 'aperture', bindingIndex: 0, slots, literals
});

test('single-table emit: unique aliases + sortKey tiebreak, no double ORDER BY', () => {
  const sql = emitSql(REF_WHERE, b({ sortKey: 'planet_id' }, { ptype: 'Gas Giant', hz: 'true' }), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planet_name AS planet_name, planet_type AS planet_type, orbital_period_days AS orbital_period_days " +
    "FROM planets WHERE planet_type = 'Gas Giant' AND in_habitable_zone = true ORDER BY planet_id"
  );
  assert.equal((sql.match(/order by/gi) || []).length, 1);
});

test('grouped emit: single ROUND wrap, distinct aliases, groupCols tiebreak', () => {
  const sql = emitSql(REF_GROUPED, b({ groupCols: 'planet_type', minCount: '3' }, {}), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planet_type AS planet_type, COUNT(*) AS count, ROUND(AVG(orbital_period_days), 2) AS avg_orbital_period_days " +
    "FROM planets GROUP BY planet_type HAVING COUNT(*) >= 3 ORDER BY planet_type"
  );
  assert.equal((sql.match(/round\(/gi) || []).length, 1); // no double ROUND
  assert.equal((sql.match(/order by/gi) || []).length, 1); // no double ORDER BY
});

test('join emit: aliases + pk-from-catalog tiebreak', () => {
  const sql = emitSql(REF_JOIN, b({}, { stype: 'G' }), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planets.planet_name AS planet_name, stars.star_name AS star_name " +
    "FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE stars.spectral_type = 'G' " +
    "ORDER BY planets.planet_id"
  );
});

test('duplicate projected expressions get unique aliases (count, count_2)', () => {
  const dup: Template = {
    ...REF_WHERE,
    skill: 'ap-dup', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT COUNT(*), COUNT(*) FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey' }],
    bindingRules: []
  };
  const sql = emitSql(dup, b({ sortKey: 'planet_id' }, {}), REFERENCE_CATALOG);
  assert.equal(sql, 'SELECT COUNT(*) AS count, COUNT(*) AS count_2 FROM planets ORDER BY planet_id');
});

test('already-wrapped ROUND is not double-wrapped', () => {
  const t: Template = {
    ...REF_WHERE, skill: 'ap-preround', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT ROUND(AVG(orbital_period_days), 2) FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey' }], bindingRules: []
  };
  const sql = emitSql(t, b({ sortKey: 'planet_id' }, {}), REFERENCE_CATALOG);
  assert.equal((sql.match(/round\(/gi) || []).length, 1);
});

test('missing required tiebreak slot throws a descriptive error (not silent)', () => {
  const bad: Template = {
    ...REF_WHERE, skill: 'ap-notiebreak', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT planet_name FROM planets', slots: [], bindingRules: []
  };
  assert.throws(() => emitSql(bad, b({}, {}), REFERENCE_CATALOG), /sortKey/);
});
```

  Build and run red:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/emit.test.js
```

  Expected: compiles, then every test FAILS with `Error: emitSql not implemented`.

---

- [ ] **Step 3: Implement emit.ts (substitute -> alias + single-ROUND -> per-family tiebreak). Run green.**

  Replace the entire contents of `C:\Dev\Projects\sql-mastery\src\generator\emit.ts`:

```ts
import { pk } from './schema-catalog';
import type { Template, Binding } from './types';
import type { Catalog } from './schema-catalog';

// Fill {slot} placeholders from slots first, then literals. Unknown placeholder is a hard error.
function substitute(shape: string, binding: Binding): string {
  return shape.replace(/\{(\w+)\}/g, (_m, name: string) => {
    if (Object.prototype.hasOwnProperty.call(binding.slots, name)) return binding.slots[name];
    if (Object.prototype.hasOwnProperty.call(binding.literals, name)) return binding.literals[name];
    throw new Error(`emit: no binding for slot {${name}} (skill ${binding.skill})`);
  });
}

function parseFromTable(sql: string): string {
  const m = sql.match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!m) throw new Error('emit: cannot locate FROM table');
  return m[1];
}

// Split "SELECT <list> FROM <rest>" into pre/list/post at the top-level FROM.
function splitSelect(sql: string): { pre: string; list: string; post: string } {
  const sel = sql.match(/^\s*select\s+/i);
  if (!sel) throw new Error('emit: expected leading SELECT');
  const start = sel[0].length;
  let depth = 0;
  let inStr = false;
  for (let i = start; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") inStr = !inStr;
    else if (!inStr && ch === '(') depth += 1;
    else if (!inStr && ch === ')') depth -= 1;
    else if (
      !inStr && depth === 0 &&
      /\s/.test(sql[i - 1] || '') &&
      sql.slice(i, i + 4).toLowerCase() === 'from' &&
      /\s/.test(sql[i + 4] || ' ')
    ) {
      return { pre: sql.slice(0, start), list: sql.slice(start, i), post: sql.slice(i) };
    }
  }
  throw new Error('emit: no top-level FROM');
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = '';
  for (const ch of list) {
    if (ch === "'") inStr = !inStr;
    if (!inStr && ch === '(') depth += 1;
    if (!inStr && ch === ')') depth -= 1;
    if (!inStr && depth === 0 && ch === ',') { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur);
  return parts.map((p) => p.trim());
}

// Wrap a projection that contains AVG in ROUND(expr, 2) exactly once; never double-wrap.
function roundWrap(expr: string): string {
  if (!/\bavg\s*\(/i.test(expr)) return expr;
  if (/^\s*round\s*\(/i.test(expr)) return expr;
  return `ROUND(${expr}, 2)`;
}

function deriveAlias(expr: string): string {
  const qualified = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (qualified) return qualified[2];
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) return expr;
  const fn = expr.match(/^([a-zA-Z_]+)\s*\(\s*(\*|[a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (fn) {
    const name = fn[1].toLowerCase();
    if (fn[2] === '*') return name;
    const parts = fn[2].split('.');
    return `${name}_${parts[parts.length - 1]}`;
  }
  return 'expr';
}

function aliasProjections(sql: string): string {
  const { pre, list, post } = splitSelect(sql);
  if (list.trim() === '*') return sql; // SELECT * (ap-select-all) is exempt
  const used = new Set<string>();
  const out = splitTopLevel(list).map((raw) => {
    const asMatch = raw.match(/\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i);
    const original = asMatch ? raw.slice(0, asMatch.index).trim() : raw.trim();
    let base = asMatch ? asMatch[1] : deriveAlias(original);
    let alias = base;
    let n = 2;
    while (used.has(alias)) { alias = `${base}_${n}`; n += 1; }
    used.add(alias);
    return `${roundWrap(original)} AS ${alias}`;
  });
  return `${pre}${out.join(', ')} ${post}`;
}

function tiebreakKeys(template: Template, binding: Binding, catalog: Catalog, primaryTable: string): string[] {
  const csv = (v: string) => v.split(',').map((s) => s.trim()).filter((s) => s !== '');
  switch (template.family) {
    case 'single-table': {
      const v = binding.slots['sortKey'];
      if (v === undefined) throw new Error(`emit: family single-table requires a 'sortKey' slot (${template.skill})`);
      return csv(v);
    }
    case 'grouped': {
      const v = binding.slots['groupCols'];
      if (v === undefined) throw new Error(`emit: family grouped requires a 'groupCols' slot (${template.skill})`);
      return csv(v);
    }
    case 'windowed': {
      const p = binding.slots['partitionCols'];
      const r = binding.slots['rankKey'];
      if (p === undefined || r === undefined) {
        throw new Error(`emit: family windowed requires 'partitionCols' and 'rankKey' slots (${template.skill})`);
      }
      return [...csv(p), ...csv(r)];
    }
    default: {
      // join and any other family: deterministic pk-from-catalog tiebreak.
      const cols = pk(catalog, primaryTable);
      if (!cols || cols.length === 0) {
        throw new Error(`emit: family ${template.family} needs a primary key on ${primaryTable} (${template.skill})`);
      }
      return cols.map((c) => `${primaryTable}.${c}`);
    }
  }
}

export function emitSql(template: Template, binding: Binding, catalog: Catalog): string {
  const filled = substitute(template.sqlShape, binding);
  const primaryTable = template.primaryTable ?? parseFromTable(filled);
  const aliased = aliasProjections(filled);
  const keys = tiebreakKeys(template, binding, catalog, primaryTable);
  return `${aliased.trim()} ORDER BY ${keys.join(', ')}`;
}
```

  Run green:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/emit.test.js
```

  Expected: all 6 emit tests pass.

---

- [ ] **Step 4: Write the failing bind test, plus a throwing bind stub so it compiles and runs red.**

  First create the stub `C:\Dev\Projects\sql-mastery\src\generator\bind.ts`:

```ts
import type { Template, Binding } from './types';
import type { Catalog } from './schema-catalog';

export type { Binding } from './types';
export type LiteralProbe = (sql: string) => Promise<(string | null)[][]>;

export function bindTemplate(_t: Template, _c: Catalog, _p: LiteralProbe): Promise<Binding[]> {
  throw new Error('bindTemplate not implemented');
}
```

  Then create `C:\Dev\Projects\sql-mastery\test\bind.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bindTemplate } from '../src/generator/bind';
import type { LiteralProbe } from '../src/generator/bind';
import { REF_WHERE, REF_JOIN, REFERENCE_CATALOG } from './reference-templates';

// Fake probe: compound planets rows for the AND case, distinct stars types for the join case.
const PLANET_ROWS: (string | null)[][] = [
  ['Gas Giant', 'true'],
  ['Terrestrial', 'false'],
  ['Neptune-like', 'false']
];
const STAR_TYPES: (string | null)[][] = [['G'], ['K'], ['M']];
const probe: LiteralProbe = async (sql: string) => {
  if (/distinct\s+spectral_type/i.test(sql)) return STAR_TYPES;
  return PLANET_ROWS;
};

test('bind rejects non-pk sortKey candidates via predicate; keeps planet_id only', async () => {
  const bindings = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  assert.ok(bindings.length >= 1);
  for (const bnd of bindings) assert.equal(bnd.slots['sortKey'], 'planet_id');
});

test('compound AND literals are lifted from ONE co-occurring row (non-empty by construction)', async () => {
  const bindings = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  const rowSet = new Set(PLANET_ROWS.map((r) => `${r[0]}|${r[1]}`));
  for (const bnd of bindings) {
    assert.ok(bnd.literals['ptype'] && bnd.literals['ptype'].length > 0);
    assert.ok(bnd.literals['hz'] && bnd.literals['hz'].length > 0);
    // ptype/hz came from the SAME real row -> the AND predicate matches at least that row.
    assert.ok(rowSet.has(`${bnd.literals['ptype']}|${bnd.literals['hz']}`));
  }
});

test('bind is deterministic for a fixed seed', async () => {
  const a = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  const b = await bindTemplate(REF_WHERE, REFERENCE_CATALOG, probe);
  assert.deepEqual(a, b);
  assert.deepEqual(a.map((x) => x.bindingIndex), a.map((_x, i) => i)); // 0..n contiguous
});

test('bind draws a single literal for a template with no structural slots', async () => {
  const bindings = await bindTemplate(REF_JOIN, REFERENCE_CATALOG, probe);
  assert.ok(bindings.length >= 1);
  for (const bnd of bindings) {
    assert.ok(['G', 'K', 'M'].includes(bnd.literals['stype']));
    assert.deepEqual(bnd.slots, {}); // join reference declares no structural slots
  }
});
```

  Build and run red:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/bind.test.js
```

  Expected: compiles, all bind tests FAIL with `Error: bindTemplate not implemented`.

---

- [ ] **Step 5: Implement bind.ts (legal cross-product -> predicate reject -> seeded sample -> DISTINCT/compound-row literal probe). Run green.**

  Replace the entire contents of `C:\Dev\Projects\sql-mastery\src\generator\bind.ts`:

```ts
import { deriveStream } from '../datasets/framework/prng';
import type { Template, Slot, Binding } from './types';
import type { Catalog } from './schema-catalog';

export type { Binding } from './types';

// Live DISTINCT-probe. Backed by executeQuery({ database, sql, rowMode: 'array' }); values read as rows[i][0].
export type LiteralProbe = (sql: string) => Promise<(string | null)[][]>;

const BIND_SEED = 0x5f3759df;          // fixed generator seed; never Math.random / Date.now
const LIMIT_CANDIDATES = ['3', '5', '10'];
const TARGET_WITH_LITERALS = 8;        // literal templates get several bindings per accepted combo
const MAX_BINDINGS = 24;
const MAX_COMBOS = 5000;               // guard against structural cross-product blow-up

function parseFromTable(sql: string): string {
  const m = sql.match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!m) throw new Error('bind: cannot locate FROM table');
  return m[1];
}

function primaryTableOf(template: Template): string {
  return template.primaryTable ?? parseFromTable(template.sqlShape);
}

function tableColumns(catalog: Catalog, table: string): string[] {
  const t = catalog.tables.find((x) => x.name === table);
  if (!t) throw new Error(`bind: table ${table} not in catalog`);
  return t.columns.map((c) => c.name);
}

function candidatesFor(slot: Slot, template: Template, catalog: Catalog): string[] {
  const table = slot.table ?? primaryTableOf(template);
  switch (slot.kind) {
    case 'table':
      return catalog.tables.map((t) => t.name);
    case 'limit':
      return LIMIT_CANDIDATES;
    case 'literal':
      return []; // literals are probe-drawn, not cross-producted
    default:
      // column | projection | groupCols | sortKey | partitionCols | rankKey
      return tableColumns(catalog, table);
  }
}

async function drawLiterals(
  template: Template,
  literalSlots: Slot[],
  catalog: Catalog,
  probe: LiteralProbe,
  stream: () => number
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  // Compound AND/BETWEEN/IN: one probe, ONE sampled real row, all values co-occur.
  const compound = literalSlots.filter((s) => s.sampleStrategy === 'compound-row');
  if (compound.length > 0) {
    const table = compound[0].table ?? primaryTableOf(template);
    const cols = compound.map((s) => {
      if (!s.col) throw new Error(`bind: literal slot ${s.name} missing col`);
      return s.col;
    });
    const guards = cols.map((c) => `${c} IS NOT NULL`).join(' AND ');
    const sql = `SELECT ${cols.join(', ')} FROM ${table} WHERE ${guards} ORDER BY ${cols.join(', ')} LIMIT 500`;
    const rows = await probe(sql);
    if (rows.length > 0) {
      const row = rows[Math.floor(stream() * rows.length)];
      compound.forEach((s, j) => {
        const v = row[j];
        if (v !== null) out[s.name] = v;
      });
    }
  }

  // Single-value literals: one DISTINCT probe per slot.
  const singles = literalSlots.filter((s) => s.sampleStrategy !== 'compound-row');
  for (const s of singles) {
    if (!s.col) throw new Error(`bind: literal slot ${s.name} missing col`);
    const table = s.table ?? primaryTableOf(template);
    const sql = `SELECT DISTINCT ${s.col} FROM ${table} WHERE ${s.col} IS NOT NULL ORDER BY ${s.col}`;
    // eslint-disable-next-line no-await-in-loop
    const rows = await probe(sql);
    if (rows.length > 0) {
      const v = rows[Math.floor(stream() * rows.length)][0];
      if (v !== null) out[s.name] = v;
    }
  }

  return out;
}

export async function bindTemplate(
  template: Template,
  catalog: Catalog,
  probe: LiteralProbe
): Promise<Binding[]> {
  const structural = template.slots.filter((s) => s.kind !== 'literal');
  const literalSlots = template.slots.filter((s) => s.kind === 'literal');

  // Enumerate the legal slot cross-product.
  let combos: Record<string, string>[] = [{}];
  for (const slot of structural) {
    const cands = candidatesFor(slot, template, catalog);
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const v of cands) {
        next.push({ ...combo, [slot.name]: v });
        if (next.length >= MAX_COMBOS) break;
      }
      if (next.length >= MAX_COMBOS) break;
    }
    combos = next;
  }

  // Reject bindings that fail any predicate on a structural slot.
  const accepted = combos.filter((combo) =>
    template.bindingRules.every((rule) => {
      const v = combo[rule.slot];
      return v === undefined ? true : rule.predicate(v, catalog);
    })
  );

  if (structural.length > 0 && accepted.length === 0) return [];

  const hasLiterals = literalSlots.length > 0;
  const count = hasLiterals
    ? Math.min(MAX_BINDINGS, Math.max(accepted.length, TARGET_WITH_LITERALS))
    : Math.min(MAX_BINDINGS, accepted.length);

  const bindings: Binding[] = [];
  for (let bindingIndex = 0; bindingIndex < count; bindingIndex += 1) {
    const combo = accepted[bindingIndex % accepted.length];
    const stream = deriveStream(BIND_SEED, `${template.skill}:${bindingIndex}`);
    // eslint-disable-next-line no-await-in-loop
    const literals = await drawLiterals(template, literalSlots, catalog, probe, stream);
    bindings.push({
      skill: template.skill,
      database: template.database,
      bindingIndex,
      slots: { ...combo },
      literals
    });
  }
  return bindings;
}
```

  Run green:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/bind.test.js
```

  Expected: all 4 bind tests pass.

---

- [ ] **Step 6: Full build, run both suites together, then commit.**

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/emit.test.js dist/test/bind.test.js
```

  Expected: 10 tests pass, 0 fail. Then commit:

```bash
cd /c/Dev/Projects/sql-mastery && \
git add src/generator/emit.ts src/generator/bind.ts \
        test/reference-templates.ts test/emit.test.ts test/bind.test.ts && \
git commit -m "$(cat <<'EOF'
T4: generation core - bind (seeded cross-product + literal probes) + emit (tiebreak/alias/ROUND)

emit owns per-family ORDER BY (sortKey/groupCols/partitionCols+rankKey/pk-from-catalog),
unique AS aliases, and single ROUND wrap; bind enumerates the legal slot cross-product,
rejects predicate failures, samples deterministically via deriveStream, and lifts compound
AND literals from one co-occurring probe row. Includes 3 worked aperture reference templates.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

  Expected: one commit created containing the two source modules, the reference fixture, and both test files.

---

### Task 5: task-text + scaffold + hint + assemble + curate + buildAllExercises

Packaging layer: turn a bound template into a finished `DraftExercise`. Consumes `emitSql`/`bindTemplate` (T4), `loadCatalog` (T3), the query-service (T1), and the shared types (T0). Produces the client-shaped exercise object plus the new three-tier scaffold, and wires `buildAllExercises` to iterate the (still-empty at this task) template registries. Every tier of the scaffold fills back byte-for-byte, and curate collapses literal-only duplicates.

**Files:**
- Create `C:\Dev\Projects\sql-mastery\src\generator\task-text.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\hint.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\scaffold.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\assemble.ts`
- Create `C:\Dev\Projects\sql-mastery\src\generator\curate.ts`
- Modify `C:\Dev\Projects\sql-mastery\src\generator\index.ts` (replace T0 stub body with the real `buildAllExercises` / `buildExercisesFor`)
- Create `C:\Dev\Projects\sql-mastery\test\task-text.test.ts`
- Create `C:\Dev\Projects\sql-mastery\test\hint.test.ts`
- Create `C:\Dev\Projects\sql-mastery\test\scaffold.test.ts`
- Create `C:\Dev\Projects\sql-mastery\test\assemble.test.ts`
- Create `C:\Dev\Projects\sql-mastery\test\curate.test.ts`
- Create `C:\Dev\Projects\sql-mastery\test\build-all.test.ts`

**Interfaces:**

Consumes (exact signatures from the contract; do NOT redefine):
```ts
// src/generator/emit.ts  (T4)
export function emitSql(template: Template, binding: Binding, catalog: Catalog): string;
// src/generator/bind.ts  (T4)
export type LiteralProbe = (sql: string) => Promise<(string | null)[][]>;
export function bindTemplate(template: Template, catalog: Catalog, probe: LiteralProbe): Promise<Binding[]>;
// src/generator/schema-catalog.ts  (T3)
export function loadCatalog(database: string): Promise<Catalog>;
export interface Catalog { database: string; tables: TableCatalog[]; }
// src/query-service.ts  (T1) - method on the factory-produced service
const svc = createQueryService();
await svc.executeQuery({ database, sql, rowMode: 'array' }); // -> { fields, rows: unknown[][], rowCount }
// src/datasets/framework/prng.ts
export function fnv1a(str: string): number;
// src/generator/types.ts  (T0)
//   Template, Binding, Slot, SlotKind, DraftExercise, StarterSql, BlankMap,
//   ConceptMeta, TeachBlock, GateHints
```

Produces (later tasks bind to these EXACT names):
```ts
export function renderTask(template: Template, binding: Binding): string;                       // task-text.ts
export function renderHint(template: Template, binding: Binding): string;                        // hint.ts
export function buildScaffold(expectedSql: string, binding: Binding, template: Template):        // scaffold.ts
  { starterSql: StarterSql; blankMap: BlankMap };
export function assembleExercise(template: Template, binding: Binding, catalog: Catalog): DraftExercise; // assemble.ts
export function curate(drafts: DraftExercise[], meta: ConceptMeta[]): DraftExercise[];           // curate.ts
export function honestCounts(drafts: DraftExercise[]): Record<string, number>;                   // curate.ts
export function buildAllExercises(): Promise<Record<'aperture' | 'sideline' | 'rove', DraftExercise[]>>; // index.ts
export function buildExercisesFor(database: string): Promise<DraftExercise[]>;                   // index.ts
```

ASCII only. No `Math.random` / `Date.now` / argless `new Date`. Extensionless CommonJS relative imports (never a `.js` suffix). Tests live at top-level `test/` only.

---

- [ ] **Step 1: renderTask - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\task-text.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { renderTask } from '../src/generator/task-text';
  import type { Template, Binding } from '../src/generator/types';

  const template: Template = {
    skill: 'ap-task-demo', database: 'aperture', family: 'single-table',
    sqlShape: 'SELECT {col} FROM orders',
    slots: [{ name: 'col', kind: 'projection' }, { name: 'table', kind: 'table' }],
    bindingRules: [],
    phrasings: ['Show {col} labelled {col:human} from {table}'],
    hintTemplate: 'x',
    scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
    gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: false, boundedSlice: false }
  };
  const binding: Binding = {
    skill: 'ap-task-demo', database: 'aperture', bindingIndex: 3,
    slots: { col: 'unit_price', table: 'orders' }, literals: {}
  };

  test('renderTask substitutes exact and humanized placeholders, deterministically', () => {
    const t1 = renderTask(template, binding);
    const t2 = renderTask(template, binding);
    assert.equal(t1, t2);
    assert.equal(t1, 'Show unit_price labelled unit price from orders');
    assert.ok(!t1.includes('{'));
  });
  ```

  Run it (compile fails because the module does not exist yet):
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected RED: `error TS2307: Cannot find module '../src/generator/task-text' or its corresponding type declarations.`

- [ ] **Step 2: renderTask - implement minimal, run green.**

  Create `C:\Dev\Projects\sql-mastery\src\generator\task-text.ts`:
  ```ts
  // Fill one deterministic phrasing from the SAME binding emit uses.
  // {slot}       -> exact identifier/literal value (g7 needs exact column/alias names)
  // {slot:human} -> humanized form (underscores -> spaces) for readable prose
  import type { Template, Binding } from './types';
  import { fnv1a } from '../datasets/framework/prng';

  function humanize(value: string): string {
    return value.replace(/_/g, ' ');
  }

  function fillPlaceholders(text: string, binding: Binding): string {
    return text.replace(/\{([A-Za-z0-9_]+)(:human)?\}/g, (_m, name: string, human?: string) => {
      const raw = binding.slots[name] ?? binding.literals[name];
      if (raw === undefined) return `{${name}}`;
      return human ? humanize(raw) : raw;
    });
  }

  export function renderTask(template: Template, binding: Binding): string {
    const phrasings = template.phrasings.length > 0 ? template.phrasings : ['{__missing__}'];
    const idx = fnv1a(`${template.skill}:task:${binding.bindingIndex}`) % phrasings.length;
    return fillPlaceholders(phrasings[idx], binding).trim();
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/task-text.test.js
  ```
  Expected: `# pass 1  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: renderTask fills a deterministic phrasing from the binding"
  ```

- [ ] **Step 3: renderHint - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\hint.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { renderHint } from '../src/generator/hint';
  import type { Template, Binding } from '../src/generator/types';

  const template: Template = {
    skill: 'ap-hint-demo', database: 'aperture', family: 'single-table',
    sqlShape: 'SELECT {col} FROM orders',
    slots: [{ name: 'col', kind: 'projection' }],
    bindingRules: [],
    phrasings: ['x'],
    hintTemplate: 'Use column {col} on {col:human}',
    scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
    gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: false, boundedSlice: false }
  };
  const binding: Binding = {
    skill: 'ap-hint-demo', database: 'aperture', bindingIndex: 0,
    slots: { col: 'order_total' }, literals: {}
  };

  test('renderHint fills hintTemplate placeholders', () => {
    assert.equal(renderHint(template, binding), 'Use column order_total on order total');
  });
  ```

  Run it:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected RED: `error TS2307: Cannot find module '../src/generator/hint'`.

- [ ] **Step 4: renderHint - implement minimal, run green, commit.**

  Create `C:\Dev\Projects\sql-mastery\src\generator\hint.ts`:
  ```ts
  // Fill the hint template from the SAME binding as emit/task. Same placeholder grammar.
  import type { Template, Binding } from './types';

  function humanize(value: string): string {
    return value.replace(/_/g, ' ');
  }

  function fillPlaceholders(text: string, binding: Binding): string {
    return text.replace(/\{([A-Za-z0-9_]+)(:human)?\}/g, (_m, name: string, human?: string) => {
      const raw = binding.slots[name] ?? binding.literals[name];
      if (raw === undefined) return `{${name}}`;
      return human ? humanize(raw) : raw;
    });
  }

  export function renderHint(template: Template, binding: Binding): string {
    return fillPlaceholders(template.hintTemplate, binding).trim();
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/hint.test.js
  ```
  Expected: `# pass 1  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: renderHint fills the hint template from the binding"
  ```

- [ ] **Step 5: buildScaffold - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\scaffold.test.ts`. The test hand-writes `expectedSql` (no emit/DB dependency) and asserts the two load-bearing properties: each tier fills back byte-for-byte, and blank-count equals answer-token count per tier.
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { buildScaffold } from '../src/generator/scaffold';
  import type { Template, Binding } from '../src/generator/types';

  const template: Template = {
    skill: 'ap-scaffold-demo', database: 'aperture', family: 'single-table',
    primaryTable: 'track', sqlShape: 'SELECT {proj} FROM track WHERE {flt}',
    slots: [
      { name: 'proj', kind: 'projection' },
      { name: 'flt', kind: 'literal', op: '>', col: 'milliseconds' },
      { name: 'sortKey', kind: 'sortKey' },
      { name: 'lim', kind: 'limit' }
    ],
    bindingRules: [], phrasings: ['x'], hintTemplate: 'x',
    scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
    gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: true, boundedSlice: false }
  };
  const binding: Binding = {
    skill: 'ap-scaffold-demo', database: 'aperture', bindingIndex: 0,
    slots: { proj: 'name, milliseconds', sortKey: 'track_id', lim: '10' },
    literals: { flt: 'milliseconds > 300000' }
  };
  const expectedSql =
    'SELECT name, milliseconds FROM track WHERE milliseconds > 300000 ORDER BY track_id LIMIT 10;';

  function fillBack(starter: string, map: Record<string, string>): string {
    let s = starter;
    for (const [tok, ans] of Object.entries(map)) s = s.split(tok).join(ans);
    return s;
  }
  function blankCount(s: string): number {
    return (s.match(/__BLANK_\d+__/g) ?? []).length;
  }

  test('every tier fills back byte-for-byte to expectedSql', () => {
    const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
    for (const tier of ['full', 'half', 'blank'] as const) {
      assert.equal(fillBack(starterSql[tier], blankMap[tier]), expectedSql, `tier ${tier}`);
    }
  });

  test('blank-count equals answer-token count per tier', () => {
    const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
    for (const tier of ['full', 'half', 'blank'] as const) {
      assert.equal(blankCount(starterSql[tier]), Object.keys(blankMap[tier]).length, `tier ${tier}`);
    }
  });

  test('full keeps keywords visible; blank blanks whole clauses', () => {
    const { starterSql } = buildScaffold(expectedSql, binding, template);
    assert.ok(starterSql.full.includes('SELECT') && starterSql.full.includes('FROM'));
    assert.match(starterSql.blank, /SELECT __BLANK_\d+__/);
  });
  ```

  Run it:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected RED: `error TS2307: Cannot find module '../src/generator/scaffold'`.

- [ ] **Step 6: buildScaffold - implement, run green, commit.**

  Create `C:\Dev\Projects\sql-mastery\src\generator\scaffold.ts`. Help scale: `full` (tiny per-value blanks, all keywords shown = MOST help) > `half` (back-half clause bodies blanked) > `blank` (all top-level clause bodies blanked = LEAST help). Every tier is built by replacing exact substrings, so fill-back is byte-exact by construction.
  ```ts
  // Turn a canonical expectedSql into three help tiers + a per-tier blank -> answer map.
  // full: blank every value token (keywords + structure stay visible).
  // half: blank the back (harder) half of top-level clause BODIES.
  // blank: blank every top-level clause BODY (only clause keywords remain).
  import type { StarterSql, BlankMap, Binding, Template, SlotKind } from './types';

  const SQL_KEYWORDS = new Set([
    'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN',
    'LIKE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'AS', 'ON',
    'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'UNION', 'ALL', 'EXCEPT',
    'INTERSECT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'RECURSIVE', 'OVER',
    'PARTITION', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ROW_NUMBER', 'RANK',
    'DENSE_RANK', 'LAG', 'LEAD', 'NTILE', 'COALESCE', 'NULLIF', 'CAST', 'EXISTS', 'USING'
  ]);

  const RANK: Record<SlotKind, number> = {
    table: 1, limit: 1,
    column: 2, projection: 2, groupCols: 2, sortKey: 2, partitionCols: 2, rankKey: 2,
    literal: 3
  };

  interface Tok { text: string; word: boolean; }

  function tokenize(sql: string): Tok[] {
    const toks: Tok[] = [];
    const isWord = (c: string): boolean => /[A-Za-z0-9_$.]/.test(c);
    let i = 0;
    const n = sql.length;
    while (i < n) {
      const c = sql[i];
      if (c === "'") {
        let j = i + 1;
        while (j < n) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") { j += 2; continue; }
            j += 1; break;
          }
          j += 1;
        }
        toks.push({ text: sql.slice(i, j), word: true });
        i = j;
      } else if (isWord(c)) {
        let j = i;
        while (j < n && isWord(sql[j])) j += 1;
        toks.push({ text: sql.slice(i, j), word: true });
        i = j;
      } else {
        toks.push({ text: c, word: false });
        i += 1;
      }
    }
    return toks;
  }

  function answerAtoms(binding: Binding, template: Template): Set<string> {
    const atoms = new Set<string>();
    for (const slot of template.slots) {
      const value = binding.slots[slot.name] ?? binding.literals[slot.name];
      if (value === undefined || value === '') continue;
      // slot.kind picks RANK but full-tier blanks all ranks; RANK is retained for future tiers.
      void RANK[slot.kind];
      for (const t of tokenize(value)) {
        if (t.word) atoms.add(t.text);
      }
    }
    return atoms;
  }

  // Depth-0 clause bodies only (subquery clauses are skipped so spans never overlap).
  function topLevelClauseBodies(sql: string): Array<{ innerStart: number; innerEnd: number }> {
    const clauseRe = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/gi;
    const depth = new Array<number>(sql.length + 1).fill(0);
    let d = 0;
    let inStr = false;
    for (let i = 0; i < sql.length; i += 1) {
      depth[i] = d;
      const c = sql[i];
      if (inStr) {
        if (c === "'") {
          if (sql[i + 1] === "'") { i += 1; if (i < sql.length) depth[i] = d; } else inStr = false;
        }
      } else if (c === "'") inStr = true;
      else if (c === '(') d += 1;
      else if (c === ')') d = Math.max(0, d - 1);
    }
    const anchors: Array<{ kwStart: number; kwEnd: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = clauseRe.exec(sql)) !== null) {
      if (depth[m.index] === 0) anchors.push({ kwStart: m.index, kwEnd: m.index + m[0].length });
    }
    const spans: Array<{ innerStart: number; innerEnd: number }> = [];
    for (let k = 0; k < anchors.length; k += 1) {
      const bodyStart = anchors[k].kwEnd;
      const bodyEnd = k + 1 < anchors.length ? anchors[k + 1].kwStart : sql.length;
      let s = bodyStart;
      let e = bodyEnd;
      while (s < e && /\s/.test(sql[s])) s += 1;
      while (e > s && (/\s/.test(sql[e - 1]) || sql[e - 1] === ';')) e -= 1;
      if (e > s) spans.push({ innerStart: s, innerEnd: e });
    }
    return spans;
  }

  function buildFullTier(sql: string, atoms: Set<string>): { text: string; map: Record<string, string> } {
    const toks = tokenize(sql);
    const map: Record<string, string> = {};
    let out = '';
    let counter = 0;
    let prevWord = '';
    for (const t of toks) {
      if (t.word) {
        const isKw = SQL_KEYWORDS.has(t.text.toUpperCase());
        const afterAs = prevWord.toUpperCase() === 'AS';
        if (!isKw && !afterAs && atoms.has(t.text)) {
          const token = `__BLANK_${counter}__`;
          counter += 1;
          map[token] = t.text;
          out += token;
        } else {
          out += t.text;
        }
        prevWord = t.text;
      } else {
        out += t.text;
      }
    }
    return { text: out, map };
  }

  function buildClauseTier(sql: string, which: 'half' | 'blank'): { text: string; map: Record<string, string> } {
    const spans = topLevelClauseBodies(sql);
    const chosen = which === 'blank' ? spans : spans.slice(Math.ceil(spans.length / 2));
    const map: Record<string, string> = {};
    let out = '';
    let cursor = 0;
    let counter = 0;
    for (const sp of chosen) {
      out += sql.slice(cursor, sp.innerStart);
      const token = `__BLANK_${counter}__`;
      counter += 1;
      map[token] = sql.slice(sp.innerStart, sp.innerEnd);
      out += token;
      cursor = sp.innerEnd;
    }
    out += sql.slice(cursor);
    return { text: out, map };
  }

  export function buildScaffold(
    expectedSql: string,
    binding: Binding,
    template: Template
  ): { starterSql: StarterSql; blankMap: BlankMap } {
    const atoms = answerAtoms(binding, template);
    const full = buildFullTier(expectedSql, atoms);
    const half = buildClauseTier(expectedSql, 'half');
    const blank = buildClauseTier(expectedSql, 'blank');
    return {
      starterSql: { full: full.text, half: half.text, blank: blank.text },
      blankMap: { full: full.map, half: half.map, blank: blank.map }
    };
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/scaffold.test.js
  ```
  Expected: `# pass 3  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: buildScaffold produces byte-exact three-tier starterSql + blankMap"
  ```

- [ ] **Step 7: assembleExercise - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\assemble.test.ts`. The template/catalog mirror a T4 single-table reference template so `emitSql` accepts them; the test asserts determinism and the full `DraftExercise` shape without pinning `emitSql`'s exact output.
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { assembleExercise } from '../src/generator/assemble';
  import type { Template, Binding } from '../src/generator/types';
  import type { Catalog } from '../src/generator/schema-catalog';

  const catalog = {
    database: 'aperture',
    tables: [{
      schema: 'public', name: 'orders',
      columns: [
        { name: 'order_id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
        { name: 'total', dataType: 'numeric', isNullable: false, isPrimaryKey: false }
      ],
      primaryKey: ['order_id'],
      foreignKeys: []
    }]
  } as Catalog;

  const template: Template = {
    skill: 'ap-assemble-demo', database: 'aperture', family: 'single-table',
    primaryTable: 'orders', sqlShape: 'SELECT {proj} FROM orders WHERE {flt}',
    slots: [
      { name: 'proj', kind: 'projection' },
      { name: 'flt', kind: 'literal', op: '>', col: 'total' },
      { name: 'sortKey', kind: 'sortKey' }
    ],
    bindingRules: [], phrasings: ['Report {proj} from orders'], hintTemplate: 'Filter total {flt}',
    scaffoldPlan: { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' },
    gateHints: { minRows: 1, minDistinct: 1, rowCeiling: 200, orderMatters: true, boundedSlice: false }
  };
  const binding: Binding = {
    skill: 'ap-assemble-demo', database: 'aperture', bindingIndex: 0,
    slots: { proj: 'total', sortKey: 'order_id' }, literals: { flt: 'total > 100' }
  };

  test('assembleExercise is deterministic and produces a well-shaped DraftExercise', () => {
    const a = assembleExercise(template, binding, catalog);
    const b = assembleExercise(template, binding, catalog);
    assert.deepEqual(a, b);
    assert.ok(a.id.startsWith('ap-assemble-demo-'));
    assert.equal(a.skill, 'ap-assemble-demo');
    assert.equal(a.database, 'aperture');
    assert.equal(a.orderMatters, true);
    assert.equal(a.rowCeiling, 200);
    assert.ok(a.expectedSql.length > 0);
    for (const tier of ['full', 'half', 'blank'] as const) {
      assert.equal(typeof a.starterSql[tier], 'string');
      assert.equal(typeof a.blankMap[tier], 'object');
    }
    assert.ok(!('fingerprint' in a));
  });
  ```

  Run it:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected RED: `error TS2307: Cannot find module '../src/generator/assemble'`.

- [ ] **Step 8: assembleExercise - implement, run green, commit.**

  Create `C:\Dev\Projects\sql-mastery\src\generator\assemble.ts`. Deterministic id via `fnv1a` over the skill + a canonical (sorted) binding string.
  ```ts
  // Compose emit + scaffold + task + hint into the client-shaped DraftExercise.
  // The harness (T6) attaches the fingerprint after gates pass.
  import type { Catalog } from './schema-catalog';
  import type { DraftExercise, Template, Binding } from './types';
  import { emitSql } from './emit';
  import { buildScaffold } from './scaffold';
  import { renderTask } from './task-text';
  import { renderHint } from './hint';
  import { fnv1a } from '../datasets/framework/prng';

  function canonicalBinding(binding: Binding): string {
    const slots = Object.keys(binding.slots).sort()
      .map((k) => `${k}=${binding.slots[k]}`).join('|');
    const lits = Object.keys(binding.literals).sort()
      .map((k) => `${k}=${binding.literals[k]}`).join('|');
    return `${slots}#${lits}`;
  }

  export function assembleExercise(
    template: Template,
    binding: Binding,
    catalog: Catalog
  ): DraftExercise {
    const expectedSql = emitSql(template, binding, catalog).trim();
    const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
    const id = `${template.skill}-${fnv1a(`${template.skill}::${canonicalBinding(binding)}`).toString(36)}`;
    return {
      id,
      skill: template.skill,
      database: template.database,
      task: renderTask(template, binding),
      starterSql,
      blankMap,
      hint: renderHint(template, binding),
      expectedSql,
      orderMatters: template.gateHints.orderMatters,
      rowCeiling: template.gateHints.rowCeiling
    };
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/assemble.test.js
  ```
  Expected: `# pass 1  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: assembleExercise composes emit+scaffold+task+hint into a DraftExercise"
  ```

- [ ] **Step 9: curate + honestCounts - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\curate.test.ts`:
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { curate, honestCounts } from '../src/generator/curate';
  import type { DraftExercise, ConceptMeta } from '../src/generator/types';

  function draft(id: string, skill: string, expectedSql: string): DraftExercise {
    return {
      id, skill, database: 'aperture', task: 't', hint: 'h', expectedSql,
      starterSql: { full: '', half: '', blank: '' },
      blankMap: { full: {}, half: {}, blank: {} },
      orderMatters: true, rowCeiling: 200
    };
  }

  const meta: ConceptMeta[] = [{
    skill: 'ap-a', order: 1, title: 'A', phaseId: 'ap-basics',
    teach: { plain: '', mentalModel: '', example: { sql: '', note: '' } }
  }];

  test('curate collapses two exercises differing only by a numeric literal', () => {
    const a = draft('id-a', 'ap-a', 'SELECT name FROM track WHERE genre_id = 1 ORDER BY track_id;');
    const b = draft('id-b', 'ap-a', 'SELECT name FROM track WHERE genre_id = 2 ORDER BY track_id;');
    const out = curate([a, b], meta);
    assert.equal(out.length, 1);
    assert.equal(out[0].skill, 'ap-a');
  });

  test('curate drops skills not in meta; honestCounts reports per-skill', () => {
    const a = draft('id-a', 'ap-a', 'SELECT 1;');
    const x = draft('id-x', 'ap-unknown', 'SELECT 2;');
    const out = curate([a, x], meta);
    assert.equal(out.length, 1);
    assert.deepEqual(honestCounts(out), { 'ap-a': 1 });
  });
  ```

  Run it:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected RED: `error TS2307: Cannot find module '../src/generator/curate'`.

- [ ] **Step 10: curate + honestCounts - implement, run green, commit.**

  Create `C:\Dev\Projects\sql-mastery\src\generator\curate.ts`. Literal-agnostic skeleton dedup (numeric and string literals normalized away), difficulty ordering by clause count, deterministic per-skill cap, ordered by concept order from `meta`.
  ```ts
  // Skeleton dedup (ignore literals) + difficulty ordering + honest per-concept sampling.
  import type { DraftExercise, ConceptMeta } from './types';

  const MAX_PER_SKILL = 15;

  // Literal-agnostic canonical form: strings -> '?', numbers -> #, whitespace collapsed,
  // keywords upper. Two queries differing only by a literal share one skeleton.
  function skeleton(sql: string): string {
    return sql
      .replace(/'(?:[^']|'')*'/g, "'?'")
      .replace(/\b\d+(?:\.\d+)?\b/g, '#')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function difficultyRank(sql: string): number {
    const m = sql.match(/\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT|JOIN|OVER|WITH)\b/gi);
    return m ? m.length : 0;
  }

  export function curate(drafts: DraftExercise[], meta: ConceptMeta[]): DraftExercise[] {
    const metaSkills = new Set(meta.map((m) => m.skill));
    const orderOf = new Map(meta.map((m) => [m.skill, m.order] as const));

    const seen = new Set<string>();
    const deduped: DraftExercise[] = [];
    for (const d of drafts) {
      if (!metaSkills.has(d.skill)) continue;
      const key = `${d.skill}|${skeleton(d.expectedSql)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(d);
    }

    const bySkill = new Map<string, DraftExercise[]>();
    for (const d of deduped) {
      const arr = bySkill.get(d.skill) ?? [];
      arr.push(d);
      bySkill.set(d.skill, arr);
    }

    const skills = [...bySkill.keys()].sort(
      (a, b) => (orderOf.get(a) ?? 0) - (orderOf.get(b) ?? 0)
    );

    const out: DraftExercise[] = [];
    for (const skill of skills) {
      const arr = bySkill.get(skill)!;
      arr.sort((a, b) => {
        const dr = difficultyRank(a.expectedSql) - difficultyRank(b.expectedSql);
        if (dr !== 0) return dr;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      for (const d of arr.slice(0, MAX_PER_SKILL)) out.push(d);
    }
    return out;
  }

  export function honestCounts(drafts: DraftExercise[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const d of drafts) counts[d.skill] = (counts[d.skill] ?? 0) + 1;
    return counts;
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/curate.test.js
  ```
  Expected: `# pass 2  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: curate dedups literal-only twins + honestCounts per skill"
  ```

- [ ] **Step 11: buildAllExercises real body - write the failing test, run red.**

  Create `C:\Dev\Projects\sql-mastery\test\build-all.test.ts`. At this task the three template registries are still empty stubs (filled in T7/T10/T12), so `buildExercisesFor` must short-circuit to `[]` before touching the catalog or DB, keeping this test hermetic.
  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { buildAllExercises, buildExercisesFor } from '../src/generator/index';

  test('buildExercisesFor short-circuits empty registries without DB access', async () => {
    assert.deepEqual(await buildExercisesFor('aperture'), []);
    assert.deepEqual(await buildExercisesFor('sideline'), []);
    assert.deepEqual(await buildExercisesFor('rove'), []);
  });

  test('buildAllExercises returns a record keyed by the three databases', async () => {
    const all = await buildAllExercises();
    assert.deepEqual(Object.keys(all).sort(), ['aperture', 'rove', 'sideline']);
    assert.deepEqual(all.aperture, []);
    assert.deepEqual(all.sideline, []);
    assert.deepEqual(all.rove, []);
  });
  ```

  Run it (fails on the current T0 stub because the real short-circuiting `buildExercisesFor` body is not present yet; if the stub compiled, the assertions still guard behavior):
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/build-all.test.js
  ```
  Expected RED: either a compile error (stub lacks `buildExercisesFor`) or a failing assertion.

- [ ] **Step 12: buildAllExercises real body - implement, run green, commit.**

  Replace the entire contents of `C:\Dev\Projects\sql-mastery\src\generator\index.ts` with the real body. It reads the three template registries, binds every template via the live DISTINCT probe, and assembles each binding. Empty registries short-circuit before any DB access.
  ```ts
  // Iterate the per-dataset template registries -> bind -> emit -> assemble.
  // Real body for T5; registries are filled by T7/T10/T12.
  import { createQueryService } from '../query-service';
  import { loadCatalog } from './schema-catalog';
  import { bindTemplate } from './bind';
  import type { LiteralProbe } from './bind';
  import { assembleExercise } from './assemble';
  import type { DraftExercise, Template } from './types';
  import { APERTURE_TEMPLATES } from './templates/aperture';
  import { SIDELINE_TEMPLATES } from './templates/sideline';
  import { ROVE_TEMPLATES } from './templates/rove';

  const REGISTRY: Record<string, Template[]> = {
    aperture: APERTURE_TEMPLATES,
    sideline: SIDELINE_TEMPLATES,
    rove: ROVE_TEMPLATES
  };

  export async function buildExercisesFor(database: string): Promise<DraftExercise[]> {
    const templates = REGISTRY[database] ?? [];
    if (templates.length === 0) return [];

    const svc = createQueryService();
    const catalog = await loadCatalog(database);
    const probe: LiteralProbe = async (sql) => {
      const res = await svc.executeQuery({ database, sql, rowMode: 'array' });
      return res.rows as (string | null)[][];
    };

    const drafts: DraftExercise[] = [];
    for (const template of templates) {
      const bindings = await bindTemplate(template, catalog, probe);
      for (const binding of bindings) {
        drafts.push(assembleExercise(template, binding, catalog));
      }
    }
    return drafts;
  }

  export async function buildAllExercises(): Promise<
    Record<'aperture' | 'sideline' | 'rove', DraftExercise[]>
  > {
    return {
      aperture: await buildExercisesFor('aperture'),
      sideline: await buildExercisesFor('sideline'),
      rove: await buildExercisesFor('rove')
    };
  }
  ```

  Run green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/build-all.test.js
  ```
  Expected: `# pass 2  # fail 0`.

  Commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add -A && git commit -m "T5: buildAllExercises binds+emits+assembles the template registries"
  ```

- [ ] **Step 13: Full verification of the packaging layer, then commit.**

  Compile the whole project and run every packaging test together to confirm nothing regressed and all six new files integrate:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/task-text.test.js dist/test/hint.test.js dist/test/scaffold.test.js dist/test/assemble.test.js dist/test/curate.test.js dist/test/build-all.test.js
  ```
  Expected: total `# pass 10  # fail 0` across the six files.

  Confirm no en/em dashes or non-ASCII slipped into the new sources (must print nothing):
  ```bash
  cd /c/Dev/Projects/sql-mastery && grep -RPn "[^\x00-\x7F]" src/generator/task-text.ts src/generator/hint.ts src/generator/scaffold.ts src/generator/assemble.ts src/generator/curate.ts src/generator/index.ts test/task-text.test.ts test/hint.test.ts test/scaffold.test.ts test/assemble.test.ts test/curate.test.ts test/build-all.test.ts
  ```
  Expected: no output.

  Final commit recording the completed packaging layer:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git commit --allow-empty -m "T5: packaging layer complete (task-text, scaffold, hint, assemble, curate, buildAllExercises)"
  ```

---

### Task 6: validate-exercises + gates g0-g9 + generate-exercises + snapshot

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\src\snapshot.ts`
- Create: `C:\Dev\Projects\sql-mastery\scripts\validate-exercises.ts`
- Create: `C:\Dev\Projects\sql-mastery\scripts\generate-exercises.ts`
- Create: `C:\Dev\Projects\sql-mastery\scripts\snapshots\.gitkeep`
- Create: `C:\Dev\Projects\sql-mastery\test\snapshot.test.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\validate-exercises.test.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\generate-exercises.test.ts`
- Modify: `C:\Dev\Projects\sql-mastery\package.json` (npm scripts only)

**Interfaces:**

Consumes (exact signatures from prior tasks; do NOT redefine):
- From `../src/query-service`: `createQueryService(options?): { executeQuery(input:{database:string;sql:string;rowMode?:'array'}): Promise<{columns:string[];rows:unknown[][]|Record<string,unknown>[];rowCount:number}>; describeDatabase(input:{database:string}): Promise<{database:string;tables:{schema:string;name:string;columns:{name:string;type:string;nullable:boolean;position:number}[]}[]}>; listDatabases(): string[]; close(): Promise<void> }` (T1 adds `rowMode:'array'` so `rows` are index-aligned `unknown[][]`).
- From `../src/fingerprint`: `buildFingerprint(result:{fields:{name:string}[];rows:unknown[][]}): Fingerprint`, `toPositionalRows(result:{fields:{name:string}[];rows:unknown[][]}): (string|null)[][]`, `hashRowsOrdered(rows:(string|null)[][]): string`.
- From `../src/generator/types`: `Exercise`, `DraftExercise`, `ScaffoldTier`, `ConceptMeta`, `Fingerprint`.
- From `../src/generator/index`: `buildAllExercises(): Promise<Record<'aperture'|'sideline'|'rove',DraftExercise[]>>`, `buildExercisesFor(database:string): Promise<DraftExercise[]>`.
- From `../src/generator/curate`: `curate(drafts:DraftExercise[], meta:ConceptMeta[]): DraftExercise[]`.
- From `../src/generator/templates/{aperture,sideline,rove}/index`: `APERTURE_CONCEPT_META`, `SIDELINE_CONCEPT_META`, `ROVE_CONCEPT_META` (all `ConceptMeta[]`).

Produces (later tasks bind to these exact names):
- `src/snapshot.ts`: `computeSnapshotHash(database:string, deps?:{service?:QueryLike}): Promise<string>` (the ONLY snapshot hash fn; T18 serve-time assertion imports it), plus additive helpers `snapshotFilePath(database:string): string`, `readServedSnapshot(database:string): string|null`, `recordSnapshot(database:string, deps?:{service?:QueryLike}): Promise<string>`.
- `scripts/validate-exercises.ts`: `validateExercises(exercises:Exercise[], deps?:HarnessDeps): Promise<{passed:Exercise[];failures:Array<{id:string;results:GateResult[]}>}>`, `GateContext`, `GateResult`, `Gate`, and gates `g0SnapshotIdentity`..`g9SelfCheck`, plus `GATES: Gate[]`.
- `scripts/generate-exercises.ts`: CLI (`--db`) writing `src/phases/<db>/exercises.generated.ts` exporting `GENERATED_EXERCISES: Record<string, Exercise[]>` (real fingerprints; NO phase structure; reads NO phase-plan JSON).

Note on `GateContext`: the four contract fields (`exercise`, `database`, `result`, `validationSnapshot`, `servedSnapshot`) are exactly as specified; an additive OPTIONAL `run?` runner is included so `g1`/`g5`/`g9` can execute probe queries. It is optional and never renames a contract field.

---

- [ ] **Step 1: Red - snapshot determinism test.** Create the snapshots dir marker and a failing test that pins `computeSnapshotHash` determinism against a fake service (no live DB).

  Create `C:\Dev\Projects\sql-mastery\scripts\snapshots\.gitkeep` (empty file):
  ```text
  ```

  Create `C:\Dev\Projects\sql-mastery\test\snapshot.test.ts`:
  ```ts
  import test from 'node:test';
  import assert from 'node:assert/strict';

  import { computeSnapshotHash } from '../src/snapshot';

  function fakeService(digest: string) {
    return {
      async describeDatabase(_input: { database: string }) {
        return {
          database: 'aperture',
          tables: [
            {
              schema: 'public',
              name: 'cameras',
              columns: [
                { name: 'id', type: 'integer', nullable: false, position: 1 },
                { name: 'model', type: 'text', nullable: true, position: 2 }
              ]
            }
          ]
        };
      },
      async executeQuery(_input: { database: string; sql: string }) {
        return { columns: ['n', 'd'], rows: [{ n: '3', d: digest }], rowCount: 1 };
      }
    };
  }

  test('computeSnapshotHash is deterministic for identical DB content', async () => {
    const a = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
    const b = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('computeSnapshotHash changes when table content digest changes', async () => {
    const a = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
    const b = await computeSnapshotHash('aperture', { service: fakeService('xyz') as any });
    assert.notEqual(a, b);
  });
  ```

  Run it red:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected failure: `error TS2307: Cannot find module '../src/snapshot' or its corresponding type declarations.`

- [ ] **Step 2: Green - implement `src/snapshot.ts`.** One hash function; deterministic; no `Date.now`/`Math.random`; ASCII only.

  Create `C:\Dev\Projects\sql-mastery\src\snapshot.ts`:
  ```ts
  import * as fs from 'node:fs';
  import * as path from 'node:path';
  import { createHash } from 'node:crypto';

  import { createQueryService } from './query-service';

  // Minimal structural type of the query service this module needs (DI for tests).
  interface QueryLike {
    describeDatabase(input: { database: string }): Promise<{
      database: string;
      tables: Array<{
        schema: string;
        name: string;
        columns: Array<{ name: string; type: string; nullable: boolean; position: number }>;
      }>;
    }>;
    executeQuery(input: { database: string; sql: string; rowMode?: 'array' }): Promise<{
      columns: string[];
      rows: any[];
      rowCount: number;
    }>;
  }

  function quoteIdent(value: string): string {
    return '"' + value.replace(/"/g, '""') + '"';
  }

  // dist/src/snapshot.js -> up two levels to repo root, then scripts/snapshots.
  export function snapshotFilePath(database: string): string {
    return path.join(__dirname, '..', '..', 'scripts', 'snapshots', `${database}.snapshot.json`);
  }

  // The ONLY snapshot hash function. Deterministic over schema shape + per-table exact
  // row count + an ordered content digest. Fingerprints are valid only across identical
  // snapshots; g0SnapshotIdentity compares this against the recorded served hash.
  export async function computeSnapshotHash(
    database: string,
    deps: { service?: QueryLike } = {}
  ): Promise<string> {
    const service: QueryLike = deps.service || (createQueryService() as unknown as QueryLike);
    const schema = await service.describeDatabase({ database });
    const tables = [...schema.tables].sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)
    );

    const hash = createHash('sha256');
    hash.update(`db:${database}\n`);

    for (const t of tables) {
      const cols = [...t.columns]
        .sort((a, b) => a.position - b.position)
        .map((c) => `${c.name}:${c.type}:${c.nullable ? 1 : 0}`)
        .join(',');
      hash.update(`table:${t.schema}.${t.name}|cols:${cols}\n`);

      const rel = `${quoteIdent(t.schema)}.${quoteIdent(t.name)}`;
      const digestSql =
        `SELECT COUNT(*) AS n, ` +
        `COALESCE(MD5(STRING_AGG(x.rowtext, ',' ORDER BY x.rowtext)), '') AS d ` +
        `FROM (SELECT (r)::text AS rowtext FROM ${rel} r) x`;
      const res = await service.executeQuery({ database, sql: digestSql });
      const row = (res.rows && res.rows[0]) || {};
      hash.update(`rows:${row.n}|digest:${row.d}\n`);
    }

    return hash.digest('hex');
  }

  export function readServedSnapshot(database: string): string | null {
    const file = snapshotFilePath(database);
    if (!fs.existsSync(file)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return typeof parsed.snapshotHash === 'string' ? parsed.snapshotHash : null;
    } catch {
      return null;
    }
  }

  export async function recordSnapshot(
    database: string,
    deps: { service?: QueryLike } = {}
  ): Promise<string> {
    const hash = await computeSnapshotHash(database, deps);
    const file = snapshotFilePath(database);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ database, snapshotHash: hash }, null, 2) + '\n');
    return hash;
  }
  ```

  Run it green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/snapshot.test.js
  ```
  Expected: both tests pass (`# pass 2`, `# fail 0`).

- [ ] **Step 3: Commit snapshot mechanism.**
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add src/snapshot.ts test/snapshot.test.ts scripts/snapshots/.gitkeep && git commit -m "T6: single snapshot mechanism (computeSnapshotHash)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

- [ ] **Step 4: Red - pure-gate tests (g3, g6, g7, g8) and the harness fingerprint bake.** These pin the gate behaviors the contract requires me to show, plus that passers get a real fingerprint attached.

  Create `C:\Dev\Projects\sql-mastery\test\validate-exercises.test.ts`:
  ```ts
  import test from 'node:test';
  import assert from 'node:assert/strict';

  import { buildFingerprint } from '../src/fingerprint';
  import type { Exercise } from '../src/generator/types';
  import {
    g3RowCeiling,
    g5NonDegenerate,
    g6DuplicateColumnName,
    g7TaskAnswerDeterminism,
    g8ScaffoldFillBack,
    validateExercises,
    type GateContext
  } from '../scripts/validate-exercises';

  const DUMMY_FP = {
    columns: [],
    rowCount: 0,
    orderedRowHash: '',
    unorderedRowHash: ''
  };

  function makeExercise(over: Partial<Exercise>): Exercise {
    return {
      id: 'x1',
      skill: 'ap-order-by',
      database: 'aperture',
      task: 'List each camera model and its price ordered by price then model.',
      starterSql: { full: '', half: '', blank: '' },
      blankMap: { full: {}, half: {}, blank: {} },
      hint: 'hint',
      expectedSql: 'SELECT model, price FROM cameras ORDER BY price, model',
      orderMatters: true,
      rowCeiling: 200,
      fingerprint: DUMMY_FP,
      ...over
    } as Exercise;
  }

  function makeCtx(
    exercise: Exercise,
    result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number },
    run?: GateContext['run']
  ): GateContext {
    return {
      exercise,
      database: exercise.database,
      result,
      validationSnapshot: 'same',
      servedSnapshot: 'same',
      run
    };
  }

  test('g3 fails when rowCount exceeds the ceiling', async () => {
    const ex = makeExercise({ rowCeiling: 50 });
    const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 51 });
    assert.equal((await g3RowCeiling(ctx)).pass, false);
    const ok = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 50 });
    assert.equal((await g3RowCeiling(ok)).pass, true);
  });

  test('g6 fails on duplicate output column names', async () => {
    const ex = makeExercise({});
    const dup = makeCtx(ex, { fields: [{ name: 'total' }, { name: 'total' }], rows: [], rowCount: 0 });
    assert.equal((await g6DuplicateColumnName(dup)).pass, false);
    const uniq = makeCtx(ex, { fields: [{ name: 'a' }, { name: 'b' }], rows: [], rowCount: 0 });
    assert.equal((await g6DuplicateColumnName(uniq)).pass, true);
  });

  test('g7 fails when the task does not name a projected alias', async () => {
    const ex = makeExercise({ task: 'Show model only.' });
    const ctx = makeCtx(ex, {
      fields: [{ name: 'model' }, { name: 'price' }],
      rows: [],
      rowCount: 0
    });
    assert.equal((await g7TaskAnswerDeterminism(ctx)).pass, false);
  });

  test('g7 requires a stable ORDER BY even when orderMatters is false', async () => {
    const ex = makeExercise({
      orderMatters: false,
      task: 'Show model and price.',
      expectedSql: 'SELECT model, price FROM cameras'
    });
    const ctx = makeCtx(ex, {
      fields: [{ name: 'model' }, { name: 'price' }],
      rows: [],
      rowCount: 0
    });
    assert.equal((await g7TaskAnswerDeterminism(ctx)).pass, false);
  });

  test('g8 passes when every tier fills back to expectedSql', async () => {
    const ex = makeExercise({
      expectedSql: 'SELECT model FROM cameras ORDER BY model',
      starterSql: {
        full: 'SELECT __1__ FROM cameras ORDER BY __2__',
        half: 'SELECT __1__ FROM cameras ORDER BY model',
        blank: 'SELECT model FROM cameras ORDER BY model'
      },
      blankMap: {
        full: { __1__: 'model', __2__: 'model' },
        half: { __1__: 'model' },
        blank: {}
      }
    });
    const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 0 });
    assert.equal((await g8ScaffoldFillBack(ctx)).pass, true);
  });

  test('g8 fails when a tier does not reconstruct expectedSql', async () => {
    const ex = makeExercise({
      expectedSql: 'SELECT model FROM cameras ORDER BY model',
      starterSql: { full: 'SELECT __1__ FROM cameras ORDER BY model', half: '', blank: '' },
      blankMap: { full: { __1__: 'price' }, half: {}, blank: {} }
    });
    const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 0 });
    assert.equal((await g8ScaffoldFillBack(ctx)).pass, false);
  });

  test('g5 fails a GROUP BY that yields a single group', async () => {
    const ex = makeExercise({
      expectedSql: 'SELECT brand, COUNT(*) AS n FROM cameras GROUP BY brand ORDER BY brand'
    });
    const ctx = makeCtx(ex, { fields: [{ name: 'brand' }, { name: 'n' }], rows: [['a', '9']], rowCount: 1 });
    assert.equal((await g5NonDegenerate(ctx)).pass, false);
  });

  test('validateExercises bakes a real fingerprint onto passers', async () => {
    const ex = makeExercise({
      expectedSql: 'SELECT model, price FROM cameras ORDER BY price, model',
      task: 'List model and price ordered by price then model.'
    });
    const arrayResult = {
      columns: ['model', 'price'],
      rows: [
        ['a', '10'],
        ['b', '20']
      ],
      rowCount: 2
    };
    const service = {
      listDatabases: () => ['aperture', 'sideline', 'rove'],
      async executeQuery(_i: { database: string; sql: string; rowMode?: 'array' }) {
        return arrayResult;
      }
    };
    const { passed, failures } = await validateExercises([ex], {
      service: service as any,
      computeSnapshot: async () => 'snap',
      readServed: () => 'snap'
    });
    assert.equal(failures.length, 0);
    assert.equal(passed.length, 1);
    const expectedFp = buildFingerprint({
      fields: [{ name: 'model' }, { name: 'price' }],
      rows: arrayResult.rows
    });
    assert.deepEqual(passed[0].fingerprint, expectedFp);
  });
  ```

  Run it red:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected failure: `error TS2307: Cannot find module '../scripts/validate-exercises' or its corresponding type declarations.`

- [ ] **Step 5: Green - implement `scripts/validate-exercises.ts`.** All gates g0-g9, helpers, and the harness. Exactly one G0, one snapshot mechanism (imports `src/snapshot`). ASCII only; deterministic.

  Create `C:\Dev\Projects\sql-mastery\scripts\validate-exercises.ts`:
  ```ts
  import { createQueryService } from '../src/query-service';
  import type { Exercise, ScaffoldTier } from '../src/generator/types';
  import { buildFingerprint, toPositionalRows, hashRowsOrdered } from '../src/fingerprint';
  import { computeSnapshotHash, readServedSnapshot } from '../src/snapshot';
  import { buildAllExercises } from '../src/generator/index';

  export interface GateContext {
    exercise: Exercise;
    database: string;
    result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number };
    validationSnapshot: string;
    servedSnapshot: string;
    // Additive optional probe runner (array-mode). Populated by the harness.
    run?: (sql: string) => Promise<{ fields: { name: string }[]; rows: unknown[][]; rowCount: number }>;
  }

  export interface GateResult {
    gate: string;
    pass: boolean;
    message: string;
  }

  export type Gate = (ctx: GateContext) => GateResult | Promise<GateResult>;

  // ---------------------------------------------------------------------------
  // Shared SQL text helpers (regex-level; deterministic; ASCII only).
  // ---------------------------------------------------------------------------

  function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeSql(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function wordPresent(haystack: string, needle: string): boolean {
    const n = needle.toLowerCase().trim();
    if (!n) return true;
    return new RegExp(`(^|[^a-z0-9_])${escapeRegExp(n)}([^a-z0-9_]|$)`, 'i').test(haystack);
  }

  function orderByClause(sql: string): string | null {
    const m = /\border\s+by\b([\s\S]+?)(?:\blimit\b|;|$)/i.exec(sql);
    return m ? m[1] : null;
  }

  function orderByBareNames(sql: string): string[] {
    const clause = orderByClause(sql);
    if (!clause) return [];
    return clause
      .split(',')
      .map((term) =>
        term
          .trim()
          .replace(/\s+(asc|desc)\b[\s\S]*$/i, '')
          .split('.')
          .pop()!
          .replace(/["']/g, '')
          .trim()
      )
      .filter(Boolean);
  }

  function orderByKeyIndices(
    sql: string,
    fields: { name: string }[]
  ): { hasOrderBy: boolean; indices: number[] } {
    if (!orderByClause(sql)) return { hasOrderBy: false, indices: [] };
    const names = fields.map((f) => f.name.toLowerCase());
    const indices: number[] = [];
    for (const bare of orderByBareNames(sql)) {
      const i = names.indexOf(bare.toLowerCase());
      if (i >= 0) indices.push(i);
    }
    return { hasOrderBy: true, indices };
  }

  function stripWhere(sql: string): string {
    return sql.replace(/\bwhere\b[\s\S]*?(?=\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/i, ' ');
  }

  function stripDedupFilter(sql: string): string {
    return sql.replace(/\bwhere\b\s+\w+\s*=\s*1\b/i, ' ');
  }

  function stripTimeZone(sql: string): string {
    return sql.replace(/\s+at\s+time\s+zone\s+'[^']*'/gi, '');
  }

  // ---------------------------------------------------------------------------
  // Gates g0..g9. g0 is the ONLY snapshot-identity gate.
  // ---------------------------------------------------------------------------

  export const g0SnapshotIdentity: Gate = (ctx) => {
    const pass = ctx.validationSnapshot === ctx.servedSnapshot;
    return {
      gate: 'G0',
      pass,
      message: pass
        ? 'validation and served snapshots identical'
        : `snapshot drift: validation ${ctx.validationSnapshot.slice(0, 12)} vs served ${ctx.servedSnapshot.slice(0, 12)}`
    };
  };

  export const g1Runs: Gate = (ctx) => {
    // The harness executes expectedSql before building ctx; a throw is recorded as a
    // G1 failure there. Here the result set exists, so this confirms it.
    const pass = Array.isArray(ctx.result.rows) && Array.isArray(ctx.result.fields);
    return { gate: 'G1', pass, message: pass ? 'expectedSql runs' : 'no result set produced' };
  };

  export const g2NonEmpty: Gate = (ctx) => {
    const pass = ctx.result.rowCount >= 1;
    return { gate: 'G2', pass, message: pass ? `rows=${ctx.result.rowCount}` : 'empty result set' };
  };

  export const g3RowCeiling: Gate = (ctx) => {
    const ceiling = typeof ctx.exercise.rowCeiling === 'number' ? ctx.exercise.rowCeiling : 200;
    const hardCap = Math.min(ceiling, 200); // Advanced mandatory <= 200; default 200.
    const pass = ctx.result.rowCount <= hardCap;
    return {
      gate: 'G3',
      pass,
      message: pass
        ? `rowCount ${ctx.result.rowCount} <= ${hardCap}`
        : `rowCount ${ctx.result.rowCount} exceeds ceiling ${hardCap}`
    };
  };

  export const g4StableOrder: Gate = (ctx) => {
    const keys = orderByKeyIndices(ctx.exercise.expectedSql, ctx.result.fields);
    if (!keys.hasOrderBy) {
      return { gate: 'G4', pass: false, message: 'expectedSql has no ORDER BY' };
    }
    if (keys.indices.length === 0) {
      return {
        gate: 'G4',
        pass: false,
        message: 'no ORDER BY key resolves to an output column; emit must project a unique tiebreak key'
      };
    }
    const rows = toPositionalRows(ctx.result);
    const seen = new Set<string>();
    for (const row of rows) {
      const key = JSON.stringify(keys.indices.map((i) => row[i]));
      if (seen.has(key)) {
        return {
          gate: 'G4',
          pass: false,
          message: 'ORDER BY key set is not unique across rows (nondeterministic order)'
        };
      }
      seen.add(key);
    }
    return { gate: 'G4', pass: true, message: 'ORDER BY key set unique across all rows' };
  };

  export const g5NonDegenerate: Gate = async (ctx) => {
    const sql = ctx.exercise.expectedSql;
    const run = ctx.run;

    // (a) answer is not a single constant cell (scalar aggregates are exempt).
    const isAggregate = /\b(count|sum|avg|min|max)\s*\(/i.test(sql);
    if (ctx.result.rowCount === 1 && ctx.result.fields.length === 1 && !isAggregate) {
      return { gate: 'G5', pass: false, message: 'answer is a single constant cell' };
    }

    // (b) GROUP BY must yield more than one group.
    if (/\bgroup\s+by\b/i.test(sql) && ctx.result.rowCount <= 1) {
      return { gate: 'G5', pass: false, message: 'GROUP BY produced a single group' };
    }

    // (c) filtered != unfiltered (only when a WHERE exists and there is no LIMIT to muddy counts).
    if (run && /\bwhere\b/i.test(sql) && !/\blimit\b/i.test(sql)) {
      const unfiltered = stripWhere(sql);
      if (unfiltered !== sql) {
        const raw = await run(unfiltered);
        if (raw.rowCount === ctx.result.rowCount) {
          return {
            gate: 'G5',
            pass: false,
            message: 'WHERE filter does not change the row count (degenerate predicate)'
          };
        }
      }
    }

    // (d) Rove-only: dedup returns FEWER rows than raw AND timezone differs from naive read.
    if (ctx.database === 'rove' && run) {
      if (/\brow_number\s*\(\s*\)/i.test(sql)) {
        const raw = stripDedupFilter(sql);
        if (raw !== sql) {
          const rawRes = await run(raw);
          if (rawRes.rowCount <= ctx.result.rowCount) {
            return {
              gate: 'G5',
              pass: false,
              message: 'dedup removed no rows (row_number filter is a no-op on this data)'
            };
          }
        }
      }
      if (/\bat\s+time\s+zone\b/i.test(sql)) {
        const naiveSql = stripTimeZone(sql);
        if (naiveSql !== sql) {
          const naiveRes = await run(naiveSql);
          const tzHash = hashRowsOrdered(toPositionalRows(ctx.result));
          const naiveHash = hashRowsOrdered(toPositionalRows(naiveRes));
          if (tzHash === naiveHash) {
            return {
              gate: 'G5',
              pass: false,
              message: 'timezone conversion equals the naive read (AT TIME ZONE is a no-op)'
            };
          }
        }
      }
    }

    return { gate: 'G5', pass: true, message: 'non-degenerate' };
  };

  export const g6DuplicateColumnName: Gate = (ctx) => {
    const names = ctx.result.fields.map((f) => f.name);
    const distinct = new Set(names);
    const pass = distinct.size === names.length;
    return {
      gate: 'G6',
      pass,
      message: pass ? 'all output column names distinct' : `duplicate output column names: ${names.join(', ')}`
    };
  };

  export const g7TaskAnswerDeterminism: Gate = (ctx) => {
    const task = ctx.exercise.task.toLowerCase();
    const missing: string[] = [];
    for (const f of ctx.result.fields) {
      if (!wordPresent(task, f.name)) missing.push(f.name);
    }
    for (const key of orderByBareNames(ctx.exercise.expectedSql)) {
      if (!wordPresent(task, key)) missing.push(key);
    }
    if (missing.length) {
      return {
        gate: 'G7',
        pass: false,
        message: `task does not name: ${[...new Set(missing)].join(', ')}`
      };
    }
    if (ctx.exercise.orderMatters === false && !/\border\s+by\b/i.test(ctx.exercise.expectedSql)) {
      return {
        gate: 'G7',
        pass: false,
        message: 'orderMatters is false but expectedSql has no stable ORDER BY for fingerprinting'
      };
    }
    return { gate: 'G7', pass: true, message: 'task references every alias and ORDER BY key' };
  };

  export const g8ScaffoldFillBack: Gate = (ctx) => {
    const tiers: ScaffoldTier[] = ['full', 'half', 'blank'];
    const expected = normalizeSql(ctx.exercise.expectedSql);
    for (const tier of tiers) {
      const starter = ctx.exercise.starterSql[tier];
      const map = ctx.exercise.blankMap[tier];
      const tokens = Object.keys(map);
      let filled = starter;
      let blankCount = 0;
      for (const token of tokens) {
        const re = new RegExp(escapeRegExp(token), 'g');
        const matches = filled.match(re);
        blankCount += matches ? matches.length : 0;
        filled = filled.replace(re, map[token]);
      }
      if (blankCount !== tokens.length) {
        return {
          gate: 'G8',
          pass: false,
          message: `tier ${tier}: blank count ${blankCount} != answer-token count ${tokens.length}`
        };
      }
      if (normalizeSql(filled) !== expected) {
        return {
          gate: 'G8',
          pass: false,
          message: `tier ${tier}: filled scaffold does not reconstruct expectedSql`
        };
      }
    }
    return { gate: 'G8', pass: true, message: 'all tiers fill back to expectedSql' };
  };

  export const g9SelfCheck: Gate = async (ctx) => {
    const fp = ctx.exercise.fingerprint;
    if (!fp || !Array.isArray(fp.columns)) {
      return { gate: 'G9', pass: false, message: 'no fingerprint baked before self-check' };
    }
    // Re-run expectedSql and grade it against its own fingerprint (catches nondeterminism).
    const rerun = ctx.run ? await ctx.run(ctx.exercise.expectedSql) : ctx.result;
    const fp2 = buildFingerprint({ fields: rerun.fields, rows: rerun.rows });
    const colsMatch = JSON.stringify(fp.columns) === JSON.stringify(fp2.columns);
    const countMatch = fp.rowCount === fp2.rowCount;
    const hashMatch = ctx.exercise.orderMatters
      ? fp.orderedRowHash === fp2.orderedRowHash
      : fp.unorderedRowHash === fp2.unorderedRowHash;
    const pass = colsMatch && countMatch && hashMatch;
    return { gate: 'G9', pass, message: pass ? 'self-check correct' : 'self-check mismatch on re-run' };
  };

  // Full ordered gate list (g0 FIRST). g9 runs AFTER the fingerprint is baked.
  export const GATES: Gate[] = [
    g0SnapshotIdentity,
    g1Runs,
    g2NonEmpty,
    g3RowCeiling,
    g4StableOrder,
    g5NonDegenerate,
    g6DuplicateColumnName,
    g7TaskAnswerDeterminism,
    g8ScaffoldFillBack,
    g9SelfCheck
  ];

  const PRE_FINGERPRINT_GATES: Gate[] = GATES.slice(0, 9); // g0..g8

  // ---------------------------------------------------------------------------
  // Harness.
  // ---------------------------------------------------------------------------

  interface QueryLike {
    executeQuery(input: { database: string; sql: string; rowMode?: 'array' }): Promise<{
      columns: string[];
      rows: unknown[][];
      rowCount: number;
    }>;
    listDatabases?: () => string[];
    close?: () => Promise<void>;
  }

  export interface HarnessDeps {
    service?: QueryLike;
    computeSnapshot?: (database: string) => Promise<string>;
    readServed?: (database: string) => string | null;
    allowed?: string[];
  }

  async function runArray(
    service: QueryLike,
    database: string,
    sql: string
  ): Promise<{ fields: { name: string }[]; rows: unknown[][]; rowCount: number }> {
    const res = await service.executeQuery({ database, sql, rowMode: 'array' });
    const fields = (res.columns || []).map((name) => ({ name }));
    const rows = (res.rows || []) as unknown[][];
    const rowCount = typeof res.rowCount === 'number' ? res.rowCount : rows.length;
    return { fields, rows, rowCount };
  }

  export async function validateExercises(
    exercises: Exercise[],
    deps: HarnessDeps = {}
  ): Promise<{ passed: Exercise[]; failures: Array<{ id: string; results: GateResult[] }> }> {
    const service: QueryLike = deps.service || (createQueryService() as unknown as QueryLike);
    const computeSnapshot =
      deps.computeSnapshot || ((db: string) => computeSnapshotHash(db, { service: service as any }));
    const readServed = deps.readServed || readServedSnapshot;
    const allowed =
      deps.allowed ||
      (typeof service.listDatabases === 'function'
        ? service.listDatabases()
        : ['aperture', 'sideline', 'rove']);

    const snapCache = new Map<string, string>();
    const passed: Exercise[] = [];
    const failures: Array<{ id: string; results: GateResult[] }> = [];

    for (const ex of exercises) {
      const db = ex.database;
      if (!allowed.includes(db)) {
        failures.push({
          id: ex.id,
          results: [{ gate: 'G0', pass: false, message: `database "${db}" is not an allowed target` }]
        });
        continue;
      }

      let result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number };
      try {
        result = await runArray(service, db, ex.expectedSql);
      } catch (error) {
        failures.push({
          id: ex.id,
          results: [
            { gate: 'G1', pass: false, message: `expectedSql failed to run: ${(error as Error).message}` }
          ]
        });
        continue;
      }

      if (!snapCache.has(db)) snapCache.set(db, await computeSnapshot(db));
      const validationSnapshot = snapCache.get(db)!;
      const servedSnapshot = readServed(db) || validationSnapshot;

      const ctx: GateContext = {
        exercise: ex,
        database: db,
        result,
        validationSnapshot,
        servedSnapshot,
        run: (sql: string) => runArray(service, db, sql)
      };

      const results: GateResult[] = [];
      let ok = true;
      for (const gate of PRE_FINGERPRINT_GATES) {
        const r = await gate(ctx);
        results.push(r);
        if (!r.pass) ok = false;
      }
      if (!ok) {
        failures.push({ id: ex.id, results });
        continue;
      }

      // Bake the fingerprint from the validated result, then run g9 self-check.
      const fingerprint = buildFingerprint({ fields: result.fields, rows: result.rows });
      const withFingerprint: Exercise = { ...ex, fingerprint };
      const g9 = await g9SelfCheck({ ...ctx, exercise: withFingerprint });
      results.push(g9);
      if (!g9.pass) {
        failures.push({ id: ex.id, results });
        continue;
      }

      passed.push(withFingerprint);
    }

    return { passed, failures };
  }

  // CLI: validate every generated draft against the live seeded DBs; nonzero exit on any failure.
  async function main(): Promise<void> {
    const service = createQueryService() as unknown as QueryLike;
    const byDb = await buildAllExercises();
    const all: Exercise[] = [];
    for (const db of Object.keys(byDb) as Array<keyof typeof byDb>) {
      for (const draft of byDb[db]) all.push(draft as unknown as Exercise);
    }
    const { passed, failures } = await validateExercises(all, { service });
    if (typeof service.close === 'function') await service.close();

    console.log(`validate-exercises: ${passed.length} passed, ${failures.length} failed`);
    for (const f of failures) {
      const reasons = f.results.filter((r) => !r.pass).map((r) => `${r.gate}:${r.message}`).join('; ');
      console.log(`FAIL ${f.id} -> ${reasons}`);
    }
    if (failures.length) process.exit(1);
  }

  if (require.main === module) {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
  ```

  Run it green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/validate-exercises.test.js
  ```
  Expected: all `validate-exercises.test.ts` tests pass (`# fail 0`). (Compile also needs the T0 stub `buildAllExercises` and T5 generator bodies to already exist per the task order; the harness only imports them for the CLI path.)

- [ ] **Step 6: Commit gates + harness.**
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add scripts/validate-exercises.ts test/validate-exercises.test.ts && git commit -m "T6: validate-exercises harness with gates g0-g9 (single g0)

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

- [ ] **Step 7: Red - generate-exercises CLI test.** Pin that `--db` parsing accepts one db and rejects unknown, and that the serializer emits a compiling `GENERATED_EXERCISES` map. Expose the helpers for testing via named exports.

  Create `C:\Dev\Projects\sql-mastery\test\generate-exercises.test.ts`:
  ```ts
  import test from 'node:test';
  import assert from 'node:assert/strict';

  import type { Exercise } from '../src/generator/types';
  import { parseDbArg, serializeGeneratedFile } from '../scripts/generate-exercises';

  test('parseDbArg returns all three dbs by default', () => {
    assert.deepEqual(parseDbArg([]), ['aperture', 'sideline', 'rove']);
  });

  test('parseDbArg returns a single db when --db is given', () => {
    assert.deepEqual(parseDbArg(['--db', 'rove']), ['rove']);
  });

  test('parseDbArg rejects an unknown db', () => {
    assert.throws(() => parseDbArg(['--db', 'nope']), /unknown --db/);
  });

  test('serializeGeneratedFile emits a sorted, typed GENERATED_EXERCISES map', () => {
    const ex = {
      id: 'z1',
      skill: 'ap-order-by',
      database: 'aperture',
      task: 't',
      starterSql: { full: '', half: '', blank: '' },
      blankMap: { full: {}, half: {}, blank: {} },
      hint: 'h',
      expectedSql: 'SELECT 1 AS one',
      orderMatters: true,
      rowCeiling: 200,
      fingerprint: { columns: ['one'], rowCount: 1, orderedRowHash: 'a', unorderedRowHash: 'b' }
    } as Exercise;
    const out = serializeGeneratedFile({ 'ap-order-by': [ex] });
    assert.match(out, /AUTO-GENERATED by scripts\/generate-exercises\.ts/);
    assert.match(out, /import type \{ Exercise \} from '\.\.\/\.\.\/generator\/types';/);
    assert.match(out, /export const GENERATED_EXERCISES: Record<string, Exercise\[\]> =/);
    assert.match(out, /"ap-order-by"/);
    assert.match(out, /"orderedRowHash": "a"/);
  });
  ```

  Run it red:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
  ```
  Expected failure: `error TS2307: Cannot find module '../scripts/generate-exercises' or its corresponding type declarations.`

- [ ] **Step 8: Green - implement `scripts/generate-exercises.ts`.** Runs `buildAllExercises`/`buildExercisesFor` + `curate`, validates to bake fingerprints, and writes ONLY `src/phases/<db>/exercises.generated.ts` (a skill to Exercise[] map). No phase structure; reads no phase-plan JSON. Records the DB snapshot alongside.

  Create `C:\Dev\Projects\sql-mastery\scripts\generate-exercises.ts`:
  ```ts
  import * as fs from 'node:fs';
  import * as path from 'node:path';

  import { buildExercisesFor } from '../src/generator/index';
  import { curate } from '../src/generator/curate';
  import type { DraftExercise, Exercise, ConceptMeta } from '../src/generator/types';
  import { APERTURE_CONCEPT_META } from '../src/generator/templates/aperture/index';
  import { SIDELINE_CONCEPT_META } from '../src/generator/templates/sideline/index';
  import { ROVE_CONCEPT_META } from '../src/generator/templates/rove/index';
  import { validateExercises } from './validate-exercises';
  import { recordSnapshot } from '../src/snapshot';
  import { createQueryService } from '../src/query-service';

  const ALL_DBS = ['aperture', 'sideline', 'rove'] as const;
  type Db = (typeof ALL_DBS)[number];

  const META: Record<Db, ConceptMeta[]> = {
    aperture: APERTURE_CONCEPT_META,
    sideline: SIDELINE_CONCEPT_META,
    rove: ROVE_CONCEPT_META
  };

  export function parseDbArg(argv: string[]): string[] {
    const i = argv.indexOf('--db');
    if (i >= 0 && argv[i + 1]) {
      const db = argv[i + 1];
      if (!ALL_DBS.includes(db as Db)) {
        throw new Error(`unknown --db "${db}"; expected one of ${ALL_DBS.join(', ')}`);
      }
      return [db];
    }
    return [...ALL_DBS];
  }

  // dist/scripts/generate-exercises.js -> up two levels to repo root, then src/phases/<db>.
  export function generatedFilePath(db: string): string {
    return path.join(__dirname, '..', '..', 'src', 'phases', db, 'exercises.generated.ts');
  }

  export function serializeGeneratedFile(bySkill: Record<string, Exercise[]>): string {
    const skills = Object.keys(bySkill).sort();
    const ordered: Record<string, Exercise[]> = {};
    for (const skill of skills) ordered[skill] = bySkill[skill];
    const json = JSON.stringify(ordered, null, 2);
    return [
      '// AUTO-GENERATED by scripts/generate-exercises.ts. DO NOT EDIT BY HAND.',
      '// Regenerate with: npm run generate-exercises',
      "import type { Exercise } from '../../generator/types';",
      '',
      `export const GENERATED_EXERCISES: Record<string, Exercise[]> = ${json};`,
      ''
    ].join('\n');
  }

  async function main(): Promise<void> {
    const dbs = parseDbArg(process.argv.slice(2));
    const service = createQueryService();
    let anyFailure = false;

    for (const db of dbs) {
      const drafts: DraftExercise[] = await buildExercisesFor(db);
      const curated: DraftExercise[] = curate(drafts, META[db as Db]);
      const { passed, failures } = await validateExercises(curated as unknown as Exercise[], {
        service: service as any
      });

      if (failures.length) {
        anyFailure = true;
        console.error(`generate-exercises: ${db} FAILED validation (${failures.length}); not writing`);
        for (const f of failures) {
          const reasons = f.results.filter((r) => !r.pass).map((r) => `${r.gate}:${r.message}`).join('; ');
          console.error(`  FAIL ${f.id} -> ${reasons}`);
        }
        continue;
      }

      const bySkill: Record<string, Exercise[]> = {};
      for (const ex of passed) {
        if (!bySkill[ex.skill]) bySkill[ex.skill] = [];
        bySkill[ex.skill].push(ex);
      }

      const file = generatedFilePath(db);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, serializeGeneratedFile(bySkill));
      await recordSnapshot(db, { service: service as any });
      console.log(
        `generate-exercises: wrote ${passed.length} exercises across ${Object.keys(bySkill).length} skills -> ${file}`
      );
    }

    await service.close();
    if (anyFailure) process.exit(1);
  }

  if (require.main === module) {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
  ```

  Run it green:
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/generate-exercises.test.js
  ```
  Expected: all `generate-exercises.test.ts` tests pass (`# fail 0`).

- [ ] **Step 9: Wire npm scripts into build + test.** Add standalone `generate-exercises` / `validate-exercises` scripts and hook them into `build` and `test`.

  Edit `C:\Dev\Projects\sql-mastery\package.json`, replacing the `build` and `test` lines and adding two scripts:
  ```json
    "scripts": {
      "start": "node dist/server.js",
      "dev": "npm --prefix client run dev",
      "typecheck": "tsc --noEmit -p tsconfig.json",
      "build:server": "tsc -p tsconfig.json",
      "extract-lessons": "tsc -p tsconfig.json && node dist/scripts/extract-lessons.js",
      "generate-exercises": "tsc -p tsconfig.json && node dist/scripts/generate-exercises.js",
      "validate-exercises": "tsc -p tsconfig.json && node dist/scripts/validate-exercises.js",
      "build": "tsc -p tsconfig.json && node dist/scripts/extract-lessons.js && node dist/scripts/generate-exercises.js && npm --prefix client run build",
      "test": "tsc -p tsconfig.json && node --test dist/test/*.test.js && node dist/scripts/validate-exercises.js && npm --prefix client test"
    },
  ```

  Verify the compiled entrypoints exist and the scripts resolve (this runs against the live seeded DBs; `PGPASSWORD` must be set in the environment, never in a file):
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && ls dist/scripts/generate-exercises.js dist/scripts/validate-exercises.js && node -e "require('./dist/scripts/validate-exercises.js'); console.log('validate-exercises module loads')"
  ```
  Expected: both `dist/scripts/*.js` files listed and `validate-exercises module loads` printed (the module loads without auto-running `main`, since `require.main !== module`).

- [ ] **Step 10: Full test suite green, then commit.**
  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/snapshot.test.js dist/test/validate-exercises.test.js dist/test/generate-exercises.test.js
  ```
  Expected: `# fail 0` across all three test files. Then commit:
  ```bash
  cd /c/Dev/Projects/sql-mastery && git add scripts/generate-exercises.ts test/generate-exercises.test.ts package.json && git commit -m "T6: generate-exercises CLI writes phases/<db>/exercises.generated.ts; wire npm build+test

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7: BEGINNER aperture templates (17)

Fill the T0 stub `src/generator/templates/aperture/index.ts` with the 17 fixed `ap-` templates, `APERTURE_SKILLS`, `APERTURE_CONCEPT_META` (teach blocks), plus the phase model exports `APERTURE_PHASES` (5 phases) and `APERTURE_CHECKPOINTS` (cpA..cpD mid + cpE capstone). Templates conform to the T4 emit/bind convention: no `ORDER BY` / no `ROUND` in `sqlShape`; `sortKey` (single-table / join) and `groupCols` (grouped) tiebreak slots; literal slots are `{ kind: 'literal', op, col }` with plain identifier names. All column/table references are the real aperture schema (`facility`, `stars`, `planets`).

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\test\aperture-templates.test.ts`
- Modify: `C:\Dev\Projects\sql-mastery\src\generator\templates\aperture\index.ts` (replace the T0 empty stub body)

**Interfaces:**
- Consumes (exact types from `src/generator/types.ts`, extensionless relative import `../../types`):
  - `Template { skill; database; family; primaryTable?; sqlShape; slots: Slot[]; bindingRules: BindingRule[]; phrasings: string[]; hintTemplate; scaffoldPlan: ScaffoldPlan; gateHints: GateHints }`
  - `Slot { name; kind: SlotKind; table?; op?; col?; sampleStrategy? }` with `SlotKind = 'table'|'column'|'projection'|'literal'|'groupCols'|'sortKey'|'partitionCols'|'rankKey'|'limit'`
  - `ScaffoldPlan { full: 'all-value-slots'; half: 'harder-half'; blank: 'whole-clauses' }`
  - `GateHints { minRows; minDistinct; rowCeiling; orderMatters; boundedSlice }`
  - `ConceptMeta { skill; order; title; teach: TeachBlock; phaseId }`, `TeachBlock { plain; mentalModel; example: { sql; note } }`
  - `PhaseMeta { id; title; goal; level: Level; order }`, `CheckpointMeta { id; phaseId; afterOrder; drawFromSkills: string[]; title }` (added to `types.ts` by T0 per resolutions H1)
- Consumes (pure catalog helpers from `src/generator/schema-catalog.ts`, import `../../schema-catalog`): `numericCols(catalog, table): ColumnInfo[]`, `textCols(catalog, table): ColumnInfo[]`. Used only inside `bindingRules[].predicate` (run at generate time by T4 bind; not exercised by this task's unit test).
- Produces (consumed by T8 phase assembly and the T2 skill guardrail):
  - `export const APERTURE_TEMPLATES: Template[]` (17, one per skill)
  - `export const APERTURE_SKILLS: string[]` (the 17 fixed slugs, canonical order)
  - `export const APERTURE_CONCEPT_META: ConceptMeta[]` (17, 1:1 with skills)
  - `export const APERTURE_PHASES: PhaseMeta[]` (ids `ap-basics`, `ap-filtering`, `ap-shaping`, `ap-aggregation`, `ap-join`, local `order` 1..5)
  - `export const APERTURE_CHECKPOINTS: CheckpointMeta[]` (`cpA`..`cpD` mid boundaries + `cpE` capstone in `ap-join` drawing all `APERTURE_SKILLS`)

---

- [ ] **Step 1: Write the failing structural test.** This test never touches Postgres or bind; it only inspects the exported constants against the real aperture schema and the fixed skill list. Create `C:\Dev\Projects\sql-mastery\test\aperture-templates.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import {
    APERTURE_TEMPLATES,
    APERTURE_SKILLS,
    APERTURE_CONCEPT_META,
    APERTURE_PHASES,
    APERTURE_CHECKPOINTS,
  } from '../src/generator/templates/aperture/index';

  // Real aperture schema (datasets/schema/aperture.sql). Single source of truth for this test.
  const SCHEMA: Record<string, string[]> = {
    facility: ['facility_id', 'name'],
    stars: [
      'star_id', 'star_name', 'spectral_type', 'temperature_k',
      'mass_solar', 'radius_solar', 'distance_ly',
    ],
    planets: [
      'planet_id', 'star_id', 'planet_name', 'planet_type', 'mass_earth',
      'radius_earth', 'orbital_period_days', 'semi_major_axis_au',
      'equilibrium_temp_k', 'discovery_method', 'discovery_year',
      'facility_id', 'in_habitable_zone',
    ],
  };
  const TABLES = Object.keys(SCHEMA);
  const ALL_COLS = new Set<string>(Object.values(SCHEMA).flat());

  const FIXED_SKILLS = [
    'ap-select-all', 'ap-select-columns', 'ap-order-by', 'ap-limit-topn',
    'ap-distinct', 'ap-where-comparison', 'ap-where-boolean-logic',
    'ap-where-between-in', 'ap-where-like', 'ap-null-handling',
    'ap-computed-columns', 'ap-column-alias', 'ap-aggregate-scalar',
    'ap-group-by', 'ap-having', 'ap-group-by-sort-top', 'ap-join-intro',
  ];

  test('APERTURE_SKILLS is exactly the 17 fixed slugs in canonical order', () => {
    assert.deepEqual(APERTURE_SKILLS, FIXED_SKILLS);
  });

  test('templates are 1:1 with skills and all target aperture', () => {
    assert.equal(APERTURE_TEMPLATES.length, 17);
    assert.deepEqual(APERTURE_TEMPLATES.map((t) => t.skill), FIXED_SKILLS);
    for (const t of APERTURE_TEMPLATES) assert.equal(t.database, 'aperture');
  });

  test('concept meta is 1:1 with skills (guardrail precondition for T2)', () => {
    assert.equal(APERTURE_CONCEPT_META.length, 17);
    assert.deepEqual(
      [...APERTURE_CONCEPT_META.map((c) => c.skill)].sort(),
      [...FIXED_SKILLS].sort(),
    );
    for (const c of APERTURE_CONCEPT_META) {
      assert.ok(c.teach.plain.length > 0, `${c.skill} plain`);
      assert.ok(c.teach.mentalModel.length > 0, `${c.skill} mentalModel`);
      assert.ok(c.teach.example.sql.length > 0, `${c.skill} example.sql`);
    }
  });

  test('every template obeys the emit/bind convention', () => {
    for (const t of APERTURE_TEMPLATES) {
      // Invariant C.1: emit owns ORDER BY and ROUND.
      assert.ok(!/order\s+by/i.test(t.sqlShape), `${t.skill} has ORDER BY in sqlShape`);
      assert.ok(!/round\s*\(/i.test(t.sqlShape), `${t.skill} hand-writes ROUND`);
      // >= 2 natural-language phrasings.
      assert.ok(t.phrasings.length >= 2, `${t.skill} needs >= 2 phrasings`);
      // Beginner scaffold plan + gate hints.
      assert.deepEqual(t.scaffoldPlan, { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' });
      assert.ok(t.gateHints.rowCeiling <= 200, `${t.skill} rowCeiling`);
      assert.equal(t.gateHints.boundedSlice, false, `${t.skill} boundedSlice (beginner)`);
      // Real tables/columns only (author-declared references).
      if (t.primaryTable) assert.ok(TABLES.includes(t.primaryTable), `${t.skill} primaryTable`);
      const slotNames = new Set(t.slots.map((s) => s.name));
      for (const s of t.slots) {
        if (s.table) assert.ok(TABLES.includes(s.table), `${t.skill}.${s.name} table`);
        if (s.col) assert.ok(ALL_COLS.has(s.col), `${t.skill}.${s.name} col ${s.col}`);
      }
      for (const r of t.bindingRules) {
        assert.ok(slotNames.has(r.slot), `${t.skill} rule targets missing slot ${r.slot}`);
      }
      // Family-required tiebreak slot present (C.2).
      if (t.family === 'single-table' || t.family === 'join') {
        assert.ok(slotNames.has('sortKey'), `${t.skill} (${t.family}) needs a sortKey slot`);
      }
      if (t.family === 'grouped') {
        assert.ok(slotNames.has('groupCols'), `${t.skill} (grouped) needs a groupCols slot`);
      }
    }
  });

  test('five beginner phases, local order 1..5, contiguous', () => {
    assert.equal(APERTURE_PHASES.length, 5);
    assert.deepEqual(
      APERTURE_PHASES.map((p) => p.id),
      ['ap-basics', 'ap-filtering', 'ap-shaping', 'ap-aggregation', 'ap-join'],
    );
    assert.deepEqual(APERTURE_PHASES.map((p) => p.order), [1, 2, 3, 4, 5]);
    for (const p of APERTURE_PHASES) assert.equal(p.level, 'beginner');
  });

  test('every concept has a valid phaseId and phase-local orders are contiguous', () => {
    const phaseIds = new Set(APERTURE_PHASES.map((p) => p.id));
    for (const c of APERTURE_CONCEPT_META) {
      assert.ok(phaseIds.has(c.phaseId), `${c.skill} bad phaseId ${c.phaseId}`);
    }
    for (const pid of phaseIds) {
      const orders = APERTURE_CONCEPT_META.filter((c) => c.phaseId === pid)
        .map((c) => c.order).sort((a, b) => a - b);
      const expected = orders.map((_, i) => i + 1);
      assert.deepEqual(orders, expected, `phase ${pid} local order gap/dup`);
    }
  });

  test('checkpoints cpA..cpE reference valid phases and skills; cpE is the capstone', () => {
    assert.deepEqual(APERTURE_CHECKPOINTS.map((c) => c.id), ['cpA', 'cpB', 'cpC', 'cpD', 'cpE']);
    const phaseIds = new Set(APERTURE_PHASES.map((p) => p.id));
    const skillSet = new Set(APERTURE_SKILLS);
    for (const cp of APERTURE_CHECKPOINTS) {
      assert.ok(phaseIds.has(cp.phaseId), `${cp.id} bad phaseId`);
      assert.ok(cp.drawFromSkills.length >= 1, `${cp.id} empty pool`);
      for (const s of cp.drawFromSkills) assert.ok(skillSet.has(s), `${cp.id} bad skill ${s}`);
    }
    const cpE = APERTURE_CHECKPOINTS.find((c) => c.id === 'cpE')!;
    assert.equal(cpE.phaseId, 'ap-join');
    assert.deepEqual([...cpE.drawFromSkills].sort(), [...APERTURE_SKILLS].sort());
  });
  ```

- [ ] **Step 2: Run the test RED.** Compile and run; the T0 stub exports empty arrays (and has no `APERTURE_PHASES` / `APERTURE_CHECKPOINTS`), so it fails to compile / assert.

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc -p tsconfig.json && node --test dist/test/aperture-templates.test.js
  ```

  Expected failure: a TypeScript error `Module '"../src/generator/templates/aperture/index"' has no exported member 'APERTURE_PHASES'` (the T0 stub only exports `APERTURE_TEMPLATES`/`APERTURE_SKILLS`/`APERTURE_CONCEPT_META` as empty arrays). If T0's stub already exported empty `APERTURE_PHASES`/`APERTURE_CHECKPOINTS`, compilation passes and the run fails instead with `AssertionError: Expected values to be strictly deep-equal ... APERTURE_SKILLS` (actual `[]`).

- [ ] **Step 3: Write the skills, phase model, checkpoints, and concept meta.** Replace the entire contents of `src/generator/templates/aperture/index.ts` with the following (templates array is filled in Step 4):

  ```ts
  import type { Template, ConceptMeta, PhaseMeta, CheckpointMeta } from '../../types';

  // 17 fixed BEGINNER skill slugs. This order IS the canonical teaching order and the
  // phase-local ordering below is derived from it. Do not reorder without updating meta.
  export const APERTURE_SKILLS: string[] = [
    'ap-select-all',
    'ap-select-columns',
    'ap-order-by',
    'ap-limit-topn',
    'ap-distinct',
    'ap-where-comparison',
    'ap-where-boolean-logic',
    'ap-where-between-in',
    'ap-where-like',
    'ap-null-handling',
    'ap-computed-columns',
    'ap-column-alias',
    'ap-aggregate-scalar',
    'ap-group-by',
    'ap-having',
    'ap-group-by-sort-top',
    'ap-join-intro',
  ];

  // Five beginner phases (resolutions H5). order is 1..5 within the aperture band;
  // T8 assembly assigns the global phase.order by band offset (H4).
  export const APERTURE_PHASES: PhaseMeta[] = [
    { id: 'ap-basics', title: 'Reading a table', goal: 'Select columns, order rows, limit, and de-duplicate from one table.', level: 'beginner', order: 1 },
    { id: 'ap-filtering', title: 'Filtering rows', goal: 'Restrict rows with WHERE: comparisons, boolean logic, ranges, text patterns, and NULLs.', level: 'beginner', order: 2 },
    { id: 'ap-shaping', title: 'Shaping output', goal: 'Compute new columns and rename output with aliases.', level: 'beginner', order: 3 },
    { id: 'ap-aggregation', title: 'Summarising rows', goal: 'Scalar aggregates, GROUP BY, HAVING, and grouped top-N.', level: 'beginner', order: 4 },
    { id: 'ap-join', title: 'A first join', goal: 'Combine planets with their host stars using an inner join.', level: 'beginner', order: 5 },
  ];

  // cpA..cpD are mid boundaries (afterOrder == last local order of their phase);
  // cpE is the aperture capstone in ap-join drawing every APERTURE_SKILLS slug.
  export const APERTURE_CHECKPOINTS: CheckpointMeta[] = [
    { id: 'cpA', phaseId: 'ap-basics', afterOrder: 5, title: 'Checkpoint A: reading a table', drawFromSkills: ['ap-select-all', 'ap-select-columns', 'ap-order-by', 'ap-limit-topn', 'ap-distinct'] },
    { id: 'cpB', phaseId: 'ap-filtering', afterOrder: 5, title: 'Checkpoint B: filtering', drawFromSkills: ['ap-where-comparison', 'ap-where-boolean-logic', 'ap-where-between-in', 'ap-where-like', 'ap-null-handling'] },
    { id: 'cpC', phaseId: 'ap-shaping', afterOrder: 2, title: 'Checkpoint C: shaping output', drawFromSkills: ['ap-computed-columns', 'ap-column-alias'] },
    { id: 'cpD', phaseId: 'ap-aggregation', afterOrder: 4, title: 'Checkpoint D: aggregation', drawFromSkills: ['ap-aggregate-scalar', 'ap-group-by', 'ap-having', 'ap-group-by-sort-top'] },
    { id: 'cpE', phaseId: 'ap-join', afterOrder: 1, title: 'Checkpoint E: aperture capstone', drawFromSkills: [...APERTURE_SKILLS] },
  ];

  export const APERTURE_CONCEPT_META: ConceptMeta[] = [
    // ---- phase ap-basics (local order 1..5) ----
    {
      skill: 'ap-select-all', phaseId: 'ap-basics', order: 1, title: 'Select every column',
      teach: {
        plain: 'SELECT * returns every column of every row in a table. It is the simplest possible query.',
        mentalModel: 'Think of a table as a spreadsheet; SELECT * FROM t hands you the whole sheet, untouched.',
        example: { sql: 'SELECT * FROM stars', note: 'Star (*) means all columns; you never list them by hand here.' },
      },
    },
    {
      skill: 'ap-select-columns', phaseId: 'ap-basics', order: 2, title: 'Pick specific columns',
      teach: {
        plain: 'Name the columns you want after SELECT, separated by commas, instead of using *.',
        mentalModel: 'You are choosing which spreadsheet columns to keep and dropping the rest.',
        example: { sql: 'SELECT planet_name, planet_type FROM planets', note: 'Output has exactly the two columns you named, in that order.' },
      },
    },
    {
      skill: 'ap-order-by', phaseId: 'ap-basics', order: 3, title: 'Order the rows',
      teach: {
        plain: 'ORDER BY sorts the result by one or more columns; the database owns the sort, not you.',
        mentalModel: 'Same rows, just re-stacked so the column you name climbs (or falls) down the page.',
        example: { sql: 'SELECT star_name, temperature_k FROM stars ORDER BY temperature_k', note: 'Ascending is the default; add DESC to flip it.' },
      },
    },
    {
      skill: 'ap-limit-topn', phaseId: 'ap-basics', order: 4, title: 'Take the top N',
      teach: {
        plain: 'LIMIT keeps only the first N rows after ordering, giving you a top-N list.',
        mentalModel: 'Sort first, then slice off the top of the pile and throw the rest away.',
        example: { sql: 'SELECT planet_name, mass_earth FROM planets ORDER BY mass_earth DESC LIMIT 5', note: 'Order before you limit or the top N is meaningless.' },
      },
    },
    {
      skill: 'ap-distinct', phaseId: 'ap-basics', order: 5, title: 'Remove duplicates',
      teach: {
        plain: 'SELECT DISTINCT collapses repeated values so each distinct value appears once.',
        mentalModel: 'A bag of colored marbles becomes one marble of each color.',
        example: { sql: 'SELECT DISTINCT planet_type FROM planets', note: 'DISTINCT applies across the whole selected row, not just one column.' },
      },
    },
    // ---- phase ap-filtering (local order 1..5) ----
    {
      skill: 'ap-where-comparison', phaseId: 'ap-filtering', order: 1, title: 'Filter with a comparison',
      teach: {
        plain: 'WHERE keeps only rows where a condition is true; comparisons use =, <>, <, <=, >, >=.',
        mentalModel: 'A gate on the table: a row passes only if the test holds for it.',
        example: { sql: 'SELECT star_name FROM stars WHERE temperature_k > 6000', note: 'Only hotter stars pass the gate.' },
      },
    },
    {
      skill: 'ap-where-boolean-logic', phaseId: 'ap-filtering', order: 2, title: 'Combine conditions',
      teach: {
        plain: 'AND requires both conditions; OR requires either; NOT inverts one.',
        mentalModel: 'AND narrows the funnel, OR widens it.',
        example: { sql: "SELECT planet_name FROM planets WHERE in_habitable_zone = true AND planet_type = 'Terrestrial'", note: 'Both must hold, so the result is a strict subset.' },
      },
    },
    {
      skill: 'ap-where-between-in', phaseId: 'ap-filtering', order: 3, title: 'Ranges and lists',
      teach: {
        plain: 'BETWEEN a AND b matches an inclusive range; IN (...) matches any value in a list.',
        mentalModel: 'BETWEEN is a band on a number line; IN is a checklist of allowed values.',
        example: { sql: 'SELECT planet_name FROM planets WHERE discovery_year BETWEEN 2010 AND 2015', note: 'BETWEEN includes both endpoints.' },
      },
    },
    {
      skill: 'ap-where-like', phaseId: 'ap-filtering', order: 4, title: 'Match text patterns',
      teach: {
        plain: "LIKE matches text patterns: % is any run of characters, _ is exactly one.",
        mentalModel: "A wildcard stencil laid over a string.",
        example: { sql: "SELECT star_name FROM stars WHERE star_name LIKE 'Kepler%'", note: "'Kepler%' matches anything starting with Kepler." },
      },
    },
    {
      skill: 'ap-null-handling', phaseId: 'ap-filtering', order: 5, title: 'Handle missing values',
      teach: {
        plain: 'NULL means unknown; test it with IS NULL or IS NOT NULL, never with = NULL.',
        mentalModel: 'NULL is a blank cell; you cannot equal a blank, you can only ask if it is blank.',
        example: { sql: 'SELECT planet_name FROM planets WHERE equilibrium_temp_k IS NULL', note: 'equilibrium_temp_k is missing for some planets; = NULL would return nothing.' },
      },
    },
    // ---- phase ap-shaping (local order 1..2) ----
    {
      skill: 'ap-computed-columns', phaseId: 'ap-shaping', order: 1, title: 'Compute new columns',
      teach: {
        plain: 'You can put arithmetic expressions in the SELECT list to derive new output columns.',
        mentalModel: 'A formula cell in a spreadsheet, evaluated per row.',
        example: { sql: 'SELECT planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets', note: 'The derived column is computed row by row.' },
      },
    },
    {
      skill: 'ap-column-alias', phaseId: 'ap-shaping', order: 2, title: 'Rename output columns',
      teach: {
        plain: 'AS gives an output column a friendly name without changing the stored column.',
        mentalModel: 'A name tag on the result column; the table underneath is unchanged.',
        example: { sql: 'SELECT distance_ly AS light_years FROM stars', note: 'The result header reads light_years.' },
      },
    },
    // ---- phase ap-aggregation (local order 1..4) ----
    {
      skill: 'ap-aggregate-scalar', phaseId: 'ap-aggregation', order: 1, title: 'Summarise to one row',
      teach: {
        plain: 'Aggregate functions like COUNT, AVG, MIN, MAX collapse many rows into a single summary row.',
        mentalModel: 'Pour a column of numbers into a funnel and read the one number that drips out.',
        example: { sql: "SELECT COUNT(*) AS planet_count, AVG(mass_earth) AS avg_mass FROM planets WHERE planet_type = 'Terrestrial'", note: 'No GROUP BY means the whole filtered set becomes one row.' },
      },
    },
    {
      skill: 'ap-group-by', phaseId: 'ap-aggregation', order: 2, title: 'Group and count',
      teach: {
        plain: 'GROUP BY splits rows into buckets by a column, then aggregates each bucket separately.',
        mentalModel: 'Sort marbles into jars by color, then count each jar.',
        example: { sql: 'SELECT planet_type, COUNT(*) AS n FROM planets GROUP BY planet_type', note: 'One output row per distinct planet_type.' },
      },
    },
    {
      skill: 'ap-having', phaseId: 'ap-aggregation', order: 3, title: 'Filter groups',
      teach: {
        plain: 'HAVING filters groups after aggregation, the way WHERE filters rows before it.',
        mentalModel: 'WHERE screens marbles going into jars; HAVING screens the jars after counting.',
        example: { sql: 'SELECT planet_type, AVG(mass_earth) AS avg_mass FROM planets GROUP BY planet_type HAVING AVG(mass_earth) > 5', note: 'Only groups whose average passes survive.' },
      },
    },
    {
      skill: 'ap-group-by-sort-top', phaseId: 'ap-aggregation', order: 4, title: 'Top groups by count',
      teach: {
        plain: 'Combine GROUP BY with ORDER BY on the aggregate and LIMIT to rank the busiest groups.',
        mentalModel: 'Count each jar, line the jars up biggest-first, keep the front few.',
        example: { sql: 'SELECT discovery_method, COUNT(*) AS n FROM planets GROUP BY discovery_method ORDER BY COUNT(*) DESC, discovery_method LIMIT 3', note: 'The tiebreak on discovery_method keeps the order deterministic.' },
      },
    },
    // ---- phase ap-join (local order 1) ----
    {
      skill: 'ap-join-intro', phaseId: 'ap-join', order: 1, title: 'Join two tables',
      teach: {
        plain: 'An inner join matches rows across two tables on a shared key, here planets.star_id = stars.star_id.',
        mentalModel: 'Snap two puzzle pieces together where their key columns line up.',
        example: { sql: 'SELECT planets.planet_name, stars.star_name FROM planets JOIN stars ON planets.star_id = stars.star_id', note: 'Qualify column names with the table when both tables could have them.' },
      },
    },
  ];

  export const APERTURE_TEMPLATES: Template[] = [];
  ```

- [ ] **Step 4: Fill `APERTURE_TEMPLATES` with all 17 templates.** First add the schema-catalog import and shared helpers by editing the top import line. Replace:

  ```ts
  import type { Template, ConceptMeta, PhaseMeta, CheckpointMeta } from '../../types';
  ```

  with:

  ```ts
  import type { Template, ConceptMeta, PhaseMeta, CheckpointMeta, ScaffoldPlan, GateHints } from '../../types';
  import { numericCols, textCols } from '../../schema-catalog';

  // Every beginner template shares the same three-tier scaffold policy.
  const PLAN: ScaffoldPlan = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' };

  // Beginner gate hints: rowCeiling stays at the default 200, boundedSlice is false
  // (that flag is an Advanced/rove requirement only).
  function gh(minRows: number, minDistinct: number, orderMatters: boolean): GateHints {
    return { minRows, minDistinct, rowCeiling: 200, orderMatters, boundedSlice: false };
  }
  ```

  Then replace the trailing empty array `export const APERTURE_TEMPLATES: Template[] = [];` with the full 17-template array below. Convention reminders baked in: no `ORDER BY` / no `ROUND` in any `sqlShape`; single-table and join families carry a `sortKey` slot; grouped families carry a `groupCols` slot; literal slots are `{ kind: 'literal', op, col }` with plain identifier names; `{slot}` placeholders in `sqlShape` are what emit/bind fill.

  ```ts
  export const APERTURE_TEMPLATES: Template[] = [
    // 1. ap-select-all: SELECT * is exempt from aliasing (invariant C.3). sortKey pins a
    // deterministic tiebreak; the predicate forces the primary key so bind yields one binding.
    {
      skill: 'ap-select-all', database: 'aperture', family: 'single-table', primaryTable: 'stars',
      sqlShape: 'SELECT * FROM stars',
      slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'star_id' }],
      phrasings: [
        'Return every column for all rows in the stars table.',
        'Show the full stars table with all of its columns.',
      ],
      hintTemplate: 'SELECT * keeps every column; you do not have to name them one by one.',
      scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
    },
    // 2. ap-select-columns: projection slot; bind picks a real column subset of planets.
    {
      skill: 'ap-select-columns', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT {cols} FROM planets',
      slots: [
        { name: 'cols', kind: 'projection', table: 'planets' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'List only the {cols} columns from the planets table.',
        'From planets, return just the columns {cols}.',
      ],
      hintTemplate: 'Name the columns you want after SELECT, comma-separated, instead of *.',
      scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
    },
    // 3. ap-order-by: the sortKey column is the taught sort key; emit appends ORDER BY {sortKey}.
    {
      skill: 'ap-order-by', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name, {sortKey} FROM planets',
      slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string, cat: any) => numericCols(cat, 'planets').some((c) => c.name === v) }],
      phrasings: [
        'List each planet name and its {sortKey}, sorted by {sortKey} ascending.',
        'Order planets by {sortKey} and show planet_name alongside it.',
      ],
      hintTemplate: 'ORDER BY {sortKey} sorts the rows; ascending is the default.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 4. ap-limit-topn: a limit slot; emit appends the family tiebreak then LIMIT {topN}.
    {
      skill: 'ap-limit-topn', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name, {sortKey} FROM planets',
      slots: [
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
        { name: 'topN', kind: 'limit' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string, cat: any) => numericCols(cat, 'planets').some((c) => c.name === v) }],
      phrasings: [
        'Show the {topN} planets with the highest {sortKey}.',
        'Return the top {topN} planets ranked by {sortKey} descending.',
      ],
      hintTemplate: 'Order by {sortKey} descending, then LIMIT {topN}.',
      scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
    },
    // 5. ap-distinct: DISTINCT over a text column; sortKey pins deterministic order.
    {
      skill: 'ap-distinct', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT DISTINCT {sortKey} FROM planets',
      slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string, cat: any) => textCols(cat, 'planets').some((c) => c.name === v) }],
      phrasings: [
        'List every distinct {sortKey} value in the planets table.',
        'Show each unique {sortKey} from planets, one per row.',
      ],
      hintTemplate: 'SELECT DISTINCT {sortKey} collapses repeated values to one each.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 6. ap-where-comparison: literal slot renders "op value" (e.g. > 6000) drawn from temperature_k.
    {
      skill: 'ap-where-comparison', database: 'aperture', family: 'single-table', primaryTable: 'stars',
      sqlShape: 'SELECT star_name, temperature_k FROM stars WHERE temperature_k {cmp}',
      slots: [
        { name: 'cmp', kind: 'literal', op: '>', col: 'temperature_k' },
        { name: 'sortKey', kind: 'sortKey', table: 'stars' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'star_id' }],
      phrasings: [
        'List the star_name and temperature_k of stars hotter than {cmp}.',
        'Return stars whose temperature_k is {cmp}, with their names.',
      ],
      hintTemplate: 'A WHERE comparison keeps only rows where temperature_k {cmp} holds.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 7. ap-where-boolean-logic: two literal slots joined by AND (boolean + text equality).
    {
      skill: 'ap-where-boolean-logic', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name FROM planets WHERE in_habitable_zone {hz} AND planet_type {typeEq}',
      slots: [
        { name: 'hz', kind: 'literal', op: '=', col: 'in_habitable_zone' },
        { name: 'typeEq', kind: 'literal', op: '=', col: 'planet_type' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'List planets in the habitable zone whose planet_type {typeEq}.',
        'Return planet_name where in_habitable_zone {hz} and planet_type {typeEq}.',
      ],
      hintTemplate: 'AND requires both conditions to be true at once.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 8. ap-where-between-in: BETWEEN with a compound-row draw so both endpoints co-occur.
    {
      skill: 'ap-where-between-in', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name, discovery_year FROM planets WHERE discovery_year {yrRange}',
      slots: [
        { name: 'yrRange', kind: 'literal', op: 'BETWEEN', col: 'discovery_year', sampleStrategy: 'compound-row' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'List planets whose discovery_year falls in the range {yrRange}.',
        'Return planet_name and discovery_year for discovery_year {yrRange}.',
      ],
      hintTemplate: 'BETWEEN a AND b is an inclusive range on discovery_year.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 9. ap-where-like: LIKE literal draws a real prefix pattern from star_name.
    {
      skill: 'ap-where-like', database: 'aperture', family: 'single-table', primaryTable: 'stars',
      sqlShape: 'SELECT star_name FROM stars WHERE star_name {namePat}',
      slots: [
        { name: 'namePat', kind: 'literal', op: 'LIKE', col: 'star_name' },
        { name: 'sortKey', kind: 'sortKey', table: 'stars' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'star_id' }],
      phrasings: [
        'List stars whose star_name matches the pattern {namePat}.',
        'Return every star_name that is LIKE {namePat}.',
      ],
      hintTemplate: 'LIKE {namePat} uses % for any run of characters, _ for exactly one.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 10. ap-null-handling: IS NULL literal renders just the clause (no value) on the teaching column.
    {
      skill: 'ap-null-handling', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name FROM planets WHERE {nullChk}',
      slots: [
        { name: 'nullChk', kind: 'literal', op: 'IS NULL', col: 'equilibrium_temp_k' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'List planets whose equilibrium_temp_k is missing.',
        'Return planet_name for every planet where equilibrium_temp_k IS NULL.',
      ],
      hintTemplate: 'Test unknown values with IS NULL, never with = NULL.',
      scaffoldPlan: PLAN, gateHints: gh(2, 1, true),
    },
    // 11. ap-computed-columns: derived expression (no aggregate, so emit does NOT ROUND it);
    // the WHERE bounds the row count under the ceiling.
    {
      skill: 'ap-computed-columns', database: 'aperture', family: 'single-table', primaryTable: 'planets',
      sqlShape: 'SELECT planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets WHERE orbital_period_days {opFilter}',
      slots: [
        { name: 'opFilter', kind: 'literal', op: '<', col: 'orbital_period_days' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'For planets with orbital_period_days {opFilter}, show planet_name and the orbital period in years as orbital_years.',
        'Compute orbital_years = orbital_period_days / 365.0 for planets where orbital_period_days {opFilter}.',
      ],
      hintTemplate: 'Put the arithmetic right in the SELECT list and name it with AS.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 12. ap-column-alias: two AS aliases; WHERE keeps the result bounded.
    {
      skill: 'ap-column-alias', database: 'aperture', family: 'single-table', primaryTable: 'stars',
      sqlShape: 'SELECT star_name AS name, distance_ly AS light_years FROM stars WHERE distance_ly {dFilter}',
      slots: [
        { name: 'dFilter', kind: 'literal', op: '<', col: 'distance_ly' },
        { name: 'sortKey', kind: 'sortKey', table: 'stars' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'star_id' }],
      phrasings: [
        'List stars closer than {dFilter} light years, aliasing star_name as name and distance_ly as light_years.',
        'Return name (from star_name) and light_years (from distance_ly) for stars where distance_ly {dFilter}.',
      ],
      hintTemplate: 'AS renames the output column without touching the stored one.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
    // 13. ap-aggregate-scalar: single-row summary. No tiebreak slot: only single-table/grouped/
    // windowed families require one (invariant C.2). AVG is a float aggregate, so emit wraps it
    // in ROUND exactly once (invariant C.4); the template never writes ROUND.
    {
      skill: 'ap-aggregate-scalar', database: 'aperture', family: 'aggregate-scalar', primaryTable: 'planets',
      sqlShape: 'SELECT COUNT(*) AS planet_count, AVG(mass_earth) AS avg_mass FROM planets WHERE planet_type {typeEq}',
      slots: [{ name: 'typeEq', kind: 'literal', op: '=', col: 'planet_type' }],
      bindingRules: [],
      phrasings: [
        'Count the planets whose planet_type {typeEq} and report their average mass_earth as avg_mass.',
        'For planet_type {typeEq}, return planet_count and avg_mass.',
      ],
      hintTemplate: 'With no GROUP BY, COUNT and AVG collapse the filtered rows into one summary row.',
      scaffoldPlan: PLAN, gateHints: gh(1, 1, false),
    },
    // 14. ap-group-by: groupCols slot drives both GROUP BY and the emit tiebreak.
    {
      skill: 'ap-group-by', database: 'aperture', family: 'grouped', primaryTable: 'planets',
      sqlShape: 'SELECT {groupCols}, COUNT(*) AS n FROM planets GROUP BY {groupCols}',
      slots: [{ name: 'groupCols', kind: 'groupCols', table: 'planets' }],
      bindingRules: [{ slot: 'groupCols', predicate: (v: string) => ['planet_type', 'discovery_method', 'discovery_year'].includes(v) }],
      phrasings: [
        'Count the planets in each {groupCols} group.',
        'For each distinct {groupCols}, return {groupCols} and the row count as n.',
      ],
      hintTemplate: 'GROUP BY {groupCols} makes one output row per distinct value; COUNT(*) counts each bucket.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, false),
    },
    // 15. ap-having: HAVING filters the groups; the threshold is drawn from mass_earth.
    {
      skill: 'ap-having', database: 'aperture', family: 'grouped', primaryTable: 'planets',
      sqlShape: 'SELECT {groupCols}, AVG(mass_earth) AS avg_mass FROM planets GROUP BY {groupCols} HAVING AVG(mass_earth) {havingCmp}',
      slots: [
        { name: 'groupCols', kind: 'groupCols', table: 'planets' },
        { name: 'havingCmp', kind: 'literal', op: '>', col: 'mass_earth' },
      ],
      bindingRules: [{ slot: 'groupCols', predicate: (v: string) => ['planet_type', 'discovery_method'].includes(v) }],
      phrasings: [
        'Show each {groupCols} whose average mass_earth {havingCmp}, with that average as avg_mass.',
        'Group planets by {groupCols} and keep only groups where AVG(mass_earth) {havingCmp}.',
      ],
      hintTemplate: 'HAVING filters the groups after aggregation, the way WHERE filters rows before it.',
      scaffoldPlan: PLAN, gateHints: gh(2, 1, false),
    },
    // 16. ap-group-by-sort-top: grouped + a limit slot. emit orders grouped+limit results by the
    // aggregate descending then the groupCols tiebreak, then LIMIT {topN}.
    {
      skill: 'ap-group-by-sort-top', database: 'aperture', family: 'grouped', primaryTable: 'planets',
      sqlShape: 'SELECT {groupCols}, COUNT(*) AS n FROM planets GROUP BY {groupCols}',
      slots: [
        { name: 'groupCols', kind: 'groupCols', table: 'planets' },
        { name: 'topN', kind: 'limit' },
      ],
      bindingRules: [{ slot: 'groupCols', predicate: (v: string) => ['planet_type', 'discovery_method'].includes(v) }],
      phrasings: [
        'Show the {topN} {groupCols} groups with the most planets.',
        'Return the top {topN} {groupCols} values ranked by planet count descending.',
      ],
      hintTemplate: 'Group, order by COUNT(*) descending with a {groupCols} tiebreak, then LIMIT {topN}.',
      scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
    },
    // 17. ap-join-intro: inner join family; sortKey pins deterministic order, WHERE bounds rows.
    {
      skill: 'ap-join-intro', database: 'aperture', family: 'join', primaryTable: 'planets',
      sqlShape: 'SELECT planets.planet_name, stars.star_name FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE planets.in_habitable_zone {hz}',
      slots: [
        { name: 'hz', kind: 'literal', op: '=', col: 'in_habitable_zone', table: 'planets' },
        { name: 'sortKey', kind: 'sortKey', table: 'planets' },
      ],
      bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'planet_id' }],
      phrasings: [
        'For each habitable-zone planet, list its planet_name and the star_name of its host star.',
        'Join planets to stars on star_id and return planet_name with the host star_name for planets where in_habitable_zone {hz}.',
      ],
      hintTemplate: 'Match rows across the two tables on planets.star_id = stars.star_id.',
      scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
    },
  ];
  ```

- [ ] **Step 5: Run the test GREEN.** Recompile and run; every assertion now passes.

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc -p tsconfig.json && node --test dist/test/aperture-templates.test.js
  ```

  Expected: `# pass 8`, `# fail 0`. If `tsc` reports an unused import for `numericCols`/`textCols`, confirm they are referenced inside the `ap-order-by`, `ap-distinct` predicates (they are); if it flags an unknown export `PhaseMeta`/`CheckpointMeta`, T0 has not yet added those types to `src/generator/types.ts` per resolutions H1 and this task cannot proceed until T0 lands.

- [ ] **Step 6: Commit.**

  ```bash
  cd /c/Dev/Projects/sql-mastery
  git add src/generator/templates/aperture/index.ts test/aperture-templates.test.ts
  git commit -m "$(cat <<'EOF'
  Task 7: fill aperture beginner templates (17) + phase model

  Add all 17 ap- templates, APERTURE_SKILLS (1:1 with templates and
  APERTURE_CONCEPT_META), teach blocks, plus APERTURE_PHASES (5) and
  APERTURE_CHECKPOINTS (cpA..cpD mid + cpE capstone). Templates follow the
  T4 emit/bind convention: no ORDER BY / no ROUND in sqlShape, sortKey /
  groupCols tiebreak slots, plain-identifier literal slots on real aperture
  columns. Structural unit test at test/aperture-templates.test.ts.

  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  EOF
  )"
  ```

---

### Task 8: Aperture phase assembly + freeze + validate

Fills the aperture phase module by consuming the T7 template/meta registries and the generated (fingerprinted) exercise map, composing FIVE `beginner` phases (`ap-basics`, `ap-filtering`, `ap-shaping`, `ap-aggregation`, `ap-join`) per the H2/H4/H5 phase model, wiring checkpoints `cpA..cpE`, freezing the generated exercises, and validating 100% against the locally seeded `aperture` Postgres DB. This task derives phase structure from `APERTURE_PHASES` / `APERTURE_CONCEPT_META` / `APERTURE_CHECKPOINTS`; it never redefines skills, concept meta, or checkpoint metadata (those are owned by T7), and it reads NO phase-plan JSON.

Global constraints (inherited): ASCII only (hyphen `-` and two-char arrow `->` only; no en/em dashes or unicode arrows). Determinism: no `Math.random` / `Date.now` / argless `new Date`. CommonJS with extensionless relative imports (NEVER a `.js` suffix on a relative import). Server tests live at top-level `test/<name>.test.ts` and run via `node --test dist/test/*.test.js`. `PGPASSWORD` is supplied only at runtime and MUST NOT appear in any file, test, or committed artifact.

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\phases\aperture\index.ts` (T0 stub `export const aperturePhases: Phase[] = []` -> real assembly)
- Create (written by the generate CLI, then committed here): `C:\Dev\Projects\sql-mastery\src\phases\aperture\exercises.generated.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\aperture-phases.test.ts`

**Interfaces:**
- Consumes (exact signatures from the contract; do NOT redefine):
  - From `src/generator/templates/aperture/index` (T7): `APERTURE_PHASES: PhaseMeta[]` where `PhaseMeta = { id: string; title: string; goal: string; level: Level; order: number }`; `APERTURE_CONCEPT_META: ConceptMeta[]` (each carries `phaseId` + LOCAL `order`); `APERTURE_CHECKPOINTS: CheckpointMeta[]` where `CheckpointMeta = { id: string; phaseId: string; afterOrder: number; drawFromSkills: string[]; title: string }`; `APERTURE_SKILLS: string[]` (17 slugs).
  - From `src/phases/aperture/exercises.generated` (written by the T6 generate CLI): `APERTURE_EXERCISES: Record<string, Exercise[]>` (skill -> fingerprinted `Exercise[]`).
  - From `src/generator/types` (T0): `Phase`, `Concept`, `Checkpoint`, `ConceptMeta`, `PhaseMeta`, `CheckpointMeta`, `Exercise`, `Level`.
  - From `src/learning-path` (existing): `flattenLearningPath(phases: any[])`.
  - CLI entry points (T6): `node dist/scripts/generate-exercises.js --db aperture`, `node dist/scripts/validate-exercises.js --db aperture`.
- Produces (later tasks rely on these exact names):
  - `export const aperturePhases: Phase[]` from `src/phases/aperture/index` (consumed by T14 `getPhases()` union; already contiguous `order` 1..5 so T14 does NOT re-number).
  - Frozen `APERTURE_EXERCISES` map committed at `src/phases/aperture/exercises.generated.ts`.

---

- [ ] **Step 1: Write the failing assembly test.** Create `C:\Dev\Projects\sql-mastery\test\aperture-phases.test.ts`. It pins the FIVE-phase model, 17-concept union, teach + fingerprinted exercises, `cpA..cpE` wiring with the `cpE` capstone in `ap-join`, and that `flattenLearningPath` (the shape `getPhases` feeds the client) sees 17 concepts + 5 checkpoints with contiguous global order.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aperturePhases } from '../src/phases/aperture/index';
import { flattenLearningPath } from '../src/learning-path';

const APERTURE_PHASE_IDS = ['ap-basics', 'ap-filtering', 'ap-shaping', 'ap-aggregation', 'ap-join'];

test('aperture assembles exactly 5 beginner phases in canonical global order', () => {
  assert.equal(aperturePhases.length, 5);
  assert.deepEqual(aperturePhases.map((p) => p.id), APERTURE_PHASE_IDS);
  assert.deepEqual(aperturePhases.map((p) => p.order), [1, 2, 3, 4, 5]);
  for (const p of aperturePhases) {
    assert.equal(p.level, 'beginner');
    assert.equal(p.database, 'aperture');
    assert.ok(typeof p.goal === 'string' && p.goal.length > 0);
  }
});

test('aperture band totals 17 concepts with contiguous LOCAL order per phase', () => {
  const total = aperturePhases.reduce((n, p) => n + p.concepts.length, 0);
  assert.equal(total, 17);
  const skills = new Set<string>();
  for (const p of aperturePhases) {
    const orders = p.concepts.map((c) => c.order);
    assert.deepEqual(orders, orders.map((_, i) => i + 1)); // LOCAL 1..count, no gaps
    for (const c of p.concepts) {
      assert.equal(c.phaseId, p.id);
      assert.ok(!skills.has(c.skill), `duplicate skill ${c.skill}`);
      skills.add(c.skill);
    }
  }
  assert.equal(skills.size, 17);
});

test('every concept carries a teach block and >=1 fingerprinted exercise', () => {
  for (const p of aperturePhases) {
    for (const c of p.concepts) {
      assert.ok(c.teach && typeof c.teach.plain === 'string' && c.teach.plain.length > 0);
      assert.ok(c.exercises.length >= 1, `${c.skill} has no exercises`);
      for (const ex of c.exercises) {
        assert.equal(ex.database, 'aperture');
        assert.ok(ex.fingerprint && Array.isArray(ex.fingerprint.columns), `${ex.id} missing fingerprint`);
        assert.ok(ex.starterSql && typeof ex.starterSql.full === 'string');
      }
    }
  }
});

test('checkpoints cpA..cpE wired; cpE capstone lives in ap-join and draws every beginner skill', () => {
  const ids = aperturePhases.flatMap((p) => p.checkpoints.map((cp) => cp.id)).sort();
  assert.deepEqual(ids, ['cpA', 'cpB', 'cpC', 'cpD', 'cpE']);
  const join = aperturePhases.find((p) => p.id === 'ap-join');
  assert.ok(join, 'ap-join phase must exist');
  const cpE = join!.checkpoints.find((cp) => cp.id === 'cpE');
  assert.ok(cpE, 'cpE capstone must sit in ap-join');
  const bandSkills = aperturePhases.flatMap((p) => p.concepts.map((c) => c.skill));
  assert.deepEqual([...cpE!.drawFromSkills].sort(), [...bandSkills].sort());
  for (const p of aperturePhases) {
    for (const cp of p.checkpoints) {
      const maxLocal = Math.max(...p.concepts.map((c) => c.order));
      assert.ok(cp.afterOrder >= 1 && cp.afterOrder <= maxLocal, `${cp.id} afterOrder out of local range`);
    }
  }
});

test('flattenLearningPath (what getPhases feeds) sees 17 concepts + 5 checkpoints', () => {
  const flat = flattenLearningPath([...aperturePhases]);
  assert.equal(flat.concepts.length, 17);
  assert.equal(flat.checkpoints.length, 5);
  assert.deepEqual(flat.concepts.map((c: any) => c.order), Array.from({ length: 17 }, (_, i) => i + 1));
});
```

- [ ] **Step 2: Build and run the test RED.** The T0 stub still exports `aperturePhases = []`, so assembly assertions fail. Run:

```bash
cd /c/Dev/Projects/sql-mastery
npm run build:server
node --test dist/test/aperture-phases.test.js
```

Expected failure (empty stub): the first test fails with `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 5` at `assert.equal(aperturePhases.length, 5)`. This confirms the test is wired to the real module before any implementation.

- [ ] **Step 3: Generate the frozen aperture exercise map against seeded Postgres.** Export `PGPASSWORD` in your shell first (it must NEVER be written to a file or committed). The generate CLI (T6) runs `buildAllExercises` + `curate` + the bake/validate path and writes ONLY `src/phases/aperture/exercises.generated.ts` (the `APERTURE_EXERCISES` skill -> fingerprinted `Exercise[]` map); it writes NO phase structure.

```bash
cd /c/Dev/Projects/sql-mastery
# PGPASSWORD must already be exported in this shell; do NOT echo or commit it.
: "${PGPASSWORD:?set PGPASSWORD in your environment before running}"
npm run build:server
node dist/scripts/generate-exercises.js --db aperture
```

Expected: it prints per-concept honest counts and writes `src/phases/aperture/exercises.generated.ts`. Confirm the file now exists and exports the map:

```bash
head -n 3 /c/Dev/Projects/sql-mastery/src/phases/aperture/exercises.generated.ts
```

Expected to include `export const APERTURE_EXERCISES: Record<string, Exercise[]> = {`.

- [ ] **Step 4: Verify honest per-concept counts (no empty concept, all 17 skills present).** curate/`honestCounts` legitimately leave thin concepts like `ap-select-all` at ~3-6; the hard requirement is every skill has at least one exercise. Rebuild so the generated module is in `dist`, then assert coverage:

```bash
cd /c/Dev/Projects/sql-mastery
npm run build:server
node -e '
const { APERTURE_EXERCISES } = require("./dist/src/phases/aperture/exercises.generated.js");
const { APERTURE_SKILLS } = require("./dist/src/generator/templates/aperture/index.js");
let total = 0;
for (const skill of APERTURE_SKILLS) {
  const n = (APERTURE_EXERCISES[skill] || []).length;
  total += n;
  console.log(String(skill).padEnd(26), n);
  if (n < 1) { console.error("EMPTY concept: " + skill); process.exit(1); }
}
console.log("skills:", APERTURE_SKILLS.length, "exercises:", total);
if (APERTURE_SKILLS.length !== 17) { console.error("expected 17 aperture skills, got " + APERTURE_SKILLS.length); process.exit(1); }
'
```

Expected: a 17-row count table (each count >= 1), then `skills: 17 exercises: <N>` and exit code 0. If any concept is EMPTY, the fix belongs upstream (T7 template/meta or T5 curate); re-run Step 3 after that fix.

- [ ] **Step 5: Implement the phase assembly (fill the T0 stub).** Replace the entire contents of `C:\Dev\Projects\sql-mastery\src\phases\aperture\index.ts`. For each `PhaseMeta` in `APERTURE_PHASES` sorted by `order`, build a `Phase` whose concepts are `APERTURE_CONCEPT_META` filtered by `phaseId` and sorted by LOCAL order (each `Concept.exercises` = the generated fingerprinted list for that skill), and whose checkpoints are `APERTURE_CHECKPOINTS` filtered by `phaseId` (mapped to `Checkpoint` by dropping `phaseId`). Aperture is the first band, so global `phase.order = PhaseMeta.order` (H4). Never collapse the band into one phase.

```ts
import type { Phase, Concept, Checkpoint } from '../../generator/types';
import {
  APERTURE_PHASES,
  APERTURE_CONCEPT_META,
  APERTURE_CHECKPOINTS
} from '../../generator/templates/aperture/index';
import { APERTURE_EXERCISES } from './exercises.generated';

// Aperture is the FIRST band: global phase.order == PhaseMeta.order (no band offset).
// Phases are derived, never hardcoded: group APERTURE_CONCEPT_META by phaseId per
// APERTURE_PHASES, attach the generated+fingerprinted exercises per skill, and attach
// APERTURE_CHECKPOINTS per phaseId (dropping phaseId to form Checkpoint).
function buildAperturePhases(): Phase[] {
  return [...APERTURE_PHASES]
    .sort((a, b) => a.order - b.order)
    .map((pm): Phase => {
      const concepts: Concept[] = APERTURE_CONCEPT_META
        .filter((m) => m.phaseId === pm.id)
        .sort((a, b) => a.order - b.order)
        .map((m): Concept => ({
          id: `concept:${m.skill}`,
          order: m.order,
          skill: m.skill,
          title: m.title,
          teach: m.teach,
          exercises: APERTURE_EXERCISES[m.skill] ?? [],
          phaseId: pm.id
        }));
      const checkpoints: Checkpoint[] = APERTURE_CHECKPOINTS
        .filter((cp) => cp.phaseId === pm.id)
        .map((cp): Checkpoint => ({
          id: cp.id,
          afterOrder: cp.afterOrder,
          drawFromSkills: cp.drawFromSkills,
          title: cp.title
        }));
      return {
        id: pm.id,
        order: pm.order,
        title: pm.title,
        goal: pm.goal,
        level: pm.level,
        database: 'aperture',
        concepts,
        checkpoints
      };
    });
}

export const aperturePhases: Phase[] = buildAperturePhases();
```

- [ ] **Step 6: Build and run the test GREEN.**

```bash
cd /c/Dev/Projects/sql-mastery
npm run build:server
node --test dist/test/aperture-phases.test.js
```

Expected: all 5 tests pass, for example `# pass 5` / `# fail 0`. If `checkpoints cpA..cpE` fails because the capstone `cpE` is missing from `ap-join` or its `drawFromSkills` does not equal the full band skill set, that is a T7 `APERTURE_CHECKPOINTS` authoring gap; fix it in the templates module, then re-run Steps 3, 5, 6.

- [ ] **Step 7: Validate 100% against seeded aperture (g0..g9).** With `PGPASSWORD` still exported, run the harness over the assembled band. Every exercise must pass all gates (snapshot identity, runs, non-empty, row-ceiling, stable-order, non-degenerate, duplicate-column, task<->answer determinism, scaffold fill-back, self-check).

```bash
cd /c/Dev/Projects/sql-mastery
: "${PGPASSWORD:?set PGPASSWORD in your environment before running}"
npm run build:server
node dist/scripts/validate-exercises.js --db aperture
echo "exit: $?"
```

Expected: a per-gate summary ending in `0 failures` (all aperture exercises + checkpoint-pool items green) and `exit: 0`. On any failure, read the printed `GateResult.message`, fix the offending upstream owner (G1/G4/G5 -> T4 emit or T7 template; G7 -> T5 task-text; G8 -> T5 scaffold), then re-run Steps 3 through 7. Do NOT edit skills, concept meta, or checkpoint metadata in this task.

- [ ] **Step 8: Commit the frozen generated module + assembly + test.**

```bash
cd /c/Dev/Projects/sql-mastery
git add src/phases/aperture/index.ts src/phases/aperture/exercises.generated.ts test/aperture-phases.test.ts
git commit -m "$(cat <<'EOF'
Task 8: assemble + freeze + validate aperture (5 phases, 17 concepts, cpA-cpE)

Derive aperturePhases from APERTURE_PHASES/CONCEPT_META/CHECKPOINTS, attach the
generated fingerprinted exercises per skill, and freeze exercises.generated.ts.
Validated 100% against locally seeded aperture Postgres (g0..g9).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Expected: one commit containing exactly the three files. `exercises.generated.ts` must contain no secrets (no `PGPASSWORD`); confirm with `git show --stat HEAD` before moving on.

---

### Task 9: Rove dataset extension for recursive CTE

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\datasets\rove\pools.ts` (add category tree constant + leaf map)
- Modify: `C:\Dev\Projects\sql-mastery\src\datasets\rove\generate.ts` (build categories, assign `merchants.category_id`, register table)
- Modify: `C:\Dev\Projects\sql-mastery\src\datasets\rove\mess.ts` (one new orphan-parent defect, appended to orchestrator)
- Modify: `C:\Dev\Projects\sql-mastery\datasets\schema\rove.sql` (DROP list + `categories` DDL + `merchants.category_id`)
- Modify: `C:\Dev\Projects\sql-mastery\datasets\manifest.json` (`rove.categories` band)
- Modify: `C:\Dev\Projects\sql-mastery\scripts\verify-datasets.ts` (four new Rove checks)
- Create: `C:\Dev\Projects\sql-mastery\test\rove-categories.test.ts` (pure-generation TDD test)

**Interfaces:**
- Consumes (existing, unchanged): `deriveStream(baseSeed: number, name: string): Prng` and `pick<T>(rng: Prng, arr: readonly T[]): T` from the framework; `injectMess(data: Record<string, Row[]>, rng: Prng): void` orchestrator in `mess.ts`; `generateClean(seed: number)` / `generate(seed: number)` / `SEED` / `TABLES` from `generate.ts`; `sampleWithout`, `bernoulli` from `../framework/random`; the seed-runner insert order (`TABLES` array position = insert order, parents before children).
- Produces (new symbols later steps and verify rely on): `ROVE_CATEGORIES: readonly RoveCategorySeed[]` and `CATEGORY_LEAVES_BY_MERCHANT_CATEGORY: Record<string, readonly number[]>` in `pools.ts`; a new `categories` key in the generated data object with columns `category_id, name, parent_category_id`; a new `merchants.category_id` column; `CATEGORY_ORPHAN_COUNT: number` exported from `mess.ts` (imported by `verify-datasets.ts`).
- Global constraints inherited (in every code block below): ASCII only, ASCII hyphen `-` and two-char arrow `->` only; determinism via `deriveStream` (no `Math.random` / `Date.now` / argless `new Date`); CommonJS extensionless relative imports (no `.js` suffix); server tests under top-level `test/`; `PGPASSWORD` supplied only as a runtime env var, never written to any file.

---

- [ ] **Step 1: Write the failing clean-tree test.** Create `C:\Dev\Projects\sql-mastery\test\rove-categories.test.ts` with the clean-side assertions only (the mess assertions come in Step 4). This drives out the `categories` table shape and the `merchants.category_id` assignment.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rove from '../src/datasets/rove/generate';

// Adjacency walk (children-of) used to reproduce a WITH RECURSIVE descendant walk in plain JS.
function descendantsOf(rows: any[], rootId: number): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const r of rows) {
    const p = r.parent_category_id as number | null;
    if (p === null) continue;
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(r.category_id as number);
  }
  const out: number[] = [];
  const stack: number[] = [rootId];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    out.push(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return out.sort((a, b) => a - b);
}

// Depth of a node by walking parent pointers in a clean (orphan-free) tree.
function depthOf(byId: Map<number, number | null>, id: number): number {
  let depth = 1;
  let cur: number | null = id;
  while (cur !== null) {
    const parent = byId.get(cur);
    if (parent === undefined || parent === null) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

const EXPECTED_RESTAURANTS_SUBTREE = [1, 7, 8, 9, 19, 20, 21, 22, 23, 24, 25, 26, 38, 39];

test('rove clean core builds a valid <= 3 level category tree with merchant leaf FKs', () => {
  const d = rove.generateClean(rove.SEED);
  const categories = d.categories as any[];

  assert.equal(categories.length, 40, `expected 40 categories, got ${categories.length}`);

  const ids = categories.map((c) => c.category_id as number);
  assert.equal(new Set(ids).size, ids.length, 'category_id values are not all distinct');

  const idSet = new Set(ids);
  const byId = new Map<number, number | null>();
  for (const c of categories) byId.set(c.category_id as number, c.parent_category_id as number | null);

  // Clean tree: every parent pointer is null (root) or a real category_id; depth never exceeds 3.
  for (const c of categories) {
    const parent = c.parent_category_id as number | null;
    if (parent !== null) {
      assert.ok(idSet.has(parent), `category ${c.category_id} points to missing parent ${parent}`);
    }
    assert.ok(depthOf(byId, c.category_id as number) <= 3, `category ${c.category_id} deeper than 3 levels`);
  }

  // A WITH RECURSIVE walk from the fixed Restaurants root (category_id 1) returns the bounded set.
  assert.deepEqual(descendantsOf(categories, 1), EXPECTED_RESTAURANTS_SUBTREE);

  // Every merchant carries a valid leaf category_id whose root matches its text category.
  const merchants = d.merchants as any[];
  const leavesByCategory: Record<string, number[]> = {
    restaurant: [19, 20, 21, 22, 23, 24, 25, 26, 38, 39],
    grocery: [27, 28, 29, 30, 40],
    pharmacy: [12, 31],
    convenience: [14, 32, 33],
    alcohol: [17, 34, 35],
    flowers: [36, 37],
  };
  for (const m of merchants) {
    const allowed = leavesByCategory[m.category as string];
    assert.ok(allowed !== undefined, `merchant ${m.merchant_id} has unknown category ${m.category}`);
    assert.ok(
      allowed.includes(m.category_id as number),
      `merchant ${m.merchant_id} (${m.category}) has category_id ${m.category_id} outside its leaf set`
    );
  }
});
```

Run it red:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/rove-categories.test.js
```

Expected failure: the test compiles but fails at runtime with `TypeError: Cannot read properties of undefined (reading 'length')` at the `categories.length` assertion, because `generateClean` does not yet emit a `categories` key.

- [ ] **Step 2: Add the category tree pool.** Append the authored tree and leaf map to the end of `C:\Dev\Projects\sql-mastery\src\datasets\rove\pools.ts`. The tree is a fixed, deterministic dimension (like `ROVE_CITIES`); category ids are contiguous 1..40, every parent id is smaller than its child so a single ordered INSERT satisfies parent-before-child.

```ts
// -------------------------------------------------------------------------------------------
// Delivery-category hierarchy (rv-recursive-cte). A fixed, self-referencing tree: 6 roots (one
// per merchant category), a middle band, and leaf nodes merchants attach to. Max depth 3.
// category_id is contiguous 1..40 and every parentCategoryId is strictly smaller than its own
// id, so a single ordered INSERT lands parents before children. parent_category_id carries NO
// database FK (see rove.sql), which is what lets the mess layer inject bounded orphaned pointers.
// -------------------------------------------------------------------------------------------

export interface RoveCategorySeed {
  categoryId: number;
  name: string;
  parentCategoryId: number | null;
}

export const ROVE_CATEGORIES: readonly RoveCategorySeed[] = [
  // Level 1 roots (parent null) -- one per merchant category.
  { categoryId: 1, name: 'Restaurants', parentCategoryId: null },
  { categoryId: 2, name: 'Grocery', parentCategoryId: null },
  { categoryId: 3, name: 'Pharmacy', parentCategoryId: null },
  { categoryId: 4, name: 'Convenience', parentCategoryId: null },
  { categoryId: 5, name: 'Alcohol', parentCategoryId: null },
  { categoryId: 6, name: 'Flowers', parentCategoryId: null },
  // Level 2.
  { categoryId: 7, name: 'Fast Food', parentCategoryId: 1 },
  { categoryId: 8, name: 'Sit Down', parentCategoryId: 1 },
  { categoryId: 9, name: 'Cafe', parentCategoryId: 1 },
  { categoryId: 10, name: 'Supermarket', parentCategoryId: 2 },
  { categoryId: 11, name: 'Specialty Grocery', parentCategoryId: 2 },
  { categoryId: 12, name: 'Prescription', parentCategoryId: 3 },
  { categoryId: 13, name: 'Health and Wellness', parentCategoryId: 3 },
  { categoryId: 14, name: 'Corner Store', parentCategoryId: 4 },
  { categoryId: 15, name: 'Snacks', parentCategoryId: 4 },
  { categoryId: 16, name: 'Beer and Wine', parentCategoryId: 5 },
  { categoryId: 17, name: 'Spirits', parentCategoryId: 5 },
  { categoryId: 18, name: 'Bouquets', parentCategoryId: 6 },
  // Level 3 leaves.
  { categoryId: 19, name: 'Burgers', parentCategoryId: 7 },
  { categoryId: 20, name: 'Pizza', parentCategoryId: 7 },
  { categoryId: 21, name: 'Tacos', parentCategoryId: 7 },
  { categoryId: 22, name: 'Italian', parentCategoryId: 8 },
  { categoryId: 23, name: 'Asian', parentCategoryId: 8 },
  { categoryId: 24, name: 'Steakhouse', parentCategoryId: 8 },
  { categoryId: 25, name: 'Coffee', parentCategoryId: 9 },
  { categoryId: 26, name: 'Bakery', parentCategoryId: 9 },
  { categoryId: 27, name: 'Produce', parentCategoryId: 10 },
  { categoryId: 28, name: 'Meat and Seafood', parentCategoryId: 10 },
  { categoryId: 29, name: 'Organic', parentCategoryId: 11 },
  { categoryId: 30, name: 'International', parentCategoryId: 11 },
  { categoryId: 31, name: 'Vitamins', parentCategoryId: 13 },
  { categoryId: 32, name: 'Chips', parentCategoryId: 15 },
  { categoryId: 33, name: 'Candy', parentCategoryId: 15 },
  { categoryId: 34, name: 'Craft Beer', parentCategoryId: 16 },
  { categoryId: 35, name: 'Wine', parentCategoryId: 16 },
  { categoryId: 36, name: 'Roses', parentCategoryId: 18 },
  { categoryId: 37, name: 'Seasonal', parentCategoryId: 18 },
  { categoryId: 38, name: 'Sandwiches', parentCategoryId: 7 },
  { categoryId: 39, name: 'Desserts', parentCategoryId: 9 },
  { categoryId: 40, name: 'Deli', parentCategoryId: 10 },
];

// Merchant text category -> leaf category ids under that root. Every leaf (a category with no
// children) sits under exactly one root, so merchant text category and assigned leaf never
// disagree. Keys match MERCHANT_CATEGORY_WEIGHTS exactly.
export const CATEGORY_LEAVES_BY_MERCHANT_CATEGORY: Record<string, readonly number[]> = {
  restaurant: [19, 20, 21, 22, 23, 24, 25, 26, 38, 39],
  grocery: [27, 28, 29, 30, 40],
  pharmacy: [12, 31],
  convenience: [14, 32, 33],
  alcohol: [17, 34, 35],
  flowers: [36, 37],
};
```

- [ ] **Step 3: Build categories and assign merchant leaves in the generator.** Make four edits to `C:\Dev\Projects\sql-mastery\src\datasets\rove\generate.ts`.

3a. Extend the pools import (the block that starts `import { ROVE_CITIES,`) to pull in the two new symbols. Change:

```ts
import {
  ROVE_CITIES,
  RoveCitySeed,
```

to:

```ts
import {
  ROVE_CITIES,
  ROVE_CATEGORIES,
  CATEGORY_LEAVES_BY_MERCHANT_CATEGORY,
  RoveCitySeed,
```

3b. Register the new table and the new merchant column in `TABLES`. `categories` must sit before `merchants` (insert order = parents before children). Replace the existing `merchants` entry:

```ts
  {
    name: 'merchants',
    columns: ['merchant_id', 'city_id', 'name', 'category', 'price_tier', 'onboarded_on', 'avg_prep_minutes', 'is_active'],
  },
```

with:

```ts
  {
    name: 'categories',
    columns: ['category_id', 'name', 'parent_category_id'],
  },
  {
    name: 'merchants',
    columns: ['merchant_id', 'city_id', 'category_id', 'name', 'category', 'price_tier', 'onboarded_on', 'avg_prep_minutes', 'is_active'],
  },
```

3c. Add the builder and the merchant-leaf assignment. Insert these two functions immediately after the existing `buildCities()` function:

```ts
function buildCategories(): Row[] {
  return ROVE_CATEGORIES.map((cat) => ({
    category_id: cat.categoryId,
    name: cat.name,
    parent_category_id: cat.parentCategoryId,
  }));
}

// Assigns each merchant a leaf category_id under the root that matches its text category. Uses a
// dedicated 'merchant_categories' stream so no existing merchant field draw shifts: the rest of
// the clean core stays byte-identical to before this task.
function assignMerchantCategories(seed: number, merchants: MerchantsResult): void {
  const rng = deriveStream(seed, 'merchant_categories');
  for (const row of merchants.rows) {
    const leaves = CATEGORY_LEAVES_BY_MERCHANT_CATEGORY[row.category as string];
    row.category_id = pick(rng, leaves);
  }
}
```

3d. Wire them into `generateClean`. Change:

```ts
  const cities = buildCities();
  const merchants = buildMerchants(seed, cityWeights);
```

to:

```ts
  const cities = buildCities();
  const categories = buildCategories();
  const merchants = buildMerchants(seed, cityWeights);
  assignMerchantCategories(seed, merchants);
```

and add `categories` to the returned object. Change:

```ts
  return {
    cities,
    merchants: merchants.rows,
```

to:

```ts
  return {
    cities,
    categories,
    merchants: merchants.rows,
```

Run the test green:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/rove-categories.test.js
```

Expected: `rove clean core builds a valid <= 3 level category tree with merchant leaf FKs` passes (1 test, 0 fail).

- [ ] **Step 4: Extend the test with the mess (orphan) assertions, red.** Append this second test to `C:\Dev\Projects\sql-mastery\test\rove-categories.test.ts`. It imports the not-yet-existing `CATEGORY_ORPHAN_COUNT`, so it fails to compile.

```ts
import { CATEGORY_ORPHAN_COUNT } from '../src/datasets/rove/mess';

test('rove mess injects bounded orphaned category parents that stay cleanable', () => {
  const d = rove.generate(rove.SEED);
  const categories = d.categories as any[];

  assert.equal(categories.length, 40, 'mess must not change the category row count');

  const idSet = new Set(categories.map((c) => c.category_id as number));

  // Exactly CATEGORY_ORPHAN_COUNT non-null parent pointers reference a missing (orphaned) parent.
  const orphans = categories.filter((c) => {
    const p = c.parent_category_id as number | null;
    return p !== null && !idSet.has(p);
  });
  assert.equal(orphans.length, CATEGORY_ORPHAN_COUNT, `expected ${CATEGORY_ORPHAN_COUNT} orphaned parents, got ${orphans.length}`);

  // The Restaurants subtree (root 1) is never orphaned, so the fixed-root walk still returns 14.
  assert.deepEqual(descendantsOf(categories, 1), EXPECTED_RESTAURANTS_SUBTREE);

  // Cleanable/traversable: treat any missing-parent pointer as a root, then a recursive walk from
  // all roots reaches every one of the 40 nodes (no orphan is ever stranded, no cycle exists).
  const roots = categories
    .filter((c) => {
      const p = c.parent_category_id as number | null;
      return p === null || !idSet.has(p);
    })
    .map((c) => c.category_id as number);

  const childrenByParent = new Map<number, number[]>();
  for (const c of categories) {
    const p = c.parent_category_id as number | null;
    if (p === null || !idSet.has(p)) continue; // orphan pointer treated as a new root
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(c.category_id as number);
  }
  const reached = new Set<number>();
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    if (reached.has(id)) continue; // guards against any accidental cycle
    reached.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  assert.equal(reached.size, 40, `cleaned walk reached ${reached.size} of 40 categories`);

  // Money/text mess stays intact: orders still carry the legacy money-as-text column.
  const orders = d.orders as any[];
  assert.ok('order_total_legacy' in orders[0], 'order_total_legacy missing -> money mess was disturbed');
});
```

Run it red:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

Expected failure: `tsc` errors with `TS2305: Module '"../src/datasets/rove/mess"' has no exported member 'CATEGORY_ORPHAN_COUNT'.`

- [ ] **Step 5: Add the single orphan-parent defect to the mess layer, green.** Two edits to `C:\Dev\Projects\sql-mastery\src\datasets\rove\mess.ts`.

5a. Add the exported constant and the injector. Insert this block immediately before the `// Orchestrator.` banner near the bottom of the file:

```ts
// ---------------------------------------------------------------------------------------------
// Category hierarchy: bounded orphaned parent pointers (rv-recursive-cte). ONE defect: a few
// non-root categories have their parent_category_id repointed to a non-existent id (a "purged"
// parent), exactly like the R09 orphaned-ref pattern on orders. Reversible by DETECTION: an
// orphan is any non-null parent_category_id not present in categories.category_id, cleaned by
// re-rooting (treat the missing pointer as a root) so a WITH RECURSIVE walk stays traversable.
// The Restaurants subtree (root 1) is deliberately left pristine so the fixed-root walk lesson
// returns the same bounded set on the seeded DB as on the clean answer key.
// ---------------------------------------------------------------------------------------------

export const CATEGORY_ORPHAN_COUNT = 3;

// Well above the 40 real category ids, so a repointed parent is provably non-existent by
// construction and can never collide with a real category_id.
const CATEGORY_ORPHAN_PARENT_BASE = 90000;

function categoryRootId(idToParent: Map<number, number | null>, id: number): number {
  let cur = id;
  // Injection runs over the still-clean tree (no orphans yet), so this always reaches a root.
  for (;;) {
    const parent = idToParent.get(cur);
    if (parent === null || parent === undefined) return cur;
    cur = parent;
  }
}

function injectCategoryOrphans(categories: Row[], rng: Prng): void {
  const idToParent = new Map<number, number | null>();
  for (const c of categories) idToParent.set(c.category_id as number, c.parent_category_id as number | null);

  const candidateIdxs: number[] = [];
  for (let i = 0; i < categories.length; i += 1) {
    const parent = categories[i].parent_category_id as number | null;
    if (parent === null) continue; // never orphan a real root
    if (categoryRootId(idToParent, categories[i].category_id as number) === 1) continue; // protect Restaurants
    candidateIdxs.push(i);
  }

  const chosen = sampleWithout(rng, candidateIdxs, Math.min(CATEGORY_ORPHAN_COUNT, candidateIdxs.length));
  let missingId = CATEGORY_ORPHAN_PARENT_BASE;
  for (const idx of chosen) {
    categories[idx].parent_category_id = missingId;
    missingId += 1;
  }
}
```

5b. Append the call to the very END of the `injectMess` orchestrator (after the existing `injectDuplicatePayments(data.payments, rng);` line) so it consumes `rng` draws only after every existing pass, leaving all prior mess byte-identical:

```ts
  injectEventLogMess(data.event_log, rng);
  injectDuplicatePayments(data.payments, rng);

  injectCategoryOrphans(data.categories, rng);
}
```

Run the full pure-generation suite green:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/rove-categories.test.js dist/test/rove-generate.test.js dist/test/rove-mess.test.js
```

Expected: all three files pass (both `rove-categories` tests green; `rove-generate` and `rove-mess` still green because only a trailing mess pass and a dedicated PRNG stream were added).

- [ ] **Step 6: Update the schema DDL.** Edit `C:\Dev\Projects\sql-mastery\datasets\schema\rove.sql`.

6a. Add `categories` to the DROP list. Replace line 1:

```sql
DROP TABLE IF EXISTS support_tickets, ratings, promo_redemption, event_log, payments, orders, couriers, customers, promos, merchants, cities, seed_meta CASCADE;
```

with:

```sql
DROP TABLE IF EXISTS support_tickets, ratings, promo_redemption, event_log, payments, orders, couriers, customers, promos, merchants, categories, cities, seed_meta CASCADE;
```

6b. Add the `categories` table between the `cities` table and the `merchants` table (categories has no dependency on cities; merchants depends on categories). Insert immediately after the closing `);` of `CREATE TABLE cities (...)`:

```sql
CREATE TABLE categories (
  category_id        smallint PRIMARY KEY,
  name               text NOT NULL,
  parent_category_id smallint                             -- self-ref hierarchy; NO FK on purpose:
                                                          -- permits bounded orphaned pointers to
                                                          -- purged parents (rv-recursive-cte lesson)
);
```

6c. Add the clean `category_id` FK to `merchants`. In the `CREATE TABLE merchants (...)` block, change:

```sql
  city_id          smallint NOT NULL REFERENCES cities(city_id),
  name             text NOT NULL,
```

to:

```sql
  city_id          smallint NOT NULL REFERENCES cities(city_id),
  category_id      smallint NOT NULL REFERENCES categories(category_id),  -- clean leaf-category FK (rv-recursive-cte)
  name             text NOT NULL,
```

- [ ] **Step 7: Update the manifest row-count band.** Edit `C:\Dev\Projects\sql-mastery\datasets\manifest.json`. Add the `categories` band to the `rove` block. Change:

```json
  "rove": {
    "cities": [16, 16],
    "merchants": [1200, 1200],
```

to:

```json
  "rove": {
    "cities": [16, 16],
    "categories": [40, 40],
    "merchants": [1200, 1200],
```

- [ ] **Step 8: Add the four Rove verify checks.** Edit `C:\Dev\Projects\sql-mastery\scripts\verify-datasets.ts`.

8a. Extend the existing Rove mess import to pull in the bound. Change:

```ts
import { EMAIL_TYPO_MAP, NULL_SENTINELS, SYNONYM_MAP } from '../src/datasets/rove/mess';
```

to:

```ts
import { CATEGORY_ORPHAN_COUNT, EMAIL_TYPO_MAP, NULL_SENTINELS, SYNONYM_MAP } from '../src/datasets/rove/mess';
```

8b. Add the four checks inside `runRoveChecks`, immediately after the existing `await checkRowCountBands(client, db);` line (this is also where `categories` picks up its automatic row-count band from the manifest):

```ts
  // ---- rv-recursive-cte: self-referencing category tree ----

  await checkCount(
    client,
    db,
    'orphaned category parent pointers present and bounded',
    `SELECT COUNT(*) AS n FROM categories c
     WHERE c.parent_category_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM categories p WHERE p.category_id = c.parent_category_id)`,
    (n) => n >= 1 && n <= CATEGORY_ORPHAN_COUNT,
    `>= 1 and <= ${CATEGORY_ORPHAN_COUNT}`
  );

  await checkCount(
    client,
    db,
    '0 merchants with an invalid category_id',
    `SELECT COUNT(*) AS n FROM merchants m
     LEFT JOIN categories c ON m.category_id = c.category_id
     WHERE c.category_id IS NULL`,
    (n) => n === 0,
    '0'
  );

  await checkRows(
    client,
    db,
    'category tree is cleanable: re-rooting orphans, a recursive walk reaches every category',
    `WITH RECURSIVE seed_roots AS (
       SELECT c.category_id
       FROM categories c
       WHERE c.parent_category_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM categories p WHERE p.category_id = c.parent_category_id)
     ),
     walk AS (
       SELECT category_id FROM seed_roots
       UNION
       SELECT c.category_id
       FROM categories c
       JOIN walk w ON c.parent_category_id = w.category_id
     )
     SELECT (SELECT COUNT(*) FROM categories) AS total,
            (SELECT COUNT(*) FROM walk) AS reached`,
    (rows) => {
      const total = Number(rows[0].total);
      const reached = Number(rows[0].reached);
      return { pass: total > 0 && reached === total, detail: `reached=${reached} of total=${total}` };
    }
  );

  await checkCount(
    client,
    db,
    'WITH RECURSIVE walk from fixed root (Restaurants, id 1) returns the bounded 14-node subtree',
    `WITH RECURSIVE sub AS (
       SELECT category_id FROM categories WHERE category_id = 1
       UNION
       SELECT c.category_id FROM categories c JOIN sub s ON c.parent_category_id = s.category_id
     )
     SELECT COUNT(*) AS n FROM sub`,
    (n) => n === 14,
    '14'
  );
```

- [ ] **Step 9: Rebuild, reseed Rove locally, and confirm verify passes.** `PGPASSWORD` must already be exported in your shell (never write it to a file). Compile, run the full node test suite, reseed only Rove, then run the adversarial verify harness.

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json \
  && node --test dist/test/*.test.js \
  && node dist/scripts/seed-rove.js \
  && node dist/scripts/verify-datasets.js
```

Expected:
- `node --test` reports all suites passing (including both `rove-categories` tests).
- `seed-rove.js` prints the seeded counts object and includes `categories: 40` and `merchants: 1200`.
- `verify-datasets.js` prints `=== ROVE ... ===` with `[PASS]` on every line, including the four new lines: `orphaned category parent pointers present and bounded`, `0 merchants with an invalid category_id`, `category tree is cleanable: ... reaches every category`, and `WITH RECURSIVE walk from fixed root ... returns the bounded 14-node subtree`, plus `[PASS] row count: categories -- actual=40 expected=[40, 40]`. The final line reads `=== SUMMARY: N/N passed, 0 failed ===` and the process exits 0.

If any check fails, do not weaken it: re-read the failing SQL against the generator output (the JS walk in `test/rove-categories.test.ts` is the authoritative model of the expected sets) and fix the generator or DDL, then re-run this step.

- [ ] **Step 10: Commit.** Stage every touched file and commit.

```bash
cd /c/Dev/Projects/sql-mastery && git add \
  datasets/schema/rove.sql \
  datasets/manifest.json \
  src/datasets/rove/pools.ts \
  src/datasets/rove/generate.ts \
  src/datasets/rove/mess.ts \
  scripts/verify-datasets.ts \
  test/rove-categories.test.ts \
  && git commit -m "Add Rove category tree + merchant FK for rv-recursive-cte

Self-referencing categories table (40 nodes, <= 3 levels) with a merchants.category_id
FK and one reversible orphaned-parent defect. Adds verify checks for orphan presence,
cleanability, and a bounded fixed-root WITH RECURSIVE walk.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: INTERMEDIATE sideline templates (21) + manifest

This task FILLS the sideline template registry (stub created by T0) with all 21 `sl-` templates, their `SIDELINE_SKILLS`, `SIDELINE_CONCEPT_META` (with teach blocks), `SIDELINE_PHASES`, and `SIDELINE_CHECKPOINTS`. It also hardens the sideline seed generator to guarantee the edge rows the join/anti-join/full-outer templates need, publishes a confirmed-unmatched-rows manifest, and reseeds the local `sideline` database. The consuming phase-assembly task is T11; it imports these exports and never redefines them.

Global constraints inherited (copied here because this task emits SQL, seed code, and TS): ASCII only (hyphen `-` and two-char arrow `->` only; no en/em dashes or unicode arrows). Determinism: never `Math.random` / `Date.now` / argless `new Date`; reuse `src/datasets/framework/prng.ts` (`deriveStream`/`fnv1a`) and `ANCHOR_MS`. CommonJS with extensionless relative imports (NEVER a `.js` suffix; NEVER JSON import assertions). Server tests live at top-level `test/<name>.test.ts`, compile to `dist/test/<name>.test.js`, run by `node --test dist/test/*.test.js`. `PGPASSWORD` is read from the environment at runtime only and must appear in no file. TDD: red, minimal green, commit.

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\datasets\sideline\generate.ts` (add guaranteed edge rows)
- Create: `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\manifest.ts` (`SIDELINE_UNMATCHED_MANIFEST`)
- Modify: `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\index.ts` (fill the T0 stub: skills, meta, phases, checkpoints, 21 templates)
- Create: `C:\Dev\Projects\sql-mastery\test\sideline-seed-guarantees.test.ts` (in-memory seed edges)
- Create: `C:\Dev\Projects\sql-mastery\test\sideline-manifest.test.ts` (DB-backed confirmation against seeded `sideline`)
- Create: `C:\Dev\Projects\sql-mastery\test\sideline-templates.test.ts` (skills/meta/phases/checkpoints/DSL-shape)

**Interfaces:**

Consumes (exact signatures from the contract; import from these exact paths):
- From `../../types` (`src/generator/types.ts`, created by T0): `Template`, `Slot`, `SlotKind`, `BindingRule`, `ScaffoldPlan`, `GateHints`, `ConceptMeta`, `TeachBlock`, `PhaseMeta` = `{ id: string; title: string; goal: string; level: Level; order: number }`, `CheckpointMeta` = `{ id: string; phaseId: string; afterOrder: number; drawFromSkills: string[]; title: string }`, `Level`. `BindingRule.predicate` is `(value: string, catalog: any) => boolean` (catalog typed `any` per H6).
- From `../src/datasets/sideline/generate` (in the seed test only): `generate(seed: number): Record<string, Record<string, unknown>[]>`, `SEED: number`.
- From `../src/query-service` (in the DB test only): `createQueryService()` whose `executeQuery({ database, sql, rowMode: 'array' })` returns `{ fields: { name: string }[]; rows: unknown[][]; rowCount: number }` (rowMode support added by T1).

Produces (exact names/types T11 relies on; all exported from `src/generator/templates/sideline/index.ts` unless noted):
- `SIDELINE_SKILLS: string[]` (21 `sl-` slugs)
- `SIDELINE_CONCEPT_META: ConceptMeta[]` (21 entries; each carries `phaseId` in `SIDELINE_PHASES` + LOCAL `order`)
- `SIDELINE_PHASES: PhaseMeta[]` (ids `sideline-joins`, `sideline-subqueries`, `sideline-windows`; band-local `order` 1..3)
- `SIDELINE_CHECKPOINTS: CheckpointMeta[]` (`cpF`, `cpG`, `cpH` mid + `cpI` capstone in `sideline-windows` drawing all `SIDELINE_SKILLS`)
- `SIDELINE_TEMPLATES: Template[]` (>=21; every skill in `SIDELINE_SKILLS` has >=1 template)
- From `manifest.ts`: `SIDELINE_UNMATCHED_MANIFEST: SidelineUnmatchedManifest`

---

- [ ] **Step 1: Publish `SIDELINE_SKILLS` (21 slugs). Write the failing test first.**

Create `C:\Dev\Projects\sql-mastery\test\sideline-templates.test.ts` with just the skills assertions (more assertions are appended in later steps):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SIDELINE_SKILLS } from '../src/generator/templates/sideline/index';

const EXPECTED_SKILLS = [
  'sl-join-inner', 'sl-join-multi', 'sl-join-left', 'sl-anti-join', 'sl-semi-join',
  'sl-self-join-match', 'sl-self-join-compare', 'sl-join-right-full', 'sl-join-aggregate',
  'sl-case-expression', 'sl-subquery-scalar', 'sl-subquery-in', 'sl-subquery-correlated',
  'sl-cte', 'sl-set-ops', 'sl-date-functions', 'sl-scd-asof',
  'sl-window-rank', 'sl-window-lag-lead', 'sl-window-running', 'sl-window-frame-basic',
];

test('SIDELINE_SKILLS is exactly the 21 canonical slugs', () => {
  assert.equal(SIDELINE_SKILLS.length, 21);
  assert.deepEqual([...SIDELINE_SKILLS].sort(), [...EXPECTED_SKILLS].sort());
});

test('SIDELINE_SKILLS are all sl- prefixed and unique', () => {
  assert.ok(SIDELINE_SKILLS.every((s) => s.startsWith('sl-')));
  assert.equal(new Set(SIDELINE_SKILLS).size, 21);
});
```

- [ ] **Step 2: Run it red.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
```

Expected failure: the T0 stub exports `SIDELINE_SKILLS = []`, so `assert.equal(SIDELINE_SKILLS.length, 21)` fails with `21 !== 0`.

- [ ] **Step 3: Fill `SIDELINE_SKILLS` in the registry.**

Open `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\index.ts` and replace the stub line `export const SIDELINE_SKILLS: string[] = [];` with:

```ts
export const SIDELINE_SKILLS: string[] = [
  'sl-join-inner', 'sl-join-multi', 'sl-join-left', 'sl-anti-join', 'sl-semi-join',
  'sl-self-join-match', 'sl-self-join-compare', 'sl-join-right-full', 'sl-join-aggregate',
  'sl-case-expression', 'sl-subquery-scalar', 'sl-subquery-in', 'sl-subquery-correlated',
  'sl-cte', 'sl-set-ops', 'sl-date-functions', 'sl-scd-asof',
  'sl-window-rank', 'sl-window-lag-lead', 'sl-window-running', 'sl-window-frame-basic',
];
```

- [ ] **Step 4: Run it green, then commit.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
git add src/generator/templates/sideline/index.ts test/sideline-templates.test.ts
git commit -m "sideline: publish SIDELINE_SKILLS (21 intermediate slugs)"
```

Expected: both tests pass (2 pass, 0 fail).

- [ ] **Step 5: Write the failing in-memory seed-guarantee test.**

The anti/semi/full-outer/self-join-compare templates require specific edge rows. Create `C:\Dev\Projects\sql-mastery\test\sideline-seed-guarantees.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generate, SEED } from '../src/datasets/sideline/generate';

type Row = Record<string, unknown>;
const data = generate(SEED);
const teams = data.team as Row[];
const players = data.player as Row[];
const matches = data.match as Row[];
const tournaments = data.tournament as Row[];
const sponsors = data.sponsor as Row[];
const teamSponsors = data.team_sponsor as Row[];

test('there is >= 1 never-played team (team 40 in no match slot)', () => {
  const played = new Set<number>();
  for (const m of matches) {
    played.add(m.team_a_id as number);
    played.add(m.team_b_id as number);
    played.add(m.winner_team_id as number);
  }
  const neverPlayed = teams.filter((t) => !played.has(t.team_id as number));
  assert.ok(neverPlayed.length >= 1, 'expected at least one never-played team');
  assert.ok(neverPlayed.some((t) => (t.team_id as number) === 40), 'team 40 must be never-played');
});

test('there is >= 1 player-less team (no player.team_id references it)', () => {
  const withPlayers = new Set(players.map((p) => p.team_id as number | null).filter((x) => x !== null));
  const playerless = teams.filter((t) => !withPlayers.has(t.team_id as number));
  assert.ok(playerless.length >= 1);
  assert.ok(playerless.some((t) => (t.team_id as number) === 40), 'team 40 must be player-less');
});

test('there is >= 1 team-less sponsor (sponsor 30 has no team_sponsor rows)', () => {
  const linked = new Set(teamSponsors.map((ts) => ts.sponsor_id as number));
  assert.ok(sponsors.some((s) => (s.sponsor_id as number) === 30));
  assert.ok(!linked.has(30), 'sponsor 30 must have zero team_sponsor rows');
});

test('there is >= 1 sponsorless team (a team absent from team_sponsor)', () => {
  const sponsored = new Set(teamSponsors.map((ts) => ts.team_id as number));
  assert.ok(teams.some((t) => !sponsored.has(t.team_id as number)));
});

test('there is >= 1 NULL-region tournament', () => {
  assert.ok(tournaments.some((t) => t.region_id === null));
});

test('there is >= 1 intra-region Elo tie (two teams, same region, equal elo)', () => {
  const byRegion = new Map<number, number[]>();
  for (const t of teams) {
    const r = t.region_id as number;
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push(t.elo_rating as number);
  }
  let tie = false;
  for (const elos of byRegion.values()) {
    if (new Set(elos).size < elos.length) tie = true;
  }
  assert.ok(tie, 'expected at least one same-region pair sharing an elo_rating');
});
```

- [ ] **Step 6: Run it red.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-seed-guarantees.test.js
```

Expected failure: the never-played, player-less, team-less-sponsor, and intra-region-tie guarantees are not forced by the current generator, so those four assertions fail (the NULL-region and sponsorless assertions already pass on today's seed).

- [ ] **Step 7: Force the edge rows in the seed generator (deterministic, no RNG-dependent guarantee).**

Edit `C:\Dev\Projects\sql-mastery\src\datasets\sideline\generate.ts`.

7a. Add reserved-id constants after the existing `const ZERO_MATCH_TOURNAMENT_COUNT = 2;` line:

```ts
// Guaranteed edge entities for the intermediate join/anti-join templates (Task 10).
// Team 40 is a "ghost org": present in team, but in no match, with no players, and no sponsor.
// Sponsor 30 is reserved to have zero team_sponsor rows (team-less sponsor).
const NEVER_PLAYED_TEAM_ID = TEAM_COUNT;          // 40
const PLAYERLESS_TEAM_ID = TEAM_COUNT;            // 40 (same ghost org)
const TEAMLESS_SPONSOR_ID = SPONSORS.length;      // 30
```

7b. Force an intra-region Elo tie. In `buildTeams`, replace the closing `return { rows, foundedMs, elo };` with:

```ts
  // Deterministic intra-region Elo tie: copy the first same-region pair's rating onto the second,
  // skipping the ghost team, so sl-self-join-compare has a guaranteed equal-rating pair.
  for (let i = 0; i < TEAM_COUNT && !eloTied(); i += 1) {
    for (let j = i + 1; j < TEAM_COUNT; j += 1) {
      if (
        rows[i].region_id === rows[j].region_id &&
        (rows[i].team_id as number) !== NEVER_PLAYED_TEAM_ID &&
        (rows[j].team_id as number) !== NEVER_PLAYED_TEAM_ID
      ) {
        rows[j].elo_rating = rows[i].elo_rating;
        elo[j] = elo[i];
        break;
      }
    }
  }
  function eloTied(): boolean {
    const seen = new Map<number, Set<number>>();
    for (let k = 0; k < TEAM_COUNT; k += 1) {
      const r = rows[k].region_id as number;
      if (!seen.has(r)) seen.set(r, new Set());
      const bucket = seen.get(r)!;
      if (bucket.has(elo[k])) return true;
      bucket.add(elo[k]);
    }
    return false;
  }

  return { rows, foundedMs, elo };
```

7c. Make team 40 player-less. In `assignRostersAndBuildChanges`, right after `const teamSizes = new Array(TEAM_COUNT).fill(5) as number[];` add and adjust the base allocation:

```ts
  teamSizes[PLAYERLESS_TEAM_ID - 1] = 0; // ghost org receives no players
  let remainingSize = rosteredIdxsInOrder.length - (TEAM_COUNT - 1) * 5;
```

(Delete the original `let remainingSize = rosteredIdxsInOrder.length - TEAM_COUNT * 5;` line so it is not declared twice.) Then in the size-growth loop, never grow the ghost team; change the guard:

```ts
    const t = intBetween(rng, 0, TEAM_COUNT - 1);
    if (t !== PLAYERLESS_TEAM_ID - 1 && teamSizes[t] < 9) {
      teamSizes[t] += 1;
      remainingSize -= 1;
    }
```

7d. Make team 40 never-played. In `buildMatchesAndMapResults`, exclude it from every eligible pool. Replace the `teamsByRegion` build and `allTeamIds` line with:

```ts
  const teamsByRegion = new Map<number, number[]>();
  for (const t of teamsResult.rows) {
    const tid = t.team_id as number;
    if (tid === NEVER_PLAYED_TEAM_ID) continue;
    const rid = t.region_id as number;
    if (!teamsByRegion.has(rid)) teamsByRegion.set(rid, []);
    teamsByRegion.get(rid)!.push(tid);
  }
  const allTeamIds = teamsResult.rows
    .map((t) => t.team_id as number)
    .filter((id) => id !== NEVER_PLAYED_TEAM_ID);
```

7e. Make sponsor 30 team-less and keep team 40 sponsorless. In `buildSponsorsAndTeamSponsors`, exclude the ghost team from sponsor eligibility and exclude sponsor 30 from every candidate pool. Replace the `eligibleTeamIds` line:

```ts
  const eligibleTeamIds = shuffledTeamIds
    .filter((id) => id !== NEVER_PLAYED_TEAM_ID)
    .slice(SPONSORLESS_TEAM_COUNT);
```

Replace the `nonMegabrandSponsorIds` filter to also exclude the reserved team-less sponsor:

```ts
  const nonMegabrandSponsorIds = sponsors
    .map((s) => s.sponsor_id as number)
    .filter((id) => id !== megabrandSponsorId && id !== TEAMLESS_SPONSOR_ID);
```

In the general-pool candidate loop, extend the skip condition:

```ts
      if (sponsorId === megabrandSponsorId || sponsorId === endedSponsorId || sponsorId === TEAMLESS_SPONSOR_ID) continue;
```

- [ ] **Step 8: Run the seed test green.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-seed-guarantees.test.js
```

Expected: all six tests pass (6 pass, 0 fail).

- [ ] **Step 9: Reseed the local `sideline` database and commit.**

`PGPASSWORD` must already be exported in your shell (never written to a file). The seed script wipes and reloads `sideline` from `datasets/schema/sideline.sql` plus the regenerated rows.

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node dist/scripts/seed-sideline.js
git add src/datasets/sideline/generate.ts test/sideline-seed-guarantees.test.ts
git commit -m "sideline seed: guarantee ghost team, team-less sponsor, intra-region elo tie"
```

Expected: the seed script prints a row-count object and exits 0.

- [ ] **Step 10: Write the failing manifest confirmation test (DB-backed).**

Create `C:\Dev\Projects\sql-mastery\test\sideline-manifest.test.ts`. It queries the just-reseeded `sideline` DB and confirms each manifest entry is genuinely unmatched.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createQueryService } from '../src/query-service';
import { SIDELINE_UNMATCHED_MANIFEST as M } from '../src/generator/templates/sideline/manifest';

const svc = createQueryService();
async function scalar(sql: string): Promise<number> {
  const res = await svc.executeQuery({ database: 'sideline', sql, rowMode: 'array' });
  return Number(res.rows[0][0]);
}

test('every neverPlayedTeamId is in no match', async () => {
  for (const id of M.neverPlayedTeamIds) {
    const n = await scalar(
      `SELECT count(*) FROM match WHERE team_a_id = ${id} OR team_b_id = ${id} OR winner_team_id = ${id}`
    );
    assert.equal(n, 0, `team ${id} appears in ${n} matches`);
  }
  const total = await scalar(
    `SELECT count(*) FROM team t WHERE NOT EXISTS (SELECT 1 FROM match m WHERE m.team_a_id = t.team_id OR m.team_b_id = t.team_id)`
  );
  assert.ok(total >= 1);
});

test('every playerlessTeamId has zero players', async () => {
  for (const id of M.playerlessTeamIds) {
    const n = await scalar(`SELECT count(*) FROM player WHERE team_id = ${id}`);
    assert.equal(n, 0, `team ${id} has ${n} players`);
  }
});

test('every teamlessSponsorId has zero team_sponsor rows', async () => {
  for (const id of M.teamlessSponsorIds) {
    const n = await scalar(`SELECT count(*) FROM team_sponsor WHERE sponsor_id = ${id}`);
    assert.equal(n, 0, `sponsor ${id} has ${n} team_sponsor rows`);
  }
});

test('the sponsorless-team anti-join predicate returns >= 1 row', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.sponsorlessTeamAntiJoin}) q`);
  assert.ok(n >= 1);
});

test('the null-region tournament predicate returns >= 1 row', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.nullRegionTournament}) q`);
  assert.ok(n >= 1);
});

test('the intra-region Elo tie predicate returns >= 1 pair', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.intraRegionEloTie}) q`);
  assert.ok(n >= 1);
});
```

- [ ] **Step 11: Run it red.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-manifest.test.js
```

Expected failure: `src/generator/templates/sideline/manifest.ts` does not exist yet, so compilation fails with `Cannot find module '.../manifest'`.

- [ ] **Step 12: Create the confirmed-unmatched-rows manifest.**

Create `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\manifest.ts`:

```ts
// Confirmed-unmatched-rows manifest for the sideline intermediate templates. These entities are
// GUARANTEED by the sideline seed generator (Task 10 edits) and CONFIRMED against the seeded DB by
// test/sideline-manifest.test.ts. The anti/semi/full-outer/self-join-compare templates draw from
// this curated set (not a blind cross-product) so every emitted exercise is non-empty (gate g2).
export interface SidelineUnmatchedManifest {
  neverPlayedTeamIds: number[];      // teams in no match (ghost org): team 40
  playerlessTeamIds: number[];       // teams with zero player rows: team 40
  teamlessSponsorIds: number[];      // sponsors with zero team_sponsor rows: sponsor 30
  sponsorlessTeamAntiJoin: string;   // anti-join SELECT (teams absent from team_sponsor)
  nullRegionTournament: string;      // SELECT of international (region_id IS NULL) tournaments
  intraRegionEloTie: string;         // SELECT of same-region equal-elo team pairs
}

export const SIDELINE_UNMATCHED_MANIFEST: SidelineUnmatchedManifest = {
  neverPlayedTeamIds: [40],
  playerlessTeamIds: [40],
  teamlessSponsorIds: [30],
  sponsorlessTeamAntiJoin:
    'SELECT t.team_id, t.name FROM team t ' +
    'LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id ' +
    'WHERE ts.team_id IS NULL',
  nullRegionTournament:
    'SELECT tournament_id, name FROM tournament WHERE region_id IS NULL',
  intraRegionEloTie:
    'SELECT a.team_id AS team_a, b.team_id AS team_b, a.elo_rating ' +
    'FROM team a JOIN team b ON a.region_id = b.region_id ' +
    'AND a.elo_rating = b.elo_rating AND a.team_id < b.team_id',
};
```

- [ ] **Step 13: Run the manifest test green, then commit.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-manifest.test.js
git add src/generator/templates/sideline/manifest.ts test/sideline-manifest.test.ts
git commit -m "sideline: confirmed-unmatched-rows manifest + DB confirmation test"
```

Expected: all six DB-backed tests pass against the reseeded `sideline` database.

- [ ] **Step 14: Write the failing phases + checkpoints assertions (append to the templates test).**

Append to `C:\Dev\Projects\sql-mastery\test\sideline-templates.test.ts`:

```ts
import { SIDELINE_PHASES, SIDELINE_CHECKPOINTS } from '../src/generator/templates/sideline/index';

test('SIDELINE_PHASES are the three canonical intermediate phases, order 1..3', () => {
  assert.deepEqual(SIDELINE_PHASES.map((p) => p.id), ['sideline-joins', 'sideline-subqueries', 'sideline-windows']);
  assert.deepEqual(SIDELINE_PHASES.map((p) => p.order), [1, 2, 3]);
  assert.ok(SIDELINE_PHASES.every((p) => p.level === 'intermediate'));
  assert.ok(SIDELINE_PHASES.every((p) => p.title.length > 0 && p.goal.length > 0));
});

test('SIDELINE_CHECKPOINTS are cpF..cpH mid + cpI capstone; every phaseId valid; capstone draws all skills', () => {
  const ids = SIDELINE_CHECKPOINTS.map((c) => c.id);
  assert.deepEqual([...ids].sort(), ['cpF', 'cpG', 'cpH', 'cpI']);
  const phaseIds = new Set(SIDELINE_PHASES.map((p) => p.id));
  assert.ok(SIDELINE_CHECKPOINTS.every((c) => phaseIds.has(c.phaseId)));
  const cpI = SIDELINE_CHECKPOINTS.find((c) => c.id === 'cpI')!;
  assert.equal(cpI.phaseId, 'sideline-windows');
  assert.deepEqual([...cpI.drawFromSkills].sort(), [...SIDELINE_SKILLS].sort());
  assert.ok(SIDELINE_CHECKPOINTS.every((c) => SIDELINE_SKILLS.length > 0 && c.drawFromSkills.every((s) => SIDELINE_SKILLS.includes(s))));
});
```

Run red:

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
```

Expected failure: `SIDELINE_PHASES` and `SIDELINE_CHECKPOINTS` are still the T0 empty stubs, so `deepEqual` on ids fails (`[] !== ['sideline-joins', ...]`).

- [ ] **Step 15: Fill `SIDELINE_PHASES` and `SIDELINE_CHECKPOINTS`.**

In `C:\Dev\Projects\sql-mastery\src\generator\templates\sideline\index.ts`, ensure the top imports include the DSL/meta types and the manifest, then replace the `SIDELINE_PHASES`/`SIDELINE_CHECKPOINTS` stub lines. Add near the top of the file (below the existing import of `SIDELINE_SKILLS`'s neighbors):

```ts
import type {
  Template, Slot, BindingRule, ScaffoldPlan, GateHints, ConceptMeta, TeachBlock, PhaseMeta, CheckpointMeta,
} from '../../types';
import { SIDELINE_UNMATCHED_MANIFEST } from './manifest';
```

Replace the stub `export const SIDELINE_PHASES: PhaseMeta[] = [];` with:

```ts
export const SIDELINE_PHASES: PhaseMeta[] = [
  {
    id: 'sideline-joins',
    title: 'Joins',
    goal: 'Combine team, player, match, and sponsor tables with inner, outer, anti, semi, and self joins, including the two-FK winner/loser self-join.',
    level: 'intermediate',
    order: 1,
  },
  {
    id: 'sideline-subqueries',
    title: 'Subqueries, CTEs, and Set Operations',
    goal: 'Filter and compute with scalar, IN, and correlated subqueries; refactor with CTEs; use set operations, date functions, and as-of SCD lookups.',
    level: 'intermediate',
    order: 2,
  },
  {
    id: 'sideline-windows',
    title: 'Window Functions',
    goal: 'Rank, look forward and backward, accumulate running totals, and reason about a basic window frame over clean esports data.',
    level: 'intermediate',
    order: 3,
  },
];
```

Replace the stub `export const SIDELINE_CHECKPOINTS: CheckpointMeta[] = [];` with:

```ts
export const SIDELINE_CHECKPOINTS: CheckpointMeta[] = [
  {
    id: 'cpF',
    phaseId: 'sideline-joins',
    afterOrder: 9,
    drawFromSkills: [
      'sl-join-inner', 'sl-join-multi', 'sl-join-left', 'sl-anti-join', 'sl-semi-join',
      'sl-self-join-match', 'sl-self-join-compare', 'sl-join-right-full', 'sl-join-aggregate',
    ],
    title: 'Joins checkpoint',
  },
  {
    id: 'cpG',
    phaseId: 'sideline-subqueries',
    afterOrder: 8,
    drawFromSkills: [
      'sl-case-expression', 'sl-subquery-scalar', 'sl-subquery-in', 'sl-subquery-correlated',
      'sl-cte', 'sl-set-ops', 'sl-date-functions', 'sl-scd-asof',
    ],
    title: 'Subqueries and dates checkpoint',
  },
  {
    id: 'cpH',
    phaseId: 'sideline-windows',
    afterOrder: 2,
    drawFromSkills: ['sl-window-rank', 'sl-window-lag-lead'],
    title: 'Windows mid checkpoint',
  },
  {
    id: 'cpI',
    phaseId: 'sideline-windows',
    afterOrder: 4,
    drawFromSkills: [...SIDELINE_SKILLS],
    title: 'Sideline capstone',
  },
];
```

Run green:

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
git add src/generator/templates/sideline/index.ts test/sideline-templates.test.ts
git commit -m "sideline: SIDELINE_PHASES + SIDELINE_CHECKPOINTS (cpF..cpI)"
```

Expected: skills + phases + checkpoints tests pass.

- [ ] **Step 16: Write the failing `SIDELINE_CONCEPT_META` assertions.**

Append to `C:\Dev\Projects\sql-mastery\test\sideline-templates.test.ts`:

```ts
import { SIDELINE_CONCEPT_META } from '../src/generator/templates/sideline/index';

test('SIDELINE_CONCEPT_META is 1:1 with SIDELINE_SKILLS', () => {
  assert.equal(SIDELINE_CONCEPT_META.length, 21);
  assert.deepEqual(
    [...SIDELINE_CONCEPT_META.map((c) => c.skill)].sort(),
    [...SIDELINE_SKILLS].sort()
  );
  assert.equal(new Set(SIDELINE_CONCEPT_META.map((c) => c.skill)).size, 21);
});

test('every concept has a valid phaseId and a non-empty teach block', () => {
  const phaseIds = new Set(SIDELINE_PHASES.map((p) => p.id));
  for (const c of SIDELINE_CONCEPT_META) {
    assert.ok(phaseIds.has(c.phaseId), `bad phaseId ${c.phaseId}`);
    assert.ok(c.title.length > 0);
    assert.ok(c.teach.plain.length > 0 && c.teach.mentalModel.length > 0);
    assert.ok(c.teach.example.sql.length > 0 && c.teach.example.note.length > 0);
  }
});

test('local concept.order is contiguous 1..n within each phase', () => {
  for (const p of SIDELINE_PHASES) {
    const orders = SIDELINE_CONCEPT_META.filter((c) => c.phaseId === p.id).map((c) => c.order).sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, i) => i + 1), `phase ${p.id} order not contiguous`);
  }
});
```

Run red:

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
```

Expected failure: `SIDELINE_CONCEPT_META` is the empty T0 stub -> `assert.equal(SIDELINE_CONCEPT_META.length, 21)` fails with `0 !== 21`.

- [ ] **Step 17: Fill `SIDELINE_CONCEPT_META` (21 entries with teach blocks).**

In `index.ts`, add a teach helper and replace the stub `export const SIDELINE_CONCEPT_META: ConceptMeta[] = [];`:

```ts
function teach(plain: string, mentalModel: string, sql: string, note: string): TeachBlock {
  return { plain, mentalModel, example: { sql, note } };
}

export const SIDELINE_CONCEPT_META: ConceptMeta[] = [
  // ---- phase: sideline-joins (order 1..9) ----
  {
    skill: 'sl-join-inner', phaseId: 'sideline-joins', order: 1, title: 'Inner joins',
    teach: teach(
      'An inner join keeps only rows that match on both sides. Join player to team on team_id to pull each player alongside their team.',
      'Think of two lists lined up by a shared key; keep a row only when both lists have that key.',
      'SELECT p.handle, t.name FROM player p JOIN team t ON t.team_id = p.team_id',
      'Free agents (player.team_id IS NULL) drop out of an inner join because they have no matching team.'
    ),
  },
  {
    skill: 'sl-join-multi', phaseId: 'sideline-joins', order: 2, title: 'Multi-table joins',
    teach: teach(
      'Chain joins across three or more tables to follow a path: match -> tournament -> region, or map_result -> match -> team.',
      'Each JOIN adds one more table onto the growing row; keep the ON keys aligned so the chain does not fan out.',
      'SELECT mr.map_name, m.stage, t.name FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN tournament t ON t.tournament_id = m.tournament_id',
      'Add tables one join at a time and check the row count does not explode unexpectedly.'
    ),
  },
  {
    skill: 'sl-join-left', phaseId: 'sideline-joins', order: 3, title: 'Left outer joins',
    teach: teach(
      'A left join keeps every row from the left table and fills NULL where the right table has no match.',
      'The left table is the anchor; the right side is optional decoration that may be missing.',
      'SELECT t.name, ts.annual_value_usd FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'A team with no sponsor still appears, with NULL in the sponsor columns.'
    ),
  },
  {
    skill: 'sl-anti-join', phaseId: 'sideline-joins', order: 4, title: 'Anti joins',
    teach: teach(
      'An anti-join keeps left rows that have NO match on the right: LEFT JOIN then WHERE right key IS NULL, or NOT EXISTS.',
      'Find the leftovers: everything on the left that the right side never claimed.',
      'SELECT t.team_id, t.name FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE ts.team_id IS NULL',
      'This is how you find teams with no sponsor, or teams that never played a match.'
    ),
  },
  {
    skill: 'sl-semi-join', phaseId: 'sideline-joins', order: 5, title: 'Semi joins',
    teach: teach(
      'A semi-join keeps left rows that HAVE at least one match on the right, without duplicating them: EXISTS or IN.',
      'A yes/no membership test: does this left row have any partner on the right?',
      'SELECT t.team_id, t.name FROM team t WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id)',
      'EXISTS returns each team once even if it has many sponsors, unlike a plain inner join.'
    ),
  },
  {
    skill: 'sl-self-join-match', phaseId: 'sideline-joins', order: 6, title: 'Self join: winner vs loser',
    teach: teach(
      'match has two team FKs (team_a_id, team_b_id) plus winner_team_id. Join team twice to name both the winner and the loser; derive the loser id with a CASE that flips between the two team columns.',
      'The same table wears two hats in one query; give it two aliases so each hat is a separate join.',
      'SELECT m.match_id, w.name AS winner_name, l.name AS loser_name FROM match m JOIN team w ON w.team_id = m.winner_team_id JOIN team l ON l.team_id = CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END',
      'The loser is whichever of team_a_id / team_b_id is not the winner.'
    ),
  },
  {
    skill: 'sl-self-join-compare', phaseId: 'sideline-joins', order: 7, title: 'Self join: compare peers',
    teach: teach(
      'Join a table to itself to compare rows within the same group, such as two teams in the same region with equal Elo.',
      'Pair every row with its siblings; use a < b to keep each unordered pair once.',
      'SELECT a.name, b.name FROM team a JOIN team b ON a.region_id = b.region_id AND a.team_id < b.team_id',
      'The a.team_id < b.team_id guard removes self-pairs and mirrored duplicates.'
    ),
  },
  {
    skill: 'sl-join-right-full', phaseId: 'sideline-joins', order: 8, title: 'Right and full outer joins',
    teach: teach(
      'A full outer join keeps unmatched rows from BOTH sides, filling NULL on whichever side is missing.',
      'The union of two left joins: nobody gets dropped, from either table.',
      'SELECT t.name, ts.sponsor_id FROM team t FULL OUTER JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'Sponsorless teams and (structurally) any team-less sponsor rows both survive.'
    ),
  },
  {
    skill: 'sl-join-aggregate', phaseId: 'sideline-joins', order: 9, title: 'Join then aggregate',
    teach: teach(
      'Join first, then GROUP BY to summarize: count matches per region, sum sponsor value per team. ROLLUP, GROUPING SETS, string_agg, and FILTER extend the summary.',
      'Reshape rows into groups after the join; each group collapses to one summary row.',
      "SELECT r.name, count(*) AS match_count FROM match m JOIN tournament t ON t.tournament_id = m.tournament_id JOIN region r ON r.region_id = t.region_id GROUP BY r.name",
      'FILTER (WHERE ...) lets one query carry several conditional counts side by side.'
    ),
  },
  // ---- phase: sideline-subqueries (order 1..8) ----
  {
    skill: 'sl-case-expression', phaseId: 'sideline-subqueries', order: 1, title: 'CASE expressions',
    teach: teach(
      'CASE builds a computed column from conditions: label an Elo band, or bucket a prize pool into tiers.',
      'An if/else ladder that produces a value per row.',
      "SELECT name, CASE WHEN elo_rating >= 1800 THEN 'elite' WHEN elo_rating >= 1500 THEN 'mid' ELSE 'developing' END AS tier FROM team",
      'The first matching WHEN wins; ELSE is the fallback.'
    ),
  },
  {
    skill: 'sl-subquery-scalar', phaseId: 'sideline-subqueries', order: 2, title: 'Scalar subqueries',
    teach: teach(
      'A scalar subquery returns exactly one value you can compare against, such as the overall average Elo.',
      'Compute a single number in parentheses, then use it like a constant.',
      'SELECT name, elo_rating FROM team WHERE elo_rating > (SELECT avg(elo_rating) FROM team)',
      'If the inner query could return many rows, it is not scalar; use IN or a join instead.'
    ),
  },
  {
    skill: 'sl-subquery-in', phaseId: 'sideline-subqueries', order: 3, title: 'IN subqueries',
    teach: teach(
      'IN (subquery) filters against a set of values produced by another query, such as teams in international tournaments.',
      'Build a set on the inside; keep outer rows whose key is in that set.',
      'SELECT name FROM team WHERE region_id IN (SELECT region_id FROM tournament WHERE tier = \'S\')',
      'NOT IN is risky when the subquery can return NULLs; prefer NOT EXISTS there.'
    ),
  },
  {
    skill: 'sl-subquery-correlated', phaseId: 'sideline-subqueries', order: 4, title: 'Correlated subqueries',
    teach: teach(
      'A correlated subquery references the outer row, so it re-runs per row: each player compared to their own team average earnings.',
      'The inner query peeks back at the current outer row every time it runs.',
      'SELECT p.handle FROM player p WHERE p.total_earnings_usd > (SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id)',
      'The inner reference to p.team_id is what makes it correlated.'
    ),
  },
  {
    skill: 'sl-cte', phaseId: 'sideline-subqueries', order: 5, title: 'Common table expressions',
    teach: teach(
      'A WITH clause names a subquery so you can read the query top to bottom and reuse the intermediate result.',
      'Give a subquery a name up front, then treat it like a table below.',
      'WITH team_matches AS (SELECT winner_team_id AS team_id, count(*) AS wins FROM match GROUP BY winner_team_id) SELECT t.name, tm.wins FROM team t JOIN team_matches tm ON tm.team_id = t.team_id',
      'CTEs do not change the answer; they make a layered query legible.'
    ),
  },
  {
    skill: 'sl-set-ops', phaseId: 'sideline-subqueries', order: 6, title: 'Set operations',
    teach: teach(
      'UNION, INTERSECT, and EXCEPT combine two same-shaped result sets. UNION dedups; UNION ALL keeps duplicates.',
      'Stack two column-compatible results and take their union, overlap, or difference.',
      'SELECT host_country FROM tournament WHERE host_country IS NOT NULL UNION SELECT country FROM player',
      'Both SELECTs must expose the same number and types of columns, in order.'
    ),
  },
  {
    skill: 'sl-date-functions', phaseId: 'sideline-subqueries', order: 7, title: 'Date functions',
    teach: teach(
      'Extract and compare date parts: tournament length in days, matches by month, contracts active on a date.',
      'Dates are values you can subtract, truncate, and slice into parts.',
      "SELECT name, (end_date - start_date) AS length_days FROM tournament",
      'date - date yields an integer number of days in Postgres.'
    ),
  },
  {
    skill: 'sl-scd-asof', phaseId: 'sideline-subqueries', order: 8, title: 'As-of / slowly changing lookups',
    teach: teach(
      'roster_change is a slowly changing history with from_date/to_date. An as-of query finds the stint that was open on a given date (to_date IS NULL or covers the date).',
      'Rewind the history to a moment and read the one row that was in effect then.',
      "SELECT rc.player_id, rc.team_id FROM roster_change rc WHERE rc.from_date <= DATE '2025-01-01' AND (rc.to_date IS NULL OR rc.to_date > DATE '2025-01-01')",
      'The open stint (to_date IS NULL) is the current row for a rostered player.'
    ),
  },
  // ---- phase: sideline-windows (order 1..4) ----
  {
    skill: 'sl-window-rank', phaseId: 'sideline-windows', order: 1, title: 'Ranking windows',
    teach: teach(
      'ROW_NUMBER / RANK / DENSE_RANK order rows within a partition without collapsing them, such as ranking teams by Elo inside each region.',
      'Number the rows inside each group by an ordering, keeping every row.',
      'SELECT name, region_id, RANK() OVER (PARTITION BY region_id ORDER BY elo_rating DESC) AS region_rank FROM team',
      'RANK leaves gaps after ties; DENSE_RANK does not; ROW_NUMBER is always unique.'
    ),
  },
  {
    skill: 'sl-window-lag-lead', phaseId: 'sideline-windows', order: 2, title: 'LAG and LEAD',
    teach: teach(
      'LAG and LEAD read a neighboring row within the partition: the previous or next match datetime for a team.',
      'Peek one row back or forward along the ordering without a self-join.',
      'SELECT match_id, winner_team_id, LAG(match_datetime) OVER (PARTITION BY winner_team_id ORDER BY match_datetime) AS prev_win FROM match',
      'The first row per partition has no previous neighbor, so LAG returns NULL there.'
    ),
  },
  {
    skill: 'sl-window-running', phaseId: 'sideline-windows', order: 3, title: 'Running totals',
    teach: teach(
      'SUM(...) OVER (ORDER BY ...) accumulates a running total, such as cumulative prize pool over the tournament calendar.',
      'Carry a growing subtotal down the ordered rows.',
      'SELECT name, start_date, SUM(prize_pool_usd) OVER (ORDER BY start_date, tournament_id) AS running_prize FROM tournament',
      'Add a unique tiebreak to ORDER BY so the running total is deterministic across ties.'
    ),
  },
  {
    skill: 'sl-window-frame-basic', phaseId: 'sideline-windows', order: 4, title: 'Basic window frames',
    teach: teach(
      'A frame (ROWS BETWEEN ...) limits which rows the window sees, enabling a simple moving average over adjacent rows.',
      'Slide a small fixed-size viewport along the ordered rows.',
      'SELECT tournament_id, prize_pool_usd, AVG(prize_pool_usd) OVER (ORDER BY start_date, tournament_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS smoothed FROM tournament',
      'Without a frame, ORDER BY implies RANGE UNBOUNDED PRECEDING, which is a running aggregate, not a sliding one.'
    ),
  },
];
```

Run green:

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
git add src/generator/templates/sideline/index.ts test/sideline-templates.test.ts
git commit -m "sideline: SIDELINE_CONCEPT_META (21 concepts + teach blocks)"
```

Expected: skills/phases/checkpoints/meta tests all pass.

- [ ] **Step 18: Write the failing template-shape assertions (DSL invariants + coverage).**

Append to `C:\Dev\Projects\sql-mastery\test\sideline-templates.test.ts`:

```ts
import { SIDELINE_TEMPLATES } from '../src/generator/templates/sideline/index';

test('every SIDELINE_SKILLS slug has at least one template', () => {
  const covered = new Set(SIDELINE_TEMPLATES.map((t) => t.skill));
  for (const skill of SIDELINE_SKILLS) assert.ok(covered.has(skill), `no template for ${skill}`);
});

test('every template skill is a known sideline skill and database is sideline', () => {
  for (const t of SIDELINE_TEMPLATES) {
    assert.ok(SIDELINE_SKILLS.includes(t.skill), `unknown skill ${t.skill}`);
    assert.equal(t.database, 'sideline');
  }
});

test('no sqlShape contains ORDER BY or ROUND (emit owns both)', () => {
  for (const t of SIDELINE_TEMPLATES) {
    const up = t.sqlShape.toUpperCase();
    assert.ok(!up.includes('ORDER BY'), `${t.skill} sqlShape has ORDER BY`);
    assert.ok(!up.includes('ROUND('), `${t.skill} sqlShape hand-writes ROUND`);
  }
});

test('each template carries the tiebreak slot its family requires', () => {
  for (const t of SIDELINE_TEMPLATES) {
    const kinds = new Set(t.slots.map((s) => s.kind));
    if (t.family === 'grouped') {
      assert.ok(kinds.has('groupCols'), `${t.skill} grouped needs groupCols slot`);
    } else if (t.family === 'windowed') {
      assert.ok(kinds.has('partitionCols') && kinds.has('rankKey'), `${t.skill} windowed needs partitionCols + rankKey`);
    } else {
      assert.ok(kinds.has('sortKey'), `${t.skill} ${t.family} needs a sortKey slot`);
    }
  }
});

test('every template has >= 2 phrasings, a hint, and gateHints', () => {
  for (const t of SIDELINE_TEMPLATES) {
    assert.ok(t.phrasings.length >= 2, `${t.skill} needs >= 2 phrasings`);
    assert.ok(t.hintTemplate.length > 0);
    assert.equal(t.gateHints.rowCeiling, 200);
    assert.equal(t.gateHints.boundedSlice, false);
  }
});

test('no source text uses banned dash characters', () => {
  const banned = /[\u2013\u2014\u2212\u2192]/;
  for (const t of SIDELINE_TEMPLATES) {
    assert.ok(!banned.test(t.sqlShape + t.phrasings.join(' ') + t.hintTemplate), `${t.skill} contains a banned dash/arrow`);
  }
});
```

Run red:

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
```

Expected failure: `SIDELINE_TEMPLATES` is the empty T0 stub -> the coverage test fails (`no template for sl-join-inner`).

- [ ] **Step 19: Add the two fully-worked flagship templates plus shared helpers.**

In `index.ts`, add the shared plan/gate helpers and the first two flagship templates. The self-join-match uses the two-FK winner/loser CASE; the anti-join is curated into four confirmed-non-empty variants drawn from the manifest (never-played team, sponsorless team, team-less sponsor, player-less team).

```ts
const PLAN: ScaffoldPlan = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' };

function gh(minRows: number, minDistinct: number, orderMatters: boolean): GateHints {
  return { minRows, minDistinct, rowCeiling: 200, orderMatters, boundedSlice: false };
}

const STAGES = ['Group', 'Quarterfinal', 'Semifinal', 'Final', 'Grand Final'];

// ---- FLAGSHIP 1: sl-self-join-match (two-FK self join, loser via CASE) ----
const tSelfJoinMatch: Template = {
  skill: 'sl-self-join-match',
  database: 'sideline',
  family: 'join',
  primaryTable: 'match',
  // NO ORDER BY, NO ROUND: emit appends the deterministic tiebreak from sortKey (match_id).
  sqlShape: [
    'SELECT m.match_id AS match_id,',
    '       w.name AS winner_name,',
    '       l.name AS loser_name',
    'FROM match m',
    'JOIN team w ON w.team_id = m.winner_team_id',
    'JOIN team l ON l.team_id = CASE WHEN m.winner_team_id = m.team_a_id',
    '                                THEN m.team_b_id ELSE m.team_a_id END',
    'WHERE m.stage = {stageValue}',
  ].join('\n'),
  slots: [
    { name: 'stageValue', kind: 'literal', op: '=', col: 'stage', table: 'match', sampleStrategy: 'single' },
    // sortKey is the unique, projected tiebreak column emit orders by.
    { name: 'sortKey', kind: 'sortKey', table: 'match' },
  ],
  bindingRules: [
    { slot: 'stageValue', predicate: (v: string) => STAGES.includes(v) },
    { slot: 'sortKey', predicate: (v: string) => v === 'match_id' },
  ],
  phrasings: [
    'For every {stageValue} match, list match_id, winner_name, and loser_name. The loser is the team that was not the winner. Order by match_id ascending.',
    'Show each {stageValue} match as match_id, winner_name, loser_name by joining team twice (once on the winner, once on the other side). Order by match_id.',
  ],
  hintTemplate:
    'Join match to team twice with two aliases. One join is on winner_team_id; the other uses a CASE that returns team_b_id when the winner is team_a_id, otherwise team_a_id.',
  scaffoldPlan: PLAN,
  gateHints: gh(5, 2, true),
};

// ---- FLAGSHIP 2: sl-anti-join (curated variants, each confirmed non-empty by the manifest) ----
// The manifest guarantees team 40 never played and has no players, and sponsor 30 has no teams,
// so each anti-join below returns >= 1 row (gate g2). We keep this curated set small and explicit
// rather than blindly expanding every possible left/right pairing.
const antiJoinNeverPlayed: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape: [
    'SELECT t.team_id AS team_id, t.name AS team_name',
    'FROM team t',
    'LEFT JOIN match m ON (m.team_a_id = t.team_id OR m.team_b_id = t.team_id)',
    'WHERE m.match_id IS NULL',
  ].join('\n'),
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team that has never played a match (appears in no match as team_a or team_b). Order by team_id.',
    'Which teams have zero matches? Return team_id, team_name using an anti-join, ordered by team_id.',
  ],
  hintTemplate:
    'LEFT JOIN match on either team column, then keep only rows where the match side is NULL. The manifest guarantees at least one such team exists (id ' +
    String(SIDELINE_UNMATCHED_MANIFEST.neverPlayedTeamIds[0]) + ').',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinSponsorless: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape: [
    'SELECT t.team_id AS team_id, t.name AS team_name',
    'FROM team t',
    'LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
    'WHERE ts.team_id IS NULL',
  ].join('\n'),
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team with no sponsor (no team_sponsor row). Order by team_id.',
    'Find the sponsorless teams: return team_id, team_name via an anti-join against team_sponsor, ordered by team_id.',
  ],
  hintTemplate: 'LEFT JOIN team_sponsor and keep rows where ts.team_id IS NULL. The seed guarantees sponsorless teams.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinTeamlessSponsor: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'sponsor',
  sqlShape: [
    'SELECT s.sponsor_id AS sponsor_id, s.name AS sponsor_name',
    'FROM sponsor s',
    'LEFT JOIN team_sponsor ts ON ts.sponsor_id = s.sponsor_id',
    'WHERE ts.sponsor_id IS NULL',
  ].join('\n'),
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'sponsor' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'sponsor_id' }],
  phrasings: [
    'List sponsor_id and sponsor_name for every sponsor that backs no team (no team_sponsor row). Order by sponsor_id.',
    'Which sponsors have zero team deals? Return sponsor_id, sponsor_name using an anti-join, ordered by sponsor_id.',
  ],
  hintTemplate:
    'LEFT JOIN team_sponsor on sponsor_id and keep NULL matches. The manifest reserves sponsor ' +
    String(SIDELINE_UNMATCHED_MANIFEST.teamlessSponsorIds[0]) + ' as team-less.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinPlayerless: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape: [
    'SELECT t.team_id AS team_id, t.name AS team_name',
    'FROM team t',
    'WHERE NOT EXISTS (SELECT 1 FROM player p WHERE p.team_id = t.team_id)',
  ].join('\n'),
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team with no players on its roster. Order by team_id.',
    'Find the player-less teams via NOT EXISTS against player; return team_id, team_name ordered by team_id.',
  ],
  hintTemplate:
    'Use NOT EXISTS (SELECT 1 FROM player WHERE player.team_id = team.team_id). The manifest guarantees team ' +
    String(SIDELINE_UNMATCHED_MANIFEST.playerlessTeamIds[0]) + ' has no players.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};
```

- [ ] **Step 20: Add the remaining 17 concise templates (semi / self-compare / full-outer draw from the manifest) and export `SIDELINE_TEMPLATES`.**

Append to `index.ts` (each obeys the author rules: no ORDER BY / no ROUND in sqlShape; grouped -> `groupCols`; windowed -> `partitionCols` + `rankKey`; every other family -> a unique projected `sortKey`):

```ts
const tJoinInner: Template = {
  skill: 'sl-join-inner', database: 'sideline', family: 'join', primaryTable: 'player',
  sqlShape: 'SELECT p.handle AS handle, t.name AS team_name FROM player p JOIN team t ON t.team_id = p.team_id WHERE t.region_id = {regionValue}',
  slots: [
    { name: 'regionValue', kind: 'literal', op: '=', col: 'region_id', table: 'team', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'player' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'handle' }],
  phrasings: [
    'For region {regionValue}, list each rostered player as handle and team_name. Order by handle.',
    'Join player to team and return handle, team_name for teams in region {regionValue}, ordered by handle.',
  ],
  hintTemplate: 'Inner JOIN player to team on team_id; free agents drop out.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tJoinMulti: Template = {
  skill: 'sl-join-multi', database: 'sideline', family: 'join', primaryTable: 'map_result',
  sqlShape: 'SELECT mr.map_result_id AS map_result_id, mr.map_name AS map_name, m.stage AS stage, t.name AS tournament_name FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN tournament t ON t.tournament_id = m.tournament_id WHERE t.tier = {tierValue}',
  slots: [
    { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'map_result' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'map_result_id' }],
  phrasings: [
    'For tier {tierValue} tournaments, list map_result_id, map_name, stage, tournament_name across three joined tables. Order by map_result_id.',
    'Chain map_result -> match -> tournament and return map_result_id, map_name, stage, tournament_name for tier {tierValue}, ordered by map_result_id.',
  ],
  hintTemplate: 'Add one JOIN at a time: map_result to match, then match to tournament.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tJoinLeft: Template = {
  skill: 'sl-join-left', database: 'sideline', family: 'join', primaryTable: 'team',
  sqlShape: 'SELECT t.team_id AS team_id, t.name AS team_name, ts.annual_value_usd AS annual_value_usd FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List team_id, team_name, annual_value_usd for every team, keeping teams with no sponsor (NULL value). Order by team_id.',
    'LEFT JOIN team to team_sponsor and return team_id, team_name, annual_value_usd, ordered by team_id.',
  ],
  hintTemplate: 'LEFT JOIN keeps every team; sponsorless teams show NULL annual_value_usd.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tSemiJoin: Template = {
  skill: 'sl-semi-join', database: 'sideline', family: 'join', primaryTable: 'team',
  sqlShape: 'SELECT t.team_id AS team_id, t.name AS team_name FROM team t WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team that has at least one sponsor, each team once. Order by team_id.',
    'Use EXISTS against team_sponsor to return sponsored teams as team_id, team_name, ordered by team_id.',
  ],
  hintTemplate: 'EXISTS returns each team once; contrast with the manifest-confirmed sponsorless teams.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tSelfJoinCompare: Template = {
  skill: 'sl-self-join-compare', database: 'sideline', family: 'join', primaryTable: 'team',
  sqlShape: 'SELECT a.team_id AS team_a_id, a.name AS team_a_name, b.name AS team_b_name FROM team a JOIN team b ON a.region_id = b.region_id AND a.elo_rating = b.elo_rating AND a.team_id < b.team_id',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_a_id' }],
  phrasings: [
    'Find pairs of teams in the same region with equal elo_rating. Return team_a_id, team_a_name, team_b_name with a.team_id < b.team_id. Order by team_a_id.',
    'Self-join team on region_id and elo_rating (a.team_id < b.team_id) and return team_a_id, team_a_name, team_b_name, ordered by team_a_id.',
  ],
  hintTemplate: 'Join team to itself; the manifest guarantees an intra-region Elo tie so this is non-empty.', scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
};

const tJoinRightFull: Template = {
  skill: 'sl-join-right-full', database: 'sideline', family: 'join', primaryTable: 'team',
  sqlShape: "SELECT t.team_id AS team_id, t.name AS team_name, ts.sponsor_id AS sponsor_id FROM team t FULL OUTER JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE t.team_id IS NULL OR ts.sponsor_id IS NULL",
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'FULL OUTER JOIN team to team_sponsor and keep only the unmatched rows from either side. Return team_id, team_name, sponsor_id. Order by team_id (NULLs last).',
    'Show the outer edges of team vs team_sponsor: rows where one side is NULL. Return team_id, team_name, sponsor_id, ordered by team_id.',
  ],
  hintTemplate: 'FULL OUTER JOIN then WHERE either key IS NULL; the manifest sponsorless teams anchor the non-empty result.', scaffoldPlan: PLAN, gateHints: gh(1, 1, true),
};

const tJoinAggregate: Template = {
  skill: 'sl-join-aggregate', database: 'sideline', family: 'grouped', primaryTable: 'match',
  sqlShape: "SELECT r.name AS region_name, count(*) AS match_count, count(*) FILTER (WHERE m.best_of = 5) AS bo5_count FROM match m JOIN tournament t ON t.tournament_id = m.tournament_id JOIN region r ON r.region_id = t.region_id GROUP BY r.name",
  slots: [{ name: 'groupCols', kind: 'groupCols', table: 'region' }],
  bindingRules: [{ slot: 'groupCols', predicate: (v: string) => v === 'region_name' }],
  phrasings: [
    'For each region, count matches and (via FILTER) the best-of-5 matches. Return region_name, match_count, bo5_count. Order by region_name.',
    'Join match -> tournament -> region, GROUP BY region_name, and return region_name, match_count, bo5_count with a FILTER count, ordered by region_name.',
  ],
  hintTemplate: 'Join to region, GROUP BY region_name; FILTER (WHERE best_of = 5) adds a conditional count.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tCaseExpression: Template = {
  skill: 'sl-case-expression', database: 'sideline', family: 'single-table', primaryTable: 'team',
  sqlShape: "SELECT team_id AS team_id, name AS team_name, CASE WHEN elo_rating >= 1800 THEN 'elite' WHEN elo_rating >= 1500 THEN 'mid' ELSE 'developing' END AS tier FROM team",
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    "Label each team by Elo band: elite (>= 1800), mid (>= 1500), else developing. Return team_id, team_name, tier. Order by team_id.",
    'Use CASE to bucket elo_rating into tier for every team and return team_id, team_name, tier, ordered by team_id.',
  ],
  hintTemplate: 'CASE WHEN ... THEN ... ELSE ... END; the first matching branch wins.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tSubqueryScalar: Template = {
  skill: 'sl-subquery-scalar', database: 'sideline', family: 'single-table', primaryTable: 'team',
  sqlShape: 'SELECT team_id AS team_id, name AS team_name, elo_rating AS elo_rating FROM team WHERE elo_rating > (SELECT avg(elo_rating) FROM team)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List teams whose elo_rating is above the overall average. Return team_id, team_name, elo_rating. Order by team_id.',
    'Compare each team to the scalar (SELECT avg(elo_rating) FROM team) and return the above-average ones as team_id, team_name, elo_rating, ordered by team_id.',
  ],
  hintTemplate: 'A scalar subquery in parentheses returns one number you compare against.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tSubqueryIn: Template = {
  skill: 'sl-subquery-in', database: 'sideline', family: 'single-table', primaryTable: 'team',
  sqlShape: 'SELECT team_id AS team_id, name AS team_name FROM team WHERE region_id IN (SELECT region_id FROM tournament WHERE tier = {tierValue} AND region_id IS NOT NULL)',
  slots: [
    { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'team' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'List teams in a region that hosts at least one tier {tierValue} tournament. Return team_id, team_name. Order by team_id.',
    'Use region_id IN (subquery of tier {tierValue} tournaments) and return team_id, team_name, ordered by team_id.',
  ],
  hintTemplate: 'Build the set of region_ids inside, then keep teams whose region_id is IN it.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tSubqueryCorrelated: Template = {
  skill: 'sl-subquery-correlated', database: 'sideline', family: 'single-table', primaryTable: 'player',
  sqlShape: 'SELECT p.player_id AS player_id, p.handle AS handle FROM player p WHERE p.team_id IS NOT NULL AND p.total_earnings_usd > (SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'player' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'player_id' }],
  phrasings: [
    'List rostered players who earn more than their own team average. Return player_id, handle. Order by player_id.',
    'Use a correlated subquery on p.team_id to compare each player to their teammates and return player_id, handle, ordered by player_id.',
  ],
  hintTemplate: 'The inner query references the outer p.team_id, so it recomputes per player.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tCte: Template = {
  skill: 'sl-cte', database: 'sideline', family: 'join', primaryTable: 'team',
  sqlShape: 'WITH team_wins AS (SELECT winner_team_id AS team_id, count(*) AS wins FROM match GROUP BY winner_team_id) SELECT t.team_id AS team_id, t.name AS team_name, tw.wins AS wins FROM team t JOIN team_wins tw ON tw.team_id = t.team_id',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'team_id' }],
  phrasings: [
    'Using a CTE that counts wins per team, return team_id, team_name, wins for teams with at least one win. Order by team_id.',
    'Define WITH team_wins then join it to team; return team_id, team_name, wins, ordered by team_id.',
  ],
  hintTemplate: 'Name the aggregate in a WITH clause, then join it like a table.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tSetOps: Template = {
  skill: 'sl-set-ops', database: 'sideline', family: 'set-op', primaryTable: 'tournament',
  sqlShape: 'SELECT host_country AS country FROM tournament WHERE host_country IS NOT NULL UNION SELECT country FROM player',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'tournament' }],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'country' }],
  phrasings: [
    'Return the distinct set of countries that are either a tournament host_country or a player country, as a single column country. Order by country.',
    'UNION tournament host_country with player country into one column country and order by country.',
  ],
  hintTemplate: 'Both SELECTs must expose one text column; UNION dedups the combined set.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tDateFunctions: Template = {
  skill: 'sl-date-functions', database: 'sideline', family: 'single-table', primaryTable: 'tournament',
  sqlShape: 'SELECT tournament_id AS tournament_id, name AS name, (end_date - start_date) AS length_days FROM tournament WHERE tier = {tierValue}',
  slots: [
    { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'tournament' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'tournament_id' }],
  phrasings: [
    'For tier {tierValue} tournaments, compute length_days as end_date minus start_date. Return tournament_id, name, length_days. Order by tournament_id.',
    'Subtract start_date from end_date for tier {tierValue} tournaments and return tournament_id, name, length_days, ordered by tournament_id.',
  ],
  hintTemplate: 'date - date yields an integer number of days in Postgres.', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tScdAsof: Template = {
  skill: 'sl-scd-asof', database: 'sideline', family: 'single-table', primaryTable: 'roster_change',
  sqlShape: 'SELECT rc.player_id AS player_id, rc.team_id AS team_id, rc.from_date AS from_date FROM roster_change rc WHERE rc.from_date <= {asofValue} AND (rc.to_date IS NULL OR rc.to_date > {asofValue})',
  slots: [
    { name: 'asofValue', kind: 'literal', op: '<=', col: 'from_date', table: 'roster_change', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'roster_change' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (v: string) => v === 'player_id' }],
  phrasings: [
    'As of {asofValue}, find each player-team stint that was in effect (from_date on or before, to_date after or open). Return player_id, team_id, from_date. Order by player_id.',
    'Do an as-of lookup on roster_change for {asofValue} and return player_id, team_id, from_date, ordered by player_id.',
  ],
  hintTemplate: 'The active stint has from_date <= the date AND (to_date IS NULL OR to_date > the date).', scaffoldPlan: PLAN, gateHints: gh(2, 2, true),
};

const tWindowRank: Template = {
  skill: 'sl-window-rank', database: 'sideline', family: 'windowed', primaryTable: 'team',
  sqlShape: 'SELECT team_id AS team_id, name AS team_name, region_id AS region_id, RANK() OVER (PARTITION BY region_id ORDER BY elo_rating DESC, team_id) AS region_rank FROM team',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'team' },
    { name: 'rankKey', kind: 'rankKey', table: 'team' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (v: string) => v === 'region_id' },
    { slot: 'rankKey', predicate: (v: string) => v === 'elo_rating' },
  ],
  phrasings: [
    'Rank teams by elo_rating (highest first) within each region. Return team_id, team_name, region_id, region_rank. Order by region_id, region_rank.',
    'Use RANK() OVER (PARTITION BY region_id ORDER BY elo_rating DESC) and return team_id, team_name, region_id, region_rank.',
  ],
  hintTemplate: 'PARTITION BY region_id restarts the ranking per region; add team_id to break Elo ties deterministically.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tWindowLagLead: Template = {
  skill: 'sl-window-lag-lead', database: 'sideline', family: 'windowed', primaryTable: 'tournament',
  sqlShape: 'SELECT tournament_id AS tournament_id, name AS name, start_date AS start_date, LAG(start_date) OVER (PARTITION BY region_id ORDER BY start_date, tournament_id) AS prev_start FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (v: string) => v === 'region_id' },
    { slot: 'rankKey', predicate: (v: string) => v === 'start_date' },
  ],
  phrasings: [
    'For each region, show each tournament with the start_date of the previous tournament in that region. Return tournament_id, name, start_date, prev_start. Order by region_id, start_date.',
    'Use LAG(start_date) OVER (PARTITION BY region_id ORDER BY start_date) and return tournament_id, name, start_date, prev_start.',
  ],
  hintTemplate: 'The first tournament per region has no previous neighbor, so LAG returns NULL there.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tWindowRunning: Template = {
  skill: 'sl-window-running', database: 'sideline', family: 'windowed', primaryTable: 'tournament',
  sqlShape: 'SELECT tournament_id AS tournament_id, name AS name, start_date AS start_date, SUM(prize_pool_usd) OVER (PARTITION BY region_id ORDER BY start_date, tournament_id) AS running_prize FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (v: string) => v === 'region_id' },
    { slot: 'rankKey', predicate: (v: string) => v === 'start_date' },
  ],
  phrasings: [
    'For each region, accumulate a running_prize of prize_pool_usd ordered by start_date. Return tournament_id, name, start_date, running_prize. Order by region_id, start_date.',
    'Use SUM(prize_pool_usd) OVER (PARTITION BY region_id ORDER BY start_date) and return tournament_id, name, start_date, running_prize.',
  ],
  hintTemplate: 'A unique tiebreak (tournament_id) in ORDER BY keeps the running total deterministic across equal start_dates.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

const tWindowFrameBasic: Template = {
  skill: 'sl-window-frame-basic', database: 'sideline', family: 'windowed', primaryTable: 'tournament',
  sqlShape: 'SELECT tournament_id AS tournament_id, prize_pool_usd AS prize_pool_usd, AVG(prize_pool_usd) OVER (PARTITION BY region_id ORDER BY start_date, tournament_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS smoothed_prize FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (v: string) => v === 'region_id' },
    { slot: 'rankKey', predicate: (v: string) => v === 'start_date' },
  ],
  phrasings: [
    'For each region, compute a 3-row moving average of prize_pool_usd (one row before and after). Return tournament_id, prize_pool_usd, smoothed_prize. Order by region_id, start_date.',
    'Use AVG(prize_pool_usd) OVER (... ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) and return tournament_id, prize_pool_usd, smoothed_prize.',
  ],
  hintTemplate: 'The ROWS BETWEEN frame slides a 3-row viewport; without it you get a running average instead.', scaffoldPlan: PLAN, gateHints: gh(3, 2, true),
};

export const SIDELINE_TEMPLATES: Template[] = [
  // joins
  tJoinInner, tJoinMulti, tJoinLeft,
  antiJoinNeverPlayed, antiJoinSponsorless, antiJoinTeamlessSponsor, antiJoinPlayerless,
  tSemiJoin, tSelfJoinMatch, tSelfJoinCompare, tJoinRightFull, tJoinAggregate,
  // subqueries / cte / set-ops / dates
  tCaseExpression, tSubqueryScalar, tSubqueryIn, tSubqueryCorrelated, tCte, tSetOps, tDateFunctions, tScdAsof,
  // windows
  tWindowRank, tWindowLagLead, tWindowRunning, tWindowFrameBasic,
];
```

Note: the AVG-based window (`tWindowFrameBasic`) intentionally hand-writes no ROUND; emit wraps the float aggregate in ROUND exactly once (invariant 4). The `sortKey`/`groupCols`/`partitionCols`/`rankKey` slots name the deterministic tiebreak columns; emit appends the single per-family ORDER BY.

- [ ] **Step 21: Run the template-shape test green.**

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/sideline-templates.test.js
```

Expected: every assertion passes (coverage of all 21 skills, no ORDER BY/ROUND in any sqlShape, correct tiebreak slot per family, >=2 phrasings each, no banned dashes).

- [ ] **Step 22: Run the full server test suite and commit.**

Confirm nothing else regressed (fingerprint, foundations, aperture, and the new sideline suites) against the reseeded local databases (`PGPASSWORD` exported in-shell).

```bash
cd /c/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/*.test.js
git add src/generator/templates/sideline/index.ts test/sideline-templates.test.ts
git commit -m "sideline: 21 intermediate templates (joins, subqueries, CTE, set-ops, dates, windows)"
```

Expected: the whole `dist/test/*.test.js` run reports 0 failures. This closes Task 10; T11 (sideline phase assembly) consumes `SIDELINE_SKILLS`, `SIDELINE_CONCEPT_META`, `SIDELINE_PHASES`, `SIDELINE_CHECKPOINTS`, and `SIDELINE_TEMPLATES` unchanged.

---

### Task 11: Sideline phase assembly + freeze + validate

Owns `src/phases/sideline/index.ts` (fills the T0 stub) plus the two frozen artifacts the generate CLI emits for the sideline band. Consumes the sideline template registry (T10) and the shared generator CLIs (T6). By the time this task runs, T10 has already filled `src/generator/templates/sideline/index.ts` (skills, concept meta, phase meta, checkpoint meta) and T8 has frozen the aperture band, so `APERTURE_PHASES` is populated and the global band offset is real.

Assembly is pure composition per resolutions H2/H4/H5: for each `PhaseMeta` in `SIDELINE_PHASES` (phaseIds `sideline-joins` / `sideline-subqueries` / `sideline-windows`) build a `Phase` whose concepts are `SIDELINE_CONCEPT_META` filtered by `phaseId` (each concept's exercises = the curated, fingerprinted `Exercise[]` the generate CLI froze for that skill) and whose checkpoints are `SIDELINE_CHECKPOINTS` filtered by `phaseId` (cpF..cpH mid-band, cpI capstone in `sideline-windows` drawing all `SIDELINE_SKILLS`). Global `phase.order = APERTURE_PHASES.length + PhaseMeta.order`. No hardcoded phase list, no phase-plan JSON.

**Files:**
- Create: `test/sideline-phases.test.ts`
- Create: `src/phases/sideline/exercises.generated.ts` (emitted by `npm run generate-exercises -- --db sideline`; committed frozen, never hand-edited)
- Create: `scripts/snapshots/sideline.snapshot.json` (emitted by the same generate run; committed frozen)
- Modify: `src/phases/sideline/index.ts` (replace the T0 `export const sidelinePhases: Phase[] = []` stub with the real assembly)

**Interfaces:**

Consumes (exact signatures, do NOT redefine):
- From `src/generator/types` (T0): `Phase`, `Concept`, `Checkpoint`, `ConceptMeta`, `Exercise`, `Level`, and the phase-model types
  ```ts
  export interface PhaseMeta { id: string; title: string; goal: string; level: Level; order: number }
  export interface CheckpointMeta { id: string; phaseId: string; afterOrder: number; drawFromSkills: string[]; title: string }
  ```
- From `src/generator/templates/sideline/index` (filled by T10):
  ```ts
  export const SIDELINE_SKILLS: string[];         // 21 sl-* slugs, 1:1 with concept meta
  export const SIDELINE_PHASES: PhaseMeta[];       // 3 phases, order 1..3, ids sideline-joins/sideline-subqueries/sideline-windows
  export const SIDELINE_CONCEPT_META: ConceptMeta[]; // each carries phaseId + LOCAL order within its phase
  export const SIDELINE_CHECKPOINTS: CheckpointMeta[]; // cpF, cpG, cpH, cpI (cpI phaseId 'sideline-windows', drawFromSkills == SIDELINE_SKILLS)
  ```
- From `src/generator/templates/aperture/index` (filled by T7/T8): `export const APERTURE_PHASES: PhaseMeta[]` (5 phases; `.length` is the sideline band offset).
- From `src/phases/sideline/exercises.generated` (emitted by the T6 generate CLI, resolutions H3): `export const GENERATED_EXERCISES: Record<string, Exercise[]>` mapping each `SIDELINE_SKILLS` slug to its curated + fingerprinted `Exercise[]`.
- CLIs (wired by T6): `npm run generate-exercises -- --db sideline` and `npm run validate-exercises -- --db sideline`.

Produces (later tasks rely on these EXACT names):
- `export const sidelinePhases: Phase[]` from `src/phases/sideline/index` - consumed by `getPhases()` in T14 as `[...aperturePhases, ...sidelinePhases, ...rovePhases]`. Pre-sorted ascending by global `order`, contiguous with the aperture band, `level: 'intermediate'`, `database: 'sideline'`.
- Frozen `src/phases/sideline/exercises.generated.ts` and `scripts/snapshots/sideline.snapshot.json`.

---

- [ ] **Step 1: Write the failing assembly test.** Create `test/sideline-phases.test.ts` (top-level `test/`, compiles to `dist/test/`). It pins the three phases, 1:1 concept<->skill correspondence, contiguous local order, at-least-one fingerprinted exercise per concept, and the four checkpoints with cpI as the all-skills capstone.

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { sidelinePhases } from '../src/phases/sideline/index';
  import { SIDELINE_SKILLS } from '../src/generator/templates/sideline/index';
  import { APERTURE_PHASES } from '../src/generator/templates/aperture/index';

  const EXPECTED_PHASE_IDS = ['sideline-joins', 'sideline-subqueries', 'sideline-windows'];
  const EXPECTED_CHECKPOINTS = ['cpF', 'cpG', 'cpH', 'cpI'];

  test('sideline exposes exactly the three intermediate phases, band-offset ordered', () => {
    assert.deepEqual(sidelinePhases.map((p) => p.id), EXPECTED_PHASE_IDS);
    const offset = APERTURE_PHASES.length;
    sidelinePhases.forEach((p, i) => {
      assert.equal(p.level, 'intermediate', `${p.id} level`);
      assert.equal(p.database, 'sideline', `${p.id} database`);
      assert.equal(p.order, offset + i + 1, `${p.id} global order`);
    });
  });

  test('sideline concepts are 1:1 with SIDELINE_SKILLS', () => {
    const conceptSkills = sidelinePhases.flatMap((p) => p.concepts).map((c) => c.skill).sort();
    const skills = [...SIDELINE_SKILLS].sort();
    assert.equal(conceptSkills.length, SIDELINE_SKILLS.length, 'concept count == skill count');
    assert.deepEqual(conceptSkills, skills);
  });

  test('each sideline phase has contiguous local concept order starting at 1', () => {
    for (const phase of sidelinePhases) {
      const orders = phase.concepts.map((c) => c.order);
      const expected = phase.concepts.map((_, i) => i + 1);
      assert.deepEqual(orders, expected, `${phase.id} local order contiguous 1..n`);
    }
  });

  test('every sideline concept has at least one fingerprinted exercise', () => {
    for (const phase of sidelinePhases) {
      for (const concept of phase.concepts) {
        assert.ok(concept.exercises.length >= 1, `${concept.skill} has >= 1 exercise`);
        for (const ex of concept.exercises) {
          assert.ok(ex.fingerprint, `${ex.id} has a baked fingerprint`);
          assert.ok(ex.fingerprint.columns.length >= 1, `${ex.id} fingerprint columns present`);
          assert.equal(ex.database, 'sideline', `${ex.id} database`);
        }
      }
    }
  });

  test('the four sideline checkpoints exist and cpI is the all-skills capstone', () => {
    const checkpoints = sidelinePhases.flatMap((p) => p.checkpoints);
    assert.deepEqual(checkpoints.map((c) => c.id).sort(), EXPECTED_CHECKPOINTS);

    const windows = sidelinePhases.find((p) => p.id === 'sideline-windows');
    assert.ok(windows, 'sideline-windows phase exists');
    const capstone = windows!.checkpoints.find((c) => c.id === 'cpI');
    assert.ok(capstone, 'cpI lives in sideline-windows');
    assert.deepEqual([...capstone!.drawFromSkills].sort(), [...SIDELINE_SKILLS].sort(),
      'cpI draws from every sideline skill');
  });
  ```

- [ ] **Step 2: Compile and run the test RED.** The T0 stub still exports `sidelinePhases = []`, so every phase/checkpoint assertion fails.

  ```bash
  # from repo root C:\Dev\Projects\sql-mastery (Git Bash)
  npx tsc -p tsconfig.json && node --test dist/test/sideline-phases.test.js
  ```

  Expected failure (RED): the first test fails with an `AssertionError` where `actual` is `[]` and `expected` is `[ 'sideline-joins', 'sideline-subqueries', 'sideline-windows' ]`; the 1:1 test fails `concept count == skill count` (0 !== 21); the checkpoints test fails deep-equal of `[]` vs `[ 'cpF', 'cpG', 'cpH', 'cpI' ]`. Overall `# fail 4` (or similar). Compilation itself succeeds because the stub and the T10 template exports already exist.

- [ ] **Step 3: Generate + freeze the sideline exercises and snapshot.** This runs `buildExercisesFor('sideline')` -> `curate` -> the validate/bake path, then writes the two frozen artifacts. `curate` dedups literal-agnostic skeletons and orders difficulty; `honestCounts` keeps thin concepts honest (a legitimately thin intermediate skill may land at ~3-6). Per resolutions E/H3 the bake records `scripts/snapshots/sideline.snapshot.json` (the exact snapshot the fingerprints were computed against) and writes the skill->Exercise[] map to `src/phases/sideline/exercises.generated.ts`.

  ```bash
  # PGPASSWORD MUST already be exported in this shell. NEVER write it to any file or commit it.
  # Runs against the LOCAL seeded 'sideline' Postgres database.
  npm run generate-exercises -- --db sideline
  ```

  Expected output includes lines such as `frozen 21 sideline skills`, `wrote src/phases/sideline/exercises.generated.ts`, and `recorded scripts/snapshots/sideline.snapshot.json <sha256-hex>`. After this, `src/phases/sideline/exercises.generated.ts` exports `export const GENERATED_EXERCISES: Record<string, Exercise[]>` with one non-empty entry per `SIDELINE_SKILLS` slug, each `Exercise` carrying a baked `fingerprint`.

- [ ] **Step 4: Validate 100% against seeded sideline.** Run the g0..g9 harness over the frozen exercises + checkpoint pool. Non-zero exit on any gate failure is the CI gate; a clean run is required before assembling.

  ```bash
  # PGPASSWORD exported; local seeded 'sideline' DB. g0 asserts the live snapshot == scripts/snapshots/sideline.snapshot.json.
  npm run validate-exercises -- --db sideline
  ```

  Expected: every exercise passes G0..G9, a summary like `passed: <N>  failures: 0`, and exit code 0. Confirm the exit code:

  ```bash
  echo "validate exit=$?"   # must print validate exit=0
  ```

  If any gate fails, STOP: fix the offending template in T10 (or reseed the local `sideline` DB) and re-run Steps 3-4. Do NOT hand-edit `exercises.generated.ts` to force a pass.

- [ ] **Step 5: Author the phase-assembly module.** Replace the entire T0 stub body of `src/phases/sideline/index.ts` with pure composition. Extensionless CommonJS imports; the two-up path `../../generator/...` reaches `src/generator`. Fail fast if a skill has no generated exercises so a broken freeze surfaces immediately rather than as a silently thin phase.

  ```ts
  import type { Phase, Concept, Checkpoint } from '../../generator/types';
  import {
    SIDELINE_PHASES,
    SIDELINE_CONCEPT_META,
    SIDELINE_CHECKPOINTS,
  } from '../../generator/templates/sideline/index';
  import { APERTURE_PHASES } from '../../generator/templates/aperture/index';
  import { GENERATED_EXERCISES } from './exercises.generated';

  const DATABASE = 'sideline';
  // Global phase.order offset: aperture occupies orders 1..APERTURE_PHASES.length (resolutions H4).
  const BAND_OFFSET = APERTURE_PHASES.length;

  function conceptsForPhase(phaseId: string): Concept[] {
    return SIDELINE_CONCEPT_META
      .filter((m) => m.phaseId === phaseId)
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((m) => {
        const exercises = GENERATED_EXERCISES[m.skill];
        if (!exercises || exercises.length === 0) {
          throw new Error(
            `sideline assembly: no generated exercises for skill ${m.skill}; ` +
            `re-run npm run generate-exercises -- --db sideline`
          );
        }
        return {
          id: `concept-${m.skill}`,
          order: m.order,
          skill: m.skill,
          title: m.title,
          teach: m.teach,
          exercises,
          phaseId: m.phaseId,
        };
      });
  }

  function checkpointsForPhase(phaseId: string): Checkpoint[] {
    return SIDELINE_CHECKPOINTS
      .filter((c) => c.phaseId === phaseId)
      .slice()
      .sort((a, b) => a.afterOrder - b.afterOrder)
      .map((c) => ({
        id: c.id,
        afterOrder: c.afterOrder,
        drawFromSkills: c.drawFromSkills,
        title: c.title,
      }));
  }

  export const sidelinePhases: Phase[] = SIDELINE_PHASES
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((pm) => ({
      id: pm.id,
      order: BAND_OFFSET + pm.order,
      title: pm.title,
      goal: pm.goal,
      level: pm.level,
      database: DATABASE,
      concepts: conceptsForPhase(pm.id),
      checkpoints: checkpointsForPhase(pm.id),
    }));
  ```

- [ ] **Step 6: Compile and run the test GREEN.**

  ```bash
  npx tsc -p tsconfig.json && node --test dist/test/sideline-phases.test.js
  ```

  Expected: all five tests pass (`# pass 5`, `# fail 0`). This confirms three phases in band-offset order, 21 concepts 1:1 with `SIDELINE_SKILLS`, contiguous local order, every concept carrying at least one fingerprinted `sideline` exercise, and cpF/cpG/cpH/cpI present with cpI drawing all skills.

- [ ] **Step 7: Full server typecheck + test suite (no regressions).** Confirm the frozen module and generated map compile cleanly alongside the rest of the server and do not break the existing sideline generation test.

  ```bash
  npm run typecheck && npx tsc -p tsconfig.json && node --test dist/test/*.test.js
  ```

  Expected: `tsc` prints nothing (exit 0) and the aggregate node test run reports `# fail 0`.

- [ ] **Step 8: Commit the frozen sideline band.** Stage the assembly module, both frozen artifacts, and the test.

  ```bash
  git add \
    src/phases/sideline/index.ts \
    src/phases/sideline/exercises.generated.ts \
    scripts/snapshots/sideline.snapshot.json \
    test/sideline-phases.test.ts
  git commit -m "$(cat <<'EOF'
Task 11: assemble, freeze, and validate sideline phases

Compose sidelinePhases from SIDELINE_PHASES + SIDELINE_CONCEPT_META +
SIDELINE_CHECKPOINTS (phaseIds sideline-joins/sideline-subqueries/
sideline-windows) with global order = APERTURE_PHASES.length + local order.
Freeze generated fingerprinted exercises + snapshot; validate 100% (g0..g9).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

  Expected: one commit containing the four paths. The sideline band is now frozen and ready for T14 to union into `getPhases()`.

---

### Task 12: ADVANCED rove templates (24 incl recursive CTE)

Fill the rove templates registry with all 24 `rv-` templates, the skill list, per-concept metadata (with teach blocks), the three-phase model, and checkpoints. Every template is bounded to a single city and/or fixed date range (or a small aggregate), sets `boundedSlice=true` and `rowCeiling<=200`, carries NO `ORDER BY` and NO `ROUND` in `sqlShape` (emit owns both), and declares the tiebreak slot its family requires. `rv-recursive-cte` walks the `categories` tree that Task 9 adds, cleaning the R17 dangling-parent defect first, and never touches `customers.referred_by_customer_id`.

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\generator\templates\rove\index.ts` (T0 stub -> filled here)
- Create: `C:\Dev\Projects\sql-mastery\test\rove-templates.test.ts`

**Interfaces:**
- Consumes (exact signatures from the contract, imported from `../../types` i.e. `src/generator/types.ts`):
  - `interface Template { skill; database; family; primaryTable?; sqlShape; slots: Slot[]; bindingRules: BindingRule[]; phrasings: string[]; hintTemplate: string; scaffoldPlan: ScaffoldPlan; gateHints: GateHints; }`
  - `interface Slot { name: string; kind: SlotKind; table?: string; op?: string; col?: string; sampleStrategy?: string; }`
  - `type SlotKind = 'table'|'column'|'projection'|'literal'|'groupCols'|'sortKey'|'partitionCols'|'rankKey'|'limit'`
  - `interface BindingRule { slot: string; predicate: (value: string, catalog: any) => boolean; }`
  - `interface ScaffoldPlan { full: 'all-value-slots'; half: 'harder-half'; blank: 'whole-clauses'; }`
  - `interface GateHints { minRows: number; minDistinct: number; rowCeiling: number; orderMatters: boolean; boundedSlice: boolean; }`
  - `interface ConceptMeta { skill: string; order: number; title: string; teach: TeachBlock; phaseId: string; }`
  - `interface TeachBlock { plain: string; mentalModel: string; example: { sql: string; note: string }; }`
  - `interface PhaseMeta { id: string; title: string; goal: string; level: Level; order: number; }` (added in T0 per resolutions H1)
  - `interface CheckpointMeta { id: string; phaseId: string; afterOrder: number; drawFromSkills: string[]; title: string; }` (added in T0)
- Produces (exact names later tasks rely on; Task 13 phase-assembly imports these and NEVER redefines them):
  - `export const ROVE_TEMPLATES: Template[]` (length 24)
  - `export const ROVE_SKILLS: string[]` (length 24; the sole definition of rove slugs)
  - `export const ROVE_CONCEPT_META: ConceptMeta[]` (length 24; 1:1 with `ROVE_SKILLS`, each carries a valid `phaseId` + local `order`)
  - `export const ROVE_PHASES: PhaseMeta[]` (ids `rv-clean`, `rv-analytic`, `rv-behavioral`; `order` 1..3)
  - `export const ROVE_CHECKPOINTS: CheckpointMeta[]` (`cp1`..`cp4` mid-band + `cp5` capstone in `rv-behavioral` drawing all `ROVE_SKILLS`)

Note on tiebreak slots (binds T4 emit, does not contradict it): emit appends exactly one deterministic tiebreak `ORDER BY` per family reading fixed slot names -- `sortKey` (single-table), `groupCols` (grouped), `partitionCols` + `rankKey` (windowed) -- plus the schema-catalog `pk` for single-table/windowed. bind draws each tiebreak slot's value from the union of the primary table's catalog columns and the projected aliases in `sqlShape`; the pinning `BindingRule` on each tiebreak slot selects the exact intended expression. Grouped tiebreak is `groupCols` only (never a non-grouped pk, avoids 42803).

---

- [ ] **Step 1: Write the failing structural test.** Create `C:\Dev\Projects\sql-mastery\test\rove-templates.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROVE_TEMPLATES,
  ROVE_SKILLS,
  ROVE_CONCEPT_META,
  ROVE_PHASES,
  ROVE_CHECKPOINTS,
} from '../src/generator/templates/rove/index';

const EXPECTED_SKILLS = [
  'rv-profile-dirty-data', 'rv-text-normalize', 'rv-case-canonicalize',
  'rv-null-coalesce-nullif', 'rv-money-text-cast', 'rv-regex-clean-contacts',
  'rv-timezone-city-join', 'rv-dedup-rownumber', 'rv-orphan-anti-join',
  'rv-soft-delete-valid', 'rv-payment-dedup', 'rv-rating-outlier-clean',
  'rv-rank-leaderboard', 'rv-topn-per-group', 'rv-lag-lead-deltas',
  'rv-running-total', 'rv-moving-average-frame', 'rv-ntile-bucketing',
  'rv-sessionization', 'rv-funnel-conversion', 'rv-retention-cohort',
  'rv-lifecycle-latency', 'rv-clean-layer-capstone', 'rv-recursive-cte',
];

test('ROVE_SKILLS is the 24 advanced slugs, unique, incl recursive cte', () => {
  assert.equal(ROVE_SKILLS.length, 24);
  assert.deepEqual(ROVE_SKILLS, EXPECTED_SKILLS);
  assert.equal(new Set(ROVE_SKILLS).size, 24);
  assert.ok(ROVE_SKILLS.includes('rv-recursive-cte'));
});

test('24 templates, all rove, all bounded, all <=200, no ORDER BY / no ROUND in sqlShape', () => {
  assert.equal(ROVE_TEMPLATES.length, 24);
  const skills = ROVE_TEMPLATES.map((t) => t.skill);
  assert.deepEqual([...skills].sort(), [...ROVE_SKILLS].sort());
  for (const t of ROVE_TEMPLATES) {
    assert.equal(t.database, 'rove', `${t.skill} database`);
    assert.equal(t.gateHints.boundedSlice, true, `${t.skill} boundedSlice`);
    assert.ok(t.gateHints.rowCeiling <= 200, `${t.skill} rowCeiling`);
    assert.ok(t.phrasings.length >= 2, `${t.skill} phrasings>=2`);
    assert.ok(t.hintTemplate.length > 0, `${t.skill} hint`);
    const up = t.sqlShape.toUpperCase();
    assert.ok(!/\bORDER\s+BY\b/.test(up), `${t.skill} has ORDER BY in sqlShape`);
    assert.ok(!up.includes('ROUND('), `${t.skill} hand-writes ROUND`);
    // ASCII only in emitted SQL/phrasings/hints.
    assert.ok(/^[\x00-\x7F]*$/.test(t.sqlShape + t.phrasings.join('') + t.hintTemplate), `${t.skill} non-ascii`);
  }
});

test('each template declares the tiebreak slot its family requires', () => {
  for (const t of ROVE_TEMPLATES) {
    const kinds = new Set(t.slots.map((s) => s.kind));
    if (t.family === 'single-table') assert.ok(kinds.has('sortKey'), `${t.skill} needs sortKey`);
    else if (t.family === 'grouped') assert.ok(kinds.has('groupCols'), `${t.skill} needs groupCols`);
    else if (t.family === 'windowed') {
      assert.ok(kinds.has('partitionCols'), `${t.skill} needs partitionCols`);
      assert.ok(kinds.has('rankKey'), `${t.skill} needs rankKey`);
    } else assert.fail(`${t.skill} unexpected family ${t.family}`);
  }
});

test('concept-meta is 1:1 with skills, phaseIds valid, local order contiguous per phase', () => {
  assert.equal(ROVE_CONCEPT_META.length, 24);
  assert.deepEqual(ROVE_CONCEPT_META.map((c) => c.skill), ROVE_SKILLS);
  const phaseIds = new Set(ROVE_PHASES.map((p) => p.id));
  for (const c of ROVE_CONCEPT_META) {
    assert.ok(phaseIds.has(c.phaseId), `${c.skill} bad phaseId`);
    assert.ok(c.teach.plain.length > 0 && c.teach.example.sql.length > 0, `${c.skill} teach`);
  }
  for (const p of ROVE_PHASES) {
    const orders = ROVE_CONCEPT_META.filter((c) => c.phaseId === p.id).map((c) => c.order).sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, i) => i + 1), `${p.id} local order not contiguous 1..n`);
  }
});

test('three rove phases, all advanced, order 1..3', () => {
  assert.deepEqual(ROVE_PHASES.map((p) => p.id), ['rv-clean', 'rv-analytic', 'rv-behavioral']);
  assert.deepEqual(ROVE_PHASES.map((p) => p.order), [1, 2, 3]);
  for (const p of ROVE_PHASES) assert.equal(p.level, 'advanced', `${p.id} level`);
});

test('checkpoints cp1..cp4 mid + cp5 capstone drawing ALL rove skills', () => {
  assert.deepEqual(ROVE_CHECKPOINTS.map((c) => c.id), ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']);
  const phaseIds = new Set(ROVE_PHASES.map((p) => p.id));
  const skillSet = new Set(ROVE_SKILLS);
  for (const c of ROVE_CHECKPOINTS) {
    assert.ok(phaseIds.has(c.phaseId), `${c.id} bad phaseId`);
    for (const s of c.drawFromSkills) assert.ok(skillSet.has(s), `${c.id} draws unknown skill ${s}`);
  }
  const cp5 = ROVE_CHECKPOINTS.find((c) => c.id === 'cp5');
  assert.equal(cp5?.phaseId, 'rv-behavioral');
  assert.deepEqual([...(cp5?.drawFromSkills ?? [])].sort(), [...ROVE_SKILLS].sort());
});

test('rv-recursive-cte walks the categories tree (cleaned), not customers', () => {
  const rec = ROVE_TEMPLATES.find((t) => t.skill === 'rv-recursive-cte');
  assert.ok(rec, 'rv-recursive-cte template missing');
  const sql = rec!.sqlShape.toUpperCase();
  assert.ok(sql.includes('WITH RECURSIVE'), 'must use WITH RECURSIVE');
  assert.ok(rec!.sqlShape.includes('categories'), 'must read the categories tree');
  assert.ok(rec!.sqlShape.includes('parent_category_id'), 'must walk parent_category_id');
  // Cleans the R17 dangling-parent defect BEFORE traversal.
  assert.ok(rec!.sqlShape.includes('IN (SELECT category_id FROM categories)'), 'must clean dangling parents');
  assert.ok(!rec!.sqlShape.includes('referred_by_customer_id'), 'must NOT use customers self-ref');
});

test('rove full-code templates carry their signature clauses', () => {
  const byId = (s: string) => ROVE_TEMPLATES.find((t) => t.skill === s)!.sqlShape;
  assert.ok(byId('rv-timezone-city-join').includes('AT TIME ZONE'), 'tz template uses AT TIME ZONE');
  assert.ok(byId('rv-moving-average-frame').includes('generate_series'), 'moving-avg uses a date spine');
  assert.ok(byId('rv-moving-average-frame').toUpperCase().includes('RANGE BETWEEN'), 'moving-avg uses RANGE frame');
  assert.ok(byId('rv-sessionization').includes('INTERVAL '), 'sessionization uses a gap interval');
  assert.ok(byId('rv-sessionization').toUpperCase().includes('LAG('), 'sessionization uses LAG');
});
```

- [ ] **Step 2: Run it RED.** The T0 stub exports empty arrays, so counts and content assertions fail.

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/rove-templates.test.js
```

Expected failure (empty stub): e.g. `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: 0 !== 24` on the `ROVE_SKILLS.length` assertion (and every subsequent length/content check).

- [ ] **Step 3: Write the file skeleton -- imports, factory, skills, phases, checkpoints, concept-meta + teach, and empty template sub-arrays.** Overwrite `C:\Dev\Projects\sql-mastery\src\generator\templates\rove\index.ts` with:

```ts
import type {
  Template, Slot, BindingRule, ScaffoldPlan, GateHints,
  ConceptMeta, TeachBlock, PhaseMeta, CheckpointMeta, Level,
} from '../../types';

// ---------------------------------------------------------------------------
// Shared building blocks (ASCII only; no ORDER BY / ROUND in any sqlShape).
// ---------------------------------------------------------------------------

const ROVE_SCAFFOLD: ScaffoldPlan = {
  full: 'all-value-slots',
  half: 'harder-half',
  blank: 'whole-clauses',
};

function gate(over: Partial<GateHints> = {}): GateHints {
  // Every rove template is a bounded slice with a hard <=200 row ceiling.
  return { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: true, boundedSlice: true, ...over };
}

function rv(cfg: {
  skill: string;
  family: 'single-table' | 'grouped' | 'windowed';
  primaryTable?: string;
  sqlShape: string;
  slots: Slot[];
  bindingRules?: BindingRule[];
  phrasings: string[];
  hint: string;
  gateHints?: Partial<GateHints>;
}): Template {
  return {
    skill: cfg.skill,
    database: 'rove',
    family: cfg.family,
    primaryTable: cfg.primaryTable,
    sqlShape: cfg.sqlShape,
    slots: cfg.slots,
    bindingRules: cfg.bindingRules ?? [],
    phrasings: cfg.phrasings,
    hintTemplate: cfg.hint,
    scaffoldPlan: ROVE_SCAFFOLD,
    gateHints: gate(cfg.gateHints),
  };
}

// Common slot builders. A literal slot is probe-drawn (SELECT DISTINCT col).
const cityIdSlot: Slot = { name: 'cityId', kind: 'literal', table: 'orders', op: '=', col: 'city_id' };
const eventCitySlot: Slot = { name: 'cityId', kind: 'literal', table: 'event_log', op: '=', col: 'city_id' };
const courierCitySlot: Slot = { name: 'cityId', kind: 'literal', table: 'couriers', op: '=', col: 'home_city_id' };
const cityNameSlot: Slot = { name: 'cityName', kind: 'literal', table: 'cities', op: '=', col: 'name' };

// Pin a tiebreak slot to an exact expression (bind selects it from catalog cols + projected aliases).
function tiebreak(name: string, kind: Slot['kind'], table: string, expr: string): { slot: Slot; rule: BindingRule } {
  return {
    slot: { name, kind, table },
    rule: { slot: name, predicate: (v: string) => v === expr },
  };
}

// ---------------------------------------------------------------------------
// Skill list (SOLE definition of rove slugs).
// ---------------------------------------------------------------------------

export const ROVE_SKILLS: string[] = [
  'rv-profile-dirty-data', 'rv-text-normalize', 'rv-case-canonicalize',
  'rv-null-coalesce-nullif', 'rv-money-text-cast', 'rv-regex-clean-contacts',
  'rv-timezone-city-join', 'rv-dedup-rownumber', 'rv-orphan-anti-join',
  'rv-soft-delete-valid', 'rv-payment-dedup', 'rv-rating-outlier-clean',
  'rv-rank-leaderboard', 'rv-topn-per-group', 'rv-lag-lead-deltas',
  'rv-running-total', 'rv-moving-average-frame', 'rv-ntile-bucketing',
  'rv-sessionization', 'rv-funnel-conversion', 'rv-retention-cohort',
  'rv-lifecycle-latency', 'rv-clean-layer-capstone', 'rv-recursive-cte',
];

// ---------------------------------------------------------------------------
// Phases + checkpoints (single-source phase model, resolutions H1/H5).
// ---------------------------------------------------------------------------

const ADVANCED: Level = 'advanced';

export const ROVE_PHASES: PhaseMeta[] = [
  { id: 'rv-clean', title: 'Cleaning the raw layer',
    goal: 'Profile and normalize dirty Rove data into a trustworthy base to analyze.',
    level: ADVANCED, order: 1 },
  { id: 'rv-analytic', title: 'Analytic windows on the clean layer',
    goal: 'Rank, bucket, and trend the cleaned data with window functions.',
    level: ADVANCED, order: 2 },
  { id: 'rv-behavioral', title: 'Behavioral and hierarchical analysis',
    goal: 'Sessionize events, model funnels and retention, and traverse hierarchies.',
    level: ADVANCED, order: 3 },
];

export const ROVE_CHECKPOINTS: CheckpointMeta[] = [
  { id: 'cp1', phaseId: 'rv-clean', afterOrder: 6,
    drawFromSkills: ROVE_SKILLS.slice(0, 6), title: 'Cleaning fundamentals check' },
  { id: 'cp2', phaseId: 'rv-clean', afterOrder: 12,
    drawFromSkills: ROVE_SKILLS.slice(0, 12), title: 'Clean layer checkpoint' },
  { id: 'cp3', phaseId: 'rv-analytic', afterOrder: 3,
    drawFromSkills: ROVE_SKILLS.slice(12, 15), title: 'Ranking and deltas check' },
  { id: 'cp4', phaseId: 'rv-analytic', afterOrder: 6,
    drawFromSkills: ROVE_SKILLS.slice(12, 18), title: 'Analytic windows checkpoint' },
  { id: 'cp5', phaseId: 'rv-behavioral', afterOrder: 6,
    drawFromSkills: [...ROVE_SKILLS], title: 'Advanced capstone (all Rove skills)' },
];

// ---------------------------------------------------------------------------
// Concept metadata + teach blocks (1:1 with ROVE_SKILLS, local order per phase).
// ---------------------------------------------------------------------------

function cm(skill: string, phaseId: string, order: number, title: string, teach: TeachBlock): ConceptMeta {
  return { skill, order, title, teach, phaseId };
}

export const ROVE_CONCEPT_META: ConceptMeta[] = [
  cm('rv-profile-dirty-data', 'rv-clean', 1, 'Profile dirty data', {
    plain: 'Before cleaning anything, count how dirty each column is: nulls, blanks, and out-of-range values.',
    mentalModel: 'A data profile is a health report you run once so you know what to fix.',
    example: { sql: "SELECT COUNT(*) FILTER (WHERE tip_cents IS NULL) AS null_tips FROM orders", note: 'FILTER counts a condition without a WHERE.' },
  }),
  cm('rv-text-normalize', 'rv-clean', 2, 'Normalize text', {
    plain: 'Trim whitespace and lowercase text so the same value stops looking like many values.',
    mentalModel: 'TRIM + LOWER collapse cosmetic variants onto one canonical spelling.',
    example: { sql: "SELECT LOWER(TRIM(full_name)) AS clean_name FROM customers", note: 'Cleaning is a projection, not a mutation.' },
  }),
  cm('rv-case-canonicalize', 'rv-clean', 3, 'Canonicalize synonyms', {
    plain: 'Map casing variants and synonyms (e.g. "CC", "credit") onto one canonical label with CASE.',
    mentalModel: 'A CASE ladder is a lookup table you write inline.',
    example: { sql: "SELECT CASE WHEN LOWER(method) IN ('cc','credit') THEN 'credit_card' ELSE LOWER(method) END AS m FROM payments", note: 'Lowercase first, then match.' },
  }),
  cm('rv-null-coalesce-nullif', 'rv-clean', 4, 'COALESCE and NULLIF', {
    plain: 'COALESCE fills missing values; NULLIF turns a sentinel (like an empty string) back into NULL.',
    mentalModel: 'COALESCE picks the first non-null; NULLIF is its inverse for one bad value.',
    example: { sql: "SELECT COALESCE(tip_cents, 0) AS tip, NULLIF(TRIM(order_total_legacy), '') AS raw FROM orders", note: 'NULL and 0 mean different things for tips.' },
  }),
  cm('rv-money-text-cast', 'rv-clean', 5, 'Cast money text', {
    plain: 'Strip $, commas, and USD from money-as-text, then cast to a number you can sum.',
    mentalModel: 'Regex-clean the string, then CAST; never sum raw text.',
    example: { sql: "SELECT (REGEXP_REPLACE(order_total_legacy, '[^0-9.]', '', 'g'))::numeric AS dollars FROM orders", note: 'Keep only digits and the decimal point.' },
  }),
  cm('rv-regex-clean-contacts', 'rv-clean', 6, 'Regex-clean contacts', {
    plain: 'Normalize phone and email with regex: strip non-digits from phones, lowercase and de-mailto emails.',
    mentalModel: 'REGEXP_REPLACE is find-and-replace with pattern power.',
    example: { sql: "SELECT REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS digits FROM customers", note: 'Digits-only makes phones comparable.' },
  }),
  cm('rv-timezone-city-join', 'rv-clean', 7, 'Timezone via city join', {
    plain: "Convert a naive local timestamp to a real instant using the city's IANA timezone, joined from cities.",
    mentalModel: "AT TIME ZONE cities.timezone is the truth; utc_offset_hours is a stale trap.",
    example: { sql: "SELECT o.placed_at AT TIME ZONE ci.timezone AS utc_instant FROM orders o JOIN cities ci ON ci.city_id = o.city_id", note: 'Join to get the zone, then convert.' },
  }),
  cm('rv-dedup-rownumber', 'rv-clean', 8, 'Deduplicate with ROW_NUMBER', {
    plain: 'Collapse duplicate customer rows to one per person using ROW_NUMBER over master_customer_id.',
    mentalModel: 'Number the dupes, then keep row number 1.',
    example: { sql: "SELECT * FROM (SELECT customer_id, ROW_NUMBER() OVER (PARTITION BY master_customer_id ORDER BY customer_id) rn FROM customers) x WHERE rn = 1", note: 'master_customer_id is the hidden identity key.' },
  }),
  cm('rv-orphan-anti-join', 'rv-clean', 9, 'Find orphan rows', {
    plain: 'Find orders whose customer_id has no matching customer (purged/orphaned references).',
    mentalModel: 'An anti-join keeps the left rows that fail to match.',
    example: { sql: "SELECT o.order_id FROM orders o WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)", note: 'orders.customer_id has no FK on purpose.' },
  }),
  cm('rv-soft-delete-valid', 'rv-clean', 10, 'Valid (non-deleted) population', {
    plain: 'Analyze only the valid population by excluding soft-deleted rows (is_deleted = false).',
    mentalModel: 'Soft-deleted rows still exist; you must filter them out yourself.',
    example: { sql: "SELECT COUNT(*) FROM customers WHERE is_deleted = false", note: 'Forgetting this inflates every metric.' },
  }),
  cm('rv-payment-dedup', 'rv-clean', 11, 'Dedup payment retries', {
    plain: 'Keep one payment per order despite retries/duplicates using DISTINCT ON.',
    mentalModel: 'DISTINCT ON (order_id) keeps the first row per order in the ORDER BY.',
    example: { sql: "SELECT DISTINCT ON (order_id) order_id, payment_id FROM payments ORDER BY order_id, authorized_at", note: 'ORDER BY decides which retry wins.' },
  }),
  cm('rv-rating-outlier-clean', 'rv-clean', 12, 'Clean rating outliers', {
    plain: 'Drop out-of-range star ratings (only 1..5 are valid) before averaging.',
    mentalModel: 'Sentinels like 0/6/-1/99 poison an AVG; filter to the valid band first.',
    example: { sql: "SELECT AVG(stars) FROM ratings WHERE stars BETWEEN 1 AND 5", note: 'Range-guard, then aggregate.' },
  }),
  cm('rv-rank-leaderboard', 'rv-analytic', 1, 'Rank a leaderboard', {
    plain: 'Rank couriers within a city by lifetime deliveries, handling ties with RANK.',
    mentalModel: 'RANK leaves gaps after ties; PARTITION BY scopes the ranking per city.',
    example: { sql: "SELECT courier_id, RANK() OVER (PARTITION BY home_city_id ORDER BY lifetime_deliveries DESC) rk FROM couriers", note: 'Ties are intentional in this data.' },
  }),
  cm('rv-topn-per-group', 'rv-analytic', 2, 'Top-N per group', {
    plain: 'Return the top 3 merchants by order count per city using ROW_NUMBER filtered to <= 3.',
    mentalModel: 'Number rows per group, then keep the top slice.',
    example: { sql: "SELECT * FROM (SELECT city_id, merchant_id, ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY n DESC) rn FROM t) x WHERE rn <= 3", note: 'ROW_NUMBER breaks ties deterministically.' },
  }),
  cm('rv-lag-lead-deltas', 'rv-analytic', 3, 'LAG/LEAD deltas', {
    plain: 'Compute day-over-day change in daily orders for one city with LAG.',
    mentalModel: 'LAG pulls the previous row into the current one so you can subtract.',
    example: { sql: "SELECT d, n - LAG(n) OVER (ORDER BY d) AS delta FROM daily", note: 'The first row has a NULL delta.' },
  }),
  cm('rv-running-total', 'rv-analytic', 4, 'Running total', {
    plain: 'Accumulate a running revenue total per day for one city.',
    mentalModel: 'SUM() OVER (ORDER BY d) with default frame is a cumulative sum.',
    example: { sql: "SELECT d, SUM(n) OVER (ORDER BY d) AS cume FROM daily", note: 'Ordering defines the accumulation.' },
  }),
  cm('rv-moving-average-frame', 'rv-analytic', 5, 'Moving average on a date spine', {
    plain: 'Compute a calendar-correct 7-day trailing average over a dense date spine (no missing days).',
    mentalModel: 'A generate_series spine + RANGE BETWEEN INTERVAL frame makes gaps count as zero.',
    example: { sql: "AVG(n) OVER (ORDER BY d RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)", note: 'RANGE (not ROWS) is calendar-aware.' },
  }),
  cm('rv-ntile-bucketing', 'rv-analytic', 6, 'NTILE bucketing', {
    plain: 'Split merchants in a city into quartiles by average order value with NTILE(4).',
    mentalModel: 'NTILE(4) assigns each row to one of four equal-size buckets.',
    example: { sql: "SELECT merchant_id, NTILE(4) OVER (ORDER BY aov) AS quartile FROM t", note: 'Buckets are size-balanced, not value-balanced.' },
  }),
  cm('rv-sessionization', 'rv-behavioral', 1, 'Sessionize events', {
    plain: 'Group a customer event stream into sessions with a 30-minute inactivity gap (gap-and-island).',
    mentalModel: 'Flag a new session when the gap since the last event exceeds the threshold, then cumulative-sum the flags.',
    example: { sql: "SUM(is_new) OVER (PARTITION BY customer_id ORDER BY event_ts)", note: 'The running sum is the session number.' },
  }),
  cm('rv-funnel-conversion', 'rv-behavioral', 2, 'Funnel conversion', {
    plain: 'Count distinct customers reaching each funnel step in a city to measure drop-off.',
    mentalModel: 'A funnel is one COUNT(DISTINCT customer) per ordered step.',
    example: { sql: "SELECT event_type, COUNT(DISTINCT customer_id) FROM event_log GROUP BY event_type", note: 'Distinct customers, not raw events.' },
  }),
  cm('rv-retention-cohort', 'rv-behavioral', 3, 'Retention cohort', {
    plain: 'Bucket customers by signup month and measure how many order in each later month.',
    mentalModel: 'date_trunc the signup to a cohort, then cross with activity months.',
    example: { sql: "SELECT date_trunc('month', signup_ts) AS cohort, COUNT(*) FROM customers GROUP BY 1", note: 'The cohort key never changes per customer.' },
  }),
  cm('rv-lifecycle-latency', 'rv-behavioral', 4, 'Lifecycle latency', {
    plain: 'Measure interval latency between lifecycle stamps (applied -> approved -> active) per courier cohort.',
    mentalModel: 'Subtract two timestamps to get an INTERVAL; average it per group.',
    example: { sql: "SELECT AVG(approved_at - applied_at) FROM couriers WHERE approved_at IS NOT NULL", note: 'NULL stamps must be filtered first.' },
  }),
  cm('rv-clean-layer-capstone', 'rv-behavioral', 5, 'Clean-layer capstone', {
    plain: 'Stack 3-4 cleaning CTEs (valid population, canonical labels, deduped payments) then run one analytic on the bounded slice.',
    mentalModel: 'Build a trusted layer with CTEs, analyze on top; keep the slice small so it stays fast.',
    example: { sql: "WITH valid AS (...), canon AS (...), paid AS (...) SELECT ... FROM paid ...", note: 'The perf story: bound the slice, reason about the plan.' },
  }),
  cm('rv-recursive-cte', 'rv-behavioral', 6, 'Recursive CTE (category tree)', {
    plain: 'Walk the self-referencing merchant-category tree from a fixed root with WITH RECURSIVE, after cleaning dangling parents.',
    mentalModel: 'A recursive CTE is a base row UNION ALL a step that joins children to the growing frontier.',
    example: { sql: "WITH RECURSIVE tree AS (SELECT ... WHERE root UNION ALL SELECT ... JOIN tree ON child.parent = tree.id) SELECT * FROM tree", note: 'Materialize a path string and order by it.' },
  }),
];

// ---------------------------------------------------------------------------
// Templates (filled in the next steps). ROVE_TEMPLATES concatenates the bands.
// ---------------------------------------------------------------------------

const CLEAN_TEMPLATES: Template[] = [];
const ANALYTIC_TEMPLATES: Template[] = [];
const BEHAVIORAL_TEMPLATES: Template[] = [];

export const ROVE_TEMPLATES: Template[] = [
  ...CLEAN_TEMPLATES,
  ...ANALYTIC_TEMPLATES,
  ...BEHAVIORAL_TEMPLATES,
];
```

Keep it compiling:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

Expected: exit 0 (skills/phases/checkpoints/meta tests now pass; template-count tests still red because the three sub-arrays are empty).

- [ ] **Step 4: Fill the 12 cleaning templates (full code for rv-timezone-city-join).** Replace `const CLEAN_TEMPLATES: Template[] = [];` with:

```ts
const CLEAN_TEMPLATES: Template[] = [
  rv({
    skill: 'rv-profile-dirty-data', family: 'grouped', primaryTable: 'orders',
    sqlShape: `
SELECT
  'orders' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE tip_cents IS NULL) AS null_tips,
  COUNT(*) FILTER (WHERE TRIM(COALESCE(order_total_legacy, '')) = '') AS blank_totals
FROM orders o
WHERE o.city_id = {cityId}`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'orders', 'table_name').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'table_name').rule],
    phrasings: [
      'For city {cityId}, report table_name, total_rows, null_tips, and blank_totals for the orders table.',
      'Profile the orders of city {cityId}: total_rows plus counts of null_tips and blank_totals.',
    ],
    hint: 'Use COUNT(*) FILTER (WHERE ...) to count each dirty condition without separate scans.',
    gateHints: { minDistinct: 1 },
  }),
  rv({
    skill: 'rv-text-normalize', family: 'single-table', primaryTable: 'customers',
    sqlShape: `
SELECT
  c.customer_id,
  LOWER(TRIM(c.full_name)) AS clean_name
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.full_name IS NOT NULL`,
    slots: [
      { name: 'cityId', kind: 'literal', table: 'customers', op: '=', col: 'signup_city_id' },
      tiebreak('sortKey', 'sortKey', 'customers', 'clean_name').slot,
    ],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'clean_name').rule],
    phrasings: [
      'For signup city {cityId}, return customer_id and a clean_name that is the trimmed, lowercased full_name.',
      'Normalize full_name (trim + lowercase) as clean_name for customers who signed up in city {cityId}.',
    ],
    hint: 'LOWER(TRIM(full_name)) collapses casing and whitespace variants onto one spelling.',
  }),
  rv({
    skill: 'rv-case-canonicalize', family: 'grouped', primaryTable: 'payments',
    sqlShape: `
SELECT
  CASE
    WHEN LOWER(TRIM(p.method)) IN ('cc', 'credit', 'credit card') THEN 'credit_card'
    WHEN LOWER(TRIM(p.method)) IN ('applepay', 'apple pay') THEN 'apple_pay'
    ELSE LOWER(TRIM(p.method))
  END AS canonical_method,
  COUNT(*) AS payment_count
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.city_id = {cityId}
GROUP BY 1`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'payments', 'canonical_method').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'payments', 'canonical_method').rule],
    phrasings: [
      'For city {cityId}, return canonical_method and payment_count after mapping method synonyms to one label.',
      'Canonicalize payment method casing/synonyms in city {cityId}; report canonical_method and payment_count.',
    ],
    hint: 'Lowercase and trim first, then map synonym groups with a CASE ladder.',
  }),
  rv({
    skill: 'rv-null-coalesce-nullif', family: 'single-table', primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  COALESCE(o.tip_cents, 0) AS tip_cents_filled,
  NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') AS legacy_total_or_null
FROM orders o
WHERE o.city_id = {cityId}`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').rule],
    phrasings: [
      'For city {cityId}, return order_id, tip_cents_filled (missing tips as 0), and legacy_total_or_null (blanks as NULL).',
      'In city {cityId}, fill null tips with COALESCE and turn blank legacy totals into NULL with NULLIF.',
    ],
    hint: 'COALESCE fills a missing value; NULLIF turns an empty-string sentinel back into NULL.',
  }),
  rv({
    skill: 'rv-money-text-cast', family: 'single-table', primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  (REGEXP_REPLACE(o.order_total_legacy, '[^0-9.]', '', 'g'))::numeric AS legacy_dollars
FROM orders o
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') IS NOT NULL
  AND o.order_total_legacy ~ '[0-9]'`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').rule],
    phrasings: [
      'For city {cityId}, parse order_total_legacy into a numeric legacy_dollars for rows that contain a number.',
      'Strip currency symbols from order_total_legacy in city {cityId} and cast to numeric legacy_dollars.',
    ],
    hint: "REGEXP_REPLACE(text, '[^0-9.]', '', 'g') keeps only digits and the decimal point, then cast to numeric.",
  }),
  rv({
    skill: 'rv-regex-clean-contacts', family: 'single-table', primaryTable: 'customers',
    sqlShape: `
SELECT
  c.customer_id,
  REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
  LOWER(TRIM(REGEXP_REPLACE(c.email, '^mailto:', ''))) AS clean_email
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.phone IS NOT NULL`,
    slots: [
      { name: 'cityId', kind: 'literal', table: 'customers', op: '=', col: 'signup_city_id' },
      tiebreak('sortKey', 'sortKey', 'customers', 'c.customer_id').slot,
    ],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'c.customer_id').rule],
    phrasings: [
      'For signup city {cityId}, return customer_id, phone_digits (digits only), and clean_email (lowercased, mailto stripped).',
      'Regex-clean contacts in city {cityId}: strip non-digits from phone and normalize email.',
    ],
    hint: "REGEXP_REPLACE(phone, '[^0-9]', '', 'g') keeps only digits; strip a leading 'mailto:' from email.",
  }),
  // FULL CODE: timezone via city join (AT TIME ZONE cities.timezone; utc_offset_hours is the stale trap).
  rv({
    skill: 'rv-timezone-city-join', family: 'grouped', primaryTable: 'orders',
    sqlShape: `
SELECT
  ci.name AS city_name,
  ci.timezone AS iana_timezone,
  EXTRACT(HOUR FROM o.placed_at) AS local_hour,
  MIN(o.placed_at AT TIME ZONE ci.timezone) AS earliest_utc_instant,
  COUNT(*) AS orders_placed
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE ci.name = {cityName}
GROUP BY ci.name, ci.timezone, EXTRACT(HOUR FROM o.placed_at)`,
    slots: [cityNameSlot, tiebreak('groupCols', 'groupCols', 'orders', 'EXTRACT(HOUR FROM o.placed_at)').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'EXTRACT(HOUR FROM o.placed_at)').rule],
    phrasings: [
      "For {cityName}, return city_name, iana_timezone, local_hour, the earliest_utc_instant (placed_at converted via the city's IANA zone), and orders_placed per local hour.",
      "Group {cityName} orders by local_hour; show iana_timezone and earliest_utc_instant from AT TIME ZONE plus orders_placed.",
    ],
    hint: "Join cities to read timezone, then convert with placed_at AT TIME ZONE ci.timezone. Do NOT use utc_offset_hours (it is stale).",
    gateHints: { minDistinct: 2 },
  }),
  rv({
    skill: 'rv-dedup-rownumber', family: 'single-table', primaryTable: 'customers',
    sqlShape: `
SELECT deduped.master_customer_id, deduped.customer_id, deduped.full_name
FROM (
  SELECT
    c.master_customer_id,
    c.customer_id,
    c.full_name,
    ROW_NUMBER() OVER (PARTITION BY c.master_customer_id ORDER BY c.customer_id) AS rn
  FROM customers c
  WHERE c.signup_city_id = {cityId} AND c.is_deleted = false
) deduped
WHERE deduped.rn = 1`,
    slots: [
      { name: 'cityId', kind: 'literal', table: 'customers', op: '=', col: 'signup_city_id' },
      tiebreak('sortKey', 'sortKey', 'customers', 'deduped.master_customer_id').slot,
    ],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'deduped.master_customer_id').rule],
    phrasings: [
      'For signup city {cityId}, return one row per person (master_customer_id, customer_id, full_name) keeping the lowest customer_id.',
      'Deduplicate customers in city {cityId} with ROW_NUMBER over master_customer_id; keep row number 1.',
    ],
    hint: 'ROW_NUMBER() OVER (PARTITION BY master_customer_id ORDER BY customer_id), then keep rn = 1.',
  }),
  rv({
    skill: 'rv-orphan-anti-join', family: 'single-table', primaryTable: 'orders',
    sqlShape: `
SELECT o.order_id, o.customer_id
FROM orders o
WHERE o.city_id = {cityId}
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'o.order_id').rule],
    phrasings: [
      'For city {cityId}, list order_id and customer_id for orders whose customer no longer exists.',
      'Find orphaned orders in city {cityId}: their customer_id has no matching customers row.',
    ],
    hint: 'NOT EXISTS (SELECT 1 FROM customers ...) keeps only the orders that fail to match a customer.',
  }),
  rv({
    skill: 'rv-soft-delete-valid', family: 'grouped', primaryTable: 'support_tickets',
    sqlShape: `
SELECT
  t.category AS ticket_category,
  COUNT(*) AS valid_tickets
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId} AND t.is_deleted = false
GROUP BY t.category`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'support_tickets', 't.category').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'support_tickets', 't.category').rule],
    phrasings: [
      'For city {cityId}, count valid_tickets per ticket_category, excluding soft-deleted tickets.',
      'Over the non-deleted support tickets of city {cityId}, report ticket_category and valid_tickets.',
    ],
    hint: 'Soft-deleted rows still exist; filter is_deleted = false before you count.',
  }),
  rv({
    skill: 'rv-payment-dedup', family: 'single-table', primaryTable: 'payments',
    sqlShape: `
SELECT winner.order_id, winner.payment_id, winner.amount_cents
FROM (
  SELECT DISTINCT ON (p.order_id)
    p.order_id, p.payment_id, p.amount_cents, p.authorized_at
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  WHERE o.city_id = {cityId}
  ORDER BY p.order_id, p.authorized_at, p.payment_id
) winner`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'payments', 'winner.order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'payments', 'winner.order_id').rule],
    phrasings: [
      'For city {cityId}, keep one payment per order (order_id, payment_id, amount_cents): the earliest authorization.',
      'Deduplicate payment retries in city {cityId} with DISTINCT ON (order_id) ordered by authorized_at.',
    ],
    hint: 'DISTINCT ON (order_id) with ORDER BY order_id, authorized_at keeps the first retry per order.',
  }),
  rv({
    skill: 'rv-rating-outlier-clean', family: 'grouped', primaryTable: 'ratings',
    sqlShape: `
SELECT
  r.courier_id,
  AVG(r.stars) AS avg_stars,
  COUNT(*) AS rating_count
FROM ratings r
JOIN orders o ON o.order_id = r.order_id
WHERE o.city_id = {cityId} AND r.stars BETWEEN 1 AND 5 AND r.courier_id IS NOT NULL
GROUP BY r.courier_id`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'ratings', 'r.courier_id').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'ratings', 'r.courier_id').rule],
    phrasings: [
      'For city {cityId}, report courier_id, avg_stars, and rating_count using only valid 1..5 ratings.',
      'Clean rating outliers in city {cityId} (keep stars 1..5), then average per courier_id.',
    ],
    hint: 'Sentinels like 0/6/-1/99 poison AVG; filter stars BETWEEN 1 AND 5 before grouping.',
  }),
];
```

Keep it compiling:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 5: Fill the 6 analytic-window templates (full code for rv-moving-average-frame).** Replace `const ANALYTIC_TEMPLATES: Template[] = [];` with:

```ts
const ANALYTIC_TEMPLATES: Template[] = [
  rv({
    skill: 'rv-rank-leaderboard', family: 'windowed', primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.courier_id,
  c.lifetime_deliveries,
  RANK() OVER (PARTITION BY c.home_city_id ORDER BY c.lifetime_deliveries DESC) AS delivery_rank
FROM couriers c
WHERE c.home_city_id = {cityId} AND c.status = 'active'`,
    slots: [
      courierCitySlot,
      tiebreak('partitionCols', 'partitionCols', 'couriers', 'c.home_city_id').slot,
      tiebreak('rankKey', 'rankKey', 'couriers', 'c.lifetime_deliveries DESC').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'couriers', 'c.home_city_id').rule,
      tiebreak('rankKey', 'rankKey', 'couriers', 'c.lifetime_deliveries DESC').rule,
    ],
    phrasings: [
      'For city {cityId}, rank active couriers by lifetime_deliveries (descending); return courier_id, lifetime_deliveries, delivery_rank.',
      'Build a courier leaderboard for city {cityId} using RANK over lifetime_deliveries.',
    ],
    hint: 'RANK() OVER (PARTITION BY home_city_id ORDER BY lifetime_deliveries DESC); ties share a rank and leave gaps.',
  }),
  rv({
    skill: 'rv-topn-per-group', family: 'windowed', primaryTable: 'orders',
    sqlShape: `
SELECT top3.city_id, top3.merchant_id, top3.order_count
FROM (
  SELECT
    o.city_id,
    o.merchant_id,
    COUNT(*) AS order_count,
    ROW_NUMBER() OVER (PARTITION BY o.city_id ORDER BY COUNT(*) DESC, o.merchant_id) AS rn
  FROM orders o
  WHERE o.city_id = {cityId}
  GROUP BY o.city_id, o.merchant_id
) top3
WHERE top3.rn <= 3`,
    slots: [
      cityIdSlot,
      tiebreak('partitionCols', 'partitionCols', 'orders', 'top3.city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'top3.order_count DESC').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'top3.city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'top3.order_count DESC').rule,
    ],
    phrasings: [
      'For city {cityId}, return the top 3 merchants by order_count: city_id, merchant_id, order_count.',
      'Top-3 merchants per city for city {cityId} via ROW_NUMBER filtered to rn <= 3.',
    ],
    hint: 'ROW_NUMBER() OVER (PARTITION BY city_id ORDER BY COUNT(*) DESC, merchant_id), then keep rn <= 3.',
  }),
  rv({
    skill: 'rv-lag-lead-deltas', family: 'windowed', primaryTable: 'orders',
    sqlShape: `
SELECT
  daily.order_day,
  daily.order_count,
  daily.order_count - LAG(daily.order_count) OVER (ORDER BY daily.order_day) AS day_over_day_delta
FROM (
  SELECT o.placed_at::date AS order_day, COUNT(*) AS order_count
  FROM orders o
  WHERE o.city_id = {cityId} AND o.placed_at >= {windowStart}
    AND o.placed_at < {windowStart}::timestamp + INTERVAL '30 days'
  GROUP BY o.placed_at::date
) daily`,
    slots: [
      cityIdSlot,
      { name: 'windowStart', kind: 'literal', table: 'orders', op: 'BETWEEN', col: 'placed_at', sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', '').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'daily.order_day').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', '').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'daily.order_day').rule,
    ],
    phrasings: [
      'For city {cityId} over a 30-day window, return order_day, order_count, and day_over_day_delta.',
      'Compute the daily order delta for city {cityId} using LAG over order_day.',
    ],
    hint: 'LAG(order_count) OVER (ORDER BY order_day) gives the previous day so you can subtract.',
    gateHints: { rowCeiling: 30 },
  }),
  rv({
    skill: 'rv-running-total', family: 'windowed', primaryTable: 'orders',
    sqlShape: `
SELECT
  daily.order_day,
  daily.gross_cents,
  SUM(daily.gross_cents) OVER (ORDER BY daily.order_day) AS running_gross_cents
FROM (
  SELECT o.placed_at::date AS order_day, SUM(o.amount_cents) AS gross_cents
  FROM orders o
  WHERE o.city_id = {cityId} AND o.placed_at >= {windowStart}
    AND o.placed_at < {windowStart}::timestamp + INTERVAL '30 days'
  GROUP BY o.placed_at::date
) daily`,
    slots: [
      cityIdSlot,
      { name: 'windowStart', kind: 'literal', table: 'orders', op: 'BETWEEN', col: 'placed_at', sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', '').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'daily.order_day').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', '').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'daily.order_day').rule,
    ],
    phrasings: [
      'For city {cityId} over a 30-day window, return order_day, gross_cents, and running_gross_cents.',
      'Accumulate daily revenue into running_gross_cents for city {cityId}.',
    ],
    hint: 'SUM(gross_cents) OVER (ORDER BY order_day) with the default frame is a cumulative total.',
    gateHints: { rowCeiling: 30 },
  }),
  // FULL CODE: moving average on a generate_series DATE SPINE with a RANGE BETWEEN INTERVAL frame.
  rv({
    skill: 'rv-moving-average-frame', family: 'windowed', primaryTable: 'orders',
    sqlShape: `
WITH spine AS (
  SELECT gs::date AS order_day
  FROM generate_series({windowStart}::date, {windowStart}::date + INTERVAL '29 days', INTERVAL '1 day') AS gs
),
daily AS (
  SELECT o.placed_at::date AS order_day, SUM(o.amount_cents) AS gross_cents
  FROM orders o
  WHERE o.city_id = {cityId}
    AND o.placed_at::date BETWEEN {windowStart}::date AND ({windowStart}::date + INTERVAL '29 days')
  GROUP BY o.placed_at::date
)
SELECT
  spine.order_day,
  COALESCE(daily.gross_cents, 0) AS gross_cents,
  AVG(COALESCE(daily.gross_cents, 0)) OVER (
    ORDER BY spine.order_day
    RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW
  ) AS trailing_7day_avg_cents
FROM spine
LEFT JOIN daily ON daily.order_day = spine.order_day`,
    slots: [
      cityIdSlot,
      { name: 'windowStart', kind: 'literal', table: 'orders', op: 'BETWEEN', col: 'placed_at', sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', '').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'spine.order_day').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', '').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'spine.order_day').rule,
    ],
    phrasings: [
      'For city {cityId} over a dense 30-day date spine, return order_day, gross_cents, and a calendar-correct trailing_7day_avg_cents.',
      'Compute a 7-day trailing average over a gap-free date spine for city {cityId}.',
    ],
    hint: "Build the spine with generate_series, LEFT JOIN daily totals, then AVG(...) OVER (ORDER BY order_day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW). emit adds the single ROUND wrap.",
    gateHints: { rowCeiling: 30 },
  }),
  rv({
    skill: 'rv-ntile-bucketing', family: 'windowed', primaryTable: 'orders',
    sqlShape: `
SELECT
  merch.merchant_id,
  merch.avg_order_cents,
  NTILE(4) OVER (ORDER BY merch.avg_order_cents, merch.merchant_id) AS aov_quartile
FROM (
  SELECT o.merchant_id, AVG(o.amount_cents) AS avg_order_cents
  FROM orders o
  WHERE o.city_id = {cityId}
  GROUP BY o.merchant_id
) merch`,
    slots: [
      cityIdSlot,
      tiebreak('partitionCols', 'partitionCols', 'orders', '').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'merch.avg_order_cents').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', '').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'merch.avg_order_cents').rule,
    ],
    phrasings: [
      'For city {cityId}, bucket merchants into quartiles by average order value: merchant_id, avg_order_cents, aov_quartile.',
      'Assign each merchant in city {cityId} an aov_quartile with NTILE(4) over average order value.',
    ],
    hint: 'NTILE(4) OVER (ORDER BY avg_order_cents, merchant_id) splits merchants into four equal-size buckets.',
  }),
];
```

Keep it compiling:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 6: Fill the behavioral + capstone + recursive templates (full code for rv-sessionization and rv-recursive-cte).** Replace `const BEHAVIORAL_TEMPLATES: Template[] = [];` with:

```ts
const BEHAVIORAL_TEMPLATES: Template[] = [
  // FULL CODE: sessionization (gap-and-island) with a 30-minute inactivity gap, scoped to one customer.
  rv({
    skill: 'rv-sessionization', family: 'grouped', primaryTable: 'event_log',
    sqlShape: `
WITH scoped AS (
  SELECT e.customer_id, e.event_ts
  FROM event_log e
  WHERE e.customer_id = {customerId} AND e.city_id = {cityId}
),
flagged AS (
  SELECT
    customer_id,
    event_ts,
    CASE
      WHEN LAG(event_ts) OVER (PARTITION BY customer_id ORDER BY event_ts) IS NULL
        OR event_ts - LAG(event_ts) OVER (PARTITION BY customer_id ORDER BY event_ts) > INTERVAL '30 minutes'
      THEN 1 ELSE 0
    END AS is_new_session
  FROM scoped
),
sessioned AS (
  SELECT
    customer_id,
    event_ts,
    SUM(is_new_session) OVER (PARTITION BY customer_id ORDER BY event_ts) AS session_seq
  FROM flagged
)
SELECT
  customer_id,
  session_seq,
  MIN(event_ts) AS session_start,
  MAX(event_ts) AS session_end,
  COUNT(*) AS event_count
FROM sessioned
GROUP BY customer_id, session_seq`,
    slots: [
      { name: 'customerId', kind: 'literal', table: 'event_log', op: '=', col: 'customer_id' },
      eventCitySlot,
      tiebreak('groupCols', 'groupCols', 'event_log', 'customer_id, session_seq').slot,
    ],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'event_log', 'customer_id, session_seq').rule],
    phrasings: [
      'For customer {customerId} in city {cityId}, split events into sessions (30-minute gap); return customer_id, session_seq, session_start, session_end, event_count.',
      'Sessionize customer {customerId} in city {cityId} using a 30-minute inactivity gap; summarize each session.',
    ],
    hint: "Flag a new session when LAG(event_ts) is NULL or the gap exceeds INTERVAL '30 minutes', then running-SUM the flags to get session_seq, then group.",
    gateHints: { rowCeiling: 100 },
  }),
  rv({
    skill: 'rv-funnel-conversion', family: 'grouped', primaryTable: 'event_log',
    sqlShape: `
SELECT
  e.event_type AS funnel_step,
  COUNT(DISTINCT e.customer_id) AS reached_customers
FROM event_log e
WHERE e.city_id = {cityId}
  AND e.event_type IN ('app_open', 'view_merchant', 'add_to_cart', 'checkout_start', 'order_placed')
GROUP BY e.event_type`,
    slots: [eventCitySlot, tiebreak('groupCols', 'groupCols', 'event_log', 'e.event_type').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'event_log', 'e.event_type').rule],
    phrasings: [
      'For city {cityId}, count reached_customers (distinct) at each funnel_step from app_open to order_placed.',
      'Measure funnel drop-off in city {cityId}: distinct customers per event_type step.',
    ],
    hint: 'COUNT(DISTINCT customer_id) per event_type gives the funnel width at each step.',
  }),
  rv({
    skill: 'rv-retention-cohort', family: 'grouped', primaryTable: 'customers',
    sqlShape: `
SELECT
  date_trunc('month', c.signup_ts)::date AS cohort_month,
  date_trunc('month', o.placed_at)::date AS activity_month,
  COUNT(DISTINCT c.customer_id) AS active_customers
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE c.signup_city_id = {cityId} AND c.is_deleted = false
GROUP BY date_trunc('month', c.signup_ts), date_trunc('month', o.placed_at)`,
    slots: [
      { name: 'cityId', kind: 'literal', table: 'customers', op: '=', col: 'signup_city_id' },
      tiebreak('groupCols', 'groupCols', 'customers', 'cohort_month, activity_month').slot,
    ],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'customers', 'cohort_month, activity_month').rule],
    phrasings: [
      'For signup city {cityId}, return cohort_month, activity_month, and active_customers (distinct) per cohort/activity pair.',
      'Build a retention grid for city {cityId}: signup cohort month vs order activity month.',
    ],
    hint: "date_trunc('month', signup_ts) is the fixed cohort; date_trunc('month', placed_at) is the activity month.",
    gateHints: { rowCeiling: 150 },
  }),
  rv({
    skill: 'rv-lifecycle-latency', family: 'grouped', primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.vehicle_type,
  AVG(c.approved_at - c.applied_at) AS avg_apply_to_approve,
  AVG(c.activated_at - c.approved_at) AS avg_approve_to_active
FROM couriers c
WHERE c.home_city_id = {cityId}
  AND c.approved_at IS NOT NULL AND c.activated_at IS NOT NULL
GROUP BY c.vehicle_type`,
    slots: [courierCitySlot, tiebreak('groupCols', 'groupCols', 'couriers', 'c.vehicle_type').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'couriers', 'c.vehicle_type').rule],
    phrasings: [
      'For city {cityId}, report vehicle_type, avg_apply_to_approve, and avg_approve_to_active over fully-onboarded couriers.',
      'Measure onboarding latency per vehicle_type in city {cityId} using timestamp differences.',
    ],
    hint: 'Subtracting two timestamps yields an INTERVAL; filter NULL stamps first, then AVG per group.',
  }),
  rv({
    skill: 'rv-clean-layer-capstone', family: 'grouped', primaryTable: 'orders',
    sqlShape: `
WITH valid_customers AS (
  SELECT customer_id FROM customers WHERE is_deleted = false
),
deduped_payments AS (
  SELECT DISTINCT ON (order_id) order_id, amount_cents
  FROM payments
  ORDER BY order_id, authorized_at, payment_id
),
canon AS (
  SELECT
    o.order_id,
    o.merchant_id,
    dp.amount_cents,
    CASE WHEN LOWER(TRIM(o.status)) IN ('delivered', 'complete') THEN 'delivered' ELSE LOWER(TRIM(o.status)) END AS clean_status
  FROM orders o
  JOIN valid_customers vc ON vc.customer_id = o.customer_id
  JOIN deduped_payments dp ON dp.order_id = o.order_id
  WHERE o.city_id = {cityId}
)
SELECT
  canon.merchant_id,
  canon.clean_status,
  COUNT(*) AS order_count,
  SUM(canon.amount_cents) AS gross_cents
FROM canon
GROUP BY canon.merchant_id, canon.clean_status`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'orders', 'canon.merchant_id, canon.clean_status').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'canon.merchant_id, canon.clean_status').rule],
    phrasings: [
      'For city {cityId}, stack cleaning CTEs (valid customers, deduped payments, canonical status) then report merchant_id, clean_status, order_count, gross_cents.',
      'Capstone: build a clean layer for city {cityId} with 3 CTEs, then aggregate per merchant and clean_status.',
    ],
    hint: 'Compose the trusted layer as CTEs (valid population + DISTINCT ON payments + canonical status), then run one grouped aggregate over the bounded city slice.',
    gateHints: { rowCeiling: 200 },
  }),
  // FULL CODE: recursive walk of the categories tree from a fixed root; cleans the R17 dangling-parent defect first.
  rv({
    skill: 'rv-recursive-cte', family: 'single-table', primaryTable: 'categories',
    sqlShape: `
WITH RECURSIVE cleaned AS (
  SELECT
    c.category_id,
    c.name,
    CASE
      WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id
      ELSE NULL
    END AS parent_category_id
  FROM categories c
),
tree AS (
  SELECT
    cleaned.category_id,
    cleaned.name,
    1 AS depth,
    cleaned.name AS path
  FROM cleaned
  WHERE cleaned.category_id = (SELECT MIN(category_id) FROM cleaned WHERE parent_category_id IS NULL)
  UNION ALL
  SELECT
    child.category_id,
    child.name,
    parent.depth + 1,
    parent.path || ' > ' || child.name
  FROM cleaned child
  JOIN tree parent ON child.parent_category_id = parent.category_id
)
SELECT category_id, name, depth, path
FROM tree`,
    slots: [tiebreak('sortKey', 'sortKey', 'categories', 'path').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'categories', 'path').rule],
    phrasings: [
      'Walk the category tree from its root: return category_id, name, depth, and the materialized path (parent > child), ordered by path.',
      'Traverse the merchant-category hierarchy from the top-level root; show each category_id, name, depth, and path.',
    ],
    hint: "Clean dangling parents first (NULL out any parent_category_id not present in categories), then WITH RECURSIVE: base = the root (parent IS NULL), step = join children to the frontier and extend path with ' > '. emit orders by path, category_id.",
    gateHints: { rowCeiling: 60, minDistinct: 3 },
  }),
];
```

Keep it compiling:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 7: Run the test GREEN.** All 24 templates, skills, meta, phases, and checkpoints are populated.

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/rove-templates.test.js
```

Expected: all tests pass, e.g. `# pass 8` / `# fail 0`.

- [ ] **Step 8: Commit.**

```bash
cd /c/Dev/Projects/sql-mastery && git checkout -b task-12-rove-templates && git add src/generator/templates/rove/index.ts test/rove-templates.test.ts && git commit -m "$(cat <<'EOF'
Task 12: fill rove advanced templates (24 incl recursive CTE)

Add all 24 rv- templates (cleaning 1-12, applied windows 13-18, behavioral
19-22, clean-layer capstone, recursive categories-tree walk) plus ROVE_SKILLS,
ROVE_CONCEPT_META with teach blocks, ROVE_PHASES (rv-clean/rv-analytic/
rv-behavioral) and ROVE_CHECKPOINTS (cp1..cp4 mid + cp5 capstone). Every
template is a bounded slice: boundedSlice=true, rowCeiling<=200, no ORDER BY /
ROUND in sqlShape. rv-recursive-cte walks categories.parent_category_id after
cleaning the R17 dangling-parent defect, never customers.referred_by_customer_id.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Expected: one commit on branch `task-12-rove-templates` containing the filled registry and its test.

---

### Task 13: Rove phase assembly + freeze + validate

**Files:**
- Create: `src/phases/rove/exercises.generated.ts` (written by the `generate-exercises` CLI in Step 1; a frozen `skill -> Exercise[]` map with baked fingerprints; committed, never hand-edited)
- Modify: `src/phases/rove/index.ts` (fill the T0 stub `export const rovePhases: Phase[] = []` with the real composed `Phase[]`)
- Create: `scripts/snapshots/rove.snapshot.json` (recorded by `validate-exercises` g0 in Step 2)
- Create: `test/rove-phases.test.ts`

**Interfaces:**

Consumes (exact signatures; do NOT redefine these here, import them):
- From `../../generator/templates/rove/index` (authored by T12, per H1/H5):
  - `ROVE_SKILLS: string[]` (24 advanced slugs, `rv-` prefixed)
  - `ROVE_CONCEPT_META: ConceptMeta[]` where `ConceptMeta = { skill: string; order: number; title: string; teach: TeachBlock; phaseId: string }` (24 entries, 1:1 with `ROVE_SKILLS`, each carrying a valid rove `phaseId` and a LOCAL order within that phase)
  - `ROVE_PHASES: PhaseMeta[]` where `PhaseMeta = { id: string; title: string; goal: string; level: Level; order: number }` (3 entries; ids exactly `rv-clean`, `rv-analytic`, `rv-behavioral`; `order` is `1..3` within the band; every `level === 'advanced'`)
  - `ROVE_CHECKPOINTS: CheckpointMeta[]` where `CheckpointMeta = { id: string; phaseId: string; afterOrder: number; drawFromSkills: string[]; title: string }` (5 entries; `cp1..cp4` mid-band, `cp5` capstone in `rv-behavioral` with `drawFromSkills === ROVE_SKILLS`)
- From `../../generator/templates/aperture/index`: `APERTURE_PHASES: PhaseMeta[]` (length 5)
- From `../../generator/templates/sideline/index`: `SIDELINE_PHASES: PhaseMeta[]` (length 3)
- From `./exercises.generated` (emitted by the T6 `generate-exercises` CLI, per H3): `export const generatedExercises: Record<string, Exercise[]>` (each `Exercise` already has a baked `fingerprint`, `rowCeiling <= 200`, and `orderMatters`)
- From `../../generator/types`: types `Phase`, `Concept`, `Checkpoint`, `PhaseMeta`, `CheckpointMeta`, `ConceptMeta`, `Exercise`, `Level`

Produces (later tasks bind to these):
- `export const rovePhases: Phase[]` at `src/phases/rove/index.ts` - consumed by T14 `getPhases()` as the third band of `[...aperturePhases, ...sidelinePhases, ...rovePhases]`. Global `phase.order = APERTURE_PHASES.length + SIDELINE_PHASES.length + PhaseMeta.order` (H4), so the concatenation is already ascending, contiguous, monotonic, unique and T14 does NOT re-number.

---

- [ ] **Step 1: Generate the frozen rove exercises file (CLI, not TDD).**

  `PGPASSWORD` must already be exported in the shell environment; it MUST NOT be written into any file or command literal. The CLI runs `buildExercisesFor('rove')` + `curate` + bakes fingerprints via the validate path, then writes `src/phases/rove/exercises.generated.ts` (H3). Rove bounded slices keep this fast.

  ```bash
  # PGPASSWORD is read from the environment only; never hard-code it.
  cd /c/Dev/Projects/sql-mastery
  npm run generate-exercises -- --db rove
  ```

  Expected: exits 0 and creates `src/phases/rove/exercises.generated.ts`. Confirm the frozen file exports all 24 rove skills, each with >= 1 baked exercise (honest per-skill counts; thin concepts are legitimately small):

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc -p tsconfig.json
  node -e '
    const { generatedExercises } = require("./dist/src/phases/rove/exercises.generated");
    const { ROVE_SKILLS } = require("./dist/src/generator/templates/rove/index");
    const keys = Object.keys(generatedExercises);
    const missing = ROVE_SKILLS.filter((s) => !(generatedExercises[s] && generatedExercises[s].length >= 1));
    if (missing.length) { console.error("MISSING or empty skills:", missing.join(", ")); process.exit(1); }
    const overCeiling = [];
    for (const s of keys) for (const ex of generatedExercises[s]) if (ex.rowCeiling > 200) overCeiling.push(ex.id);
    if (overCeiling.length) { console.error("rowCeiling > 200:", overCeiling.join(", ")); process.exit(1); }
    console.log("rove skills:", keys.length, "total exercises:", keys.reduce((n, s) => n + generatedExercises[s].length, 0));
    for (const s of ROVE_SKILLS) console.log("  " + s + ": " + generatedExercises[s].length);
  '
  ```

  Expected output: `rove skills: 24 total exercises: <N>` followed by 24 per-skill count lines, each `>= 1`, and no `MISSING` / `rowCeiling > 200` errors.

- [ ] **Step 2: Validate 100% against seeded rove + record the snapshot.**

  Runs gates g0..g9 over every generated exercise and every checkpoint-pool item. Non-zero exit on ANY gate failure (CI gate). The g0 pass records `scripts/snapshots/rove.snapshot.json`.

  ```bash
  # PGPASSWORD from environment only.
  cd /c/Dev/Projects/sql-mastery
  npm run validate-exercises -- --db rove
  ```

  Expected: exits 0, prints a per-gate summary ending in `rove: <N>/<N> passed, 0 failures`, and `scripts/snapshots/rove.snapshot.json` now exists. If any exercise fails, STOP and fix the offending T12 template or reseed rove; do not proceed with a partial pass.

- [ ] **Step 3: Write the failing rove-phases test, run it RED.**

  Create `test/rove-phases.test.ts`:

  ```ts
  import { test } from 'node:test';
  import assert from 'node:assert/strict';
  import { rovePhases } from '../src/phases/rove/index';
  import {
    ROVE_SKILLS,
    ROVE_PHASES,
    ROVE_CHECKPOINTS,
  } from '../src/generator/templates/rove/index';
  import { APERTURE_PHASES } from '../src/generator/templates/aperture/index';
  import { SIDELINE_PHASES } from '../src/generator/templates/sideline/index';
  import type { Concept, Exercise } from '../src/generator/types';

  const BAND_OFFSET = APERTURE_PHASES.length + SIDELINE_PHASES.length;
  const allConcepts = (): Concept[] => rovePhases.flatMap((p) => p.concepts);
  const allExercises = (): Exercise[] => allConcepts().flatMap((c) => c.exercises);

  test('rove has exactly the three canonical phases in order', () => {
    assert.equal(rovePhases.length, 3);
    assert.deepEqual(rovePhases.map((p) => p.id), ['rv-clean', 'rv-analytic', 'rv-behavioral']);
    for (const p of rovePhases) {
      assert.equal(p.database, 'rove');
      assert.equal(p.level, 'advanced');
    }
  });

  test('global phase.order = aperture + sideline band offset + local order (H4)', () => {
    assert.equal(BAND_OFFSET, 8); // 5 aperture + 3 sideline
    const byLocal = [...ROVE_PHASES].sort((a, b) => a.order - b.order);
    rovePhases.forEach((p, i) => {
      assert.equal(p.order, BAND_OFFSET + byLocal[i].order);
    });
    // ascending, contiguous, unique across the band
    const orders = rovePhases.map((p) => p.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    assert.equal(new Set(orders).size, orders.length);
  });

  test('rove concepts == ROVE_SKILLS (24), 1:1, contiguous local order per phase', () => {
    const skills = allConcepts().map((c) => c.skill).sort();
    assert.equal(skills.length, 24);
    assert.deepEqual(skills, [...ROVE_SKILLS].sort());
    assert.equal(new Set(skills).size, 24); // no duplicate skill
    for (const p of rovePhases) {
      const local = p.concepts.map((c) => c.order).sort((a, b) => a - b);
      const expected = local.map((_, i) => i + 1);
      assert.deepEqual(local, expected, `phase ${p.id} local concept.order not contiguous 1..n`);
    }
  });

  test('every rove exercise is frozen, bounded, and fingerprinted', () => {
    const ex = allExercises();
    assert.ok(ex.length >= 24, `expected at least one exercise per concept, got ${ex.length}`);
    for (const c of allConcepts()) {
      assert.ok(c.exercises.length >= 1, `concept ${c.skill} has no exercises`);
    }
    for (const e of ex) {
      assert.ok(e.rowCeiling <= 200, `exercise ${e.id} rowCeiling ${e.rowCeiling} > 200`);
      assert.equal(typeof e.orderMatters, 'boolean');
      assert.ok(e.fingerprint && Array.isArray(e.fingerprint.columns) && e.fingerprint.columns.length >= 1,
        `exercise ${e.id} missing baked fingerprint`);
    }
  });

  test('checkpoints cp1..cp4 mid-band + cp5 capstone drawing all rove skills', () => {
    const cps = rovePhases.flatMap((p) => p.checkpoints);
    const ids = cps.map((c) => c.id).sort();
    assert.deepEqual(ids, ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']);
    // capstone lives in rv-behavioral and draws the whole band
    const behavioral = rovePhases.find((p) => p.id === 'rv-behavioral');
    assert.ok(behavioral, 'rv-behavioral phase missing');
    const cp5 = behavioral!.checkpoints.find((c) => c.id === 'cp5');
    assert.ok(cp5, 'cp5 capstone not in rv-behavioral');
    assert.deepEqual([...cp5!.drawFromSkills].sort(), [...ROVE_SKILLS].sort());
    // every checkpoint afterOrder references a valid local concept boundary in its phase
    for (const p of rovePhases) {
      const maxLocal = Math.max(0, ...p.concepts.map((c) => c.order));
      for (const cp of p.checkpoints) {
        assert.ok(cp.afterOrder >= 1 && cp.afterOrder <= maxLocal,
          `checkpoint ${cp.id} afterOrder ${cp.afterOrder} outside 1..${maxLocal} in ${p.id}`);
      }
    }
  });
  ```

  Compile and run only this test:

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc -p tsconfig.json && node --test dist/test/rove-phases.test.js
  ```

  Expected RED: `rovePhases` is still the empty T0 stub `[]`, so the first test fails with `Expected values to be strictly equal: 0 !== 3` and the remaining tests fail on empty concepts/checkpoints.

- [ ] **Step 4: Implement the rove phase assembly, run it GREEN.**

  Replace the entire contents of `src/phases/rove/index.ts` (the T0 stub) with the derived assembly (H2, H4). Extensionless CommonJS imports, ASCII only, no runtime randomness or dates:

  ```ts
  import type {
    Phase,
    Concept,
    Checkpoint,
    PhaseMeta,
    ConceptMeta,
    CheckpointMeta,
  } from '../../generator/types';
  import {
    ROVE_PHASES,
    ROVE_CONCEPT_META,
    ROVE_CHECKPOINTS,
  } from '../../generator/templates/rove/index';
  import { APERTURE_PHASES } from '../../generator/templates/aperture/index';
  import { SIDELINE_PHASES } from '../../generator/templates/sideline/index';
  import { generatedExercises } from './exercises.generated';

  // Global phase.order offset for the rove band (H4): aperture then sideline.
  const BAND_OFFSET = APERTURE_PHASES.length + SIDELINE_PHASES.length;

  function conceptsForPhase(phaseId: string): Concept[] {
    return ROVE_CONCEPT_META
      .filter((cm: ConceptMeta) => cm.phaseId === phaseId)
      .sort((a, b) => a.order - b.order)
      .map((cm: ConceptMeta): Concept => ({
        id: `concept-${cm.skill}`,
        order: cm.order,            // LOCAL order within the phase; T14 flatten adds the global offset
        skill: cm.skill,
        title: cm.title,
        teach: cm.teach,
        exercises: generatedExercises[cm.skill] ?? [],
        phaseId,
      }));
  }

  function checkpointsForPhase(phaseId: string): Checkpoint[] {
    return ROVE_CHECKPOINTS
      .filter((cp: CheckpointMeta) => cp.phaseId === phaseId)
      .sort((a, b) => a.afterOrder - b.afterOrder)
      .map((cp: CheckpointMeta): Checkpoint => ({
        id: cp.id,
        afterOrder: cp.afterOrder, // LOCAL boundary; phaseId dropped per H2
        drawFromSkills: cp.drawFromSkills,
        title: cp.title,
      }));
  }

  export const rovePhases: Phase[] = [...ROVE_PHASES]
    .sort((a, b) => a.order - b.order)
    .map((pm: PhaseMeta): Phase => ({
      id: pm.id,
      order: BAND_OFFSET + pm.order,
      title: pm.title,
      goal: pm.goal,
      level: pm.level,
      database: 'rove',
      concepts: conceptsForPhase(pm.id),
      checkpoints: checkpointsForPhase(pm.id),
    }));
  ```

  Recompile and run GREEN:

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc -p tsconfig.json && node --test dist/test/rove-phases.test.js
  ```

  Expected: all 5 tests pass (`# pass 5`, `# fail 0`).

- [ ] **Step 5: Full typecheck + full server suite green (no regression).**

  ```bash
  cd /c/Dev/Projects/sql-mastery
  npx tsc --noEmit -p tsconfig.json && node --test dist/test/*.test.js
  ```

  Expected: 0 type errors and `# fail 0` across the whole `dist/test` suite (the new `rove-phases` tests plus all existing tests, including `rove-generate`, still pass).

- [ ] **Step 6: Commit the frozen rove module.**

  Stage exactly the assembly output, the frozen generated exercises, the recorded snapshot, and the test. Verify the snapshot JSON contains no password material before committing.

  ```bash
  cd /c/Dev/Projects/sql-mastery
  grep -ri "password\|pgpassword" scripts/snapshots/rove.snapshot.json && echo "ABORT: secret in snapshot" || true
  git add src/phases/rove/index.ts src/phases/rove/exercises.generated.ts scripts/snapshots/rove.snapshot.json test/rove-phases.test.ts
  git commit -m "$(cat <<'EOF'
feat: assemble + freeze + validate rove advanced phases

Compose rovePhases from ROVE_PHASES + ROVE_CONCEPT_META + ROVE_CHECKPOINTS
(phaseIds rv-clean/rv-analytic/rv-behavioral) over the frozen, fingerprinted
exercises.generated.ts. Global phase.order = APERTURE_PHASES.length +
SIDELINE_PHASES.length + PhaseMeta.order. 24 concepts == ROVE_SKILLS, every
exercise rowCeiling <= 200, cp1..cp4 mid-band + cp5 capstone over all rove
skills. Validated 100% against seeded rove; snapshot recorded.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
  ```

  Expected: the `grep` prints nothing (no secret) and the commit succeeds with the four files staged.

---

### Task 14: Level-structure wiring: banded phases + capstones + graduation

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\learning-path.ts` (replace the whole file: union the three banded phase modules, stamp level+database through flatten and getLearningPath, add per-band + whole-track `graduationStatus`)
- Create: `C:\Dev\Projects\sql-mastery\test\learning-path.test.ts` (union/contiguity/level+database picking, capstone locking, graduation)
- Modify: `C:\Dev\Projects\sql-mastery\test\foundations-content.test.ts` (its assertions hard-code the retired chinook 2-phase shape; re-point them at the new banded shape so the suite stays green)

**Interfaces:**

Consumes (exact, already produced by earlier tasks):
- `aperturePhases: Phase[]` from `./phases/aperture` (stub T0, filled T8)
- `sidelinePhases: Phase[]` from `./phases/sideline` (stub T0, filled T11)
- `rovePhases: Phase[]` from `./phases/rove` (stub T0, filled T13)
- Types from `./generator/types`: `Level` (`'beginner' | 'intermediate' | 'advanced'`), `Phase` (`{ id; order; title; goal; level: Level; database; concepts: Concept[]; checkpoints: Checkpoint[] }`), `Concept`, `Checkpoint`
- Phase-model facts (resolutions H4/H5): each band's `Phase[]` already carries globally-contiguous `order` (aperture `1..k`, sideline `k+1..m`, rove `m+1..n`); the LAST phase of each band carries that band's boundary capstone (`cpE` in `ap-join`, `cpI` in `sideline-windows`, `cp5` in `rv-behavioral`). Do NOT re-number.

Produces (later tasks / consumers rely on these EXACT names):
- `export function getPhases(): Phase[]` -> `[...aperturePhases, ...sidelinePhases, ...rovePhases]` defensively sorted ascending by `order` (concatenation is already ascending; the sort never mutates numbers)
- `export function flattenLearningPath(phases: Phase[])` -> `{ skills, concepts, checkpoints, exercises }` with `level` + `database` stamped on every concept, skill, and checkpoint
- `export function getLearningPath()` -> `{ dataset, phases, skills, concepts, checkpoints, exercises }`; each `phase` object now ALSO carries `level` and `database` (previously dropped)
- `export interface GraduationState { skillCorrect: Record<string, string[]>; checkpointsPassed: string[] }`
- `export function graduationStatus(track: ReturnType<typeof getLearningPath>, state: GraduationState, level?: Level): { strongSkills: number; totalSkills: number; checkpointsPassed: string[]; graduated: boolean }` -> whole-track when `level` omitted; scoped to one band when given

Steps:

- [ ] **Step 1: Write the failing wiring + locking test.** Create `C:\Dev\Projects\sql-mastery\test\learning-path.test.ts`. It asserts (a) the phase union is contiguous `1..N` with no gaps/dupes, (b) every phase carries a real `level` and `database`, and (c) fresh state locks the first intermediate and first advanced concept while passing the beginner capstone unlocks the first intermediate concept. This is RED now because today's `getPhases()` returns the old single-band chinook phases (no `level`, no intermediate/advanced concepts).

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhases, getLearningPath } from '../src/learning-path';
import type { Level } from '../src/generator/types';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const DBS = ['aperture', 'sideline', 'rove'];

// Mirror of the client conceptUnlocked gating (client owns the real one; here we assert the DATA
// that drives it): a concept is gated by the highest-afterOrder checkpoint strictly before it.
function gatingCheckpoint(track: ReturnType<typeof getLearningPath>, order: number) {
  return track.checkpoints
    .filter((cp: any) => cp.afterOrder < order)
    .sort((a: any, b: any) => b.afterOrder - a.afterOrder)[0];
}
function unlocked(track: ReturnType<typeof getLearningPath>, passed: Set<string>, order: number): boolean {
  const g = gatingCheckpoint(track, order);
  return !g || passed.has(g.id);
}
function firstConceptOfLevel(track: ReturnType<typeof getLearningPath>, level: Level) {
  return [...track.concepts]
    .filter((c: any) => c.level === level)
    .sort((a: any, b: any) => a.order - b.order)[0];
}

test('getPhases unions the three bands with contiguous 1..N order, no gaps or dupes', () => {
  const phases = getPhases();
  const orders = phases.map((p) => p.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.deepEqual(orders, orders.map((_, i) => i + 1), 'orders are contiguous 1..N with no gaps');
  assert.ok(phases.length >= 3, 'at least one phase per band');
});

test('every phase carries a real level and an owned database', () => {
  for (const p of getPhases()) {
    assert.ok(LEVELS.includes(p.level), `${p.id} has a level (${p.level})`);
    assert.ok(DBS.includes(p.database), `${p.id} has an owned database (${p.database})`);
  }
});

test('getLearningPath picks level+database onto phases (previously dropped)', () => {
  const lp = getLearningPath();
  for (const p of lp.phases as any[]) {
    assert.ok(LEVELS.includes(p.level), `phase ${p.id} carries level`);
    assert.ok(DBS.includes(p.database), `phase ${p.id} carries database`);
  }
  assert.ok(lp.concepts.every((c: any) => LEVELS.includes(c.level)), 'concepts carry level');
  assert.ok(lp.skills.every((s: any) => LEVELS.includes(s.level)), 'skills carry level');
});

test('fresh state locks intermediate/advanced; beginner capstone unlocks first intermediate concept', () => {
  const lp = getLearningPath();
  const firstIntermediate = firstConceptOfLevel(lp, 'intermediate');
  const firstAdvanced = firstConceptOfLevel(lp, 'advanced');
  assert.ok(firstIntermediate, 'there is a first intermediate concept');
  assert.ok(firstAdvanced, 'there is a first advanced concept');

  const fresh = new Set<string>();
  assert.equal(unlocked(lp, fresh, firstIntermediate.order), false, 'intermediate is locked when fresh');
  assert.equal(unlocked(lp, fresh, firstAdvanced.order), false, 'advanced is locked when fresh');

  const beginnerCapstone = gatingCheckpoint(lp, firstIntermediate.order);
  assert.ok(beginnerCapstone, 'a beginner boundary capstone gates the first intermediate concept');

  const afterBeginner = new Set<string>([beginnerCapstone.id]);
  assert.equal(unlocked(lp, afterBeginner, firstIntermediate.order), true, 'passing the beginner capstone unlocks intermediate');
  assert.equal(unlocked(lp, afterBeginner, firstAdvanced.order), false, 'advanced stays locked after only the beginner capstone');
});
```

- [ ] **Step 2: Run it RED.** From the repo root:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/learning-path.test.js
```

Expected failure: the "every phase carries a real level" and "fresh state locks intermediate/advanced" tests fail. Today `getPhases()` returns `[foundationsPhase, joinsPhase]` (database `'chinook'`, no `level` field, no intermediate/advanced concepts), so `p.level` is `undefined` (assertion fails) and `firstConceptOfLevel(lp, 'intermediate')` is `undefined` -> `assert.ok(firstIntermediate,...)` throws. Sample: `AssertionError [ERR_ASSERTION]: there is a first intermediate concept`.

- [ ] **Step 3: Rewrite `src/learning-path.ts` to union the bands and stamp level+database.** Replace the ENTIRE file `C:\Dev\Projects\sql-mastery\src\learning-path.ts` with:

```ts
import { aperturePhases } from './phases/aperture';
import { sidelinePhases } from './phases/sideline';
import { rovePhases } from './phases/rove';
import type { Level, Phase } from './generator/types';

// Strong = STRONG_THRESHOLD passes of a skill (mirrors client/src/lib/foundations.ts STRONG_THRESHOLD).
const STRONG_THRESHOLD = 3;

// Minimal server-side view of the learner state graduationStatus needs.
export interface GraduationState {
  skillCorrect: Record<string, string[]>;
  checkpointsPassed: string[];
}

// Union of the three banded phase arrays, pre-sorted ascending by GLOBAL order.
// Bands already carry globally-contiguous phase.order (aperture 1..k, sideline offset,
// rove offset per resolutions H4), so this concatenation is already ascending; the sort is
// a defensive guarantee of the phase.order invariant and never re-numbers anything.
function getPhases(): Phase[] {
  return [...aperturePhases, ...sidelinePhases, ...rovePhases].sort((a, b) => a.order - b.order);
}

// Flatten phases into the generic track the engine consumes. Concepts get global order + phaseId,
// and now level + database stamped through from their owning phase (else they are silently dropped
// and downstream scaffold/grading cannot tell which band/DB a concept belongs to).
function flattenLearningPath(phases: Phase[]) {
  const concepts: any[] = [];
  const checkpoints: any[] = [];
  let offset = 0;
  for (const phase of [...phases].sort((a, b) => a.order - b.order)) {
    phase.concepts.forEach((c) =>
      concepts.push({ ...c, order: c.order + offset, phaseId: phase.id, level: phase.level, database: phase.database })
    );
    phase.checkpoints.forEach((cp) =>
      checkpoints.push({ ...cp, afterOrder: cp.afterOrder + offset, phaseId: phase.id, level: phase.level, database: phase.database })
    );
    offset += phase.concepts.length;
  }
  const skills = concepts.map((c) => ({
    skill: c.skill, conceptId: c.id, title: c.title, order: c.order,
    phaseId: c.phaseId, level: c.level, database: c.database
  }));
  const exercises = concepts.flatMap((c) => c.exercises);
  return { skills, concepts, checkpoints, exercises };
}

function getLearningPath() {
  // Preserve level + database on the phase objects (older code dropped them here).
  const phases: Phase[] = getPhases().map((p) => ({
    id: p.id, order: p.order, title: p.title, goal: p.goal,
    level: p.level, database: p.database, concepts: p.concepts, checkpoints: p.checkpoints
  }));
  const flat = flattenLearningPath(phases);
  return {
    dataset: 'three-band',
    phases: phases.map((p, i) => {
      // stamp each phase's concepts/checkpoints with their global order for the UI
      const before = phases.slice(0, i).reduce((sum, q) => sum + q.concepts.length, 0);
      return {
        id: p.id, order: p.order, title: p.title, goal: p.goal, level: p.level, database: p.database,
        concepts: p.concepts.map((c: any) => ({ ...c, order: c.order + before, phaseId: p.id, level: p.level, database: p.database })),
        checkpoints: p.checkpoints.map((cp: any) => ({ ...cp, afterOrder: cp.afterOrder + before, phaseId: p.id, level: p.level, database: p.database }))
      };
    }),
    ...flat
  };
}

// Per-band (when level given) or whole-track (when omitted) graduation.
// A band graduates iff EVERY skill in that band is strong AND every checkpoint in that band passed.
function graduationStatus(
  track: ReturnType<typeof getLearningPath>,
  state: GraduationState,
  level?: Level
): { strongSkills: number; totalSkills: number; checkpointsPassed: string[]; graduated: boolean } {
  const skills = (track.skills as any[]).filter((s) => !level || s.level === level);
  const checkpoints = (track.checkpoints as any[]).filter((cp) => !level || cp.level === level);
  const correctCount = (skill: string) => (state.skillCorrect[skill] || []).length;
  const strongSkills = skills.filter((s) => correctCount(s.skill) >= STRONG_THRESHOLD).length;
  const totalSkills = skills.length;
  const passedInScope = checkpoints.filter((cp) => state.checkpointsPassed.includes(cp.id)).map((cp) => cp.id);
  const allCheckpoints = checkpoints.every((cp) => state.checkpointsPassed.includes(cp.id));
  return {
    strongSkills,
    totalSkills,
    checkpointsPassed: passedInScope,
    graduated: totalSkills > 0 && strongSkills === totalSkills && allCheckpoints
  };
}

export { getLearningPath, flattenLearningPath, getPhases, graduationStatus };
```

- [ ] **Step 4: Run the wiring + locking test GREEN.**

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/learning-path.test.js
```

Expected: all four tests pass (`# pass 4`, `# fail 0`). If the locking test fails with "advanced stays locked after only the beginner capstone" returning unlocked, the band capstones are mis-placed upstream (T8/T11/T13); do NOT patch it here, that is an assembly bug.

- [ ] **Step 5: Append the failing graduationStatus test.** Add these tests to the END of `C:\Dev\Projects\sql-mastery\test\learning-path.test.ts` (and add `graduationStatus`, `GraduationState` to the existing import line at the top of the file):

Change the import line at the top from:

```ts
import { getPhases, getLearningPath } from '../src/learning-path';
```

to:

```ts
import { getPhases, getLearningPath, graduationStatus } from '../src/learning-path';
import type { GraduationState } from '../src/learning-path';
```

Then append:

```ts
function fullyStrongState(track: ReturnType<typeof getLearningPath>): GraduationState {
  const skillCorrect: Record<string, string[]> = {};
  for (const s of track.skills as any[]) skillCorrect[s.skill] = ['a', 'b', 'c']; // >= STRONG_THRESHOLD
  const checkpointsPassed = (track.checkpoints as any[]).map((cp) => cp.id);
  return { skillCorrect, checkpointsPassed };
}

test('graduationStatus: fresh state graduates neither a band nor the whole track', () => {
  const lp = getLearningPath();
  const fresh: GraduationState = { skillCorrect: {}, checkpointsPassed: [] };
  assert.equal(graduationStatus(lp, fresh, 'beginner').graduated, false);
  assert.equal(graduationStatus(lp, fresh, 'intermediate').graduated, false);
  assert.equal(graduationStatus(lp, fresh, 'advanced').graduated, false);
  assert.equal(graduationStatus(lp, fresh).graduated, false, 'whole track not graduated');
  assert.equal(graduationStatus(lp, fresh, 'beginner').strongSkills, 0);
});

test('graduationStatus: per-band totals are scoped to that band only', () => {
  const lp = getLearningPath();
  const fresh: GraduationState = { skillCorrect: {}, checkpointsPassed: [] };
  const beginner = graduationStatus(lp, fresh, 'beginner');
  const whole = graduationStatus(lp, fresh);
  assert.ok(beginner.totalSkills > 0, 'beginner band has skills');
  assert.ok(beginner.totalSkills < whole.totalSkills, 'a band is a strict subset of the whole track');
  const sumBands =
    graduationStatus(lp, fresh, 'beginner').totalSkills +
    graduationStatus(lp, fresh, 'intermediate').totalSkills +
    graduationStatus(lp, fresh, 'advanced').totalSkills;
  assert.equal(sumBands, whole.totalSkills, 'the three bands partition the whole-track skill set');
});

test('graduationStatus: a fully-strong state graduates every band and the whole track', () => {
  const lp = getLearningPath();
  const state = fullyStrongState(lp);
  for (const level of LEVELS) {
    const g = graduationStatus(lp, state, level);
    assert.equal(g.graduated, true, `${level} graduated`);
    assert.equal(g.strongSkills, g.totalSkills, `${level} all skills strong`);
  }
  assert.equal(graduationStatus(lp, state).graduated, true, 'whole track graduated');
});
```

- [ ] **Step 6: Run it RED.**

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/learning-path.test.js
```

Expected failure: a TypeScript compile error, since Step 3 already exported `graduationStatus`/`GraduationState`... so this compiles. If Step 3 was completed, the RED here is instead an ASSERTION failure ONLY if `graduationStatus` were missing. Because Step 3 shipped it, confirm the compile succeeds and the three new tests PASS. If instead you are executing Step 5 against a tree where Step 3 was not yet applied, the expected error is `error TS2305: Module '"../src/learning-path"' has no exported member 'graduationStatus'`. (`graduationStatus` was authored in Step 3 alongside the union rewrite, so the ordinary path is green here.)

- [ ] **Step 7: Confirm GREEN.** All seven tests in the file pass:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/learning-path.test.js
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 8: Re-point the retired chinook content test at the new banded shape.** The legacy `test/foundations-content.test.ts` hard-codes the old 2-phase chinook shape (`dataset === 'chinook'`, exactly `['foundations','joins']`, 14 concepts, `cpD.afterOrder === 14`) and will now fail. Replace the ENTIRE file `C:\Dev\Projects\sql-mastery\test\foundations-content.test.ts` with the banded-shape version (keeps the still-valid "every exercise is checkable" and "checkpoints reference real skills" coverage; the weeks/sessions and full curriculum reassembly are T17's concern):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getLearningPath } from '../src/learning-path';

const LEVELS = ['beginner', 'intermediate', 'advanced'];

test('learning path is a multi-band, multi-phase path', () => {
  const learningPath = getLearningPath();
  assert.ok(learningPath, 'learningPath present');
  assert.equal(learningPath.dataset, 'three-band');
  assert.ok(learningPath.phases.length >= 3, 'at least one phase per band');
  const levels = new Set((learningPath.phases as any[]).map((p) => p.level));
  for (const level of LEVELS) assert.ok(levels.has(level), `has a ${level} phase`);
});

test('flattened concepts have globally increasing unique order, a phaseId, and a level', () => {
  const learningPath = getLearningPath();
  const orders = learningPath.concepts.map((c: any) => c.order);
  assert.deepEqual(orders, [...orders].sort((a: number, b: number) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.ok(learningPath.concepts.every((c: any) => c.phaseId), 'every concept has a phaseId');
  assert.ok(learningPath.concepts.every((c: any) => LEVELS.includes(c.level)), 'every concept has a level');
});

test('every learning-path exercise is checkable', () => {
  const learningPath = getLearningPath();
  for (const exercise of learningPath.exercises) {
    assert.ok(exercise.database, `${exercise.id} has a database`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((s: string) => s.trim()).length, 1, `${exercise.id} is one statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill`);
  }
});

test('checkpoints reference real skills in the flattened track', () => {
  const learningPath = getLearningPath();
  const skills = new Set(learningPath.skills.map((s: any) => s.skill));
  for (const cp of learningPath.checkpoints) {
    for (const skill of cp.drawFromSkills) assert.ok(skills.has(skill), `${cp.id} -> known skill ${skill}`);
  }
});
```

- [ ] **Step 9: Full server test suite + typecheck GREEN.** Confirm nothing else regressed on the learning-path shape change:

```bash
cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/*.test.js
```

Expected: `# fail 0` across the suite. If `test/curriculum-service.test.ts` fails on weeks/sessions, that is T17's owned change, not this task; do NOT edit curriculum-service or its test here. Any failure that mentions `dataset === 'chinook'`, `['foundations','joins']`, or `cpD.afterOrder` means an old assertion survived Step 8; fix that file only.

- [ ] **Step 10: Commit.**

```bash
cd /c/Dev/Projects/sql-mastery && git add src/learning-path.ts test/learning-path.test.ts test/foundations-content.test.ts && git commit -m "$(cat <<'EOF'
T14: wire banded phases into learning-path (level+database, capstones, graduation)

- getPhases() unions [aperture, sideline, rove], defensively sorted ascending;
  bands already carry globally-contiguous phase.order so no re-numbering.
- flattenLearningPath + getLearningPath now stamp level+database onto phases,
  concepts, skills, and checkpoints (previously dropped).
- Add graduationStatus(track, state, level?) for per-band graduation and keep
  the whole-track form (level omitted).
- Tests: phase.order contiguity 1..N (no gaps/dupes), level+database picking,
  fresh state locks intermediate/advanced while the beginner capstone unlocks
  the first intermediate concept, and per-band + whole-track graduation.
- Re-point the retired chinook content test at the new banded shape.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Scaffold tapering: levelBaseTier + scaffoldTier(ctx) + clamp

**Files:**
- Modify: `client/src/lib/foundations.ts` (add `Level`, `TIER_RANK`, `levelBaseTier`, `ScaffoldCtx`; extend `scaffoldTier` with an optional 4th `ctx` param)
- Modify: `client/src/lib/foundations.test.ts` (add the tapering + clamp `describe` block)

**Interfaces:**

Consumes (already present in `client/src/lib/foundations.ts`, do NOT redefine):
```ts
export type ScaffoldTier = 'full' | 'half' | 'blank';
export function isSkillStrong(state: LearningState, skill: string): boolean;
export function scaffoldTier(state: LearningState, skill: string, isReview: boolean): ScaffoldTier; // today's 3-arg form, being widened
export function loadFoundations(): LearningState; // fresh state after localStorage.clear()
// test-file module-scope helper: function strong(state, skill, ids: string[]): void  (calls recordCorrect per id)
```
Consumes type (from `client/src/types`): `LearningState` (8 fields incl. `reviewsPassed: Record<string, number>`).

Produces (later tasks T18 UI + any caller rely on these EXACT names/types from `client/src/lib/foundations`):
```ts
export type Level = 'beginner' | 'intermediate' | 'advanced';
export const TIER_RANK: Record<ScaffoldTier, number>; // { full: 2, half: 1, blank: 0 }
export function levelBaseTier(level: Level): ScaffoldTier; // beginner->full, intermediate->half, advanced->blank
export interface ScaffoldCtx { level: Level; priorBandCapstonePassed: boolean; firstExposure: boolean; }
export function scaffoldTier(state: LearningState, skill: string, isReview: boolean, ctx?: ScaffoldCtx): ScaffoldTier;
```

Notes carried into every code block below:
- ASCII only (plain hyphen `-`, two-char arrow `->`). No en/em dashes or unicode arrows.
- No `Math.random` / `Date.now` / argless `new Date` (none needed here; the logic is pure).
- This is CLIENT code (React + Vite + Vitest). Its test is co-located at `client/src/lib/foundations.test.ts` and runs under Vitest, NOT under the server `node --test` harness. Do NOT move it to top-level `test/`.
- Omitting `ctx` MUST reproduce today's exact behavior so `FoundationsRep` and all existing 3-arg callers are untouched.

Composition rule this task implements (the deterministic clamp):
- `floor = ctx.priorBandCapstonePassed ? levelBaseTier(ctx.level) : 'full'` (reduced help is EARNED; without the prior-band capstone it degrades to `'full'`).
- `ctx.firstExposure` -> return one step MORE help than `floor` (raise `TIER_RANK`, clamp at `'full'`).
- otherwise -> follow today's review fade but never show MORE help than `floor` allows (`lessHelpful(fade, floor)`), so the band floor never fights the `full -> half -> blank` review progression.
- Hard invariant (unit-tested): a mastered beginner review never shows more help than a fresh advanced first attempt.

---

- [ ] **Step 1: Write the failing test.** Append a new `describe` block to `client/src/lib/foundations.test.ts` and widen the import to pull the not-yet-existing symbols. First widen the existing named-import block.

Edit the import in `client/src/lib/foundations.test.ts` from:
```ts
  scaffoldTier, recordReviewPass,
  isConceptUnlocked, frontierConcept, frontierOrder, recordConceptProgress, resetConcept,
  tileState, conceptPracticeTarget
} from './foundations';
import type { Track, LearningState } from '../types';
```
to:
```ts
  scaffoldTier, recordReviewPass, levelBaseTier, TIER_RANK,
  isConceptUnlocked, frontierConcept, frontierOrder, recordConceptProgress, resetConcept,
  tileState, conceptPracticeTarget
} from './foundations';
import type { Level, ScaffoldCtx } from './foundations';
import type { Track, LearningState } from '../types';
```

Then append this block at the end of the file (after the final closing `});` of the existing top-level `describe`). It reuses the module-scope `strong(state, skill, ids)` helper and `loadFoundations()`:
```ts
describe('scaffold tapering (ctx) and the deterministic clamp', () => {
  beforeEach(() => localStorage.clear());

  it('levelBaseTier maps each band to its help floor', () => {
    expect(levelBaseTier('beginner')).toBe('full');
    expect(levelBaseTier('intermediate')).toBe('half');
    expect(levelBaseTier('advanced')).toBe('blank');
  });

  it('TIER_RANK orders help full > half > blank', () => {
    expect(TIER_RANK.full).toBe(2);
    expect(TIER_RANK.half).toBe(1);
    expect(TIER_RANK.blank).toBe(0);
  });

  it('omitting ctx reproduces todays exact behavior', () => {
    const s = loadFoundations();
    expect(scaffoldTier(s, 'where', false)).toBe('full');       // new lesson
    strong(s, 'where', ['w1', 'w2', 'w3']);                     // count 3 -> strong
    expect(scaffoldTier(s, 'where', true)).toBe('half');        // first mastered review
    recordReviewPass(s, 'where');
    expect(scaffoldTier(s, 'where', true)).toBe('blank');       // later review
  });

  it('reduced floor applies only once the prior-band capstone is passed, else degrades to full', () => {
    const s = loadFoundations();
    const notEarned: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: false, firstExposure: true };
    expect(scaffoldTier(s, 'rv-x', false, notEarned)).toBe('full'); // floor degrades to full, bump clamps at full
    const earned: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'rv-x', false, earned)).toBe('half');    // bump one step above the blank floor
  });

  it('first non-review sighting bumps one step MORE help than the floor', () => {
    const s = loadFoundations();
    const inter: ScaffoldCtx = { level: 'intermediate', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'sl-x', false, inter)).toBe('full');     // bump(half) -> full
    const beg: ScaffoldCtx = { level: 'beginner', priorBandCapstonePassed: true, firstExposure: true };
    expect(scaffoldTier(s, 'ap-x', false, beg)).toBe('full');       // bump(full) clamps at full
  });

  it('advanced reviews taper down to the band floor (blank)', () => {
    const s = loadFoundations();
    strong(s, 'rv-y', ['a', 'b', 'c']);                            // strong
    const advReview: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: false };
    // review fade would give 'half' (passes 0), but the blank floor clamps help down to 'blank'
    expect(scaffoldTier(s, 'rv-y', true, advReview)).toBe('blank');
  });

  it('a mastered beginner review never shows more help than a fresh advanced first attempt', () => {
    const beg = loadFoundations();
    strong(beg, 'ap-z', ['a', 'b', 'c']);                          // mastered beginner skill
    const begCtx: ScaffoldCtx = { level: 'beginner', priorBandCapstonePassed: true, firstExposure: false };
    const begReview = scaffoldTier(beg, 'ap-z', true, begCtx);     // worst case: fade 'half', floor 'full' -> 'half'

    const adv = loadFoundations();
    const advCtx: ScaffoldCtx = { level: 'advanced', priorBandCapstonePassed: true, firstExposure: true };
    const advFirst = scaffoldTier(adv, 'rv-new', false, advCtx);   // bump('blank') -> 'half'

    // help(beginner review) <= help(advanced first attempt)
    expect(TIER_RANK[begReview]).toBeLessThanOrEqual(TIER_RANK[advFirst]);
  });
});
```

- [ ] **Step 2: Run the test, watch it fail RED.** From the repo root:
```bash
cd C:/Dev/Projects/sql-mastery/client && npx vitest run src/lib/foundations.test.ts
```
Expected failure: Vitest fails the file at transform/collection time because `levelBaseTier`, `TIER_RANK`, `Level`, and `ScaffoldCtx` are not exported by `./foundations`, e.g. `SyntaxError: The requested module './foundations' does not provide an export named 'levelBaseTier'` (or a TS "no exported member 'ScaffoldCtx'"). The new `describe` block does not run. This confirms the test is wired to the not-yet-written code.

- [ ] **Step 3: Implement the minimal code.** Edit `client/src/lib/foundations.ts`. Replace the existing `ScaffoldTier` type + `scaffoldTier` function block (lines that today read exactly as below):
```ts
export type ScaffoldTier = 'full' | 'half' | 'blank';

// How much starter to show for a step. Beginners and still-learning skills always get the
// full fill-in-the-blank scaffold. Only a review of an already-mastered (strong) skill fades:
// its first mastered review reveals half the blanks, later ones go blank. Tracks
// reviewsPassed so the fade progresses across repeated reviews.
export function scaffoldTier(state: LearningState, skill: string, isReview: boolean): ScaffoldTier {
  if (!isReview || !isSkillStrong(state, skill)) return 'full';
  const passes = state.reviewsPassed[skill] || 0;
  return passes === 0 ? 'half' : 'blank';
}
```
with:
```ts
export type ScaffoldTier = 'full' | 'half' | 'blank';

// Level band. beginner -> most help, advanced -> least help.
export type Level = 'beginner' | 'intermediate' | 'advanced';

// Numeric help-rank for the deterministic clamp. full = MOST help, blank = LEAST help.
export const TIER_RANK: Record<ScaffoldTier, number> = { full: 2, half: 1, blank: 0 };

// Inverse of TIER_RANK; index by rank (0..2) to recover a tier after a bump/clamp.
const RANK_TIER: ScaffoldTier[] = ['blank', 'half', 'full'];

// Band floor: the baseline scaffold each level starts from before earning reductions.
export function levelBaseTier(level: Level): ScaffoldTier {
  if (level === 'beginner') return 'full';
  if (level === 'intermediate') return 'half';
  return 'blank';
}

// Optional tapering context. Omitting it reproduces today's exact behavior (FoundationsRep passes none).
export interface ScaffoldCtx {
  level: Level;                     // band of the concept being practiced
  priorBandCapstonePassed: boolean; // reduced help is EARNED; false -> floor degrades to 'full'
  firstExposure: boolean;           // first non-review sighting of a not-strong skill
}

// Return whichever tier gives LESS help (lower rank). Used to clamp the fade to the band floor.
function lessHelpful(a: ScaffoldTier, b: ScaffoldTier): ScaffoldTier {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

// One step toward MORE help, clamped at 'full'.
function bumpHelp(tier: ScaffoldTier): ScaffoldTier {
  return RANK_TIER[Math.min(TIER_RANK.full, TIER_RANK[tier] + 1)];
}

// Today's fade, unchanged: non-review OR not-strong -> full; a strong review fades full->half->blank
// as reviewsPassed grows.
function reviewFade(state: LearningState, skill: string, isReview: boolean): ScaffoldTier {
  if (!isReview || !isSkillStrong(state, skill)) return 'full';
  const passes = state.reviewsPassed[skill] || 0;
  return passes === 0 ? 'half' : 'blank';
}

// How much starter to show for a step. With no ctx: identical to today's behavior. With ctx: apply
// the band floor (earned only when the prior-band capstone passed), bump the first non-review sighting
// of a not-strong skill one step toward more help, and otherwise clamp the review fade so it never
// shows MORE help than the floor. Unit-tested so a mastered beginner review never out-helps a fresh
// advanced first attempt.
export function scaffoldTier(state: LearningState, skill: string, isReview: boolean, ctx?: ScaffoldCtx): ScaffoldTier {
  const fade = reviewFade(state, skill, isReview);
  if (!ctx) return fade;
  const floor = ctx.priorBandCapstonePassed ? levelBaseTier(ctx.level) : 'full';
  if (ctx.firstExposure) return bumpHelp(floor);
  return lessHelpful(fade, floor);
}
```

- [ ] **Step 4: Run the test, watch it pass GREEN.** From the repo root:
```bash
cd C:/Dev/Projects/sql-mastery/client && npx vitest run src/lib/foundations.test.ts
```
Expected: all tests in the file pass, including the pre-existing `scaffoldTier keeps the full scaffold for beginners and fades only mastered reviews` (proves the 3-arg path is byte-for-byte unchanged) and the new `scaffold tapering (ctx) and the deterministic clamp` block. Then confirm the whole client suite and types still compile:
```bash
cd C:/Dev/Projects/sql-mastery/client && npx vitest run && npx tsc --noEmit -p tsconfig.json
```
Expected: full suite passes and `tsc --noEmit` reports zero errors.

- [ ] **Step 5: Commit.**
```bash
cd C:/Dev/Projects/sql-mastery && git add client/src/lib/foundations.ts client/src/lib/foundations.test.ts && git commit -m "$(cat <<'EOF'
T15: scaffold tapering - levelBaseTier + scaffoldTier(ctx) + earned-floor clamp

Add Level, TIER_RANK, levelBaseTier, and ScaffoldCtx. Widen scaffoldTier with an
optional ctx: reduced help is earned via the prior-band capstone, first exposure
bumps one step more help than the floor, and the review fade is clamped so the band
floor never shows more help than allowed. Omitting ctx is unchanged behavior.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: db-config swap + retire old content modules

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\db-config.ts`
- Modify: `C:\Dev\Projects\sql-mastery\test\db-config.test.ts`
- Modify: `C:\Dev\Projects\sql-mastery\.env.example`
- Modify: `C:\Dev\Projects\sql-mastery\src\learning-path.ts`
- Modify: `C:\Dev\Projects\sql-mastery\src\curriculum-service.ts`
- Modify: `C:\Dev\Projects\sql-mastery\test\curriculum-service.test.ts`
- Modify: `C:\Dev\Projects\sql-mastery\package.json`
- Delete: `C:\Dev\Projects\sql-mastery\src\phases\foundations.ts`
- Delete: `C:\Dev\Projects\sql-mastery\src\phases\joins.ts`
- Delete: `C:\Dev\Projects\sql-mastery\src\academy-expansion.ts`
- Delete: `C:\Dev\Projects\sql-mastery\src\interview-expansion.ts`
- Delete: `C:\Dev\Projects\sql-mastery\scripts\extract-lessons.ts`
- Delete: `C:\Dev\Projects\sql-mastery\scripts\verify-lesson-sql.ts`
- Delete: `C:\Dev\Projects\sql-mastery\test\foundations-content.test.ts`
- Delete: every file under `C:\Dev\Projects\sql-mastery\content\` (all `*.html`)

**Interfaces:**
- Consumes: `aperturePhases: Phase[]` from `src/phases/aperture` (stubbed by Task 0, populated by Task 8); `sidelinePhases: Phase[]` from `src/phases/sideline` (Task 0 / Task 11); `rovePhases: Phase[]` from `src/phases/rove` (Task 0 / Task 13); `getLearningPath()` from `src/learning-path` (its own module, unchanged export surface).
- Produces: `DEFAULT_DATABASES = Object.freeze(['aperture', 'sideline', 'rove'])` re-exported from `src/db-config` (consumed by `getDatabaseNames`, `isAllowedDatabase`); `getPhases(): any[]` now returning `[...aperturePhases, ...sidelinePhases, ...rovePhases]`; `buildCurriculum(_options?): { learningPath }` minimal compiling stub (Task 17 rebuilds the full `{ product, learningPath, stats }` body). No later task may import `foundationsPhase`, `joinsPhase`, `getAcademyExpansionExercises`, `getInterviewExpansionExercises`, or `adaptStackOverflowIdentifiers` after this task.

Note on ordering: this task runs after Task 0 (which created the `src/phases/aperture|sideline|rove/index.ts` stubs) and Tasks 8/11/13 (which populated them), so the three phase registries exist and export real `Phase[]` values. Do all source edits first, then delete files, then clean-build, so the tree only breaks transiently. Every step is grep-guarded: if a prior task already applied part of a change, its edit shrinks to a no-op rather than failing.

---

- [ ] **Step 1: Reconnaissance grep before touching anything.** Enumerate every remaining reference to the retired symbols so nothing is missed.

```bash
cd C:/Dev/Projects/sql-mastery
grep -rn --include='*.ts' -E 'foundationsPhase|joinsPhase|getAcademyExpansionExercises|getInterviewExpansionExercises|adaptStackOverflowIdentifiers|academy-expansion|interview-expansion|getSchemaOrientationExercises' src scripts test
```

Expected against the baseline tree: hits in `src/learning-path.ts` (foundationsPhase/joinsPhase), `src/curriculum-service.ts` (both expansion getters + adaptStackOverflowIdentifiers + getSchemaOrientationExercises), `src/academy-expansion.ts`, `src/interview-expansion.ts` (self-definitions). Record this list; every non-`docs` hit must be gone by Step 12. If `src/learning-path.ts` shows no `foundationsPhase`/`joinsPhase` (Task 14 already rewired it), skip the edit in Step 4 and only confirm.

- [ ] **Step 2: Write the failing db-config test (RED).** Replace the first test in `test/db-config.test.ts` (lines 12-19) to expect the three owned databases.

```ts
test('defaults to the three owned curriculum databases', () => {
  assert.deepEqual(DEFAULT_DATABASES, [
    'aperture',
    'sideline',
    'rove'
  ]);

  assert.deepEqual(getDatabaseNames({}), DEFAULT_DATABASES);
});
```

- [ ] **Step 3: Run it RED, then swap the default and go GREEN.** First confirm the failure:

```bash
cd C:/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/db-config.test.js
```

Expected failure: the assertion in `defaults to the three owned curriculum databases` reports `Expected values to be strictly deep-equal:` with actual `[ 'chinook', 'stackoverflow' ]` versus expected `[ 'aperture', 'sideline', 'rove' ]`.

Now make the minimal change in `src/db-config.ts` (lines 1-4):

```ts
const DEFAULT_DATABASES = Object.freeze([
  'aperture',
  'sideline',
  'rove'
]);
```

Re-run the same command; the file now compiles and all seven `db-config` tests pass. Commit:

```bash
cd C:/Dev/Projects/sql-mastery
git add src/db-config.ts test/db-config.test.ts
git commit -m "$(printf 'Default databases -> aperture, sideline, rove\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

- [ ] **Step 4: Point the .env template and learning-path at the owned datasets.** Edit `.env.example` lines 16-17 to:

```bash
SQL_MASTERY_DATABASES=aperture,sideline,rove
# Optional lesson-name -> physical-DB aliases (comma-separated name=physical pairs).
# The three owned datasets use their real database names, so leave this empty.
SQL_MASTERY_DATABASE_ALIASES=
```

Then rewire `src/learning-path.ts`. Replace the two retired imports (lines 1-2) and the `getPhases` body (lines 6-8). Leave the rest of the file (`flattenLearningPath`, `getLearningPath`, exports) untouched. If Step 1 showed no `foundationsPhase`/`joinsPhase` here, this edit is already done and you only confirm.

Replace lines 1-2:

```ts
import { aperturePhases } from './phases/aperture';
import { sidelinePhases } from './phases/sideline';
import { rovePhases } from './phases/rove';
```

Replace the `getPhases` function (lines 6-8):

```ts
function getPhases(): any[] {
  return [...aperturePhases, ...sidelinePhases, ...rovePhases];
}
```

- [ ] **Step 5: Strip curriculum-service down to a compiling stub.** The HTML workbook parser, the StackOverflow identifier adapter, the schema-orientation exercises, the expansion packs, and the week/session scheduler are all retired. Do NOT design the final return shape here (Task 17 owns `{ product, learningPath, stats }`); only remove the dependence on the deleted inputs so the tree compiles. Overwrite the entire contents of `src/curriculum-service.ts` with:

```ts
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
```

- [ ] **Step 6: Replace the HTML-bound curriculum test.** The entire baseline `test/curriculum-service.test.ts` asserts week/session counts, `>= 500` parsed exercises, and StackOverflow adaptation against content that no longer exists. Task 17 will re-expand this file to assert the new `stats` shape; for now overwrite its whole contents with a minimal test that only exercises the surviving `learningPath` key:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurriculum } from '../src/curriculum-service';

test('buildCurriculum exposes a learning path (three-band body lands in Task 17)', () => {
  const curriculum = buildCurriculum();
  assert.ok(curriculum.learningPath, 'learningPath present');
  assert.ok(Array.isArray(curriculum.learningPath.phases), 'phases is an array');
});
```

- [ ] **Step 7: Retire the extract-lessons build wiring in package.json.** The `build` script must no longer compile-and-run the deleted `dist/scripts/extract-lessons.js`, and the standalone `extract-lessons` script is removed. Edit the `scripts` block of `package.json` so lines 12-13 become just the build line without the extract step:

Delete this line entirely:

```json
    "extract-lessons": "tsc -p tsconfig.json && node dist/scripts/extract-lessons.js",
```

And change the `build` line to:

```json
    "build": "tsc -p tsconfig.json && npm --prefix client run build",
```

- [ ] **Step 8: Delete the retired source, script, test, and content files.** All of these are now unreferenced (Steps 4-7 removed the last importers). Use `git rm` so the removals are staged:

```bash
cd C:/Dev/Projects/sql-mastery
git rm -f \
  src/phases/foundations.ts \
  src/phases/joins.ts \
  src/academy-expansion.ts \
  src/interview-expansion.ts \
  scripts/extract-lessons.ts \
  scripts/verify-lesson-sql.ts \
  test/foundations-content.test.ts
git rm -f content/*.html
```

- [ ] **Step 9: Purge the stale dist/ output so old compiled tests do not run.** `node --test dist/test/*.test.js` globs compiled tests; a leftover `dist/test/foundations-content.test.js` (and other stale artifacts) would still execute and fail. Wipe dist before the verification build:

```bash
cd C:/Dev/Projects/sql-mastery
rm -rf dist
```

- [ ] **Step 10: Confirm no dangling references remain (the task's acceptance signal).** Re-run the reconnaissance grep, scoped to live code only:

```bash
cd C:/Dev/Projects/sql-mastery
grep -rn --include='*.ts' -E 'foundationsPhase|joinsPhase|getAcademyExpansionExercises|getInterviewExpansionExercises|adaptStackOverflowIdentifiers|academy-expansion|interview-expansion|getSchemaOrientationExercises' src scripts test
```

Expected output: no matches (empty). Matches under `docs/` are historical plan text and are acceptable; any hit under `src`, `scripts`, or `test` is a real dangling reference that must be resolved before continuing.

- [ ] **Step 11: Clean build + full server test suite GREEN.** Compile the whole project and run every compiled server test:

```bash
cd C:/Dev/Projects/sql-mastery
npx tsc -p tsconfig.json && node --test dist/test/*.test.js
```

Expected: `tsc` exits 0 with no "Cannot find module './phases/foundations'" / "'./academy-expansion'" errors, and `node --test` reports `pass` for all suites including `dist/test/db-config.test.js` (three owned databases) and `dist/test/curriculum-service.test.js` (learningPath present), with `0` failures. `app.test.js` still passes because its curriculum test injects a mock `buildCurriculum`.

- [ ] **Step 12: Commit the retirement.** Stage the remaining edits and commit:

```bash
cd C:/Dev/Projects/sql-mastery
git add .env.example src/learning-path.ts src/curriculum-service.ts test/curriculum-service.test.ts package.json
git commit -m "$(printf 'Retire HTML academy modules and content; wire learning-path to owned datasets\n\nDrop foundations/joins phases, academy/interview expansion packs, content HTML\nand its parser, and the extract-lessons/verify-lesson-sql scripts. getPhases now\nreads aperture/sideline/rove registries; buildCurriculum is a compiling stub for\nTask 17.\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 17: curriculum-service reassembly (drop weeks/sessions)

**Files:**
- Modify: `C:\Dev\Projects\sql-mastery\src\curriculum-service.ts` (full rewrite; drop the HTML-academy parser, weeks, and sessions)
- Modify: `C:\Dev\Projects\sql-mastery\src\app.ts` (single call site: `buildCurriculum()` now takes zero args)
- Modify: `C:\Dev\Projects\sql-mastery\test\curriculum-service.test.ts` (full rewrite; replace the weeks/sessions assertions with the banded shape)

**Interfaces:**

Consumes (exact signatures from the contract; do NOT re-implement):
- `getLearningPath()` from `./learning-path` (Task 14 owns it). Returns an object with these stable keys used here:
  - `phases: Array<{ id: string; order: number; title: string; goal: string; level: 'beginner'|'intermediate'|'advanced'; database: string; concepts: any[]; checkpoints: any[] }>`
  - `concepts: any[]` (flattened, globally-ordered)
  - `checkpoints: any[]` (flattened)
  - `exercises: any[]` (flattened from every concept)
- `Level` type from `./generator/types` is `'beginner' | 'intermediate' | 'advanced'` (used only for local typing of the band table).

Produces (later consumers -- `src/app.ts` `/api/curriculum` and the client -- rely on these EXACT names):
```ts
export function buildCurriculum(): {
  product: {
    name: string;
    promise: string;
    cadence: string;
    bands: Array<{
      level: 'beginner' | 'intermediate' | 'advanced';
      database: string;
      title: string;
      story: string;
      phaseCount: number;
      conceptCount: number;
    }>;
  };
  learningPath: unknown;              // exactly getLearningPath() output; top-level key PRESERVED
  stats: {
    totalPhases: number;
    totalConcepts: number;
    totalExercises: number;
    totalCheckpoints: number;
  };
  // NO weeks. NO sessions. NO exercises top-level key. NO totalWeeks/totalSessions.
};
```

Constraints copied into this task: ASCII only (hyphen `-` and two-char arrow `->`; no en/em dashes or unicode arrows). No `Math.random`, `Date.now`, or argless `new Date` (this file has none and adds none). CommonJS, extensionless relative imports (no `.js` suffix). Server test lives at top-level `test/curriculum-service.test.ts`, compiles to `dist/test/curriculum-service.test.js`. `buildCurriculum` reads only in-memory data from `getLearningPath()`, so this task needs NO Postgres and NO `PGPASSWORD`.

---

- [ ] **Step 1: Replace the test file with the banded-shape assertions (red).**

  Overwrite `C:\Dev\Projects\sql-mastery\test\curriculum-service.test.ts` entirely. The old file asserted `curriculum.weeks.length === 36`, `curriculum.sessions.length === 144`, and parsed chinook/stackoverflow HTML content -- all retired. The new file asserts the banded shape and that `stats` mirrors the `learningPath` counts.

  ```ts
  import test from 'node:test';
  import assert from 'node:assert/strict';

  import { buildCurriculum } from '../src/curriculum-service';

  test('buildCurriculum drops weeks and sessions entirely', () => {
    const curriculum = buildCurriculum() as any;

    assert.equal('weeks' in curriculum, false);
    assert.equal('sessions' in curriculum, false);
    assert.equal('totalWeeks' in curriculum.stats, false);
    assert.equal('totalSessions' in curriculum.stats, false);
  });

  test('buildCurriculum preserves the top-level learningPath field', () => {
    const curriculum = buildCurriculum() as any;

    assert.ok(curriculum.learningPath, 'learningPath key must be present');
    assert.ok(Array.isArray(curriculum.learningPath.phases));
    assert.ok(Array.isArray(curriculum.learningPath.concepts));
    assert.ok(Array.isArray(curriculum.learningPath.checkpoints));
    assert.ok(Array.isArray(curriculum.learningPath.exercises));
  });

  test('buildCurriculum stats reflect the banded learning-path counts', () => {
    const curriculum = buildCurriculum() as any;
    const lp = curriculum.learningPath;

    assert.equal(curriculum.stats.totalPhases, lp.phases.length);
    assert.equal(curriculum.stats.totalConcepts, lp.concepts.length);
    assert.equal(curriculum.stats.totalExercises, lp.exercises.length);
    assert.equal(curriculum.stats.totalCheckpoints, lp.checkpoints.length);

    assert.ok(curriculum.stats.totalPhases >= 1, 'expected at least one phase');
    assert.equal(typeof curriculum.stats.totalConcepts, 'number');
    assert.equal(typeof curriculum.stats.totalExercises, 'number');
    assert.equal(typeof curriculum.stats.totalCheckpoints, 'number');
  });

  test('buildCurriculum product copy tells the three-band story with honest per-band totals', () => {
    const curriculum = buildCurriculum() as any;
    const product = curriculum.product;

    assert.equal(typeof product.name, 'string');
    assert.equal(typeof product.promise, 'string');
    assert.ok(Array.isArray(product.bands));
    assert.equal(product.bands.length, 3);

    const byLevel = new Map(product.bands.map((b: any) => [b.level, b]));
    assert.deepEqual(
      product.bands.map((b: any) => b.level),
      ['beginner', 'intermediate', 'advanced']
    );
    assert.equal(byLevel.get('beginner').database, 'aperture');
    assert.equal(byLevel.get('intermediate').database, 'sideline');
    assert.equal(byLevel.get('advanced').database, 'rove');

    // Per-band concept counts must sum to the flattened total (honest, no double count).
    const bandConceptSum = product.bands.reduce(
      (sum: number, b: any) => sum + b.conceptCount,
      0
    );
    assert.equal(bandConceptSum, curriculum.stats.totalConcepts);

    const bandPhaseSum = product.bands.reduce(
      (sum: number, b: any) => sum + b.phaseCount,
      0
    );
    assert.equal(bandPhaseSum, curriculum.stats.totalPhases);
  });
  ```

- [ ] **Step 2: Compile and run the test to confirm it fails red.**

  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/curriculum-service.test.js
  ```

  Expected failure: the OLD `buildCurriculum` still returns `weeks`, `sessions`, and a `stats` block without `totalPhases`. So `'weeks' in curriculum` is `true` (first test fails `assert.equal(..., false)`), and `curriculum.stats.totalPhases` is `undefined`, failing `assert.equal(undefined, lp.phases.length)`. Also `curriculum.product.bands` is `undefined`, so `Array.isArray(product.bands)` fails. Node reports `# fail 4` (or a TypeScript compile error if the old signature still takes `options` -- either way the run is red). Do not proceed until you see failures pointing at these assertions.

- [ ] **Step 3: Rewrite `src/curriculum-service.ts` to the banded shape (minimal green).**

  Overwrite `C:\Dev\Projects\sql-mastery\src\curriculum-service.ts` entirely. Delete every HTML-parsing helper, the `MODULES` / `WEEK_THEMES` / `SESSION_COUNTS` tables, `buildWeeks`, `buildSessions`, and the `getAcademyExpansionExercises` / `getInterviewExpansionExercises` imports. The file now depends only on `getLearningPath`.

  ```ts
  import { getLearningPath } from './learning-path';
  import type { Level } from './generator/types';

  // Static three-band narrative. Databases are fixed per level by the contract:
  // beginner -> aperture, intermediate -> sideline, advanced -> rove. Honest
  // per-band counts (phaseCount / conceptCount) are computed from getLearningPath()
  // so the copy can never drift from the real curriculum.
  const BAND_COPY: Array<{ level: Level; database: string; title: string; story: string }> = [
    {
      level: 'beginner',
      database: 'aperture',
      title: 'Beginner - Aperture',
      story:
        'Start from zero on a real product database. Read tables, filter with WHERE, ' +
        'sort and page results, aggregate with GROUP BY and HAVING, and write your first JOIN.'
    },
    {
      level: 'intermediate',
      database: 'sideline',
      title: 'Intermediate - Sideline',
      story:
        'Combine tables the way analysts do: inner, left, anti, and self joins; scalar, ' +
        'IN, and correlated subqueries; CTEs; set operations; date logic; and window functions.'
    },
    {
      level: 'advanced',
      database: 'rove',
      title: 'Advanced - Rove',
      story:
        'Work like an analytics engineer on dirty operational data: profile and normalize text, ' +
        'dedupe, resolve timezones, and build ranking, cohort, sessionization, and recursive patterns.'
    }
  ];

  function buildCurriculum() {
    // The full three-band learning path flattened into the generic track the client
    // engine consumes, plus the grouped `phases`. This is the single source of truth
    // for every count below.
    const learningPath = getLearningPath();
    const phases = (learningPath.phases || []) as Array<{
      level: Level;
      database: string;
      concepts: unknown[];
    }>;

    const bands = BAND_COPY.map((band) => {
      const bandPhases = phases.filter((phase) => phase.level === band.level);
      const conceptCount = bandPhases.reduce(
        (sum, phase) => sum + (phase.concepts ? phase.concepts.length : 0),
        0
      );
      return {
        level: band.level,
        database: band.database,
        title: band.title,
        story: band.story,
        phaseCount: bandPhases.length,
        conceptCount
      };
    });

    return {
      product: {
        name: 'SQL Mastery',
        promise:
          'Go from absolute beginner to senior-level SQL across three real PostgreSQL ' +
          'databases: Aperture, Sideline, and Rove.',
        cadence: 'Concept -> practice -> checkpoint, with scaffolding that fades as you graduate each band.',
        bands
      },
      learningPath,
      stats: {
        totalPhases: (learningPath.phases || []).length,
        totalConcepts: (learningPath.concepts || []).length,
        totalExercises: (learningPath.exercises || []).length,
        totalCheckpoints: (learningPath.checkpoints || []).length
      }
    };
  }

  export {
    buildCurriculum
  };
  ```

- [ ] **Step 4: Update the single `src/app.ts` call site to the zero-arg signature.**

  The old `buildCurriculum` accepted `{ rootDir }`; the new one takes no arguments. Fix the one call so the server compiles under strict TS (`Expected 0 arguments, but got 1` otherwise).

  In `C:\Dev\Projects\sql-mastery\src\app.ts`, change the handler body:

  ```ts
  // before:
  //   response.json(curriculumService.buildCurriculum({ rootDir: contentDir }));
  response.json(curriculumService.buildCurriculum());
  ```

  Leave the surrounding `try/catch` and the `curriculumService = options.curriculumService || { buildCurriculum }` injection untouched. `contentDir` may now be unused here; if strict `noUnusedLocals` flags it, remove only the now-dead `contentDir` local in this file -- do not touch other routes.

- [ ] **Step 5: Compile and run the test to confirm green.**

  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/curriculum-service.test.js
  ```

  Expected: `# pass 4`, `# fail 0`. If `tsc` errors that `getAcademyExpansionExercises` / `getInterviewExpansionExercises` / `fs` / `path` are declared-but-unused, confirm the rewrite in Step 3 removed those imports (the new file imports only `getLearningPath` and the `Level` type).

- [ ] **Step 6: Run the full server test suite to confirm no cross-file regression.**

  The `app.test.ts` `/api/curriculum` test injects its OWN mock `curriculumService.buildCurriculum` (it does not call the real one), so it stays green independently. Confirm nothing else broke:

  ```bash
  cd /c/Dev/Projects/sql-mastery && npx tsc -p tsconfig.json && node --test dist/test/*.test.js
  ```

  Expected: the whole suite passes (`# fail 0`). If `dist/test/app.test.js` fails, it is because a stale build lingered -- rerun the command; the `tsc` step rebuilds it. Do not modify `app.test.ts` in this task.

- [ ] **Step 7: Commit.**

  ```bash
  cd /c/Dev/Projects/sql-mastery && git add src/curriculum-service.ts src/app.ts test/curriculum-service.test.ts && git commit -m "Task 17: reassemble curriculum-service around getLearningPath, drop weeks/sessions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 18: Level-aware UI + serve-time snapshot assertion + release gate

Group the foundations tile map into three band sections (Beginner/Aperture, Intermediate/Sideline, Advanced/Rove) with a locked overlay until the prior band capstone passes, dataset badges, and a subtle current-tier label; make the client pick one of the three pre-generated `starterSql` tiers with no server round-trip. Add a serve-time snapshot-identity assertion (the same `computeSnapshotHash` gate `g0` uses) at server startup, and wire `npm run validate-exercises` into a `release-gate` script.

**Files:**
- Create: `C:\Dev\Projects\sql-mastery\client\src\lib\bands.ts`
- Create: `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\BandSection.tsx`
- Create: `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\bands.css`
- Create: `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\BandSection.test.tsx`
- Create: `C:\Dev\Projects\sql-mastery\src\snapshot-guard.ts`
- Create: `C:\Dev\Projects\sql-mastery\test\snapshot-guard.test.ts`
- Modify: `C:\Dev\Projects\sql-mastery\client\src\types.ts` (Phase gains `level`/`database`; `Exercise.starterSql` accepts the three-tier object)
- Modify: `C:\Dev\Projects\sql-mastery\client\src\lib\sqlScaffold.ts` (add `pickStarter`, object-safe `starterSqlForExercise`)
- Modify: `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\FoundationsRep.tsx` (seed from `pickStarter`, no round-trip)
- Modify: `C:\Dev\Projects\sql-mastery\client\src\routes\Foundations.tsx` (render band sections)
- Modify: `C:\Dev\Projects\sql-mastery\server.ts` (serve-time snapshot assertion before `listen`)
- Modify: `C:\Dev\Projects\sql-mastery\package.json` (add `release-gate` script)

**Interfaces:**

Consumes (exact signatures from prior tasks; do NOT re-implement):
- `computeSnapshotHash(database: string): Promise<string>` from `src/snapshot` (T6). This is the SAME function gate `g0SnapshotIdentity` uses; the serve-time guard MUST import it, not re-hash.
- `getDatabaseNames(env?: NodeJS.ProcessEnv): string[]` from `src/db-config` (returns `['aperture','sideline','rove']` after T16).
- `levelBaseTier(level: Level): ScaffoldTier` and the exported type `ScaffoldTier = 'full' | 'half' | 'blank'` from `client/src/lib/foundations` (T2/T15).
- `phaseGraduation(phase: Phase, state: LearningState): { strong: number; total: number; checkpointsDone: boolean; complete: boolean }` from `client/src/lib/learning-path`.
- `tileState`, `skillLevel`, `skillMastery`, `graduationStatus`, `buildTodaySession`, `weakSpots`, `resetConcept` from `client/src/lib/foundations` (unchanged signatures).
- `starterSqlForExercise`, `revealHalfScaffold`, `scaffoldSql`, `formatSql` from `client/src/lib/sqlScaffold`.
- Client types `Phase`, `Concept`, `Checkpoint`, `Track`, `LearningState`, `Exercise` from `client/src/types`.
- Contract `StarterSql` shape `{ full: string; half: string; blank: string }` (server bakes it onto `exercise.starterSql`).

Produces (later tasks / the app rely on these exact names):
- `src/snapshot-guard.ts`: `assertServedSnapshotsMatch(deps: SnapshotGuardDeps): Promise<void>`, `readRecordedSnapshot(database: string): string`, `recordedSnapshotPath(database: string): string`, interface `SnapshotGuardDeps { databases: string[]; computeHash: (database: string) => Promise<string>; readRecorded: (database: string) => string }`.
- `client/src/lib/bands.ts`: `BandLevel`, `BAND_ORDER`, `BAND_META`, `BandMeta`, `BandGroup`, `phaseBand`, `bandCapstoneId`, `bandCapstonePassed`, `bandGroups`, `bandTierLabel`.
- `client/src/routes/foundations/BandSection.tsx`: `BandSection` component.
- `client/src/lib/sqlScaffold.ts`: `pickStarter(exercise, tier): string`, `StarterTier`.
- `package.json`: `release-gate` npm script.

Steps:

- [ ] **Step 1: Write the failing band test (locked/unlocked).** This is the mandated client test: the Intermediate band is locked while the Beginner capstone is unpassed, and unlocked after. Create `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\BandSection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { bandGroups } from '../../lib/bands';
import { BandSection } from './BandSection';
import type { Phase, Track, LearningState } from '../../types';

const beginnerPhase = {
  id: 'ap-join', order: 5, title: 'Joins', goal: 'Combine two tables.',
  level: 'beginner', database: 'aperture',
  concepts: [{ id: 'apc1', order: 1, skill: 'ap-join-intro', title: 'Join intro', exercises: [] }],
  checkpoints: [{ id: 'cpE', afterOrder: 1, title: 'Aperture capstone', drawFromSkills: [] }]
} as unknown as Phase;

const intermediatePhase = {
  id: 'sideline-joins', order: 6, title: 'Joins in depth', goal: 'Inner and outer joins.',
  level: 'intermediate', database: 'sideline',
  concepts: [{ id: 'slc1', order: 1, skill: 'sl-join-inner', title: 'Inner join', exercises: [] }],
  checkpoints: []
} as unknown as Phase;

const phases = [beginnerPhase, intermediatePhase];

const track = {
  phases,
  skills: [],
  concepts: [...beginnerPhase.concepts, ...intermediatePhase.concepts],
  checkpoints: [...beginnerPhase.checkpoints],
  exercises: []
} as unknown as Track;

function makeState(checkpointsPassed: string[]): LearningState {
  return {
    skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {},
    checkpointsPassed, sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0
  };
}

function renderBand(state: LearningState) {
  const group = bandGroups(phases, state).find((g) => g.meta.level === 'intermediate')!;
  render(
    <MemoryRouter>
      <BandSection group={group} track={track} state={state} onReset={() => {}} />
    </MemoryRouter>
  );
  return group;
}

describe('BandSection band gating', () => {
  it('the intermediate band is locked while the beginner capstone is unpassed', () => {
    const group = renderBand(makeState([]));
    expect(group.locked).toBe(true);
    expect(screen.getByText(/unlock Intermediate/i)).toBeInTheDocument();
    expect(screen.queryByText('Inner join')).toBeNull();
  });

  it('the intermediate band unlocks after the beginner capstone passes', () => {
    const group = renderBand(makeState(['cpE']));
    expect(group.locked).toBe(false);
    expect(screen.getByText('Inner join')).toBeInTheDocument();
    expect(screen.queryByText(/unlock Intermediate/i)).toBeNull();
  });
});
```

Run it and confirm RED (imports do not resolve yet):

```bash
npm --prefix client test -- BandSection
```

Expected failure: Vitest reports `Failed to resolve import "../../lib/bands"` (and `./BandSection`), so both test cases error out.

- [ ] **Step 2: Extend the client domain types.** The server now sends `level`/`database` on each `Phase` (T14/T17) and a three-tier `starterSql` object on each `Exercise` (contract section 2). Edit `C:\Dev\Projects\sql-mastery\client\src\types.ts`.

Change the `Exercise.starterSql` field:

```ts
  expectedSql?: string;
  starterSql?: string | { full: string; half: string; blank: string };
  solutionNote?: string;
```

Add `level` and `database` to `Phase`:

```ts
export interface Phase {
  id: string;
  order: number;
  title: string;
  goal?: string;
  level?: string;
  database?: string;
  concepts: Concept[];
  checkpoints: Checkpoint[];
}
```

- [ ] **Step 3: Create the band-grouping helper.** Create `C:\Dev\Projects\sql-mastery\client\src\lib\bands.ts`. Pure logic: split phases into bands, compute `locked` from the prior band's capstone checkpoint, and derive the subtle tier label from `levelBaseTier`.

```ts
import { phaseGraduation } from './learning-path';
import { levelBaseTier } from './foundations';
import type { ScaffoldTier } from './foundations';
import type { LearningState, Phase } from '../types';

export type BandLevel = 'beginner' | 'intermediate' | 'advanced';

// Bands render top-to-bottom in this order; each band's lock depends on the one before it.
export const BAND_ORDER: BandLevel[] = ['beginner', 'intermediate', 'advanced'];

export interface BandMeta {
  level: BandLevel;
  title: string;
  badge: string;   // dataset badge text
  dataset: string; // 'aperture' | 'sideline' | 'rove'
  blurb: string;
}

export const BAND_META: Record<BandLevel, BandMeta> = {
  beginner: { level: 'beginner', title: 'Beginner', badge: 'Aperture', dataset: 'aperture', blurb: 'Single-table foundations on the Aperture catalog.' },
  intermediate: { level: 'intermediate', title: 'Intermediate', badge: 'Sideline', dataset: 'sideline', blurb: 'Joins, subqueries, and windows on the Sideline league data.' },
  advanced: { level: 'advanced', title: 'Advanced', badge: 'Rove', dataset: 'rove', blurb: 'Real-world cleanup and analytics on the Rove trip data.' }
};

const TIER_LABEL: Record<ScaffoldTier, string> = {
  full: 'Scaffold: fill in the blanks',
  half: 'Scaffold: half blanked',
  blank: 'Scaffold: write it from memory'
};

// The band a phase belongs to. Server phases carry `level`; fall back to `database` so a mixed
// or older payload never crashes the map.
export function phaseBand(phase: Phase): BandLevel {
  const level = (phase as { level?: string }).level;
  if (level === 'beginner' || level === 'intermediate' || level === 'advanced') return level;
  const database = (phase as { database?: string }).database;
  if (database === 'sideline') return 'intermediate';
  if (database === 'rove') return 'advanced';
  return 'beginner';
}

// The capstone checkpoint of a band = the checkpoint with the highest afterOrder across the
// band's phases (cpE / cpI / cp5). Undefined when the band declares no checkpoints.
export function bandCapstoneId(phases: Phase[]): string | undefined {
  const checkpoints = phases.flatMap((p) => p.checkpoints);
  if (!checkpoints.length) return undefined;
  return [...checkpoints].sort((a, b) => b.afterOrder - a.afterOrder)[0].id;
}

export function bandCapstonePassed(phases: Phase[], state: LearningState): boolean {
  const id = bandCapstoneId(phases);
  return id === undefined ? true : state.checkpointsPassed.includes(id);
}

export interface BandGroup {
  meta: BandMeta;
  phases: Phase[];  // this band's phases, ascending by order
  locked: boolean;  // a prior band's capstone has not been passed yet
  strong: number;
  total: number;
  complete: boolean;
}

// Group the flat phase list into the three bands. A band is locked until EVERY earlier band's
// capstone checkpoint has been passed; the beginner band is never locked.
export function bandGroups(phases: Phase[], state: LearningState): BandGroup[] {
  const byLevel: Record<BandLevel, Phase[]> = { beginner: [], intermediate: [], advanced: [] };
  for (const phase of phases) byLevel[phaseBand(phase)].push(phase);
  for (const level of BAND_ORDER) byLevel[level].sort((a, b) => a.order - b.order);

  const out: BandGroup[] = [];
  let priorPassed = true; // nothing precedes the beginner band
  for (const level of BAND_ORDER) {
    const bandPhases = byLevel[level];
    const rollup = bandPhases.reduce(
      (acc, phase) => {
        const pg = phaseGraduation(phase, state);
        return { strong: acc.strong + pg.strong, total: acc.total + pg.total, complete: acc.complete && pg.complete };
      },
      { strong: 0, total: 0, complete: true }
    );
    out.push({
      meta: BAND_META[level],
      phases: bandPhases,
      locked: !priorPassed,
      strong: rollup.strong,
      total: rollup.total,
      complete: bandPhases.length > 0 && rollup.complete
    });
    priorPassed = priorPassed && bandCapstonePassed(bandPhases, state);
  }
  return out;
}

// The subtle current-tier label for an UNLOCKED band. An unlocked intermediate/advanced band
// means the prior capstone was passed, so the band's earned base tier applies.
export function bandTierLabel(group: BandGroup): string {
  const tier = levelBaseTier(group.meta.level as Parameters<typeof levelBaseTier>[0]);
  return TIER_LABEL[tier];
}
```

- [ ] **Step 4: Create the BandSection component and its stylesheet, then run the test GREEN.** Create `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\BandSection.tsx`:

```tsx
import type { LearningState, Track, Concept, Checkpoint } from '../../types';
import type { BandGroup } from '../../lib/bands';
import { bandTierLabel } from '../../lib/bands';
import { tileState, skillLevel, skillMastery } from '../../lib/foundations';
import { ConceptTile } from './ConceptTile';
import './bands.css';

interface Props {
  group: BandGroup;
  track: Track;
  state: LearningState;
  onReset: (skill: string) => void;
}

// One level band on the path map: a header with a dataset badge, a subtle current-tier label,
// then either a locked overlay (prior capstone not passed) or the band's phases of tiles.
export function BandSection({ group, track, state, onReset }: Props) {
  const { meta, phases, locked, strong, total } = group;
  return (
    <section className={`lh-band ${locked ? 'locked' : ''}`} aria-label={`${meta.title} band`}>
      <div className="lh-band-head">
        <span className="lh-band-badge" data-dataset={meta.dataset}>{meta.badge}</span>
        <h2 className="lh-band-title">{meta.title}</h2>
        <span className="lh-band-tier">{locked ? 'Locked' : bandTierLabel(group)}</span>
        <span className="lh-band-score">{strong}/{total}</span>
      </div>
      <p className="lh-band-blurb">{meta.blurb}</p>

      {locked ? (
        <div className="lh-band-lock" role="note">
          <span className="lh-band-lock-tag" aria-hidden="true">LOCKED</span>
          <p>Finish the previous capstone to unlock {meta.title}.</p>
        </div>
      ) : (
        phases.map((phase) => (
          <div key={phase.id} className="lh-band-phase">
            <div className="lh-sec-head lh-sec-head-sub">
              <h3><span className="lh-sec-num">Phase {phase.order}</span> {phase.title}</h3>
              {phase.goal ? <p>{phase.goal}</p> : null}
            </div>
            <div className="lh-grid">
              {phase.concepts.map((concept: Concept) => (
                <ConceptTile key={concept.id} concept={concept} state={tileState(track, state, concept)}
                  count={skillLevel(state, concept.skill).count} masteryPct={skillMastery(state, concept.skill).pct}
                  onReset={onReset} />
              ))}
              {phase.checkpoints.map((cp: Checkpoint) => {
                const passed = state.checkpointsPassed.includes(cp.id);
                return (
                  <div key={cp.id} className={`lh-tile lh-tile-cp ${passed ? 'ok' : ''}`}>
                    <div className="lh-tile-head">
                      <span className="lh-tile-num">{passed ? 'OK' : 'CP'}</span>
                      <strong>{cp.title}</strong>
                      <span className="lh-tile-tier">{passed ? 'passed' : 'checkpoint'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
```

Create `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\bands.css`:

```css
.lh-band {
  margin: 28px 0;
  padding-top: 8px;
  border-top: 1px solid var(--surface-3);
}
.lh-band.locked { opacity: 0.72; }

.lh-band-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.lh-band-title { margin: 0; }
.lh-band-badge {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 3px 9px;
  border-radius: 999px;
  color: #fff;
  background: var(--brand);
}
.lh-band-badge[data-dataset="aperture"] { background: #2f6f4f; }
.lh-band-badge[data-dataset="sideline"] { background: #2f5f8f; }
.lh-band-badge[data-dataset="rove"] { background: #7a4fae; }

.lh-band-tier {
  font-size: 12px;
  color: var(--ink-dim);
}
.lh-band-score {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--ink-dim);
}
.lh-band-blurb {
  margin: 4px 0 14px;
  color: var(--ink-dim);
}

.lh-band-lock {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px;
  border: 1px dashed var(--surface-3);
  border-radius: 12px;
  color: var(--ink-dim);
}
.lh-band-lock p { margin: 0; }
.lh-band-lock-tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--surface-3);
  color: var(--ink-dim);
}
.lh-band-phase { margin-top: 14px; }
```

Run the test and confirm GREEN:

```bash
npm --prefix client test -- BandSection
```

Expected: both `BandSection band gating` cases pass (locked shows the unlock note and hides `Inner join`; unlocked shows `Inner join` and hides the note).

- [ ] **Step 5: Write the failing `pickStarter` test.** The client must pick one of the three pre-generated tiers with no round-trip, and fall back to the legacy heuristic for string starters. Create `C:\Dev\Projects\sql-mastery\client\src\lib\sqlScaffold.pickStarter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickStarter, starterSqlForExercise } from './sqlScaffold';
import type { Exercise } from '../types';

const tiered = {
  id: 'e1', database: 'aperture', task: 't',
  starterSql: { full: 'SELECT ____ FROM film;', half: 'SELECT title FROM ____;', blank: '' },
  expectedSql: 'SELECT title FROM film ORDER BY title;'
} as unknown as Exercise;

const legacy = {
  id: 'e2', database: 'aperture', task: 't',
  starterSql: 'SELECT ____ FROM film;', expectedSql: 'SELECT title FROM film;'
} as unknown as Exercise;

describe('pickStarter', () => {
  it('reads a pre-generated tier verbatim when starterSql is the three-tier object', () => {
    expect(pickStarter(tiered, 'full')).toContain('FROM film');
    expect(pickStarter(tiered, 'half')).toContain('title');
    expect(pickStarter(tiered, 'blank')).toBe('');
  });

  it('falls back to the client heuristic when starterSql is a legacy string', () => {
    expect(pickStarter(legacy, 'full')).toMatch(/____/);
    expect(pickStarter(legacy, 'blank')).toBe('');
  });

  it('starterSqlForExercise uses the full tier for an object starter (no [object Object])', () => {
    expect(starterSqlForExercise(tiered)).not.toContain('[object Object]');
    expect(starterSqlForExercise(tiered)).toContain('FROM film');
  });
});
```

Run it and confirm RED:

```bash
npm --prefix client test -- sqlScaffold.pickStarter
```

Expected failure: `pickStarter` is not exported from `./sqlScaffold`, so every case errors.

- [ ] **Step 6: Implement `pickStarter` and make `starterSqlForExercise` object-safe, then run GREEN.** Edit `C:\Dev\Projects\sql-mastery\client\src\lib\sqlScaffold.ts`. Replace the existing `starterSqlForExercise` function (lines 60-64) with this block, which adds the tier guard, `pickStarter`, and the object-safe rewrite:

```ts
export type StarterTier = 'full' | 'half' | 'blank';

interface StarterSqlTiers { full: string; half: string; blank: string; }

function isTieredStarter(value: unknown): value is StarterSqlTiers {
  return !!value && typeof value === 'object'
    && typeof (value as StarterSqlTiers).full === 'string'
    && typeof (value as StarterSqlTiers).half === 'string'
    && typeof (value as StarterSqlTiers).blank === 'string';
}

// Only the starter/expected fields are read, so a minimal shape is enough (and lets
// callers pass a full Exercise or a lightweight fixture). Object starters use their full tier.
export function starterSqlForExercise(exercise: Pick<Exercise, 'starterSql' | 'expectedSql'> | null | undefined): string {
  const raw = exercise?.starterSql as unknown;
  const explicit = isTieredStarter(raw) ? raw.full : String(raw || '').trim();
  if (explicit) return formatSql(explicit);
  return scaffoldSql(exercise?.expectedSql);
}

// Choose the learner-facing starter for a tier with NO server round-trip. When the exercise
// carries the three pre-generated tiers (contract v2), return that tier verbatim. Otherwise
// fall back to the legacy client heuristics so older payloads keep working.
export function pickStarter(
  exercise: Pick<Exercise, 'starterSql' | 'expectedSql'> | null | undefined,
  tier: StarterTier
): string {
  const raw = exercise?.starterSql as unknown;
  if (isTieredStarter(raw)) return formatSql(raw[tier]);
  const full = starterSqlForExercise(exercise);
  if (tier === 'full') return full;
  if (tier === 'blank') return '';
  return revealHalfScaffold(full, exercise?.expectedSql);
}
```

Run GREEN (and confirm no regression in the existing scaffold tests):

```bash
npm --prefix client test -- sqlScaffold foundations-ui
```

Expected: `pickStarter` cases pass; `foundations-ui.test.tsx` still passes (string starters unaffected).

- [ ] **Step 7: Seed the editor from the chosen tier in FoundationsRep.** Edit `C:\Dev\Projects\sql-mastery\client\src\routes\foundations\FoundationsRep.tsx`. Change the import on line 6 and the seed computation on lines 43-44.

Import line 6, from:

```ts
import { starterSqlForExercise, revealHalfScaffold } from '../../lib/sqlScaffold';
```

to:

```ts
import { starterSqlForExercise, pickStarter } from '../../lib/sqlScaffold';
```

Seed computation (lines 43-44), from:

```ts
  const fullStarter = starterSqlForExercise(exercise);
  const seed = tier === 'blank' ? '' : tier === 'half' ? revealHalfScaffold(fullStarter, exercise.expectedSql) : undefined;
```

to:

```ts
  const fullStarter = pickStarter(exercise, 'full');
  const seed = pickStarter(exercise, tier);
```

(`starterSqlForExercise` is still imported because `editorPlaceholder` on lines 17-21 uses it; the `Show the starter` button on line 100 keeps restoring `fullStarter`.) Confirm the client suite still compiles and passes:

```bash
npm --prefix client test -- foundations-ui FoundationsRep BandSection
```

Expected: green (no `revealHalfScaffold` reference remains; the `foundations-ui` seed cases still pass).

- [ ] **Step 8: Render the band sections in the path map.** Replace the whole of `C:\Dev\Projects\sql-mastery\client\src\routes\Foundations.tsx` with the version below. It keeps the hero, progress ring, reset/undo toast, and weak-spots line, and swaps the single active-phase grid plus the "All phases" list for the three `BandSection`s.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { EmptyState, Button } from '../components/ui';
import { useFoundations } from '../state/FoundationsContext';
import { buildTodaySession, graduationStatus, weakSpots, resetConcept } from '../lib/foundations';
import { bandGroups } from '../lib/bands';
import { BandSection } from './foundations/BandSection';
import type { LearningState } from '../types';
import './foundations/foundations.css';

interface RingProps {
  value: number;
}

function Ring({ value }: RingProps) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg className="lh-ring-svg" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--brand)" strokeWidth="11"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
    </svg>
  );
}

export default function Foundations() {
  const { track, phases, state, update } = useFoundations();
  const navigate = useNavigate();
  const [undo, setUndo] = useState<{ skill: string; title: string; slice: { correct?: string[]; reviews?: number; last?: number } } | null>(null);
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path..." /></AppShell>;

  function handleReset(skill: string) {
    const concept = track!.concepts.find((c) => c.skill === skill);
    setUndo({
      skill,
      title: concept ? concept.title : skill,
      slice: { correct: state.skillCorrect[skill], reviews: state.reviewsPassed[skill], last: state.lastPracticedSession[skill] }
    });
    update((s: LearningState) => resetConcept(s, skill));
  }

  function undoReset() {
    if (!undo) return;
    const { skill, slice } = undo;
    update((s: LearningState) => {
      if (slice.correct !== undefined) s.skillCorrect = { ...s.skillCorrect, [skill]: slice.correct };
      if (slice.reviews !== undefined) s.reviewsPassed = { ...s.reviewsPassed, [skill]: slice.reviews };
      if (slice.last !== undefined) s.lastPracticedSession = { ...s.lastPracticedSession, [skill]: slice.last };
    });
    setUndo(null);
  }

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const weak = weakSpots(track, state, 3);
  const started = Object.values(state.skillCorrect).some((a) => (a as string[]).length);
  const pct = grad.totalSkills ? Math.round((grad.strongSkills / grad.totalSkills) * 100) : 0;
  const bands = bandGroups(phases, state);

  const todayLabel = session.main.kind === 'graduated' ? 'Every phase complete'
    : session.main.kind === 'checkpoint' ? session.main.checkpoint.title
    : `${session.reviews.length ? `${session.reviews.length} review${session.reviews.length > 1 ? 's' : ''} + ` : ''}new lesson: ${session.main.concept.title}`;

  function go() {
    navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session');
  }

  return (
    <AppShell breadcrumb={<span className="here">Your path</span>}>
      <section className="lh-hero">
        <div className="lh-hero-copy">
          <span className="lh-kick">{started ? 'Keep going' : 'Start here'}</span>
          <h1>Your path to senior SQL</h1>
          <p className="lh-sub">From your first query to interview-ready analysis: three datasets, one step at a time, with everything you learn coming back so it sticks.</p>
          {session.main.kind === 'graduated'
            ? <>
                <p className="lh-grad">You have completed every phase. Senior ready.</p>
                <div className="lh-freeprac">
                  <span>Free practice: pick any lesson below, or drill your weakest.</span>
                  <div className="lh-freeprac-links">
                    {weak.map((w) => {
                      const c = track.concepts.find((x) => x.skill === w.skill);
                      return c ? <Button key={w.skill} onClick={() => navigate(`/learn/concept/${c.id}`)}>{w.title}</Button> : null;
                    })}
                  </div>
                </div>
              </>
            : <>
                <div className="lh-today"><span>Today</span> {todayLabel}</div>
                <Button variant="primary" onClick={go}>{started ? "Continue today's session" : 'Start lesson 1'}</Button>
              </>}
        </div>
        <div className="lh-ring">
          <Ring value={pct} />
          <div className="lh-ring-num"><b>{grad.strongSkills}<span>/{grad.totalSkills}</span></b><em>skills strong</em></div>
        </div>
      </section>

      {bands.map((group) => (
        <BandSection key={group.meta.level} group={group} track={track} state={state} onReset={handleReset} />
      ))}

      {undo ? (
        <div className="lh-toast" role="status" aria-live="polite">
          <span>Reset {undo.title}. Its full scaffold is back.</span>
          <button type="button" onClick={undoReset}>Undo</button>
          <button type="button" onClick={() => setUndo(null)}>Dismiss</button>
        </div>
      ) : null}
      {weak.length ? (
        <p className="lh-weakspots">Weak spots to review: {weak.map((w) => w.title).join(', ')}. A short session a day beats a long one a week.</p>
      ) : (
        <p className="lh-weakspots">A short session a day beats a long one a week.</p>
      )}
    </AppShell>
  );
}
```

Type-check the client and run the foundations tests:

```bash
npm --prefix client run build
npm --prefix client test -- BandSection ConceptTile foundations-ui
```

Expected: the client builds (no unused-import errors from the removed `currentPhase`/`phaseGraduation`/`tileState`/`ConceptTile` references) and the listed suites pass.

- [ ] **Step 9: Write the failing serve-time snapshot-guard test.** Create `C:\Dev\Projects\sql-mastery\test\snapshot-guard.test.ts` (top-level `test/`, per the module rules). Dependencies are injected so the test never touches Postgres or the filesystem.

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertServedSnapshotsMatch } from '../src/snapshot-guard';

test('assertServedSnapshotsMatch resolves when every live hash equals the recorded hash', async () => {
  await assertServedSnapshotsMatch({
    databases: ['aperture', 'sideline', 'rove'],
    computeHash: async (database: string) => `hash-${database}`,
    readRecorded: (database: string) => `hash-${database}`
  });
});

test('assertServedSnapshotsMatch rejects and names the drifted database', async () => {
  await assert.rejects(
    assertServedSnapshotsMatch({
      databases: ['aperture', 'rove'],
      computeHash: async (database: string) => (database === 'rove' ? 'DRIFT' : `hash-${database}`),
      readRecorded: (database: string) => `hash-${database}`
    }),
    /rove: served=DRIFT recorded=hash-rove/
  );
});
```

Run it and confirm RED:

```bash
npm run build:server
```

Expected failure: `tsc` fails with `Cannot find module '../src/snapshot-guard'` from `test/snapshot-guard.test.ts`.

- [ ] **Step 10: Implement the serve-time snapshot guard, then run GREEN.** Create `C:\Dev\Projects\sql-mastery\src\snapshot-guard.ts`. It reads the recorded hashes T6 wrote to `scripts/snapshots/<db>.snapshot.json`, tolerating either a bare-string file or a `{ hash }` object.

```ts
import fs from 'fs';
import path from 'path';

export interface SnapshotGuardDeps {
  databases: string[];
  computeHash: (database: string) => Promise<string>;
  readRecorded: (database: string) => string;
}

export function recordedSnapshotPath(database: string): string {
  return path.resolve(process.cwd(), 'scripts', 'snapshots', `${database}.snapshot.json`);
}

// The recorded hash for a served DB. Accepts a bare JSON string or a { hash } object so it
// stays compatible with however T6 shaped scripts/snapshots/<db>.snapshot.json.
export function readRecordedSnapshot(database: string): string {
  const file = recordedSnapshotPath(database);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  const hash = typeof parsed === 'string'
    ? parsed
    : (parsed && typeof parsed === 'object' && typeof (parsed as { hash?: unknown }).hash === 'string'
      ? (parsed as { hash: string }).hash
      : '');
  if (!hash) throw new Error(`Snapshot file ${file} has no recorded hash.`);
  return hash;
}

// Serve-time G0: refuse to start if any served DB's live snapshot differs from the hash the
// exercises were validated against. Uses the SAME computeSnapshotHash the harness gate g0 uses.
export async function assertServedSnapshotsMatch(deps: SnapshotGuardDeps): Promise<void> {
  const mismatches: string[] = [];
  for (const database of deps.databases) {
    const recorded = deps.readRecorded(database);
    const live = await deps.computeHash(database);
    if (live !== recorded) mismatches.push(`${database}: served=${live} recorded=${recorded}`);
  }
  if (mismatches.length) {
    throw new Error(
      'Serve-time snapshot check failed; the live database does not match the validated snapshot. '
      + 'Regenerate and revalidate exercises before serving. Details: ' + mismatches.join('; ')
    );
  }
}
```

Run GREEN:

```bash
npm run build:server && node --test dist/test/snapshot-guard.test.js
```

Expected: both `assertServedSnapshotsMatch` tests pass (`tests 2`, `pass 2`, `fail 0`).

- [ ] **Step 11: Wire the guard into server startup.** Edit `C:\Dev\Projects\sql-mastery\server.ts`. Add the imports after the existing import block (after line 9):

```ts
import { computeSnapshotHash } from './src/snapshot';
import { assertServedSnapshotsMatch, readRecordedSnapshot } from './src/snapshot-guard';
import { getDatabaseNames } from './src/db-config';
```

Replace the final call `listen(preferredPort);` (line 51) with an async bootstrap that asserts the snapshot before binding the port:

```ts
async function start(): Promise<void> {
  if (process.env.SQL_MASTERY_SKIP_SNAPSHOT_CHECK === 'true') {
    console.warn('SQL_MASTERY_SKIP_SNAPSHOT_CHECK=true: serving without the snapshot-identity guard.');
  } else {
    await assertServedSnapshotsMatch({
      databases: getDatabaseNames(),
      computeHash: computeSnapshotHash,
      readRecorded: readRecordedSnapshot
    });
  }
  listen(preferredPort);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Type-check the server (this compiles `server.ts` against the new modules; it does not need a running DB):

```bash
npm run build:server
```

Expected: `tsc` exits 0 with `server.ts`, `src/snapshot-guard.ts`, and `test/snapshot-guard.test.ts` compiling.

- [ ] **Step 12: Add the release-gate npm script.** Edit `C:\Dev\Projects\sql-mastery\package.json`. Add a `release-gate` entry to `scripts` (it runs the T6 `validate-exercises` gate first, then the full test build, then the production build). Change the `test` line to include a trailing comma and append the new script:

```json
    "test": "tsc -p tsconfig.json && node --test dist/test/*.test.js && npm --prefix client test",
    "release-gate": "npm run validate-exercises && npm test && npm run build"
```

Confirm the script is registered (no DB needed for this listing):

```bash
npm run release-gate --help >/dev/null 2>&1; npm run 2>&1 | grep -E "release-gate|validate-exercises"
```

Expected: both `release-gate` and `validate-exercises` appear in the script listing, confirming the gate delegates to the harness. (A full `npm run release-gate` requires local seeded Postgres with `PGPASSWORD` set and the recorded `scripts/snapshots/*.snapshot.json`; run it in CI as the blocking release step.)

- [ ] **Step 13: Full verification and commit.** Run the complete client and server suites and confirm every affected area is green:

```bash
npm --prefix client test -- BandSection sqlScaffold.pickStarter foundations-ui ConceptTile
npm run build:server && node --test dist/test/snapshot-guard.test.js
```

Expected: all listed client suites pass and the two `snapshot-guard` server tests pass. Then commit:

```bash
git add -A
git commit -m "Task 18: level-aware band UI, serve-time snapshot guard, release gate

Group the path map into Beginner/Intermediate/Advanced bands with a
prior-capstone lock overlay, dataset badges, and a current-tier label;
pick pre-generated starterSql tiers client-side with no round-trip; assert
computeSnapshotHash identity at server startup; add the release-gate script.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Self-review results

- Spec coverage: PASS. The plan covers the three datasets/levels, the generator pipeline, fingerprint grading, G0-G9 validation, level-banded phase structure, scaffold tapering, retirement of legacy chinook/stackoverflow/HTML content, curriculum-service reassembly, UI banding, and release gating. Each spec build-order item maps to exactly one of Tasks 0-18.
- Placeholder scan: PASS. No actionable TODO/TBD/fill-in placeholders remain. Ellipses only appear inside illustrative SQL snippets or comments where the omitted body is not implementation-critical.
- Type consistency: PASS. The authoritative interface contract defines the shared `Exercise`, `DraftExercise`, `StarterSql`, `BlankMap`, `Level`, `Phase`, `Template`, `Fingerprint`, snapshot, scaffold, and query-service signatures up front, and later tasks use those same names and paths.
- Artifact cleanup: PASS. Removed workflow transcript residue and a temp scratchpad path from the assembled plan. Replaced the dangling `resolutions.md` dependency with the encoded contract text as the governing source.
