# Owned Datasets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build three owned Postgres datasets (Aperture, Sideline, Rove) with deterministic, believable seed data and a full test + adversarial harness.

**Architecture:** A shared deterministic generator framework (`src/datasets/framework/`) plus three pure per-DB `generate(seed)` modules that return row objects with no IO; thin `scripts/` entrypoints run the generators through a one-transaction seed runner using the existing `buildClientConfig`/`pg` stack. Schema lives as versioned SQL. Everything compiles via the existing `tsc` to `dist/` and runs on the VPS; pure logic is unit-tested with `node:test` and a `verify-datasets` script asserts integration + adversarial invariants against the seeded databases.

**Tech Stack:** TypeScript (tsc, node16), Node.js `node:test`, `pg`, Postgres. No new runtime dependencies (optional COPY path guards on `pg-copy-streams` only if present).

**Design source of truth:** `docs/superpowers/specs/2026-07-07-owned-datasets-design.md`. Tasks reference it for the full DDL, believability rules, volumes, mess taxonomy, and edge cases. Read the relevant spec section before implementing each dataset task.

## Global Constraints

- No en dashes, em dashes, or minus look-alikes anywhere. ASCII hyphen only.
- Determinism is mandatory: NEVER use `Math.random`, `Date.now`, or argless `new Date()`. All randomness comes from the seeded `mulberry32` PRNG; all time derives from the literal `ANCHOR_MS = Date.UTC(2020,0,1)` with integer offsets. `new Date` is used only with an explicit ms argument, only inside `dates.ts`.
- Money is integer cents everywhere. `DATASET_END_MS = Date.UTC(2022,0,1)` is the literal "now".
- Rove timestamps that drive demand/behavior (`orders.placed_at/accepted_at/picked_up_at/delivered_at/cancelled_at`, `event_log.event_ts`, `customers.signup_ts`, and all Rove `*_at`) are naive local `timestamp` (NOT `timestamptz`); `cities.timezone` is the conversion key.
- The mess lives ONLY in `src/datasets/rove/mess.ts`. Aperture and Sideline generators never reference any dirty map, soft-delete column, legacy column, or naive-local convention.
- Every Rove defect must be reversible to a committed clean answer key (hidden column, canonical enum, or finite map).
- Server unit tests run via `node --test dist/test/*.test.js`; `npm run build:server` = `tsc -p tsconfig.json`. Commit messages end with the `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

## Shared interfaces (locked; every task must match these exactly)

```ts
// src/datasets/framework/prng.ts
export type Prng = () => number;                 // float in [0,1)
export function mulberry32(seed: number): Prng;
export function fnv1a(str: string): number;      // 32-bit unsigned
export function deriveStream(baseSeed: number, name: string): Prng;

// src/datasets/framework/random.ts  (all take a Prng as first arg)
export function intBetween(rng: Prng, lo: number, hi: number): number;   // inclusive
export function floatBetween(rng: Prng, lo: number, hi: number): number;
export function pick<T>(rng: Prng, arr: readonly T[]): T;
export function weightedPick<T>(rng: Prng, items: readonly (readonly [T, number])[]): T;
export function bernoulli(rng: Prng, p: number): boolean;
export function gaussian(rng: Prng, mean: number, sd: number): number;
export function shuffle<T>(rng: Prng, arr: readonly T[]): T[];           // returns a new array
export function sampleWithout<T>(rng: Prng, arr: readonly T[], k: number): T[];
export function round2(n: number): number;                               // fixed-decimal money/physics

// src/datasets/framework/dates.ts
export const ANCHOR_MS: number;                  // Date.UTC(2020,0,1)
export const DATASET_END_MS: number;             // Date.UTC(2022,0,1)
export function addDays(ms: number, days: number): number;
export function addSeconds(ms: number, secs: number): number;
export function formatTimestamp(ms: number): string;  // 'YYYY-MM-DD HH:MM:SS' from UTC fields
export function formatDate(ms: number): string;       // 'YYYY-MM-DD' from UTC fields

