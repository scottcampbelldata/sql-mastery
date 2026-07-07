# Learning-loop efficiency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sharpen the practice loop with three additive changes: spaced reviews test recall (blank editor), wrong answers show a structured diff, and reviews plus a mastery meter target the learner's weakest skills.

**Architecture:** Lever 2 enriches the server grader (`mismatchFeedback`) with a `diff` object carried through `checkQuery` and rendered client-side by a new `DiffPanel` everywhere a check runs. Levers 1 and 3 are Foundations-track client changes: `useSqlCheck` gains a `cold` seed, and `foundations.ts` gains `skillMastery`/`weakSpots` plus weakness-ordered `dueReviews`, surfaced on the Foundations page.

**Tech Stack:** TypeScript, Express (compiled to dist/), React + Vite, `node --test` (server), `vitest` (client).

## Global Constraints

- No en dashes or em dashes anywhere (ASCII hyphen only).
- Server is CommonJS-emitting TypeScript run as `node dist/server.js`; write ES module import/export, extensionless relative specifiers.
- Client is strict TypeScript + Vite; extensionless relative imports.
- The `diff` NEVER includes expected row data: only column names, row counts, an order-only flag, and extra/missing row counts.
- Do not change `isSkillStrong`, the pass threshold, or the "N of M skills strong" graduation ring; mastery decay is display/ordering only.
- New concepts still unlock strictly in order (checkpoint-gated); only review selection is weakness-weighted.

---

## File Structure

- `src/query-service.ts` (modify): `mismatchFeedback` returns `{reason, hint, diff}`; `checkQuery` includes `diff`; export `mismatchFeedback` for testing. (Task 1)
- `test/query-service.test.ts` (modify): unit tests for the four diff shapes. (Task 1)
- `client/src/types.ts` (modify): `SqlDiff` interface; `diff?` on `CheckResponse` and `Feedback`. (Task 2)
- `client/src/lib/useSqlCheck.ts` (modify): carry `body.diff` into feedback; add `cold` seed. (Tasks 2, 4)
- `client/src/components/DiffPanel.tsx` (create) + `client/src/components/components.css` (modify): the diff readout. (Task 3)
- `client/src/routes/session/Workbench.tsx`, `client/src/routes/foundations/FoundationsRep.tsx`, `client/src/components/DrillModal.tsx` (modify): render `DiffPanel`. (Task 3)
- `client/src/routes/foundations/FoundationsRep.tsx` (modify): cold reviews. (Task 4)
- `client/src/lib/foundations.ts` (modify): `skillMastery`, `weakSpots`, weakness-ordered `dueReviews`. (Task 5)
- `client/src/lib/foundations.test.ts` (modify): mastery + ordering tests. (Task 5)
- `client/src/routes/Foundations.tsx` (modify): mastery bars, weak-spots line, cadence nudge. (Task 6)

---

## Task 1: Grader diff (server)

**Files:**
- Modify: `src/query-service.ts` (the `mismatchFeedback` function ~169-192, the `checkQuery` mismatch return ~437-447, and the module exports)
- Test: `test/query-service.test.ts`

**Interfaces:**
- Produces: `mismatchFeedback(userResult, expectedResult)` now returns `null` or `{ reason, hint, diff }` where `diff` is `{ reason: 'columns'|'row-count'|'row-values', yourColumns?: string[], expectedColumns?: string[], yourRowCount: number, expectedRowCount: number, orderOnly: boolean, extraRows: number, missingRows: number }`. `checkQuery`'s mismatch response gains `diff`.

- [ ] **Step 1: Write the failing tests**

