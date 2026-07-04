# SQL Mastery Path

Static SQL practice pages with a local PostgreSQL runner.

## Run the app

```powershell
npm install
npm start
```

Open `http://127.0.0.1:3000`.

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

This is a local practice tool and sends pasted SQL to your local PostgreSQL server. It can run any SQL your configured database user is allowed to run.
