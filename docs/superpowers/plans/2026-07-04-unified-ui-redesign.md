# Unified UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-faced front end (vanilla SPA + 10 static lesson pages) with one React + Vite application using a shared dark-IDE design system, per `docs/superpowers/specs/2026-07-04-ui-redesign-design.md`.

**Architecture:** The Express back end is untouched except for where static files are served from and where curriculum content HTML lives. Legacy lesson HTML moves to `content/` (server keeps parsing it for the curriculum; a small script extracts body fragments into the client). The client is a Vite + React SPA in `client/`, built to `client/dist`, which Express serves.

**Tech Stack:** React 18, react-router-dom 6, Vite 5, CodeMirror 6 (`@uiw/react-codemirror` + `@codemirror/lang-sql`), Vitest + @testing-library/react for client tests, existing `node --test` for server tests.

**Key constraints discovered in the codebase:**
- `src/curriculum-service.js` **reads and parses the 10 legacy HTML files** (`MODULES` list, `parseModule(rootDir, ...)`, default rootDir = repo root). Lesson HTML is data, not just presentation.
- `test/ui-shell.test.js` asserts against `app.js`/`app.css`/`index.html` and must be replaced in the same task that deletes those files (Task 13).
- Existing localStorage keys that must keep working: `sqlm:product-progress:v1` (SPA progress: `{completed, attempts, lastSql}`), `sqlm:product-active-session:v1`, `sqlm:sidebar-collapsed:v1`, lesson checkboxes `sqlm:<data-page>:<data-id>` = `'1'`.
- API surface (unchanged): `GET /api/databases`, `GET /api/curriculum`, `GET /api/schema?database=`, `POST /api/table-preview`, `POST /api/query`, `POST /api/check`.
- Express 5. `express.static` at end of `createApp` with `extensions: ['html']`.

---

### Task 1: Move lesson content to `content/` and decouple the server from it

The server must keep working exactly as before, with content sourced from `content/` instead of the repo root. Static pages remain reachable during the transition (Express still serves the root too until Task 13).

**Files:**
- Create: `content/` (10 files moved: `m1-fundamentals.html` … `m8-performance.html`, `mock-interviews.html`, `schemas.html`)
- Modify: `src/curriculum-service.js:374` (default rootDir)
- Modify: `src/app.js` (pass explicit `contentDir` to buildCurriculum)
- Test: `test/curriculum-service.test.js` (existing — must stay green)

- [ ] **Step 1: Move the files with git mv**

```bash
mkdir content
git mv m1-fundamentals.html m2-aggregation.html m3-joins.html m4-transformation.html m5-subqueries-ctes.html m6-window-functions.html m7-interview-patterns.html m8-performance.html mock-interviews.html schemas.html content/
```

- [ ] **Step 2: Point curriculum-service at `content/` by default**

In `src/curriculum-service.js`, change the default rootDir (line ~374):

```js
const rootDir = options.rootDir || path.join(__dirname, '..', 'content');
```

- [ ] **Step 3: Pass contentDir explicitly in `src/app.js`**

In `createApp`, add a `contentDir` option and use it for the curriculum route; keep `staticDir` for static serving only:

```js
const staticDir = options.staticDir || path.join(__dirname, '..');
const contentDir = options.contentDir || path.join(__dirname, '..', 'content');
```

and in the `/api/curriculum` handler change `rootDir: staticDir` to `rootDir: contentDir`.

- [ ] **Step 4: Fix curriculum-service tests if they pass explicit rootDir**

Run: `npm test`
Expected: all pass. If `test/curriculum-service.test.js` constructs `buildCurriculum({ rootDir: ... })` pointing at repo root, update that fixture path to `content/`. Also check `test/app.test.js` for any curriculum stubs (it stubs the service, so it should pass untouched).

- [ ] **Step 5: Update lesson-to-lesson hrefs are still valid via static serving**

The moved pages reference each other relatively (`m2-aggregation.html`) and `styles.css`/`shared.js` at root. Add one more static mount ABOVE the existing one in `src/app.js` so `/content/...` isn't needed and old URLs keep working during transition:

```js
app.use(express.static(contentDir, { extensions: ['html'] }));
```

(placed immediately before the existing `express.static(staticDir, ...)` line — root assets like `styles.css` resolve from the second mount).

- [ ] **Step 6: Manual smoke check**

Run: `npm start` then open `http://127.0.0.1:3000/m1-fundamentals.html` and `http://127.0.0.1:3000/` — both render as before. `curl http://127.0.0.1:3000/api/curriculum | head -c 200` returns JSON.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "refactor: move lesson content to content/, decouple curriculum source from static dir"
```

---

### Task 2: Scaffold the Vite + React client

**Files:**
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`
- Modify: root `package.json` (scripts), `.gitignore` (already ignores `client/dist/`)

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "sql-mastery-client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@codemirror/lang-sql": "^6.8.0",
    "@uiw/react-codemirror": "^4.23.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `client/vite.config.js`** (proxy `/api` to Express; build to `dist`)

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:3000' }
  },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
    globals: true
  }
});
```

- [ ] **Step 3: Create `client/index.html`** (keep favicon + fonts from legacy `index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SQL Mastery Path</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='10' fill='%23102033'/%3E%3Cpath d='M16 18h32v6H16zm0 11h22v6H16zm0 11h30v6H16z' fill='%2372d6a1'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
</head>
<body>
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create `client/src/main.jsx` and a placeholder `client/src/App.jsx`**

```jsx
// main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import './theme/tokens.css';
import './theme/global.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
```

Note: **HashRouter**, deliberately — Express serves a static dist with no catch-all rewrite, and the legacy app already used hash routes. No server change needed, deep links always work.

```jsx
// App.jsx (placeholder until Task 6)
export default function App() {
  return <div style={{ padding: 32 }}>SQL Mastery Path — shell coming in Task 6</div>;
}
```

Create empty `client/src/theme/tokens.css` and `client/src/theme/global.css` so the imports resolve (filled in Task 3), and `client/src/test-setup.js`:

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Root package.json scripts**

```json
"scripts": {
  "start": "node server.js",
  "dev": "npm --prefix client run dev",
  "build": "npm --prefix client run build",
  "test": "node --test test/*.test.js && npm --prefix client test"
}
```

- [ ] **Step 6: Install and verify**

Run: `npm --prefix client install` then `npm --prefix client run build`
Expected: build succeeds producing `client/dist/index.html`. Then `npm run dev` + open `http://127.0.0.1:5173` shows the placeholder.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scaffold Vite + React client with API proxy and hash routing"
```

---

### Task 3: Design tokens and global styles

Single source of truth for the refined dark-IDE look. Everything later consumes these variables — no hard-coded colors in components.

**Files:**
- Create: `client/src/theme/tokens.css`, `client/src/theme/global.css`

- [ ] **Step 1: Write `tokens.css`**

```css
:root {
  /* palette */
  --bg: #0b0e14;
  --surface-1: #11151d;      /* cards, panels */
  --surface-2: #171c26;      /* nested panels, table heads, inputs */
  --line: #232a37;           /* default 1px border */
  --line-strong: #303948;
  --ink: #c8d3e0;            /* body text */
  --ink-strong: #eff4fb;     /* headings, emphasis */
  --ink-dim: #808ea3;        /* secondary text */
  --ink-faint: #5a6779;      /* placeholders, disabled */

  /* brand + semantics (meaning only, never decoration) */
  --brand: #e8a33d;
  --brand-ink: #1a1206;      /* text on brand */
  --brand-soft: rgba(232, 163, 61, 0.12);
  --ok: #4cc38a;
  --ok-soft: rgba(76, 195, 138, 0.12);
  --err: #e5645f;
  --err-soft: rgba(229, 100, 95, 0.12);
  --info: #6cb2f7;
  --info-soft: rgba(108, 178, 247, 0.12);

  /* syntax (code blocks + editor theme) */
  --syn-keyword: #b180d7;
  --syn-function: #6cb2f7;
  --syn-string: #4cc38a;
  --syn-number: #e8a33d;
  --syn-comment: #5a6b82;

  /* type */
  --font-display: 'Space Grotesk', system-ui, sans-serif;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
  --text-xs: 0.72rem;   /* mono labels, pills */
  --text-sm: 0.84rem;   /* code, table cells, secondary */
  --text-md: 0.95rem;   /* body */
  --text-lg: 1.15rem;   /* h3 */
  --text-xl: 1.5rem;    /* h2 / page section */
  --text-2xl: 2rem;     /* h1 */

  /* space (8px grid) */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* radius + motion */
  --r-sm: 4px; --r-md: 8px; --r-lg: 12px;
  --ease: 140ms ease-out;

  /* layout */
  --sidebar-w: 232px;
  --sidebar-w-collapsed: 64px;
  --topbar-h: 52px;
}
```

- [ ] **Step 2: Write `global.css`** (reset + base typography + shared content styling used by both React components and lesson fragments)

```css
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font-family: var(--font-body); font-size: var(--text-md); line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3, h4 { font-family: var(--font-display); color: var(--ink-strong); line-height: 1.25; margin: 0; }
p { margin: var(--s-2) 0; }
a { color: var(--info); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
  font-family: var(--font-mono); font-size: 0.88em; color: var(--ink-strong);
  background: var(--surface-2); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: 0.08em 0.35em;
}
pre {
  background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: var(--s-4); overflow-x: auto; font-family: var(--font-mono);
  font-size: var(--text-sm); line-height: 1.6; color: var(--ink);
}
/* legacy lesson syntax spans keep working */
pre .k { color: var(--syn-keyword); font-weight: 600; }
pre .f { color: var(--syn-function); }
pre .s { color: var(--syn-string); }
pre .c { color: var(--syn-comment); font-style: italic; }
pre .n { color: var(--syn-number); }
kbd {
  font-family: var(--font-mono); font-size: 0.8em; background: var(--surface-2);
  border: 1px solid var(--line); border-bottom-width: 2px; border-radius: var(--r-sm); padding: 1px 6px;
}
::selection { background: var(--brand-soft); }
:focus-visible { outline: 2px solid var(--info); outline-offset: 2px; }
button { font-family: inherit; }
```

- [ ] **Step 3: Verify** — `npm --prefix client run build` passes; dev server shows dark background on the placeholder.

- [ ] **Step 4: Commit**

```bash
git add client/src/theme && git commit -m "feat: design tokens and global styles for dark-IDE system"
```

---

### Task 4: Client lib — API client, progress store, curriculum helpers (TDD)

**Files:**
- Create: `client/src/lib/api.js`, `client/src/lib/progress.js`, `client/src/lib/curriculum.js`
- Test: `client/src/lib/progress.test.js`, `client/src/lib/curriculum.test.js`

- [ ] **Step 1: Write failing tests for the progress store**

`client/src/lib/progress.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { loadProgress, saveProgress, markComplete, isLessonBoxChecked, setLessonBox } from './progress.js';

