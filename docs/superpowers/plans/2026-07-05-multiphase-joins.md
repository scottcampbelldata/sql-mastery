# Multi-Phase Learning Path + Phase 2 (Joins) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the shipped Foundations track into a multi-phase learning path (so the app can hold Foundations → Joins → … → Interview mode), and author **Phase 2 — Joins** on Chinook, taught the same way Foundations is, with cross-phase spaced review.

**Architecture:** The tested scheduling engine (`client/src/lib/foundations.js`) already operates on a generic `track = { skills, concepts, checkpoints }`. We keep it **100% unchanged** and add a thin layer: server-side, each phase is authored as its own module (`src/phases/<phase>.js`) and `src/learning-path.js` **flattens** all phases into one track with globally-increasing `order`/`afterOrder` (so cross-phase review and phase-gating fall out for free). Client-side, a new `client/src/lib/learning-path.js` adds phase helpers + a localStorage migration; the context feeds the flattened track to the unchanged engine and exposes the phase list to a new phase-map home.

**Tech Stack:** Node/Express, React 18 + react-router-dom 6 + Vite, Vitest, node:test. Grading unchanged (`/api/check` compares column names + row count + row order → every authored `expectedSql` is deterministic, ordered by a unique key).

**Verified against the live Chinook DB (do not re-derive):**
- Join keys: `track.album_id→album.album_id`, `track.genre_id→genre.genre_id`, `invoice.customer_id→customer.customer_id`, `invoice_line.invoice_id→invoice.invoice_id`, `invoice_line.track_id→track.track_id`, `album.artist_id→artist.artist_id`, self-refs `employee.reports_to→employee.employee_id` and `customer.support_rep_id→employee.employee_id`.
- Row-count anchors: 71 artists have no album (`LEFT JOIN … WHERE al.album_id IS NULL`); the employee self-join returns 7 rows (INNER) / 8 rows (LEFT, incl. the manager-less boss). `invoice_line` PK is `invoice_line_id`.
- Every Joins `expectedSql` below was run and returns non-empty, deterministic rows.

---

## File structure

**Server:**
- Create `src/phases/foundations.js` — the Foundations phase (content moved verbatim from `src/foundations.js`, wrapped as a phase object).
- Create `src/phases/joins.js` — the Joins phase content.
- Create `src/learning-path.js` — `getLearningPath()` + `flattenLearningPath()`.
- Modify `src/foundations.js` — becomes a thin back-compat shim re-exporting from the phase module.
- Modify `src/curriculum-service.js` — expose `learningPath`.
- Modify `test/foundations-content.test.js` — assert the multi-phase shape.
- Modify `scripts/validate-foundations.js` — validate every learning-path exercise (any database).

**Client:**
- Create `client/src/lib/learning-path.js` — `LEARNING_KEY`, `loadLearning`/`saveLearning` (migrates `sqlm:foundations:v1`), `currentPhase`, `phaseGraduation`.
- Modify `client/src/state/FoundationsContext.jsx` — feed flattened track to the engine; expose `phases`; use `loadLearning`/`saveLearning`.
- Modify `client/src/routes/Foundations.jsx` — phase-map home (grouped by phase, current expanded, locked dimmed).
- Modify `client/src/App.jsx` (RootRedirect) — use the flattened track for graduation.
- Modify `client/src/components/AppShell.jsx` — relabel the academy nav entry "Extra problems".
- `client/src/lib/foundations.js`, `client/src/routes/foundations/FoundationsSession.jsx`, `Checkpoint.jsx`, `FoundationsRep.jsx`, `TeachCard.jsx` — **unchanged** (they already consume a generic track / exercise).

---

### Task 1: Move Foundations into a phase module + build the learning-path flattener

**Files:**
- Create: `src/phases/foundations.js`
- Create: `src/learning-path.js`
- Modify: `src/foundations.js`

- [ ] **Step 1: Create `src/phases/foundations.js`** — move the `CONCEPTS`, `CHECKPOINTS` arrays and the `ex()` helper out of the current `src/foundations.js` verbatim, and export a phase object. (Copy the exact `ex` helper and the full 8-concept `CONCEPTS` array and 2-item `CHECKPOINTS` array from the current `src/foundations.js`; only the wrapper below is new.)

```js
// Phase 1 — Foundations. Content is the exact CONCEPTS/CHECKPOINTS from the original
// src/foundations.js (unchanged); only the phase wrapper is added.
const DB = 'chinook';

function ex(id, skill, task, expectedSql, opts = {}) {
  return { id, skill, database: DB, task, starterSql: opts.starterSql || '', hint: opts.hint || '', expectedSql: expectedSql.trim() };
}

const CONCEPTS = [ /* … paste the 8 concept objects verbatim from src/foundations.js … */ ];
const CHECKPOINTS = [ /* … paste cpA/cpB verbatim from src/foundations.js … */ ];

const foundationsPhase = {
  id: 'foundations',
  order: 1,
  title: 'Foundations',
  goal: 'Query one table with confidence: SELECT, filtering, sorting, NULLs, and grouping.',
  concepts: CONCEPTS,
  checkpoints: CHECKPOINTS
};

module.exports = { foundationsPhase };
```

