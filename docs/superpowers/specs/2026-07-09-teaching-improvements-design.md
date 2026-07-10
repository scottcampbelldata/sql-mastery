# Instructor-grade teaching + learn-from-mistakes (beginner path)

Date: 2026-07-09
Status: approved direction (Approach 3, Layer A + beginner slice of Layer B); this spec covers the first shippable piece.

## Goal

Make the beginner learning experience teach efficiently for a near-beginner targeting a senior data-analyst / BI job. Two changes: (A) every concept carries a real instructor's treatment (why it exists, when to reach for it, the gotcha, how it is tested) instead of one terse sentence, and (B) when the learner is wrong, the app diagnoses the specific misconception and teaches the fix instead of only reporting "row count differs". Keep the senior goal visible via a short "in interviews" note per concept. Ground the content in the researched list of real beginner misconceptions and how foundational SQL is probed in DA/BI interviews.

Scope of THIS piece: the beginner (Aperture) band content + the mistake-diagnosis engine (which serves all bands, but the diagnosis rules target the high-frequency beginner errors). Intermediate/advanced content enrichment, the pattern-grouping UI (Layer C), and the full readiness map (Layer D) are follow-on pieces.

## Part A: Richer teaching model + content

### Type (backward compatible)

Extend the teach block, both client `client/src/types.ts` `Teach` and server `src/generator/types.ts` `TeachBlock`, with OPTIONAL fields so existing content stays valid:

```ts
interface Teach {          // (TeachBlock server-side mirrors this)
  plain: string;           // what it does (existing)
  mentalModel: string;     // the intuition (existing)
  example: { sql: string; note?: string };  // worked example (existing)
  whyWhen?: string;        // why it exists + when to use it vs alternatives
  watchOut?: string;       // the #1 beginner gotcha/misconception + how to avoid it
  interviewNote?: string;  // how it is framed / tested in DA/BI interviews (pattern name)
}
```

### Rendering

- `TeachCard.tsx` (dedicated "Learn this" step): render all present sections, in order: plain, mental model, worked example, **Why and when**, **Watch out** (caution styling), **In interviews** (subtle). Sections only render when the field is present.
- `FoundationsRep.tsx` (inline instruction sidebar during a rep): keep it focused. Always show plain + mental model + example + **Watch out** (the highest-value beginner content). Put **Why and when** + **In interviews** behind a small collapsible "Why and when" toggle so the rep stays uncluttered.
- CSS: reuse existing teach/callout tokens; add a `.teach-watchout` (caution) and `.teach-interview` (subtle mono kicker) style. No new design system.

### Content

Rewrite the 17 Aperture (beginner) concept teach blocks (in `src/generator/templates/aperture/index.ts` `APERTURE_CONCEPT_META`) to fill whyWhen / watchOut / interviewNote, and tighten plain/mentalModel where too terse. Grounded in the research synthesis (common beginner misconceptions + interview framing). The 17: ap-select-all, ap-select-columns, ap-order-by, ap-limit-topn, ap-distinct, ap-where-comparison, ap-where-boolean-logic, ap-where-between-in, ap-where-like, ap-null-handling, ap-computed-columns, ap-column-alias, ap-aggregate-scalar, ap-group-by, ap-having, ap-group-by-sort-top, ap-join-intro.

Because teach content is served by the backend (via /api/curriculum from the generated phases), a content change requires regenerating the phase modules (npm run generate-exercises) and a backend redeploy. The teach fields do not affect fingerprints, so grading/snapshots are unchanged.

## Part B: Learn-from-mistakes feedback (diagnosis engine)

A pure, unit-testable module `src/coach.ts` exporting `diagnoseMistake(input): Coaching | null` where:

```ts
interface DiagnoseInput {
  sql: string;                 // the learner's submitted SQL
  taskText?: string;           // exercise.task (to detect top-N / distinct intent)
  pgError?: { code?: string; message?: string };  // set when the SQL failed to run
  diff?: { reason?: string; orderOnly?: boolean; yourRowCount?: number; expectedRowCount?: number };
}
interface Coaching { label: string; text: string }  // misconception name + the fix, no answer leak
```

