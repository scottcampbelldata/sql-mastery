# Google sign-in and per-account progress sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared-code progress sync with Google sign-in so each learner's progress follows their account across devices, while anonymous local use keeps working.

**Architecture:** The React client gets a Google ID token from Google Identity Services and posts it to the Express API. The API verifies it, upserts a user keyed by the Google `sub`, and issues its own JWT session token. The client stores that token and sends it as a Bearer header; progress is stored per `sub` in a file-backed store. On first sign-in the client merges its local progress into the account.

**Tech Stack:** TypeScript, Express (compiled with tsc to dist/), React + Vite, `google-auth-library` (verify Google ID token), `jsonwebtoken` (app session JWT), Google Identity Services (frontend button), `node --test` + `vitest`.

## Global Constraints

- No en dashes or em dashes in any file, code, or copy. ASCII hyphen only.
- Server is CommonJS-emitting TypeScript (`module: node16`), run as `node dist/server.js`. Write ES module `import`/`export`, extensionless relative specifiers.
- Client is strict TypeScript + Vite. Relative imports are extensionless.
- Accounts and progress live in a writable file store, never in the read-only teaching PostgreSQL databases.
- The Google `sub` is the user id everywhere (JWT claim, progress key, user-store key). No separate generated id.
- `/api/query`, `/api/check`, `/api/databases`, `/api/schema`, `/api/table-preview`, `/api/curriculum` stay open and unauthenticated. Only `/api/progress` and `/api/me` require a session token.
- Tests never call Google or read a real session secret: inject a fake Google verifier and an explicit secret.
- New env: `GOOGLE_CLIENT_ID`, `SQL_MASTERY_SESSION_SECRET`, optional `SQL_MASTERY_DATA_DIR` (server); `VITE_GOOGLE_CLIENT_ID` (client).

---

## File Structure

Backend (`src/`, `server.ts`, `test/`):
- Create `src/user-store.ts` - persist user records keyed by Google `sub`.
- Create `src/auth-service.ts` - verify Google ID token, issue/verify app session JWT.
- Modify `src/progress-store.ts` - default the data dir from a stable project-root path.
- Modify `src/app.ts` - `requireAuth` middleware; `POST /api/auth/google`, `GET /api/me`; auth-gate `/api/progress`; allow the `Authorization` request header in CORS.
- Modify `server.ts` - construct `userStore` + `authService` + `progressStore` from a shared data dir and pass them to `createApp`.
- Modify `package.json` - add `google-auth-library`, `jsonwebtoken`, `@types/jsonwebtoken`.
- Modify `.env.example` - document the new env vars.
- Create `test/user-store.test.ts`, `test/auth-service.test.ts`; extend `test/app.test.ts`.

Frontend (`client/src/`):
- Modify `client/src/lib/api.ts` - attach the Bearer token; add `auth.google`, `me`, `getProgress`, `putProgress`.
- Modify `client/src/lib/sync.ts` - token-based `syncNow`/`pushIfChanged`; drop the code flow, keep the monotonic merge.
- Create `client/src/state/AuthContext.tsx` - auth state, `signIn`/`signOut`, session restore, periodic push.
- Create `client/src/components/GoogleSignIn.tsx` - render the Google button, call `signIn`.
- Create `client/src/components/AccountMenu.tsx` - signed-out button or signed-in name + sign out (replaces `SyncControl`).
- Modify `client/src/components/AppShell.tsx` - mount `AccountMenu` instead of `SyncControl`.
- Delete `client/src/components/SyncControl.tsx`.
- Modify `client/src/App.tsx` - wrap the tree in `AuthProvider`.
- Extend `client/src/lib/api.test.ts`; create `client/src/state/AuthContext.test.tsx`; adjust `client/src/lib/sync.test.ts`.

---

## Task 1: Backend dependencies, env, and stable data dir

**Files:**
- Modify: `package.json` (dependencies + devDependencies)
- Modify: `.env.example`
- Modify: `src/progress-store.ts:10`

**Interfaces:**
- Produces: `createProgressStore({ dir })` unchanged in shape; only its default dir changes to `path.resolve(process.cwd(), 'data', 'progress')`.

- [ ] **Step 1: Install the backend deps**

Run:
```bash
npm install google-auth-library jsonwebtoken
npm install -D @types/jsonwebtoken
```
Expected: `package.json` gains `google-auth-library` and `jsonwebtoken` under dependencies and `@types/jsonwebtoken` under devDependencies.

- [ ] **Step 2: Stabilize the progress-store data dir**

In `src/progress-store.ts`, change the default dir so compiled `dist/` code writes to the project root, not inside `dist/`:
```ts
const dir = options.dir || path.resolve(process.cwd(), 'data', 'progress');
```
(Replace the existing `path.join(__dirname, '..', 'data', 'progress')`. Leave the rest of the file unchanged.)

