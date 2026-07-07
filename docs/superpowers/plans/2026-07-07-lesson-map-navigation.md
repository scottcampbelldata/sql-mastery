# Lesson Map Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Foundations concept tiles into a clickable lesson map with a focused per-concept practice route and a per-lesson reset, backed by a monotonic unlock high-water mark so reset never re-locks reached lessons.

**Architecture:** Add one persisted number (`maxUnlockedOrder`) to the learning state and a handful of pure engine helpers in `foundations.ts` (`isConceptUnlocked`, `frontierConcept`, `frontierOrder`, `recordConceptProgress`, `resetConcept`, `tileState`, `conceptPracticeTarget`), plus a narrow `buildTodaySession` change so a reset lesson re-enters as a spaced review instead of hijacking the guided headline. The UI adds a presentational `ConceptTile`, a focused `/learn/concept/:conceptId` route (`ConceptPractice`) that reuses `FoundationsRep`, relocates the global reset from the sidebar into `AccountMenu`, and styles the new tile states.

**Tech Stack:** React 18 + React Router 6, strict TypeScript 6, Vitest 2 + Testing Library, CSS with existing design tokens. All changes are under `client/`.

## Global Constraints

- No en dashes, em dashes, or minus look-alikes anywhere in any file, code, or copy. ASCII hyphen only.
- Client-only change. It ships through the Cloudflare Pages auto build on push to main. No VPS rebuild or service restart.
- All commands run from `sql-mastery/client/` (the client package root).
- Run a single test file with `npm test -- <path>` and the full suite with `npm test`. Run `npm run typecheck` after each task; it must pass.
- Do NOT change the signatures or behavior of `recordCorrect`, `recordAttempt`, `recordReviewPass`, `nextConcept`, `checkpointDue`, `recordCheckpointResult`, `dueReviews`, or `scaffoldTier`. All existing tests must keep passing.
- Reuse existing CSS tokens: `--brand`, `--brand-soft`, `--brand-ink`, `--accent2`, `--accent2-soft`, `--surface-1/2/3`, `--line`, `--line-strong`, `--ink-strong/dim/faint`, `--s-2/3/4`, `--r-md/lg`, `--text-xs/md`, `--font-mono`, `--shadow-sm`, `--ease`.
- End every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

- `client/src/types.ts` (modify): add `maxUnlockedOrder` to `LearningState`.
- `client/src/lib/learning-path.ts` (modify): default, normalize coercion, `reconcileUnlock`, `duplicateSkills`.
- `client/src/lib/foundations.ts` (modify): legacy default and loader; new pure engine helpers; `buildTodaySession` change.
- `client/src/state/FoundationsContext.tsx` (modify): copy `reviewsPassed` in `update`, run `reconcileUnlock` once, dev-only duplicate-skill check.
- `client/src/routes/foundations/ConceptPractice.tsx` (create): focused single-concept practice route.
- `client/src/routes/foundations/ConceptTile.tsx` (create): presentational tile.
- `client/src/routes/Foundations.tsx` (modify): render `ConceptTile`, reset handler + undo toast, graduated free-practice block.
- `client/src/routes/foundations/FoundationsRep.tsx` (modify): record concept progress through `recordConceptProgress`.
- `client/src/App.tsx` (modify): register the new route.
- `client/src/components/AppShell.tsx` (modify): remove the global reset button.
- `client/src/components/AccountMenu.tsx` (modify): add the demoted "Reset everything" action.
- `client/src/routes/foundations/foundations.css` (modify): tile, reset, toast, and free-practice styles.
- Tests: `client/src/lib/foundations.test.ts`, `client/src/lib/learning-path.test.ts`, `client/src/routes/foundations/ConceptPractice.test.tsx` (create), `client/src/routes/foundations/ConceptTile.test.tsx` (create), `client/src/components/AccountMenu.test.tsx` (create).

---

### Task 1: Add `maxUnlockedOrder` to state, loaders, and migration

**Files:**
- Modify: `client/src/types.ts:130-140`
- Modify: `client/src/lib/learning-path.ts:8-22`
- Modify: `client/src/lib/foundations.ts:11-33`
- Test: `client/src/lib/learning-path.test.ts`, `client/src/lib/foundations.test.ts`

**Interfaces:**
- Produces: `LearningState.maxUnlockedOrder: number`; both `defaultState()` functions and `learning-path.ts::normalize` and `foundations.ts::loadFoundations` populate it (default `0`, coerced from persisted blobs).

- [ ] **Step 1: Add the field to the type**

In `client/src/types.ts`, inside `interface LearningState` (after the `reviewsPassed` line), add:

```ts
  // Monotonic unlock high-water mark: the furthest concept.order the learner has ever been
  // cleared to reach (set to order + 1 when a concept becomes strong). Only ever raised.
  maxUnlockedOrder: number;
```

- [ ] **Step 2: Add it to the live loader default and normalize**

In `client/src/lib/learning-path.ts`, change `defaultState` (line 8-10) to:

```ts
function defaultState(): LearningState {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 };
}
```

and add the coerced field to the object returned by `normalize` (after the `reviewsPassed` line, line 20):

```ts
    reviewsPassed: asObject(parsed.reviewsPassed),
    maxUnlockedOrder: Number.isFinite(parsed.maxUnlockedOrder) && parsed.maxUnlockedOrder > 0 ? parsed.maxUnlockedOrder : 0
```

- [ ] **Step 3: Add it to the legacy loader default and loader**

In `client/src/lib/foundations.ts`, change `defaultState` (line 11-13) to include `maxUnlockedOrder: 0`:

```ts
function defaultState(): LearningState {
  return { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 };
}
```

and add the coerced field to the object returned by `loadFoundations` (after the `reviewsPassed` line, line 28):

```ts
        reviewsPassed: asObject(parsed.reviewsPassed),
        maxUnlockedOrder: Number.isFinite(parsed.maxUnlockedOrder) && parsed.maxUnlockedOrder > 0 ? parsed.maxUnlockedOrder : 0
```

- [ ] **Step 4: Update the two existing exact-shape assertions**

In `client/src/lib/learning-path.test.ts`, the test "loads a safe default under its own key" (line 21-23) asserts the full default shape. Update its `toEqual` to include the new field:

```ts
    expect(loadLearning()).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 });
```

In `client/src/lib/foundations.test.ts`, the test "loads a safe default and round-trips under its own key" (line 40-45) asserts the default shape. Update its `toEqual`:

```ts
    expect(s).toEqual({ skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 });
```

- [ ] **Step 5: Add new coercion tests**

In `client/src/lib/learning-path.test.ts`, add these tests inside the `describe` block:

```ts
  it('coerces a missing maxUnlockedOrder to 0 (returning user upgrade)', () => {
    const blob = { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 2, reviewsPassed: {} };
    localStorage.setItem(LEARNING_KEY, JSON.stringify(blob));
    const loaded = loadLearning();
    expect(Number.isFinite(loaded.maxUnlockedOrder)).toBe(true);
    expect(loaded.maxUnlockedOrder).toBe(0);
  });

  it('coerces a non-finite or negative maxUnlockedOrder to 0 and preserves a valid one', () => {
    localStorage.setItem(LEARNING_KEY, JSON.stringify({ maxUnlockedOrder: -3 }));
    expect(loadLearning().maxUnlockedOrder).toBe(0);
    localStorage.setItem(LEARNING_KEY, JSON.stringify({ maxUnlockedOrder: 5 }));
    expect(loadLearning().maxUnlockedOrder).toBe(5);
  });
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- src/lib/learning-path.test.ts src/lib/foundations.test.ts`
Expected: PASS (both files green, including the two updated default-shape assertions).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add client/src/types.ts client/src/lib/learning-path.ts client/src/lib/foundations.ts client/src/lib/learning-path.test.ts client/src/lib/foundations.test.ts
git commit -m "feat: add maxUnlockedOrder to learning state with additive migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `reconcileUnlock`, duplicate-skill check, and context wiring

**Files:**
- Modify: `client/src/lib/learning-path.ts`
- Modify: `client/src/state/FoundationsContext.tsx:25-47`
- Test: `client/src/lib/learning-path.test.ts`

