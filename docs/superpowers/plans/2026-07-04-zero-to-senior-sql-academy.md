# Zero To Senior SQL Academy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand SQL Mastery Path from a practice workbench into a 36-week beginner-to-senior SQL academy for senior data analyst and analytics engineer interview prep.

**Architecture:** Add a generated academy expansion module that emits structured lesson/exercise objects with teaching metadata. Update the curriculum scheduler to 144 sessions and render teaching metadata in the existing static SPA workbench.

**Tech Stack:** Node.js, Express, native `node:test`, static HTML/CSS/JS, PostgreSQL through `pg`.

## Global Constraints

- Track length is 36 weeks and 144 sessions.
- The path must start from absolute zero SQL knowledge.
- The path targets senior data analyst / analytics engineer interviews.
- Preserve existing SQL execution and grading APIs.
- Do not add a frontend framework.

---

### Task 1: Academy Depth Tests

**Files:**
- Modify: `test/curriculum-service.test.js`
- Modify: `test/ui-shell.test.js`

**Interfaces:**
- Consumes: `buildCurriculum({ rootDir })`
- Produces: tests proving 36 weeks, 144 sessions, 500+ exercises, 450+ checkable exercises, beginner teaching fields, and UI teaching hooks.

- [ ] Add failing curriculum tests for academy depth and beginner-to-senior metadata.
- [ ] Add failing UI shell tests for lesson teaching hooks.

### Task 2: Academy Curriculum Expansion

**Files:**
- Create: `src/academy-expansion.js`
- Modify: `src/curriculum-service.js`

**Interfaces:**
- Produces: `getAcademyExpansionExercises() -> Exercise[]`
- Produces: exercises with `concept`, `whyItMatters`, `mentalModel`, `workedExample`, `steps`, `commonMistakes`, `interviewAngle`.

- [ ] Implement generated beginner, intermediate, analytics engineering, and senior interview exercises.
- [ ] Integrate expansion into `buildCurriculum`.
- [ ] Update session counts and week themes to 36 weeks / 144 sessions.

### Task 3: Teaching Workbench UI

**Files:**
- Modify: `app.js`
- Modify: `app.css`

**Interfaces:**
- Consumes: lesson metadata on each exercise.
- Produces: workbench teaching panels before the SQL editor.

- [ ] Render lesson brief fields when available.
- [ ] Style teaching panels without crowding the SQL editor.
- [ ] Preserve run/check flow.

### Task 4: Verification

**Files:**
- No new source files.

- [ ] Run `node --test`.
- [ ] Restart `node server.js`.
- [ ] Verify `/api/curriculum` reports 36 weeks and 144 sessions.
- [ ] Verify `#session=w01-s01` loads.
- [ ] Verify a beginner schema exercise grades correctly.
- [ ] Verify dashboard and session render in the browser with no console errors.