- [ ] **Step 3: Document env vars**

Append to `.env.example`:
```ini
# Google sign-in (accounts + cross-device progress)
GOOGLE_CLIENT_ID=your-oauth-web-client-id.apps.googleusercontent.com
SQL_MASTERY_SESSION_SECRET=change-me-to-a-long-random-string
# Optional: where accounts and progress JSON live (defaults to ./data)
# SQL_MASTERY_DATA_DIR=/home/scott/apps/sql-mastery/data
```

- [ ] **Step 4: Verify the build still compiles**

Run: `npm run build:server`
Expected: exits 0, no `error TS`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example src/progress-store.ts
git commit -m "chore: add auth deps and stabilize progress data dir"
```

---

## Task 2: user-store

**Files:**
- Create: `src/user-store.ts`
- Test: `test/user-store.test.ts`

**Interfaces:**
- Produces:
  - `interface UserRecord { sub: string; email: string; name: string; createdAt: string; updatedAt: string }`
  - `createUserStore(options?: { dir?: string; now?: () => string }): { upsert(input: { sub: string; email: string; name: string }): UserRecord; getBySub(sub: string): UserRecord | null }`

- [ ] **Step 1: Write the failing test**

Create `test/user-store.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createUserStore } from '../src/user-store';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sqlm-users-'));
}

test('upsert creates a user on first login and returns it', () => {
  const store = createUserStore({ dir: tmpDir(), now: () => '2026-01-01T00:00:00.000Z' });
  const user = store.upsert({ sub: 'g-123', email: 'a@b.com', name: 'Ann' });
  assert.equal(user.sub, 'g-123');
  assert.equal(user.email, 'a@b.com');
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
});

test('upsert on repeat login keeps createdAt and refreshes profile', () => {
  const dir = tmpDir();
  const first = createUserStore({ dir, now: () => '2026-01-01T00:00:00.000Z' });
  first.upsert({ sub: 'g-1', email: 'old@b.com', name: 'Old' });
  const second = createUserStore({ dir, now: () => '2026-02-02T00:00:00.000Z' });
  const user = second.upsert({ sub: 'g-1', email: 'new@b.com', name: 'New' });
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(user.updatedAt, '2026-02-02T00:00:00.000Z');
  assert.equal(user.email, 'new@b.com');
});

