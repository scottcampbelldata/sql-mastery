# SQL Mastery Path — Beginner "Foundations" Track Design

**Date:** 2026-07-05
**Status:** Approved by owner
**Scope:** Add a research-backed, beginner-first **Foundations** track as the app's front door, with built-in repetition (per-skill mastery, spaced review, interleaved checkpoints). Keep the existing 36-week interview academy intact as the path Foundations graduates into. First build covers **Core single-table fluency only**.

## Problem

The current curriculum is auto-generated from interview-prep content (`academy-expansion.js`, `interview-expansion.js`, parsed lesson HTML) and sliced into a 36-week "zero-to-senior" academy. Consequences a true beginner hits:

- The very first exercise asks them to query `information_schema.tables` across five databases with `NOT IN ('pg_catalog', 'information_schema')` — schema introspection, a topic most beginner courses never teach. It violates the universal "start with a bare SELECT on one small table" rule.
- Every exercise is **one-and-done**: done once, in a block, never seen again. That is massed practice — the weakest structure for retention.
- No scaffolding: a blank editor from minute one.

## Research basis (what the design follows)

- **Concept order:** every reputable beginner course (SQLBolt, W3Schools, DataCamp, Codecademy) opens by explaining table/row/column, then a bare `SELECT` on one tiny friendly table, then `ORDER BY`/`LIMIT`, `WHERE`, aggregates, `GROUP BY`, then joins.
- **Repetition (strong evidence):** retrieval practice (recall, repeated), spaced practice (revisit after gaps; many short sessions beat few long), interleaving (mix problem types once basics land — builds judgment of *which* tool to use).
- **Scaffolding fades:** start with fill-in-the-blank / starter code, remove support as fluency grows.

Sources: sqlbolt.com, w3schools.com/sql/sql_syllabus.asp, datacamp.com/blog/best-sql-courses, learningscientists.org (6 strategies), cirl.etoncollege.com (retrieval/spaced/interleaving), liambx.com/blog/teaching-sql-beginners-workshop-guide.

## Decisions (made with owner)

- **Scope:** add a Foundations track in front; keep the academy as the advanced path.
- **Repetition:** spiral — per-skill mastery + spaced review + interleaved checkpoints + graduation gate.
- **Dataset:** one tiny friendly dataset first — Chinook music store, mostly the single `track` table (`genre`/`artist` for the first queries).
- **Depth (this build):** Core single-table fluency — 8 concepts, `SELECT *` through `GROUP BY`. No joins, no other databases, no academy changes.

## The 8-concept ladder

Each concept is one **lesson**. Anchored on Chinook. `track` columns available: `track_id, name, album_id, media_type_id, genre_id, composer (NULLABLE), milliseconds, bytes, unit_price`.

| # | Concept | Skill tag | Anchor example |
|---|---------|-----------|----------------|
| 1 | SELECT everything | `select-all` | `SELECT * FROM genre;` |
| 2 | Pick specific columns | `select-columns` | `SELECT name, composer FROM track;` |
| 3 | ORDER BY + LIMIT | `order-limit` | `SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 10;` |
| 4 | DISTINCT | `distinct` | `SELECT DISTINCT composer FROM track;` |
| — | **Checkpoint A** (after ④) | mixed 1–4 | 6 interleaved questions |
| 5 | WHERE (compare, AND/OR, IN, BETWEEN, LIKE) | `where` | `SELECT name FROM track WHERE unit_price > 0.99;` |
| 6 | NULL (IS NULL / IS NOT NULL) | `null` | `SELECT name FROM track WHERE composer IS NULL;` |
| 7 | Aggregates (COUNT/SUM/AVG/MIN/MAX) | `aggregate` | `SELECT COUNT(*), ROUND(AVG(milliseconds)) FROM track;` |
| 8 | GROUP BY | `group-by` | `SELECT album_id, COUNT(*) FROM track GROUP BY album_id;` |
| — | **Checkpoint B** (after ⑧) | mixed 1–8 | 6 interleaved questions |

## Lesson unit structure

Each lesson has:

1. **Teach** — concept in plain English (each term defined before use), a one-line mental model, and one worked example run on Chinook with its result shown inline.
2. **Guided reps (3–4 exercises)** — first rep is scaffolded (editor pre-filled with `starterSql` containing a `____` blank the learner replaces); later reps fade to a blank editor. Every rep requires producing SQL (retrieval). Questions vary so it is not rote.
3. Passing a rep records a correct answer for that lesson's **skill**.