// src/datasets/framework/writer.ts
export interface DbClient { query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number }>; }
export function rowsPerChunk(columnCount: number, rowCap?: number): number; // min(rowCap=1000, floor(65535/columnCount))
export async function insertRows(client: DbClient, table: string, columns: string[], rows: Record<string, unknown>[], rowCap?: number): Promise<void>;

// src/datasets/framework/schema.ts
export async function runSqlFile(client: DbClient, absPath: string): Promise<void>;

// src/datasets/framework/types.ts
export interface TableSpec { name: string; columns: string[]; }  // insert order = parents before children
export interface DatasetModule {
  DB_NAME: string;          // 'aperture' | 'sideline' | 'rove'
  SCHEMA_FILE: string;      // absolute path to datasets/schema/<db>.sql
  SEED: number;             // fixed base-seed literal
  VERSION: string;          // generator version string, e.g. 'aperture-1'
  TABLES: TableSpec[];
  generate(seed: number): Record<string, Record<string, unknown>[]>;  // rows keyed by table name
}

// src/datasets/framework/seed-runner.ts
export async function seedDatabase(mod: DatasetModule): Promise<Record<string, number>>; // returns row counts per table
```

`seedDatabase` opens a pool via `buildClientConfig(mod.DB_NAME, process.env)` (import from `../../db-config`), runs one transaction: `runSqlFile` (DDL drop+create), then for each `TABLES` entry in order `insertRows(client, t.name, t.columns, generated[t.name])`, then inserts a `seed_meta` row (`db, version, seed, row_counts jsonb, checksum text`), COMMIT; ROLLBACK on any error. The `seed_meta` table is created by each schema file.

---

### Task 1: PRNG framework

**Files:**
- Create: `src/datasets/framework/prng.ts`
- Test: `test/prng.test.ts`

**Interfaces:**
- Produces: `mulberry32`, `fnv1a`, `deriveStream`, type `Prng` (signatures above).

- [ ] **Step 1: Write the failing test** (`test/prng.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fnv1a, deriveStream } from '../src/datasets/framework/prng';

test('mulberry32 is deterministic and stable across instances', () => {
  const a = mulberry32(12345); const b = mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) { assert.ok(v >= 0 && v < 1); }
});

test('mulberry32 first outputs match a pinned golden vector', () => {
  const r = mulberry32(0x41504552);
  const got = [r(), r(), r()].map((x) => Math.round(x * 1e9));
  // GOLDEN: fill these with the actual first-run values, then never change them.
  assert.deepEqual(got, [/* g0 */, /* g1 */, /* g2 */]);
});

test('deriveStream gives independent, order-stable sub-streams', () => {
  const s1 = deriveStream(1, 'planets'); const s2 = deriveStream(1, 'stars');
  assert.notDeepEqual([s1(), s1(), s1()], [s2(), s2(), s2()]);
  // Re-deriving 'planets' after 'stars' yields the same sequence (order-stable).
  const s1b = deriveStream(1, 'planets');
  const first = deriveStream(1, 'planets');
  assert.deepEqual([first(), first(), first()], [s1b(), s1b(), s1b()]);
});

test('fnv1a is a stable 32-bit hash', () => {
  assert.equal(fnv1a('planets'), fnv1a('planets'));
  assert.ok(fnv1a('a') !== fnv1a('b'));
  assert.ok(fnv1a('x') >>> 0 === fnv1a('x'));
});
```

- [ ] **Step 2: Run to verify it fails** - `npm run build:server && node --test dist/test/prng.test.js` -> FAIL (module not found).

- [ ] **Step 3: Implement** (`src/datasets/framework/prng.ts`)

```ts
export type Prng = () => number;