test('getBySub returns null for an unknown user', () => {
  const store = createUserStore({ dir: tmpDir() });
  assert.equal(store.getBySub('nope'), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && node --test dist/test/user-store.test.js`
Expected: FAIL - cannot find module `../src/user-store`.

- [ ] **Step 3: Implement user-store**

Create `src/user-store.ts`:
```ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// A tiny file-backed store for user accounts, keyed by the Google subject id (sub).
// The sub is hashed (sha256) so it never becomes a raw filename, and writes are
// atomic (temp file + rename). Kept separate from the read-only teaching database.
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStore {
  upsert(input: { sub: string; email: string; name: string }): UserRecord;
  getBySub(sub: string): UserRecord | null;
}

export function createUserStore(options: { dir?: string; now?: () => string } = {}): UserStore {
  const dir = options.dir || path.resolve(process.cwd(), 'data', 'users');
  const now = options.now || (() => new Date().toISOString());

  function fileFor(sub: string): string {
    const hash = crypto.createHash('sha256').update(String(sub)).digest('hex');
    return path.join(dir, `${hash}.json`);
  }

  function getBySub(sub: string): UserRecord | null {
    try {
      return JSON.parse(fs.readFileSync(fileFor(sub), 'utf8')) as UserRecord;
    } catch {
      return null;
    }
  }

  function upsert(input: { sub: string; email: string; name: string }): UserRecord {
    fs.mkdirSync(dir, { recursive: true });
    const existing = getBySub(input.sub);
    const record: UserRecord = {
      sub: input.sub,
      email: input.email,
      name: input.name,
      createdAt: existing ? existing.createdAt : now(),
      updatedAt: now()
    };
    const file = fileFor(input.sub);
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
    return record;
  }

  return { upsert, getBySub };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && node --test dist/test/user-store.test.js`
Expected: PASS - 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/user-store.ts test/user-store.test.ts
git commit -m "feat: add file-backed user store keyed by Google sub"
```

---

## Task 3: auth-service

**Files:**
- Create: `src/auth-service.ts`
- Test: `test/auth-service.test.ts`

**Interfaces:**
- Consumes: none.
- Produces:
  - `interface GoogleProfile { sub: string; email: string; name: string }`
  - `interface AuthService { verifyGoogleToken(idToken: string): Promise<GoogleProfile>; issueSession(sub: string): string; verifySession(token: string): { sub: string } | null }`
  - `createAuthService(options?: { clientId?: string; sessionSecret?: string; ttlSeconds?: number; verifyGoogle?: (idToken: string) => Promise<GoogleProfile> }): AuthService`

- [ ] **Step 1: Write the failing test**

Create `test/auth-service.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthService } from '../src/auth-service';

function service() {
  return createAuthService({
    clientId: 'test-client',
    sessionSecret: 'test-secret',
    verifyGoogle: async (idToken: string) => {
      if (idToken !== 'good') throw new Error('bad token');
      return { sub: 'g-42', email: 'x@y.com', name: 'Ex' };
    }
  });
}

test('verifyGoogleToken returns the profile for a valid token', async () => {
  const profile = await service().verifyGoogleToken('good');
  assert.deepEqual(profile, { sub: 'g-42', email: 'x@y.com', name: 'Ex' });
});

test('verifyGoogleToken rejects an invalid token', async () => {
  await assert.rejects(() => service().verifyGoogleToken('bad'));
});

test('issueSession then verifySession round-trips the sub', () => {
  const auth = service();
  const token = auth.issueSession('g-42');
  assert.deepEqual(auth.verifySession(token), { sub: 'g-42' });
});

test('verifySession returns null for a tampered token', () => {
  const auth = service();
  assert.equal(auth.verifySession('not.a.jwt'), null);
});

test('verifySession returns null when signed with a different secret', () => {
  const a = createAuthService({ sessionSecret: 'one', verifyGoogle: async () => ({ sub: 's', email: '', name: '' }) });
  const b = createAuthService({ sessionSecret: 'two', verifyGoogle: async () => ({ sub: 's', email: '', name: '' }) });
  assert.equal(b.verifySession(a.issueSession('s')), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsc -p tsconfig.json && node --test dist/test/auth-service.test.js`
Expected: FAIL - cannot find module `../src/auth-service`.

- [ ] **Step 3: Implement auth-service**

Create `src/auth-service.ts`:
```ts
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
}

export interface AuthService {
  verifyGoogleToken(idToken: string): Promise<GoogleProfile>;
  issueSession(sub: string): string;
  verifySession(token: string): { sub: string } | null;
}

// Verifies Google ID tokens and issues/verifies our own session JWT. The Google
// verifier is injectable so tests never reach the network; the client id and secret
// come from options or the environment.
export function createAuthService(options: {
  clientId?: string;
  sessionSecret?: string;
  ttlSeconds?: number;
  verifyGoogle?: (idToken: string) => Promise<GoogleProfile>;
} = {}): AuthService {
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? '';
  const sessionSecret = options.sessionSecret ?? process.env.SQL_MASTERY_SESSION_SECRET ?? '';
  const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 24 * 30;

  const client = new OAuth2Client(clientId);
  const verifyGoogle = options.verifyGoogle ?? (async (idToken: string): Promise<GoogleProfile> => {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error('Google token had no subject.');
    return { sub: payload.sub, email: payload.email ?? '', name: payload.name ?? '' };
  });

  return {
    verifyGoogleToken: (idToken: string) => verifyGoogle(idToken),
    issueSession: (sub: string): string => {
      if (!sessionSecret) throw new Error('SQL_MASTERY_SESSION_SECRET is not set.');
      return jwt.sign({ sub }, sessionSecret, { expiresIn: ttlSeconds });
    },
    verifySession: (token: string): { sub: string } | null => {
      if (!sessionSecret) return null;
      try {
        const decoded = jwt.verify(token, sessionSecret) as { sub?: string };
        return decoded.sub ? { sub: decoded.sub } : null;
      } catch {
        return null;
      }
    }
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsc -p tsconfig.json && node --test dist/test/auth-service.test.js`
Expected: PASS - 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/auth-service.ts test/auth-service.test.ts
git commit -m "feat: add auth-service (verify Google token, issue session JWT)"
```

---

## Task 4: app routes (auth + gated progress)

**Files:**
- Modify: `src/app.ts` (CORS header line ~37; replace the two `/api/progress` handlers ~144-170; add `requireAuth`, `/api/auth/google`, `/api/me`)
- Test: `test/app.test.ts` (add auth cases)

**Interfaces:**
- Consumes: `createAuthService`/`AuthService` (Task 3), `createUserStore`/`UserStore` (Task 2), `createProgressStore` (existing).
- Produces: `createApp(options)` gains optional `authService`, `userStore` (in addition to the existing `progressStore`). A `requireAuth` Express middleware attaches `res.locals.sub`.

- [ ] **Step 1: Write the failing tests**

Add to `test/app.test.ts` (after the existing tests). These construct the app with an injected auth service and stores so no network or secret is needed:
```ts
import { createUserStore } from '../src/user-store';
import { createAuthService } from '../src/auth-service';

function authApp() {
  const os = require('node:os');
  const fs = require('node:fs');
  const nodePath = require('node:path');
  const { createProgressStore } = require('../src/progress-store');
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sqlm-auth-'));
  const authService = createAuthService({
    sessionSecret: 'test-secret',
    verifyGoogle: async (t: string) => {
      if (t !== 'good') throw new Error('bad');
      return { sub: 'g-1', email: 'a@b.com', name: 'Ann' };
    }
  });
  return createApp({
    queryService: { listDatabases: () => ['chinook'] },
    userStore: createUserStore({ dir: nodePath.join(dir, 'users') }),
    progressStore: createProgressStore({ dir: nodePath.join(dir, 'progress') }),
    authService
  });
}

test('POST /api/auth/google returns a token and profile for a valid id token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'good' })
    });
    const body = await res.json() as any;
    assert.equal(res.status, 200);
    assert.ok(body.token);
    assert.equal(body.user.email, 'a@b.com');
  });
});