describe('progress store', () => {
  beforeEach(() => localStorage.clear());

  it('loads default shape when storage empty or corrupt', () => {
    expect(loadProgress()).toEqual({ completed: {}, attempts: {}, lastSql: {} });
    localStorage.setItem('sqlm:product-progress:v1', '{not json');
    expect(loadProgress()).toEqual({ completed: {}, attempts: {}, lastSql: {} });
  });

  it('round-trips under the legacy key sqlm:product-progress:v1', () => {
    const p = loadProgress();
    p.lastSql['ex1'] = 'SELECT 1;';
    saveProgress(p);
    expect(JSON.parse(localStorage.getItem('sqlm:product-progress:v1')).lastSql.ex1).toBe('SELECT 1;');
  });

  it('markComplete stamps completedAt and attempt count', () => {
    const p = loadProgress();
    p.attempts['ex1'] = 3;
    markComplete(p, 'ex1');
    expect(p.completed.ex1.attempts).toBe(3);
    expect(typeof p.completed.ex1.completedAt).toBe('string');
  });

  it('lesson checkboxes use the legacy sqlm:<page>:<id> keys', () => {
    setLessonBox('m1', 'p1-1', true);
    expect(localStorage.getItem('sqlm:m1:p1-1')).toBe('1');
    expect(isLessonBoxChecked('m1', 'p1-1')).toBe(true);
    setLessonBox('m1', 'p1-1', false);
    expect(localStorage.getItem('sqlm:m1:p1-1')).toBe(null);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm --prefix client test` → FAIL (module not found).

- [ ] **Step 3: Implement `client/src/lib/progress.js`**

```js
const PROGRESS_KEY = 'sqlm:product-progress:v1';
export const ACTIVE_SESSION_KEY = 'sqlm:product-active-session:v1';
export const SIDEBAR_KEY = 'sqlm:sidebar-collapsed:v1';

export function loadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    if (parsed && typeof parsed === 'object') {
      return { completed: parsed.completed || {}, attempts: parsed.attempts || {}, lastSql: parsed.lastSql || {} };
    }
  } catch { /* fall through */ }
  return { completed: {}, attempts: {}, lastSql: {} };
}

export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function markComplete(progress, exerciseId) {
  progress.completed[exerciseId] = {
    completedAt: new Date().toISOString(),
    attempts: progress.attempts[exerciseId] || 0
  };
}

/* legacy lesson checkbox keys: sqlm:<data-page>:<data-id> = '1' */
export function isLessonBoxChecked(page, id) {
  return localStorage.getItem(`sqlm:${page}:${id}`) === '1';
}
export function setLessonBox(page, id, checked) {
  if (checked) localStorage.setItem(`sqlm:${page}:${id}`, '1');
  else localStorage.removeItem(`sqlm:${page}:${id}`);
}
```

- [ ] **Step 4: Failing tests for curriculum helpers**

`client/src/lib/curriculum.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { percent, completedCount, sessionComplete, currentSession, lessonSlug } from './curriculum.js';

const sessions = [
  { id: 's1', exerciseIds: ['a', 'b'] },
  { id: 's2', exerciseIds: ['c'] }
];

describe('curriculum helpers', () => {
  it('percent rounds and handles zero total', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
  it('completedCount / sessionComplete', () => {
    const completed = { a: {}, b: {} };
    expect(completedCount(sessions[0].exerciseIds, completed)).toBe(2);
    expect(sessionComplete(sessions[0], completed)).toBe(true);
    expect(sessionComplete(sessions[1], completed)).toBe(false);
  });
  it('currentSession prefers explicit active id, else first incomplete', () => {
    const completed = { a: {}, b: {} };
    expect(currentSession(sessions, completed, 's1').id).toBe('s1');
    expect(currentSession(sessions, completed, '').id).toBe('s2');
    expect(currentSession(sessions, { a: {}, b: {}, c: {} }, '').id).toBe('s1');
  });
  it('lessonSlug strips .html from sourceFile', () => {
    expect(lessonSlug('m1-fundamentals.html')).toBe('m1-fundamentals');
  });
});
```

- [ ] **Step 5: Run to verify failure**, then implement `client/src/lib/curriculum.js`

```js
export function percent(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
export function completedCount(ids, completed) {
  return ids.filter((id) => completed[id]).length;
}
export function sessionComplete(session, completed) {
  return completedCount(session.exerciseIds, completed) === session.exerciseIds.length;
}
export function currentSession(sessions, completed, activeSessionId) {
  const active = sessions.find((s) => s.id === activeSessionId);
  if (active) return active;
  return sessions.find((s) => !sessionComplete(s, completed)) || sessions[0];
}
export function lessonSlug(sourceFile) {
  return String(sourceFile || '').replace(/\.html$/, '');
}
```

- [ ] **Step 6: Implement `client/src/lib/api.js`** (thin fetch wrapper; server error bodies have `{error, code, hint, position}`)

```js
async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    Object.assign(error, { code: body.code, hint: body.hint, position: body.position, detail: body.detail });
    throw error;
  }
  return body;
}
const post = (url, payload) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});

export const api = {
  curriculum: () => request('/api/curriculum'),
  databases: () => request('/api/databases'),
  schema: (database) => request(`/api/schema?database=${encodeURIComponent(database)}`),
  tablePreview: (database, schema, table, limit = 6) => post('/api/table-preview', { database, schema, table, limit }),
  query: (database, sql) => post('/api/query', { database, sql }),
  check: (database, sql, expectedSql) => post('/api/check', { database, sql, expectedSql })
};
```

- [ ] **Step 7: Run all client tests** — `npm --prefix client test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add client/src/lib && git commit -m "feat: client lib (api, progress store, curriculum helpers) with tests"
```

---

### Task 5: Design-system components

One implementation of each primitive. All styling via a co-located `components.css` consuming tokens only.

**Files:**
- Create: `client/src/components/ui.jsx` (Button, Pill, Card, Callout, EmptyState, ProgressMeter, Tabs)
- Create: `client/src/components/DataTable.jsx`
- Create: `client/src/components/components.css`
- Test: `client/src/components/DataTable.test.jsx`

- [ ] **Step 1: Write `client/src/components/ui.jsx`**

```jsx
import './components.css';

export function Button({ variant = 'secondary', children, ...rest }) {
  return <button className={`btn btn-${variant}`} {...rest}>{children}</button>;
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  return <Tag className={`card ${className}`} {...rest}>{children}</Tag>;
}

export function Callout({ tone = 'info', title, children }) {
  return (
    <div className={`callout callout-${tone}`}>
      {title ? <span className="callout-tag">{title}</span> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function ProgressMeter({ value, label }) {
  return (
    <div className="meter" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      {label ? <div className="meter-head"><span>{label}</span><strong>{value}%</strong></div> : null}
      <div className="meter-track"><div className="meter-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={tab.id === active}
          className={`tab ${tab.id === active ? 'active' : ''}`}
          disabled={tab.disabled} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Failing test for DataTable** (`client/src/components/DataTable.test.jsx`)

```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './DataTable.jsx';

describe('DataTable', () => {
  it('renders NULL cells distinctly and caps rows with a notice', () => {
    const columns = ['a'];
    const rows = Array.from({ length: 120 }, (_, i) => ({ a: i === 0 ? null : i }));
    render(<DataTable columns={columns} rows={rows} maxRows={100} />);
    expect(screen.getByText('NULL')).toHaveClass('cell-null');
    expect(screen.getByText(/first 100 of 120/i)).toBeInTheDocument();
  });
  it('renders an explicit zero-rows state', () => {
    render(<DataTable columns={['a']} rows={[]} />);
    expect(screen.getByText(/0 rows/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**, then implement `client/src/components/DataTable.jsx`

```jsx
import './components.css';

function formatCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return String(value); } }
  return String(value);
}

export function DataTable({ columns, rows, maxRows = 100 }) {
  if (!columns || !columns.length) return null;
  if (!rows.length) return <div className="table-note">0 rows returned.</div>;
  const shown = rows.slice(0, maxRows);
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = formatCell(row[c]);
                return v === null
                  ? <td key={c} className="cell-null">NULL</td>
                  : <td key={c} title={v}>{v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows
        ? <div className="table-note">Showing first {maxRows} of {rows.length} rows.</div>
        : null}
    </div>
  );
}
```

- [ ] **Step 4: Write `client/src/components/components.css`**

```css
/* buttons */
.btn {
  height: 34px; padding: 0 var(--s-4); border-radius: var(--r-md);
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  cursor: pointer; transition: background var(--ease), border-color var(--ease), color var(--ease);
  border: 1px solid var(--line); background: var(--surface-2); color: var(--ink);
}
.btn:hover { border-color: var(--line-strong); color: var(--ink-strong); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--brand); border-color: var(--brand); color: var(--brand-ink); }
.btn-primary:hover { filter: brightness(1.08); color: var(--brand-ink); }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-dim); }
.btn-ghost:hover { color: var(--ink-strong); border-color: var(--line); }