**Interfaces:**
- Consumes: `LearningState.maxUnlockedOrder` (Task 1), `isSkillStrong` (existing, `foundations.ts`).
- Produces: `reconcileUnlock(track: Track, state: LearningState): number` (returns a value greater than or equal to the current mark), `duplicateSkills(track: Track): string[]`.

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/learning-path.test.ts`, import the new helpers by changing the import on line 2 to:

```ts
import { LEARNING_KEY, loadLearning, saveLearning, currentPhase, phaseGraduation, reconcileUnlock, duplicateSkills } from './learning-path';
```

Add a track fixture and tests inside the `describe` block:

```ts
  const track = {
    dataset: 'chinook', phases, skills: [], exercises: [],
    concepts: [
      { id: 'c1', order: 1, skill: 'select-all', title: 'A', exercises: [] },
      { id: 'c2', order: 2, skill: 'where', title: 'B', exercises: [] },
      { id: 'c3', order: 3, skill: 'inner-join', title: 'C', exercises: [] }
    ],
    checkpoints: [{ id: 'cpB', afterOrder: 2, drawFromSkills: [], title: 'B' }]
  } as any;

  it('reconcileUnlock raises the mark from strong concepts and passed checkpoints, never lowers it', () => {
    const s = loadLearning();
    strong(s, 'select-all', ['a', 'b', 'c']);   // c1 strong -> order 1 + 1 = 2
    s.checkpointsPassed = ['cpB'];                // cpB afterOrder 2 -> 2 + 1 = 3
    expect(reconcileUnlock(track, s)).toBe(3);
    s.maxUnlockedOrder = 9;                        // already higher
    expect(reconcileUnlock(track, s)).toBe(9);    // never lowers
  });

  it('duplicateSkills flags a skill shared by two concepts', () => {
    expect(duplicateSkills(track)).toEqual([]);
    const dup = { ...track, concepts: [...track.concepts, { id: 'c4', order: 4, skill: 'where', title: 'D', exercises: [] }] } as any;
    expect(duplicateSkills(dup)).toContain('where');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/learning-path.test.ts`
Expected: FAIL (reconcileUnlock and duplicateSkills are not exported).

- [ ] **Step 3: Implement the helpers**

In `client/src/lib/learning-path.ts`, add the `Track` and `Concept` imports and the helpers. Change the type import on line 3 to:

```ts
import type { LearningState, Phase, Track } from '../types';
```

Append at the end of the file:

```ts
// Back-fill the unlock high-water mark for a returning learner from what they have already
// achieved, so no reached lesson re-locks after this feature ships. Returns a value greater
// than or equal to the current mark; callers persist only if it increased.
export function reconcileUnlock(track: Track, state: LearningState): number {
  let mark = state.maxUnlockedOrder;
  for (const c of track.concepts) {
    if (isSkillStrong(state, c.skill)) mark = Math.max(mark, c.order + 1);
  }
  for (const cp of track.checkpoints) {
    if (state.checkpointsPassed.includes(cp.id)) mark = Math.max(mark, cp.afterOrder + 1);
  }
  return mark;
}

// Dev-time integrity: every concept.skill must be unique across the flattened track, because
// the engine and per-lesson reset key by skill. Returns the list of skills used more than once.
export function duplicateSkills(track: Track): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const c of track.concepts) {
    if (seen.has(c.skill)) dups.add(c.skill);
    seen.add(c.skill);
  }
  return [...dups];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/learning-path.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the context (snapshot copy, reconcile once, dev check)**

In `client/src/state/FoundationsContext.tsx`:

Change the imports on lines 1 and 4 to:

```ts
import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from 'react';
```
```ts
import { loadLearning, saveLearning, reconcileUnlock, duplicateSkills } from '../lib/learning-path';
```

Add `reviewsPassed` to the shallow copy in `update` (inside the object literal at lines 27-34, after the `checkpointsPassed` line):

```ts
        checkpointsPassed: [...prev.checkpointsPassed],
        reviewsPassed: { ...prev.reviewsPassed }
```

After the `update` callback (before the `const track = ...` line at line 43), add the reconcile effect. First move the `track` and `phases` derivations above the effect so it can depend on `track`:

```ts
  const track = curriculum ? curriculum.learningPath : null;
  const phases = curriculum ? curriculum.learningPath.phases : [];

  const reconciled = useRef(false);
  useEffect(() => {
    if (!track || reconciled.current) return;
    reconciled.current = true;
    const mark = reconcileUnlock(track, state);
    if (mark > state.maxUnlockedOrder) update((s) => { s.maxUnlockedOrder = mark; });
    if (import.meta.env.DEV) {
      const dups = duplicateSkills(track);
      if (dups.length) console.error('Duplicate concept skills in learning track:', dups);
    }
  }, [track]); // eslint-disable-line react-hooks/exhaustive-deps
```

Then remove the now-duplicate `const track = ...` and `const phases = ...` lines that were at 43-44, keeping the single definitions above, and leave the `value`/`useMemo`/return unchanged.

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/learning-path.ts client/src/lib/learning-path.test.ts client/src/state/FoundationsContext.tsx
git commit -m "feat: reconcile unlock high-water mark on load and fix context snapshot copy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pure engine helpers (unlock, frontier, progress, reset)

**Files:**
- Modify: `client/src/lib/foundations.ts`
- Test: `client/src/lib/foundations.test.ts`

**Interfaces:**
- Consumes: private `conceptUnlocked`, `isSkillStrong`, `recordCorrect` (existing).
- Produces:
  - `isConceptUnlocked(track: Track, state: LearningState, concept: Concept): boolean`
  - `frontierConcept(track: Track, state: LearningState): Concept | null`
  - `frontierOrder(track: Track, state: LearningState): number`
  - `recordConceptProgress(track: Track, state: LearningState, exercise: Exercise): LearningState`
  - `resetConcept(state: LearningState, skill: string): LearningState`

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/foundations.test.ts`, extend the import from `./foundations` (lines 2-9) to add:

```ts
  scaffoldTier, recordReviewPass,
  isConceptUnlocked, frontierConcept, frontierOrder, recordConceptProgress, resetConcept
```

Add these tests inside the `describe('foundations engine', ...)` block (the module already defines the `track` fixture with concepts c1..c5, `strong` helper, and checkpoints cpA afterOrder 4, cpB afterOrder 5):

```ts
  it('isConceptUnlocked follows the checkpoint gate', () => {
    const s = loadFoundations();
    expect(isConceptUnlocked(track, s, track.concepts[4])).toBe(false); // c5 gated by cpA
    recordCheckpointResult(s, track.checkpoints[0], 6);                  // pass cpA
    expect(isConceptUnlocked(track, s, track.concepts[4])).toBe(true);
  });

  it('recordConceptProgress raises maxUnlockedOrder only when a concept becomes strong', () => {
    const s = loadFoundations();
    recordConceptProgress(track, s, { id: 'c1-r1', skill: 'select-all' });
    expect(s.maxUnlockedOrder).toBe(0);                                  // count 1, not strong
    recordConceptProgress(track, s, { id: 'c1-r2', skill: 'select-all' });
    recordConceptProgress(track, s, { id: 'c1-r3', skill: 'select-all' });
    expect(s.maxUnlockedOrder).toBe(2);                                  // c1 order 1 + 1
    expect(s.sessionCounter).toBe(0);                                    // never advances the clock
    expect(s.reviewsPassed).toEqual({});                                 // never touches the fade counter
  });

  it('unlock is monotonic: resetting a concept does not lower the mark or re-lock later ones', () => {
    const s = loadFoundations();
    ['c1-r1', 'c1-r2', 'c1-r3'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'select-all' }));
    ['c2-r1', 'c2-r2', 'c2-r3'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'select-columns' }));
    ['c3-r1', 'c3-r2', 'c3-r3'].forEach((id) => recordConceptProgress(track, s, { id, skill: 'order-limit' }));
    expect(s.maxUnlockedOrder).toBe(4);
    resetConcept(s, 'select-columns');
    expect(s.maxUnlockedOrder).toBe(4);                                  // unchanged
  });

  it('frontierConcept skips a reset concept and points at the true next lesson', () => {
    const s = loadFoundations();
    s.skillCorrect = { 'select-all': ['a', 'b', 'c'], 'select-columns': ['a', 'b', 'c'], 'order-limit': ['a', 'b', 'c'] };
    s.maxUnlockedOrder = 4;                                              // mastered c1..c3, on c4
    resetConcept(s, 'select-columns');                                  // reset c2 (order 2 < 4)
    expect(frontierConcept(track, s)!.id).toBe('c4');                   // not c2
    expect(frontierOrder(track, s)).toBe(4);
  });

  it('resetConcept clears only that skill and reassigns fresh maps (snapshot safe)', () => {
    const s = loadFoundations();
    s.skillCorrect = { where: ['a', 'b', 'c'], grp: ['x'] };
    s.reviewsPassed = { where: 2 };
    s.lastPracticedSession = { where: 1, grp: 0 };
    s.checkpointsPassed = ['cpA'];
    s.sessionCounter = 5;
    s.maxUnlockedOrder = 6;
    const beforeSkill = s.skillCorrect;
    const beforeReviews = s.reviewsPassed;
    resetConcept(s, 'where');
    expect(s.skillCorrect).toEqual({ grp: ['x'] });
    expect(s.reviewsPassed).toEqual({});
    expect(s.lastPracticedSession).toEqual({ grp: 0 });
    expect(s.checkpointsPassed).toEqual(['cpA']);
    expect(s.sessionCounter).toBe(5);
    expect(s.maxUnlockedOrder).toBe(6);
    expect(beforeSkill).toEqual({ where: ['a', 'b', 'c'], grp: ['x'] }); // old ref not mutated
    expect(beforeReviews).toEqual({ where: 2 });
  });

  it('reset restarts the scaffold fade from full', () => {
    const s = loadFoundations();
    strong(s, 'where', ['w1', 'w2', 'w3']);
    expect(scaffoldTier(s, 'where', true)).toBe('half');
    recordReviewPass(s, 'where');
    expect(scaffoldTier(s, 'where', true)).toBe('blank');
    resetConcept(s, 'where');
    expect(isSkillStrong(s, 'where')).toBe(false);
    expect(scaffoldTier(s, 'where', false)).toBe('full');
    strong(s, 'where', ['w1', 'w2', 'w3']);
    expect(scaffoldTier(s, 'where', true)).toBe('half');                // fade restarted
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/foundations.test.ts`
Expected: FAIL (the new helpers are not exported).

- [ ] **Step 3: Implement the helpers**

In `client/src/lib/foundations.ts`, immediately after the private `conceptUnlocked` function (which ends at line 138), add:

```ts
export function isConceptUnlocked(track: Track, state: LearningState, concept: Concept): boolean {
  return conceptUnlocked(track, state, concept);
}

function maxConceptOrder(track: Track): number {
  return track.concepts.reduce((m, c) => Math.max(m, c.order), 0);
}

// The learner's true frontier: the earliest not-strong, unlocked concept at or beyond the
// reached high-water mark. Concepts below the mark that are not strong are reset concepts and
// are handled as reviews, not as the headline lesson. Returns null when the next such concept
// is checkpoint-gated, or when none remains (every concept at or above the mark is strong).
export function frontierConcept(track: Track, state: LearningState): Concept | null {
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (concept.order < state.maxUnlockedOrder) continue;
    if (isSkillStrong(state, concept.skill)) continue;
    if (!conceptUnlocked(track, state, concept)) return null;
    return concept;
  }
  return null;
}

export function frontierOrder(track: Track, state: LearningState): number {
  const f = frontierConcept(track, state);
  return f ? f.order : maxConceptOrder(track);
}

// Track-aware progress recorder. Records a correct answer (pure recordCorrect) and raises the
// unlock high-water mark if the concept just became strong. Used by every concept-exercise
// correct path so the guided frontier and the tile map stay in sync.
export function recordConceptProgress(track: Track, state: LearningState, exercise: Exercise): LearningState {
  recordCorrect(state, exercise);
  const concept = track.concepts.find((c) => c.skill === exercise.skill);
  if (concept && isSkillStrong(state, exercise.skill as string)) {
    state.maxUnlockedOrder = Math.max(state.maxUnlockedOrder, concept.order + 1);
  }
  return state;
}

// Clears one concept's mastery so its full scaffold returns, without touching the path, the
// high-water mark, checkpoints, or any other skill. Reassigns fresh maps (never mutates in
// place) so a prior state snapshot is not corrupted.
export function resetConcept(state: LearningState, skill: string): LearningState {
  const omit = (m: Record<string, unknown>) => { const n = { ...m }; delete n[skill]; return n; };
  state.skillCorrect = omit(state.skillCorrect) as Record<string, string[]>;
  state.reviewsPassed = omit(state.reviewsPassed) as Record<string, number>;
  state.lastPracticedSession = omit(state.lastPracticedSession) as Record<string, number>;
  return state;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/foundations.test.ts`
Expected: PASS (new tests green, all existing tests still green).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/foundations.ts client/src/lib/foundations.test.ts
git commit -m "feat: unlock, frontier, progress, and reset engine helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `buildTodaySession` reset-aware routing and `tileState`

**Files:**
- Modify: `client/src/lib/foundations.ts:168-177`
- Test: `client/src/lib/foundations.test.ts`

**Interfaces:**
- Consumes: `frontierConcept`, `frontierOrder` (Task 3), `dueReviews`, `nextConcept`, `checkpointDue`, `conceptUnlocked`, `MAX_REVIEWS_PER_SESSION` (existing).
- Produces: `tileState(track, state, concept): 'done' | 'now' | 'unlocked' | 'upcoming' | 'locked'` (exported type alias `TileState`); modified `buildTodaySession`.

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/foundations.test.ts`, extend the import from `./foundations` to add `tileState` and `checkpointDue` (if not already imported; `buildTodaySession`, `recordCheckpointResult` are already imported). Add:

```ts
  tileState
```

Add these tests inside the `describe` block:

```ts
  it('tileState: default state has exactly one now tile and gates the rest', () => {
    const s = loadFoundations();
    const states = track.concepts.map((c) => tileState(track, s, c));
    expect(states.filter((x) => x === 'now').length).toBe(1);
    expect(tileState(track, s, track.concepts[0])).toBe('now');       // c1 frontier
    expect(tileState(track, s, track.concepts[1])).toBe('upcoming');  // c2 ahead of frontier
    expect(tileState(track, s, track.concepts[4])).toBe('locked');    // c5 behind cpA
  });

  it('tileState: a reset concept reads unlocked and a mastered one reads done', () => {
    const s = loadFoundations();
    s.skillCorrect = { 'select-all': ['a', 'b', 'c'], 'select-columns': ['a', 'b', 'c'], 'order-limit': ['a', 'b', 'c'] };
    s.maxUnlockedOrder = 4;
    resetConcept(s, 'select-columns');
    expect(tileState(track, s, track.concepts[2])).toBe('done');      // c3 still mastered
    expect(tileState(track, s, track.concepts[1])).toBe('unlocked');  // c2 reset, clickable, not frontier
    expect(tileState(track, s, track.concepts[3])).toBe('now');       // c4 frontier
  });

  it('buildTodaySession keeps the true frontier as main and rides a reset concept in as review', () => {
    const s = loadFoundations();
    s.skillCorrect = { 'select-all': ['a', 'b', 'c'], 'select-columns': ['a', 'b', 'c'], 'order-limit': ['a', 'b', 'c'] };
    s.maxUnlockedOrder = 4;
    resetConcept(s, 'select-columns');
    const session = buildTodaySession(track, s);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c4');
    expect(session.reviews.some((r) => r.skill === 'select-columns')).toBe(true);
  });

  it('buildTodaySession falls back to the reset concept as main when nothing is ahead', () => {
    const s = loadFoundations();
    recordConceptProgress(track, s, { id: 'c1-r1', skill: 'select-all' });
    resetConcept(s, 'select-all');
    const session = buildTodaySession(track, s);
    expect(session.main.kind).toBe('lesson');
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c1');
    expect(session.reviews.some((r) => r.skill === 'select-all')).toBe(false); // not also a review
  });

  it('buildTodaySession picks the earliest at-or-above-frontier lesson after two resets and does not re-offer a passed checkpoint', () => {
    const s = loadFoundations();
    s.skillCorrect = {
      'select-all': ['a', 'b', 'c'], 'select-columns': ['a', 'b', 'c'],
      'order-limit': ['a', 'b', 'c'], 'distinct': ['a', 'b', 'c']
    };
    s.checkpointsPassed = ['cpA'];
    s.maxUnlockedOrder = 5;
    resetConcept(s, 'select-all');
    resetConcept(s, 'select-columns');
    expect(checkpointDue(track, s)).toBeNull();                        // cpA already passed
    const session = buildTodaySession(track, s);
    expect((session.main as { concept: { id: string } }).concept.id).toBe('c5'); // where, frontier
    expect(session.reviews.map((r) => r.skill).sort()).toEqual(['select-all', 'select-columns']);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/foundations.test.ts`
Expected: FAIL (`tileState` not exported; `buildTodaySession` still routes reset concepts as main).

- [ ] **Step 3: Rewrite `buildTodaySession` and add `tileState`**

In `client/src/lib/foundations.ts`, replace the whole `buildTodaySession` function (lines 168-177) with:

```ts
// Reset concepts (not strong, unlocked, below the reached frontier) surface as reviews so a
// reset re-strengthens under spacing instead of yanking the headline lesson backward.
function resetReviews(track: Track, state: LearningState): DueReview[] {
  const out: DueReview[] = [];
  const ordered = [...track.concepts].sort((a, b) => a.order - b.order);
  for (const concept of ordered) {
    if (concept.order >= state.maxUnlockedOrder) continue;
    if (isSkillStrong(state, concept.skill)) continue;
    if (!conceptUnlocked(track, state, concept)) continue;
    if (!concept.exercises.length) continue;
    out.push({ skill: concept.skill, concept, exercise: concept.exercises[0] });
  }
  return out;
}

function mergedReviews(track: Track, state: LearningState): DueReview[] {
  const resets = resetReviews(track, state);
  const due = dueReviews(track, state).filter((d) => !resets.some((r) => r.skill === d.skill));
  return [...resets, ...due].slice(0, MAX_REVIEWS_PER_SESSION);
}

function lessonMain(concept: Concept, state: LearningState): TodaySession['main'] {
  const answered = new Set(state.skillCorrect[concept.skill] || []);
  const reps = concept.exercises.filter((e) => !answered.has(e.id));
  return { kind: 'lesson', concept, reps: reps.length ? reps : concept.exercises };
}

export function buildTodaySession(track: Track, state: LearningState): TodaySession {
  const reviews = mergedReviews(track, state);
  const cp = checkpointDue(track, state);
  if (cp) return { reviews, main: { kind: 'checkpoint', checkpoint: cp } };
  const frontier = frontierConcept(track, state);
  if (frontier) return { reviews, main: lessonMain(frontier, state) };
  const fallback = nextConcept(track, state);
  if (!fallback) return { reviews, main: { kind: 'graduated' } };
  return { reviews: reviews.filter((r) => r.skill !== fallback.skill), main: lessonMain(fallback, state) };
}
```

Then add `tileState` after `frontierOrder` (or anywhere among the exported helpers):

```ts
export type TileState = 'done' | 'now' | 'unlocked' | 'upcoming' | 'locked';

// The visual state of a concept tile on the lesson map.
export function tileState(track: Track, state: LearningState, concept: Concept): TileState {
  if (isSkillStrong(state, concept.skill)) return 'done';
  if (!conceptUnlocked(track, state, concept)) return 'locked';
  const front = frontierOrder(track, state);
  const ceiling = Math.max(front, state.maxUnlockedOrder);
  if (concept.order > ceiling) return 'upcoming';
  if (concept.order === front) return 'now';
  return 'unlocked';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/foundations.test.ts`
Expected: PASS. In particular the existing test "buildTodaySession puts reviews before the new concept" still passes (with `maxUnlockedOrder` 0, `frontierConcept` equals `nextConcept` and `mergedReviews` equals `dueReviews`).

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run typecheck`
Expected: no errors.
Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/foundations.ts client/src/lib/foundations.test.ts
git commit -m "feat: reset-aware guided session routing and tileState selector

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `ConceptPractice` route and `recordConceptProgress` wiring

**Files:**
- Modify: `client/src/lib/foundations.ts` (add `conceptPracticeTarget`)
- Create: `client/src/routes/foundations/ConceptPractice.tsx`
- Modify: `client/src/routes/foundations/FoundationsRep.tsx:4,39,45-57`
- Modify: `client/src/App.tsx:13-14,32`
- Test: `client/src/lib/foundations.test.ts`, `client/src/routes/foundations/ConceptPractice.test.tsx` (create)

**Interfaces:**
- Consumes: `frontierOrder`, `conceptUnlocked`, `recordConceptProgress` (Task 3/4), `FoundationsRep`, `TeachCard`, `useFoundations`.
- Produces: `conceptPracticeTarget(track, state, conceptId): Concept | null`; default-exported `ConceptPractice`.

- [ ] **Step 1: Write the failing pure test**

In `client/src/lib/foundations.test.ts`, add `conceptPracticeTarget` to the import, and add:

```ts
  it('conceptPracticeTarget returns the concept only when reachable and non-empty', () => {
    const s = loadFoundations();
    expect(conceptPracticeTarget(track, s, 'c1')!.id).toBe('c1'); // frontier, has exercises
    expect(conceptPracticeTarget(track, s, 'c2')).toBeNull();     // upcoming
    expect(conceptPracticeTarget(track, s, 'c5')).toBeNull();     // locked
    expect(conceptPracticeTarget(track, s, 'nope')).toBeNull();   // unknown id
    const emptyTrack = { ...track, concepts: [{ id: 'e1', order: 1, skill: 'x', title: 'E', exercises: [] }] } as Track;
    expect(conceptPracticeTarget(emptyTrack, loadFoundations(), 'e1')).toBeNull(); // no exercises
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/foundations.test.ts`
Expected: FAIL (`conceptPracticeTarget` not exported).

- [ ] **Step 3: Implement `conceptPracticeTarget`**

In `client/src/lib/foundations.ts`, add after `tileState`:

```ts
// The concept a focused-practice route may open, or null if the id is unknown, the concept is
// checkpoint-locked, beyond the reached frontier, or has no exercises. Drives the /learn/concept
// route guard.
export function conceptPracticeTarget(track: Track, state: LearningState, conceptId: string): Concept | null {
  const concept = track.concepts.find((c) => c.id === conceptId);
  if (!concept || !concept.exercises.length) return null;
  if (!conceptUnlocked(track, state, concept)) return null;
  const ceiling = Math.max(frontierOrder(track, state), state.maxUnlockedOrder);
  if (concept.order > ceiling) return null;
  return concept;
}
```

Run: `npm test -- src/lib/foundations.test.ts`
Expected: PASS.

- [ ] **Step 4: Wire `FoundationsRep` to record concept progress**

In `client/src/routes/foundations/FoundationsRep.tsx`, change the import on line 4 to add `recordConceptProgress`:

```ts
import { recordConceptProgress, recordAttempt, recordReviewPass, isSkillStrong } from '../../lib/foundations';
```

Change the destructure on line 40 to also pull `track`:

```ts
  const { track, state, update } = useFoundations();
```

Change the `onResult` handler (lines 47-55) so the correct-answer record goes through `recordConceptProgress` (falling back to a no-op-safe path if track is somehow absent):

```ts
    onResult: (correct: boolean) => {
      if (!correct) return;
      update((s: LearningState) => { if (track) recordConceptProgress(track, s, exercise); });
      // A passed review of an already-mastered skill advances its scaffold fade.
      if (kind === 'review' && exercise.skill && isSkillStrong(state, exercise.skill)) {
        update((s: LearningState) => recordReviewPass(s, exercise.skill as string));
      }
      onCorrect?.();
    },
```

Remove the now-unused `recordCorrect` symbol from the import if the linter flags it (it is no longer referenced in this file).

- [ ] **Step 5: Create the `ConceptPractice` route**

Create `client/src/routes/foundations/ConceptPractice.tsx`:

```tsx
import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState, Button } from '../../components/ui';
import { TeachCard } from './TeachCard';
import { FoundationsRep } from './FoundationsRep';
import { useFoundations } from '../../state/FoundationsContext';
import { conceptPracticeTarget, checkpointDue } from '../../lib/foundations';

export default function ConceptPractice() {
  const { conceptId } = useParams();
  const { track, state } = useFoundations();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading..." /></AppShell>;
  const concept = conceptPracticeTarget(track, state, conceptId || '');
  if (!concept) return <Navigate to="/learn" replace />;

  if (done) {
    const cpDue = checkpointDue(track, state);
    return (
      <AppShell breadcrumb={<span className="here">Learn / {concept.title}</span>}>
        <div className="fnd-done">
          <h1>Lesson practiced.</h1>
          <p style={{ color: 'var(--ink-dim)' }}>
            {cpDue ? 'A checkpoint is ready. Run your guided session to take it and bank your reviews.'
              : 'Run your guided session to keep your spaced reviews on track.'}
          </p>
          <Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button>
        </div>
      </AppShell>
    );
  }

  const reps = concept.exercises;
  const ex = reps[index];
  const isLast = index === reps.length - 1;
  return (
    <AppShell breadcrumb={<span className="here">Learn / {concept.title}</span>}>
      <FoundationsRep key={ex.id} exercise={ex} label={`Practice: ${concept.title}`} kind="new"
        tier="full" teach={index === 0 ? concept.teach : null}
        stepText={`Step ${index + 1} of ${reps.length} - focused practice`} />
      <div className="session-footer">
        <Button variant="primary" onClick={() => (isLast ? setDone(true) : setIndex((i) => i + 1))}>
          {isLast ? 'Done' : 'Next exercise'}
        </Button>
      </div>
    </AppShell>
  );
}
```

Note: `kind="new"` and `tier="full"` mean focused practice always shows the full scaffold and never advances the fade or the spacing clock; the correct-answer record runs through `recordConceptProgress` inside `FoundationsRep`.

- [ ] **Step 6: Register the route**

In `client/src/App.tsx`, add the import after line 13:

```ts
import ConceptPractice from './routes/foundations/ConceptPractice';
```

and add the route after line 32 (the checkpoint route):

```tsx
      <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
```

- [ ] **Step 7: Write the redirect test**

Create `client/src/routes/foundations/ConceptPractice.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../state/FoundationsContext', () => ({
  useFoundations: () => ({
    track: {
      concepts: [{ id: 'c1', order: 1, skill: 'a', title: 'A', exercises: [{ id: 'c1-r1' }] }],
      checkpoints: [], skills: [], phases: [], exercises: []
    },
    phases: [],
    state: { skillCorrect: {}, attempts: {}, lastSql: {}, lastPracticedSession: {}, checkpointsPassed: [], sessionCounter: 0, reviewsPassed: {}, maxUnlockedOrder: 0 },
    update: () => {}
  })
}));

