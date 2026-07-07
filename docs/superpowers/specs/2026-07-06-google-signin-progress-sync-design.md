# Google sign-in and per-account progress sync

Date: 2026-07-06
Status: approved design, pending spec review

## Goal

Let learners keep their progress across laptops and devices by signing in with Google.
Progress is currently per-device (localStorage) with an optional shared-code sync. Replace
the shared code with real per-user accounts (Google OAuth) so each person's progress follows
their identity, while keeping the app fully usable without signing in.

## Non-goals

- Password/email accounts, magic links, or providers other than Google.
- Account deletion or data-export UI (can be added later).
- Gating the SQL runner behind auth. `/api/query` and `/api/check` stay open so anyone can
  run SQL and learn without an account.
- Moving accounts into the teaching PostgreSQL databases. Those run under a read-only role by
  design; accounts and progress live in the writable file store instead.

## Chosen approach: Google ID token, then an app-issued session token

The frontend (`sql-mastery.scottcampbell.io`, `sql-mastery.pages.dev`) and the API
(`sqlmastery-api.scottcampbell.io`) are on different origins (`SQL_MASTERY_SERVE_CLIENT=false`).
That makes an origin-agnostic bearer token cleaner than a cross-site cookie.

1. The frontend renders Google Identity Services ("Continue with Google") and receives a Google
   ID token (a JWT signed by Google).
2. It POSTs the ID token to `POST /api/auth/google`.
3. The API verifies the ID token against Google's public keys, checking the audience equals our
   `GOOGLE_CLIENT_ID`. It reads the stable Google subject id (`sub`), email, and name.
4. The API upserts a user record keyed by `sub`, then issues its own session token: a JWT signed
   with `SQL_MASTERY_SESSION_SECRET`, containing `{ userId, exp }` (about 30 days).
5. The frontend stores the session token in localStorage and sends it as
   `Authorization: Bearer <token>` on progress calls. Progress is keyed by `userId`.

Alternative considered and rejected: an httpOnly session cookie scoped to `.scottcampbell.io`.
Marginally better against XSS, but the split origins (and `pages.dev`, a different registrable
site) make SameSite and CORS-credentials brittle. The token approach is origin-agnostic and
matches the app's existing localStorage-centered design. Progress data is low-sensitivity
(learning progress plus a Google email/name), so a localStorage token with a bounded lifetime
is an acceptable tradeoff.

## Architecture

### Backend components (writable file store, on the VPS)

- `auth-service` (new, `src/auth-service.ts`)
  - What it does: verifies a Google ID token, upserts the user, and issues/verifies the app
    session JWT.
  - Interface: `verifyGoogleToken(idToken) -> { sub, email, name }`, `issueSession(userId) -> token`,
    `verifySession(token) -> { userId } | null`. The Google verifier and clock are injectable so
    tests never call Google.
  - Depends on: `google-auth-library` (Google token verification), `jsonwebtoken` (app JWT),
    `user-store`, `GOOGLE_CLIENT_ID`, `SQL_MASTERY_SESSION_SECRET`.

- `user-store` (new, `src/user-store.ts`)
  - What it does: persists user records keyed by Google `sub`.
  - Interface: `upsert({ sub, email, name }) -> user`, `getBySub(sub) -> user | null`.
  - Record shape: `{ sub, email, name, createdAt, updatedAt }`. The Google `sub` is the user id
    throughout (JWT claim, progress key, store key); there is no separate generated id, since the
    app is Google-only.
  - Depends on: the same file-based persistence pattern as `progress-store` (JSON on disk under a
    configured data dir).

- `progress-store` (existing, `src/progress-store.ts`)
  - Change: it already stores a progress blob per key. The key becomes the app `userId` instead
    of a user-chosen sync code. Its `get`/`set` interface is otherwise unchanged.

- `app` (existing, `src/app.ts`) route changes
  - `POST /api/auth/google`: body `{ idToken }`. Verifies via `auth-service`, upserts the user,
    returns `{ token, user: { id, email, name } }`. 400 on a missing/invalid Google token.
  - `GET /api/me`: requires `Authorization: Bearer`. Returns the current `{ user }` or 401.
  - `GET /api/progress`: requires Bearer. Returns the signed-in user's progress record. Replaces
    the `?code=` parameter. 401 without a valid token.
  - `PUT /api/progress`: requires Bearer. Body `{ data }` (no more `code`). Stores under `userId`.
    Keeps the existing size and shape validation. 401 without a valid token.
  - `/api/query`, `/api/check`, `/api/databases`, `/api/schema`, `/api/table-preview`,
    `/api/curriculum`: unchanged and unauthenticated.
  - A small `requireAuth` middleware reads the Bearer token, calls `auth-service.verifySession`,
    and attaches `userId`, or responds 401.

### Frontend components