Add to `test/query-service.test.ts` (near the other tests; `mismatchFeedback` is a pure function, no DB needed):
```ts
import { mismatchFeedback } from '../src/query-service';

const R = (columns: string[], rows: Record<string, unknown>[]) => ({ columns, rows });

test('diff: column mismatch reports both column lists', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }]), R(['a', 'b'], [{ a: 1, b: 2 }]));
  assert.equal(m.diff.reason, 'columns');
  assert.deepEqual(m.diff.yourColumns, ['a']);
  assert.deepEqual(m.diff.expectedColumns, ['a', 'b']);
});

test('diff: row-count difference counts extra and missing', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }, { a: 2 }, { a: 3 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-count');
  assert.equal(m.diff.yourRowCount, 3);
  assert.equal(m.diff.expectedRowCount, 2);
  assert.equal(m.diff.extraRows, 1);
  assert.equal(m.diff.missingRows, 0);
});

test('diff: order-only when the same rows are reordered', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 2 }, { a: 1 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-values');
  assert.equal(m.diff.orderOnly, true);
  assert.equal(m.diff.extraRows, 0);
  assert.equal(m.diff.missingRows, 0);
});

test('diff: value difference counts extra and missing', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }, { a: 9 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-values');
  assert.equal(m.diff.orderOnly, false);
  assert.equal(m.diff.extraRows, 1);
  assert.equal(m.diff.missingRows, 1);
});

test('mismatchFeedback returns null for a matching result', () => {
  assert.equal(mismatchFeedback(R(['a'], [{ a: 1 }]), R(['a'], [{ a: 1 }])), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsc -p tsconfig.json && node --test dist/test/query-service.test.js`
Expected: FAIL - `mismatchFeedback` is not exported (import error), and the diff assertions do not pass.

- [ ] **Step 3: Add the multiset helpers and rewrite mismatchFeedback**

In `src/query-service.ts`, add these helpers just above `mismatchFeedback`:
```ts
function rowMultiset(rows: (string | null)[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = JSON.stringify(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function multisetDiff(userRows: (string | null)[][], expectedRows: (string | null)[][]): { extra: number; missing: number } {
  const inUser = rowMultiset(userRows);
  const inExpected = rowMultiset(expectedRows);
  let extra = 0;
  let missing = 0;
  for (const [key, n] of inUser) extra += Math.max(0, n - (inExpected.get(key) || 0));
  for (const [key, n] of inExpected) missing += Math.max(0, n - (inUser.get(key) || 0));
  return { extra, missing };
}
```
Replace the whole `mismatchFeedback` function with:
```ts
function mismatchFeedback(userResult: any, expectedResult: any): any {
  const yourRowCount = userResult.rows.length;
  const expectedRowCount = expectedResult.rows.length;

  if (!arraysMatch(userResult.columns, expectedResult.columns)) {
    return {
      reason: 'columns',
      hint: 'Your query ran, but the output columns do not match. Check the SELECT list, aliases, and column order.',
      diff: {
        reason: 'columns',
        yourColumns: userResult.columns,
        expectedColumns: expectedResult.columns,
        yourRowCount, expectedRowCount, orderOnly: false, extraRows: 0, missingRows: 0
      }
    };
  }

  const userRows = normalizeRows(userResult);
  const expectedRows = normalizeRows(expectedResult);
  const { extra, missing } = multisetDiff(userRows, expectedRows);

  if (yourRowCount !== expectedRowCount) {
    return {
      reason: 'row-count',
      hint: 'Your query ran, but it returned a different number of rows. Check filters, joins, grouping, and LIMIT.',
      diff: { reason: 'row-count', yourRowCount, expectedRowCount, orderOnly: false, extraRows: extra, missingRows: missing }
    };
  }

  if (!arraysMatch(userRows, expectedRows)) {
    return {
      reason: 'row-values',
      hint: 'Your query returned the right shape, but the values or row order differ. Check expressions, NULL handling, and ORDER BY.',
      diff: { reason: 'row-values', yourRowCount, expectedRowCount, orderOnly: extra === 0 && missing === 0, extraRows: extra, missingRows: missing }
    };
  }

  return null;
}
```

- [ ] **Step 4: Include diff in the checkQuery response and export mismatchFeedback**

In `checkQuery`, in the `if (mismatch) { return {...} }` block, add `diff: mismatch.diff,` (right after the `hint: mismatch.hint,` line).