/* pills */
.pill {
  display: inline-flex; align-items: center; gap: var(--s-1);
  font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.05em;
  border-radius: var(--r-sm); padding: 2px var(--s-2);
  background: var(--surface-2); border: 1px solid var(--line); color: var(--ink-dim);
}
.pill-ok { background: var(--ok-soft); border-color: transparent; color: var(--ok); }
.pill-err { background: var(--err-soft); border-color: transparent; color: var(--err); }
.pill-info { background: var(--info-soft); border-color: transparent; color: var(--info); }
.pill-brand { background: var(--brand-soft); border-color: transparent; color: var(--brand); }

/* cards */
.card { background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--s-4) var(--s-5); }

/* callouts */
.callout {
  border: 1px solid var(--line); border-left: 3px solid var(--info);
  background: var(--surface-1); border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4); margin: var(--s-3) 0; font-size: var(--text-sm);
}
.callout-tag { display: block; font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--info); margin-bottom: var(--s-1); }
.callout-warn { border-left-color: var(--err); } .callout-warn .callout-tag { color: var(--err); }
.callout-tip { border-left-color: var(--ok); } .callout-tip .callout-tag { color: var(--ok); }

/* empty state */
.empty-state { text-align: center; padding: var(--s-7) var(--s-5); color: var(--ink-dim); }
.empty-state h3 { font-size: var(--text-lg); margin-bottom: var(--s-2); }

/* meter */
.meter-head { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-dim); margin-bottom: var(--s-1); }
.meter-head strong { color: var(--ink-strong); }
.meter-track { height: 5px; border-radius: 3px; background: var(--surface-2); overflow: hidden; }
.meter-fill { height: 100%; background: var(--brand); border-radius: 3px; transition: width var(--ease); }

/* tabs */
.tab-bar { display: flex; gap: var(--s-1); border-bottom: 1px solid var(--line); }
.tab {
  border: none; background: none; color: var(--ink-dim); cursor: pointer;
  font-size: var(--text-sm); font-weight: 600; padding: var(--s-2) var(--s-3);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--ink-strong); }
.tab.active { color: var(--brand); border-bottom-color: var(--brand); }
.tab:disabled { opacity: 0.4; cursor: not-allowed; }

/* data table */
.data-table-wrap { overflow: auto; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); }
.data-table { border-collapse: collapse; width: 100%; font-size: var(--text-sm); }
.data-table th {
  position: sticky; top: 0; z-index: 1; text-align: left;
  background: var(--surface-2); color: var(--ink-dim);
  font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; text-transform: uppercase;
  padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line);
}
.data-table td { padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
.data-table tr:last-child td { border-bottom: none; }
.cell-null { color: var(--ink-faint); font-style: italic; }
.table-note { padding: var(--s-3) var(--s-4); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }
```

- [ ] **Step 5: Run tests** — `npm --prefix client test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/components && git commit -m "feat: design-system primitives and DataTable"
```

---

### Task 6: App shell — sidebar, top bar, router

**Files:**
- Create: `client/src/components/AppShell.jsx`, `client/src/components/appshell.css`, `client/src/state/CurriculumContext.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Create `client/src/state/CurriculumContext.jsx`** — loads curriculum + owns progress state so every route shares them:

```jsx
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../lib/api.js';
import { loadProgress, saveProgress, ACTIVE_SESSION_KEY } from '../lib/progress.js';

const Ctx = createContext(null);
export const useCurriculum = () => useContext(Ctx);

export function CurriculumProvider({ children }) {
  const [curriculum, setCurriculum] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(loadProgress);
  const [activeSessionId, setActiveSessionIdState] = useState(() => localStorage.getItem(ACTIVE_SESSION_KEY) || '');

  useEffect(() => {
    api.curriculum().then(setCurriculum).catch((e) => setError(e.message));
  }, []);

  const updateProgress = useCallback((mutate) => {
    setProgress((prev) => {
      const next = { completed: { ...prev.completed }, attempts: { ...prev.attempts }, lastSql: { ...prev.lastSql } };
      mutate(next);
      saveProgress(next);
      return next;
    });
  }, []);

  const setActiveSessionId = useCallback((id) => {
    localStorage.setItem(ACTIVE_SESSION_KEY, id);
    setActiveSessionIdState(id);
  }, []);

  const value = useMemo(() => ({ curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId }),
    [curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 2: Create `AppShell.jsx`**

Sidebar sections: Dashboard, Continue, Curriculum (scrolls dashboard to week map — plain link to `/#weeks`), Lessons (list of 10 from a static manifest), Databases. Progress meter pinned at bottom. Collapse toggle persisted under `SIDEBAR_KEY`. Top bar renders breadcrumb from route.

```jsx
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { currentSession, percent } from '../lib/curriculum.js';
import { SIDEBAR_KEY } from '../lib/progress.js';
import { ProgressMeter } from './ui.jsx';
import { LESSONS } from '../lessons/manifest.js';
import './appshell.css';

export function AppShell({ children, breadcrumb }) {
  const { curriculum, progress } = useCurriculum();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const location = useLocation();

  const done = curriculum ? Object.keys(progress.completed).length : 0;
  const total = curriculum ? curriculum.exercises.length : 0;
  const cont = curriculum ? currentSession(curriculum.sessions, progress.completed, '') : null;

  function toggle() {
    const next = !collapsed;
    localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
    setCollapsed(next);
  }

  return (
    <div className={`shell ${collapsed ? 'collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <Link to="/" className="brand-mark">SQL<span>/</span>Mastery</Link>
          <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav className="side-nav">
          <NavLink to="/" end className="nav-item"><span className="nav-ico">◆</span><span className="nav-label">Dashboard</span></NavLink>
          {cont ? <NavLink to={`/session/${cont.id}`} className={() => `nav-item ${location.pathname.startsWith('/session') ? 'active' : ''}`}><span className="nav-ico">▶</span><span className="nav-label">Continue</span></NavLink> : null}
          <div className="nav-group"><span className="nav-group-label">Lessons</span>
            {LESSONS.map((l) => (
              <NavLink key={l.slug} to={`/lessons/${l.slug}`} className="nav-item nav-sub">
                <span className="nav-ico">{l.short}</span><span className="nav-label">{l.title}</span>
              </NavLink>
            ))}
          </div>
          <NavLink to="/databases" className="nav-item"><span className="nav-ico">⛁</span><span className="nav-label">Databases</span></NavLink>
        </nav>
        <div className="sidebar-foot">
          {total ? <ProgressMeter value={percent(done, total)} label="Course" /> : null}
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="crumbs">{breadcrumb}</div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/lessons/manifest.js`** (static; slugs match `content/` file names minus `.html`, mirroring `MODULES` in curriculum-service)

```js
export const LESSONS = [
  { slug: 'schemas', short: '0', title: 'Know Your Schemas' },
  { slug: 'm1-fundamentals', short: '1', title: 'Fundamentals' },
  { slug: 'm2-aggregation', short: '2', title: 'Aggregation' },
  { slug: 'm3-joins', short: '3', title: 'Joins' },
  { slug: 'm4-transformation', short: '4', title: 'Transformation' },
  { slug: 'm5-subqueries-ctes', short: '5', title: 'Subqueries & CTEs' },
  { slug: 'm6-window-functions', short: '6', title: 'Window Functions' },
  { slug: 'm7-interview-patterns', short: '7', title: 'Interview Patterns' },
  { slug: 'm8-performance', short: '8', title: 'Performance' },
  { slug: 'mock-interviews', short: 'M', title: 'Mock Interviews' }
];
```

- [ ] **Step 4: Write `appshell.css`**

```css
.shell { display: grid; grid-template-columns: var(--sidebar-w) 1fr; min-height: 100vh; }
.shell.collapsed { grid-template-columns: var(--sidebar-w-collapsed) 1fr; }
.sidebar {
  position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column;
  background: var(--surface-1); border-right: 1px solid var(--line);
  padding: var(--s-4) var(--s-3); overflow-y: auto;
}
.brand { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-5); }
.brand-mark { font-family: var(--font-display); font-weight: 700; color: var(--ink-strong); font-size: 1.02rem; white-space: nowrap; }
.brand-mark span { color: var(--brand); }
.collapsed .brand-mark { display: none; }
.collapse-btn { border: 1px solid var(--line); background: none; color: var(--ink-dim); border-radius: var(--r-sm); width: 24px; height: 24px; cursor: pointer; }
.collapse-btn:hover { color: var(--ink-strong); border-color: var(--line-strong); }

.side-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.nav-item {
  display: flex; align-items: center; gap: var(--s-3);
  padding: var(--s-2) var(--s-3); border-radius: var(--r-md);
  color: var(--ink-dim); font-size: var(--text-sm); font-weight: 500;
  transition: background var(--ease), color var(--ease);
}
.nav-item:hover { background: var(--surface-2); color: var(--ink-strong); text-decoration: none; }
.nav-item.active { background: var(--brand-soft); color: var(--brand); }
.nav-ico { font-family: var(--font-mono); font-size: var(--text-xs); width: 18px; text-align: center; flex: none; }
.collapsed .nav-label, .collapsed .nav-group-label, .collapsed .sidebar-foot { display: none; }
.nav-group { margin: var(--s-3) 0; }
.nav-group-label { display: block; font-family: var(--font-mono); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); padding: var(--s-2) var(--s-3) var(--s-1); }
.nav-sub { padding-top: 5px; padding-bottom: 5px; }
.sidebar-foot { padding: var(--s-3); border-top: 1px solid var(--line); }

.main-col { min-width: 0; display: flex; flex-direction: column; }
.topbar {
  position: sticky; top: 0; z-index: 30; height: var(--topbar-h);
  display: flex; align-items: center; gap: var(--s-4); padding: 0 var(--s-5);
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.crumbs { display: flex; align-items: center; gap: var(--s-2); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); text-transform: uppercase; letter-spacing: 0.06em; }
.crumbs a { color: var(--ink-dim); } .crumbs a:hover { color: var(--ink-strong); text-decoration: none; }
.crumbs .sep { color: var(--ink-faint); }
.crumbs .here { color: var(--ink-strong); }
.main { padding: var(--s-5) var(--s-6) var(--s-8); max-width: 1200px; width: 100%; margin: 0 auto; }