## Repetition engine

**Skill mastery.** Each exercise carries a `skill` tag. A skill's mastery level = count of *distinct* exercises answered correctly for it. Levels: `0` new · `1–2` learning · `3+` strong. A skill is "strong" once 3 distinct exercises for it are correct.

**Spaced review.** State tracks `lastPracticedSession[skill]`. A learned skill becomes **due** when `sessionCounter - lastPracticedSession[skill] >= SPACING_GAP` (default 2). When a session is assembled, due skills contribute 1 review rep each (max 2 reviews/session), drawn from that skill's exercise bank preferring an exercise the learner has NOT already answered (retrieval, not recognition). Answering a review updates `lastPracticedSession`.

**Interleaved checkpoints.** Checkpoint A (after concept 4) and Checkpoint B (after concept 8) each present 6 questions in randomized order (interleaved) drawn from all skills learned so far. Pass = ≥5/6 correct. On pass, the checkpoint is recorded in `checkpointsPassed`. Misses feed the missed skills back to "due" (reset `lastPracticedSession` to force review). A learner cannot start concept 5 until Checkpoint A is passed; graduation requires Checkpoint B.

**Today's session (scheduler).** Given the track + state, `buildTodaySession()` returns an ordered queue:
1. Due reviews first (up to 2), labeled `Review: <concept>`.
2. Then either the next new lesson's reps (labeled `New: <concept>`), or a checkpoint if one is unlocked and unpassed at the current boundary.
The learner always gets a little old mixed with a little new (the spiral).

**Graduation.** When all 8 skills are strong AND both checkpoints passed, Foundations shows a completion state ("single-table fluency — ready for the interview academy") linking to academy Week 1.

**Randomization note:** `Math.random()` is unavailable in some contexts but fine in the browser client. Checkpoint order and review-exercise selection are seeded off `sessionCounter + index` to stay deterministic within a session render (avoids reshuffling on every re-render).

## Data model

### Authored content — `src/foundations.js` (new, hand-written)

```
foundations = {
  datasetNote: 'chinook',
  concepts: [
    {
      id: 'c1-select-all',
      order: 1,
      skill: 'select-all',
      title: 'Ask a table for everything',
      teach: {
        plain: '...',            // 2–4 sentences, terms defined before use
        mentalModel: '...',      // one line
        example: {               // worked example shown with result
          sql: 'SELECT * FROM genre;',
          note: 'Every column (*) for every row.'
        }
      },
      exercises: [               // 3–4 reps; first has starterSql with a blank
        {
          id: 'c1-r1',
          skill: 'select-all',
          database: 'chinook',
          task: '...',
          starterSql: 'SELECT ____ FROM genre;',   // optional scaffold
          expectedSql: 'SELECT * FROM genre;',
          hint: '...'
        },
        ...
      ]
    },
    ...
  ],
  checkpoints: [
    { id: 'cpA', afterConcept: 4, drawFromSkills: ['select-all','select-columns','order-limit','distinct'], questionCount: 6, passScore: 5 },
    { id: 'cpB', afterConcept: 8, drawFromSkills: ['select-all',...,'group-by'], questionCount: 6, passScore: 5 }
  ]
}
```

Every exercise reuses the existing grading contract: `database` + `expectedSql`, graded by `/api/check` result-set comparison. Checkpoints draw their question pool from the concepts' exercise banks.

### Curriculum API

`buildCurriculum()` returns an added `foundations` object (the authored track above, plus a flat `foundationsExercises` list and a `skills` summary). Existing `weeks/sessions/exercises/stats` unchanged. The checker, database routes, and academy are untouched.

### Client state — localStorage `sqlm:foundations:v1`

```
{
  skillCorrect: { [skill]: [exerciseId, ...] },   // distinct correct exercise ids per skill
  attempts: { [exerciseId]: n },
  lastSql: { [exerciseId]: '...' },
  lastPracticedSession: { [skill]: sessionCounter },
  checkpointsPassed: ['cpA', ...],
  sessionCounter: 0                                 // increments when a session is completed
}
```

Separate key from `sqlm:product-progress:v1` (academy) so the two never conflict.

## Scheduling engine — `client/src/lib/foundations.js` (new, pure, TDD)

Pure functions, unit-tested with Vitest:

- `loadFoundations()` / `saveFoundations(state)` — via the safe storage helpers from `lib/progress.js`.
- `skillLevel(state, skill)` → `{ count, tier: 'new'|'learning'|'strong' }`.
- `isSkillStrong(state, skill)` → boolean (count ≥ 3).
- `dueReviews(track, state)` → skills whose `sessionCounter - lastPracticed >= SPACING_GAP` and are learned, capped at 2, preferring unanswered exercises.
- `nextConcept(track, state)` → the next not-yet-strong concept whose prerequisites (prior checkpoint) are met, or null.
- `checkpointDue(track, state)` → a checkpoint object if one is unlocked at the current boundary and unpassed, else null.
- `buildTodaySession(track, state)` → ordered queue of `{ kind: 'review'|'new'|'checkpoint', label, exercise|checkpoint }`.
- `recordCorrect(state, exercise)` / `recordCheckpointResult(state, checkpoint, score)` → new state (immutable update; new leaf objects).
- `graduationStatus(track, state)` → `{ strongSkills, totalSkills, checkpointsPassed, graduated }`.

## Views (reuse existing workbench components)

- **Foundations home** (`/learn`): friendly concept path with per-skill mastery meters, a "Today's session" card (the scheduler's queue with review/new/checkpoint labels), and graduation progress. This is the beginner front door.
- **Foundations lesson/workbench** (`/learn/session`): queue-driven. Reuses `SqlEditor`, `OutputDock`, `DataTable`, `Callout`. Adds: the **Teach card**, `starterSql` prefill on first load, a **rep counter** ("Rep 2 of 3"), and a **queue-item label** ("Review: WHERE" / "New: GROUP BY"). Run & check grades via `api.check`; correct answers call `recordCorrect` and advance the queue.
- **Checkpoint view** (`/learn/checkpoint/:id`): same workbench, one question at a time, header "Question 3 of 6 — mixed practice," progress dots, final pass/fail with score, calls `recordCheckpointResult`.

### Editor scaffolding

`SqlEditor` gains an optional starter-value behavior: when an exercise has `starterSql` and the learner has no saved `lastSql` for it, the editor initializes to `starterSql` (real content, not placeholder). The `____` convention is a visible blank the learner overwrites; grading is by result set, so the blank itself is not parsed.

## Navigation & routing

- **`/` (root):** if the learner has **not** graduated Foundations, redirect to `/learn` (beginner front door). If they have graduated, show the existing academy dashboard (current behavior preserved). This makes the beginner path the default landing without deleting the academy dashboard.
- **`/learn`:** Foundations home. **`/learn/session`:** queue-driven lesson workbench. **`/learn/checkpoint/:id`:** checkpoint view.
- **`/academy`:** the existing dashboard, always reachable regardless of graduation (so graduates and returning users can jump straight to interview practice).
- **Sidebar:** gains a top **Learn** group linking to Foundations (`/learn`), above the existing Practice/Lessons/Explore groups. The existing "Dashboard" nav item points to `/academy`.

## Error handling & empty states

- Curriculum load failure: existing full-screen EmptyState (unchanged).
- Postgres/database errors during a rep or checkpoint: same friendly Callout the workbench already shows (server `error` + `hint`).
- Empty queue (all strong, both checkpoints passed): Foundations home shows the graduation state, not a blank session.
- Corrupt/missing foundations state: `loadFoundations()` returns a safe default (mirrors `loadProgress` hardening).

## Testing

- **Vitest (client):** `foundations.js` engine — skill levels/tiers, due-review selection + cap + spacing gap, checkpoint gating (can't pass to concept 5 before Checkpoint A), `buildTodaySession` ordering (reviews before new; checkpoint at boundary), `recordCorrect` distinct-exercise counting, graduation status, safe-storage defaults. Plus a small render test that the Teach card + starter prefill appear.
- **Server (`node --test`):** `buildCurriculum()` includes a well-formed `foundations` object; every foundations exercise is checkable (has `database` + `expectedSql`); checkpoint `drawFromSkills` reference real skills.
- **Content sanity test:** every `expectedSql` in `foundations.js` parses as a single statement and targets `chinook`.
- **Visual verification:** walk the beginner path against the production build — first lesson teaches + scaffolds, reps advance, a review resurfaces a prior skill, Checkpoint A gates concept 5, mastery meters move, graduation state appears; zero console errors; responsive.

## Out of scope (this build)

- JOINs and any second table; the other four databases; changes to the academy curriculum, the checker, or database routes.
- Server-side persistence / accounts (state stays in localStorage).
- Authoring beyond the 8 Core concepts.