export function mulberry32(seed: number): Prng {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function deriveStream(baseSeed: number, name: string): Prng {
  return mulberry32(((baseSeed >>> 0) ^ fnv1a(name)) >>> 0);
}
```

- [ ] **Step 4: Run the golden test once, read the printed values, paste them into the GOLDEN vector, re-run** - `node --test dist/test/prng.test.js` -> PASS. (First run: temporarily `console.log(got)` or assert against `[]` to capture the three integers, then pin them.)

- [ ] **Step 5: Commit** - `git add src/datasets/framework/prng.ts test/prng.test.ts && git commit` (feat: deterministic PRNG framework).

---

### Task 2: Random helpers

**Files:**
- Create: `src/datasets/framework/random.ts`
- Test: `test/random.test.ts`

**Interfaces:**
- Consumes: `Prng`, `mulberry32` (Task 1).
- Produces: `intBetween`, `floatBetween`, `pick`, `weightedPick`, `bernoulli`, `gaussian`, `shuffle`, `sampleWithout`, `round2`.

- [ ] **Step 1: Write the failing test** (`test/random.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/datasets/framework/prng';
import { intBetween, pick, weightedPick, bernoulli, shuffle, round2 } from '../src/datasets/framework/random';

test('intBetween is inclusive and in range, including lo==hi', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i += 1) { const v = intBetween(r, 3, 7); assert.ok(v >= 3 && v <= 7 && Number.isInteger(v)); }
  assert.equal(intBetween(r, 5, 5), 5);
});

test('weightedPick honors the target ratio within tolerance', () => {
  const r = mulberry32(2);
  let a = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) { if (weightedPick(r, [['a', 3], ['b', 1]]) === 'a') a += 1; }
  assert.ok(Math.abs(a / n - 0.75) < 0.02);
});

test('shuffle is a permutation (no loss/dup)', () => {
  const r = mulberry32(3);
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(r, src);
  assert.deepEqual([...out].sort((x, y) => x - y), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]); // input not mutated
});

test('bernoulli rate lands near p', () => {
  const r = mulberry32(4); let c = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) if (bernoulli(r, 0.3)) c += 1;
  assert.ok(Math.abs(c / n - 0.3) < 0.02);
});

test('round2 fixes two decimals', () => { assert.equal(round2(1.005 * 100) / 100, round2(1.005 * 100) / 100); assert.equal(round2(3.14159), 3.14); });
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `random.ts` per the locked signatures. `intBetween(rng,lo,hi) = lo + Math.floor(rng()*(hi-lo+1))`; `pick` indexes by `Math.floor(rng()*arr.length)`; `weightedPick` sums weights, draws `rng()*total`, walks; `bernoulli(rng,p) = rng() < p`; `gaussian` via Box-Muller; `shuffle` copies then Fisher-Yates using `intBetween`; `sampleWithout` shuffles a copy and slices `k`; `round2(n) = Math.round(n*100)/100`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** (feat: seeded random helpers).

---

### Task 3: Deterministic dates

**Files:**
- Create: `src/datasets/framework/dates.ts`
- Test: `test/dates.test.ts`

**Interfaces:**
- Produces: `ANCHOR_MS`, `DATASET_END_MS`, `addDays`, `addSeconds`, `formatTimestamp`, `formatDate`.

