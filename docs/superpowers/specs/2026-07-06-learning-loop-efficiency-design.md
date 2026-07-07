# Learning-loop efficiency: cold reviews, diff feedback, weakness-weighted mastery

Date: 2026-07-06
Status: approved design, proceeding to plan (user pre-authorized build + deploy)

## Goal

Make the app a more efficient teacher for one committed learner over 4-6 months by sharpening
the practice loop, not widening the syllabus. Three additive changes: spaced reviews test recall
(not recognition), wrong answers show a concrete diff, and limited review slots and mastery
visibility target the learner's weakest skills.

## Non-goals

- No new lesson content or topics; the content is already sufficient.
- No change to how new concepts unlock (they stay sequential and checkpoint-gated; that is correct
  for a learning path). Weakness-weighting applies only to reviews.
- No separate "study plan" document or scheduler; the spaced-repetition engine is the schedule.
- No change to the pass threshold or the "N of M skills strong" graduation ring.

## Lever 1: Cold-recall reviews

Today `FoundationsRep` seeds the editor with `starterSqlForExercise(exercise)` (a fill-in-the-blank
scaffold) for every step, including spaced reviews. A review should test generation from memory.

- `useSqlCheck(exercise, opts)` gains a `cold?: boolean` option. When `cold` is true it seeds the
  editor with `''` (blank) instead of the scaffold, both initially and on exercise change.
- `FoundationsRep` already receives `kind: 'review' | 'new'`. It passes `cold: kind === 'review'`
  to `useSqlCheck`, and shows a placeholder like "Write the full query from scratch." First-exposure
  reps (`kind === 'new'`) keep the scaffold.
- Grading is unchanged: the auto-grader runs the submitted SQL. The existing empty-editor guard
  ("Write your query first") already covers a blank submission.
- Checkpoints (`Checkpoint.tsx`) are assessments; if they currently seed a scaffold they render cold
  too, by the same mechanism. If they already start blank, no change.

Interface: `useSqlCheck(exercise, { onResult?, onAttempt?, cold? })`; behavior identical except the
seed value.

## Lever 2: Diff feedback on a wrong answer (whole-app)

The server grader (`src/query-service.ts`) already classifies a mismatch as `columns`, `row-count`,
or `row-values`. Enrich `mismatchFeedback` to also return a structured `diff`, and include it in the
`checkQuery` mismatch response. The client renders it under the wrong-answer callout.

`diff` shape (never includes expected row data, only shape/counts/order):
```
{
  reason: 'columns' | 'row-count' | 'row-values',
  yourColumns: string[],        // present when reason === 'columns'
  expectedColumns: string[],    // present when reason === 'columns'
  yourRowCount: number,
  expectedRowCount: number,
  orderOnly: boolean,           // same multiset of rows, wrong order
  extraRows: number,            // rows in yours not in expected (multiset)
  missingRows: number           // rows in expected not in yours (multiset)
}
```
- `yourRowCount` / `expectedRowCount` are always present.
- `orderOnly`, `extraRows`, `missingRows` are computed only when the columns match (the `row-count`
  and `row-values` reasons), using `normalizeRows` multiset differences. When `reason === 'columns'`
  the rows are not comparable, so `orderOnly` is false and `extraRows`/`missingRows` are 0; only the
  column lists are meaningful.
- Rationale for hiding expected rows: the learner gets the delta to debug from, not the answer, so
  the exercise stays a challenge.

Client:
- `api.check` already returns the body; `useSqlCheck` and `Workbench` already store feedback. Carry
  `body.diff` through into the feedback state.
- New `client/src/components/DiffPanel.tsx` renders a compact readout, e.g.:
  - columns: "Output columns differ - you have `[a, b]`, expected `[a, revenue]`."
  - row-count: "Columns match. You returned 12 rows, expected 10 (3 extra, 1 missing)."
  - row-values with `orderOnly`: "Right rows, wrong order - fix your ORDER BY."
  - row-values otherwise: "Same shape, but 2 rows differ (2 missing, 2 extra) - check expressions and NULLs."
- Rendered wherever a graded check runs: the session `Workbench`, `DrillModal`, and `FoundationsRep`
  (all consume `useSqlCheck` / `api.check`), so the academy benefits too.

## Lever 3: Weakness-weighted reviews and a mastery meter

`client/src/lib/foundations.ts` currently exposes `skillLevel` (count + coarse tier) and picks
reviews in track order.

- New `skillMastery(state, skill): { count, tier, pct, sessionsSince }`.
  - `pct` = `round(min(1, count / STRONG_THRESHOLD) * decay * 100)`, where `decay` reflects rust:
    `decay = max(0.5, 1 - 0.15 * max(0, sessionsSince - SPACING_GAP))` and `sessionsSince =
    sessionCounter - (lastPracticedSession[skill] ?? sessionCounter)`. Decay is purely visual and
    for review ordering; it never lowers `count` and never affects `isSkillStrong` or graduation.
  - `tier` unchanged (`new` / `learning` / `strong`), still count-based.
- `dueReviews` weakness ordering: keep the current due filter (learned, at least `SPACING_GAP`
  sessions since last practice), but sort the due skills by weakest-first - ascending `count`, then
  ascending `lastPracticedSession` (oldest) - before taking `MAX_REVIEWS_PER_SESSION`. New concepts
  still unlock strictly in order; only review selection changes.
- Foundations page (`client/src/routes/Foundations.tsx`): render a per-skill mastery bar (using
  `pct`) on the concept tiles, replacing the binary strong/new visual, plus a small "weak spots"
  line naming the 2-3 lowest-`pct` learned skills. The "N of M skills strong" ring stays.
- A one-line daily-cadence nudge ("A short session a day beats a long one a week") on the page. No
  scheduler.

## Data flow

- Grading: client `api.check` -> server `checkQuery` -> `{ correct, feedbackType, message, hint,
  why, result, expected, diff }`. On a mismatch, `diff` is populated; `useSqlCheck` stores it;
  `DiffPanel` renders it.
- Mastery: `loadFoundations()` state (unchanged shape) feeds `skillMastery` and the reordered
  `dueReviews`; the Foundations page reads `skillMastery` per skill.

## Error handling

- If `diff` is absent (older server, or a run error rather than a mismatch), the UI falls back to
  the existing worded hint with no `DiffPanel`.
- `skillMastery` guards divide-by-zero and missing skills (returns `pct: 0` for an unseen skill).

## Testing

- Server (`node --test`): `mismatchFeedback` returns the right `diff` for crafted `{columns, rows}`
  pairs - a column mismatch, a pure row-count difference, an order-only difference (same rows
  reordered), and a value difference with counted extra/missing. No database needed (pass result
  objects directly).
- Client (`vitest`):
  - `useSqlCheck` seeds `''` when `cold` is true and the scaffold when it is not.
  - `DiffPanel` renders each `reason` variant (columns list, row-count delta, order-only, value diff).
  - `foundations.ts`: `skillMastery` pct and decay; `dueReviews` returns the weakest due skills first
    (fixture state where a low-count and a high-count skill are both due).

## Assumptions

- The learning loop these levers sharpen is the Foundations track (Levers 1 and 3). Lever 2 is in
  the shared grader and applies everywhere a check runs.
- The mastery decay is a display/ordering heuristic, not a change to mastery accounting.