test('POST /api/auth/google rejects an invalid id token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'bad' })
    });
    assert.equal(res.status, 401);
  });
});

test('GET /api/progress requires a valid token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const anon = await fetch(`${baseUrl}/api/progress`);
    assert.equal(anon.status, 401);
  });
});

test('progress round-trips for the signed-in user', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const auth = await (await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'good' })
    })).json() as any;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` };
    const put = await fetch(`${baseUrl}/api/progress`, { method: 'PUT', headers, body: JSON.stringify({ data: { 'sqlm:m1:p1': '1' } }) });
    assert.equal(put.status, 200);
    const got = await (await fetch(`${baseUrl}/api/progress`, { headers })).json() as any;
    assert.deepEqual(got.data, { 'sqlm:m1:p1': '1' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsc -p tsconfig.json && node --test dist/test/app.test.js`
Expected: FAIL - `createApp` does not use `authService`/`userStore`; `/api/auth/google` 404s.

- [ ] **Step 3: Wire the services and add the CORS header**

In `src/app.ts`, inside `createApp(options)`, add near the other service defaults (after `progressStore`):
```ts
const userStore = options.userStore || createUserStore();
const authService = options.authService || createAuthService();
```
Add the imports at the top of the file:
```ts
import { createUserStore } from './user-store';
import { createAuthService } from './auth-service';
```
In the CORS block, add `Authorization` to the allowed headers:
```ts
response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
```

- [ ] **Step 4: Add requireAuth and the auth routes; gate progress**

In `src/app.ts`, add a middleware and routes. Place `requireAuth` above the `/api/progress` routes:
```ts
function requireAuth(request: any, response: any, next: any) {
  const header = String(request.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const session = token ? authService.verifySession(token) : null;
  if (!session) {
    response.status(401).json({ error: 'Sign in to sync your progress.', code: 'AUTH_REQUIRED' });
    return;
  }
  response.locals.sub = session.sub;
  next();
}

app.post('/api/auth/google', async (request, response) => {
  try {
    const idToken = request.body && request.body.idToken;
    if (typeof idToken !== 'string' || !idToken) {
      return response.status(400).json({ error: 'A Google credential is required.', code: 'MISSING_ID_TOKEN' });
    }
    const profile = await authService.verifyGoogleToken(idToken);
    const user = userStore.upsert(profile);
    const token = authService.issueSession(user.sub);
    response.json({ token, user: { sub: user.sub, email: user.email, name: user.name } });
  } catch {
    response.status(401).json({ error: 'Could not verify that Google sign-in.', code: 'GOOGLE_VERIFY_FAILED' });
  }
});

app.get('/api/me', requireAuth, (request, response) => {
  const user = userStore.getBySub(response.locals.sub);
  if (!user) return response.status(401).json({ error: 'Session expired.', code: 'AUTH_REQUIRED' });
  response.json({ user: { sub: user.sub, email: user.email, name: user.name } });
});
```
Replace the existing `app.get('/api/progress', ...)` and `app.put('/api/progress', ...)` handlers (and delete the old `isValidCode` helper) with:
```ts
app.get('/api/progress', requireAuth, (request, response) => {
  const record = progressStore.get(response.locals.sub);
  response.json(record || { data: null, updatedAt: null });
});

app.put('/api/progress', requireAuth, (request, response) => {
  const body = request.body || {};
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return response.status(400).json({ error: 'A progress data object is required.', code: 'BAD_PROGRESS' });
  }
  if (JSON.stringify(body.data).length > 512 * 1024) {
    return response.status(413).json({ error: 'Progress payload is too large.', code: 'PROGRESS_TOO_LARGE' });
  }
  try {
    const record = progressStore.set(response.locals.sub, body.data);
    response.json({ ok: true, updatedAt: record.updatedAt });
  } catch {
    response.status(500).json({ error: 'Could not save progress.', code: 'PROGRESS_SAVE_FAILED' });
  }
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsc -p tsconfig.json && node --test dist/test/app.test.js`
Expected: PASS - existing tests plus the 4 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts test/app.test.ts
git commit -m "feat: Google auth routes and per-user progress endpoints"
```

---

## Task 5: server wiring

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `createUserStore`, `createAuthService`, `createProgressStore`, `createApp` (all now accept a shared data dir / services).
- Produces: nothing new; the running server now builds accounts under `SQL_MASTERY_DATA_DIR`.

- [ ] **Step 1: Wire the stores into the server**

In `server.ts`, before `createApp`, construct the stores from a single data dir and pass them in:
```ts
import path from 'path';
import { createProgressStore } from './src/progress-store';
import { createUserStore } from './src/user-store';
import { createAuthService } from './src/auth-service';

