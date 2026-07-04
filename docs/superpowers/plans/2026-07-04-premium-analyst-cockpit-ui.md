# Premium Analyst Cockpit UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the SQL Mastery Path frontend into a premium analyst cockpit while preserving the working SQL runner and grading flow.

**Architecture:** Keep the existing static SPA in `app.js` and `app.css`. Add semantic shell class names for dashboard and session views, then replace the visual system with a quieter, denser, interview-focused design.

**Tech Stack:** Static HTML/CSS/JS, Node `node:test`, Express static server, Playwright browser verification.

## Global Constraints

- Preserve all current app behavior and API calls.
- Keep cards at 8px radius or less.
- Keep the product serious, elegant, and analyst-focused.
- Do not add a frontend framework.
- Verify desktop and mobile layouts.

---

### Task 1: Lock In Premium Shell Markup

**Files:**
- Create: `test/ui-shell.test.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: existing curriculum state and render functions.
- Produces: dashboard/session markup with `cockpit-header`, `mission-panel`, `metric-card`, `week-lattice`, `studio-workbench`, `editor-shell`, and `coach-panel` hooks.

- [ ] Write a failing static regression test for the new shell hooks.
- [ ] Run `node --test test/ui-shell.test.js` and verify it fails.
- [ ] Update `app.js` markup with the new shell hooks and refined copy.
- [ ] Run the focused test and verify it passes.

### Task 2: Apply Premium Visual System

**Files:**
- Modify: `app.css`
- Modify: `index.html`

**Interfaces:**
- Consumes: shell hooks from Task 1.
- Produces: polished desktop/mobile UI using the approved visual system.

- [ ] Replace CSS tokens with the premium cockpit palette and type scale.
- [ ] Restyle dashboard header, mission panel, metric cards, week lattice, session queue, exercise rail, workbench, editor, feedback, and results.
- [ ] Preserve accessible focus states and responsive behavior.
- [ ] Run `node --test`.

### Task 3: Browser Verification

**Files:**
- No source files.

- [ ] Restart or reuse the local server at `http://127.0.0.1:3000`.
- [ ] Verify dashboard renders with no console errors.
- [ ] Verify session workspace renders with no console errors.
- [ ] Verify wrong SQL shows a useful error.
- [ ] Verify correct SQL says "You got it right" and renders results.
- [ ] Verify mobile layout at a narrow viewport.