@media (max-width: 860px) {
  .shell, .shell.collapsed { grid-template-columns: 1fr; }
  .sidebar { position: static; height: auto; flex-direction: row; align-items: center; gap: var(--s-3); overflow-x: auto; }
  .side-nav { flex-direction: row; }
  .nav-group, .sidebar-foot { display: none; }
}
```

- [ ] **Step 5: Wire the router in `App.jsx`** (placeholder route components until their tasks)

```jsx
import { Routes, Route } from 'react-router-dom';
import { CurriculumProvider, useCurriculum } from './state/CurriculumContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { EmptyState } from './components/ui.jsx';
import Dashboard from './routes/Dashboard.jsx';
import Session from './routes/Session.jsx';
import Lesson from './routes/Lesson.jsx';
import Databases from './routes/Databases.jsx';

function Body() {
  const { curriculum, error } = useCurriculum();
  if (error) {
    return <EmptyState title="Could not load the course">Start the server with <code>npm start</code>, then reload. ({error})</EmptyState>;
  }
  if (!curriculum) return <EmptyState title="Loading your training path" />;
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/session/:sessionId/:exerciseId?" element={<Session />} />
      <Route path="/lessons/:slug" element={<Lesson />} />
      <Route path="/databases" element={<Databases />} />
      <Route path="*" element={<EmptyState title="Page not found" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <CurriculumProvider>
      <Body />
    </CurriculumProvider>
  );
}
```

Note: each route renders its own `<AppShell breadcrumb={...}>` wrapper so breadcrumbs are route-specific. Create the four route files as stubs that render `<AppShell breadcrumb="...">stub</AppShell>` so the app compiles; they are filled in Tasks 7–11.

- [ ] **Step 6: Verify in dev** — with `npm start` (Express) and `npm run dev` (Vite) running, `http://127.0.0.1:5173` shows sidebar shell, curriculum loads (Continue appears), collapse toggle persists across reload. With Express stopped, the load-error EmptyState renders.

- [ ] **Step 7: Commit**

```bash
git add client/src && git commit -m "feat: app shell with sidebar, topbar, router, curriculum context"
```

---

### Task 7: Dashboard route

**Files:**
- Create: `client/src/routes/Dashboard.jsx`, `client/src/routes/dashboard.css`

- [ ] **Step 1: Implement `Dashboard.jsx`**

```jsx
import { Link, useNavigate } from 'react-router-dom';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Pill, Card, ProgressMeter } from '../components/ui.jsx';
import { percent, completedCount, sessionComplete, currentSession } from '../lib/curriculum.js';
import { useState } from 'react';
import './dashboard.css';

export default function Dashboard() {
  const { curriculum, progress } = useCurriculum();
  const navigate = useNavigate();
  const [queueOpen, setQueueOpen] = useState(false);

  const done = Object.keys(progress.completed).length;
  const total = curriculum.exercises.length;
  const current = currentSession(curriculum.sessions, progress.completed, '');
  const started = done > 0;
  const queue = curriculum.sessions.filter((s) => !sessionComplete(s, progress.completed));
  const shownQueue = queueOpen ? queue : queue.slice(0, 8);

  return (
    <AppShell breadcrumb={<span className="here">Dashboard</span>}>
      <section className="continue-card card">
        <div className="continue-copy">
          <span className="kicker">{started ? 'Continue' : 'Start here'}</span>
          <h1>{current.title}</h1>
          <p>Week {current.week}, session {current.day} · {current.durationMinutes} min · {completedCount(current.exerciseIds, progress.completed)}/{current.exerciseIds.length} solved</p>
          <p className="goal">{current.goal}</p>
          <Button variant="primary" onClick={() => navigate(`/session/${current.id}`)}>
            {started ? 'Continue session' : 'Start week 1'}
          </Button>
        </div>
        <div className="continue-stats">
          <ProgressMeter value={percent(done, total)} label="Course progress" />
          <div className="stat-row">
            <div><strong>{done}</strong><span>exercises done</span></div>
            <div><strong>{curriculum.stats.totalSessions}</strong><span>sessions</span></div>
            <div><strong>{curriculum.stats.totalWeeks}</strong><span>weeks</span></div>
          </div>
        </div>
      </section>

      <section id="weeks" className="dash-section">
        <h2>Course map</h2>
        <div className="week-grid">
          {curriculum.weeks.map((week) => {
            const sessions = week.sessions.map((id) => curriculum.sessions.find((s) => s.id === id));
            const ids = sessions.flatMap((s) => s.exerciseIds);
            const pct = percent(completedCount(ids, progress.completed), ids.length);
            const isCurrent = current.week === week.number;
            return (
              <Link key={week.number} to={`/session/${week.sessions[0]}`}
                className={`week-card ${pct === 100 ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                <span className="week-num">W{week.number}</span>
                <strong>{week.title}</strong>
                <div className="meter-track"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="dash-section">
        <h2>Up next</h2>
        <div className="queue">
          {shownQueue.map((s) => (
            <Link key={s.id} to={`/session/${s.id}`} className="queue-row">
              <Pill>W{s.week}.{s.day}</Pill>
              <div className="queue-copy"><strong>{s.title}</strong><span>{s.goal}</span></div>
              <Pill tone={completedCount(s.exerciseIds, progress.completed) ? 'brand' : 'neutral'}>
                {completedCount(s.exerciseIds, progress.completed)}/{s.exerciseIds.length}
              </Pill>
            </Link>
          ))}
        </div>
        {queue.length > 8 ? (
          <Button variant="ghost" onClick={() => setQueueOpen(!queueOpen)}>
            {queueOpen ? 'Show fewer' : `Show all ${queue.length} remaining sessions`}
          </Button>
        ) : null}
      </section>
    </AppShell>
  );
}
```

- [ ] **Step 2: Write `dashboard.css`**

```css
.kicker { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand); }
.continue-card { display: grid; grid-template-columns: 1fr 280px; gap: var(--s-6); padding: var(--s-6); }
.continue-copy h1 { font-size: var(--text-2xl); margin: var(--s-1) 0 var(--s-2); }
.continue-copy .goal { color: var(--ink-dim); max-width: 60ch; margin-bottom: var(--s-4); }
.continue-stats { display: flex; flex-direction: column; gap: var(--s-4); justify-content: center; border-left: 1px solid var(--line); padding-left: var(--s-6); }
.stat-row { display: flex; gap: var(--s-5); }
.stat-row div { display: flex; flex-direction: column; }
.stat-row strong { font-family: var(--font-display); font-size: var(--text-xl); color: var(--ink-strong); }
.stat-row span { font-size: var(--text-xs); color: var(--ink-dim); }

.dash-section { margin-top: var(--s-6); }
.dash-section h2 { font-size: var(--text-lg); margin-bottom: var(--s-3); }

.week-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-3); }
.week-card {
  display: flex; flex-direction: column; gap: var(--s-2);
  background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4); color: var(--ink); transition: border-color var(--ease);
}
.week-card:hover { border-color: var(--line-strong); text-decoration: none; }
.week-card.current { border-color: var(--brand); }
.week-card.done .week-num { color: var(--ok); }
.week-num { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }
.week-card strong { color: var(--ink-strong); font-size: var(--text-sm); line-height: 1.35; }

