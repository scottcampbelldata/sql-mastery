# Foundations Beginner Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a beginner-first **Foundations** track (8 concepts, `SELECT *` → `GROUP BY`, on the Chinook `track`/`genre` tables) that becomes the app's front door, with a built-in repetition engine (per-skill mastery, spaced review, interleaved checkpoints, graduation), per the approved spec `docs/superpowers/specs/2026-07-05-foundations-track-design.md`.

**Architecture:** Authored content in `src/foundations.js` (hand-written data, not parsed HTML) is surfaced through `buildCurriculum()` as a new `foundations` block. A pure, unit-tested scheduling engine (`client/src/lib/foundations.js`) computes each session's queue and mastery from localStorage state (`sqlm:foundations:v1`). New React views (`/learn`, `/learn/session`, `/learn/checkpoint/:id`) reuse the existing SqlEditor / OutputDock / grading. The interview academy, checker, and database routes are untouched; only routing and the sidebar change (`/` redirects non-graduates to `/learn`, academy dashboard moves to `/academy`).

**Tech Stack:** Node/Express (server), React 18 + react-router-dom 6 + Vite (client), Vitest (client tests), node:test (server tests). Grading reuses `/api/check` result-set comparison — column names + row count + **row order** all matter, so every authored `expectedSql` is deterministic (ordered by a unique key or intrinsically single-row).

**Key facts verified against the live Chinook DB (do not re-derive):**
- `track` columns: `track_id (PK, int), name (text, NOT NULL), album_id (int), media_type_id (int), genre_id (int), composer (text, NULLABLE), milliseconds (int), bytes (int), unit_price (numeric)`. Row count 3503.
- `composer` is the ONLY column with NULLs (977 null, 2526 non-null). `genre_id`, `album_id`, `bytes` have **zero** NULLs in this copy — do NOT write "IS NULL" exercises against them (they return 0 rows).
- `genre`: 25 rows, columns `(genre_id, name)`, names unique. `media_type`: 5 rows. `unit_price` distinct values: exactly `0.99` and `1.99`. Distinct `genre_id` in track: 25. Distinct `album_id`: 347. Top-10 `milliseconds` values are all unique (so `ORDER BY milliseconds DESC LIMIT 10` needs no tiebreaker).
- The grader (`src/query-service.js` `mismatchFeedback`) compares `columns` (names, order), row count, then `normalizeRows` (values + order). `COUNT(*)` yields column name `count`; `ROUND(AVG(x))` → `round`; `MIN(x)`/`MAX(x)` → `min`/`max`; `SUM(x)` → `sum`. Author bare aggregates (no alias) and phrase tasks so the natural answer has no alias.

---

## File structure

**Server (Node):**
- Create `src/foundations.js` — authored Foundations track (concepts, exercises, checkpoints) + `getFoundations()`.
- Modify `src/curriculum-service.js` — add `foundations` to `buildCurriculum()` output.
- Create `test/foundations-content.test.js` — content sanity (server, node:test).
- Create `scripts/validate-foundations.js` — runs every `expectedSql` against the live DB, asserts success + determinism + non-empty; used during Task 1.

**Client (React):**
- Create `client/src/lib/foundations.js` — pure scheduling engine.
- Create `client/src/lib/foundations.test.js` — engine tests (Vitest).
- Create `client/src/lib/useSqlCheck.js` — shared check/feedback hook for the new screens.
- Create `client/src/state/FoundationsContext.jsx` — loads foundations + owns foundations progress state.
- Create `client/src/routes/Foundations.jsx` — `/learn` home.
- Create `client/src/routes/foundations/FoundationsSession.jsx` — `/learn/session` queue runner.
- Create `client/src/routes/foundations/TeachCard.jsx` — teach panel.
- Create `client/src/routes/foundations/FoundationsRep.jsx` — one graded rep (editor + check + dock), reused by session and checkpoint.
- Create `client/src/routes/foundations/Checkpoint.jsx` — `/learn/checkpoint/:id`.
- Create `client/src/routes/foundations/foundations.css` — styles.
- Modify `client/src/App.jsx` — providers, routes, `/` redirect, `/academy`.
- Modify `client/src/components/AppShell.jsx` — add Learn nav group; Dashboard nav → `/academy`.

**Engine constants (single source, defined in `client/src/lib/foundations.js`):** `STRONG_THRESHOLD = 3`, `SPACING_GAP = 2`, `MAX_REVIEWS_PER_SESSION = 2`, `CHECKPOINT_SIZE = 6`, `CHECKPOINT_PASS = 5`.

---

### Task 1: Author the Foundations content module + validate against live DB

**Files:**
- Create: `src/foundations.js`
- Create: `scripts/validate-foundations.js`

- [ ] **Step 1: Create `src/foundations.js` with the full authored track**

