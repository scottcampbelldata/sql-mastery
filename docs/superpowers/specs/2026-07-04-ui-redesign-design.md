# SQL Mastery Path — Unified UI/UX Redesign

**Date:** 2026-07-04
**Status:** Approved by owner
**Scope:** Complete front-end redesign, unifying the SPA and the 10 static lesson pages into one React application with a shared design system. Back end (Express API, query service, curriculum service) is unchanged.

## Problem

The product is currently two visually and structurally different apps:

1. A vanilla-JS SPA (`index.html` + `app.js` + `app.css`) with dashboard, course map, session queue, and a graded SQL workbench backed by local PostgreSQL.
2. Ten static lesson pages (`m1`–`m8`, `mock-interviews.html`, `schemas.html`) sharing `styles.css`, with their own header, nav, and component styles.

Owner-identified pain points: visual polish, navigation/flow between the two halves, workbench usability, and information overload on dense screens.

## Decisions (made with owner)

- **Scope:** everything, unified.
- **Visual direction:** refined dark IDE — premium dev-tool feel, dark palette retained and elevated.
- **Stack:** React + Vite SPA (plain JSX, no TypeScript). Build step is acceptable.
- **Progress data:** preserved — same localStorage keys (`sqlm:product-progress:v1`, `sqlm:product-active-session:v1`, sidebar key).

## Architecture

### Project layout

```
sql-mastery/
  server.js, src/           # unchanged Express + pg back end
  client/
    index.html
    vite.config.js          # dev proxy /api -> Express; build -> client/dist
    src/
      main.jsx, App.jsx     # router + app shell
      theme/tokens.css      # design tokens (single source of truth)
      components/           # Button, Pill, Card, Tabs, DataTable, Callout,
                            # ProgressMeter, EmptyState, SqlEditor (CodeMirror), AppShell
      routes/
        Dashboard.jsx
        Session.jsx         # workbench: /session/:sessionId/:exerciseId?
        Lesson.jsx          # /lessons/:slug
        Databases.jsx       # /databases — standalone schema browser
      lessons/              # raw HTML fragments extracted from the legacy pages
      lib/                  # api client, progress store, curriculum helpers
```

- Express serves `client/dist` in production (static middleware pointed at the build output); `/api/*` routes unchanged. Dev workflow: `npm run dev` runs Vite with a proxy to the Express port.
- Legacy files (`app.js`, `app.css`, `styles.css`, the 10 static HTML pages, root `index.html`) are **deleted only after** every converted route is visually verified against the running server.

### Lesson content strategy

The ~3,000 lines of hand-written lesson content are **not rewritten**. For each legacy page, the `<div class="wrap">` body is extracted into an HTML fragment under `client/src/lessons/`, imported via Vite `?raw`, and rendered inside the app shell with `dangerouslySetInnerHTML`. The new stylesheet restyles the existing class vocabulary (`.problem`, `.chip`, `.note/.warn/.tip`, `pre` token spans, `details.sol/.hint`, etc.).

A single delegated handler in `Lesson.jsx` rewires interactivity:

- Progress checkboxes (`input.done[data-id]`) read/write the same localStorage progress store.
- `<details>` hint/solution disclosures work natively; styling only.
- In-fragment links to legacy pages (`m2-aggregation.html` etc.) are intercepted and rewritten to router paths (`/lessons/m2-aggregation`).
- The legacy per-page "guided workbench" and page-level SQL runner are superseded by a "Open in workbench" affordance linking to the corresponding session/exercise where one exists, and by the `/databases` browser's scratch query panel.

## Design system

### Tokens (`theme/tokens.css`)