import ConceptPractice from './ConceptPractice';

describe('ConceptPractice route guard', () => {
  it('redirects an unknown or locked concept id back to /learn', () => {
    render(
      <MemoryRouter initialEntries={['/learn/concept/nope']}>
        <Routes>
          <Route path="/learn/concept/:conceptId" element={<ConceptPractice />} />
          <Route path="/learn" element={<div>foundations home</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('foundations home')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -- src/routes/foundations/ConceptPractice.test.tsx src/lib/foundations.test.ts`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/lib/foundations.ts client/src/lib/foundations.test.ts client/src/routes/foundations/ConceptPractice.tsx client/src/routes/foundations/ConceptPractice.test.tsx client/src/routes/foundations/FoundationsRep.tsx client/src/App.tsx
git commit -m "feat: focused per-concept practice route with high-water-mark recording

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Clickable tile map (`ConceptTile`), reset, undo, and graduated free practice

**Files:**
- Create: `client/src/routes/foundations/ConceptTile.tsx`
- Modify: `client/src/routes/Foundations.tsx`
- Modify: `client/src/routes/foundations/foundations.css`
- Test: `client/src/routes/foundations/ConceptTile.test.tsx` (create)

**Interfaces:**
- Consumes: `TileState` (Task 4), `tileState`, `skillLevel`, `skillMastery`, `resetConcept`, `weakSpots`, `frontierConcept`, `useFoundations`.
- Produces: `ConceptTile` component with props `{ concept: Concept; state: TileState; count: number; masteryPct: number; onReset: (skill: string) => void }`.

- [ ] **Step 1: Write the failing tile tests**

Create `client/src/routes/foundations/ConceptTile.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConceptTile } from './ConceptTile';
import type { Concept } from '../../types';

const concept = { id: 'c1', order: 1, skill: 'select-all', title: 'SELECT basics', exercises: [] } as Concept;

function renderTile(props: Partial<React.ComponentProps<typeof ConceptTile>> = {}) {
  const onReset = vi.fn();
  render(
    <MemoryRouter>
      <ConceptTile concept={concept} state="now" count={0} masteryPct={0} onReset={onReset} {...props} />
    </MemoryRouter>
  );
  return { onReset };
}

describe('ConceptTile', () => {
  it('a now tile is a link labeled Start here with no reset control', () => {
    renderTile({ state: 'now', count: 0 });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/learn/concept/c1');
    expect(link).toHaveAccessibleName(/start here/i);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('a done tile is clickable and offers a reset that confirms before firing', () => {
    const { onReset } = renderTile({ state: 'done', count: 3 });
    expect(screen.getByRole('link')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reset lesson/i }));
    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));
    expect(onReset).toHaveBeenCalledWith('select-all');
  });

  it('an upcoming tile is not a link and shows a label', () => {
    renderTile({ state: 'upcoming', count: 0 });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/upcoming/i)).toBeInTheDocument();
  });

  it('a locked tile is not a link and shows a locked label', () => {
    renderTile({ state: 'locked', count: 0 });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/locked/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/routes/foundations/ConceptTile.test.tsx`
Expected: FAIL (`ConceptTile` does not exist).

- [ ] **Step 3: Create `ConceptTile`**

Create `client/src/routes/foundations/ConceptTile.tsx`:

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Concept } from '../../types';
import type { TileState } from '../../lib/foundations';

interface Props {
  concept: Concept;
  state: TileState;
  count: number;
  masteryPct: number;
  onReset: (skill: string) => void;
}

const STATIC_LABEL: Record<'upcoming' | 'locked', string> = {
  upcoming: 'upcoming',
  locked: 'locked'
};

export function ConceptTile({ concept, state, count, masteryPct, onReset }: Props) {
  const [confirming, setConfirming] = useState(false);
  const cls = ['lh-tile', state, state === 'done' && 'ok'].filter(Boolean).join(' ');
  const bar = <div className="lh-tile-bar"><i style={{ width: `${masteryPct}%` }} /></div>;

  if (state === 'upcoming' || state === 'locked') {
    return (
      <div className={cls} aria-label={`${concept.title}, ${state === 'locked' ? 'locked, unlocks as you progress' : 'upcoming'}`}>
        <div className="lh-tile-head">
          <span className="lh-tile-num">{concept.order}</span>
          <strong>{concept.title}</strong>
          <span className="lh-tile-tier">{STATIC_LABEL[state]}</span>
        </div>
        {bar}
      </div>
    );
  }

  const tier = state === 'done' ? 'strong' : count ? `${count}/3` : state === 'now' ? 'start here' : 'new';
  const name = state === 'now'
    ? `Start here: ${concept.title}, new lesson`
    : `Practice ${concept.title}${state === 'done' ? ', mastered' : count ? `, ${count} of 3 correct` : ''}`;

  return (
    <div className={cls}>
      <Link to={`/learn/concept/${concept.id}`} className="lh-tile-open" aria-label={name}>
        <div className="lh-tile-head">
          <span className="lh-tile-num">{state === 'done' ? '✓' : concept.order}</span>
          <strong>{concept.title}</strong>
          <span className="lh-tile-tier">{tier}</span>
          <span className="lh-tile-go" aria-hidden="true">Practice</span>
        </div>
        {bar}
      </Link>
      {count > 0 ? (
        confirming ? (
          <div className="lh-tile-reset-confirm" role="group" aria-label="Confirm reset">
            <span>Reset this lesson? Its full scaffold returns and it re-enters your reviews.</span>
            <button type="button" className="lh-reset-yes" onClick={() => { setConfirming(false); onReset(concept.skill); }}>Reset</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="lh-tile-reset" onClick={() => setConfirming(true)}>Reset lesson</button>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/routes/foundations/ConceptTile.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire `Foundations.tsx` to render tiles, reset, and graduated free practice**

In `client/src/routes/Foundations.tsx`:

Change the imports on lines 2-7 to add what we need (`useState` from react, `Link` is not needed since navigation uses `useNavigate`):

```ts
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { EmptyState, Button } from '../components/ui';
import { useFoundations } from '../state/FoundationsContext';
import { skillLevel, buildTodaySession, graduationStatus, skillMastery, weakSpots, frontierConcept, tileState, resetConcept } from '../lib/foundations';
import { currentPhase, phaseGraduation } from '../lib/learning-path';
import type { Concept, Checkpoint, Phase, LearningState } from '../types';
import { ConceptTile } from './foundations/ConceptTile';
import './foundations/foundations.css';
```

Inside the component, after `const { track, phases, state } = useFoundations();` add the update handle and toast state, and after the `if (!track)` guard add the reset handler:

```ts
  const { track, phases, state, update } = useFoundations();
  const navigate = useNavigate();
  const [undo, setUndo] = useState<{ skill: string; title: string; slice: { correct?: string[]; reviews?: number; last?: number } } | null>(null);
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path..." /></AppShell>;

  function handleReset(skill: string) {
    const concept = track!.concepts.find((c) => c.skill === skill);
    setUndo({
      skill,
      title: concept ? concept.title : skill,
      slice: { correct: state.skillCorrect[skill], reviews: state.reviewsPassed[skill], last: state.lastPracticedSession[skill] }
    });
    update((s: LearningState) => resetConcept(s, skill));
  }

  function undoReset() {
    if (!undo) return;
    const { skill, slice } = undo;
    update((s: LearningState) => {
      if (slice.correct !== undefined) s.skillCorrect = { ...s.skillCorrect, [skill]: slice.correct };
      if (slice.reviews !== undefined) s.reviewsPassed = { ...s.reviewsPassed, [skill]: slice.reviews };
      if (slice.last !== undefined) s.lastPracticedSession = { ...s.lastPracticedSession, [skill]: slice.last };
    });
    setUndo(null);
  }
```

Replace the active-phase tile grid (lines 71-98, the `<div className="lh-grid">` block that maps `active.concepts` and `active.checkpoints`) so concept tiles use `ConceptTile`:

```tsx
      <div className="lh-grid">
        {active.concepts.map((c: Concept) => (
          <ConceptTile key={c.id} concept={c} state={tileState(track, state, c)}
            count={skillLevel(state, c.skill).count} masteryPct={skillMastery(state, c.skill).pct}
            onReset={handleReset} />
        ))}
        {active.checkpoints.map((cp: Checkpoint) => {
          const passed = state.checkpointsPassed.includes(cp.id);
          return (
            <div key={cp.id} className={`lh-tile lh-tile-cp ${passed ? 'ok' : ''}`}>
              <div className="lh-tile-head">
                <span className="lh-tile-num">{passed ? '✓' : '★'}</span>
                <strong>{cp.title}</strong>
                <span className="lh-tile-tier">{passed ? 'passed' : 'checkpoint'}</span>
              </div>
            </div>
          );
        })}
      </div>
      {undo ? (
        <div className="lh-toast" role="status" aria-live="polite">
          <span>Reset {undo.title}. Its full scaffold is back.</span>
          <button type="button" onClick={undoReset}>Undo</button>
          <button type="button" onClick={() => setUndo(null)}>Dismiss</button>
        </div>
      ) : null}
```

Replace the hero graduated branch (lines 54-59) so a graduated learner gets a free-practice framing and weakest-3 shortcuts instead of a dead end:

```tsx
          {session.main.kind === 'graduated'
            ? <>
                <p className="lh-grad">You have completed every phase. Senior ready.</p>
                <div className="lh-freeprac">
                  <span>Free practice: pick any lesson below, or drill your weakest.</span>
                  <div className="lh-freeprac-links">
                    {weak.map((w) => {
                      const c = track.concepts.find((x) => x.skill === w.skill);
                      return c ? <Button key={w.skill} onClick={() => navigate(`/learn/concept/${c.id}`)}>{w.title}</Button> : null;
                    })}
                  </div>
                </div>
              </>
            : <>
                <div className="lh-today"><span>Today</span> {todayLabel}</div>
                <Button variant="primary" onClick={go}>{started ? "Continue today's session" : 'Start lesson 1'}</Button>
              </>}
```

(Note: the arrow that was on the "Continue" button label is removed to keep copy dash-free; the button already reads clearly.)

- [ ] **Step 6: Add the CSS**

In `client/src/routes/foundations/foundations.css`, after the `.lh-tile-cp` rule (line 114), add:

```css
.lh-tile-open { display: flex; flex-direction: column; gap: var(--s-3); text-decoration: none; color: inherit; border-radius: var(--r-md); }
.lh-tile-open:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.lh-tile:has(.lh-tile-open:hover) { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand-soft), var(--shadow-sm); }
.lh-tile:has(.lh-tile-open) { cursor: pointer; }
.lh-tile-go { flex: none; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--brand); }
.lh-tile.unlocked { border-style: solid; }
.lh-tile.upcoming { opacity: 0.6; }
.lh-tile.locked { opacity: 0.5; }
.lh-tile.locked .lh-tile-num, .lh-tile.upcoming .lh-tile-num { color: var(--ink-faint); }
.lh-tile-reset { align-self: flex-start; margin-top: var(--s-2); background: none; border: none; padding: 0; color: var(--ink-faint); font-size: var(--text-xs); font-family: var(--font-mono); cursor: pointer; }
.lh-tile-reset:hover { color: var(--ink-dim); text-decoration: underline; }
.lh-tile-reset-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); margin-top: var(--s-2); font-size: var(--text-xs); color: var(--ink-dim); }
.lh-tile-reset-confirm button { font-size: var(--text-xs); font-family: var(--font-mono); border: 1px solid var(--line-strong); background: var(--surface-2); border-radius: var(--r-md); padding: 2px 8px; cursor: pointer; color: var(--ink-strong); }
.lh-tile-reset-confirm .lh-reset-yes { border-color: var(--brand); color: var(--brand); }
.lh-toast { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); margin-top: var(--s-4); padding: var(--s-3) var(--s-4); background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow-sm); font-size: var(--text-md); }
.lh-toast button { font-family: var(--font-mono); font-size: var(--text-xs); border: 1px solid var(--line-strong); background: var(--surface-2); border-radius: var(--r-md); padding: 2px 10px; cursor: pointer; color: var(--ink-strong); }
.lh-freeprac { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-3); }
.lh-freeprac-links { display: flex; flex-wrap: wrap; gap: var(--s-2); }
```

- [ ] **Step 7: Run tests, typecheck, and build**

Run: `npm test -- src/routes/foundations/ConceptTile.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds (no unused-import or type errors).