.queue { display: flex; flex-direction: column; gap: var(--s-2); margin-bottom: var(--s-3); }
.queue-row {
  display: flex; align-items: center; gap: var(--s-4);
  background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4); color: var(--ink); transition: border-color var(--ease);
}
.queue-row:hover { border-color: var(--line-strong); text-decoration: none; }
.queue-copy { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.queue-copy strong { color: var(--ink-strong); font-size: var(--text-sm); }
.queue-copy span { color: var(--ink-dim); font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

@media (max-width: 860px) {
  .continue-card { grid-template-columns: 1fr; }
  .continue-stats { border-left: none; padding-left: 0; }
}
```

- [ ] **Step 3: Verify in dev** — dashboard renders with real curriculum; zero-progress state says "Start week 1"; week cards link into sessions.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes && git commit -m "feat: dashboard route with continue card, week map, session queue"
```

---

### Task 8: SqlEditor component (CodeMirror)

**Files:**
- Create: `client/src/components/SqlEditor.jsx`

- [ ] **Step 1: Implement**

```jsx
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView } from '@codemirror/view';

const theme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-strong)', fontSize: '0.9rem', borderRadius: 'var(--r-md)' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '12px 0', caretColor: 'var(--brand)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-2)', color: 'var(--ink-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink-dim)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--brand-soft) !important' }
}, { dark: true });

export function SqlEditor({ value, onChange, onSubmit, placeholder, minHeight = '140px' }) {
  const submitKeymap = EditorView.domEventHandlers({
    keydown: (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        onSubmit?.();
        return true;
      }
      return false;
    }
  });
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={minHeight}
        theme={theme}
        extensions={[sql(), submitKeymap]}
        basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: true, highlightActiveLine: true }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify** — temporarily drop `<SqlEditor value="SELECT 1;" onChange={() => {}} />` into Dashboard, confirm syntax highlighting + Ctrl/Cmd+Enter fires onSubmit, then remove it.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/SqlEditor.jsx && git commit -m "feat: CodeMirror SQL editor themed from tokens"
```

---

### Task 9: Workbench route (`/session/:sessionId/:exerciseId?`)

The core screen. Split into sub-components in one folder.

**Files:**
- Create: `client/src/routes/Session.jsx`, `client/src/routes/session/ExerciseRail.jsx`, `client/src/routes/session/Workbench.jsx`, `client/src/routes/session/LearnAccordion.jsx`, `client/src/routes/session/OutputDock.jsx`, `client/src/routes/session/SchemaExplorer.jsx`, `client/src/routes/session/session.css`

- [ ] **Step 1: `Session.jsx`** — resolves session/exercise from params, renders shell + layout:

```jsx
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState } from '../components/ui.jsx';
import { ExerciseRail } from './session/ExerciseRail.jsx';
import { Workbench } from './session/Workbench.jsx';
import './session/session.css';

export default function Session() {
  const { sessionId, exerciseId } = useParams();
  const { curriculum, progress, setActiveSessionId } = useCurriculum();
  const navigate = useNavigate();

  const session = curriculum.sessions.find((s) => s.id === sessionId);
  useEffect(() => { if (session) setActiveSessionId(session.id); }, [session, setActiveSessionId]);

  if (!session) return <AppShell breadcrumb={<span className="here">Session</span>}><EmptyState title="Session not found" /></AppShell>;

  const firstIncomplete = session.exerciseIds.find((id) => !progress.completed[id]) || session.exerciseIds[0];
  const activeId = exerciseId && session.exerciseIds.includes(exerciseId) ? exerciseId : firstIncomplete;
  const exercise = curriculum.exercises.find((e) => e.id === activeId);

  const goTo = (exId) => navigate(`/session/${session.id}/${exId}`);
  const nextTarget = (() => {
    const i = session.exerciseIds.indexOf(activeId);
    if (i < session.exerciseIds.length - 1) return { label: 'Next exercise', to: `/session/${session.id}/${session.exerciseIds[i + 1]}` };
    const nextSession = curriculum.sessions[session.sequence]; // sequence is 1-based
    return nextSession ? { label: 'Next session', to: `/session/${nextSession.id}` } : null;
  })();

  return (
    <AppShell breadcrumb={<>
      <Link to="/">Dashboard</Link><span className="sep">/</span>
      <span>Week {session.week}</span><span className="sep">/</span>
      <span className="here">{session.title}</span>
    </>}>
      <div className="session-head">
        <div>
          <span className="kicker">Week {session.week} · Session {session.day} · {session.durationMinutes} min</span>
          <h1>{session.title}</h1>
          <p className="goal">{session.goal}</p>
        </div>
      </div>
      <div className="session-layout">
        <ExerciseRail session={session} activeId={activeId} onSelect={goTo} />
        <Workbench key={exercise.id} exercise={exercise} session={session} nextTarget={nextTarget} />
      </div>
    </AppShell>
  );
}
```

(`key={exercise.id}` intentionally remounts the workbench per exercise so per-exercise state resets.)

- [ ] **Step 2: `ExerciseRail.jsx`**

```jsx
import { useCurriculum } from '../../state/CurriculumContext.jsx';

export function ExerciseRail({ session, activeId, onSelect }) {
  const { curriculum, progress } = useCurriculum();
  return (
    <aside className="ex-rail">
      {session.exerciseIds.map((id, i) => {
        const ex = curriculum.exercises.find((e) => e.id === id);
        const done = Boolean(progress.completed[id]);
        return (
          <button key={id} onClick={() => onSelect(id)}
            className={`ex-rail-item ${id === activeId ? 'active' : ''} ${done ? 'done' : ''}`}>
            <span className="ex-idx">{done ? '✓' : i + 1}</span>
            <span className="ex-copy"><strong>{ex.title}</strong><em>{ex.database || 'verbal'}</em></span>
          </button>
        );
      })}
    </aside>
  );
}
```

- [ ] **Step 3: `LearnAccordion.jsx`** — the info-overload fix. Open by default only if the exercise has never been attempted or completed:

```jsx
import { useState } from 'react';

const SECTIONS = [
  ['concept', 'What you are learning'],
  ['whyItMatters', 'Why it matters'],
  ['mentalModel', 'Mental model'],
  ['workedExample', 'Worked example']
];

export function LearnAccordion({ exercise, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = SECTIONS.some(([k]) => exercise[k]) ||
    (exercise.steps || []).length || (exercise.commonMistakes || []).length || exercise.interviewAngle;
  if (!hasContent) return null;
  return (
    <section className={`learn ${open ? 'open' : ''}`}>
      <button className="learn-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Learn this first</span><span className="learn-chevron">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="learn-body">
          {SECTIONS.map(([key, label]) => exercise[key]
            ? <div key={key} className="learn-block"><span>{label}</span><p>{exercise[key]}</p></div> : null)}
          {(exercise.steps || []).length ? (
            <div className="learn-block"><span>How to approach it</span>
              <ol>{exercise.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>) : null}
          {(exercise.commonMistakes || []).length ? (
            <div className="learn-block warn"><span>Common mistakes</span>
              <ul>{exercise.commonMistakes.map((s, i) => <li key={i}>{s}</li>)}</ul></div>) : null}
          {exercise.interviewAngle
            ? <div className="learn-block brand"><span>Interview angle</span><p>{exercise.interviewAngle}</p></div> : null}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: `Workbench.jsx`** — task, editor, actions, feedback, dock:

```jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurriculum } from '../../state/CurriculumContext.jsx';
import { api } from '../../lib/api.js';
import { markComplete } from '../../lib/progress.js';
import { lessonSlug } from '../../lib/curriculum.js';
import { Button, Pill, Callout } from '../../components/ui.jsx';
import { SqlEditor } from '../../components/SqlEditor.jsx';
import { LearnAccordion } from './LearnAccordion.jsx';
import { OutputDock } from './OutputDock.jsx';

export function Workbench({ exercise, session, nextTarget }) {
  const { progress, updateProgress } = useCurriculum();
  const [sql, setSql] = useState(progress.lastSql[exercise.id] || '');
  const [feedback, setFeedback] = useState(null); // {tone, title, message}
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  const attempted = Boolean(progress.attempts[exercise.id] || progress.completed[exercise.id]);
  const done = Boolean(progress.completed[exercise.id]);

  function persistSql(value) {
    setSql(value);
    updateProgress((p) => { p.lastSql[exercise.id] = value; });
  }

  async function runCheck() {
    const trimmed = sql.trim();
    if (!trimmed) {
      setFeedback({ tone: 'warn', title: 'Type a query first', message: 'Use the task statement to decide your SELECT, FROM, filters, sort, and limit.' });
      return;
    }
    setChecking(true);
    setFeedback({ tone: 'info', title: 'Checking…', message: 'Running your SQL and the model answer on the same database.' });
    updateProgress((p) => { p.attempts[exercise.id] = (p.attempts[exercise.id] || 0) + 1; });
    try {
      const body = await api.check(exercise.database, trimmed, exercise.expectedSql);
      setResult(body.result || null);
      if (body.correct) {
        updateProgress((p) => markComplete(p, exercise.id));
        setFeedback({ tone: 'ok', title: body.message, message: body.why });
      } else {
        setFeedback({
          tone: body.feedbackType === 'error' ? 'err' : 'warn',
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Close, but not correct yet',
          message: body.hint || body.message
        });
      }
    } catch (error) {
      setFeedback({ tone: 'err', title: 'The checker could not run', message: `${error.message}${error.hint ? ` — ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return (
    <article className="workbench">
      <div className="wb-meta">
        <Pill tone="brand">{exercise.stage}</Pill>
        <Pill>{exercise.moduleTitle}</Pill>
        {exercise.database ? <Pill tone="info">{exercise.database}</Pill> : <Pill>verbal</Pill>}
        <Pill tone={exercise.checkable ? 'ok' : 'neutral'}>{exercise.checkable ? 'graded' : 'manual'}</Pill>
        {done ? <Pill tone="ok">solved</Pill> : null}
        <Link className="wb-lesson-link" to={`/lessons/${lessonSlug(exercise.sourceFile)}`}>Open lesson ↗</Link>
      </div>
      <h2>{exercise.title}</h2>
      <p className="wb-task">{exercise.task}</p>
      <LearnAccordion exercise={exercise} defaultOpen={!attempted} />
      <SqlEditor value={sql} onChange={persistSql} onSubmit={runCheck}
        placeholder={(exercise.expectedSql || '').split('\n')[0] || 'SELECT ...'} />
      <div className="wb-actions">
        <Button variant="primary" onClick={runCheck} disabled={!exercise.checkable || checking}>
          {checking ? 'Checking…' : 'Run & check  ⌘⏎'}
        </Button>
        {exercise.hint ? <Button onClick={() => setHintShown(true)} disabled={hintShown}>Hint</Button> : null}
        <Button onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? 'Hide answer' : 'Reveal answer'}</Button>
        {nextTarget ? <Link to={nextTarget.to} className="btn btn-secondary wb-next">{nextTarget.label} →</Link> : null}
      </div>
      {hintShown && exercise.hint ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}
      {feedback ? (
        <Callout tone={feedback.tone === 'ok' ? 'tip' : feedback.tone === 'err' ? 'warn' : 'info'} title={feedback.title}>
          {feedback.message}
        </Callout>
      ) : null}
      {answerOpen ? <pre className="answer">{exercise.expectedSql || exercise.solutionNote || 'This exercise is manually reviewed.'}</pre> : null}
      <OutputDock exercise={exercise} result={result} />
    </article>
  );
}
```

- [ ] **Step 5: `OutputDock.jsx`** — Results / Schema tabs:

```jsx
import { useState } from 'react';
import { Tabs } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { SchemaExplorer } from './SchemaExplorer.jsx';

export function OutputDock({ exercise, result }) {
  const hasDb = Boolean(exercise.database);
  const [tab, setTab] = useState(result ? 'results' : hasDb ? 'schema' : 'results');
  return (
    <section className="dock">
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'results', label: 'Results' },
        { id: 'schema', label: hasDb ? `Schema · ${exercise.database}` : 'Schema', disabled: !hasDb }
      ]} />
      <div className="dock-panel">
        {tab === 'schema'
          ? <SchemaExplorer database={exercise.database} />
          : result
            ? <DataTable columns={result.columns || []} rows={result.rows || []} />
            : <div className="table-note">Run your SQL to see rows here.</div>}
      </div>
    </section>
  );
}
```

Wire `result` → switch to results tab with an effect inside `OutputDock`:

```jsx
import { useEffect } from 'react';
// inside OutputDock, after useState:
useEffect(() => { if (result) setTab('results'); }, [result]);
```

- [ ] **Step 6: `SchemaExplorer.jsx`** — fetches schema + previews with plain component state:

```jsx
import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Callout } from '../../components/ui.jsx';