- **Palette:** near-black neutral base (≈`#0B0E14`), two elevation surfaces distinguished by 1px borders (no drop shadows), refined amber brand accent. Semantic colors are reserved for meaning only: green = passing/complete, red = error, blue = informational, amber = brand/active. Decorative use of semantic colors is removed.
- **Type:** Space Grotesk (display), IBM Plex Sans (body), IBM Plex Mono (code/labels). Six-step modular type scale; mono reserved for code, data, and small-cap labels.
- **Spacing:** 8px grid (4px half-step allowed). Radius scale: 4 / 8 / 12.
- **Motion:** 120–160ms ease-out transitions on interactive states only.

### Components (one implementation each)

Button (primary/secondary/ghost), Pill/Badge, Card, Tabs, DataTable (sticky header, NULL styling, row cap notice), Callout (note/warn/tip), ProgressMeter (bar + ring variant), EmptyState, SqlEditor (CodeMirror 6 + `@codemirror/lang-sql`, custom theme from tokens, error-position highlighting), AppShell (sidebar + top bar).

## Navigation & IA

Persistent app shell on every route:

- **Sidebar** (collapsible to icon rail, state persisted): Dashboard · Continue (deep-links to first incomplete exercise) · Curriculum · Lessons (expandable list m0–m8 + Mocks) · Databases. Course progress meter pinned at bottom.
- **Top bar:** breadcrumb (e.g. *Curriculum → Week 3 → Joins deep dive*), and on workbench routes the active database badge.
- Cross-links everywhere resolve in-app (lesson ↔ exercise ↔ schema browser).

## Screens

### Dashboard (`/`)

Decluttered, one primary job: a large **Continue** card (week/session title, goal, progress, primary button). Below: compact stat row (weeks/sessions/exercises done), the 16-week map as a grid of cards with real progress bars and a highlighted current week, then the session queue (next ~8, collapsed by default beyond that). Marketing copy ("Commercial course mode", "Training command") removed; tone addresses a learner.

### Workbench (`/session/:sessionId/:exerciseId?`)

Three zones, CSS-grid based with a draggable horizontal divider for the dock:

- **Left rail:** session's exercises with number, title, done/active state; collapsible.
- **Center:** task statement → "Learn this first" accordion (concept, mental model, worked example, steps, common mistakes, interview angle — open on first visit to an exercise, collapsed once visited) → SqlEditor → action row (Run & check · Hint · Reveal answer · Next) → inline feedback banner directly under the editor (pass/fail/error with server hint; Postgres error position highlighted in the editor).
- **Bottom dock:** tabs — **Results** (DataTable, row count, truncation notice) and **Schema** (table list with row estimates → column detail with PK/FK badges → sample rows).

Hint becomes progressive disclosure under the editor rather than replacing the feedback panel.

### Lessons (`/lessons/:slug`)

Legacy content in the new shell: sticky in-page table of contents (generated from `h2`s) on wide viewports, restyled problem cards/callouts/code blocks, working progress checkboxes shared with the workbench progress store.

### Databases (`/databases`)

Promoted schema browser: database picker → table grid → column map + sample rows, plus a free-form scratch query editor using `/api/query` (read-only guardrails already enforced server-side).

## Error handling & empty states

- **Curriculum fails to load:** full-screen EmptyState with the server-start command.
- **Postgres down / database missing:** Callout inside schema/results panes with the specific `error`/`hint` from the API, not a generic failure.
- **Query error:** feedback banner shows message + hint; editor underlines the reported `position`.
- **Empty results:** explicit "0 rows" state (distinct from "not run yet").
- **First run:** dashboard Continue card reads as "Start Week 1" with no progress-shaming zeros.

## Testing

- **Vitest** for pure logic: progress store (load/save/migrate), curriculum helpers (percent, current-session selection), lesson link-rewriting.
- **Visual verification** of every route (dashboard, one session per stage, all 10 lesson slugs, databases) against the running Express + Postgres server before deleting legacy files.

## Out of scope

- Back-end changes beyond pointing static serving at `client/dist`.
- Auth, multi-user, cloud sync, mobile-first optimization (responsive down to tablet is included; phone gets a usable single-column fallback).
- Rewriting lesson prose or curriculum content.