```js
// Authored beginner content for the Foundations track. Hand-written data (not
// parsed HTML). Every exercise is graded by /api/check against expectedSql on
// the chinook database. expectedSql is deterministic (single-row, or ORDER BY a
// unique key) so the result-set grader never rejects a correct answer on row order.

const DB = 'chinook';

function ex(id, skill, task, expectedSql, opts = {}) {
  return {
    id,
    skill,
    database: DB,
    task,
    starterSql: opts.starterSql || '',
    hint: opts.hint || '',
    expectedSql: expectedSql.trim()
  };
}

const CONCEPTS = [
  {
    id: 'c1-select-all', order: 1, skill: 'select-all',
    title: 'Ask a table for everything',
    teach: {
      plain: 'A database table is like a spreadsheet: columns across the top, one row per record. A query is a question you ask a table. SELECT * FROM genre means "show every column (the * ) for every row in the genre table."',
      mentalModel: 'SELECT = "show me", * = "all columns", FROM genre = "from this table".',
      example: { sql: 'SELECT * FROM genre;', note: 'Returns all 25 genres with both columns (genre_id and name).' }
    },
    exercises: [
      ex('c1-r1', 'select-all', 'Show everything — every column and every row — from the genre table.', 'SELECT * FROM genre;', { starterSql: 'SELECT ____ FROM genre;', hint: 'The star * means "all columns".' }),
      ex('c1-r2', 'select-all', 'Show everything in the media_type table.', 'SELECT * FROM media_type;', { hint: 'Same shape as the example, different table name.' }),
      ex('c1-r3', 'select-all', 'Show everything in the playlist table.', 'SELECT * FROM playlist;', { hint: 'SELECT * FROM <table>;' })
    ]
  },
  {
    id: 'c2-select-columns', order: 2, skill: 'select-columns',
    title: 'Pick the columns you want',
    teach: {
      plain: 'You usually do not want every column. Instead of *, list the columns you want after SELECT, separated by commas. SELECT name FROM track shows only the track names.',
      mentalModel: 'Replace * with a comma-separated list of column names.',
      example: { sql: 'SELECT name, composer FROM track;', note: 'Shows just two columns: the track name and its composer.' }
    },
    exercises: [
      ex('c2-r1', 'select-columns', 'Show only the name column from the genre table.', 'SELECT name FROM genre;', { starterSql: 'SELECT ____ FROM genre;', hint: 'Put the column name where the * used to be.' }),
      ex('c2-r2', 'select-columns', 'Show only the name column from the media_type table.', 'SELECT name FROM media_type;', { hint: 'One column: name.' }),
      ex('c2-r3', 'select-columns', 'Show the genre_id and name columns (in that order) from the genre table.', 'SELECT genre_id, name FROM genre;', { hint: 'Two columns separated by a comma.' })
    ]
  },
  {
    id: 'c3-order-limit', order: 3, skill: 'order-limit',
    title: 'Sort and take the top rows',
    teach: {
      plain: 'ORDER BY sorts the rows by a column. Add DESC after the column for high-to-low (default is low-to-high). LIMIT keeps only the first N rows, which is how you answer "top" or "longest" questions.',
      mentalModel: 'ORDER BY <column> [DESC] sorts; LIMIT <n> keeps the first n rows.',
      example: { sql: 'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 5;', note: 'The 5 longest tracks, longest first.' }
    },
    exercises: [
      ex('c3-r1', 'order-limit', 'Show the 10 longest tracks — their name and milliseconds — longest first.', 'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 10;', { starterSql: 'SELECT name, milliseconds FROM track ORDER BY ____ DESC LIMIT 10;', hint: 'Longest first means sort by milliseconds DESC, then LIMIT 10.' }),
      ex('c3-r2', 'order-limit', 'Show the genre_id and name of every genre, sorted alphabetically by name.', 'SELECT genre_id, name FROM genre ORDER BY name;', { hint: 'ORDER BY name (no DESC = A to Z).' }),
      ex('c3-r3', 'order-limit', 'Show the genre_id and name of every genre, from highest genre_id to lowest.', 'SELECT genre_id, name FROM genre ORDER BY genre_id DESC;', { hint: 'Highest first means DESC.' })
    ]
  },
  {
    id: 'c4-distinct', order: 4, skill: 'distinct',
    title: 'Remove duplicate values',
    teach: {
      plain: 'DISTINCT removes duplicate rows from the result, so you see each value only once. SELECT DISTINCT unit_price FROM track lists each price that appears, without repeats.',
      mentalModel: 'SELECT DISTINCT <columns> = the unique combinations of those columns.',
      example: { sql: 'SELECT DISTINCT unit_price FROM track ORDER BY unit_price;', note: 'Only two prices exist in the whole track table: 0.99 and 1.99.' }
    },
    exercises: [
      ex('c4-r1', 'distinct', 'Show each unit price that appears in the track table, with no duplicates, lowest first.', 'SELECT DISTINCT unit_price FROM track ORDER BY unit_price;', { starterSql: 'SELECT DISTINCT ____ FROM track ORDER BY unit_price;', hint: 'DISTINCT goes right after SELECT.' }),
      ex('c4-r2', 'distinct', 'Show each distinct genre_id used by tracks, lowest first.', 'SELECT DISTINCT genre_id FROM track ORDER BY genre_id;', { hint: 'SELECT DISTINCT genre_id ...' }),
      ex('c4-r3', 'distinct', 'Show each distinct media_type_id used by tracks, lowest first.', 'SELECT DISTINCT media_type_id FROM track ORDER BY media_type_id;', { hint: 'SELECT DISTINCT media_type_id ...' })
    ]
  },
  {
    id: 'c5-where', order: 5, skill: 'where',
    title: 'Keep only the rows you want',
    teach: {
      plain: 'WHERE filters rows to only those that match a condition. Use comparisons like > < = , combine them with AND / OR, and use IN (a, b, c) to match any of several values. The WHERE clause goes after FROM and before ORDER BY.',
      mentalModel: 'FROM picks the table, WHERE throws away rows that fail the test, ORDER BY sorts what is left.',
      example: { sql: 'SELECT track_id, name FROM track WHERE unit_price > 0.99 ORDER BY track_id;', note: 'Only the more expensive (1.99) tracks survive the filter.' }
    },
    exercises: [
      ex('c5-r1', 'where', 'Show the track_id and name of tracks that cost more than 0.99, lowest track_id first.', 'SELECT track_id, name FROM track WHERE unit_price > 0.99 ORDER BY track_id;', { starterSql: 'SELECT track_id, name FROM track WHERE unit_price ____ 0.99 ORDER BY track_id;', hint: '"more than" is the > operator.' }),
      ex('c5-r2', 'where', 'Show the name and unit_price of tracks that cost exactly 1.99, ordered by track_id.', 'SELECT name, unit_price FROM track WHERE unit_price = 1.99 ORDER BY track_id;', { hint: 'Exactly means = . You can ORDER BY a column you did not select.' }),
      ex('c5-r3', 'where', 'Show the track_id and name of tracks in genre 1 (Rock), lowest track_id first.', 'SELECT track_id, name FROM track WHERE genre_id = 1 ORDER BY track_id;', { hint: 'WHERE genre_id = 1.' }),
      ex('c5-r4', 'where', 'Show the track_id and name of tracks whose genre_id is 1, 2, or 3, lowest track_id first.', 'SELECT track_id, name FROM track WHERE genre_id IN (1, 2, 3) ORDER BY track_id;', { hint: 'WHERE genre_id IN (1, 2, 3).' })
    ]
  },
  {
    id: 'c6-null', order: 6, skill: 'null',
    title: 'Handle missing values (NULL)',
    teach: {
      plain: 'NULL means "no value" — the data is missing. You cannot test it with = ; you must use IS NULL or IS NOT NULL. In the track table, many rows have no composer listed, so composer is NULL for them.',
      mentalModel: 'NULL is "unknown". Use IS NULL / IS NOT NULL, never = NULL.',
      example: { sql: 'SELECT track_id, name FROM track WHERE composer IS NULL ORDER BY track_id;', note: '977 tracks have no composer recorded.' }
    },
    exercises: [
      ex('c6-r1', 'null', 'Show the track_id and name of tracks that have no composer listed, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NULL ORDER BY track_id;', { starterSql: 'SELECT track_id, name FROM track WHERE composer ____ ORDER BY track_id;', hint: '"no composer" means composer IS NULL.' }),
      ex('c6-r2', 'null', 'Show the track_id and name of tracks that DO have a composer, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NOT NULL ORDER BY track_id;', { hint: 'IS NOT NULL.' }),
      ex('c6-r3', 'null', 'Show the track_id and name of Rock tracks (genre_id 1) that have no composer, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NULL AND genre_id = 1 ORDER BY track_id;', { hint: 'Combine two conditions with AND.' })
    ]
  },
  {
    id: 'c7-aggregate', order: 7, skill: 'aggregate',
    title: 'Summarize with COUNT, SUM, AVG',
    teach: {
      plain: 'Aggregate functions collapse many rows into one summary number. COUNT(*) counts rows, SUM adds a column up, AVG averages it, MIN and MAX find extremes. Wrap the column in the function: AVG(milliseconds).',
      mentalModel: 'One aggregate over the whole table returns exactly one row.',
      example: { sql: 'SELECT COUNT(*), ROUND(AVG(milliseconds)) FROM track;', note: 'How many tracks there are, and their average length rounded to a whole number.' }
    },
    exercises: [
      ex('c7-r1', 'aggregate', 'Count how many rows are in the track table.', 'SELECT COUNT(*) FROM track;', { starterSql: 'SELECT ____ FROM track;', hint: 'COUNT(*) counts every row.' }),
      ex('c7-r2', 'aggregate', 'Show the average track length in milliseconds, rounded to a whole number.', 'SELECT ROUND(AVG(milliseconds)) FROM track;', { hint: 'ROUND(AVG(milliseconds)). Do not add an alias.' }),
      ex('c7-r3', 'aggregate', 'Show the lowest and highest unit_price in the track table (min first, then max).', 'SELECT MIN(unit_price), MAX(unit_price) FROM track;', { hint: 'Two functions: MIN(unit_price), MAX(unit_price).' }),
      ex('c7-r4', 'aggregate', 'Show the total of all milliseconds across every track.', 'SELECT SUM(milliseconds) FROM track;', { hint: 'SUM(milliseconds).' })
    ]
  },
  {
    id: 'c8-group-by', order: 8, skill: 'group-by',
    title: 'Summarize per group with GROUP BY',
    teach: {
      plain: 'GROUP BY splits the table into groups and runs the aggregate once per group. SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id gives one row per genre with its track count. Every non-aggregated column in SELECT must also appear in GROUP BY.',
      mentalModel: 'GROUP BY <column> = "for each value of that column, summarize its rows".',
      example: { sql: 'SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id ORDER BY genre_id;', note: 'One row per genre, showing how many tracks it has.' }
    },
    exercises: [
      ex('c8-r1', 'group-by', 'For each genre_id, count how many tracks it has. Show genre_id and the count, lowest genre_id first.', 'SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id ORDER BY genre_id;', { starterSql: 'SELECT genre_id, COUNT(*) FROM track GROUP BY ____ ORDER BY genre_id;', hint: 'GROUP BY the column you are counting per: genre_id.' }),
      ex('c8-r2', 'group-by', 'For each album_id, count how many tracks it has. Show album_id and the count, lowest album_id first.', 'SELECT album_id, COUNT(*) FROM track GROUP BY album_id ORDER BY album_id;', { hint: 'GROUP BY album_id.' }),
      ex('c8-r3', 'group-by', 'For each unit_price, count how many tracks have that price. Show unit_price and the count, lowest price first.', 'SELECT unit_price, COUNT(*) FROM track GROUP BY unit_price ORDER BY unit_price;', { hint: 'GROUP BY unit_price.' }),
      ex('c8-r4', 'group-by', 'For each genre_id, show the average track length rounded to a whole number. Show genre_id and the rounded average, lowest genre_id first.', 'SELECT genre_id, ROUND(AVG(milliseconds)) FROM track GROUP BY genre_id ORDER BY genre_id;', { hint: 'ROUND(AVG(milliseconds)) with GROUP BY genre_id.' })
    ]
  }
];

const CHECKPOINTS = [
  { id: 'cpA', afterOrder: 4, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct'], title: 'Checkpoint A: mixed practice (SELECT → DISTINCT)' },
  { id: 'cpB', afterOrder: 8, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct', 'where', 'null', 'aggregate', 'group-by'], title: 'Checkpoint B: mixed practice (everything so far)' }
];

const SKILLS = CONCEPTS.map((c) => ({ skill: c.skill, conceptId: c.id, title: c.title, order: c.order }));

function getFoundations() {
  const exercises = CONCEPTS.flatMap((c) => c.exercises);
  return {
    dataset: DB,
    concepts: CONCEPTS,
    checkpoints: CHECKPOINTS,
    skills: SKILLS,
    exercises // flat list of every rep
  };
}

module.exports = { getFoundations };
```

