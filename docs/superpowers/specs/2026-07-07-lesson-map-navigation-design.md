# Lesson map navigation: clickable concept tiles, per lesson reset, monotonic unlock

Date: 2026-07-07
Status: proposed (awaiting user review before planning)

## Problem

Today the Foundations "Your path" page (`client/src/routes/Foundations.tsx`) shows concept
tiles as display only `div`s, and the only route into practice is one button, "Continue
today's session", which builds a guided day: spaced reviews of older skills plus the next
not yet strong lesson. The learner (a senior data analyst climbing from beginner SQL to
FAANG interview level over 4 to 6 months, practicing daily) asked for two additions that
must coexist with the existing spaced repetition engine, not replace it:

1. Make already reached concept tiles clickable, so any single unlocked lesson can be drilled
   on demand, while the guided daily session stays the recommended path.
2. Replace the always on global sidebar "Reset progress" button with a per lesson reset that
   clears just one concept's mastery so its full step by step scaffold returns.

The core hazard: the engine picks the next lesson as "the earliest not yet strong concept"
(`nextConcept`). A per lesson reset makes a concept not strong, which would drag that
"earliest not strong" frontier backward and re-lock downstream lessons the learner already
opened, and would yank the guided headline lesson back to an early skill. The design resolves
that with a persisted monotonic unlock high-water mark, and routes a reset lesson back through
spaced review rather than through the guided headline.

## Grounded facts (verified in code, not assumed)

- `LearningState` (`client/src/types.ts`): `{ skillCorrect, attempts, lastSql,
  lastPracticedSession, checkpointsPassed, sessionCounter, reviewsPassed }`. No unlock field
  exists today.
- The live loader is `learning-path.ts::loadLearning` then `normalize` (lines 12 to 22), which
  whitelists exactly those seven fields and silently drops anything else. `foundations.ts`
  has its own legacy loader used by the `sqlm:foundations:v1` to `sqlm:learning:v1` migration
  and by unit tests. A new persisted field MUST be added to `learning-path.ts::normalize` and
  `defaultState`, or every normal load rebuilds state without it.
- `FoundationsContext.update()` (lines 25 to 39) shallow copies `skillCorrect`, `attempts`,
  `lastSql`, `lastPracticedSession`, `checkpointsPassed`. It does NOT copy `reviewsPassed`
  (a pre-existing latent bug). Any mutator that deletes a key on `reviewsPassed` would mutate
  the previous snapshot in place.
- `nextConcept` (foundations.ts:140) returns the earliest not strong concept, and returns
  `null` if that concept is gated by an unpassed checkpoint. `conceptUnlocked` (line 133) is a
  private checkpoint gate helper. `dueReviews` (line 107) skips any skill where
  `isLearned` is false, and `isLearned` requires `skillCorrect[skill].length > 0`.
- `buildTodaySession` (line 168) checks `checkpointDue` first, then `nextConcept`.
- `checkpointDue` (line 150) skips already passed checkpoints and requires every concept at or
  below the checkpoint boundary to be strong.
- `scaffoldTier(state, skill, isReview)` returns `full` whenever `!isReview` or the skill is
  not strong, and only fades (`half` then `blank`) for reviews of a strong skill, keyed on
  `reviewsPassed[skill]`.
- Concept `order` is global across the flattened track. The tile grid renders only the active
  phase's concepts (`Foundations.tsx:72`), and "All phases" locks whole phases with
  `phase.order > active.order` (line 110).
- `resetAllProgress` (`progress.ts`) is the ONLY code path that wipes academy progress
  (`sqlm:product-progress:v1`), the `sqlm:<page>:<id>` lesson checkboxes, and the active
  session pointer. Per lesson reset does not touch any of those.
- `AccountMenu` (`client/src/components/AccountMenu.tsx`) already renders in the sidebar foot
  and branches on auth state.

## Decisions

### D1. After a per lesson reset, the guided path re-surfaces the lesson as a spaced review, not as the headline lesson

