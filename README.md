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
SQL_MASTERY_DATABASES=northwind,chinook,adventureworks,stackoverflow,nyctaxi
SQL_MASTERY_DATABASE_ALIASES=chinook=chinook_serial,stackoverflow=stackoverflow_dba,nyctaxi=nyc_taxi
```

Aliases let the lessons use short teaching names while your local PostgreSQL uses names like `chinook_serial`, `stackoverflow_dba`, and `nyc_taxi`.

This is a local practice tool and sends submitted SQL to your local PostgreSQL server. It can run any SQL your configured database user is allowed to run.
