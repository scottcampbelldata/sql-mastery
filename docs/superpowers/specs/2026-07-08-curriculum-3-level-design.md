# Three-level generator-driven curriculum on the owned datasets

Date: 2026-07-08
Status: proposed (design from a senior-designer panel + adversarial critique; awaiting user review before planning)

## Goal

Replace the chinook/stackoverflow Foundations + Joins phases and the HTML academy with a single guided path that takes a total beginner to passing a senior data-analyst / BI SQL interview, in three levels, with hundreds of generator-produced exercises, each validated against the real seeded databases before it ships, and guidance that tapers as the learner proves proficiency. Reuse the existing engine (scaffold fade, spaced repetition, checkpoints, tile map, DB-backed grading) verbatim; add only an exercise-generation layer, a validation harness, level-banded phases, and the wiring.

Full design detail (per-concept taxonomy, generator internals) is captured in the committed design workflow output; this spec is the authoritative summary the plan is built from.

## Levels (one dataset per level; skill ids namespaced ap-/sl-/rv-)

**Beginner -> Aperture (database=aperture, prefix ap-).** 17 concepts, single-table screen plus intro joins: ap-select-all, ap-select-columns, ap-order-by, ap-limit-topn, ap-distinct, ap-where-comparison, ap-where-boolean-logic, ap-where-between-in, ap-where-like, ap-null-handling (IS NULL on equilibrium_temp_k, never =NULL), ap-computed-columns, ap-column-alias, ap-aggregate-scalar, ap-group-by, ap-having, ap-group-by-sort-top, ap-join-intro (planets->stars, planets->facility). Checkpoints cpA..cpD mid-band + cpE capstone (all beginner skills). Honest validated yield ~180-320.

**Intermediate -> Sideline (database=sideline, prefix sl-).** 21 concepts: the join/subquery core (inner, multi-join, left, anti in 3 forms, semi, the signature two-FK self-join on match with loser-via-CASE, self-join-compare, right/full-outer, join-aggregate incl. ROLLUP/GROUPING SETS/string_agg/FILTER, case-expressions, scalar/IN/correlated subqueries, CTE, set operations, date functions, SCD temporal roster as-of lookup) PLUS four window basics moved down from Advanced and taught on CLEAN data (sl-window-rank, sl-window-lag-lead, sl-window-running, sl-window-frame-basic). Checkpoints cpF..cpH mid-band + cpI capstone. Yield ~380-520. SEED REQUIREMENT: guarantee >=1 each of never-played team, sponsorless team, team-less sponsor, player-less team, NULL-region tournament, and an intra-region elo tie (so RANK vs DENSE_RANK vs ROW_NUMBER differ). Existence-dependent anti/semi/FULL-OUTER exercises are curated from a confirmed-unmatched-rows manifest, not blind-expanded.

**Advanced -> Rove (database=rove, prefix rv-).** 23 concepts. Cleaning (1-12): profile-dirty-data, text-normalize, case-canonicalize-synonyms, null-coalesce-nullif, money-text-cast, regex-clean-contacts, timezone-city-join (AT TIME ZONE via cities.timezone; utc_offset_hours is the stale trap), dedup-rownumber (on master_customer_id), orphan-anti-join, soft-delete-valid-population, payment-dedup-retries (DISTINCT ON), rating-outlier-clean. Applied windows on a cleaned layer (13-18; windows already learned in Intermediate): rank-leaderboard, topn-per-group, lag-lead-deltas, running-total, moving-average-frame (on a generate_series DATE SPINE with RANGE BETWEEN INTERVAL, calendar-correct), ntile-bucketing (+ percentile_cont). Behavioral (19-22): sessionization-gap-island, funnel-conversion, retention-cohort, lifecycle-latency-intervals. Capstone + perf (23 + rv-explain-fanout): clean-layer-cte-capstone (stack 3-4 cleaning CTEs then an analytic) and a performance concept graded by the corrected result on a bounded slice (not plan text). Checkpoints 1-4 mid-band + capstone 5. Yield ~250-360.

**CRITICAL Coverage-H2 rule (Advanced):** every Advanced expectedSql is scoped to a single city and/or fixed date range, or produces a small aggregated output (per-city, per-month, top-N), with a hard row-count ceiling (default <=200) enforced by the validation gate, so grading and the harness stay small, fast, and deterministic over 520k orders / 1.2M events.

## Generator (new src/generator/)

Pipeline: schema-catalog -> concept-template -> bind -> emit -> task-text + scaffold + hint -> assemble -> harness validates -> curate. Emits phase modules shaped exactly like `src/phases/foundations.ts` so `getPhases()` ingests them with zero engine change.