- [ ] **Step 1: Write the failing test** (`test/dates.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_MS, addDays, addSeconds, formatTimestamp, formatDate } from '../src/datasets/framework/dates';

test('formatting is UTC-field based and TZ-independent', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'America/New_York';
  const a = formatTimestamp(ANCHOR_MS);
  process.env.TZ = 'UTC';
  const b = formatTimestamp(ANCHOR_MS);
  process.env.TZ = prev;
  assert.equal(a, b);
  assert.equal(a, '2020-01-01 00:00:00');
});

test('addDays / addSeconds are integer epoch math', () => {
  assert.equal(formatDate(addDays(ANCHOR_MS, 31)), '2020-02-01');
  assert.equal(formatTimestamp(addSeconds(ANCHOR_MS, 3661)), '2020-01-01 01:01:01');
});
```

Note: because `formatTimestamp` must extract UTC fields manually (do NOT use `toLocaleString` or locale formatters), the test sets `process.env.TZ` at runtime; the assertion is that output does not change. Implement `formatTimestamp` using `new Date(ms)` then `getUTCFullYear/getUTCMonth/...` (this is the ONLY allowed `new Date` usage, with an explicit ms arg).

- [ ] **Step 2-5:** run-fail, implement (`ANCHOR_MS = Date.UTC(2020,0,1)`, `DATASET_END_MS = Date.UTC(2022,0,1)`, `addDays(ms,d)=ms+d*86400000`, `addSeconds(ms,s)=ms+s*1000`, `formatTimestamp`/`formatDate` build zero-padded strings from `getUTC*`), run-pass, commit (feat: deterministic date helpers).

---

### Task 4: Pools + safe text

**Files:**
- Create: `src/datasets/framework/pools.ts`, `src/datasets/framework/text.ts`
- Test: `test/pools.test.ts`

**Interfaces:**
- Produces: shared value pools (given/surname parts, real-sounding city names, generic word parts) in `pools.ts`; `text.ts` exports `BANNED_TOKENS: string[]`, `containsBanned(s: string): boolean`, `looksLikeRealEmail(s: string): boolean`, `looksLikeRealPhone(s: string): boolean` (PII-shape guards used by generation AND adversarial checks).

- [ ] **Step 1: Write the failing test** (`test/pools.test.ts`): assert every exported pool array is non-empty, has no duplicate entries, and no entry `containsBanned`; assert `looksLikeRealEmail('a@gmail.com')` is true but `looksLikeRealEmail('a@example.com')` is false (reserved domains pass the PII guard), and `looksLikeRealPhone('212-555-0100')` is false (555 range is safe) while a non-555 number is flagged.
- [ ] **Step 2-5:** run-fail; implement pools (curated arrays) + `text.ts` guards (`BANNED_TOKENS` a small committed slur/offensive list; `containsBanned` lowercases and substring-checks including no-space-collapsed form; `looksLikeRealEmail` true unless domain in {example.com, example.org}; `looksLikeRealPhone` true unless the exchange is 555); run-pass; commit (feat: curated pools + PII/offensive guards).

---

### Task 5: Insert writer

**Files:**
- Create: `src/datasets/framework/types.ts`, `src/datasets/framework/writer.ts`
- Test: `test/writer.test.ts`

**Interfaces:**
- Produces: `TableSpec`, `DatasetModule`, `DbClient` (types.ts); `rowsPerChunk`, `insertRows` (writer.ts).

- [ ] **Step 1: Write the failing test** (`test/writer.test.ts`) using a fake client that records queries (no DB):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsPerChunk, insertRows } from '../src/datasets/framework/writer';

test('rowsPerChunk stays under the 65535 param cap and respects rowCap', () => {
  assert.equal(rowsPerChunk(10), 1000);              // capped by rowCap default
  assert.equal(rowsPerChunk(100), 655);              // floor(65535/100)
  assert.equal(rowsPerChunk(3, 5), 5);               // explicit rowCap
});

