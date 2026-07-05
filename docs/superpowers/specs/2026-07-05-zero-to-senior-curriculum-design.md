# Zero-to-Senior SQL Curriculum — Master Design

**Date:** 2026-07-05
**Status:** Approved by owner (master architecture; each phase after Foundations is built in its own spec→plan→build cycle under this architecture)
**Audience/goal:** A complete SQL beginner targeting **senior data analyst** interviews, no deadline, wants the most thorough taught path. The app must take them from "don't know what SQL means" to passing a senior SQL screen.

## Problem

Today the app has two disconnected halves: the new **Foundations** track (excellent method, but stops at `GROUP BY` on a single table — ~15% of what a senior analyst needs) and a **36-week interview academy** (thematically covers everything, but written for people who already know SQL: dense, one-and-done, no repetition). A beginner finishing Foundations hits a wall. There is no continuous, repetition-backed path across the hard middle (joins → window functions → analytical patterns) or a real interview-simulation layer.

## Decisions (made with owner)

- **One continuous taught course on one dataset (Chinook).** Every phase uses the Foundations method (teach → scaffolded practice that fades → spaced review → interleaved checkpoints → graduation) and stays on Chinook so the learner internalizes one schema deeply, from `SELECT *` to cohort analysis.
- **Seven phases** (Foundations is phase 1, already shipped): Foundations → Joins → Aggregation depth → Subqueries & CTEs → Window functions → Analytical patterns → Interview mode.
- **The engine generalizes** to multi-phase, with **cross-phase spaced review** (a Joins learner still gets occasional WHERE/GROUP BY warm-ups, so early skills never rust). Graduating a phase unlocks the next.
- **Interview mode adds new exercise types** beyond graded SQL (explain-your-approach, spot-the-bug, define-the-metric, timed mixed sets).
- **The 36-week academy is demoted** to an optional "Extra problems" bank (kept reachable at `/academy`, relabeled), not deleted. The taught 7-phase path is the spine.
- **Per-phase delivery:** this document is the master plan. Each phase after Foundations gets its own implementation plan + build + review + live verification, reusing the shared engine and components.

## Why Chinook carries the whole path (verified against the live DB)