- [ ] **Step 8: Commit**

```bash
git add client/src/routes/foundations/ConceptTile.tsx client/src/routes/foundations/ConceptTile.test.tsx client/src/routes/Foundations.tsx client/src/routes/foundations/foundations.css
git commit -m "feat: clickable concept tile map with per-lesson reset and graduated free practice

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Demote the global reset from the sidebar into the account menu

**Files:**
- Modify: `client/src/components/AppShell.tsx:6,98-103`
- Modify: `client/src/components/AccountMenu.tsx`
- Test: `client/src/components/AccountMenu.test.tsx` (create)

**Interfaces:**
- Consumes: `resetAllProgress` (existing, `lib/progress.ts`, unchanged).
- Produces: a "Reset everything" action in `AccountMenu`, rendered in both signed-in and signed-out states.

- [ ] **Step 1: Remove the sidebar reset button**

In `client/src/components/AppShell.tsx`, change the import on line 6 to drop `resetAllProgress`:

```ts
import { SIDEBAR_KEY, safeGet, safeSet } from '../lib/progress';
```

Remove the reset button block (lines 98-103), leaving the `sidebar-foot` as:

```tsx
        <div className="sidebar-foot">
          {total ? <ProgressMeter value={percent(done, total)} label="Course" /> : null}
          <AccountMenu />
        </div>