- [ ] **Step 2: Create `scripts/validate-foundations.js` (runs every expectedSql against the live DB, asserts success, non-empty, deterministic)**

```js
// Validates every Foundations expectedSql against the running server's /api/check-style
// execution. Requires `npm start` running on PORT (default 3000). Fails loudly on any
// query that errors, returns zero rows, or is non-deterministic (differs across two runs).
const http = require('http');
const { getFoundations } = require('../src/foundations');

const PORT = process.env.PORT || 3000;

function runQuery(database, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ database, sql });
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/query', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            resolve(parsed);
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const { exercises } = getFoundations();
  let failures = 0;
  for (const exercise of exercises) {
    try {
      const a = await runQuery(exercise.database, exercise.expectedSql);
      const b = await runQuery(exercise.database, exercise.expectedSql);
      const rowsA = JSON.stringify(a.rows);
      const rowsB = JSON.stringify(b.rows);
      const problems = [];
      if (!a.rows.length) problems.push('ZERO ROWS');
      if (rowsA !== rowsB) problems.push('NON-DETERMINISTIC (row order/values differ across runs)');
      if (problems.length) {
        failures += 1;
        console.error(`FAIL ${exercise.id} [${exercise.skill}]: ${problems.join(', ')}\n  SQL: ${exercise.expectedSql}`);
      } else {
        console.log(`ok   ${exercise.id} [${exercise.skill}] -> ${a.rows.length} row(s), cols ${JSON.stringify(a.columns)}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${exercise.id} [${exercise.skill}]: ${error.message}\n  SQL: ${exercise.expectedSql}`);
    }
  }
  console.log(`\n${exercises.length - failures}/${exercises.length} exercises valid.`);
  process.exit(failures ? 1 : 0);
}

main();
```

- [ ] **Step 3: Start the server and run the validator**

Run: `node server.js &` (wait 3s for it to bind), then `node scripts/validate-foundations.js`
Expected: `27/27 exercises valid.` and exit 0. Every line `ok`.
If any line is `FAIL`: fix that exercise's `expectedSql` in `src/foundations.js` (a zero-row result means the filter matches nothing — pick different values; non-deterministic means add/adjust an `ORDER BY` on a unique key like `track_id`, `genre_id`, or `album_id`). Re-run until all pass. Stop the server afterward (`pkill -f "node server.js"`).

- [ ] **Step 4: Commit**

```bash
git add src/foundations.js scripts/validate-foundations.js
git commit -m "feat: authored Foundations beginner content, validated against live chinook"
```

---

### Task 2: Surface `foundations` through the curriculum API + server content test

**Files:**
- Modify: `src/curriculum-service.js` (the `buildCurriculum` return, around line 385-402)
- Create: `test/foundations-content.test.js`

- [ ] **Step 1: Write the failing content test** (`test/foundations-content.test.js`)

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCurriculum } = require('../src/curriculum-service');

test('curriculum includes a foundations block', () => {
  const curriculum = buildCurriculum();
  assert.ok(curriculum.foundations, 'foundations present');
  assert.equal(curriculum.foundations.dataset, 'chinook');
  assert.equal(curriculum.foundations.concepts.length, 8, 'eight concepts');
  assert.equal(curriculum.foundations.checkpoints.length, 2, 'two checkpoints');
});

test('every foundations exercise is checkable against chinook', () => {
  const { foundations } = buildCurriculum();
  for (const exercise of foundations.exercises) {
    assert.equal(exercise.database, 'chinook', `${exercise.id} targets chinook`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((s) => s.trim()).length, 1, `${exercise.id} is a single statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill tag`);
  }
});

test('checkpoints reference real skills, concepts are ordered 1..8', () => {
  const { foundations } = buildCurriculum();
  const skills = new Set(foundations.skills.map((s) => s.skill));
  for (const cp of foundations.checkpoints) {
    for (const skill of cp.drawFromSkills) {
      assert.ok(skills.has(skill), `checkpoint ${cp.id} references known skill ${skill}`);
    }
  }
  assert.deepEqual(foundations.concepts.map((c) => c.order), [1, 2, 3, 4, 5, 6, 7, 8]);
});
```

- [ ] **Step 2: Run it — fails** — `node --test test/foundations-content.test.js` → FAIL (`curriculum.foundations` is undefined).

- [ ] **Step 3: Wire foundations into `buildCurriculum`**

In `src/curriculum-service.js`, add near the top with the other requires:

```js
const { getFoundations } = require('./foundations');
```

In `buildCurriculum`, before the `return`, add:

```js
  const foundations = getFoundations();
```

and add `foundations` to the returned object (alongside `weeks`, `sessions`, `exercises`, `stats`):

```js
  return {
    product: { /* unchanged */ },
    weeks,
    sessions,
    exercises,
    foundations,
    stats: { /* unchanged */ }
  };
