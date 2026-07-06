# SQL Mastery Path

A 36-week SQL training app: a React + Vite client (in `client/`) served by an Express back end with a local PostgreSQL runner. Lesson content lives in `content/` as HTML and is parsed by the server to build the curriculum.

## Run the app

```powershell
npm install
npm --prefix client install
npm run build
npm start
```

Open `http://127.0.0.1:3000`. Express serves the built client from `client/dist`, so `npm run build` must run before the first `npm start` (and after client changes).

## Development

```powershell
npm start                  # Express API on :3000
npm run dev                # Vite dev server on :5173 (proxies /api to :3000)
```

Open `http://127.0.0.1:5173` for hot reload during client work.

## Tests

```powershell
npm test                   # server suite (node --test) + client suite (vitest)
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
SQL_MASTERY_DATABASES=chinook,stackoverflow
SQL_MASTERY_DATABASE_ALIASES=chinook=chinook_serial,stackoverflow=stackoverflow_dba
```

Aliases let the lessons use short teaching names while your local PostgreSQL uses names like `chinook_serial` and `stackoverflow_dba`.

This app sends submitted SQL to your PostgreSQL server. It can run any SQL your configured database user is allowed to run.

## Deploy: split hosting (VPS backend + Cloudflare Pages front end)

By default `npm start` serves both the API and the built client from one origin. To host the
front end on Cloudflare Pages and the backend on a VPS, decouple them:

**Backend (VPS):**

1. `npm install` and set `.env` (`PGHOST/PGUSER/PGPASSWORD`, the two databases, `SQL_MASTERY_STATEMENT_TIMEOUT_MS`).
2. Set `SQL_MASTERY_ALLOWED_ORIGINS` to your Pages origin(s), e.g. `https://sql-mastery.pages.dev`. This turns on CORS for exactly those origins.
3. Keep `HOST=127.0.0.1` and run a TLS reverse proxy (nginx/Caddy) in front, exposing e.g. `https://api.example.com` → `127.0.0.1:3000`. Run under a process manager (`systemd`/`pm2`).

**Front end (Cloudflare Pages):**

- Build command: `npm install && npm --prefix client install && npm run build`
- Build output directory: `client/dist`
- Environment variable: `VITE_API_BASE_URL=https://api.example.com` (your backend origin, no trailing slash). This bakes the API base into the static build.
- Routing: the app uses hash routing (`/#/…`), so no SPA `_redirects` rule is needed.

Local dev is unchanged: leave `VITE_API_BASE_URL` unset (calls stay relative) and `SQL_MASTERY_ALLOWED_ORIGINS` empty.

## Security (read before exposing the backend publicly)

The `/api/query` and `/api/check` endpoints run arbitrary SQL against your database with **no
authentication**. Fine on localhost; on a public VPS it lets anyone who can reach the API read
data and load your server. Before exposing it:

- **Use a read-only PostgreSQL role** with access to only the two teaching databases (`GRANT SELECT` only, `pg_read_all_data`-style). This is the single most important control.
- **Restrict CORS** to your exact Pages origin (never leave `*` in production). Note CORS only stops browsers — pair it with the controls below.
- **Keep the statement timeout** (`SQL_MASTERY_STATEMENT_TIMEOUT_MS`) low to bound runaway queries.
- **Rate-limit / gate access** at the reverse proxy or with Cloudflare Access (put the API behind an Access policy / token) so it isn't an open arbitrary-query endpoint.
- Run the DB on a private network the app reaches over localhost, not exposed to the internet.