const dataDir = process.env.SQL_MASTERY_DATA_DIR || path.resolve(process.cwd(), 'data');
const progressStore = createProgressStore({ dir: path.join(dataDir, 'progress') });
const userStore = createUserStore({ dir: path.join(dataDir, 'users') });
const authService = createAuthService();

const app = createApp({ queryService, progressStore, userStore, authService });
```
(Keep the existing `queryService`, `listen`, and shutdown code. Only the app-construction block changes.)

- [ ] **Step 2: Verify it builds and boots against a temp data dir**

Run:
```bash
npm run build:server
SQL_MASTERY_DATA_DIR=/tmp/sqlm-data PORT=3999 HOST=127.0.0.1 node dist/server.js &
sleep 1
curl -s http://127.0.0.1:3999/api/databases
curl -s http://127.0.0.1:3999/api/progress
kill %1
```
Expected: `/api/databases` returns the databases JSON; `/api/progress` returns `{"error":"Sign in to sync your progress.","code":"AUTH_REQUIRED"}` with 401.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: wire user store and auth service into the server"
```

---

## Task 6: client api layer (token + auth calls)

**Files:**
- Modify: `client/src/lib/api.ts`
- Test: `client/src/lib/api.test.ts` (add cases)

**Interfaces:**
- Produces:
  - `setAuthToken(token: string | null): void`
  - `api.auth.google(idToken: string): Promise<{ token: string; user: { sub: string; email: string; name: string } }>`
  - `api.me(): Promise<{ user: { sub: string; email: string; name: string } }>`
  - `api.getProgress(): Promise<{ data: Record<string, string> | null; updatedAt: string | null }>`
  - `api.putProgress(data: Record<string, string>): Promise<{ ok: boolean; updatedAt: string }>`

- [ ] **Step 1: Write the failing test**

Add to `client/src/lib/api.test.ts`:
```ts
import { setAuthToken } from './api';

it('attaches a Bearer header when a token is set, and omits it when cleared', async () => {
  const calls: RequestInit[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (_url: string, options: RequestInit = {}) => {
    calls.push(options);
    return { ok: true, json: async () => ({ ok: true }) } as any;
  }) as any;
  try {
    setAuthToken('tok-123');
    await api.me();
    const withTok = new Headers(calls[0].headers);
    expect(withTok.get('authorization')).toBe('Bearer tok-123');

    setAuthToken(null);
    await api.me();
    const without = new Headers(calls[1].headers);
    expect(without.get('authorization')).toBe(null);
  } finally {
    globalThis.fetch = orig;
    setAuthToken(null);
  }
});
```
(If `api.test.ts` does not already import `api`, keep its existing imports and add `setAuthToken` to the import from `./api`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- api.test`
Expected: FAIL - `setAuthToken` is not exported.

- [ ] **Step 3: Implement the token attach and new calls**

In `client/src/lib/api.ts`:

Add above `request`:
```ts
let authToken: string | null = null;
export function setAuthToken(token: string | null): void { authToken = token; }
```
Change `request` to merge the auth header:
```ts
async function request<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (authToken) headers.set('Authorization', `Bearer ${authToken}`);
  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    const error = new Error('Could not reach the local server. Is `npm start` running?') as ApiError;
    error.code = 'NETWORK';
    throw error;
  }
  // ...rest of the existing body/error handling unchanged...
}
```
Add to the exported `api` object:
```ts
  auth: {
    google: (idToken: string): Promise<{ token: string; user: { sub: string; email: string; name: string } }> =>
      post(apiUrl('/api/auth/google'), { idToken })
  },
  me: (): Promise<{ user: { sub: string; email: string; name: string } }> => request(apiUrl('/api/me')),
  getProgress: (): Promise<{ data: Record<string, string> | null; updatedAt: string | null }> => request(apiUrl('/api/progress')),
  putProgress: (data: Record<string, string>): Promise<{ ok: boolean; updatedAt: string }> =>
    request(apiUrl('/api/progress'), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }) })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix client test -- api.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/api.ts client/src/lib/api.test.ts