```

- [ ] **Step 4: Run tests — pass** — `node --test test/*.test.js` → all pass (existing + new).

- [ ] **Step 5: Commit**

```bash
git add src/curriculum-service.js test/foundations-content.test.js
git commit -m "feat: expose foundations track via buildCurriculum with content tests"
```

---

### Task 3: The scheduling engine (pure, TDD)

**Files:**
- Create: `client/src/lib/foundations.js`
- Create: `client/src/lib/foundations.test.js`

- [ ] **Step 1: Write the failing engine tests** (`client/src/lib/foundations.test.js`)

```js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFoundations, saveFoundations, FOUNDATIONS_KEY,
  skillLevel, isSkillStrong, recordCorrect, recordAttempt,
  dueReviews, nextConcept, checkpointDue, buildTodaySession,
  recordCheckpointResult, advanceSession, graduationStatus,
  STRONG_THRESHOLD, SPACING_GAP
} from './foundations.js';

// Minimal track fixture mirroring src/foundations.js shape.
const track = {
  dataset: 'chinook',
  skills: [
    { skill: 'select-all', conceptId: 'c1', title: 'A', order: 1 },
    { skill: 'select-columns', conceptId: 'c2', title: 'B', order: 2 },
    { skill: 'order-limit', conceptId: 'c3', title: 'C', order: 3 },
    { skill: 'distinct', conceptId: 'c4', title: 'D', order: 4 },
    { skill: 'where', conceptId: 'c5', title: 'E', order: 5 }
  ],
  concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [{ id: 'c1-r1', skill: 'select-all' }, { id: 'c1-r2', skill: 'select-all' }, { id: 'c1-r3', skill: 'select-all' }] },
    { id: 'c2', order: 2, skill: 'select-columns', title: 'B', exercises: [{ id: 'c2-r1', skill: 'select-columns' }, { id: 'c2-r2', skill: 'select-columns' }, { id: 'c2-r3', skill: 'select-columns' }] },
    { id: 'c3', order: 3, skill: 'order-limit', title: 'C', exercises: [{ id: 'c3-r1', skill: 'order-limit' }, { id: 'c3-r2', skill: 'order-limit' }, { id: 'c3-r3', skill: 'order-limit' }] },
    { id: 'c4', order: 4, skill: 'distinct', title: 'D', exercises: [{ id: 'c4-r1', skill: 'distinct' }, { id: 'c4-r2', skill: 'distinct' }, { id: 'c4-r3', skill: 'distinct' }] },
    { id: 'c5', order: 5, skill: 'where', title: 'E', exercises: [{ id: 'c5-r1', skill: 'where' }, { id: 'c5-r2', skill: 'where' }] }
  ],
  checkpoints: [
    { id: 'cpA', afterOrder: 4, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct'], title: 'A' },
    { id: 'cpB', afterOrder: 5, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct', 'where'], title: 'B' }
  ]
};

function strong(state, skill, ids) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

describe('foundations engine', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default and round-trips under its own key', () => {
    const s = loadFoundations();
    expect(s).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 });
    s.attempts['x'] = 2; saveFoundations(s);
    expect(JSON.parse(localStorage.getItem(FOUNDATIONS_KEY)).attempts.x).toBe(2);
  });

  it('skillLevel counts distinct correct exercises and tiers at STRONG_THRESHOLD', () => {
    const s = loadFoundations();
    expect(skillLevel(s, 'where')).toEqual({ count: 0, tier: 'new' });
    recordCorrect(s, { id: 'c5-r1', skill: 'where' });
    recordCorrect(s, { id: 'c5-r1', skill: 'where' }); // duplicate does not double-count
    expect(skillLevel(s, 'where').count).toBe(1);
    expect(skillLevel(s, 'where').tier).toBe('learning');
    recordCorrect(s, { id: 'c5-r2', skill: 'where' });
    recordCorrect(s, { id: 'c5-r3', skill: 'where' });
    expect(skillLevel(s, 'where').count).toBe(3);
    expect(isSkillStrong(s, 'where')).toBe(true);
    expect(STRONG_THRESHOLD).toBe(3);
  });

  it('nextConcept returns the first not-strong concept, gated by the prior checkpoint', () => {
    const s = loadFoundations();
    expect(nextConcept(track, s).id).toBe('c1');
    strong(s, 'select-all', ['c1-r1', 'c1-r2', 'c1-r3']);
    expect(nextConcept(track, s).id).toBe('c2');
    // make 1..4 strong; concept 5 is gated behind checkpoint cpA
    strong(s, 'select-columns', ['c2-r1', 'c2-r2', 'c2-r3']);
    strong(s, 'order-limit', ['c3-r1', 'c3-r2', 'c3-r3']);
    strong(s, 'distinct', ['c4-r1', 'c4-r2', 'c4-r3']);
    expect(nextConcept(track, s)).toBe(null); // c5 blocked until cpA passes
    expect(checkpointDue(track, s).id).toBe('cpA');
    recordCheckpointResult(s, track.checkpoints[0], 6);
    expect(nextConcept(track, s).id).toBe('c5');
  });

  it('dueReviews resurfaces learned skills after SPACING_GAP sessions, capped and preferring unseen exercises', () => {
    const s = loadFoundations();
    recordCorrect(s, { id: 'c1-r1', skill: 'select-all' }); // learned this session (counter 0)
    expect(dueReviews(track, s)).toEqual([]); // not due yet
    advanceSession(s); advanceSession(s); // counter 2, gap satisfied
    expect(SPACING_GAP).toBe(2);
    const due = dueReviews(track, s);
    expect(due.length).toBe(1);
    expect(due[0].skill).toBe('select-all');
    expect(['c1-r2', 'c1-r3']).toContain(due[0].exercise.id); // prefers an unanswered rep
  });

  it('buildTodaySession puts reviews before the new concept', () => {
    const s = loadFoundations();
    recordCorrect(s, { id: 'c1-r1', skill: 'select-all' });
    advanceSession(s); advanceSession(s);
    const session = buildTodaySession(track, s);
    expect(session.reviews.length).toBe(1);
    expect(session.main.kind).toBe('lesson');
    expect(session.main.concept.id).toBe('c2'); // c1 not strong (1 correct) -> still next? see note
  });

  it('graduationStatus flips only when all skills strong and both checkpoints passed', () => {
    const s = loadFoundations();
    track.skills.forEach((sk) => strong(s, sk.skill, [`${sk.conceptId}-r1`, `${sk.conceptId}-r2`, `${sk.conceptId}-r3`]));
    let g = graduationStatus(track, s);
    expect(g.graduated).toBe(false); // checkpoints not passed
    recordCheckpointResult(s, track.checkpoints[0], 6);
    recordCheckpointResult(s, track.checkpoints[1], 6);
    g = graduationStatus(track, s);
    expect(g.graduated).toBe(true);
    expect(g.strongSkills).toBe(track.skills.length);
  });

  it('recordCheckpointResult passes at CHECKPOINT_PASS and forces missed skills due on fail', () => {
    const s = loadFoundations();
    recordCheckpointResult(s, track.checkpoints[0], 5);
    expect(s.checkpointsPassed).toContain('cpA');
    const s2 = loadFoundations();
    recordCheckpointResult(s2, track.checkpoints[0], 3, ['distinct']);
    expect(s2.checkpointsPassed).not.toContain('cpA');
  });
});
```

Note on the `c2` expectation: in the test above, `c1` has only 1 correct (`c1-r1`), so it is not strong. `nextConcept` returns the first not-strong concept, which would be `c1`. Adjust the implementation contract so the test matches: **`buildTodaySession.main.concept` is the first concept that is not yet strong** — with `c1` at 1/3 it should be `c1`, not `c2`. Fix the test expectation to `c1` when writing (the reviews come from the same skill, which is fine — a review of `select-all` plus continuing `c1`'s remaining reps). Keep the two consistent; the implementation below returns the first not-strong concept.

- [ ] **Step 2: Run — fails** — `npm --prefix client test` → FAIL (module missing).

- [ ] **Step 3: Implement `client/src/lib/foundations.js`**

```js
import { safeGet, safeSet } from './progress.js';

export const FOUNDATIONS_KEY = 'sqlm:foundations:v1';
export const STRONG_THRESHOLD = 3;
export const SPACING_GAP = 2;
export const MAX_REVIEWS_PER_SESSION = 2;
export const CHECKPOINT_SIZE = 6;
export const CHECKPOINT_PASS = 5;

function defaultState() {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 };
}

function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

export function loadFoundations() {
  try {
    const parsed = JSON.parse(safeGet(FOUNDATIONS_KEY));
    if (parsed && typeof parsed === 'object') {
      return {
        skillCorrect: asObject(parsed.skillCorrect),
        attempts: asObject(parsed.attempts),
        lastSql: asObject(parsed.lastSql),
        lastPracticedSession: asObject(parsed.lastPracticedSession),
        checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
        sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0
      };
    }
  } catch { /* fall through */ }
  return defaultState();
}

export function saveFoundations(state) { safeSet(FOUNDATIONS_KEY, JSON.stringify(state)); }

export function skillLevel(state, skill) {
  const count = (state.skillCorrect[skill] || []).length;
  const tier = count >= STRONG_THRESHOLD ? 'strong' : count > 0 ? 'learning' : 'new';
  return { count, tier };
}
export function isSkillStrong(state, skill) { return skillLevel(state, skill).count >= STRONG_THRESHOLD; }

// Mutating recorders (return the same state; callers persist). New leaf objects/arrays
// are created so a shallow snapshot of state is not corrupted.
export function recordCorrect(state, exercise) {
  const list = state.skillCorrect[exercise.skill] ? [...state.skillCorrect[exercise.skill]] : [];
  if (!list.includes(exercise.id)) list.push(exercise.id);
  state.skillCorrect = { ...state.skillCorrect, [exercise.skill]: list };
  state.lastPracticedSession = { ...state.lastPracticedSession, [exercise.skill]: state.sessionCounter };
  return state;
}
export function recordAttempt(state, exerciseId) {
  state.attempts = { ...state.attempts, [exerciseId]: (state.attempts[exerciseId] || 0) + 1 };
  return state;
}
export function advanceSession(state) { state.sessionCounter += 1; return state; }

