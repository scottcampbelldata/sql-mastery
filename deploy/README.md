# Deploy: VPS backend (nginx) + Cloudflare Pages front end

The backend runs on a VPS behind nginx (TLS); the static front end is on Cloudflare
Pages. Files here:

- `sql-mastery.service` - systemd unit for the Node/Express backend
- `nginx/sql-mastery-http.conf` - http{}-context rate/conn-limit zones + `server_tokens off`
- `nginx/api.example.com.conf` - the API vhost (TLS, proxy, limits)

Replace the placeholders `api.example.com`, `/opt/sql-mastery`, and the `sqlmastery`
user throughout.

## 1. Backend on the VPS

```bash
sudo useradd --system --home /opt/sql-mastery --shell /usr/sbin/nologin sqlmastery
sudo git clone <repo> /opt/sql-mastery && cd /opt/sql-mastery
sudo -u sqlmastery npm install --omit=dev

sudo -u sqlmastery cp .env.example .env    # then edit:
#   HOST=127.0.0.1  PORT=3000
#   PGHOST/PGUSER/PGPASSWORD -> a READ-ONLY role (see Security)
#   SQL_MASTERY_DATABASES=chinook,stackoverflow  (+ aliases)
#   SQL_MASTERY_ALLOWED_ORIGINS=https://<your-project>.pages.dev
sudo chmod 600 /opt/sql-mastery/.env && sudo chown sqlmastery:sqlmastery /opt/sql-mastery/.env

sudo cp deploy/sql-mastery.service /etc/systemd/system/
# set ExecStart node path: `which node`
sudo systemctl daemon-reload && sudo systemctl enable --now sql-mastery
systemctl status sql-mastery      # should be active; curl http://127.0.0.1:3000/api/databases
```

## 2. nginx

```bash
sudo cp deploy/nginx/sql-mastery-http.conf /etc/nginx/conf.d/
sudo cp deploy/nginx/api.example.com.conf  /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/api.example.com.conf /etc/nginx/sites-enabled/

# TLS cert (webroot flow; the port-80 ACME location works before any cert exists):
sudo certbot certonly --webroot -w /opt/sql-mastery/public -d api.example.com

sudo nginx -t && sudo systemctl reload nginx
curl https://api.example.com/api/databases      # -> {"databases":["chinook","stackoverflow"]}
```

## 3. Cloudflare Pages (front end)

- **Build command:** `npm install && npm --prefix client install && npm run build`
- **Build output directory:** `client/dist`
- **Environment variable:** `VITE_API_BASE_URL=https://api.example.com` (no trailing slash)
- Routing: the app uses hash routing (`/#/...`), so **no `_redirects` SPA rule is needed**.

After the Pages deploy, its origin (e.g. `https://<project>.pages.dev`) must be in the
backend's `SQL_MASTERY_ALLOWED_ORIGINS`, then `sudo systemctl restart sql-mastery`.

## Security (this is important)

`/api/query` and `/api/check` run **arbitrary read SQL with no authentication**.

1. **Read-only Postgres role** scoped to only the two databases - the single most
   important control:
   ```sql
   CREATE ROLE sqlrunner LOGIN PASSWORD '...';
   \c chinook_serial
   GRANT CONNECT ON DATABASE chinook_serial TO sqlrunner;
   GRANT USAGE ON SCHEMA public TO sqlrunner;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO sqlrunner;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO sqlrunner;
   -- repeat for stackoverflow_dba
   ```
   Point `PGUSER`/`PGPASSWORD` at `sqlrunner`.
2. **Keep the nginx rate/conn limits** (`sql-mastery-http.conf`) and a low
   `SQL_MASTERY_STATEMENT_TIMEOUT_MS`.
3. **Gate it** - putting the API behind **Cloudflare Access** (policy/token) is the
   strongest option, since CORS only restrains browsers, not scripts.
4. Keep Postgres on a private network the app reaches over localhost.
5. If you later rely on per-IP logic in the app, set `app.set('trust proxy', 1)` (one
   hop) so it reads the IP nginx wrote - never `trust proxy: true`.