A learner resets a lesson because they feel shaky on it, so the tutor should weave it back in.
But yanking a phase 4 learner's headline lesson back to a phase 1 skill is a jarring, daily
regression of forward progress. The resolution keeps the learner's true frontier as the
headline and interleaves the reset skill as a review.

Mechanism (corrected from the design panel, whose version relied on `dueReviews`, which cannot
surface a reset skill because reset clears `skillCorrect` and `dueReviews` gates on
`isLearned`):

- `maxUnlockedOrder` is the monotonic frontier marker. A not strong concept whose
  `order < maxUnlockedOrder` is, by construction, a reset concept (mastery forms an ordered
  prefix, so the only way a below frontier concept is not strong is a reset).
- The guided MAIN lesson is chosen by a new `frontierConcept` that skips reset concepts:
  the earliest not strong, unlocked concept with `order >= maxUnlockedOrder`.
- Reset concepts (not strong, unlocked, `order < maxUnlockedOrder`) are surfaced as reviews by
  `buildTodaySession` directly (drawing their first exercise), merged ahead of `dueReviews`
  as the weakest items, capped at `MAX_REVIEWS_PER_SESSION`.
- Fallback: if there is no frontier lesson ahead (the reset concept IS the frontier, for a
  beginner who resets their only in progress lesson, or a graduated learner who resets), the
  reset concept correctly becomes the main lesson again via `nextConcept`.

Confirm copy tells the truth: "Reset this lesson? Its full step by step scaffold comes back and
it re-enters your daily reviews. Your place in the path and your other lessons are untouched."

### D2. The global reset is demoted, not deleted

The learner chose "replace the global reset with a per lesson reset." Because `resetAllProgress`
is the only way to wipe academy progress and lesson checkboxes, deleting it outright would
strand that data and break a legitimate factory reset. Resolution: remove the always on
"Reset progress" button from the sidebar foot (`AppShell.tsx` lines 98 to 103) and relocate a
single, honestly labeled "Reset everything" action into `AccountMenu` (already in the sidebar
foot). It keeps `resetAllProgress` and `KEEP_ON_RESET` unchanged, still confirms and reloads,
and cleanly separates intents: per lesson reset is frequent, scoped, and undoable; global
reset is rare, buried in the account area, and wipes the whole device.

### D3. Unlock is a checkpoint gate ANDed with a monotonic high-water mark

Add one persisted number, `maxUnlockedOrder` (default 0). A concept tile is UNLOCKED iff:

```
isConceptUnlocked(track, state, concept)                       // existing checkpoint gate
AND concept.order <= max(frontierOrder, maxUnlockedOrder)      // mastery frontier ceiling
```

where `frontierOrder = frontierConcept(track, state)?.order ?? maxConceptOrder`. The checkpoint
gate is ANDed so a real unpassed gate always wins. The high-water mark only ever RAISES the
ceiling, so resetting any concept's mastery can never lower any tile's unlock. `maxUnlockedOrder`
advances in exactly one place: a track aware `recordConceptProgress(track, state, exercise)`
that calls the pure `recordCorrect` and then, if the concept just became strong, sets
`maxUnlockedOrder = max(maxUnlockedOrder, concept.order + 1)`. `recordCorrect`,
`recordReviewPass`, `recordCheckpointResult`, and `nextConcept` stay pure and unchanged, so
their existing tests keep passing.

## State model

New field on `LearningState`:

```
maxUnlockedOrder: number   // monotonic unlock high-water mark: the furthest concept.order
                           // the learner has ever been cleared to reach (a concept becoming
                           // strong sets it to order + 1). Only ever raised (Math.max).
```

Migration (additive, no `LEARNING_KEY` bump):

- Add `maxUnlockedOrder: 0` to `defaultState()` in BOTH `learning-path.ts` (the live loader)
  and `foundations.ts` (legacy loader), and add it to `normalize()` in `learning-path.ts`:
  `Number.isFinite(parsed.maxUnlockedOrder) && parsed.maxUnlockedOrder > 0 ?
  parsed.maxUnlockedOrder : 0`. Absent, non finite, or `<= 0` coerces to the sentinel `0`,
  meaning "derive on first track aware render."