test('insertRows chunks and flattens params in column order', async () => {
  const calls: { text: string; params: unknown[] }[] = [];
  const client = { query: async (text: string, params?: unknown[]) => { calls.push({ text, params: params || [] }); return { rows: [], rowCount: 0 }; } };
  const rows = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'z' }];
  await insertRows(client, 'demo', ['a', 'b'], rows, 2); // rowCap 2 -> two chunks (2 then 1)
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /INSERT INTO demo \(a, b\) VALUES \(\$1, \$2\), \(\$3, \$4\)/);
  assert.deepEqual(calls[0].params, [1, 'x', 2, 'y']);
  assert.deepEqual(calls[1].params, [3, 'z']);
});
```

- [ ] **Step 2-5:** run-fail; implement `rowsPerChunk(c, rowCap=1000)=Math.min(rowCap, Math.floor(65535/c))`; `insertRows` builds one parameterized `INSERT INTO <table> (<cols>) VALUES (...)` per chunk, mapping each row object to `columns.map(c=>row[c])` flattened; `OVERRIDING SYSTEM VALUE` is NOT needed here (schema uses plain integer PKs, not identity) so omit it. run-pass; commit (feat: chunked insert writer).

---

### Task 6: Schema runner + seed runner (shared IO)

**Files:**
- Create: `src/datasets/framework/schema.ts`, `src/datasets/framework/seed-runner.ts`

**Interfaces:**
- Consumes: `buildClientConfig` (from `src/db-config.ts`), `insertRows` (Task 5), `DatasetModule` (Task 5).
- Produces: `runSqlFile`, `seedDatabase`.

- [ ] **Step 1: Implement `schema.ts`** - `runSqlFile(client, absPath)` reads the file with `fs.readFileSync(absPath,'utf8')` and `await client.query(sql)`.
- [ ] **Step 2: Implement `seed-runner.ts`** - `seedDatabase(mod)`: build `new Pool(buildClientConfig(mod.DB_NAME, process.env))`, `connect()` one client, `BEGIN`, `runSqlFile(client, mod.SCHEMA_FILE)`, `const data = mod.generate(mod.SEED)`, for each `t of mod.TABLES` call `insertRows(client, t.name, t.columns, data[t.name])` and record `data[t.name].length`, insert a `seed_meta` row `(db, version, seed, row_counts)`, `COMMIT`; on error `ROLLBACK` and rethrow; `finally` release + `pool.end()`. Return the row-count map. Log progress every 50 chunks for large tables.
- [ ] **Step 3: Typecheck** - `npm run build:server` -> 0 errors. (No unit test; this layer is exercised end-to-end by the Aperture seed on the VPS in Task 8's runbook.)
- [ ] **Step 4: Commit** (feat: schema + seed runner IO layer).

---

### Task 7: seed_meta + framework barrel; confirm build

**Files:**
- Modify: none new; add `src/datasets/framework/index.ts` re-exporting the framework surface for ergonomic imports.

- [ ] **Step 1:** Create `index.ts` re-exporting prng, random, dates, writer, schema, seed-runner, types, pools, text.
- [ ] **Step 2:** `npm run build:server && node --test dist/test/*.test.js` -> all framework tests PASS, 0 typecheck errors.
- [ ] **Step 3: Commit** (chore: framework barrel export).

---

### Task 8: Aperture (schema + generator + seed)

**Files:**
- Create: `datasets/schema/aperture.sql`, `src/datasets/aperture/pools.ts`, `src/datasets/aperture/generate.ts`, `scripts/seed-aperture.ts`
- Test: `test/aperture-generate.test.ts`

Read spec section "Dataset 1: Aperture" for the exact DDL, volumes (stars 60, planets 180, moons 40), believability rules, and edge cases.

**Interfaces:**
- Consumes: framework (Tasks 1-6).
- Produces: `src/datasets/aperture/generate.ts` default `DatasetModule` shape: exports `DB_NAME='aperture'`, `SCHEMA_FILE` (absolute path to `datasets/schema/aperture.sql`), `SEED=0x41504552`, `VERSION='aperture-1'`, `TABLES` (order: stars, planets, moons with their column lists), and `generate(seed)`.

- [ ] **Step 1: Write the failing test** (`test/aperture-generate.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as aperture from '../src/datasets/aperture/generate';

test('aperture generates deterministic, referential, NULL-bearing data', () => {
  const d1 = aperture.generate(aperture.SEED);
  const d2 = aperture.generate(aperture.SEED);
  assert.deepEqual(d1, d2);                                   // deterministic
  assert.equal(d1.stars.length, 60);
  assert.equal(d1.planets.length, 180);
  const starIds = new Set(d1.stars.map((s: any) => s.star_id));
  for (const p of d1.planets) assert.ok(starIds.has(p.star_id)); // FK valid
  assert.ok(d1.planets.some((p: any) => p.mass_earth === null));  // IS NULL practice
  assert.ok(d1.planets.some((p: any) => p.radius_earth === null));
  const types = new Set(d1.stars.map((s: any) => s.spectral_type));
  for (const t of ['O','B','A','F','G','K','M']) assert.ok(types.has(t)); // all 7 present
  assert.ok(d1.stars.every((s: any) => s.temperature_k > 0 && s.mass_solar > 0));
  // one star hosts >= 7 planets (TRAPPIST-like) and >= 2 stars host zero planets
  const perStar = new Map<number, number>();
  d1.planets.forEach((p: any) => perStar.set(p.star_id, (perStar.get(p.star_id) || 0) + 1));
  assert.ok([...perStar.values()].some((n) => n >= 7));
  assert.ok(d1.stars.filter((s: any) => !perStar.has(s.star_id)).length >= 2);
});
```

- [ ] **Step 2:** run-fail.
- [ ] **Step 3:** Write `datasets/schema/aperture.sql` (copy the spec's Aperture DDL verbatim; prepend `DROP TABLE IF EXISTS moons, planets, stars, seed_meta CASCADE;` and a `CREATE TABLE seed_meta (db text, version text, seed bigint, row_counts jsonb, created_key text);`). Write `pools.ts` (constellations, spectral bands, name fragments) and `generate.ts` implementing the believability rules from the spec using per-table `deriveStream(SEED,'stars'|'planets'|'moons')`. Enforce: spectral_type -> color/temp/mass/radius bands; NULL rates per the spec; the seeded edge cases the test checks. Export the `DatasetModule` fields.
- [ ] **Step 4:** run-pass (`node --test dist/test/aperture-generate.test.js`).
- [ ] **Step 5:** Write `scripts/seed-aperture.ts`: `import * as mod from '../src/datasets/aperture/generate'; import { seedDatabase } from '../src/datasets/framework/seed-runner'; seedDatabase(mod).then((c)=>{ console.log(c); process.exit(0); }).catch((e)=>{ console.error(e); process.exit(1); });`. `npm run build:server` -> 0 errors.
- [ ] **Step 6: Commit** (feat: Aperture dataset). VPS smoke (Scott): `createdb aperture && node dist/scripts/seed-aperture.js` prints row counts; this is the first end-to-end exercise of the IO layer.

---

### Task 9: Sideline (schema + generator + seed)

**Files:**
- Create: `datasets/schema/sideline.sql`, `src/datasets/sideline/pools.ts`, `src/datasets/sideline/generate.ts`, `scripts/seed-sideline.ts`
- Test: `test/sideline-generate.test.ts`

Read spec section "Dataset 2: Sideline" for the exact DDL, volumes, Elo believability, and edge cases. `SEED=0x5344454C`, `VERSION='sideline-1'`.

**Interfaces:**
- Produces: `DatasetModule` for sideline; `TABLES` order: region, team, player, tournament, match, map_result, roster_change, sponsor, team_sponsor.

- [ ] **Step 1: Write the failing test** (`test/sideline-generate.test.ts`): deterministic; full referential integrity across all FKs; every `match.team_a_id <> match.team_b_id` and `winner_team_id IN (team_a_id, team_b_id)`; per-map winners sum to the match score; >= 4 teams win zero matches (anti-join fodder); >= 1 team has zero `team_sponsor` rows; >= 20 free agents (`team_id === null`); every current player (team_id not null) has exactly one open roster stint (`to_date === null`) on that team; `match_datetime` within its tournament window.
- [ ] **Step 2-6:** run-fail; write DDL (spec verbatim + drop/seed_meta prefix) + `pools.ts` (org names, tags, handles, region-weighted name parts, map pool) + `generate.ts` (latent Beta-ish strength -> elo -> Elo-formula outcomes with ~12% upsets; per-map rounds from elo gap; roster spans non-overlapping; sponsors incl. one megabrand across ~10 teams); write `scripts/seed-sideline.ts` (mirror Task 8 step 5); run-pass; typecheck; commit (feat: Sideline dataset).

---

### Task 10: Rove clean core (schema + generator)

**Files:**
- Create: `datasets/schema/rove.sql`, `src/datasets/rove/pools.ts`, `src/datasets/rove/generate.ts`
- Test: `test/rove-generate.test.ts`

Read spec section "Dataset 3: Rove" for the exact RECONCILED DDL (naive `timestamp`; the added identity/money/promo_code columns; the no-FK columns) and believability. `SEED=0x524F5645`, `VERSION='rove-1'`. This task builds the CLEAN core (pre-mess): all values canonical, `master_customer_id` unique per customer (no dups yet), `order_total_legacy`/`amount_legacy`/dirty `full_name/email/phone`/`promo_code` NOT yet populated with mess (leave them as the clean derived value or NULL as noted), status/vehicle/method in canonical form.

**Interfaces:**
- Produces: `generate(seed)` returning all 11 Rove tables clean; `TABLES` order: cities, merchants, promos, customers, couriers, orders, payments, event_log, promo_redemption, ratings, support_tickets. Exports `DatasetModule` fields. Also exports the canonical maps the mess layer needs: `export const CANONICAL` (status/method/vehicle/category vocabularies) so `mess.ts` and tests share one source of truth.

- [ ] **Step 1: Write the failing test** (`test/rove-generate.test.ts`): deterministic; `orders.length >= 100000`; funnel monotonic where present (`accepted_at >= placed_at`, `picked_up_at >= accepted_at`, `delivered_at >= picked_up_at` when non-null); every delivered order has all four funnel timestamps; canceled orders have trailing NULLs consistent with `cancelled_at`; `amount_cents === subtotal_cents + delivery_fee_cents + (tip_cents ?? 0) - discount_cents` for every order; every `master_customer_id` distinct in the clean core (one row per person); cohorts span >= 12 distinct signup months; timestamps are naive strings (no timezone suffix).
- [ ] **Step 2-4:** run-fail; write `rove.sql` (spec verbatim + drop/seed_meta prefix) + `pools.ts` + `generate.ts` (demand surface from local-hour x dow x population; funnel timing; tenure-correlated earnings/ratings; retention decay by cohort; money reconciliation). Use per-table `deriveStream`. run-pass.
- [ ] **Step 5: Commit** (feat: Rove clean core).

---

### Task 11: Rove mess injection

**Files:**
- Create: `src/datasets/rove/mess.ts`
- Modify: `src/datasets/rove/generate.ts` (call `injectMess(data, deriveStream(SEED,'mess'))` at the end of `generate`, or export mess separately and compose in the module `generate`)
- Test: `test/rove-mess.test.ts`

Read spec section "Rove mess taxonomy" (R01-R16) and the solvability contract. Each defect is applied by `mess.ts` over the clean core and MUST be reversible to the clean answer key.

**Interfaces:**
- Consumes: clean data from Task 10, `CANONICAL` maps.
- Produces: `export function injectMess(data, rng): void` (mutates the row arrays in place), plus `export const SYNONYM_MAP`, `export const EMAIL_TYPO_MAP`, `export const NULL_SENTINELS` (the committed finite maps used both to dirty and, in tests, to prove recovery).

- [ ] **Step 1: Write the failing test** (`test/rove-mess.test.ts`): for each defect, assert PRESENCE (dirty rate within its target band) AND REVERSIBILITY. Concretely: after mess, `orders.status` has > 1 surface form per canonical value, and every dirty status maps back through `LOWER(TRIM())` + `SYNONYM_MAP` to a value in `CANONICAL.status`; `customers` now has ~5% duplicate rows all sharing a `master_customer_id`, and grouping by normalized email recovers exactly `new Set(master_customer_id).size` people; every `order_total_legacy` after `regexp`-style cleaning (strip `[^0-9.]`, parse, *100, round) equals `amount_cents` where legacy is non-empty; `ratings.stars` contains out-of-range values but every value is in `{1..5}  or  {0,6,-1,99}  or  {null}`; ~1-2% of `orders.courier_id` reference a non-present/soft-deleted courier; duplicate `event_log` rows share a natural key with an earlier canonical row. (Implement these reversibility checks in TS against the in-memory arrays.)
- [ ] **Step 2-4:** run-fail; implement `injectMess` applying R01-R16 deterministically from the finite maps, deriving each dirty column FROM its clean source; run-pass.
- [ ] **Step 5:** Add `scripts/seed-rove.ts` (mirror Task 8 step 5, module = rove generate which now includes mess) and `scripts/seed-all.ts` (awaits seed-aperture, seed-sideline, seed-rove modules in sequence). Typecheck.
- [ ] **Step 6: Commit** (feat: Rove mess injection + seed entrypoints).

---

### Task 12: verify-datasets + manifest

**Files:**
- Create: `scripts/verify-datasets.ts`, `datasets/manifest.json`
- Test: none new (this IS the integration/adversarial test; it runs on the VPS against the seeded DBs).

Read spec sections "Test plan" (integration + adversarial) for the assertion list.

**Interfaces:**
- Consumes: `buildClientConfig` for each of aperture/sideline/rove; `looksLikeRealEmail/Phone/containsBanned` (Task 4).

- [ ] **Step 1:** Write `datasets/manifest.json` with expected per-table row-count bands per DB (from the spec volumes, with tolerance for the random-count tables).
- [ ] **Step 2:** Write `verify-datasets.ts`: for each DB, connect, run the assertion queries (volume bounds vs manifest; clean-DB orphan-FK checks for Aperture/Sideline; believability bounds; per-level pattern-presence queries; Rove mess bounds + solvability spot-checks; PII/offensive scans over string columns; the pattern-expressibility SQL: a 7-day retention cohort returns a monotonic triangle, a funnel strictly decreases, RANK shows gaps vs DENSE_RANK, ROW_NUMBER dedup removes exactly the injected count, a Sideline anti-join returns exactly the never-rostered players). Accumulate failures; print a grouped report; `process.exit(failures ? 1 : 0)`.
- [ ] **Step 3:** `npm run build:server` -> 0 errors (static check here; real run is on the VPS).
- [ ] **Step 4: Commit** (feat: dataset verify + adversarial harness).

---

### Task 13: VPS run + adversarial hardening

**Files:**
- Modify: whatever the verify run flags (data generators, mess rates, manifest bands).

- [ ] **Step 1:** Scott runs the full runbook on the VPS (spec "Runbook"): build, createdb x3, seed x3, `verify-datasets`, `node --test`.
- [ ] **Step 2:** Triage every FAIL/WARN from `verify-datasets` and the unit run. Fix generators/mess/manifest until verify exits 0 and all unit tests pass.
- [ ] **Step 3:** Lock the manifest checksums (record the ordered-md5 per table from a clean run).
- [ ] **Step 4: Commit** (fix: adversarial hardening; lock dataset manifest). This closes the datasets sub-project; curriculum wiring is the next, separate phase.

## Self-review notes

- Spec coverage: framework determinism (Tasks 1-3, 7), pools/PII (4), insert/IO (5-6), Aperture (8), Sideline (9), Rove core (10) + mess (11), verify + adversarial (12-13). Every spec section maps to a task.
- The DDL is intentionally NOT duplicated here; each dataset task copies it verbatim from the committed spec (stable source of truth), which is DRY rather than a placeholder.
- Golden PRNG vector (Task 1) is captured on first run then pinned; this is the one value that cannot be pre-written and is called out explicitly.
- Rove timestamp type (naive `timestamp`) and the added identity/money/promo_code columns are the reconciled fixes; the Rove tasks (10-11) and the spec DDL both reflect them.