- [ ] **Step 2: Create `src/learning-path.js`** — assemble phases and flatten them into one track with global order

```js
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
```

- [ ] **Step 3: Turn `src/foundations.js` into a back-compat shim** (so any remaining importer keeps working)

```js
const { getLearningPath } = require('./learning-path');

// Back-compat: the original getFoundations() returned { dataset, concepts, checkpoints, skills, exercises }.
// It now returns the full flattened learning path (same shape, more concepts).
function getFoundations() {
  return getLearningPath();
}

module.exports = { getFoundations };
```

- [ ] **Step 4: Do not run yet** — `src/phases/joins.js` does not exist until Task 2, so `require('./phases/joins')` will fail. Proceed to Task 2, then run tests. (This ordering keeps each file's responsibility clean; the two content modules are written back-to-back.)

- [ ] **Step 5: Commit after Task 2** (combined) — see Task 2 Step 4.

---

### Task 2: Author Phase 2 (Joins) content + validate against live Chinook

**Files:**
- Create: `src/phases/joins.js`
- Modify: `scripts/validate-foundations.js`

- [ ] **Step 1: Create `src/phases/joins.js`** (all SQL verified against live Chinook; deterministic via unique-key ORDER BY)

```js
const DB = 'chinook';
function ex(id, skill, task, expectedSql, opts = {}) {
  return { id, skill, database: DB, task, starterSql: opts.starterSql || '', hint: opts.hint || '', expectedSql: expectedSql.trim() };
}

const CONCEPTS = [
  {
    id: 'j-inner', order: 1, skill: 'inner-join',
    title: 'Combine two tables (JOIN)',
    teach: {
      plain: 'A JOIN glues two tables together on a matching column (a "key"). track.album_id matches album.album_id, so you can show a track next to its album title. Give each table a short alias (track t, album al) and qualify columns as t.name, al.title. Use AS to rename an output column.',
      mentalModel: 'FROM a JOIN b ON a.key = b.key stitches each row of a to its matching row in b.',
      example: { sql: 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 5;', note: 'Each track shown next to the album it belongs to.' }
    },
    exercises: [
      ex('j-inner-1', 'inner-join', 'Show each track name next to its album title. Order by track_id, first 20.', 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 20;', { starterSql: 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = ____ ORDER BY t.track_id LIMIT 20;', hint: 'Match track.album_id to album.album_id.' }),
      ex('j-inner-2', 'inner-join', 'Show invoice_id with the first_name and last_name of the customer who placed it. Order by invoice_id, first 20.', 'SELECT i.invoice_id, c.first_name, c.last_name FROM invoice i JOIN customer c ON i.customer_id = c.customer_id ORDER BY i.invoice_id LIMIT 20;', { hint: 'Join invoice.customer_id to customer.customer_id.' }),
      ex('j-inner-3', 'inner-join', 'Show each track and its genre. Label the columns track and genre. Order by track_id, first 20.', 'SELECT t.name AS track, g.name AS genre FROM track t JOIN genre g ON t.genre_id = g.genre_id ORDER BY t.track_id LIMIT 20;', { hint: 'Both columns are called name, so alias them with AS track and AS genre.' })
    ]
  },
  {
    id: 'j-left', order: 2, skill: 'left-join',
    title: 'Keep every row with LEFT JOIN',
    teach: {
      plain: 'A plain JOIN drops rows that have no match. A LEFT JOIN keeps every row from the left (first) table and fills NULL where the right table has no match. That is how you answer "which X have no Y" — LEFT JOIN, then keep the rows where the right key IS NULL.',
      mentalModel: 'LEFT JOIN keeps all of the left table; unmatched right-side columns come back NULL.',
      example: { sql: 'SELECT ar.name, al.title FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id ORDER BY ar.artist_id LIMIT 5;', note: 'Artists appear even if they have no album (title is NULL).' }
    },
    exercises: [
      ex('j-left-1', 'left-join', 'List the artists that have NO album. Show artist_id and name, ordered by artist_id.', 'SELECT ar.artist_id, ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id WHERE al.album_id IS NULL ORDER BY ar.artist_id;', { starterSql: 'SELECT ar.artist_id, ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id WHERE al.album_id ____ ORDER BY ar.artist_id;', hint: 'No album means the album key came back NULL: WHERE al.album_id IS NULL.' }),
      ex('j-left-2', 'left-join', 'Show every artist name and their album title (NULL when they have none). Order by artist_id, then album_id, first 30.', 'SELECT ar.name, al.title FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id ORDER BY ar.artist_id, al.album_id LIMIT 30;', { hint: 'LEFT JOIN keeps everyone; order by ar.artist_id then al.album_id.' }),
      ex('j-left-3', 'left-join', 'Count how many albums each artist has, including artists with zero. Show artist_id and album_count, ordered by artist_id.', 'SELECT ar.artist_id, COUNT(al.album_id) AS album_count FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id GROUP BY ar.artist_id ORDER BY ar.artist_id;', { hint: 'COUNT(al.album_id) counts only matched rows, so artists with no album score 0.' })
    ]
  },
  {
    id: 'j-multi', order: 3, skill: 'multi-join',
    title: 'Chain three or more tables',
    teach: {
      plain: 'You can JOIN more than two tables — each JOIN adds another table on its key. To show a track with its artist you go track → album → artist, because the artist is stored on the album, not the track.',
      mentalModel: 'Each additional JOIN … ON … hops one more key across the schema.',
      example: { sql: 'SELECT ar.name AS artist, t.name AS track FROM artist ar JOIN album al ON al.artist_id = ar.artist_id JOIN track t ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 5;', note: 'artist → album → track, chained by two joins.' }
    },
    exercises: [
      ex('j-multi-1', 'multi-join', 'Show each track and its artist. Label the columns track and artist. Order by track_id, first 20.', 'SELECT t.name AS track, ar.name AS artist FROM track t JOIN album al ON t.album_id = al.album_id JOIN artist ar ON al.artist_id = ar.artist_id ORDER BY t.track_id LIMIT 20;', { starterSql: 'SELECT t.name AS track, ar.name AS artist FROM track t JOIN album al ON t.album_id = al.album_id JOIN artist ar ON al.artist_id = ____ ORDER BY t.track_id LIMIT 20;', hint: 'Second hop: album.artist_id = artist.artist_id.' }),
      ex('j-multi-2', 'multi-join', 'For each invoice line show invoice_id, the customer last_name, and the track name. Order by invoice_line_id, first 20.', 'SELECT il.invoice_id, c.last_name, t.name FROM invoice_line il JOIN invoice i ON il.invoice_id = i.invoice_id JOIN customer c ON i.customer_id = c.customer_id JOIN track t ON il.track_id = t.track_id ORDER BY il.invoice_line_id LIMIT 20;', { hint: 'Four tables: invoice_line → invoice → customer, and invoice_line → track.' }),
      ex('j-multi-3', 'multi-join', 'Show each track with its album title and genre. Label the columns track, album, genre. Order by track_id, first 20.', 'SELECT t.name AS track, al.title AS album, g.name AS genre FROM track t JOIN album al ON t.album_id = al.album_id JOIN genre g ON t.genre_id = g.genre_id ORDER BY t.track_id LIMIT 20;', { hint: 'Join album on album_id and genre on genre_id.' })
    ]
  },
  {
    id: 'j-agg', order: 4, skill: 'join-aggregate',
    title: 'Summarize across a join',
    teach: {
      plain: 'Once tables are joined, GROUP BY and the aggregate functions you already know work across them — revenue per genre, tracks per album, sales per country. Join first, then group by the label you want one row per.',
      mentalModel: 'JOIN builds the wide table; GROUP BY + COUNT/SUM collapse it per group.',
      example: { sql: 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 5;', note: 'Track count per genre, busiest first.' }
    },
    exercises: [
      ex('j-agg-1', 'join-aggregate', 'For each genre, count its tracks. Label the columns genre and tracks. Most tracks first, ties by genre name, first 10.', 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 10;', { starterSql: 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = ____ GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 10;', hint: 'Join on genre_id, GROUP BY g.name.' }),
      ex('j-agg-2', 'join-aggregate', 'Total revenue per genre (sum of unit_price times quantity from invoice_line, rounded to 2 decimals). Label genre and revenue. Highest revenue first, ties by genre, first 10.', 'SELECT g.name AS genre, ROUND(SUM(il.unit_price * il.quantity), 2) AS revenue FROM invoice_line il JOIN track t ON il.track_id = t.track_id JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY revenue DESC, g.name LIMIT 10;', { hint: 'invoice_line → track → genre, then SUM(unit_price*quantity).' }),
      ex('j-agg-3', 'join-aggregate', 'Number of tracks per album title. Label album and tracks. Most first, ties by album title, first 10.', 'SELECT al.title AS album, COUNT(*) AS tracks FROM track t JOIN album al ON t.album_id = al.album_id GROUP BY al.title ORDER BY tracks DESC, al.title LIMIT 10;', { hint: 'GROUP BY al.title.' })
    ]
  },
  {
    id: 'j-self', order: 5, skill: 'self-join',
    title: 'Join a table to itself',
    teach: {
      plain: 'A table can join to itself — useful for hierarchies. Each employee row has a reports_to that holds their manager’s employee_id. Join employee to a second copy of employee to line up each person with their manager. Alias the two copies (e for employee, m for manager) so SQL can tell them apart.',
      mentalModel: 'Two aliases of the same table = "this row" and "the row it points at".',
      example: { sql: 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', note: 'Each employee beside their manager.' }
    },
    exercises: [
      ex('j-self-1', 'self-join', 'Show each employee first_name next to their manager first_name. Label the columns employee and manager. Order by the employee’s employee_id.', 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { starterSql: 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = ____ ORDER BY e.employee_id;', hint: 'reports_to points at the manager’s employee_id.' }),
      ex('j-self-2', 'self-join', 'Show each employee first_name, their own last_name as emp_last, and their manager’s last_name as mgr_last. Order by employee_id.', 'SELECT e.first_name, e.last_name AS emp_last, m.last_name AS mgr_last FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { hint: 'Two aliases e and m; alias the two last_name columns.' }),
      ex('j-self-3', 'self-join', 'Use a LEFT self-join to include the top manager (who has no manager). Show employee first_name and manager first_name (NULL for the boss). Label them employee and manager. Order by employee_id.', 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e LEFT JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { hint: 'LEFT JOIN keeps the boss even though reports_to is NULL.' })
    ]
  }
];

const CHECKPOINTS = [
  { id: 'cpC', afterOrder: 2, drawFromSkills: ['inner-join', 'left-join'], title: 'Checkpoint C: joins (inner + left)' },
  { id: 'cpD', afterOrder: 5, drawFromSkills: ['inner-join', 'left-join', 'multi-join', 'join-aggregate', 'self-join'], title: 'Checkpoint D: all joins' }
];

const joinsPhase = {
  id: 'joins', order: 2,
  title: 'Joins',
  goal: 'Combine multiple tables: inner and left joins, multi-table chains, aggregation across joins, and self-joins.',
  concepts: CONCEPTS,
  checkpoints: CHECKPOINTS
};

module.exports = { joinsPhase };
```

- [ ] **Step 2: Extend `scripts/validate-foundations.js`** to validate the whole learning path against each exercise's own database

Change the import and the exercise source:

```js
const { getLearningPath } = require('../src/learning-path');
// … in main():
const { exercises } = getLearningPath();
```

Everything else in the script is unchanged (it already reads `exercise.database` and posts to `/api/query`).

- [ ] **Step 3: Start the server and validate**

Run: `node server.js &` (wait 3s), then `node scripts/validate-foundations.js`
Expected: `42/42 exercises valid.` (27 Foundations + 15 Joins: 5 join concepts x 3 exercises each), exit 0, every line `ok`. If any Joins line fails: fix its `expectedSql` (zero rows → wrong filter; non-deterministic → the ORDER BY is not on a unique key). Stop the server after (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where CommandLine -like '*server.js*' | Stop-Process -Force`, or `pkill` on POSIX).

- [ ] **Step 4: Commit Tasks 1 + 2 together**

```bash
git add src/phases/ src/learning-path.js src/foundations.js scripts/validate-foundations.js
git commit -m "feat: multi-phase learning path + authored Joins phase, validated against chinook"
```

---

### Task 3: Expose `learningPath` from the curriculum API + multi-phase content test

**Files:**
- Modify: `src/curriculum-service.js`
- Modify: `test/foundations-content.test.js`

- [ ] **Step 1: Rewrite `test/foundations-content.test.js`** for the multi-phase shape

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCurriculum } = require('../src/curriculum-service');

test('curriculum exposes a multi-phase learning path', () => {
  const { learningPath } = buildCurriculum();
  assert.ok(learningPath, 'learningPath present');
  assert.equal(learningPath.dataset, 'chinook');
  assert.equal(learningPath.phases.length, 2, 'foundations + joins');
  assert.deepEqual(learningPath.phases.map((p) => p.id), ['foundations', 'joins']);
});

test('flattened concepts have globally increasing order and a phaseId', () => {
  const { learningPath } = buildCurriculum();
  const orders = learningPath.concepts.map((c) => c.order);
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'orders are ascending');
  assert.equal(new Set(orders).size, orders.length, 'orders are unique');
  assert.equal(learningPath.concepts.length, 13, '8 foundations + 5 joins concepts');
  assert.ok(learningPath.concepts.every((c) => c.phaseId), 'every concept has a phaseId');
});

test('every learning-path exercise is checkable', () => {
  const { learningPath } = buildCurriculum();
  for (const exercise of learningPath.exercises) {
    assert.ok(exercise.database, `${exercise.id} has a database`);
    assert.ok(exercise.expectedSql && /\bselect\b/i.test(exercise.expectedSql), `${exercise.id} has a SELECT`);
    assert.equal(exercise.expectedSql.trim().split(';').filter((s) => s.trim()).length, 1, `${exercise.id} is one statement`);
    assert.ok(exercise.skill, `${exercise.id} has a skill`);
  }
});

test('checkpoints reference real skills; joins checkpoints sit after their concepts', () => {
  const { learningPath } = buildCurriculum();
  const skills = new Set(learningPath.skills.map((s) => s.skill));
  for (const cp of learningPath.checkpoints) {
    for (const skill of cp.drawFromSkills) assert.ok(skills.has(skill), `${cp.id} → known skill ${skill}`);
  }
  const cpD = learningPath.checkpoints.find((c) => c.id === 'cpD');
  assert.equal(cpD.afterOrder, 13, 'cpD sits after the last joins concept (global order 13)');
});
```

- [ ] **Step 2: Run — fails** — `node --test test/foundations-content.test.js` → FAIL (`learningPath` undefined).

- [ ] **Step 3: Wire `learningPath` into `buildCurriculum`** (`src/curriculum-service.js`)

Replace the require `const { getFoundations } = require('./foundations');` with:

```js
const { getLearningPath } = require('./learning-path');
```

Replace `const foundations = getFoundations();` with:

```js
const learningPath = getLearningPath();
```

In the returned object, replace the `foundations` key with `learningPath` (keep everything else):

```js
    learningPath,
```

- [ ] **Step 4: Run tests — pass** — `node --test test/*.test.js` → all pass.

- [ ] **Step 5: Commit**

```bash
git add src/curriculum-service.js test/foundations-content.test.js
git commit -m "feat: expose multi-phase learningPath from buildCurriculum"
```

---

### Task 4: Client learning-path module (phase helpers + storage migration)

**Files:**
- Create: `client/src/lib/learning-path.js`
- Create: `client/src/lib/learning-path.test.js`

- [ ] **Step 1: Write failing tests** (`client/src/lib/learning-path.test.js`)

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { LEARNING_KEY, loadLearning, saveLearning, currentPhase, phaseGraduation } from './learning-path.js';
import { recordCorrect, recordCheckpointResult } from './foundations.js';

const phases = [
  { id: 'foundations', order: 1, title: 'F', goal: '', concepts: [
    { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
    { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] }
  ], checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: ['select-all', 'where'], title: 'B' }] },
  { id: 'joins', order: 2, title: 'J', goal: '', concepts: [
    { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
  ], checkpoints: [{ id: 'cpD', afterOrder: 3, drawFromSkills: ['inner-join'], title: 'D' }] }
];

function strong(state, skill, ids) { ids.forEach((id) => recordCorrect(state, { id, skill })); }

describe('learning-path client helpers', () => {
  beforeEach(() => localStorage.clear());

  it('loads a safe default under its own key', () => {
    expect(loadLearning()).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 });
  });

  it('migrates an existing sqlm:foundations:v1 into sqlm:learning:v1 once', () => {
    const legacy = { skillCorrect: { 'select-all': ['c1-r1'] }, attempts: {}, lastSql: {}, lastPracticedSession: { 'select-all': 0 }, checkpointsPassed: ['cpA'], sessionCounter: 4 };
    localStorage.setItem('sqlm:foundations:v1', JSON.stringify(legacy));
    const loaded = loadLearning();
    expect(loaded.skillCorrect['select-all']).toEqual(['c1-r1']);
    expect(loaded.checkpointsPassed).toContain('cpA');
    expect(JSON.parse(localStorage.getItem(LEARNING_KEY)).sessionCounter).toBe(4); // migrated + persisted
  });

  it('currentPhase is the first phase with a not-strong concept', () => {
    const s = loadLearning();
    expect(currentPhase(phases, s).id).toBe('foundations');
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    expect(currentPhase(phases, s).id).toBe('joins'); // foundations skills all strong
  });

  it('phaseGraduation reports per-phase strong counts and completion', () => {
    const s = loadLearning();
    strong(s, 'select-all', ['a', 'b', 'c']);
    strong(s, 'where', ['a', 'b', 'c']);
    let g = phaseGraduation(phases[0], s);
    expect(g.strong).toBe(2);
    expect(g.total).toBe(2);
    expect(g.complete).toBe(false); // checkpoint cpB not passed
    recordCheckpointResult(s, phases[0].checkpoints[0], 6);
    expect(phaseGraduation(phases[0], s).complete).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails**, then implement `client/src/lib/learning-path.js`

```js
import { safeGet, safeSet } from './progress.js';
import { isSkillStrong } from './foundations.js';

export const LEARNING_KEY = 'sqlm:learning:v1';
const LEGACY_KEY = 'sqlm:foundations:v1';

function defaultState() {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0 };
}
function asObject(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function normalize(parsed) {
  return {
    skillCorrect: asObject(parsed.skillCorrect),
    attempts: asObject(parsed.attempts),
    lastSql: asObject(parsed.lastSql),
    lastPracticedSession: asObject(parsed.lastPracticedSession),
    checkpointsPassed: Array.isArray(parsed.checkpointsPassed) ? parsed.checkpointsPassed : [],
    sessionCounter: Number.isFinite(parsed.sessionCounter) ? parsed.sessionCounter : 0
  };
}

export function loadLearning() {
  try {
    const current = JSON.parse(safeGet(LEARNING_KEY));
    if (current && typeof current === 'object') return normalize(current);
  } catch { /* fall through */ }
  // One-time migration from the Foundations-only key.
  try {
    const legacy = JSON.parse(safeGet(LEGACY_KEY));
    if (legacy && typeof legacy === 'object') {
      const migrated = normalize(legacy);
      safeSet(LEARNING_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch { /* fall through */ }
  return defaultState();
}

export function saveLearning(state) { safeSet(LEARNING_KEY, JSON.stringify(state)); }

// The first phase that still has a not-strong concept (or the last phase if all strong).
export function currentPhase(phases, state) {
  const ordered = [...phases].sort((a, b) => a.order - b.order);
  for (const phase of ordered) {
    if (phase.concepts.some((c) => !isSkillStrong(state, c.skill))) return phase;
  }
  return ordered[ordered.length - 1];
}

export function phaseGraduation(phase, state) {
  const strong = phase.concepts.filter((c) => isSkillStrong(state, c.skill)).length;
  const total = phase.concepts.length;
  const checkpointsDone = phase.checkpoints.every((cp) => state.checkpointsPassed.includes(cp.id));
  return { strong, total, checkpointsDone, complete: strong === total && checkpointsDone };
}
```

- [ ] **Step 3: Run — pass** — `npm --prefix client test` → all green (existing 28 + 4 new).

- [ ] **Step 4: Commit**

```bash
git add client/src/lib/learning-path.js client/src/lib/learning-path.test.js
git commit -m "feat: client learning-path helpers (phases, storage migration) with tests"
```

---

### Task 5: Point the context and RootRedirect at the flattened learning path

**Files:**
- Modify: `client/src/state/FoundationsContext.jsx`
- Modify: `client/src/App.jsx` (RootRedirect only)

- [ ] **Step 1: Update `FoundationsContext.jsx`** — feed the flattened track to the engine, expose `phases`, use learning storage

```jsx
import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useCurriculum } from './CurriculumContext.jsx';
import { loadLearning, saveLearning } from '../lib/learning-path.js';

const Ctx = createContext(null);
export const useFoundations = () => useContext(Ctx);

export function FoundationsProvider({ children }) {
  const { curriculum } = useCurriculum();
  const [state, setState] = useState(loadLearning);

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
      saveLearning(next);
      return next;
    });
  }, []);

  // `track` is the flattened path the engine consumes (skills/concepts/checkpoints/exercises).
  // `phases` is the grouped structure for the phase-map home.
  const track = curriculum ? curriculum.learningPath : null;
  const phases = curriculum ? curriculum.learningPath.phases : [];
  const value = useMemo(() => ({ track, phases, state, update }), [track, phases, state, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

(The engine reads `track.skills/concepts/checkpoints`; `curriculum.learningPath` provides exactly those alongside `phases` and `exercises`, so `Checkpoint.jsx`'s `track.exercises` and all engine calls keep working unchanged.)

- [ ] **Step 2: Update `RootRedirect` in `App.jsx`** — graduation now means the whole path

The existing `RootRedirect` already calls `graduationStatus(track, state)` with `track` from `useFoundations()`. Since `track` is now the flattened full path, `graduationStatus` returns "senior-ready" only when every phase's skills are strong and all checkpoints pass — exactly the intended behavior. **No code change needed** beyond confirming `RootRedirect` reads `track` from `useFoundations()` (it does). Verify by reading `App.jsx`; if it still imports from a `foundations`-specific path, leave as is.

- [ ] **Step 3: Build + test** — `npm --prefix client run build` and `npm --prefix client test` both green.

- [ ] **Step 4: Commit**

```bash
git add client/src/state/FoundationsContext.jsx client/src/App.jsx
git commit -m "feat: context feeds flattened learning path to the engine; exposes phases"
```

---

### Task 6: Phase-map home (`/learn`)

**Files:**
- Modify: `client/src/routes/Foundations.jsx`
- Modify: `client/src/routes/foundations/foundations.css`

- [ ] **Step 1: Rewrite `Foundations.jsx`** to group the path by phase (current phase expanded, later phases dimmed/locked)

```jsx
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button, ProgressMeter } from '../components/ui.jsx';
import { useFoundations } from '../state/FoundationsContext.jsx';
import { skillLevel, buildTodaySession, graduationStatus } from '../lib/foundations.js';
import { currentPhase, phaseGraduation } from '../lib/learning-path.js';
import './foundations/foundations.css';

export default function Foundations() {
  const { track, phases, state } = useFoundations();
  const navigate = useNavigate();
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path…" /></AppShell>;

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const active = currentPhase(phases, state);
  const started = Object.values(state.skillCorrect).some((a) => a.length);

  const todayLabel = session.main.kind === 'graduated' ? 'All phases complete'
    : session.main.kind === 'checkpoint' ? `Checkpoint: ${session.main.checkpoint.title}`
    : `${session.reviews.length ? `${session.reviews.length} review${session.reviews.length > 1 ? 's' : ''} + ` : ''}New: ${session.main.concept.title}`;

  return (
    <AppShell breadcrumb={<span className="here">Learn — your path</span>}>
      <div className="fnd-home-head">
        <span className="teach-kicker">{started ? 'Keep going' : 'Start here'}</span>
        <h1>Your SQL path</h1>
        <p className="goal">From your first query to senior-level analysis, one dataset, one step at a time — with everything you learn coming back for review so it sticks.</p>
      </div>

      <section className="card" style={{ marginBottom: 'var(--s-4)' }}>
        <ProgressMeter value={Math.round((grad.strongSkills / grad.totalSkills) * 100)} label="Overall mastery" />
        <p style={{ color: 'var(--ink-dim)', fontSize: 'var(--text-sm)', margin: 'var(--s-2) 0 var(--s-3)' }}>
          {grad.strongSkills} of {grad.totalSkills} skills strong · {grad.checkpointsPassed.length} checkpoints passed
        </p>
        {session.main.kind === 'graduated' ? (
          <p style={{ color: 'var(--ok)' }}>You have completed every phase. Senior-ready. 🎉</p>
        ) : (
          <>
            <p style={{ color: 'var(--ink-strong)', marginBottom: 'var(--s-3)' }}>Today: {todayLabel}</p>
            <Button variant="primary" onClick={() => navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session')}>
              {started ? "Continue today's session" : 'Start lesson 1'}
            </Button>
          </>
        )}
      </section>

      {phases.map((phase) => {
        const pg = phaseGraduation(phase, state);
        const isActive = phase.id === active.id;
        const locked = phase.order > active.order;
        return (
          <section key={phase.id} className={`fnd-phase ${isActive ? 'active' : ''} ${locked ? 'locked' : ''}`}>
            <div className="fnd-phase-head">
              <div>
                <span className="fnd-phase-kicker">Phase {phase.order}{locked ? ' · locked' : pg.complete ? ' · complete' : isActive ? ' · in progress' : ''}</span>
                <h2>{phase.title}</h2>
                <p>{phase.goal}</p>
              </div>
              <span className="fnd-phase-score">{pg.strong}/{pg.total}</span>
            </div>
            {!locked ? (
              <div className="fnd-path">
                {phase.concepts.map((c) => {
                  const lvl = skillLevel(state, c.skill);
                  return (
                    <div key={c.id} className={`fnd-step ${lvl.tier === 'strong' ? 'strong' : ''}`}>
                      <span className="fnd-step-num">{lvl.tier === 'strong' ? '✓' : c.order}</span>
                      <div className="fnd-step-body">
                        <strong>{c.title}</strong>
                        <div className="fnd-step-meter"><span style={{ width: `${Math.min(100, (lvl.count / 3) * 100)}%` }} /></div>
                      </div>
                      <span className="fnd-step-tier">{lvl.tier === 'strong' ? 'strong' : lvl.tier === 'learning' ? `${lvl.count}/3` : 'new'}</span>
                    </div>
                  );
                })}
                {phase.checkpoints.map((cp) => (
                  <div key={cp.id} className={`fnd-step fnd-checkpoint-row ${state.checkpointsPassed.includes(cp.id) ? 'strong' : ''}`}>
                    <span className="fnd-step-num">{state.checkpointsPassed.includes(cp.id) ? '✓' : '★'}</span>
                    <div className="fnd-step-body"><strong>{cp.title}</strong></div>
                    <span className="fnd-step-tier">{state.checkpointsPassed.includes(cp.id) ? 'passed' : 'checkpoint'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="fnd-phase-lockmsg">Unlocks when you finish {phases.find((p) => p.order === phase.order - 1).title}.</p>
            )}
          </section>
        );
      })}
    </AppShell>
  );
}
```

- [ ] **Step 2: Append phase styles to `foundations.css`**

```css
.fnd-phase { border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5); margin-bottom: var(--s-4); background: var(--surface-1); }
.fnd-phase.active { border-color: var(--brand); }
.fnd-phase.locked { opacity: 0.6; }
.fnd-phase-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); }
.fnd-phase-kicker { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand); }
.fnd-phase-head h2 { font-size: var(--text-lg); margin: var(--s-1) 0; }
.fnd-phase-head p { color: var(--ink-dim); font-size: var(--text-sm); margin: 0; max-width: 60ch; }
.fnd-phase-score { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-dim); flex: none; }
.fnd-phase-lockmsg { color: var(--ink-faint); font-size: var(--text-sm); margin: var(--s-2) 0 0; }
.fnd-step-tier { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }
```

- [ ] **Step 3: Build** — `npm --prefix client run build` succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes/Foundations.jsx client/src/routes/foundations/foundations.css
git commit -m "feat: /learn phase map (phases grouped, current expanded, later locked)"
```

---

### Task 7: Relabel the academy nav entry as "Extra problems"

**Files:**
- Modify: `client/src/components/AppShell.jsx`

- [ ] **Step 1: Update the Practice group** so the Dashboard link reads as an extras bank

In `AppShell.jsx`, change the "Practice" group label to "Extra problems" and the Dashboard link text to "Interview problem bank" (keep `to="/academy"`):

```jsx
          <div className="nav-group">
            <span className="nav-group-label">Extra problems</span>
            <NavLink to="/academy" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">◆</span><span className="nav-label">Interview problem bank</span></NavLink>
            {/* Continue link stays as-is below */}
```

(Leave the Continue link, Lessons group, and Explore group unchanged.)

- [ ] **Step 2: Build** — `npm --prefix client run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/AppShell.jsx
git commit -m "feat: reframe the academy as an Extra problems / interview bank"
```

---

### Task 8: Full visual verification (production build)

Run `npm run build` then `npm start`, Postgres up, at `http://127.0.0.1:3000`. Clear `sqlm:*` localStorage first.

**Checklist:**

- [ ] `/` redirects a fresh user to `/learn`; the phase map shows **Phase 1 Foundations** (expanded) and **Phase 2 Joins** (locked, dimmed, "Unlocks when you finish Foundations").
- [ ] Overall mastery meter reads 0/13 skills; "Today: New: Ask a table for everything".
- [ ] **Migration:** seed a `sqlm:foundations:v1` value (some Foundations progress), reload — the phase map reflects it and `sqlm:learning:v1` now exists (progress preserved).
- [ ] Seed Foundations fully complete (all 8 strong + cpA + cpB). Phase 2 **unlocks**; "Today" offers the first Joins lesson.
- [ ] Start a Joins session: TeachCard for "Combine two tables (JOIN)" renders; first rep scaffolded (`… ON t.album_id = ____ …`); typing the answer grades green; mastery records under `inner-join`.
- [ ] A cross-phase **spaced review** surfaces (e.g., seed Joins in progress with old Foundations skills due) — a "Review: <foundations concept>" rep appears before the Joins lesson.
- [ ] Checkpoint C gates: with inner-join + left-join strong, "Today" is Checkpoint C; multi-join is not offered until C passes.
- [ ] LEFT JOIN exercise (`artists with no album`) grades correctly (71 rows); the self-join and 4-table multi-join exercises grade.
- [ ] Sidebar: "Extra problems → Interview problem bank" → `/academy` still shows the old dashboard, unchanged and still grading.
- [ ] Responsive ~760px: phase map readable, mobile drawer includes Learn; no horizontal body scroll.
- [ ] Zero console errors across `/learn`, a Joins session, a checkpoint, and `/academy`.

- [ ] **Fix anything found; clear test localStorage; commit**

```bash
git add -A && git commit -m "fix: multi-phase + joins visual verification pass fixes"
```

---

## Self-review results

- **Spec coverage:** multi-phase engine via flatten with cross-phase review + phase gating (Tasks 1, 4 — engine unchanged, gating/review fall out of global order); Joins phase authored on Chinook with the spec's concept list `inner-join/left-join/multi-join/join-aggregate/self-join` + two checkpoints (Task 2); learningPath in the API (Task 3); storage migration `sqlm:foundations:v1`→`sqlm:learning:v1` (Task 4); context + phase-map home (Tasks 5-6); academy demoted to "Extra problems" (Task 7); per-phase content validated against the live DB (Task 2 validator) and per-phase visual verification (Task 8). Interview-mode exercise types and Olist are explicitly later phases (out of scope here).
- **Placeholder scan:** the only "paste verbatim" is Task 1 Step 1 (moving the already-written, committed Foundations `CONCEPTS`/`CHECKPOINTS`/`ex` from `src/foundations.js` — the source is in the repo, not invented). Every other step has complete code.
- **Type consistency:** phase shape `{ id, order, title, goal, concepts, checkpoints }`; concept `{ id, order, skill, title, teach, exercises }`; exercise `{ id, skill, database, task, starterSql, hint, expectedSql }`; checkpoint `{ id, afterOrder, drawFromSkills, title }` — identical in both phase modules, the flattener, the server test, the client helper test, and every consumer. `flattenLearningPath` output `{ skills, concepts, checkpoints, exercises }` matches what `foundations.js` engine functions read (`track.skills/concepts/checkpoints`) and what `Checkpoint.jsx` reads (`track.exercises`). `loadLearning`/`saveLearning` mirror the shape of `loadFoundations`/`saveFoundations`. New client helpers `currentPhase`/`phaseGraduation` use `isSkillStrong` from the unchanged engine.
