# Interview Mode + interview-grade problems

Date: 2026-07-10
Status: approved direction ("Learning quality first"); this is the design for the highest-leverage product-quality lift (7 -> 9).

## Goal

Close the biggest gap between "a good SQL trainer" and "the thing that gets you the interview": add hand-crafted, business-framed, UN-scaffolded interview problems and an Interview Mode that presents them under interview-like conditions (a scenario, a timer, no scaffold, no hints by default), grades them against the real database, then reveals a model answer and the reasoning. Reuse the existing engine (Postgres-backed grading, fingerprints, the coach, the learning log). The generated drill exercises stay; interview problems are a separate, hand-authored, higher-altitude layer on top.

## Content: the InterviewProblem

Hand-authored (not generator-produced), one business scenario each, stored per database in `src/interview/{aperture,sideline,rove}.ts` as `APERTURE_INTERVIEW` etc. and collected in `src/interview.ts`.

```ts
export interface InterviewProblem {
  id: string;                 // stable slug, e.g. 'iv-rove-cohort-retention-1'
  database: 'aperture' | 'sideline' | 'rove';
  level: 'beginner' | 'intermediate' | 'advanced';
  pattern?: string;           // named pattern (Cohort retention, Funnel, Top-N per group, ...)
  difficulty: 1 | 2 | 3;      // within level
  scenario: string;           // the business framing ("You are the analyst at ...; the PM asks ...")
  task: string;               // the precise, gradeable ask (exact output columns, ordering, filters)
  expectedSql: string;        // canonical answer, validated + fingerprinted at build time
  modelAnswer: string;        // idiomatic solution shown on reveal (formatted, may add a comment)
  approachNote: string;       // why this approach, and the common wrong turns
  orderMatters: boolean;
  rowCeiling: number;         // bound the result (<= 200), like the advanced drills
  fingerprint: Fingerprint;   // baked by the interview validator
}
```

Business framing is the whole point: the task must be specific enough to grade (name the output columns and sort), but wrapped in a realistic ask, and solved WITHOUT a scaffold. Each problem carries the pattern label from Layer C.

## Validation (mirror of validate-exercises)

`scripts/validate-interview.ts` runs every problem's expectedSql against its seeded database and gates: g0 snapshot-identity (reuse src/snapshot), runs, non-empty, rowCeiling <= 200, deterministic (stable ORDER BY), task names every output column and sort key, then bakes the fingerprint onto the committed data. Wired into the release gate next to validate-exercises. Interview problems bound their result to a city/date slice or a small aggregate, exactly like the advanced drills, so grading stays fast and deterministic.

## Grading + serving (no answer leak)

- Grading reuses `checkQuery` + the problem's fingerprint. Extend the private `/api/check` lookup (curriculum-service `buildCurriculum({ includeAnswerContracts: true })`, or a sibling interview lookup) so `/api/check` resolves an interview problem id to its `{ database, fingerprint, orderMatters, task }`. `expectedSql` never leaves the server.
- `GET /api/interview` returns PUBLIC metadata only: `id, database, level, pattern, difficulty, scenario, task`. No expectedSql / modelAnswer / approachNote / fingerprint.
- `GET /api/interview/:id/solution` returns `{ modelAnswer, approachNote, pattern }` on demand (the learner clicked Reveal or Give up). Grading is server-side so the pass cannot be faked; the reveal is user-initiated, so it is served when asked.

## Interview Mode (client, new /interview route + nav item)

- Start screen: pick level and optional pattern, or Mixed / Random. Begin.
- Problem view: the scenario (business context) + the task, a live ELAPSED timer (informational, not a countdown fail), the SqlEditor with NO scaffold seed and NO hint button, and Run and check. Reuse `useSqlCheck` with `seed: ''` and the existing OutputDock + DiffPanel + coach feedback.
- On solved: "Solved in Xm Ys", then reveal the model answer + approachNote + pattern badge and the learner's result.
- Reveal answer / Give up button: fetches and shows the solution, marks the attempt unsolved. Next problem continues the session.
- Log to the learning log (a new `interview` event: solved/gave-up, durationMs, pattern) so the readiness/struggle export covers interview performance too.

## Content plan

Ship a validated STARTER set first, then scale: target ~10-12 problems per level (~30-36) to launch, hand-crafted to span the patterns (beginner: filtering/grouping business asks; intermediate: anti-join, self-join, ranking, funnel-lite; advanced: cohort retention, funnel, sessionization, dedup, top-N per group, moving average). Authored against the real schemas and validated 100% before shipping. The corpus grows over time; the app reports the honest count.

## Build order

1. InterviewProblem type + `src/interview.ts` collector + empty per-db stubs.
2. `scripts/validate-interview.ts` + fingerprint baking (reuse the exercise gates).
3. Author + validate the starter problem set (per-db, hand-crafted, business-framed).
4. Serving: `/api/interview` (public), `/api/interview/:id/solution`, and `/api/check` interview lookup.
5. Interview Mode UI: route, start screen, problem view (timer, no scaffold), reveal, nav item, learning-log events.
6. Test (validator + a client render test), deploy backend, ship UI via Pages.

## Out of scope (later)

Accounts + cross-device progress sync; commerce (payments/pricing/landing); SQL-dialect variants. These follow once the interview experience lands.