- `normalize` has no access to the track, so derivation is deferred. Add
  `reconcileUnlock(track, state)` (exported from `learning-path.ts`) that raises
  `maxUnlockedOrder` to `max(current, (max order among currently strong concepts) + 1,
  max concept order at or below any passed checkpoint)`. `FoundationsProvider` runs it once,
  after the track loads, and persists only if the value increased. A returning learner deep in
  the path therefore never sees a reached tile re-lock; a genuinely new learner derives 0.

Snapshot safety fix (pre-existing bug, in scope because reset depends on it):

- Extend `FoundationsContext.update()`'s shallow copy to include
  `reviewsPassed: { ...prev.reviewsPassed }`. `maxUnlockedOrder` is a primitive and is carried
  by `...prev`. All mutators reassign fresh objects (never `delete` on a shared reference).

## Engine changes (`client/src/lib/foundations.ts`)

- `export function isConceptUnlocked(track, state, concept): boolean` wraps the existing
  private `conceptUnlocked`.
- `export function frontierConcept(track, state): Concept | null`: earliest concept that is not
  strong AND `order >= state.maxUnlockedOrder` AND `isConceptUnlocked`; returns `null` when the
  next such concept is checkpoint gated (mirrors `nextConcept`), or when none exists (all
  concepts at or above the frontier are strong).
- `export function frontierOrder(track, state): number = frontierConcept?.order ?? maxOrder`.
- `export function recordConceptProgress(track, state, exercise): LearningState`: calls
  `recordCorrect`, then bumps `maxUnlockedOrder = max(maxUnlockedOrder, concept.order + 1)` if
  the concept is now strong. Used by every concept exercise correct path (focused practice and
  the guided rep handler) so the map and the frontier stay in sync.
- `export function resetConcept(state, skill): LearningState`: reassigns fresh `skillCorrect`,
  `reviewsPassed`, `lastPracticedSession` maps that omit `skill`. Touches nothing else
  (`checkpointsPassed`, `sessionCounter`, `attempts`, `lastSql`, `maxUnlockedOrder` unchanged).
- `export function tileState(track, state, concept): 'done' | 'now' | 'unlocked' | 'upcoming'
  | 'locked'`:
  - `isSkillStrong` -> `done`
  - else `!isConceptUnlocked` -> `locked` (behind an unpassed checkpoint)
  - else `order > max(frontierOrder, maxUnlockedOrder)` -> `upcoming` (reachable later, not yet)
  - else `order === frontierOrder` -> `now` (the single next lesson, independent of `lvl.count`)
  - else -> `unlocked` (reached, not strong, not the frontier: a reset concept, or an in
    progress earlier concept)
- `buildTodaySession` change (narrow, keyed on `frontierConcept` and `maxUnlockedOrder`):
  1. `reviews = mergedReviews(track, state)` = reset concepts (not strong, unlocked,
     `order < maxUnlockedOrder`, first exercise each) first, then `dueReviews(track, state)`,
     deduped by skill, capped at `MAX_REVIEWS_PER_SESSION`.
  2. If `checkpointDue` -> `main = checkpoint` (unchanged priority).
  3. Else `main = frontierConcept`; if it exists -> `lesson`.
  4. Else `fallback = nextConcept`; if it exists -> `lesson` (reset concept becomes main when
     there is nothing ahead), excluded from `reviews`.
  5. Else -> `graduated`.

  When `maxUnlockedOrder === 0` or no reset concept exists, `frontierConcept === nextConcept`
  and `mergedReviews === dueReviews`, so existing behavior and existing tests are unchanged
  (verified against the current `buildTodaySession` and `nextConcept` tests).

Dev time integrity: add an assertion in the flattened track builder that every `concept.skill`
is unique across the track (the engine and `resetConcept` key by skill). `console.error` on
collision.

## New route and components

### `ConceptPractice` (new: `client/src/routes/foundations/ConceptPractice.tsx`)

Route `/learn/concept/:conceptId`, registered in `App.tsx`. Focused single concept practice:

- Resolve concept by id from `track.concepts`. Declaratively `<Navigate to="/learn" replace />`
  for all four failure modes: unknown id, checkpoint locked (`!isConceptUnlocked`), high-water
  locked (`order > max(frontierOrder, maxUnlockedOrder)`), or empty `exercises`.
- Show the concept `TeachCard` on the first step, then one `FoundationsRep` per exercise
  (keyed by `exercise.id`), always at `tier = 'full'` (`scaffoldTier(state, skill, false)`),
  because focused practice is training wheels on demand.
- On correct, record via `recordConceptProgress` (bumps the high-water mark), advance the local
  stepper. NEVER call `advanceSession` (free practice does not tick the spacing clock).
- Final step: a "Lesson practiced" panel linking back to `/learn`, with a nudge to run the
  guided session if a checkpoint is now due.

Reuses: `FoundationsRep`, `useFoundations`, `scaffoldTier`, `isConceptUnlocked`,
`recordConceptProgress`, `AppShell`, `TeachCard`, `EmptyState`, `Button`.

### `ConceptTile` (extracted helper inside `Foundations.tsx`)

Renders one concept tile from `tileState`. Interactive states (`done`, `now`, `unlocked`) are
a NON interactive container `div` holding two SEPARATE sibling controls, never nested:

- a `<Link>` Practice target to `/learn/concept/:id` with a persistent (non hover) chevron and
  an `aria-label` summarizing state, for example "Start here: ORDER BY and LIMIT, new lesson"
  or "Practice SELECT basics, mastered";
- only when `skillLevel.count > 0`, a visually subordinate, always visible `<button>` Reset
  (its own tab stop) that calls `update(s => resetConcept(s, concept.skill))` behind an inline
  confirm, and shows a transient "Lesson reset. Undo" toast.

`upcoming` and `locked` tiles are non interactive, with a visible text label
("Upcoming" or "Locked, unlocks as you progress") plus `aria-label`, never glyph only.
Checkpoint tiles (`lh-tile-cp`) stay non clickable divs with their existing passed and
checkpoint states, and have no Reset control.

Both the Practice link and the Reset control exist only on rendered tiles, which are the
active phase's concepts. Clicking and resetting are therefore inherently scoped to the current
phase in this release (consistent with the cross phase non goal). A useful consequence: because
reset can only touch a concept in the current phase, and earlier phases stay complete, a reset
never makes an earlier phase incomplete, so `currentPhase` never regresses to an earlier phase
and no already unlocked phase re-locks. The `maxUnlockedOrder` high-water mark is still the
guarantee that unlock cannot regress even if a future feature introduces an out of order gap.

### `Foundations.tsx` page changes

- Compute the frontier concept id once from `frontierConcept` and pass an explicit `isFrontier`
  boolean into the tile so exactly one tile reads `now` even for a zero progress learner.
- Render active phase concept tiles via `ConceptTile`.
- Graduated state (`session.main.kind === 'graduated'`): replace the vanished hero session
  button with a "Free practice: pick any lesson" framing plus a "drill your weakest 3" shortcut
  driven by `weakSpots`. Every tile is a clickable "Practice again" card. This is the FAANG
  prep payoff state, so at graduation the tiles are promoted from secondary to primary.
- Leave the "All phases" list logic unchanged. Because the Reset control appears only on
  rendered active phase tiles, a reset can only affect a concept in the current phase, so
  `currentPhase` never regresses and no already unlocked phase re-locks (see ConceptTile).
- Add a one time dismissible hint that unlocked tiles are clickable.

### `AppShell.tsx`

Remove the always on "Reset progress" `<button>` from `sidebar-foot` (lines 98 to 103) and its
now unused `resetAllProgress` import.

### `AccountMenu.tsx`

Add a single "Reset everything" danger action, rendered regardless of sign in state (append
below the existing sync or sign out block, skipped in the `loading` branch). It is guarded by
`window.confirm` with honest copy naming the full blast radius (path, checkpoints, academy
problems, all lesson checkmarks), then calls `resetAllProgress()` and
`window.location.href = '/'`.

