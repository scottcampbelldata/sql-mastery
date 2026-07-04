# Commercial SQL Mastery App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the local SQL workbook into a polished 16-week guided SQL mastery product with a dashboard, session pacing, graded SQL workbench, and persistent progress.

**Architecture:** Keep the existing Node/PostgreSQL backend and add a curriculum service that parses the existing lesson HTML into structured exercises. Replace the home page with a single-page product app that consumes `/api/curriculum` and `/api/check`, while leaving old module pages available as reference material.

**Tech Stack:** Node.js, Express, native `node:test`, static HTML/CSS/JS, PostgreSQL through `pg`.

## Global Constraints

- The app must feel like a commercial learning product, not a static lesson page.
- The full path must take weeks, not hours: exactly 16 weeks and 64 scheduled sessions.
- Existing SQL exercises should be reused as the first curriculum source.
- The guided workbench must run user SQL against local PostgreSQL and compare it to the expected result query.
- Progress must persist locally in the browser.
- No new frontend framework unless the current static app cannot support the product.

---

### Task 1: Curriculum Engine

**Files:**
- Create: `src/curriculum-service.js`
- Create: `test/curriculum-service.test.js`
- Modify: `src/app.js`

**Interfaces:**
- Produces: `buildCurriculum({ rootDir }) -> { weeks, sessions, exercises, stats }`
- Produces: `GET /api/curriculum`

- [x] Write tests for parsing 100+ exercises, extracting P1.1, and producing 16 weeks / 64 sessions.
- [x] Run focused tests and verify they fail because the service and endpoint do not exist.
- [ ] Implement parser and scheduler.
- [ ] Add `/api/curriculum`.
- [ ] Run focused tests and verify they pass.

### Task 2: Product App Shell

**Files:**
- Replace: `index.html`
- Create: `app.js`
- Create: `app.css`

**Interfaces:**
- Consumes: `GET /api/curriculum`
- Consumes: `POST /api/check`
- Produces: dashboard, 16-week path, session workspace, SQL editor, feedback, result table, local progress.

- [ ] Build dashboard view with current session, progress stats, and week map.
- [ ] Build session view with focused exercise workbench and session exercise rail.
- [ ] Persist completed exercises, attempts, last SQL, and active session in localStorage.
- [ ] Render feedback from `/api/check` as success, mismatch, or error coaching.

### Task 3: Verification

**Files:**
- No new files.

- [ ] Run `npm test`.
- [ ] Restart the local app.
- [ ] Verify `/api/curriculum` returns 16 weeks and 64 sessions.
- [ ] Verify the home page renders the commercial app shell in the browser.
- [ ] Verify a correct P1.1 answer succeeds through the product workbench.