Detection, first match wins, highest-frequency first:

1. pg error mapping (SQL did not run), by SQLSTATE where possible:
   - 42803 (grouping) -> "You are mixing an aggregate with a plain column. Every non-aggregated column in SELECT must appear in GROUP BY. Add it to GROUP BY or wrap it in an aggregate."
   - 42703 (undefined_column) / 42P01 (undefined_table) -> "Postgres cannot find that name. Check spelling and exact case against the Database tab; string values need single quotes, identifiers do not."
   - 42601 (syntax) -> "Syntax error near the marked spot. Check clause order (SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY) and commas."
   - 42883 (undefined_function) -> "That function or a type cast does not exist as written. Check the function name and argument types."
2. Wrong-answer signatures (SQL ran, result mismatched):
   - SQL matches `[=!<>]\s*NULL` -> "Nothing equals NULL, not even NULL. Use IS NULL / IS NOT NULL to test for missing values."
   - diff.orderOnly true -> "Right rows, wrong order. The task specifies a sort. Add or fix ORDER BY (and direction ASC/DESC)."
   - diff.reason 'columns' and SQL has `SELECT *` while task names columns -> "You returned every column with *. The task asks for specific columns. List them in the requested order."
   - diff.reason 'rowCount', yourRowCount > expected, task mentions top/first/highest/lowest N and SQL has no LIMIT -> "Too many rows. The task asks for the top N. Add LIMIT n after ORDER BY."
   - diff.reason 'rowCount', yourRowCount > expected, task mentions distinct/unique/different and SQL has no DISTINCT -> "Too many rows, with duplicates. The task wants distinct values. Add DISTINCT."
   - diff.reason 'rowCount', yourRowCount > expected, SQL has a JOIN -> "More rows than expected. A join can multiply rows when a key matches many (fan-out). Check the join key and whether the relationship is one-to-many."
   - diff.reason 'rowCount', yourRowCount < expected, SQL has `JOIN` without `LEFT` -> "Fewer rows than expected. An inner join drops rows with no match. If you need rows even when there is no match, use LEFT JOIN."
3. Return null if nothing matches (caller falls back to the existing generic hint).

### Wiring

`checkQuery` (in `src/query-service.ts`), in both the fingerprint-mismatch branch and the learning-error branch, calls `diagnoseMistake` and attaches `coaching` to the response. `learningErrorFeedback` passes the pg error through. The `CheckResponse` type (client `src/types.ts`) gains optional `coaching?: { label: string; text: string }`. `useSqlCheck` renders `coaching.text` as the primary feedback message (falling back to the current `hint || message` when coaching is null), and shows `coaching.label` as the callout title so the learner sees the named misconception.

## Testing

- Unit-test `diagnoseMistake` for each signature: the `= NULL` case, 42803 grouping, order-only, SELECT-* column mismatch, top-N missing LIMIT, distinct, join fan-out (too many), inner-join-drops (too few), and the null (no-match) fallback.
- Existing query-service and client tests must stay green; the coaching field is additive.
- After content rewrite: `npm run generate-exercises` + `npm run validate-exercises` still pass 475/0 (teach fields do not affect fingerprints).

## Deploy

Backend changes (coach module, checkQuery wiring, regenerated phase content) ship to the VPS: pull, build:server, generate-exercises is a build-time artifact so the regenerated phases are committed, restart sqlmastery-api, verify /api/check returns coaching on a wrong answer. Client changes (types, TeachCard, FoundationsRep, useSqlCheck, CSS) go live via the Cloudflare Pages rebuild from main. No DB or snapshot change.

## Out of scope (follow-on pieces)

- Intermediate/advanced teach enrichment (same type, more content).
- Layer C: pattern-grouping UI (top-N-per-group, funnel, cohort, dedup as named patterns).
- Layer D: the per-topic interview-readiness map/dashboard.