function isLearned(state, skill) { return (state.skillCorrect[skill] || []).length > 0; }

export function dueReviews(track, state) {
  const out = [];
  for (const s of track.skills) {
    if (!isLearned(state, s.skill)) continue;
    const last = state.lastPracticedSession[s.skill];
    if (last === undefined) continue;
    if (state.sessionCounter - last < SPACING_GAP) continue;
    const concept = track.concepts.find((c) => c.skill === s.skill);
    if (!concept) continue;
    const answered = new Set(state.skillCorrect[s.skill] || []);
    const unseen = concept.exercises.find((e) => !answered.has(e.id));
    const exercise = unseen || concept.exercises[(state.sessionCounter + out.length) % concept.exercises.length];
    out.push({ skill: s.skill, concept, exercise });
    if (out.length >= MAX_REVIEWS_PER_SESSION) break;
  }
  return out;
}

function checkpointPassed(state, id) { return state.checkpointsPassed.includes(id); }

// A concept of order N > the highest checkpoint boundary <= N-1 requires that checkpoint passed.
function conceptUnlocked(track, state, concept) {
  const gating = track.checkpoints
    .filter((cp) => cp.afterOrder < concept.order)
    .sort((a, b) => b.afterOrder - a.afterOrder)[0];
  return !gating || checkpointPassed(state, gating.id);
}

export function nextConcept(track, state) {
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (isSkillStrong(state, concept.skill)) continue;
    if (!conceptUnlocked(track, state, concept)) return null;
    return concept;
  }
  return null;
}

export function checkpointDue(track, state) {
  const ordered = [...track.checkpoints].sort((a, b) => a.afterOrder - b.afterOrder);
  for (const cp of ordered) {
    if (checkpointPassed(state, cp.id)) continue;
    const conceptsBefore = track.concepts.filter((c) => c.order <= cp.afterOrder);
    if (conceptsBefore.every((c) => isSkillStrong(state, c.skill))) return cp;
  }
  return null;
}

export function buildTodaySession(track, state) {
  const reviews = dueReviews(track, state);
  const cp = checkpointDue(track, state);
  if (cp) return { reviews, main: { kind: 'checkpoint', checkpoint: cp } };
  const concept = nextConcept(track, state);
  if (!concept) return { reviews, main: { kind: 'graduated' } };
  const answered = new Set(state.skillCorrect[concept.skill] || []);
  const reps = concept.exercises.filter((e) => !answered.has(e.id));
  return { reviews, main: { kind: 'lesson', concept, reps: reps.length ? reps : concept.exercises } };
}

export function recordCheckpointResult(state, checkpoint, score, missedSkills = []) {
  if (score >= CHECKPOINT_PASS) {
    if (!state.checkpointsPassed.includes(checkpoint.id)) state.checkpointsPassed = [...state.checkpointsPassed, checkpoint.id];
  } else {
    const forced = { ...state.lastPracticedSession };
    missedSkills.forEach((skill) => { forced[skill] = state.sessionCounter - SPACING_GAP; });
    state.lastPracticedSession = forced;
  }
  return state;
}

export function graduationStatus(track, state) {
  const strongSkills = track.skills.filter((s) => isSkillStrong(state, s.skill)).length;
  const totalSkills = track.skills.length;
  const allCheckpoints = track.checkpoints.every((cp) => checkpointPassed(state, cp.id));
  return { strongSkills, totalSkills, checkpointsPassed: [...state.checkpointsPassed], graduated: strongSkills === totalSkills && allCheckpoints };
}
```

- [ ] **Step 4: Fix the one test expectation** noted in Step 1 (`buildTodaySession` main concept is `c1` while `select-all` has 1/3 correct). Change that assertion to `expect(session.main.concept.id).toBe('c1');`.

- [ ] **Step 5: Run — pass** — `npm --prefix client test` → all green.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/foundations.js client/src/lib/foundations.test.js
git commit -m "feat: foundations scheduling engine (mastery, spacing, checkpoints) with tests"
```

---

### Task 4: Shared check hook + Foundations context

**Files:**
- Create: `client/src/lib/useSqlCheck.js`
- Create: `client/src/state/FoundationsContext.jsx`

- [ ] **Step 1: Create `client/src/lib/useSqlCheck.js`** (editor value + grade-against-expected + feedback; reused by reps and checkpoint)

```js
import { useState } from 'react';
import { api } from './api.js';

const TONE = { ok: 'tip', err: 'warn', warn: 'caution', info: 'info' };

// Runs one graded SQL check against an exercise's expectedSql. onResult(correct, body)
// lets the caller record mastery / advance. Feedback tone maps to Callout tones.
export function useSqlCheck(exercise, { onResult, onAttempt } = {}) {
  const [sql, setSql] = useState(exercise.starterSql || '');
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  async function runCheck() {
    if (checking) return;
    const trimmed = sql.trim();
    if (!trimmed || trimmed === (exercise.starterSql || '').trim()) {
      setFeedback({ toneClass: TONE.warn, title: 'Write your query first', message: 'Replace the blank (____) or type your SQL, then run it.' });
      return;
    }
    setChecking(true);
    onAttempt?.();
    setFeedback({ toneClass: TONE.info, title: 'Checking…', message: 'Running your SQL against the expected answer.' });
    try {
      const body = await api.check(exercise.database, trimmed, exercise.expectedSql);
      setResult(body.result || null);
      if (body.correct) {
        setFeedback({ toneClass: TONE.ok, title: body.message || 'Correct!', message: body.why || '' });
      } else {
        setFeedback({
          toneClass: body.feedbackType === 'error' ? TONE.err : TONE.warn,
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Not quite yet',
          message: body.feedbackType === 'error' ? [body.message, body.hint].filter(Boolean).join(' — ') : (body.hint || body.message)
        });
      }
      onResult?.(Boolean(body.correct), body);
    } catch (error) {
      setResult(null);
      setFeedback({ toneClass: TONE.err, title: 'The checker could not run', message: `${error.message}${error.hint ? ` — ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return { sql, setSql, feedback, result, checking, runCheck };
}
```

- [ ] **Step 2: Create `client/src/state/FoundationsContext.jsx`** (loads foundations from curriculum, owns progress state)

```jsx
import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useCurriculum } from './CurriculumContext.jsx';
import { loadFoundations, saveFoundations } from '../lib/foundations.js';

const Ctx = createContext(null);
export const useFoundations = () => useContext(Ctx);

export function FoundationsProvider({ children }) {
  const { curriculum } = useCurriculum();
  const [state, setState] = useState(loadFoundations);

  // mutate receives the current state object, mutates it (recorders create new leaves),
  // then it is persisted and a fresh reference is stored to trigger re-render.
  const update = useCallback((mutate) => {
    setState((prev) => {
      const next = {
        ...prev,
        skillCorrect: { ...prev.skillCorrect },
        attempts: { ...prev.attempts },
        lastSql: { ...prev.lastSql },
        lastPracticedSession: { ...prev.lastPracticedSession },
        checkpointsPassed: [...prev.checkpointsPassed]
      };
      mutate(next);
      saveFoundations(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ track: curriculum ? curriculum.foundations : null, state, update }), [curriculum, state, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 3: Verify build** — `npm --prefix client run build` succeeds (imports resolve). No test yet (thin glue; covered by view tasks + visual pass).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/useSqlCheck.js client/src/state/FoundationsContext.jsx
git commit -m "feat: shared SQL check hook and Foundations context"
```

---

### Task 5: `FoundationsRep` and `TeachCard` components

**Files:**
- Create: `client/src/routes/foundations/TeachCard.jsx`
- Create: `client/src/routes/foundations/FoundationsRep.jsx`
- Create: `client/src/routes/foundations/foundations.css`

- [ ] **Step 1: Create `TeachCard.jsx`**

```jsx
export function TeachCard({ concept }) {
  const { teach, title } = concept;
  return (
    <section className="teach-card">
      <span className="teach-kicker">Learn this</span>
      <h2>{title}</h2>
      <p className="teach-plain">{teach.plain}</p>
      <p className="teach-model"><strong>Mental model:</strong> {teach.mentalModel}</p>
      <div className="teach-example">
        <span className="teach-example-label">Worked example</span>
        <pre>{teach.example.sql}</pre>
        <p>{teach.example.note}</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `FoundationsRep.jsx`** (one graded rep: label, editor seeded with starter, run/check, feedback, dock)

```jsx
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { useSqlCheck } from '../../lib/useSqlCheck.js';
import { recordCorrect, recordAttempt } from '../../lib/foundations.js';
import { SqlEditor } from '../../components/SqlEditor.jsx';
import { OutputDock } from '../session/OutputDock.jsx';
import { Button, Callout, Pill } from '../../components/ui.jsx';

const isMac = navigator.platform.toUpperCase().includes('MAC');

// label: e.g. "Review: Sort and take the top rows" or "New — Rep 2 of 3".
// onCorrect: called once when this rep is first answered correctly (to advance the queue).
export function FoundationsRep({ exercise, label, kind, onCorrect }) {
  const { update } = useFoundations();
  const check = useSqlCheck(exercise, {
    onAttempt: () => update((s) => recordAttempt(s, exercise.id)),
    onResult: (correct) => { if (correct) { update((s) => recordCorrect(s, exercise)); onCorrect?.(); } }
  });

  return (
    <article className="fnd-rep">
      <div className="fnd-rep-head">
        <Pill tone={kind === 'review' ? 'info' : 'brand'}>{label}</Pill>
        <Pill tone="info">chinook</Pill>
      </div>
      <p className="fnd-task">{exercise.task}</p>
      <span className="wb-editor-label" aria-hidden="true">Your SQL — write your answer here</span>
      <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
        placeholder={(exercise.expectedSql || '').split('\n')[0]} ariaLabel="SQL editor" />
      <div className="fnd-actions">
        <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
          {check.checking ? 'Checking…' : `Run & check  ${isMac ? '⌘⏎' : 'Ctrl+⏎'}`}
        </Button>
        {exercise.hint ? <HintButton hint={exercise.hint} /> : null}
      </div>
      <div role="status" aria-live="polite">
        {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
      </div>
      <OutputDock exercise={exercise} result={check.result} />
    </article>
  );
}

import { useState } from 'react';
function HintButton({ hint }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={open}>Hint</Button>
      {open ? <Callout tone="tip" title="Hint">{hint}</Callout> : null}
    </>
  );
}
```

(Move the `import { useState }` to the top of the file with the other imports when writing — shown here inline only for readability. Final file: all imports at top.)

- [ ] **Step 3: Create `foundations.css`** (scoped styles, tokens only)

```css
.fnd-home-head h1 { font-size: var(--text-2xl); margin: var(--s-1) 0 var(--s-2); }
.fnd-home-head .goal { color: var(--ink-dim); max-width: 65ch; }

.teach-card { background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--s-5); margin-bottom: var(--s-4); }
.teach-kicker { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand); }
.teach-card h2 { font-size: var(--text-xl); margin: var(--s-1) 0 var(--s-3); }
.teach-plain { color: var(--ink-strong); max-width: 70ch; }
.teach-model { color: var(--ink); max-width: 70ch; }
.teach-example { margin-top: var(--s-3); border-left: 3px solid var(--brand); padding-left: var(--s-4); }
.teach-example-label { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-dim); }
.teach-example pre { margin: var(--s-2) 0; }
.teach-example p { color: var(--ink-dim); font-size: var(--text-sm); margin: 0; }