- **schema-catalog.ts:** reuse `query-service.describeDatabase()` to load per-database catalog (tables, columns with type/pk/nullable/fk). Typed helpers numericCols/textCols/dateCols/boolCols/nullableCols/pk/fksFrom/fksTo/joinPairs. The generator binds ONLY to names/types that exist, so no exercise can 42703/42P01 for learners.
- **templates/{aperture,sideline,rove}/*.ts:** each concept is one Template {skill, database, family, sqlShape with typed slots, bindingRules (type/nullability/cardinality predicates), phrasings[] (>=2), hintTemplate, scaffoldPlan, gate hints minRows/minDistinct/rowCeiling/orderMatters/boundedSlice}. The template is the SINGLE source from which expectedSql, task, starterSql, and hint all derive (no drift). Advanced templates MUST set boundedSlice=true and rowCeiling<=200.
- **bind.ts:** enumerate the legal slot cross-product from the catalog; reject bindings failing predicates; sample per-concept via a deterministic PRNG (reuse `src/datasets/framework/prng.ts`) keyed on (skill, bindingIndex) so ids are reproducible. Filter literals are drawn from REAL value samples via a SELECT DISTINCT probe. Compound (AND/BETWEEN/IN) literals are lifted from a single sampled real row so compound bindings are non-empty by construction.
- **emit.ts:** render to final SQL, determinism BY CONSTRUCTION. Per-family tiebreak: single-table -> ORDER BY sortKey, pk; grouped -> ORDER BY group cols (never a non-grouped pk, avoids 42803); windowed -> partition cols + rank/order expr + pk. Float aggregates always ROUND-wrapped. UNIQUE OUTPUT ALIAS per projected column is mandatory (self-join -> team_a_name/team_b_name/winner_name; conditional aggregation -> wins_as_a/wins_as_b). orderMatters=false for set-membership answers.
- **task-text.ts:** fill a phrasing from the SAME binding object as emit; verbalize filter/sort readably AND name the exact output columns/aliases AND the tiebreak, so the single deterministic answer is inferable. Humanization alias map (equilibrium_temp_k -> "equilibrium temperature").
- **scaffold.ts:** tokenize expectedSql, tag keyword vs answer-token, blank per tier: full = blank every value slot (keyword skeleton visible; blank-count == things-asked, matching current foundations invariant); half = blank the harder half; blank = whole clauses. All three tiers stored per exercise plus a blankMap[tier] mapping each ____ to its answer token (for the fill-back verifier and client tier selection with no round-trip).
- **assemble.ts:** emit the ex()-shaped object plus new fields: {id (skill+binding hash, deterministic), skill, database, task, starterSql:{full,half,blank}, blankMap, hint, expectedSql, orderMatters, fingerprint (filled by harness)}.
- **curate.ts:** literal-agnostic skeleton dedup (skeleton hash ignores threshold/N literals), difficulty tag, per-concept diversity sampler; freeze the shipped set with honest per-concept counts.

## Fingerprint grading (query-service.ts change)

At validation time the harness runs expectedSql once and stores `fingerprint = {columns, rowCount, orderedRowHash, unorderedRowHash}` on the exercise; generated phase modules ship with fingerprints baked in. `checkQuery` is refactored to run ONLY the learner query and compare against the stored fingerprint (orderedRowHash when orderMatters, else the existing multiset/unorderedRowHash). expectedSql is NEVER executed on the grading hot path: it can never 500 in production, and grading is O(learner query) regardless of dataset size. `normalizeRows` is hardened to build rows POSITIONALLY from result.fields (index-based) so duplicate output names cannot collapse. A snapshot-identity assertion (G0) records a content hash of each seeded DB and fails if the validation snapshot differs from the served snapshot (the guarantees only transfer across identical snapshots).

## Validation harness (new scripts/validate-exercises.ts; blocking build/CI gate)

Iterates ALL exercises (generated and hand-authored) via the real query-service executeQuery path against exercise.database (fails fast if the database is not allowed). Per-exercise gates:
- **G0 snapshot-identity** (per DB): validation snapshot == served snapshot.
- **G1 runs:** expectedSql must not throw.
- **G2 non-empty:** rowCount >= 1 (unless a template is explicitly empty-valid).
- **G3 row-ceiling:** rowCount <= exercise.rowCeiling (default 200; Advanced mandatory).
- **G4 stable-order** (backstop): when orderMatters, the ORDER BY key set must be unique across rows.
- **G5 non-degenerate:** filtered != unfiltered count; answer not a single constant; GROUP BY yields >1 group where required. Rove extras: dedup templates return FEWER rows than raw; timezone templates produce a value DIFFERENT from the naive read.
- **G6 duplicate-column-name:** columns have no duplicate names.
- **G7 task<->answer determinism:** every ORDER BY key and every projected name/alias in expectedSql is referenced by the task string; when orderMatters=false, expectedSql still has a stable ORDER BY for fingerprinting.
- **G8 scaffold fill-back:** for each tier, substituting blankMap answers back into starterSql[tier] (normalize whitespace/case) equals expectedSql byte-for-byte, and ____ count == answer-token count.
- **G9 self-check:** running expectedSql through the fingerprint comparator returns correct==true.
Then fingerprint production. Same harness validates checkpoint pool items.

## Level structure (banded phases; reuse the phase/flatten contract unchanged)

Add `level: 'beginner'|'intermediate'|'advanced'` and `database` to each phase object. Keep several concept-phases per band (do not collapse a band into one phase). phase.order stays globally monotonic across bands (aperture 1..k, sideline k+1.., rove ..n); `flattenLearningPath` needs no change. Checkpoints keep CHECKPOINT_SIZE=6, CHECKPOINT_PASS=5, drawFromSkills, conceptUnlocked. Each band's LAST phase carries a LEVEL-BOUNDARY CAPSTONE (drawFromSkills = all that band's skills); because conceptUnlocked gates any concept behind the nearest earlier checkpoint, the capstone automatically locks the next band until passed (per-level graduation, zero new gating code). Add `graduationStatus(track, state, level)` filtering to a band; keep the whole-track graduationStatus for the final certificate. REQUIRES globally-unique skill ids (ap-/sl-/rv-) with a build-time assertion that ids are unique and 1:1 with concepts across all flattened phases. State: bump FOUNDATIONS_KEY to v2; clamp maxUnlockedOrder to maxConceptOrder(track) on load and drop skillCorrect ids not in the current track (so a regeneration/renumber cannot produce a false "graduated").

## Scaffold tapering (band floor composed with the existing fade; not a rebuild)

Tiers as an ordered scale full > half > blank ("more help" = min-on-scale), composition = deterministic clamp. `levelBaseTier(level)`: beginner -> full, intermediate -> half, advanced -> blank. Tapering is EARNED: apply the reduced floor only if the prior band's capstone is passed; else degrade to full so a reset/import learner is never stranded. First-exposure bump: the first non-review sighting of a not-strong skill shows one step MORE help than the floor. `scaffoldTier(state, skill, isReview, ctx?)` where ctx={level, priorBandCapstonePassed, firstExposure} is OPTIONAL and omitting it reproduces today's behavior (backward compatible; FoundationsRep needs no change). Unit-test the clamp so a mastered beginner review never shows more help than a fresh advanced first attempt. All three tiers are pre-generated, so the client picks with no round-trip.

## Replacement / wiring plan

**Retire:** src/phases/foundations.ts, src/phases/joins.ts (keep their ex()/phase shape as the template the generated modules copy), src/academy-expansion.ts, src/interview-expansion.ts, content/*.html modules + the MODULES/WEEK_THEMES/SESSION_COUNTS HTML parsing + adaptStackOverflowIdentifiers in curriculum-service.ts, scripts/extract-lessons.ts, scripts/verify-lesson-sql.ts. Grep for foundationsPhase/joinsPhase/getAcademyExpansionExercises/getInterviewExpansionExercises and the old bare skill ids before deleting.

**Add:** src/generator/**, src/phases/{aperture,sideline,rove}/*.ts (generated), scripts/validate-exercises.ts + scripts/checks/*, npm scripts generate-exercises + validate-exercises (wired into build+test).

**Change:**
- src/db-config.ts: DEFAULT_DATABASES -> ['aperture','sideline','rove']; SQL_MASTERY_DATABASES=aperture,sideline,rove in env + .env.example.
- src/learning-path.ts: getPhases() = [...aperturePhases, ...sidelinePhases, ...rovePhases] (contiguous unique phase.order); dataset per active concept's phase.level/database.
- src/query-service.ts: fingerprint fast path + positional normalizeRows.
- src/curriculum-service.ts: rebuild buildCurriculum around getLearningPath(); preserve the top-level learningPath field and stable client-facing keys; recompute stats; update product copy to the three-band story.
- client/src/lib/foundations.ts: FOUNDATIONS_KEY v2, levelBaseTier + scaffoldTier ctx + per-band graduationStatus + maxUnlockedOrder clamp.
- client/src/routes/foundations/FoundationsSession.tsx: group the tile map into three band sections (Beginner/Aperture, Intermediate/Sideline, Advanced/Rove) with a locked overlay until the prior capstone passes, band headers with dataset badges, a subtle current-tier label. FoundationsRep.tsx needs no change.

## Build order (task-sized; validate against local Postgres at each content step)

0. Namespacing + engine guardrails: build-time unique/1:1 skill<->concept assertion; FOUNDATIONS_KEY v2 + maxUnlockedOrder clamp-on-load.
1. Grading fingerprint refactor (query-service): fingerprint fields, checkQuery fast path, positional normalizeRows; ship behind existing ex() so foundations/joins still pass during transition.
2. schema-catalog.ts over describeDatabase for all three DBs + typed helpers + joinPairs; unit-tested against the seeded schemas.
3. concept-template model + DSL; author BEGINNER (aperture) templates (17) as the reference family.
4. bind.ts (PRNG, real-value + co-occurring literal probe, join-pair binding); emit.ts (per-family tiebreak, unique aliases, ROUND wrap).
5. task-text.ts + scaffold.ts + hint.ts + assemble.ts (one binding object); emit generated aperture phase modules.
6. validate-exercises.ts + gates G0-G9 + fingerprint production; run against seeded aperture until 100% pass.
7. curate.ts (skeleton dedup + difficulty + sampler); freeze the aperture shipped set with honest counts.
8. INTERMEDIATE (sideline) templates incl. the 4 window basics, ROLLUP/string_agg/FILTER, curated existence-dependent exercises (seed the required unmatched rows first).
9. ADVANCED (rove) templates: all bounded to city+date slices, rowCeiling<=200; cleaning 1-12, applied windows 13-18 (date-spine moving average), behavioral 19-22, capstone 23, rv-explain-fanout.
10. Level-structure wiring: banded phase objects, getPhases() union, mid-band + boundary-capstone checkpoints, per-band graduationStatus.
11. Scaffold tapering: levelBaseTier + scaffoldTier(ctx) + first-exposure bump + clamp unit tests.
12. db-config allowlist swap + env; retire foundations.ts/joins.ts/academy-expansion/interview-expansion/HTML.
13. curriculum-service reassembly around getLearningPath(); preserve client keys; recompute stats.
14. Level-aware UI: band-grouped tile map + capstone-locked overlays + dataset badges + tier label; snapshot-identity check; full `npm run validate-exercises` as the release gate.

## Test plan

- Unit: schema-catalog helpers per DB; bind predicate rejection; emit per-family tiebreak + unique aliases; scaffold fill-back byte-equality + blank-count==answer-count; scaffoldTier clamp (mastered beginner review never more help than fresh advanced first attempt); skill-id uniqueness/1:1 assertion; maxUnlockedOrder clamp on a stale v1 blob.
- Integration (against local seeded Postgres, the validate-exercises harness): every generated + checkpoint exercise passes G0-G9; per-concept honest counts reported; fingerprint self-check.
- Regression: existing foundations/joins tests pass during the transition (step 1) before retirement; query-service fingerprint grading unit tests (ordered vs unordered).
- End-to-end (controller, local): seed-all, generate-exercises, validate-exercises exits 0; spot-run the app against the three DBs.

## Risks and mitigations

- Broken expectedSql 500ing learners: eliminated by the fingerprint refactor (expectedSql never runs in prod) + G1.
- Non-deterministic grading (float/tz/tie order): determinism by construction in emit (per-family tiebreak, ROUND) + G4 backstop + fingerprint.
- Large-result grading on 520k/1.2M Rove: bounded slices + G3 row-ceiling.
- Skill-id collision resolving a review to the wrong band/DB: namespacing + build-time 1:1 assertion.
- False "graduated" after regeneration: FOUNDATIONS_KEY v2 + maxUnlockedOrder clamp + drop-unknown-skillCorrect on load.
- Snapshot drift between validation and served DBs: G0 snapshot-identity hash.
- Duplicate output columns collapsing in normalizeRows: unique-alias emit + G6 + positional normalizeRows.

## Open decisions (resolved defaults; flag if you disagree)

- Tapering unlock keyed on the prior band's CAPSTONE passed (not full band-graduation), to avoid over-gating on one weak skill. RESOLVED: capstone-passed.
- Optional rv-recursive-cte concept only if a cheap reversible `merchants.parent_category_id` self-ref is added; otherwise recursive CTE is explicitly out of the interview target. DEFAULT: skip recursive CTE unless you want it (it is a minor senior-interview item).
- Honest per-concept exercise counts reported (thin concepts like select-all are legitimately ~3-6); the product copy says the real total, not a blanket "hundreds". RESOLVED: honest counts.
