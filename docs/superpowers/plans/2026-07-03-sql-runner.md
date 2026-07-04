# SQL Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local PostgreSQL-backed SQL runner to the existing SQL Mastery static curriculum.

**Architecture:** A small Express server serves the existing HTML/CSS/JS and exposes JSON endpoints for available databases and query execution. The browser UI is injected by `shared.js`, keeping all lesson pages on the same runner without editing every HTML file.

**Tech Stack:** Node.js, Express, `pg`, native `node:test`, existing static HTML/CSS/JS.

## Global Constraints

- Connect only to local PostgreSQL by default: host `localhost`, port `5432`.
- Use the five curriculum databases by default: `northwind`, `chinook`, `adventureworks`, `stackoverflow`, `nyctaxi`.
- Allow local overrides through environment variables without storing secrets in source files.
- Do not seed data; the user's databases already contain data.
- Keep the UI compact and usable on every module page.

---

### Task 1: Server Configuration and Query Service

**Files:**
- Create: `package.json`
- Create: `src/db-config.js`
- Create: `src/query-service.js`
- Create: `test/db-config.test.js`
- Create: `test/query-service.test.js`

**Interfaces:**
- Produces: `getDatabaseNames(env)`, `buildClientConfig(database, env)`, `createQueryService({ Pool, env })`

- [x] Write failing tests for database defaults, environment overrides, SQL validation, selected database validation, and result formatting.
- [x] Run `node --test test/db-config.test.js test/query-service.test.js` and confirm the tests fail because the modules do not exist yet.
- [x] Implement the smallest configuration and query service needed to pass the tests.
- [x] Run the same tests and confirm they pass.

### Task 2: HTTP API and Static App Server

**Files:**
- Create: `src/app.js`
- Create: `server.js`
- Create: `test/app.test.js`
- Create: `.env.example`

**Interfaces:**
- Produces: `createApp({ queryService })`, `GET /api/databases`, `POST /api/query`

- [x] Write failing tests for database listing, query execution response shape, and structured error responses.
- [x] Run `node --test test/app.test.js` and confirm it fails because `src/app.js` does not exist yet.
- [x] Implement the Express app factory and server entry point.
- [x] Run the app tests and confirm they pass.

### Task 3: Browser SQL Runner

**Files:**
- Modify: `shared.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `GET /api/databases`, `POST /api/query`
- Produces: visible runner UI on every page with database picker, SQL input, Run button, status, and results table.

- [x] Add a shared runner component in `shared.js` that injects itself below the sticky header.
- [x] Fetch available databases on load; if unavailable, show a local-server hint instead of breaking the page.
- [x] POST pasted SQL to `/api/query` and render returned columns/rows.
- [x] Add compact, responsive runner styles to `styles.css`.

### Task 4: Verification

**Files:**
- No new files.

- [x] Run `npm test`.
- [x] Start the app with `npm start`.
- [x] Open `http://localhost:3000` in the in-app browser and verify the runner renders.
- [x] Attempt a smoke query such as `SELECT 1 AS ok;`; the API and UI return a clear `PGPASSWORD` setup message when local credentials are not configured.