git commit -m "feat: api layer attaches session token and exposes auth calls"
```

---

## Task 7: token-based sync

**Files:**
- Modify: `client/src/lib/sync.ts`
- Test: `client/src/lib/sync.test.ts` (adjust)

**Interfaces:**
- Consumes: `api.getProgress`, `api.putProgress` (Task 6); existing `collectProgress`, `mergeProgress`, `deepMerge`, `applyMerged`.
- Produces:
  - `syncNow(): Promise<boolean>` - pull the account's progress, merge into local, push the union back; returns whether local changed.
  - `pushIfChanged(): Promise<void>` - push local progress to the account if it changed since the last push.
  - Keep `collectProgress`, `deepMerge`, `mergeProgress` exports (tests rely on them).

- [ ] **Step 1: Adjust the tests**

In `client/src/lib/sync.test.ts`, keep the `deepMerge`/`mergeProgress` unit tests as-is (they do not touch the network). Add a `syncNow` test that fakes `api`:
```ts
import { syncNow } from './sync';
import * as apiModule from './api';
import { vi } from 'vitest';

it('syncNow merges account progress into local and pushes the union', async () => {
  localStorage.clear();
  localStorage.setItem('sqlm:product-progress:v1', JSON.stringify({ completed: { a: 1 }, attempts: {}, lastSql: {} }));
  const put = vi.spyOn(apiModule.api, 'putProgress').mockResolvedValue({ ok: true, updatedAt: 'now' });
  vi.spyOn(apiModule.api, 'getProgress').mockResolvedValue({
    data: { 'sqlm:product-progress:v1': JSON.stringify({ completed: { b: 1 }, attempts: {}, lastSql: {} }) },
    updatedAt: 'then'
  });
  await syncNow();
  const merged = JSON.parse(localStorage.getItem('sqlm:product-progress:v1') as string);
  expect(Object.keys(merged.completed).sort()).toEqual(['a', 'b']);
  expect(put).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- sync.test`
Expected: FAIL - `syncNow` is not exported.

- [ ] **Step 3: Rewrite the account-facing parts of sync.ts**

In `client/src/lib/sync.ts`:
- Delete `SYNC_CODE_KEY`, `getSyncCode`, `setSyncCodeValue`, `clearSyncCode`, `enableSync`, `startSync`, `apiGet`, `apiPut`, and the `API_BASE` constant.
- Keep `SYNCED_JSON`, `NEVER_SYNC` (remove `SYNC_CODE_KEY` from it), `isCheckboxKey`, `collectProgress`, `deepMerge`, `mergeValue`, `mergeProgress`, `applyMerged`, `stableHash`, `lastPushedHash`.
- Add at the top: `import { api } from './api';`
- Add the two new functions:
```ts
// Pull the account's progress, merge into local, push the union back. Monotonic:
// never deletes. Returns whether local changed.
export async function syncNow(): Promise<boolean> {
  const local = collectProgress();
  let remote: Record<string, string> = {};
  try {
    const rec = await api.getProgress();
    remote = (rec && rec.data) || {};
  } catch {
    return false;
  }
  const merged = mergeProgress(local, remote);
  const changed = applyMerged(merged);
  try { await api.putProgress(merged); } catch { /* best effort */ }
  lastPushedHash = stableHash(merged);
  return changed;
}

export async function pushIfChanged(): Promise<void> {
  const snap = collectProgress();
  const h = stableHash(snap);
  if (h === lastPushedHash) return;
  try { await api.putProgress(snap); lastPushedHash = h; } catch { /* best effort */ }
}
```
(`mergeProgress` and `collectProgress` keep their existing bodies. Their inputs are `Record<string, string>`; keep those types.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix client test -- sync.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/sync.ts client/src/lib/sync.test.ts
git commit -m "feat: token-based progress sync (syncNow / pushIfChanged)"
```

---

## Task 8: AuthContext

**Files:**
- Create: `client/src/state/AuthContext.tsx`
- Test: `client/src/state/AuthContext.test.tsx`

**Interfaces:**
- Consumes: `api.auth.google`, `api.me`, `setAuthToken` (Task 6); `syncNow`, `pushIfChanged` (Task 7).
- Produces:
  - `interface AuthUser { sub: string; email: string; name: string }`
  - `useAuth(): { user: AuthUser | null; status: 'loading' | 'ready'; signIn(idToken: string): Promise<void>; signOut(): void }`
  - `AuthProvider({ children })`

- [ ] **Step 1: Write the failing test**

Create `client/src/state/AuthContext.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import * as apiModule from '../lib/api';

function Probe() {
  const { user, status } = useAuth();
  return <div>{status}:{user ? user.email : 'anon'}</div>;
}

beforeEach(() => { localStorage.clear(); });

describe('AuthContext', () => {
  it('restores a session from a stored token', async () => {
    localStorage.setItem('sqlm:auth-token:v1', 'tok');
    vi.spyOn(apiModule.api, 'me').mockResolvedValue({ user: { sub: 'g', email: 'a@b.com', name: 'A' } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:a@b.com')).toBeInTheDocument());
  });

  it('clears a bad token on 401', async () => {
    localStorage.setItem('sqlm:auth-token:v1', 'bad');
    vi.spyOn(apiModule.api, 'me').mockRejectedValue(new Error('401'));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('ready:anon')).toBeInTheDocument());
    expect(localStorage.getItem('sqlm:auth-token:v1')).toBe(null);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix client test -- AuthContext`
Expected: FAIL - cannot find `./AuthContext`.

- [ ] **Step 3: Implement AuthContext**

Create `client/src/state/AuthContext.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, setAuthToken } from '../lib/api';
import { syncNow, pushIfChanged } from '../lib/sync';

const TOKEN_KEY = 'sqlm:auth-token:v1';

export interface AuthUser { sub: string; email: string; name: string; }
interface AuthValue {
  user: AuthUser | null;
  status: 'loading' | 'ready';
  signIn: (idToken: string) => Promise<void>;
  signOut: () => void;
}

function readToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function writeToken(token: string | null): void {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

const Ctx = createContext<AuthValue | null>(null);
export const useAuth = (): AuthValue => useContext(Ctx) as AuthValue;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    let alive = true;
    const token = readToken();
    if (!token) { setStatus('ready'); return; }
    setAuthToken(token);
    api.me()
      .then((r) => { if (alive) { setUser(r.user); setStatus('ready'); } })
      .catch(() => { if (alive) { writeToken(null); setAuthToken(null); setStatus('ready'); } });
    return () => { alive = false; };
  }, []);

  // While signed in, push local progress periodically and when the tab hides.
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => { pushIfChanged(); }, 15000);
    const onHide = () => { if (document.hidden) pushIfChanged(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => pushIfChanged());
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onHide); };
  }, [user]);

  const signIn = useCallback(async (idToken: string) => {
    const res = await api.auth.google(idToken);
    writeToken(res.token);
    setAuthToken(res.token);
    setUser(res.user);
    await syncNow();
  }, []);

  const signOut = useCallback(() => {
    writeToken(null);
    setAuthToken(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, status, signIn, signOut }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix client test -- AuthContext`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/state/AuthContext.tsx client/src/state/AuthContext.test.tsx
git commit -m "feat: AuthContext with session restore and sign-in merge"
```

---

## Task 9: Google button, account menu, app shell

**Files:**
- Create: `client/src/components/GoogleSignIn.tsx`
- Create: `client/src/components/AccountMenu.tsx`
- Modify: `client/src/components/AppShell.tsx:9,97`
- Delete: `client/src/components/SyncControl.tsx`
- Modify: `client/src/vite-env.d.ts` (declare the Google global)

**Interfaces:**
- Consumes: `useAuth` (Task 8), `VITE_GOOGLE_CLIENT_ID`.
- Produces: `GoogleSignIn` and `AccountMenu` components.

- [ ] **Step 1: Declare the Google Identity Services global**

Append to `client/src/vite-env.d.ts`:
```ts
interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
        renderButton(parent: HTMLElement, options: { type?: string; theme?: string; size?: string; text?: string }): void;
      };
    };
  };
}
```

- [ ] **Step 2: Implement GoogleSignIn**

Create `client/src/components/GoogleSignIn.tsx`:
```tsx
import { useEffect, useRef } from 'react';
import { useAuth } from '../state/AuthContext';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function loadGsi(): Promise<void> {
  if (window.google) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const s = document.createElement('script');
    s.src = GSI_SRC; s.async = true; s.defer = true;
    s.onload = () => resolve(); s.onerror = () => reject(new Error('Could not load Google sign-in.'));
    document.head.appendChild(s);
  });
}