- `auth` state (new, `client/src/state/AuthContext.tsx`)
  - What it does: holds `{ user, token, status }`; exposes `signIn(googleIdToken)`, `signOut()`.
    Persists the token in localStorage; on load, if a token exists, calls `GET /api/me` to
    restore the session (and clears it on 401).
  - Depends on: the api layer, the Google Identity Services script.

- `GoogleSignIn` (new component)
  - What it does: renders the Google button (via Google Identity Services loaded from
    `https://accounts.google.com/gsi/client`), and on credential callback calls `auth.signIn`.
  - Depends on: `VITE_GOOGLE_CLIENT_ID`, `AuthContext`.

- `AccountMenu` (new, replaces `SyncControl` in `AppShell`)
  - Signed out: shows "Continue with Google". Signed in: shows the name/avatar and "Sign out".

- `api` layer (existing, `client/src/lib/api.ts`)
  - Change: attach `Authorization: Bearer <token>` when a token is present. Add `auth.google`
    and `me` calls.

- `sync` (existing, `client/src/lib/sync.ts`)
  - Change: drive syncing off the account instead of a code. When signed in, `pullMergePush`
    reads/writes `/api/progress` with the Bearer token (no `code`). Keep the monotonic
    `deepMerge`, `collectProgress`, and merge-on-load logic. When signed out, do nothing (local
    only). Remove the sync-code key and the code-based flow.

### Anonymous to signed-in merge

Signed out, progress stays in localStorage exactly as today. On first sign-in the frontend
collects local progress (`collectProgress`), pulls the account's stored progress, `deepMerge`s
them (union, monotonic, never deletes), applies the merged result locally, and pushes it back to
the account. This reuses the existing sync merge so no progress is lost when a device that has
local progress signs into an account.

## Data flow (sign-in)

1. User clicks "Continue with Google" -> Google returns an ID token to the page.
2. Frontend: `api.auth.google(idToken)` -> `POST /api/auth/google`.
3. Backend: `verifyGoogleToken` -> `user-store.upsert` -> `issueSession(userId)` -> `{ token, user }`.
4. Frontend: store token, set auth state, then run the merge (collect local -> pull account ->
   deepMerge -> apply -> push).
5. Subsequent progress writes: debounced `PUT /api/progress` with the Bearer token.

## Security

- Verify the Google ID token's signature and that `aud === GOOGLE_CLIENT_ID` and issuer is Google
  (handled by `google-auth-library`).
- App session JWT signed with `SQL_MASTERY_SESSION_SECRET` (required, fail fast if unset in a
  non-test environment), bounded expiry (~30 days), carrying only `userId`.
- `/api/progress` reads/writes are scoped to the token's `userId`; a user can never read another
  user's progress.
- CORS already restricts origins via `SQL_MASTERY_ALLOWED_ORIGINS`; add `Authorization` to the
  allowed request headers.
- Progress payload keeps its existing size cap and object-shape validation.
- The SQL runner remains open exactly as before; accounts change only progress persistence.

## Configuration and one-time setup

- Google Cloud Console: create an OAuth 2.0 "Web application" client. Authorized JavaScript
  origins: `https://sql-mastery.scottcampbell.io`, the `pages.dev` URL, `http://localhost:5173`.
- VPS `.env`: `GOOGLE_CLIENT_ID=<client id>`, `SQL_MASTERY_SESSION_SECRET=<random 32+ bytes>`.
- Cloudflare Pages build env: `VITE_GOOGLE_CLIENT_ID=<same client id>`.
- Local dev: same two client env values in the root `.env` and `client` env.
- Data dir: user and progress JSON live under the existing progress-store data directory.

## Migration from the shared-code sync

- Remove the sync-code UI (`SyncControl`) and the `?code=` path on `/api/progress`.
- There are no real shared-code users to migrate (it was effectively the owner's own use), so no
  data migration is required. If any code-keyed progress blobs exist on disk they are simply left
  in place, unused.

## Testing

- Server (`node --test`):
  - `auth-service`: inject a fake Google verifier and a fixed clock. Assert upsert-on-first-login,
    stable user on repeat login, JWT round-trips, and that a tampered/expired token fails.
  - `app`: `/api/progress` GET/PUT return 401 without a valid Bearer token and read/write the
    right user's data with one. `/api/auth/google` returns a token for a valid (faked) ID token
    and 400 for an invalid one. `/api/query` etc. remain open.
  - `user-store`: upsert and get round-trip against a temp data dir.
- Client (`vitest`):
  - `AuthContext`: restores a session from a stored token via `/api/me`, clears it on 401, and
    `signOut` drops the token.
  - `api`: attaches the Bearer header when a token is present, omits it otherwise.
  - Merge on sign-in unions local and account progress (reuse the existing sync merge tests).

## Assumptions

- The frontend can load Google Identity Services from Google's CDN (no strict CSP on the Vite
  build; it is a normal web app, not the sandboxed artifact environment).
- File-based JSON storage is sufficient for expected volume. If usage grows, swapping the
  `user-store`/`progress-store` persistence for SQLite is a later, isolated change behind the
  same interfaces.