At the bottom of the file, add `mismatchFeedback` to the exports. If the file ends with `export { createQueryService, QueryServiceError };`, change it to `export { createQueryService, QueryServiceError, mismatchFeedback };` (keep whatever names are already there and append `mismatchFeedback`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsc -p tsconfig.json && node --test dist/test/query-service.test.js`
Expected: PASS - the 5 new tests plus the existing ones.

- [ ] **Step 6: Commit**

```bash
git add src/query-service.ts test/query-service.test.ts
git commit -m "feat: grader returns a structured result diff (shape/counts/order)"
```

---

## Task 2: Client diff type and hook plumbing

**Files:**
- Modify: `client/src/types.ts` (add `SqlDiff`; `diff?` on `CheckResponse` and `Feedback`)
- Modify: `client/src/lib/useSqlCheck.ts` (carry `body.diff` into feedback on a mismatch)
- Test: `client/src/routes/foundations/foundations-ui.test.tsx`

**Interfaces:**
- Consumes: the server `diff` shape from Task 1.
- Produces: `SqlDiff` type; `Feedback.diff?: SqlDiff | null`; `useSqlCheck` feedback carries `diff` on a mismatch.

- [ ] **Step 1: Write the failing test**

Add to `client/src/routes/foundations/foundations-ui.test.tsx` (it already imports `useSqlCheck`, `renderHook`, `act`; add `vi` and `apiModule` imports if absent: `import { vi } from 'vitest';` and `import * as apiModule from '../../lib/api';`):
```tsx
it('carries the server diff into feedback on a mismatch', async () => {
  const ex = { id: 'd1', database: 'chinook', task: 't', starterSql: '', expectedSql: 'SELECT 1' };
  vi.spyOn(apiModule.api, 'check').mockResolvedValue({
    correct: false, feedbackType: 'mismatch', hint: 'h',
    diff: { reason: 'row-count', yourRowCount: 3, expectedRowCount: 2, orderOnly: false, extraRows: 1, missingRows: 0 }
  });
  const { result } = renderHook(() => useSqlCheck(ex));
  act(() => result.current.setSql('SELECT 1'));
  await act(async () => { await result.current.runCheck(); });
  expect(result.current.feedback!.diff!.reason).toBe('row-count');
  expect(result.current.feedback!.diff!.extraRows).toBe(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- foundations-ui`
Expected: FAIL - `feedback.diff` is undefined (hook does not carry it).

- [ ] **Step 3: Add the SqlDiff type**

In `client/src/types.ts`, add:
```ts
export interface SqlDiff {
  reason: 'columns' | 'row-count' | 'row-values';
  yourColumns?: string[];
  expectedColumns?: string[];
  yourRowCount: number;
  expectedRowCount: number;
  orderOnly: boolean;
  extraRows: number;
  missingRows: number;
}
```
Add `diff?: SqlDiff;` to `CheckResponse` (after `result?`). Add `diff?: SqlDiff | null;` to `Feedback` (after `message`).

- [ ] **Step 4: Carry diff into feedback**

In `client/src/lib/useSqlCheck.ts`, import the type: change the type import to include `SqlDiff` (add it to the existing `import type { ... } from '../types';`). In the mismatch branch (the `else` where feedback is set with title "Not quite yet"), add `diff: body.diff || null` as a field on the `setFeedback({...})` object. Leave the correct branch as-is (no diff).

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix client test -- foundations-ui` then `npm --prefix client run typecheck`
Expected: PASS; typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/types.ts client/src/lib/useSqlCheck.ts client/src/routes/foundations/foundations-ui.test.tsx
git commit -m "feat: carry the result diff through the check hook"
```

---

## Task 3: DiffPanel and render it everywhere a check runs

**Files:**
- Create: `client/src/components/DiffPanel.tsx`
- Modify: `client/src/components/components.css` (add `.diff-panel` styles)
- Modify: `client/src/routes/session/Workbench.tsx`, `client/src/routes/foundations/FoundationsRep.tsx`, `client/src/components/DrillModal.tsx`
- Test: `client/src/components/DiffPanel.test.tsx`

**Interfaces:**
- Consumes: `SqlDiff` (Task 2), `Feedback.diff`.
- Produces: `DiffPanel({ diff }: { diff: SqlDiff })`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/DiffPanel.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffPanel } from './DiffPanel';

describe('DiffPanel', () => {
  it('shows both column lists on a column mismatch', () => {
    render(<DiffPanel diff={{ reason: 'columns', yourColumns: ['a'], expectedColumns: ['a', 'revenue'], yourRowCount: 5, expectedRowCount: 5, orderOnly: false, extraRows: 0, missingRows: 0 }} />);
    expect(screen.getByText(/output columns differ/i)).toBeInTheDocument();
    expect(screen.getByText(/revenue/)).toBeInTheDocument();
  });
  it('shows the row-count delta with extra and missing', () => {
    render(<DiffPanel diff={{ reason: 'row-count', yourRowCount: 12, expectedRowCount: 10, orderOnly: false, extraRows: 3, missingRows: 1 }} />);
    expect(screen.getByText(/12 rows, expected 10/i)).toBeInTheDocument();
    expect(screen.getByText(/3 extra/i)).toBeInTheDocument();
  });
  it('calls out an order-only difference', () => {
    render(<DiffPanel diff={{ reason: 'row-values', yourRowCount: 5, expectedRowCount: 5, orderOnly: true, extraRows: 0, missingRows: 0 }} />);
    expect(screen.getByText(/right rows, wrong order/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- DiffPanel`
Expected: FAIL - cannot find `./DiffPanel`.

- [ ] **Step 3: Implement DiffPanel**

Create `client/src/components/DiffPanel.tsx`:
```tsx
import type { SqlDiff } from '../types';

const plural = (n: number): string => (n === 1 ? '' : 's');
const cols = (list?: string[]): string => `[${(list || []).join(', ')}]`;

function detail(diff: SqlDiff): string {
  const parts: string[] = [];
  if (diff.extraRows) parts.push(`${diff.extraRows} extra`);
  if (diff.missingRows) parts.push(`${diff.missingRows} missing`);
  return parts.length ? `${parts.join(', ')} row${plural(diff.extraRows + diff.missingRows)}.` : '';
}

function lines(diff: SqlDiff): string[] {
  if (diff.reason === 'columns') {
    return [`Output columns differ.`, `Yours: ${cols(diff.yourColumns)}`, `Expected: ${cols(diff.expectedColumns)}`];
  }
  const count = `You returned ${diff.yourRowCount} row${plural(diff.yourRowCount)}, expected ${diff.expectedRowCount}.`;
  if (diff.reason === 'row-count') {
    const d = detail(diff);
    return d ? [count, d] : [count];
  }
  if (diff.orderOnly) return ['Right rows, wrong order. Add or fix your ORDER BY.'];
  const d = detail(diff);
  return d ? ['Same shape, but some rows differ.', d] : ['Same shape, but some values differ.'];
}

export function DiffPanel({ diff }: { diff: SqlDiff }) {
  return (
    <div className="diff-panel" role="note">
      <span className="diff-panel-label">How your result differs</span>
      <ul className="diff-panel-list">
        {lines(diff).map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Add DiffPanel styles**

Append to `client/src/components/components.css`:
```css
.diff-panel { margin-top: var(--s-2); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); padding: var(--s-3) var(--s-4); }
.diff-panel-label { display: block; font-size: var(--text-xs); color: var(--ink-dim); margin-bottom: var(--s-1); }
.diff-panel-list { margin: 0; padding-left: var(--s-4); font-size: var(--text-sm); color: var(--ink); font-family: var(--font-mono); }
.diff-panel-list li { margin: 2px 0; }
```

- [ ] **Step 5: Render DiffPanel in the three surfaces**

In `client/src/routes/foundations/FoundationsRep.tsx`: add `import { DiffPanel } from '../../components/DiffPanel';`. Right after the block that renders `check.feedback` in a `Callout`, add:
```tsx
{check.feedback?.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
```

In `client/src/components/DrillModal.tsx`: add `import { DiffPanel } from './DiffPanel';`. Right after the `Callout` that renders `check.feedback`, add:
```tsx
{check.feedback?.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
```

In `client/src/routes/session/Workbench.tsx`: add `import { DiffPanel } from '../../components/DiffPanel';`. In the mismatch branch of `runCheck` (the `else` that calls `setFeedback` with title "Close, but not correct yet"), add `diff: body.diff || null` to that `setFeedback({...})` object. Then, right after the `<Callout>` that renders `feedback.message` (inside the `role="status"` block), add:
```tsx
{feedback?.diff ? <DiffPanel diff={feedback.diff} /> : null}
```

- [ ] **Step 6: Verify and commit**

Run: `npm --prefix client test -- DiffPanel && npm --prefix client run typecheck && npm --prefix client test`
Expected: DiffPanel tests pass, typecheck 0 errors, full suite green.
```bash
git add client/src/components/DiffPanel.tsx client/src/components/DiffPanel.test.tsx client/src/components/components.css client/src/routes/session/Workbench.tsx client/src/routes/foundations/FoundationsRep.tsx client/src/components/DrillModal.tsx
git commit -m "feat: render the result diff under a wrong answer"
```

---

## Task 4: Cold-recall reviews

**Files:**
- Modify: `client/src/lib/useSqlCheck.ts` (add a `cold` seed option)
- Modify: `client/src/routes/foundations/FoundationsRep.tsx` (pass `cold` for reviews, placeholder)
- Test: `client/src/routes/foundations/foundations-ui.test.tsx`

**Interfaces:**
- Produces: `useSqlCheck(exercise, { onResult?, onAttempt?, cold? })`; `cold: true` seeds an empty editor.

- [ ] **Step 1: Write the failing test**

Add to `client/src/routes/foundations/foundations-ui.test.tsx`:
```tsx
it('seeds an empty editor for a cold review', () => {
  const ex = { id: 'c1-r1', database: 'chinook', task: 't', starterSql: 'SELECT ____ FROM genre;', expectedSql: 'SELECT * FROM genre;' };
  const { result } = renderHook(() => useSqlCheck(ex, { cold: true }));
  expect(result.current.sql).toBe('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- foundations-ui`
Expected: FAIL - the hook ignores `cold` and seeds the scaffold, so `sql` is the formatted starter, not `''`.

- [ ] **Step 3: Add the cold option to useSqlCheck**

In `client/src/lib/useSqlCheck.ts`:
- Add `cold?: boolean;` to `UseSqlCheckOptions`.
- Destructure it: `export function useSqlCheck(exercise, { onResult, onAttempt, cold }: UseSqlCheckOptions = {})`.
- Change the initial state to `useState<string>(() => (cold ? '' : starterSqlForExercise(exercise)))`.
- Change the reset effect body's first line to `setSql(cold ? '' : starterSqlForExercise(exercise));` and add `cold` to the effect dependency array (so `[exercise.id, exercise.starterSql, exercise.expectedSql, cold]`).

- [ ] **Step 4: Use cold for reviews in FoundationsRep**

In `client/src/routes/foundations/FoundationsRep.tsx`:
- Change the `useSqlCheck(exercise, {...})` call to pass `cold: kind === 'review'` alongside the existing `onAttempt`/`onResult`.
- Change the editor placeholder so reviews prompt a cold write. Replace the `placeholder={editorPlaceholder(exercise)}` prop on `SqlEditor` with:
```tsx
placeholder={kind === 'review' ? 'Write the full query from scratch.' : editorPlaceholder(exercise)}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix client test -- foundations-ui && npm --prefix client run typecheck`
Expected: PASS; typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/useSqlCheck.ts client/src/routes/foundations/FoundationsRep.tsx client/src/routes/foundations/foundations-ui.test.tsx
git commit -m "feat: spaced reviews render a blank editor (cold recall)"
```

---

## Task 5: Mastery meter and weakness-weighted reviews (engine)

**Files:**
- Modify: `client/src/lib/foundations.ts` (add `skillMastery`, `weakSpots`; reorder `dueReviews`)
- Test: `client/src/lib/foundations.test.ts`

**Interfaces:**
- Produces:
  - `skillMastery(state, skill): { count: number; tier: string; pct: number; sessionsSince: number }`
  - `weakSpots(track, state, n?): { skill: string; title: string; pct: number }[]`
  - `dueReviews(track, state)` unchanged signature, now returns the weakest due skills first.

- [ ] **Step 1: Write the failing tests**

Add to `client/src/lib/foundations.test.ts` (it already imports from `./foundations`; add `skillMastery` and `weakSpots` to that import):
```ts
it('skillMastery reaches 100 at the strong threshold and decays with time', () => {
  const s = loadFoundations();
  s.skillCorrect = { where: ['a', 'b', 'c'] };            // count 3 = strong
  s.lastPracticedSession = { where: 0 };
  s.sessionCounter = 0;
  expect(skillMastery(s, 'where').pct).toBe(100);         // fresh
  s.sessionCounter = 8;                                    // long unpracticed
  expect(skillMastery(s, 'where').pct).toBeLessThan(100);  // rusty
  expect(skillMastery(s, 'never-touched').pct).toBe(0);
});

it('weakSpots lists the lowest-mastery learned skills first', () => {
  const track = { skills: [], checkpoints: [], concepts: [
    { id: 'c1', order: 1, skill: 'where', title: 'Where', exercises: [] },
    { id: 'c2', order: 2, skill: 'group', title: 'Group', exercises: [] }
  ] } as any;
  const s = loadFoundations();
  s.skillCorrect = { where: ['a', 'b', 'c'], group: ['x'] };  // where strong, group weak
  s.lastPracticedSession = { where: 0, group: 0 };
  const weak = weakSpots(track, s, 2);
  expect(weak[0].skill).toBe('group');
});

it('dueReviews returns the weakest due skill first', () => {
  const track = { checkpoints: [], skills: [{ skill: 'where' }, { skill: 'group' }], concepts: [
    { id: 'c1', order: 1, skill: 'where', title: 'Where', exercises: [{ id: 'w1', skill: 'where' }, { id: 'w2', skill: 'where' }] },
    { id: 'c2', order: 2, skill: 'group', title: 'Group', exercises: [{ id: 'g1', skill: 'group' }, { id: 'g2', skill: 'group' }] }
  ] } as any;
  const s = loadFoundations();
  s.skillCorrect = { where: ['w1', 'w2', 'w3'], group: ['g1'] };  // where count 3, group count 1
  s.lastPracticedSession = { where: 0, group: 0 };
  s.sessionCounter = 3;                                            // both due (gap satisfied)
  const due = dueReviews(track, s);
  expect(due[0].skill).toBe('group');
});
```
(If `dueReviews` is not already imported in this test file, add it to the import.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix client test -- foundations.test`
Expected: FAIL - `skillMastery`/`weakSpots` not exported; `dueReviews` returns track order (`where` first), not weakest-first.

- [ ] **Step 3: Add skillMastery and weakSpots**

In `client/src/lib/foundations.ts`, add after `isSkillStrong`:
```ts
export interface SkillMastery { count: number; tier: string; pct: number; sessionsSince: number; }

// Visual mastery: progress toward "strong", dimmed by how long since you practiced.
// Purely for display and review ordering; it never changes count, isSkillStrong, or graduation.
export function skillMastery(state: LearningState, skill: string): SkillMastery {
  const { count, tier } = skillLevel(state, skill);
  const last = state.lastPracticedSession[skill];
  const sessionsSince = last === undefined ? 0 : Math.max(0, state.sessionCounter - last);
  const base = Math.min(1, count / STRONG_THRESHOLD);
  const decay = Math.max(0.5, 1 - 0.15 * Math.max(0, sessionsSince - SPACING_GAP));
  return { count, tier, pct: Math.round(base * decay * 100), sessionsSince };
}

// The lowest-mastery skills you have started (count > 0), weakest first.
export function weakSpots(track: Track, state: LearningState, n = 3): { skill: string; title: string; pct: number }[] {
  return track.concepts
    .filter((c) => (state.skillCorrect[c.skill] || []).length > 0)
    .map((c) => ({ skill: c.skill, title: c.title, pct: skillMastery(state, c.skill).pct }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, n);
}
```

- [ ] **Step 4: Reorder dueReviews weakest-first**

In `client/src/lib/foundations.ts`, replace the whole `dueReviews` function with:
```ts
export function dueReviews(track: Track, state: LearningState): DueReview[] {
  const due: { skill: string; concept: Concept; count: number; last: number }[] = [];
  for (const s of track.skills) {
    if (!isLearned(state, s.skill)) continue;
    const last = state.lastPracticedSession[s.skill];
    if (last === undefined) continue;
    if (state.sessionCounter - last < SPACING_GAP) continue;
    const concept = track.concepts.find((c) => c.skill === s.skill);
    if (!concept) continue;
    due.push({ skill: s.skill, concept, count: (state.skillCorrect[s.skill] || []).length, last });
  }
  // Weakest first: fewest correct, then longest since practiced.
  due.sort((a, b) => (a.count - b.count) || (a.last - b.last));
  const out: DueReview[] = [];
  due.slice(0, MAX_REVIEWS_PER_SESSION).forEach((d, i) => {
    const answered = new Set(state.skillCorrect[d.skill] || []);
    const unseen = d.concept.exercises.find((e) => !answered.has(e.id));
    const exercise = unseen || d.concept.exercises[(state.sessionCounter + i) % d.concept.exercises.length];
    out.push({ skill: d.skill, concept: d.concept, exercise });
  });
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm --prefix client test -- foundations.test && npm --prefix client run typecheck`
Expected: PASS (new tests plus the existing `dueReviews` test, which uses a single due skill and is unaffected by ordering); typecheck 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/foundations.ts client/src/lib/foundations.test.ts
git commit -m "feat: skillMastery, weakSpots, and weakness-weighted reviews"
```

---

## Task 6: Foundations page mastery bars and weak spots

**Files:**
- Modify: `client/src/routes/Foundations.tsx`

**Interfaces:**
- Consumes: `skillMastery`, `weakSpots` (Task 5).

- [ ] **Step 1: Use skillMastery for the concept tiles**

In `client/src/routes/Foundations.tsx`:
- Change the import from `../lib/foundations` to add `skillMastery, weakSpots` (keep `skillLevel, buildTodaySession, graduationStatus`).
- In the `active.concepts.map(...)` block, compute `const m = skillMastery(state, c.skill);` alongside the existing `const lvl = skillLevel(state, c.skill);`. Change the tile bar width from `Math.min(100, (lvl.count / 3) * 100)` to `m.pct`, so the line reads:
```tsx
<div className="lh-tile-bar"><i style={{ width: `${m.pct}%` }} /></div>
```
(Leave the `lvl.tier`/`lvl.count` header text as-is - it stays count-based, matching the "strong" gate.)

- [ ] **Step 2: Add the weak-spots line and cadence nudge**

In `client/src/routes/Foundations.tsx`, compute after `const session = ...`:
```tsx
const weak = weakSpots(track, state, 3);
```
Add this just below the closing `</div>` of `.lh-grid` (after the concepts/checkpoints grid, before `All phases`):
```tsx
{weak.length ? (
  <p className="lh-weakspots">Weak spots to review: {weak.map((w) => w.title).join(', ')}. A short session a day beats a long one a week.</p>
) : (
  <p className="lh-weakspots">A short session a day beats a long one a week.</p>
)}
```

- [ ] **Step 3: Add the weak-spots style**

Append to `client/src/routes/foundations/foundations.css`:
```css
.lh-weakspots { color: var(--ink-dim); font-size: var(--text-sm); margin: var(--s-3) 0 0; }
```

- [ ] **Step 4: Verify and commit**

Run: `npm --prefix client run typecheck && npm --prefix client test && npm --prefix client run build`
Expected: typecheck 0 errors, full suite green, build succeeds.
```bash
git add client/src/routes/Foundations.tsx client/src/routes/foundations/foundations.css
git commit -m "feat: mastery bars and weak-spots on the Foundations page"
```

---

## Self-Review

**Spec coverage:**
- Lever 1 cold reviews: Task 4. Covered.
- Lever 2 diff (server + client + render everywhere): Tasks 1, 2, 3. Covered (Workbench, FoundationsRep, DrillModal).
- Diff never includes expected rows: Task 1 diff shape carries only columns/counts/order. Covered.
- Lever 3 weakness-weighted reviews + mastery meter + weak spots + cadence: Tasks 5, 6. Covered.
- `isSkillStrong`/graduation unchanged: `skillMastery` is separate; `skillLevel` still drives tier text and the ring reads `graduationStatus`. Covered.

**Placeholder scan:** every code step shows the code; no TBD/"handle errors" placeholders. Passed.

**Type consistency:** `SqlDiff` fields (`reason`, `yourColumns`, `expectedColumns`, `yourRowCount`, `expectedRowCount`, `orderOnly`, `extraRows`, `missingRows`) are identical in the server `diff` (Task 1), the `SqlDiff` type (Task 2), and `DiffPanel` (Task 3). `skillMastery`/`weakSpots`/`dueReviews` signatures match between Task 5 and Task 6. `useSqlCheck`'s `cold` option matches between Task 4's definition and use.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-learning-loop-efficiency.md`.