### `foundations.css`

Add: clickable tile affordance (cursor, focus ring, hover lift) and a persistent Practice
chevron; `.lh-tile.upcoming` (soft, non interactive); `.lh-tile.locked` (firm lock, non
interactive); the subordinate Reset control; the undo toast; the graduated free practice block.
Reuse the existing `.lh-tile`, `.ok`, `.now` vocabulary.

## Behaviors

- Guided path stays primary: the hero button is unchanged in prominence and remains the only
  `variant="primary"` CTA. Scaffold fade and spaced reviews remain guided only, so the guided
  path keeps unique value and tiles read as a supplemental drill map.
- Monotonic unlock: `maxUnlockedOrder` only ever rises. Resetting any concept cannot lower any
  tile's unlock.
- Per lesson reset is scoped and snapshot safe: clears only that skill's `skillCorrect`,
  `reviewsPassed`, `lastPracticedSession`; leaves everything else, including
  `maxUnlockedOrder`, untouched; `update()` now copies `reviewsPassed`.
- Reset re-surfaces as a review, not a headline jump (D1), with the true frontier staying the
  main lesson, unless the reset concept is itself the frontier.
- Reset of a strong, faded skill clears `reviewsPassed[skill]`, so the fade correctly restarts
  full then half then blank on re-mastery.
- Free practice never advances `sessionCounter`; only the guided session ticks the spacing
  clock. `ConceptPractice` nudges the learner to run the guided session to bank reviews.
- Undo on reset: the pre reset per skill slice is held in component memory and restored by the
  toast; no persistence schema change.
- Global reset demoted to `AccountMenu` with honest copy; `resetAllProgress` behavior unchanged.

## Edge cases

- Persisted blob lacks `maxUnlockedOrder`: `normalize` coerces to 0; the one time
  `reconcileUnlock` raises it from strong concepts and passed checkpoints so no reached tile
  re-locks.
- Hand typed `/learn/concept/:id` for a locked, unknown, or empty exercise concept: redirect to
  `/learn`.
- Two concepts reset, or a concept reset just before a checkpoint: `frontierConcept` still picks
  the frontier lesson as main; both reset concepts ride in as reviews; a PASSED checkpoint is
  never re-offered because `checkpointsPassed` is never cleared.
- Zero concept or single concept phase (author stub during content growth): guard phase math so
  `total === 0` is treated as complete with `pct` 0 rather than NaN; a single concept phase
  still marks its one tile `now`.
- Free practice pushes a concept to strong for the first time: `recordConceptProgress` bumps
  `maxUnlockedOrder`, so the guided frontier and the map agree.
- Graduated learner resets a concept: `frontierConcept` is `null`, so `buildTodaySession` falls
  back to `nextConcept` and the reset concept becomes the main lesson (`kind === 'lesson'`, not
  `graduated`), so the normal hero button returns to re-drill it rather than showing the
  graduated free practice framing. Tiles stay clickable throughout.
- Duplicate concept skill (authoring mistake): dev time uniqueness assertion fires.

## Accessibility

- Interactive tiles use real `<Link>` or `<button>` elements (Enter and Space activation,
  visible focus ring), never `onClick` on a div.
- The Practice chevron and interactivity are announced via `aria-label` and are visible without
  hover (works on touch).
- Reset is a separate sibling button, its own tab stop, always visible, visually subordinate.
  Interactive elements are never nested.
- `upcoming` and `locked` tiles carry a visible text label plus `aria-label`, satisfying WCAG
  1.4.1 (meaning not conveyed by color or icon alone), and are not focusable.
- The undo toast is announced via an `aria-live="polite"` region.
- The demoted "Reset everything" action is a clearly labeled button whose confirm text states
  the full blast radius.

## Test plan (vitest)

- Unlock high-water mark (`foundations.test.ts`): `isConceptUnlocked` false when checkpoint
  gated, true once passed; `recordConceptProgress` raises `maxUnlockedOrder` to `order + 1`
  only when the concept becomes strong and never lowers it; monotonicity (master c3, reset c2,
  `maxUnlockedOrder` stays `>= 4` and c3 stays `done`); `tileState` mapping for all five states,
  including exactly one `now` on default state.