Chinook's foreign-key graph supports every phase:
`album.artist_id→artist`, `track.album_id→album`, `track.genre_id→genre`, `track.media_type_id→media_type`, `invoice.customer_id→customer`, `invoice_line.invoice_id→invoice`, `invoice_line.track_id→track`, `playlist_track→playlist/track`, plus **self-references** `customer.support_rep_id→employee` and `employee.reports_to→employee` (self-joins / hierarchy). `invoice.invoice_date` + `invoice_line` give revenue **time-series, cohorts, and retention**. So joins, aggregation-across-joins, window functions, and analytical patterns all have real, non-trivial material on one schema. (Northwind's `orders` 1996–1998 remains available as an optional secondary source for a few analytical-pattern exercises, but the taught path stays on Chinook.)

## The curriculum backbone (concepts per phase)

Each concept is a taught lesson with a bank of graded reps (like Foundations). Skill tags are globally unique across phases so mastery and cross-phase review work.

### Phase 1 — Foundations ✅ (shipped)
`select-all, select-columns, order-limit, distinct, where, null, aggregate, group-by` (single table). Checkpoints A (after DISTINCT) and B (after GROUP BY).

### Phase 2 — Joins
- `inner-join` — combine two tables on a key (`track` × `album`, `invoice` × `customer`).
- `join-select` — choosing/aliasing columns across joined tables; qualifying names (`t.name`).
- `multi-join` — chains of 3+ tables (`artist`→`album`→`track`; `customer`→`invoice`→`invoice_line`).
- `left-join` — keep all rows of one side; find non-matches (customers with no invoices).
- `join-aggregate` — GROUP BY across a join (revenue per artist/genre/country).
- `self-join` — the employee reports-to hierarchy.
- Checkpoints: after `left-join`, after `self-join`.

### Phase 3 — Aggregation depth
- `having` — filter groups (genres with > N tracks); WHERE vs HAVING.
- `count-distinct` — `COUNT(DISTINCT ...)` and why it differs from `COUNT(*)`.
- `conditional-agg` — `COUNT(*) FILTER (WHERE ...)` / `SUM(CASE WHEN ...)` for pivots and rates.
- `grain` — choosing the right group grain; guarding denominators (safe ratios).
- Checkpoint after `grain`.

### Phase 4 — Subqueries & CTEs
- `scalar-subquery` — a subquery that returns one value (compare to the average).
- `in-subquery` — `WHERE x IN (SELECT ...)`.
- `exists` — `EXISTS` / `NOT EXISTS` (customers who have/haven't bought a genre).
- `correlated` — a subquery that references the outer row.
- `cte-basics` — `WITH name AS (...)`, readability over nesting.
- `cte-multistep` — 2–3 stacked CTEs to decompose a hard question.
- Checkpoints: after `exists`, after `cte-multistep`.

### Phase 5 — Window functions (senior gatekeeper)
- `row-number` — number rows; `PARTITION BY`.
- `rank-dense` — `RANK`/`DENSE_RANK` and tie behavior.
- `top-n-per-group` — the classic "top track per genre" via a windowed CTE.
- `lag-lead` — previous/next row; period-over-period deltas.
- `running-total` — cumulative sums with frame clauses.
- `moving-average` — windowed frames (`ROWS BETWEEN ...`).
- Checkpoints: after `top-n-per-group`, after `moving-average`.

### Phase 6 — Analytical patterns
- `time-series` — revenue by month/year; MoM and YoY with `LAG`.
- `cohorts` — group customers by first-purchase month; activity by cohort.
- `retention` — did a cohort come back in later periods.
- `segmentation` — bucket customers/tracks (RFM-lite, price tiers) with `CASE` + windows.
- `funnel` — ordered-step conversion (browse→purchase proxy via playlist→invoice).
- Checkpoint after `retention`, capstone checkpoint after `funnel`.

### Phase 7 — Interview mode
Not new SQL topics — the **meta-skills** that pass the room, using new exercise types (below):
- `interview-framing` — "define the metric / what would you ask?" business prompts (self-assessed vs a model answer).
- `interview-approach` — "explain your approach before you write it" (write a plan, compare to model).
- `interview-debug` — spot-the-bug: a broken query + wrong result; fix it (SQL-graded).
- `interview-validate` — "how would you check this is right?" (self-assessed).
- `interview-timed` — timed mixed sets: a random senior problem from phases 2–6 with a visible clock; interleaves everything.
- Graduation from Phase 7 = the app's "senior-ready" state.

## Engine generalization

The Foundations engine (`client/src/lib/foundations.js`) already models mastery, spacing, checkpoints, and graduation over an arbitrary set of skills. It generalizes to the multi-phase path with these changes:

- **Learning path shape:** `curriculum.learningPath = { phases: [ { id, order, title, goal, concepts, checkpoints } ] }` where each phase's `concepts`/`checkpoints` have the exact shape Foundations already uses. Foundations becomes `phases[0]`. A flat `skills` list and flat `exercises` list span all phases.
- **Cross-phase spaced review:** `dueReviews` draws from **all learned skills across every phase** (not just the current one), still capped at 2/session, still preferring unseen exercises. This is the key retention upgrade.
- **Phase gating:** `nextConcept` walks the learner's **current phase** (first phase with a not-strong concept); a phase's first concept is locked until the previous phase's final checkpoint passes. `graduationStatus` becomes per-phase plus an overall "senior-ready" when the last phase's checkpoints pass.
- **Session assembly:** `buildTodaySession` unchanged in spirit — due reviews (now cross-phase) first, then the next new concept or a due checkpoint.
- **State:** new localStorage key `sqlm:learning:v1` with the same shape as `sqlm:foundations:v1` (`skillCorrect, attempts, lastSql, lastPracticedSession, checkpointsPassed, sessionCounter`), plus a one-time **migration** that copies an existing `sqlm:foundations:v1` into it (skills are globally unique, so the copy is loss-free). Keep the hardened safe-default loader.
- **Files:** to keep modules focused, author each phase in its own module `src/phases/<phase>.js` (same exported shape as today's `src/foundations.js`), aggregated by `src/learning-path.js` into `getLearningPath()`; `buildCurriculum()` exposes `learningPath`. Foundations content moves from `src/foundations.js` into `src/phases/foundations.js` unchanged. The client engine file is renamed conceptually to the "learning path engine" but keeps its tested function names.

## Interview-mode exercise types (data shape)

Exercises gain an optional `kind` (default `'sql'`):
- `'sql'` — graded by result-set vs `expectedSql` (today's behavior).
- `'debug'` — carries `brokenSql` (pre-filled into the editor) + `expectedSql`; graded like `'sql'` (fix it until the result matches).
- `'explain'` / `'metric'` / `'validate'` — carry a `prompt` and a `modelAnswer`; **self-assessed**: the learner writes/reflects, reveals the model answer, and marks "matched / partly / missed" (which feeds mastery like a graded pass/miss). No DB call.
- **Timed sets** are a checkpoint variant with a `timed: true` flag and a client-side countdown; they draw SQL exercises from phases 2–6 and score like a checkpoint.

Rendering reuses the existing rep/checkpoint views; `FoundationsRep` gains a branch for self-assessed kinds (prompt + reveal + self-mark) and `SqlEditor` accepts a `brokenSql` initial value for debug exercises (same mechanism as `starterSql`).

## Navigation & app changes

- `/learn` home becomes the **phase map**: the climbing path across all 7 phases, each with its concept sub-steps and mastery, showing the current phase expanded and locked phases dimmed. "Today's session" and graduation-to-next-phase live here.
- The sidebar **Learn** group lists the phases (or links to the phase map).
- `/academy` stays, relabeled "Extra problems (interview bank)"; its sidebar entry moves under a clearly secondary heading. No academy content changes.
- The `/` redirect stays: non-"senior-ready" learners land on `/learn`.

## Testing

- **Engine (Vitest):** extend the existing engine tests for multi-phase — cross-phase review selection, phase gating (phase-2 first concept locked until Foundations' Checkpoint B), per-phase + overall graduation, migration from `sqlm:foundations:v1`.
- **Content (node:test):** each phase's authored SQL validated against the live Chinook DB by an extended `scripts/validate-foundations.js` (renamed/parameterized to validate the whole learning path): every `sql`/`debug` exercise runs, is non-empty, deterministic (ordered by a unique key); every skill/checkpoint reference resolves; self-assessed exercises have a `modelAnswer`.
- **Per-phase visual verification** against the production build, as done for Foundations.

## Per-phase build process (how this master plan gets executed)

1. Foundations (phase 1) — **done**.
2. Generalize the engine + content model to the multi-phase learning path (its own plan): move Foundations into `src/phases/foundations.js`, add `src/learning-path.js`, generalize the engine + state + migration, turn `/learn` into the phase map. Ship with only Foundations content so nothing regresses.
3. Then each subsequent phase (Joins, Aggregation depth, Subqueries & CTEs, Window functions, Analytical patterns, Interview mode) is authored + validated + verified in its own cycle, appended to the learning path. Each is usable the moment it lands.

## Out of scope (for the whole curriculum effort)

- Server-side accounts / cross-device progress (state stays in localStorage; noted as a separate future feature).
- Production hardening for public deployment (tracked separately — read-only DB role, rate limiting).
- New databases beyond Chinook for the taught path (Northwind optional for a few Phase-6 exercises only).
- Rewriting or expanding the existing academy content.