.fnd-rep { display: flex; flex-direction: column; gap: var(--s-3); border-top: 1px solid var(--line); padding-top: var(--s-4); margin-top: var(--s-4); }
.fnd-rep-head { display: flex; gap: var(--s-2); align-items: center; }
.fnd-task { color: var(--ink-strong); font-size: var(--text-md); max-width: 75ch; margin: 0; }
.fnd-actions { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }

.fnd-path { display: flex; flex-direction: column; gap: var(--s-2); margin: var(--s-4) 0; }
.fnd-step { display: flex; align-items: center; gap: var(--s-3); background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--s-3) var(--s-4); }
.fnd-step.strong { border-color: var(--ok); }
.fnd-step .fnd-step-num { display: grid; place-items: center; width: 26px; height: 26px; flex: none; border-radius: 50%; font-family: var(--font-mono); font-size: var(--text-xs); border: 1px solid var(--line); color: var(--ink-dim); }
.fnd-step.strong .fnd-step-num { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
.fnd-step-body { flex: 1; min-width: 0; }
.fnd-step-body strong { color: var(--ink-strong); display: block; font-size: var(--text-sm); }
.fnd-step-meter { height: 4px; border-radius: 2px; background: var(--surface-2); margin-top: 6px; overflow: hidden; }
.fnd-step-meter span { display: block; height: 100%; background: var(--brand); }
.fnd-checkpoint-row { border-style: dashed; }

.fnd-session-progress { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: var(--s-3); }
.fnd-done { text-align: center; padding: var(--s-7) var(--s-5); }
.cp-dots { display: flex; gap: var(--s-2); margin: var(--s-3) 0; }
.cp-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--line); }
.cp-dot.pass { background: var(--ok); border-color: transparent; }
.cp-dot.fail { background: var(--err); border-color: transparent; }
.cp-dot.current { border-color: var(--brand); }
```

- [ ] **Step 4: Verify build** — `npm --prefix client run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/routes/foundations/
git commit -m "feat: TeachCard, FoundationsRep, and foundations styles"
```

---

### Task 6: Foundations home route (`/learn`)

**Files:**
- Create: `client/src/routes/Foundations.jsx`

- [ ] **Step 1: Implement `Foundations.jsx`**

```jsx
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button, ProgressMeter } from '../components/ui.jsx';
import { useFoundations } from '../state/FoundationsContext.jsx';
import { skillLevel, buildTodaySession, graduationStatus } from '../lib/foundations.js';
import './foundations/foundations.css';