```

- [ ] **Step 2: Write the failing account-menu test**

Create `client/src/components/AccountMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../state/AuthContext', () => ({ useAuth: () => ({ user: null, status: 'anon', signOut: vi.fn() }) }));
vi.mock('./GoogleSignIn', () => ({ GoogleSignIn: () => <div>sign in</div> }));

import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  it('offers a Reset everything action even when signed out', () => {
    render(<AccountMenu />);
    expect(screen.getByRole('button', { name: /reset everything/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test -- src/components/AccountMenu.test.tsx`
Expected: FAIL (no "Reset everything" button yet).

- [ ] **Step 4: Add the demoted reset to `AccountMenu`**

Replace the body of `client/src/components/AccountMenu.tsx` with:

```tsx
import { useAuth } from '../state/AuthContext';
import { GoogleSignIn } from './GoogleSignIn';
import { resetAllProgress } from '../lib/progress';

function resetEverything() {
  if (window.confirm('Reset EVERYTHING on this device? This wipes your learning path, checkpoints, interview problem bank progress, and every lesson checkmark. It cannot be undone.')) {
    resetAllProgress();
    window.location.href = '/';
  }
}

export function AccountMenu() {
  const { user, status, signOut } = useAuth();
  if (status === 'loading') return null;
  return (
    <div className="sync-box">
      {!user ? (
        <>
          <span className="sync-label">Save progress across devices</span>
          <GoogleSignIn />
        </>
      ) : (
        <>
          <span className="sync-status">Signed in as {user.name || user.email}</span>
          <button type="button" className="sync-link" onClick={signOut}>Sign out</button>
        </>
      )}
      <button type="button" className="sync-link danger" onClick={resetEverything}>Reset everything</button>
    </div>
  );
}
```

- [ ] **Step 5: Run test and typecheck**

Run: `npm test -- src/components/AccountMenu.test.tsx`
Expected: PASS.
Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Full suite**

Run: `npm test`
Expected: PASS (all files).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/AppShell.tsx client/src/components/AccountMenu.tsx client/src/components/AccountMenu.test.tsx
git commit -m "feat: demote global reset from sidebar into the account menu

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Final verification and dash scan

**Files:** none (verification only)

- [ ] **Step 1: Full suite and typecheck**

Run: `npm test`
Expected: PASS (every file).
Run: `npm run typecheck`
Expected: no errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Dash and non-ASCII scan on all touched source files**

Run (from `sql-mastery/`):
```bash
grep -rnP '[\x{2013}\x{2014}\x{2212}]' client/src/lib/foundations.ts client/src/lib/learning-path.ts client/src/types.ts client/src/state/FoundationsContext.tsx client/src/routes/foundations/ConceptPractice.tsx client/src/routes/foundations/ConceptTile.tsx client/src/routes/Foundations.tsx client/src/routes/foundations/FoundationsRep.tsx client/src/components/AppShell.tsx client/src/components/AccountMenu.tsx client/src/routes/foundations/foundations.css client/src/App.tsx || echo "clean: no en/em/minus dashes"
```
Expected: `clean: no en/em/minus dashes`.

- [ ] **Step 3: Manual preview smoke check**

Start the client (`npm run dev` from `client/`, or the project preview server) and verify, on `/learn`:
1. Exactly one active-phase tile shows the "Start here" brand treatment for a fresh learner.
2. Clicking an unlocked tile opens `/learn/concept/:id` at full scaffold; finishing returns to `/learn`.
3. A started tile shows "Reset lesson"; confirming drops it to "new" and shows the undo toast; "Undo" restores it.
4. The sidebar no longer shows "Reset progress"; the account box shows "Reset everything".
5. Hand-type `/learn/concept/<a-locked-id>` and confirm it redirects to `/learn`.

- [ ] **Step 4: Commit any preview fixes, then stop for review before push**

Do not push. Report the branch state and let the user decide when to push to main (which triggers the Cloudflare Pages deploy). This feature needs no VPS restart.

---

## Self-Review

**Spec coverage:** Every spec section maps to a task. State model and migration: Task 1 and Task 2. Snapshot fix: Task 2. Engine helpers (`isConceptUnlocked`, `frontierConcept`, `frontierOrder`, `recordConceptProgress`, `resetConcept`, `tileState`): Task 3 and Task 4. `buildTodaySession` D1 routing: Task 4. `conceptPracticeTarget` and `ConceptPractice` route and `App.tsx`: Task 5. `FoundationsRep` recording: Task 5. `ConceptTile`, `Foundations.tsx` map, reset, undo, graduated free practice, CSS: Task 6. `AppShell` removal and `AccountMenu` demotion: Task 7. Dev-time duplicate-skill check: Task 2. Accessibility (real link/button elements, labels, aria-live toast): Tasks 6 and 7. Test plan: Tasks 1 through 7 each carry their tests; Task 8 runs the full sweep. The "phase row lock" item is intentionally not a task per the spec (reset is active-phase scoped, so no phase re-locks).

**Placeholder scan:** No TBD/TODO/"handle edge cases" placeholders; every code and test step shows complete code.

**Type consistency:** `maxUnlockedOrder: number` is used identically across `types.ts`, both loaders, `reconcileUnlock`, `recordConceptProgress`, `resetConcept`, `tileState`, and `conceptPracticeTarget`. `TileState` is defined in Task 4 and consumed by `ConceptTile` (Task 6). `recordConceptProgress(track, state, exercise)` is defined in Task 3 and called in `FoundationsRep` (Task 5). `resetConcept(state, skill)` is defined in Task 3 and called in `Foundations.tsx` (Task 6). `conceptPracticeTarget(track, state, conceptId)` is defined in Task 5 and consumed by `ConceptPractice` (Task 5).