export function GoogleSignIn() {
  const { signIn } = useAuth();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGsi().then(() => {
      if (cancelled || !window.google || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => { signIn(r.credential).catch(() => { /* surfaced by the menu */ }); }
      });
      window.google.accounts.id.renderButton(ref.current, { type: 'standard', theme: 'outline', size: 'medium', text: 'continue_with' });
    }).catch(() => { /* leave the fallback text */ });
    return () => { cancelled = true; };
  }, [signIn]);

  if (!CLIENT_ID) return <span className="sync-status">Sign-in is not configured.</span>;
  return <div ref={ref} aria-label="Sign in with Google" />;
}
```

- [ ] **Step 3: Implement AccountMenu**

Create `client/src/components/AccountMenu.tsx`:
```tsx
import { useAuth } from '../state/AuthContext';
import { GoogleSignIn } from './GoogleSignIn';

export function AccountMenu() {
  const { user, status, signOut } = useAuth();
  if (status === 'loading') return null;
  if (!user) {
    return (
      <div className="sync-box">
        <span className="sync-label">Save progress across devices</span>
        <GoogleSignIn />
      </div>
    );
  }
  return (
    <div className="sync-box">
      <span className="sync-status">Signed in as {user.name || user.email}</span>
      <button type="button" className="sync-link" onClick={signOut}>Sign out</button>
    </div>
  );
}
```

- [ ] **Step 4: Swap the app shell and delete SyncControl**

In `client/src/components/AppShell.tsx`, change the import on line 9 and the mount on line 97:
```ts
import { AccountMenu } from './AccountMenu';
```
```tsx
          <AccountMenu />