- Per lesson reset (`foundations.test.ts`): `resetConcept` clears only the target skill's three
  maps and leaves `checkpointsPassed`, `sessionCounter`, `attempts`, `lastSql`,
  `maxUnlockedOrder`, and other skills untouched; after reset, `isSkillStrong` false and
  `scaffoldTier(state, skill, false)` returns `full`; re-mastering restarts the fade half then
  blank.
- Guided path after reset, D1 (`foundations.test.ts`): reset a concept earlier than the
  frontier and assert `buildTodaySession` keeps the true frontier as main and includes the
  reset skill in reviews; reset the frontier or only in progress concept and assert it becomes
  main again; reset two concepts and assert main is the earliest not strong at or above the
  frontier; reset just before a passed checkpoint and assert that checkpoint is not re-offered.
- Persistence and migration (`learning-path.test.ts`): `loadLearning` on a field less blob
  returns a finite number (0), never undefined or NaN; `normalize` coerces a non finite or
  negative value to 0; `reconcileUnlock` raises the mark from strong skills and a passed
  checkpoint and never lowers a higher value; the legacy key migration carries a defined
  `maxUnlockedOrder`.
- Context snapshot safety (`FoundationsContext`): `update` that mutates `reviewsPassed` or
  `maxUnlockedOrder` does not mutate the previous state object (`prev.reviewsPassed` unchanged
  after `update(resetConcept)`); `reconcileUnlock` runs once when the track loads and persists.
- `ConceptPractice` (`foundations-ui.test.tsx`): `/learn/concept/:id` for a locked, unknown, or
  empty exercise concept redirects to `/learn`; a correct answer records via
  `recordConceptProgress`, does not increment `reviewsPassed`, and does not call
  `advanceSession`; a clickable tile is a real button or link (Enter and Space activatable) with
  an `aria-label`; an `upcoming` or `locked` tile has no `onClick` or `href` and is not
  focusable; graduated state offers a free practice entry point instead of a dead end.
- Phase edge math: a zero concept phase does not NaN the ring or phase score and is skipped by
  `currentPhase`; a single concept phase renders exactly one clickable frontier tile.
- Content integrity: the dev time assertion fires when two concepts share a skill.

## Risks and mitigations

- New field not coerced in the LIVE loader would make `Math.max` yield NaN and lock every tile.
  Mitigation: add it to `learning-path.ts::normalize` and `defaultState` (the path that runs),
  and cover with a field less blob load test asserting a finite number.
- `reconcileUnlock` running before the track loads, or thrashing storage. Mitigation: gate on
  `track !== null` and a ran once ref; persist only when the value increased.
- The `buildTodaySession` D1 change regressing session ordering or checkpoint timing.
  Mitigation: keep `nextConcept` and `checkpointDue` unchanged; implement main selection as a
  narrow `frontierConcept` filter; add the four D1 tests and re-run the full suite before
  shipping.
- Nested interactive regression if a future edit puts Reset back inside the tile click target.
  Mitigation: container div plus two sibling controls, enforced by a UI test that both controls
  are independently focusable.
- Learners abandoning the guided path once tiles are clickable. Mitigation: strong visual
  hierarchy (hero stays the only primary CTA), tiles framed as supplemental, scaffold fade and
  spaced reviews remain guided only.

## Out of scope

- Cross phase inline tile drilling. The grid stays active phase scoped this release; advanced
  phases stay summarized in "All phases" until reached. The high-water mark is global so nothing
  re-locks, but clicking a joins or window function tile before that phase is active is not
  built now.
- Per checkpoint retake and scoped academy only or path only resets.
- Advancing the spacing clock from free practice.
- Cross device sync of `maxUnlockedOrder` (the dormant Google sign in path is unchanged).

## Deploy note

All changes here are client only (the tiles, route, engine, and storage all live in `client/`),
so this ships through the Cloudflare Pages auto build on push to main. No VPS backend rebuild or
service restart is required for this feature.