export function SchemaExplorer({ database }) {
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    let alive = true;
    setSchema(null); setError(null); setActiveTable(null);
    api.schema(database)
      .then((body) => { if (!alive) return; setSchema(body); if (body.tables?.length) setActiveTable(body.tables[0]); })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [database]);

  useEffect(() => {
    if (!activeTable) return;
    let alive = true;
    setPreview(null); setPreviewError(null);
    api.tablePreview(database, activeTable.schema, activeTable.name)
      .then((body) => alive && setPreview(body))
      .catch((e) => alive && setPreviewError(e));
    return () => { alive = false; };
  }, [database, activeTable]);

  if (error) return <Callout tone="warn" title={`Could not load ${database}`}>{error.message}{error.hint ? ` — ${error.hint}` : ''}</Callout>;
  if (!schema) return <div className="table-note">Loading {database} tables…</div>;
  if (!schema.tables.length) return <div className="table-note">{database} has no user tables.</div>;

  return (
    <div className="schema-explorer">
      <div className="table-strip">
        {schema.tables.map((t) => (
          <button key={`${t.schema}.${t.name}`}
            className={`table-chip ${activeTable && t.name === activeTable.name && t.schema === activeTable.schema ? 'active' : ''}`}
            onClick={() => setActiveTable(t)}>
            <strong>{t.name}</strong>
            <span>{Number.isFinite(Number(t.estimatedRows)) ? `~${Number(t.estimatedRows).toLocaleString()}` : '?'} rows</span>
          </button>
        ))}
      </div>
      {activeTable ? (
        <div className="schema-detail">
          <div className="column-list">
            {activeTable.columns.map((c) => (
              <div key={c.name} className="column-row">
                <strong>{c.name}</strong>
                <span>{c.type}{c.nullable ? '' : ' · required'}</span>
                <span className="key-badges">
                  {c.isPrimaryKey ? <em>PK</em> : null}
                  {c.foreignKey ? <em>FK → {c.foreignKey.table}.{c.foreignKey.column}</em> : null}
                </span>
              </div>
            ))}
          </div>
          <div className="preview-pane">
            {previewError ? <Callout tone="warn" title="Preview failed">{previewError.message}</Callout>
              : preview ? <DataTable columns={preview.columns || []} rows={preview.rows || []} maxRows={6} />
              : <div className="table-note">Loading sample rows…</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: `session.css`**

```css
.session-head h1 { font-size: var(--text-2xl); margin: var(--s-1) 0 var(--s-1); }
.session-head .goal { color: var(--ink-dim); max-width: 70ch; }
.session-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--s-5); margin-top: var(--s-5); align-items: start; }

.ex-rail { display: flex; flex-direction: column; gap: var(--s-2); position: sticky; top: calc(var(--topbar-h) + var(--s-4)); }
.ex-rail-item {
  display: flex; gap: var(--s-3); align-items: center; text-align: left; cursor: pointer;
  background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: var(--s-2) var(--s-3); color: var(--ink); transition: border-color var(--ease);
}
.ex-rail-item:hover { border-color: var(--line-strong); }
.ex-rail-item.active { border-color: var(--brand); background: var(--brand-soft); }
.ex-rail-item.done .ex-idx { background: var(--ok-soft); color: var(--ok); border-color: transparent; }
.ex-idx {
  flex: none; width: 22px; height: 22px; display: grid; place-items: center;
  font-family: var(--font-mono); font-size: var(--text-xs);
  border: 1px solid var(--line); border-radius: 50%; color: var(--ink-dim);
}
.ex-copy { display: flex; flex-direction: column; min-width: 0; }
.ex-copy strong { font-size: var(--text-sm); color: var(--ink-strong); font-weight: 600; line-height: 1.3; }
.ex-copy em { font-style: normal; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }

.workbench { display: flex; flex-direction: column; gap: var(--s-4); min-width: 0; }
.wb-meta { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
.wb-lesson-link { margin-left: auto; font-family: var(--font-mono); font-size: var(--text-xs); }
.workbench h2 { font-size: var(--text-xl); }
.wb-task { color: var(--ink-strong); font-size: var(--text-md); max-width: 75ch; margin: 0; }
.wb-actions { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
.wb-next { margin-left: auto; display: inline-flex; align-items: center; text-decoration: none; }
.answer { margin: 0; }

.learn { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); }
.learn-toggle {
  width: 100%; display: flex; justify-content: space-between; align-items: center;
  background: none; border: none; cursor: pointer; color: var(--ink-strong);
  font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase;
  padding: var(--s-3) var(--s-4);
}
.learn-chevron { color: var(--brand); font-size: var(--text-md); }
.learn-body { padding: 0 var(--s-4) var(--s-4); display: flex; flex-direction: column; gap: var(--s-3); border-top: 1px solid var(--line); padding-top: var(--s-4); }
.learn-block > span { display: block; font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; color: var(--info); margin-bottom: 2px; }
.learn-block.warn > span { color: var(--err); }
.learn-block.brand > span { color: var(--brand); }
.learn-block p, .learn-block ol, .learn-block ul { margin: 0; font-size: var(--text-sm); color: var(--ink); }
.learn-block ol, .learn-block ul { padding-left: 1.2rem; }

.dock { margin-top: var(--s-2); }
.dock-panel { padding-top: var(--s-3); max-height: 380px; overflow: auto; }
.schema-explorer { display: flex; flex-direction: column; gap: var(--s-3); }
.table-strip { display: flex; gap: var(--s-2); overflow-x: auto; padding-bottom: var(--s-1); }
.table-chip {
  flex: none; display: flex; flex-direction: column; align-items: flex-start; cursor: pointer;
  background: var(--surface-1); border: 1px solid var(--line); border-radius: var(--r-md);
  padding: var(--s-1) var(--s-3); color: var(--ink);
}
.table-chip.active { border-color: var(--brand); background: var(--brand-soft); }
.table-chip strong { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-strong); }
.table-chip span { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); }
.schema-detail { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.column-list { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); overflow: auto; max-height: 260px; }
.column-row { display: flex; flex-direction: column; padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--line); }
.column-row:last-child { border-bottom: none; }
.column-row strong { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--ink-strong); }
.column-row span { font-size: var(--text-xs); color: var(--ink-dim); }
.key-badges em { font-style: normal; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--brand); margin-right: var(--s-2); }

@media (max-width: 1000px) {
  .session-layout { grid-template-columns: 1fr; }
  .ex-rail { position: static; flex-direction: row; overflow-x: auto; }
  .ex-rail-item { flex: none; max-width: 240px; }
  .schema-detail { grid-template-columns: 1fr; }
}
```

- [ ] **Step 8: Verify end-to-end in dev** (needs Postgres running): open a session; confirm — rail selection navigates; Learn accordion open on unattempted exercise, collapsed on a completed one; Run & check grades correctly and flips the pill to "solved"; wrong SQL shows the warn callout with server hint; schema tab lists tables, clicking one loads columns + sample rows; Ctrl+Enter runs.

- [ ] **Step 9: Commit**

```bash
git add client/src/routes && git commit -m "feat: workbench route with exercise rail, learn accordion, output dock, schema explorer"
```

---

### Task 10: Lesson extraction script + Lesson route

**Files:**
- Create: `scripts/extract-lessons.js`
- Create: `client/src/lessons/fragments/` (generated, committed)
- Create: `client/src/routes/Lesson.jsx`, `client/src/routes/lesson.css`
- Modify: root `package.json` (build runs extraction first)
- Test: `client/src/routes/Lesson.test.jsx` (link rewriting + checkbox wiring)

- [ ] **Step 1: Write `scripts/extract-lessons.js`**

Extracts the content between `<div class="wrap">` and the closing `</div>` before `<script`/`</body>`, strips the site header/nav, and writes fragments. No HTML parser dependency — the pages are our own, structurally uniform:

```js
const fs = require('node:fs');
const path = require('node:path');

const contentDir = path.join(__dirname, '..', 'content');
const outDir = path.join(__dirname, '..', 'client', 'src', 'lessons', 'fragments');
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.html'));
for (const file of files) {
  const html = fs.readFileSync(path.join(contentDir, file), 'utf8');
  const start = html.indexOf('<div class="wrap">');
  if (start === -1) throw new Error(`${file}: no <div class="wrap"> found`);
  const afterStart = start + '<div class="wrap">'.length;
  // fragment ends at the last </div> before the first <script> tag after .wrap (or </body>)
  const scriptIdx = html.indexOf('<script', afterStart);
  const endSearchLimit = scriptIdx === -1 ? html.indexOf('</body>') : scriptIdx;
  const end = html.lastIndexOf('</div>', endSearchLimit);
  if (end === -1 || end <= afterStart) throw new Error(`${file}: could not find closing </div>`);
  const fragment = html.slice(afterStart, end).trim();
  const slug = file.replace(/\.html$/, '');
  fs.writeFileSync(path.join(outDir, `${slug}.html`), fragment + '\n');
  console.log(`extracted ${slug} (${fragment.length} bytes)`);
}
```

- [ ] **Step 2: Run it and inspect**

Run: `node scripts/extract-lessons.js`
Expected: 10 fragments written. Spot-check `client/src/lessons/fragments/m1-fundamentals.html` starts with `<p class="eyebrow">` and ends before `</div></body>` content — no `<header>`, no `<script>`.

- [ ] **Step 3: Add npm hook so fragments never go stale**

Root `package.json`:

```json
"scripts": {
  "extract-lessons": "node scripts/extract-lessons.js",
  "build": "node scripts/extract-lessons.js && npm --prefix client run build"
}
```

- [ ] **Step 4: Failing tests for lesson behaviors** (`client/src/routes/Lesson.test.jsx`)

```jsx
import { describe, it, expect, beforeEach } from 'vitest';
import { rewriteLessonLinks } from './lessonUtils.js';

describe('rewriteLessonLinks', () => {
  it('rewrites legacy lesson hrefs to router paths', () => {
    const div = document.createElement('div');
    div.innerHTML = '<a href="m2-aggregation.html">next</a><a href="index.html">home</a><a href="https://x.test/a.html">ext</a><a href="#anchor">jump</a>';
    rewriteLessonLinks(div);
    expect(div.querySelectorAll('a')[0].getAttribute('href')).toBe('#/lessons/m2-aggregation');
    expect(div.querySelectorAll('a')[1].getAttribute('href')).toBe('#/');
    expect(div.querySelectorAll('a')[2].getAttribute('href')).toBe('https://x.test/a.html');
    expect(div.querySelectorAll('a')[3].getAttribute('href')).toBe('#anchor');
  });
});
```

- [ ] **Step 5: Run to verify failure**, then implement `client/src/routes/lessonUtils.js`

```js
const LESSON_FILES = [
  'schemas', 'm1-fundamentals', 'm2-aggregation', 'm3-joins', 'm4-transformation',
  'm5-subqueries-ctes', 'm6-window-functions', 'm7-interview-patterns', 'm8-performance', 'mock-interviews'
];

export function rewriteLessonLinks(root) {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return;
    const clean = href.replace(/\.html$/, '');
    if (clean === 'index') { a.setAttribute('href', '#/'); return; }
    if (LESSON_FILES.includes(clean)) a.setAttribute('href', `#/lessons/${clean}`);
  });
}
```

(Hash hrefs work with HashRouter without interception — the browser updates the hash, the router reacts.)

- [ ] **Step 6: Implement `Lesson.jsx`**

Fragments are imported eagerly via `import.meta.glob` with `?raw`. Checkbox wiring uses the legacy `data-page` convention: the legacy pages used `data-page="m1"` etc. — derive it the same way (`m1-fundamentals` → `m1`, `schemas` → `m0`, `mock-interviews` → `mocks`); confirm each page's actual `data-page` attribute in `content/*.html` during implementation and encode the mapping in the manifest (add a `page` field to `LESSONS` in `manifest.js`, e.g. `{ slug: 'm1-fundamentals', page: 'm1', ... }`).

```jsx
import { useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState } from '../components/ui.jsx';
import { LESSONS } from '../lessons/manifest.js';
import { rewriteLessonLinks } from './lessonUtils.js';
import { isLessonBoxChecked, setLessonBox } from '../lib/progress.js';
import { Link } from 'react-router-dom';
import './lesson.css';

const fragments = import.meta.glob('../lessons/fragments/*.html', { query: '?raw', import: 'default', eager: true });

export default function Lesson() {
  const { slug } = useParams();
  const meta = LESSONS.find((l) => l.slug === slug);
  const html = fragments[`../lessons/fragments/${slug}.html`];
  const bodyRef = useRef(null);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !meta) return;
    rewriteLessonLinks(root);
    // progress checkboxes — legacy keys
    root.querySelectorAll('input.done[data-id]').forEach((cb) => {
      cb.checked = isLessonBoxChecked(meta.page, cb.dataset.id);
      cb.onchange = () => setLessonBox(meta.page, cb.dataset.id, cb.checked);
    });
    // table of contents from h2s
    const heads = [...root.querySelectorAll('h2')].map((h, i) => {
      if (!h.id) h.id = `sec-${i}`;
      return { id: h.id, text: h.textContent };
    });
    setToc(heads);
  }, [slug, meta]);

  if (!meta || !html) {
    return <AppShell breadcrumb={<span className="here">Lesson</span>}><EmptyState title="Lesson not found" /></AppShell>;
  }

  return (
    <AppShell breadcrumb={<>
      <Link to="/">Dashboard</Link><span className="sep">/</span>
      <span>Lessons</span><span className="sep">/</span>
      <span className="here">{meta.title}</span>
    </>}>
      <div className="lesson-layout">
        <article ref={bodyRef} className="lesson-body" dangerouslySetInnerHTML={{ __html: html }} />
        {toc.length ? (
          <nav className="lesson-toc">
            <span className="toc-label">On this page</span>
            {toc.map((t) => <a key={t.id} href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{t.text}</a>)}
          </nav>
        ) : null}
      </div>
    </AppShell>
  );
}
```

Note: TOC links use `preventDefault` + `scrollIntoView` because bare `#id` hrefs fight HashRouter.

- [ ] **Step 7: Write `lesson.css`** — restyle the legacy class vocabulary with tokens (the fragment classes: `.eyebrow`, `.lede`, `.note/.warn/.tip` + `.tag`, `.problem` + `.phead/.pid/.db/.pbody`, `.chip.warmup/.core/.interview/.hard`, `.done`, `details.sol/.hint` + `.sbody`, `.session/.shead`, tables):

```css
.lesson-layout { display: grid; grid-template-columns: minmax(0, 1fr) 210px; gap: var(--s-6); align-items: start; }
.lesson-toc { position: sticky; top: calc(var(--topbar-h) + var(--s-4)); display: flex; flex-direction: column; gap: var(--s-1); font-size: var(--text-sm); border-left: 1px solid var(--line); padding-left: var(--s-4); }
.toc-label { font-family: var(--font-mono); font-size: var(--text-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-faint); margin-bottom: var(--s-1); }
.lesson-toc a { color: var(--ink-dim); line-height: 1.4; padding: 2px 0; }
.lesson-toc a:hover { color: var(--ink-strong); text-decoration: none; }
@media (max-width: 1000px) { .lesson-layout { grid-template-columns: 1fr; } .lesson-toc { display: none; } }

.lesson-body { min-width: 0; }
.lesson-body h1 { font-size: var(--text-2xl); margin: var(--s-1) 0 var(--s-3); }
.lesson-body h2 { font-size: var(--text-xl); margin: var(--s-7) 0 var(--s-3); padding-top: var(--s-4); border-top: 1px solid var(--line); }
.lesson-body h3 { font-size: var(--text-lg); margin: var(--s-5) 0 var(--s-2); }
.lesson-body .eyebrow { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand); margin: 0 0 var(--s-1); }
.lesson-body .lede { color: var(--ink-dim); font-size: 1.05rem; max-width: 64ch; }

.lesson-body .note, .lesson-body .warn, .lesson-body .tip {
  border: 1px solid var(--line); border-left: 3px solid var(--info);
  background: var(--surface-1); border-radius: var(--r-md);
  padding: var(--s-3) var(--s-4); margin: var(--s-4) 0; font-size: var(--text-sm);
}
.lesson-body .warn { border-left-color: var(--err); }
.lesson-body .tip { border-left-color: var(--ok); }
.lesson-body .tag { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.08em; text-transform: uppercase; display: block; margin-bottom: var(--s-1); color: var(--info); }
.lesson-body .warn .tag { color: var(--err); }
.lesson-body .tip .tag { color: var(--ok); }

.lesson-body table { border-collapse: collapse; width: 100%; margin: var(--s-4) 0; font-size: var(--text-sm); }
.lesson-body th, .lesson-body td { border: 1px solid var(--line); padding: var(--s-2) var(--s-3); text-align: left; vertical-align: top; }
.lesson-body th { background: var(--surface-2); font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-dim); }

.lesson-body .problem { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); margin: var(--s-4) 0; overflow: hidden; }
.lesson-body .phead { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-4); border-bottom: 1px solid var(--line); background: var(--surface-2); }
.lesson-body .pid { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--brand); }
.lesson-body .db { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-dim); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 1px 7px; }
.lesson-body .pbody { padding: var(--s-2) var(--s-4) var(--s-4); }
.lesson-body .chip { font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.05em; text-transform: uppercase; border-radius: var(--r-sm); padding: 2px var(--s-2); margin-left: auto; }
.lesson-body .chip.warmup { background: var(--ok-soft); color: var(--ok); }
.lesson-body .chip.core { background: var(--info-soft); color: var(--info); }
.lesson-body .chip.interview { background: var(--brand-soft); color: var(--brand); }
.lesson-body .chip.hard { background: var(--err-soft); color: var(--err); }
.lesson-body .done { margin-left: var(--s-2); accent-color: var(--ok); width: 15px; height: 15px; cursor: pointer; }

.lesson-body details.sol, .lesson-body details.hint { margin-top: var(--s-3); border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-2); }
.lesson-body details.hint { border-style: dashed; background: transparent; }
.lesson-body details summary { cursor: pointer; font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; padding: var(--s-2) var(--s-4); user-select: none; }
.lesson-body details.sol summary { color: var(--ok); }
.lesson-body details.hint summary { color: var(--brand); }
.lesson-body details[open] summary { border-bottom: 1px solid var(--line); }
.lesson-body details .sbody { padding: var(--s-1) var(--s-4) var(--s-3); font-size: var(--text-sm); }
.lesson-body details.sol pre { border: none; background: transparent; padding: var(--s-2) 0; margin: var(--s-1) 0; }

.lesson-body .session { border: 1px solid var(--line); border-radius: var(--r-md); background: var(--surface-1); padding: var(--s-3) var(--s-4); margin: var(--s-3) 0; }
.lesson-body .shead { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--brand); letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: var(--s-1); }
```

- [ ] **Step 8: Run tests + visual check** — `npm --prefix client test` passes; in dev, all 10 lesson routes render styled content; checkboxes persist across reload; inter-lesson links stay in-app; `#done-count` element (if present in a fragment) is inert — acceptable; confirm no raw `<script>` leaked into fragments (extraction cuts before scripts).

- [ ] **Step 9: Commit**

```bash
git add scripts client/src package.json && git commit -m "feat: lesson extraction pipeline and in-app lesson route"
```

---

### Task 11: Databases route (schema browser + scratch query)

**Files:**
- Create: `client/src/routes/Databases.jsx`

- [ ] **Step 1: Implement `Databases.jsx`** (reuses SchemaExplorer + SqlEditor + DataTable)

```jsx
import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell.jsx';
import { api } from '../lib/api.js';
import { SchemaExplorer } from './session/SchemaExplorer.jsx';
import { SqlEditor } from '../components/SqlEditor.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Button, Callout, Pill } from '../components/ui.jsx';

export default function Databases() {
  const [databases, setDatabases] = useState([]);
  const [active, setActive] = useState('');
  const [sql, setSql] = useState(() => localStorage.getItem('sqlm:runner:sql') || 'SELECT * FROM ');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.databases().then((body) => {
      setDatabases(body.databases || []);
      const saved = localStorage.getItem('sqlm:runner:db');
      setActive(saved && body.databases.includes(saved) ? saved : body.databases[0] || '');
    }).catch((e) => setError(e));
  }, []);

  async function run() {
    if (!sql.trim() || !active) return;
    localStorage.setItem('sqlm:runner:sql', sql);
    localStorage.setItem('sqlm:runner:db', active);
    setRunning(true); setError(null); setResult(null);
    try { setResult(await api.query(active, sql.trim())); }
    catch (e) { setError(e); }
    finally { setRunning(false); }
  }

  return (
    <AppShell breadcrumb={<span className="here">Databases</span>}>
      <div className="session-head">
        <span className="kicker">Explore</span>
        <h1>Databases</h1>
        <p className="goal">Browse every practice database and run scratch queries against it.</p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-4) 0' }}>
        {databases.map((db) => (
          <button key={db} className={`table-chip ${db === active ? 'active' : ''}`} onClick={() => { setActive(db); setResult(null); }}>
            <strong>{db}</strong>
          </button>
        ))}
      </div>
      {active ? (
        <>
          <SqlEditor value={sql} onChange={setSql} onSubmit={run} placeholder="SELECT * FROM orders LIMIT 20;" />
          <div style={{ display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-3) 0', alignItems: 'center' }}>
            <Button variant="primary" onClick={run} disabled={running}>{running ? 'Running…' : 'Run  ⌘⏎'}</Button>
            {result ? <Pill tone="ok">{result.command} · {result.rowCount} rows · {result.durationMs} ms</Pill> : null}
          </div>
          {error ? <Callout tone="warn" title="Query failed">{error.message}{error.hint ? ` — ${error.hint}` : ''}</Callout> : null}
          {result ? <DataTable columns={result.columns || []} rows={result.rows || []} maxRows={500} /> : null}
          <section className="dock" style={{ marginTop: 'var(--s-5)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--s-3)' }}>Tables in {active}</h2>
            <SchemaExplorer database={active} />
          </section>
        </>
      ) : error ? <Callout tone="warn" title="No databases">{error.message}</Callout> : null}
    </AppShell>
  );
}
```

- [ ] **Step 2: Verify in dev** — database chips switch; scratch query runs and renders; SQL + db persisted under the legacy runner keys; error path shows Postgres message + hint.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/Databases.jsx && git commit -m "feat: databases route with schema browser and scratch query"
```

---

### Task 12: Serve the built client from Express

**Files:**
- Modify: `src/app.js`
- Test: `test/app.test.js` (existing must stay green)

- [ ] **Step 1: Change static serving in `createApp`**

```js
const clientDir = options.clientDir || path.join(__dirname, '..', 'client', 'dist');
```

Replace the static block at the bottom with:

```js
app.use(express.static(contentDir, { extensions: ['html'] }));
app.use(express.static(clientDir));
app.use(express.static(staticDir, { extensions: ['html'] }));
```

(clientDir first for `/` → new app `index.html`; contentDir kept ahead of it only if legacy pages must win — they must NOT: order as shown gives content pages at `/m1-fundamentals.html` for old bookmarks, but the new `index.html` at `/`. During Task 13 the `staticDir` mount is removed.)

Correction — mount order that achieves "new app at `/`, legacy content still reachable":

```js
app.use(express.static(clientDir));                                  // new SPA (index.html at /)
app.use(express.static(contentDir, { extensions: ['html'] }));      // legacy lesson pages by filename
app.use(express.static(staticDir, { extensions: ['html'] }));       // legacy root assets (styles.css, shared.js) — removed in Task 13
```

- [ ] **Step 2: Build and verify production serving**

Run: `npm run build && npm start`, open `http://127.0.0.1:3000/`
Expected: the new React app loads (not the legacy cockpit). `http://127.0.0.1:3000/m1-fundamentals.html` still shows the legacy page (transition safety). All `/api/*` endpoints work same-origin.

- [ ] **Step 3: Run server tests** — `node --test test/*.test.js` → app/curriculum/query/db-config pass; `ui-shell` still passes because legacy files still exist.

- [ ] **Step 4: Commit**

```bash
git add src/app.js && git commit -m "feat: serve built React client from Express"
```

---

### Task 13: Remove legacy front end + replace ui-shell tests

Only after Task 14's verification checklist passes (do 14 first if anything feels unverified — the tasks are ordered this way so the deletion commit is trivially revertable).

**Files:**
- Delete: `app.js`, `app.css`, `styles.css` (root), `shared.js`, `index.html` (root)
- Modify: `src/app.js` (drop the `staticDir` mount), `content/*.html` (strip dead references), `test/ui-shell.test.js` (rewrite)

- [ ] **Step 1: Rewrite `test/ui-shell.test.js`** to guard the new architecture:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');

test('legacy front-end files are gone', () => {
  ['app.js', 'app.css', 'styles.css', 'shared.js', 'index.html'].forEach((file) => {
    assert.equal(fs.existsSync(path.join(rootDir, file)), false, `${file} should be deleted`);
  });
});

test('client design system exists with core tokens', () => {
  const tokens = fs.readFileSync(path.join(rootDir, 'client', 'src', 'theme', 'tokens.css'), 'utf8');
  ['--bg:', '--surface-1:', '--brand:', '--ok:', '--err:', '--font-mono:'].forEach((token) => {
    assert.match(tokens, new RegExp(token), `${token} should be defined`);
  });
});

test('client preserves legacy localStorage keys', () => {
  const progress = fs.readFileSync(path.join(rootDir, 'client', 'src', 'lib', 'progress.js'), 'utf8');
  assert.match(progress, /sqlm:product-progress:v1/);
  assert.match(progress, /sqlm:product-active-session:v1/);
});

test('lesson content lives in content/ and fragments are generated', () => {
  const content = fs.readdirSync(path.join(rootDir, 'content')).filter((f) => f.endsWith('.html'));
  assert.equal(content.length, 10);
  const fragments = fs.readdirSync(path.join(rootDir, 'client', 'src', 'lessons', 'fragments'));
  assert.equal(fragments.filter((f) => f.endsWith('.html')).length, 10);
});
```

- [ ] **Step 2: Delete legacy files**

```bash
git rm app.js app.css styles.css shared.js index.html
```

- [ ] **Step 3: Remove the `staticDir` mount and option from `src/app.js`** — final static section:

```js
app.use(express.static(clientDir));
app.use(express.static(contentDir, { extensions: ['html'] }));
```

Also strip `styles.css`/`shared.js` `<link>`/`<script>` references from `content/*.html` `<head>`s (they are now parsed for curriculum data and served only as legacy-bookmark fallbacks; the fragments never included them). Use a quick sed or manual edit across the 10 files; re-run `node scripts/extract-lessons.js` afterward to confirm fragments unchanged.

- [ ] **Step 4: Full test + build**

Run: `npm test` (server + client suites) and `npm run build && npm start` → `/` serves the new app; spot-check one lesson route and one graded exercise.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat!: remove legacy front end; React client is the only UI"
```

---

### Task 14: Full visual verification pass

Run BEFORE Task 13's deletion. Requires Express (`npm start`) + Postgres up, client built (`npm run build`) — verify against the production serving path at `http://127.0.0.1:3000`, not the Vite dev server.

**Checklist (use browser tooling / preview):**

- [ ] Dashboard: zero-progress state ("Start week 1"), some-progress state, week map highlights current week, queue expands.
- [ ] Sidebar: collapse persists across reload; all lesson links route; Continue deep-links to first incomplete session.
- [ ] Workbench: correct answer → green feedback + solved pill + progress bump in sidebar; wrong-but-valid SQL → warn with checker hint; syntactically broken SQL → error callout with Postgres message; non-checkable (verbal) exercise → Run disabled, answer reveal works.
- [ ] Schema dock: table chips load columns/PK/FK badges and 6 sample rows for at least 2 databases; a stopped Postgres shows the specific error callout, not a blank panel.
- [ ] Lessons: all 10 slugs render; code highlighting spans styled; problem checkboxes persist and match any pre-existing `sqlm:m1:p1-1`-style keys from prior use; hint/solution `<details>` open/close; inter-lesson links stay in-app; TOC scrolls.
- [ ] Databases route: chip switching, scratch query success + failure, row-count/duration pill.
- [ ] Responsive: 1280px and ~800px widths — no horizontal body scroll anywhere.
- [ ] Progress continuity: with real pre-redesign localStorage present, completed counts match what the legacy dashboard showed.

- [ ] **Fix anything found, then commit fixes**

```bash
git add -A && git commit -m "fix: visual verification pass fixes"
```

---

## Task order note

Execute 1 → 12 in order, then **14 (verify) before 13 (delete legacy)**. Task 13 is last on purpose: until it runs, the legacy UI remains a working fallback at its old URLs.

## Self-review results

- **Spec coverage:** content move + server decoupling (T1), scaffold (T2), tokens (T3), lib+tests (T4), primitives (T5), shell/nav/breadcrumbs (T6), dashboard (T7), CodeMirror editor (T8), workbench with Learn accordion + dock + schema explorer (T9), lessons pipeline + route + checkbox/link continuity (T10), databases route with scratch runner (T11), production serving (T12), legacy removal + test replacement (T13), verification incl. error/empty states and progress continuity (T14). Spec's "editor underlines error position" is simplified to feedback-callout position surfacing (position is included on the API error object; inline underline is a stretch goal — noted deviation, acceptable).
- **Placeholder scan:** none — all steps carry code or exact commands.
- **Type consistency:** `useCurriculum()` shape `{curriculum, error, progress, updateProgress, activeSessionId, setActiveSessionId}` used consistently; `LESSONS` manifest gains `page` field in Task 10 (called out); `session.sequence` assumed 1-based (matches legacy `app.js` `sessions[session.sequence]` idiom).