```
Then delete the old component:
```bash
git rm client/src/components/SyncControl.tsx
```

- [ ] **Step 5: Verify build and tests**

Run: `npm --prefix client run typecheck && npm --prefix client test`
Expected: 0 type errors; all client tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/GoogleSignIn.tsx client/src/components/AccountMenu.tsx client/src/components/AppShell.tsx client/src/vite-env.d.ts
git commit -m "feat: Google sign-in button and account menu in the app shell"
```

---

## Task 10: mount the AuthProvider

**Files:**
- Modify: `client/src/App.tsx`

**Interfaces:**
- Consumes: `AuthProvider` (Task 8).

- [ ] **Step 1: Wrap the tree**

In `client/src/App.tsx`, import and wrap the providers so auth is available app-wide:
```tsx
import { AuthProvider } from './state/AuthContext';
```
Change the returned tree in `App` to:
```tsx
  return (
    <AuthProvider>
      <CurriculumProvider>
        <FoundationsProvider>
          <Body />
        </FoundationsProvider>
      </CurriculumProvider>
    </AuthProvider>
  );
```

- [ ] **Step 2: Verify build and full client suite**

Run: `npm --prefix client run typecheck && npm --prefix client test && npm --prefix client run build`
Expected: 0 type errors, all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: mount AuthProvider at the app root"
```

---

## Task 11: configuration and deploy

**Files:** none in the repo beyond docs already covered. This task is operational and is the one the maintainer runs.

- [ ] **Step 1: Create the Google OAuth client**

In Google Cloud Console: APIs and Services -> Credentials -> Create credentials -> OAuth client ID -> Web application. Add Authorized JavaScript origins:
`https://sql-mastery.scottcampbell.io`, the `pages.dev` URL, and `http://localhost:5173`. Copy the client id.

- [ ] **Step 2: Set backend env on the VPS**

On the VPS, in `/home/scott/apps/sql-mastery/.env`:
```ini
GOOGLE_CLIENT_ID=<the client id>
SQL_MASTERY_SESSION_SECRET=<output of: openssl rand -hex 32>
SQL_MASTERY_DATA_DIR=/home/scott/apps/sql-mastery/data
```

- [ ] **Step 3: Set the frontend env in Cloudflare Pages**

Add build environment variable `VITE_GOOGLE_CLIENT_ID=<the client id>` and redeploy the Pages project.

- [ ] **Step 4: Deploy the backend**

Run the redeploy runbook (`deploy/README.md`): `git pull`, `npm install`, `npm run build:server`, then `sudo systemctl restart sql-mastery`. Verify:
```bash
curl -s http://127.0.0.1:3100/api/progress   # -> 401 AUTH_REQUIRED
```

- [ ] **Step 5: Smoke test end to end**

Open the site, click "Continue with Google", confirm the account menu shows your name, complete a lesson on one device, sign in on another, and confirm the progress appears.

---

## Self-Review

**Spec coverage:**
- Google ID token -> app session token: Tasks 3, 6, 8. Covered.
- User store keyed by sub: Task 2. Covered.
- Progress keyed by user, auth-gated; SQL open: Task 4. Covered.
- Anonymous local use + merge on sign-in: Tasks 7, 8 (`syncNow`). Covered.
- Frontend Google button + account menu, replace SyncControl: Task 9. Covered.
- Config + env + Google client + deploy: Tasks 1, 11. Covered.
- CORS Authorization header: Task 4, Step 3. Covered.
- Stable data dir (not inside dist/): Tasks 1 and 5. Covered.
- Session secret required, verify aud, tests inject a verifier: Task 3. Covered.

**Placeholder scan:** No "TBD"/"handle errors"-style steps; every code step shows the code. Passed.

**Type consistency:** `AuthUser`/`{ sub, email, name }`, `AuthService`, `UserRecord`, `syncNow`/`pushIfChanged`, `setAuthToken`, and the `api.auth.google`/`me`/`getProgress`/`putProgress` signatures are used consistently across Tasks 2-9. `sub` is the id in every layer.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-06-google-signin-progress-sync.md`.
