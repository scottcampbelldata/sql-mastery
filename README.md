# SQL Mastery Path

A three-band SQL training app: a React + Vite client (in `client/`) served by an Express back end with a local PostgreSQL runner. The curriculum is generated from the owned `aperture` beginner, `sideline` intermediate, and `rove` advanced databases.

Both the client and the server are written in TypeScript. The client is type-checked and bundled by Vite; the server is compiled with `tsc` to `dist/` and run from there.

## Run the app

```powershell
npm install
npm --prefix client install
npm run build
npm start
```

Open `http://127.0.0.1:3000`. `npm run build` compiles the TypeScript server to `dist/` and builds the client into `client/dist`. `npm start` runs the compiled server (`dist/server.js`), so `npm run build` must run before the first `npm start` (and after server or client changes).

## Development

```powershell
npm run build:server       # compile the TypeScript server to dist/ (rerun after server changes)
npm start                  # Express API on :3000 (runs dist/server.js)
npm run dev                # Vite dev server on :5173 (proxies /api to :3000)
```

Open `http://127.0.0.1:5173` for hot reload during client work.

Type-check without emitting:

```powershell
npm run typecheck                     # server (tsc --noEmit)
npm --prefix client run typecheck     # client (tsc --noEmit)
```

## Tests

```powershell
npm test                   # compiles the server, runs the server suite (node --test on dist/) + client suite (vitest)
```

## Database configuration

Edit `.env` before starting if your local PostgreSQL user or password is different:

```ini
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your-password
```

The runner shows these databases by default:

```ini
SQL_MASTERY_DATABASES=aperture,sideline,rove
SQL_MASTERY_DATABASE_ALIASES=
```

Aliases are optional. The three owned datasets use their real database names by default.

This app sends submitted SQL to your PostgreSQL server. It can run any SQL your configured database user is allowed to run.

## Deploy: split hosting (VPS backend + Cloudflare Pages front end)

By default `npm start` serves both the API and the built client from one origin. To host the
front end on Cloudflare Pages and the backend on a VPS, decouple them:

**Backend (VPS):**

1. `npm install` and set `.env` (`PGHOST/PGUSER/PGPASSWORD`, `SQL_MASTERY_DATABASES=aperture,sideline,rove`, `SQL_MASTERY_STATEMENT_TIMEOUT_MS`).
2. Set `SQL_MASTERY_ALLOWED_ORIGINS` to your Pages origin(s), e.g. `https://sql-mastery.pages.dev`. This turns on CORS for exactly those origins.
3. Keep `HOST=127.0.0.1` and run a TLS reverse proxy (nginx/Caddy) in front, exposing e.g. `https://api.example.com` -> `127.0.0.1:3000`. Run under a process manager (`systemd`/`pm2`).

**Front end (Cloudflare Pages):**

- Build command: `npm install && npm --prefix client install && npm run build`
- Build output directory: `client/dist`
- Environment variable: `VITE_API_BASE_URL=https://api.example.com` (your backend origin, no trailing slash). This bakes the API base into the static build.
- Routing: the app uses hash routing (`/#/...`), so no SPA `_redirects` rule is needed.

Local dev is unchanged: leave `VITE_API_BASE_URL` unset (calls stay relative) and `SQL_MASTERY_ALLOWED_ORIGINS` empty.

## Security (read before exposing the backend publicly)

The `/api/query` and `/api/check` endpoints run arbitrary SQL against your database with **no
authentication**. Fine on localhost; on a public VPS it lets anyone who can reach the API read
data and load your server. Before exposing it:

- **Use a read-only PostgreSQL role** with access to only the three teaching databases (`GRANT SELECT` only, `pg_read_all_data`-style). This is the single most important control.
- **Restrict CORS** to your exact Pages origin (never leave `*` in production). Note CORS only stops browsers - pair it with the controls below.
- **Keep the statement timeout** (`SQL_MASTERY_STATEMENT_TIMEOUT_MS`) low to bound runaway queries.
- **Rate-limit / gate access** at the reverse proxy or with Cloudflare Access (put the API behind an Access policy / token) so it isn't an open arbitrary-query endpoint.
- Run the DB on a private network the app reaches over localhost, not exposed to the internet.