export default function Foundations() {
  const { track, state } = useFoundations();
  const navigate = useNavigate();

  if (!track) {
    return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading Foundations…" /></AppShell>;
  }

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const started = Object.values(state.skillCorrect).some((a) => a.length);

  const todayLabel = session.main.kind === 'graduated' ? 'All done'
    : session.main.kind === 'checkpoint' ? `Checkpoint: ${session.main.checkpoint.title}`
    : `${session.reviews.length ? `${session.reviews.length} quick review${session.reviews.length > 1 ? 's' : ''} + ` : ''}New lesson: ${session.main.concept.title}`;

  return (
    <AppShell breadcrumb={<span className="here">Learn — Foundations</span>}>
      <div className="fnd-home-head">
        <span className="teach-kicker">{started ? 'Keep going' : 'Start here'}</span>
        <h1>SQL Foundations</h1>
        <p className="goal">Learn to query a database one step at a time, on a real music-store dataset. Each concept comes back for review so it sticks.</p>
      </div>

      <section className="card" style={{ marginBottom: 'var(--s-4)' }}>
        <ProgressMeter value={Math.round((grad.strongSkills / grad.totalSkills) * 100)} label="Foundations mastery" />
        <p style={{ color: 'var(--ink-dim)', fontSize: 'var(--text-sm)', margin: 'var(--s-2) 0 var(--s-3)' }}>
          {grad.strongSkills} of {grad.totalSkills} skills strong · {grad.checkpointsPassed.length}/2 checkpoints passed
        </p>
        {grad.graduated ? (
          <>
            <p style={{ color: 'var(--ok)' }}>You have single-table fluency. Ready for the interview academy.</p>
            <Button variant="primary" onClick={() => navigate('/academy')}>Go to the Academy →</Button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--ink-strong)', marginBottom: 'var(--s-3)' }}>Today: {todayLabel}</p>
            <Button variant="primary" onClick={() => navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session')}>
              {started ? "Continue today's session" : 'Start lesson 1'}
            </Button>
          </>
        )}
      </section>

      <h2 style={{ fontSize: 'var(--text-lg)', margin: 'var(--s-4) 0 var(--s-2)' }}>Your path</h2>
      <div className="fnd-path">
        {track.concepts.map((c) => {
          const lvl = skillLevel(state, c.skill);
          return (
            <div key={c.id} className={`fnd-step ${lvl.tier === 'strong' ? 'strong' : ''}`}>
              <span className="fnd-step-num">{lvl.tier === 'strong' ? '✓' : c.order}</span>
              <div className="fnd-step-body">
                <strong>{c.title}</strong>
                <div className="fnd-step-meter"><span style={{ width: `${Math.min(100, (lvl.count / 3) * 100)}%` }} /></div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-dim)' }}>
                {lvl.tier === 'strong' ? 'strong' : lvl.tier === 'learning' ? `${lvl.count}/3` : 'new'}
              </span>
            </div>
          );
        })}
        {track.checkpoints.map((cp) => (
          <div key={cp.id} className={`fnd-step fnd-checkpoint-row ${state.checkpointsPassed.includes(cp.id) ? 'strong' : ''}`}>
            <span className="fnd-step-num">{state.checkpointsPassed.includes(cp.id) ? '✓' : '★'}</span>
            <div className="fnd-step-body"><strong>{cp.title}</strong></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-dim)' }}>
              {state.checkpointsPassed.includes(cp.id) ? 'passed' : 'checkpoint'}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify build** — `npm --prefix client run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/Foundations.jsx
git commit -m "feat: Foundations home route with mastery path and today's session"
```

---

### Task 7: Foundations session runner (`/learn/session`)

**Files:**
- Create: `client/src/routes/foundations/FoundationsSession.jsx`

- [ ] **Step 1: Implement `FoundationsSession.jsx`** (drives reviews → teach + reps; advances on correct; bumps sessionCounter at the end)

```jsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.jsx';
import { EmptyState, Button } from '../../components/ui.jsx';
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { buildTodaySession, advanceSession } from '../../lib/foundations.js';
import { TeachCard } from './TeachCard.jsx';
import { FoundationsRep } from './FoundationsRep.jsx';
import './foundations.css';

export default function FoundationsSession() {
  const { track, state, update } = useFoundations();
  const navigate = useNavigate();

  // Freeze the session plan for this visit so completing reps does not reshuffle it.
  const plan = useMemo(() => (track ? buildTodaySession(track, state) : null), [track]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => {
    if (!plan) return [];
    const s = plan.reviews.map((r) => ({ type: 'review', exercise: r.exercise, concept: r.concept }));
    if (plan.main.kind === 'lesson') plan.main.reps.forEach((ex) => s.push({ type: 'rep', exercise: ex, concept: plan.main.concept }));
    return s;
  }, [plan]);

  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading…" /></AppShell>;
  if (plan.main.kind === 'checkpoint') { navigate(`/learn/checkpoint/${plan.main.checkpoint.id}`, { replace: true }); return null; }
  if (plan.main.kind === 'graduated') { navigate('/learn', { replace: true }); return null; }

  function completeSession() {
    update((s) => advanceSession(s));
    setFinished(true);
  }

  if (finished) {
    return (
      <AppShell breadcrumb={<span className="here">Learn — session complete</span>}>
        <div className="fnd-done">
          <h1>Nice work.</h1>
          <p style={{ color: 'var(--ink-dim)' }}>You finished today's session. Come back for the next lesson and your spaced reviews.</p>
          <Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button>
        </div>
      </AppShell>
    );
  }

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const showTeach = step.type === 'rep' && (index === 0 || steps[index - 1].type !== 'rep');
  const label = step.type === 'review'
    ? `Review: ${step.concept.title}`
    : `New — ${step.concept.title}`;

  function next() { if (isLast) completeSession(); else setIndex((i) => i + 1); }

  return (
    <AppShell breadcrumb={<span className="here">Learn — Foundations</span>}>
      <div className="fnd-session-progress">Step {index + 1} of {steps.length}{step.type === 'review' ? ' · spaced review' : ''}</div>
      {showTeach ? <TeachCard concept={step.concept} /> : null}
      <FoundationsRep key={step.exercise.id} exercise={step.exercise} label={label} kind={step.type === 'review' ? 'review' : 'new'} />
      <div style={{ marginTop: 'var(--s-4)' }}>
        <Button variant="secondary" onClick={next}>{isLast ? 'Finish session' : 'Next →'}</Button>
      </div>
    </AppShell>
  );
}
```

Note: the learner can advance with "Next" even without solving (self-paced), matching the academy's non-blocking feel; mastery only advances on correct answers, so unsolved reps simply do not count toward "strong" and will resurface.

- [ ] **Step 2: Verify build** — `npm --prefix client run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/foundations/FoundationsSession.jsx
git commit -m "feat: Foundations session runner (reviews + teach + reps)"
```

---

### Task 8: Checkpoint route (`/learn/checkpoint/:id`)

**Files:**
- Create: `client/src/routes/foundations/Checkpoint.jsx`

- [ ] **Step 1: Implement `Checkpoint.jsx`** (6 interleaved questions, one at a time, seeded shuffle, pass/fail)

```jsx
import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.jsx';
import { EmptyState, Button, Callout } from '../../components/ui.jsx';
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { recordCheckpointResult, advanceSession, recordCorrect, recordAttempt, CHECKPOINT_SIZE, CHECKPOINT_PASS } from '../../lib/foundations.js';
import { FoundationsRep } from './FoundationsRep.jsx';
import './foundations.css';

// Deterministic shuffle seeded by sessionCounter so the question set is stable within a visit.
function seededPick(pool, count, seed) {
  const arr = [...pool];
  let s = seed + 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

export default function Checkpoint() {
  const { id } = useParams();
  const { track, state, update } = useFoundations();
  const navigate = useNavigate();

  const checkpoint = track ? track.checkpoints.find((c) => c.id === id) : null;
  const questions = useMemo(() => {
    if (!track || !checkpoint) return [];
    const pool = track.exercises.filter((e) => checkpoint.drawFromSkills.includes(e.skill));
    return seededPick(pool, CHECKPOINT_SIZE, state.sessionCounter); // eslint-disable-line react-hooks/exhaustive-deps
  }, [track, checkpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]); // booleans, per question
  const [done, setDone] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading…" /></AppShell>;
  if (!checkpoint) return <AppShell breadcrumb={<span className="here">Checkpoint</span>}><EmptyState title="Checkpoint not found" /></AppShell>;

  function answer(correct, exercise) {
    update((s) => { recordAttempt(s, exercise.id); if (correct) recordCorrect(s, exercise); });
    const nextResults = [...results, correct];
    if (index + 1 >= questions.length) finish(nextResults);
    else { setResults(nextResults); setIndex((i) => i + 1); }
  }

  function finish(finalResults) {
    const score = finalResults.filter(Boolean).length;
    const missedSkills = questions.filter((q, i) => !finalResults[i]).map((q) => q.skill);
    update((s) => { recordCheckpointResult(s, checkpoint, score, missedSkills); advanceSession(s); });
    setResults(finalResults);
    setDone(true);
  }

  if (done) {
    const score = results.filter(Boolean).length;
    const passed = score >= CHECKPOINT_PASS;
    return (
      <AppShell breadcrumb={<span className="here">Checkpoint result</span>}>
        <div className="fnd-done">
          <h1>{passed ? 'Checkpoint passed! ' : 'Almost there'}</h1>
          <p style={{ color: passed ? 'var(--ok)' : 'var(--ink-dim)' }}>You scored {score} / {questions.length} (need {CHECKPOINT_PASS} to pass).</p>
          {!passed ? <Callout tone="caution" title="Keep practicing">The skills you missed will come back as reviews. Try the checkpoint again after a bit more practice.</Callout> : null}
          <div style={{ marginTop: 'var(--s-4)' }}><Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button></div>
        </div>
      </AppShell>
    );
  }

  const q = questions[index];
  return (
    <AppShell breadcrumb={<span className="here">{checkpoint.title}</span>}>
      <div className="fnd-session-progress">Mixed practice · Question {index + 1} of {questions.length}</div>
      <div className="cp-dots">
        {questions.map((_, i) => (
          <span key={i} className={`cp-dot ${i < results.length ? (results[i] ? 'pass' : 'fail') : ''} ${i === index ? 'current' : ''}`} />
        ))}
      </div>
      <FoundationsRep key={q.id} exercise={q} label="Mixed practice" kind="new" onCorrect={() => { /* advance handled by button */ }} />
      <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-2)' }}>
        <Button variant="primary" onClick={() => answer(true, q)}>I solved it → next</Button>
        <Button variant="secondary" onClick={() => answer(false, q)}>Skip / couldn't solve</Button>
      </div>
      <p style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', marginTop: 'var(--s-2)' }}>
        Run &amp; check above to confirm your answer, then click "I solved it".
      </p>
    </AppShell>
  );
}
```

Note: the checkpoint records correctness by the learner's honest self-report button after they Run & check (the rep shows pass/fail feedback). This keeps the checkpoint UI simple and reuses `FoundationsRep` unchanged. `onCorrect` from the rep is a no-op here; the score comes from the answer buttons.

- [ ] **Step 2: Verify build** — `npm --prefix client run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/foundations/Checkpoint.jsx
git commit -m "feat: interleaved checkpoint route with pass/fail scoring"
```

---

### Task 9: Wire routing, providers, redirect, and sidebar

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/AppShell.jsx`

- [ ] **Step 1: Update `client/src/App.jsx`** — add FoundationsProvider, the new routes, `/academy`, and the `/` redirect for non-graduates

Replace the current `App.jsx` body with:

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { CurriculumProvider, useCurriculum } from './state/CurriculumContext.jsx';
import { FoundationsProvider, useFoundations } from './state/FoundationsContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { EmptyState } from './components/ui.jsx';
import { graduationStatus } from './lib/foundations.js';
import Dashboard from './routes/Dashboard.jsx';
import Session from './routes/Session.jsx';
import Lesson from './routes/Lesson.jsx';
import Databases from './routes/Databases.jsx';
import Foundations from './routes/Foundations.jsx';
import FoundationsSession from './routes/foundations/FoundationsSession.jsx';
import Checkpoint from './routes/foundations/Checkpoint.jsx';

function RootRedirect() {
  const { track, state } = useFoundations();
  if (!track) return <AppShell breadcrumb={<span className="here">Loading…</span>}><EmptyState title="Loading your training path" /></AppShell>;
  const grad = graduationStatus(track, state);
  return <Navigate to={grad.graduated ? '/academy' : '/learn'} replace />;
}

function Body() {
  const { curriculum, error } = useCurriculum();
  if (error) return <EmptyState title="Could not load the course">Start the server with <code>npm start</code>, then reload. ({error})</EmptyState>;
  if (!curriculum) return <EmptyState title="Loading your training path" />;
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/learn" element={<Foundations />} />
      <Route path="/learn/session" element={<FoundationsSession />} />
      <Route path="/learn/checkpoint/:id" element={<Checkpoint />} />
      <Route path="/academy" element={<Dashboard />} />
      <Route path="/session/:sessionId/:exerciseId?" element={<Session />} />
      <Route path="/lessons/:slug" element={<Lesson />} />
      <Route path="/databases" element={<Databases />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <CurriculumProvider>
      <FoundationsProvider>
        <Body />
      </FoundationsProvider>
    </CurriculumProvider>
  );
}
```

- [ ] **Step 2: Update `AppShell.jsx`** — add a **Learn** nav group at the top and point Dashboard at `/academy`

In the `<nav className="side-nav">`, add a new group above the existing "Practice" group:

```jsx
          <div className="nav-group">
            <span className="nav-group-label">Learn</span>
            <NavLink to="/learn" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">◎</span><span className="nav-label">Foundations</span></NavLink>
          </div>
```

And change the existing Dashboard NavLink target from `to="/"` to `to="/academy"` and its `end` prop can be removed:

```jsx
            <NavLink to="/academy" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">◆</span><span className="nav-label">Dashboard</span></NavLink>
```

(The "Continue" link and lessons/Databases groups stay as they are.)

- [ ] **Step 3: Full test + build** — `npm test` (37 server + client vitest all green) and `npm run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/AppShell.jsx
git commit -m "feat: route Foundations as the front door; academy at /academy; Learn nav group"
```

---

### Task 10: Full visual verification pass (production build)

Run against the production server (`npm run build` then `npm start`, Postgres up), at `http://127.0.0.1:3000`. Use the browser preview tools. Clear `sqlm:*` localStorage first for a true first-run.

**Checklist:**

- [ ] `/` redirects a fresh (non-graduated) user to `/learn`.
- [ ] Foundations home: shows the 8-concept path (all "new"), both checkpoints listed, 0% mastery, "Start lesson 1".
- [ ] Start session → **Teach card** for "Ask a table for everything" renders, first rep is **scaffolded** (editor pre-seeded with `SELECT ____ FROM genre;`).
- [ ] Type `SELECT * FROM genre;`, Run & check → green pass; the rep's skill advances (home shows select-all at 1/3 after returning).
- [ ] Complete all reps of concept 1; finishing the session shows the "Nice work" screen and increments the session counter.
- [ ] Advance through concepts; after concept 4 is strong, the home "Today" shows **Checkpoint A**, and concept 5 is **not** offered until Checkpoint A is passed (start session routes to the checkpoint).
- [ ] Checkpoint: 6 mixed questions with progress dots; passing (≥5 "I solved it") marks it passed and unlocks concept 5.
- [ ] Spaced review: after learning a concept and completing ≥2 sessions, a later session opens with a **"Review: …"** rep of an earlier skill, using a *different* question than first seen.
- [ ] Mastery meters on the home path move as skills go new → learning → strong.
- [ ] A wrong-but-valid query and a syntax error both show the friendly feedback (reused workbench behavior).
- [ ] `/academy` still shows the old dashboard; academy exercises still grade; Databases and Lessons unaffected.
- [ ] Sidebar: "Learn → Foundations" active on `/learn`; "Dashboard" points to `/academy`.
- [ ] Responsive at ~760px: the mobile drawer includes the Learn group; no horizontal body scroll.
- [ ] Zero console errors across `/learn`, `/learn/session`, a checkpoint, and `/academy`.

- [ ] **Fix anything found; clear test localStorage; commit fixes**

```bash
git add -A && git commit -m "fix: Foundations visual verification pass fixes"
```

---

## Self-review results

- **Spec coverage:** dataset/one-table (Task 1 content on chinook `track`/`genre`); 8-concept ladder (Task 1); teach + faded scaffolding + reps (Tasks 1, 5, 7); per-skill mastery + spacing + interleaved checkpoints + graduation (Task 3 engine; Tasks 6-8 UI); separate localStorage key (Task 3); curriculum API `foundations` block (Task 2); reuse of SqlEditor/OutputDock/grading (Tasks 4-5); `/` redirect + `/academy` + Learn nav (Task 9); error/empty states (hook + views); testing (server content Task 2, engine Task 3, visual Task 10). Deterministic-answer requirement enforced by the Task 1 validator.
- **Placeholder scan:** none — every step carries complete code or exact commands. The two "move the import to the top" notes are clarifications, not placeholders (the code shown is complete).
- **Type consistency:** engine exports (`loadFoundations`, `skillLevel`, `isSkillStrong`, `recordCorrect`, `recordAttempt`, `dueReviews`, `nextConcept`, `checkpointDue`, `buildTodaySession`, `recordCheckpointResult`, `advanceSession`, `graduationStatus`, `FOUNDATIONS_KEY`, `STRONG_THRESHOLD`, `SPACING_GAP`, `CHECKPOINT_SIZE`, `CHECKPOINT_PASS`) are used consistently across Tasks 4-9. Content shape (`concept.{id,order,skill,title,teach,exercises}`, `exercise.{id,skill,database,task,starterSql,hint,expectedSql}`, `checkpoint.{id,afterOrder,drawFromSkills,title}`, `skills[].{skill,conceptId,title,order}`) is identical in `src/foundations.js` (Task 1), the engine fixture (Task 3), and all consumers. `useSqlCheck` returns `{sql,setSql,feedback,result,checking,runCheck}` used verbatim in `FoundationsRep`. `feedback.toneClass` matches the `Callout tone` prop usage.
