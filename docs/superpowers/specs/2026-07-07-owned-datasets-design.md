# Owned datasets: Aperture, Sideline, Rove

Date: 2026-07-07
Status: proposed (design approved; reconciled from a senior-designer panel + adversarial critique)

## Goal

Build three brand-new, fully owned Postgres datasets that power a beginner-to-senior SQL
course for data analysts and BI. Each targets one difficulty level, with real and believable
data. The advanced dataset is deliberately messy in realistic, solvable ways. This spec covers
ONLY building and proving out the datasets (schema + deterministic seed generators + tests +
adversarial checks). Wiring them into the curriculum is a later phase.

- **Aperture** (beginner, clean): an exoplanet / observatory archive.
- **Sideline** (intermediate, clean): a pro esports circuit.
- **Rove** (advanced, messy): an urban gig delivery / mobility platform.

## Non-goals

- No curriculum wiring, no exercise authoring, no changes to the current chinook/stackoverflow
  curriculum. These datasets are additive for now.
- Not replacing the query grader or db-config; we reuse `buildClientConfig` and pg.

## Global architecture

Deterministic TypeScript generators compiled by the existing `tsc` (rootDir `.`, include
`src/**`, `scripts/**`, `test/**`) to `dist/`, run on the VPS as `node dist/scripts/*.js`.
Schema lives as plain versioned SQL files. Server unit tests run via `node --test dist/test/*.test.js`.

### Determinism (hard requirement)

- Seeded PRNG: `mulberry32` (uses `Math.imul` + unsigned shifts, byte-identical across machines/
  Node versions). Each DB owns a fixed base-seed literal. `deriveStream(base, name)` folds an
  FNV-1a hash of the stream name into the base so every table draws an independent, order-stable
  stream (adding a table later never perturbs existing data).
- No forbidden clocks anywhere: `Math.random`, `Date.now`, and argless `new Date()` are never
  used (they are unavailable in this context and would break reproducibility). All time derives
  from a single literal `ANCHOR_MS = Date.UTC(2020,0,1)` plus integer offsets; formatting extracts
  UTC fields arithmetically so `process.env.TZ` and locale cannot change a byte. `new Date` is only
  ever called with an explicit millisecond argument, only inside `dates.ts`.
- A fixed `DATASET_END` constant (a literal instant, proposed 2022-01-01 = ANCHOR + 24 months)
  defines "now" so "still active" / "in-flight" NULLs and the newest cohorts are reproducible.
- Rounding: monetary and physical values pass through a pure round helper before emit.
- Enforcement (as shipped): `seed_meta` stores seed + generator version + per-table row counts;
  `verify-datasets` asserts each table's count against committed `[min,max]` bands in
  `manifest.json`. Byte-determinism itself is enforced by the unit suite: a pinned golden PRNG
  vector plus per-generator double-run equality tests (including under different `TZ`) asserting
  identical output. (An ordered-md5 content checksum was considered and dropped as redundant given
  the golden-vector and double-run guarantees.)

### Insert + idempotency

- Primary path (no new deps beyond `pg`): chunked multi-row parameterized INSERT. `rowsPerChunk =
  min(ROW_CAP=1000, floor(65535 / columnCount))` to stay under Postgres's 65535 bound-parameter cap.
- One transaction per DB in `seed-runner.ts`: BEGIN, run the DDL file (DROP TABLE IF EXISTS ...
  CASCADE then CREATE, so re-runs fully rebuild), bulk-insert parents before children with
  `OVERRIDING SYSTEM VALUE` so generator ids are preserved, add secondary indexes + FK constraints
  at the end (fast bulk load), INSERT `seed_meta`, COMMIT. Any error rolls back, leaving the prior
  good dataset intact. Re-running any seed is always safe.
- Large Rove tables stream chunk by chunk (flat memory). Optional COPY path in `writer.ts` activates
  only if `pg-copy-streams` is present (dynamic-import guard); default pipeline needs only `pg`.

### File layout

```
datasets/schema/aperture.sql | sideline.sql | rove.sql        (versioned DDL, drop-then-create)
datasets/manifest.json                                        (expected row counts + checksums)
src/datasets/framework/prng.ts random.ts dates.ts pools.ts text.ts writer.ts schema.ts seed-runner.ts types.ts
src/datasets/aperture/pools.ts generate.ts
src/datasets/sideline/pools.ts generate.ts
src/datasets/rove/pools.ts generate.ts mess.ts               (mess.ts = bounded reversible corruption over a clean core)
scripts/seed-aperture.ts seed-sideline.ts seed-rove.ts seed-all.ts verify-datasets.ts
test/prng.test.ts random.test.ts dates.test.ts pools.test.ts writer.test.ts
test/aperture-generate.test.ts sideline-generate.test.ts rove-generate.test.ts rove-mess.test.ts
```

Each per-DB `generate(seed)` is PURE (returns row arrays, no IO), so it is unit-testable without
Postgres. The thin `scripts/` entrypoints + `seed-runner` do all IO via `buildClientConfig`.

## Dataset 1: Aperture (beginner, clean)

Teaches SELECT/aliasing, WHERE (comparison/IN/BETWEEN/LIKE), ORDER BY/LIMIT, DISTINCT, IS NULL,
aggregates (COUNT/SUM/AVG/MIN/MAX/ROUND), GROUP BY, HAVING, and one intro INNER JOIN.

```sql
CREATE TABLE stars (
  star_id            integer PRIMARY KEY,
  star_name          text NOT NULL UNIQUE,           -- catalog designation, LIKE-friendly
  constellation      text NOT NULL,                  -- ~10 values, GROUP BY / LIKE 'C%'
  spectral_type      char(1) NOT NULL,               -- O,B,A,F,G,K,M; drives temp/color/mass
  color              text NOT NULL,                  -- 1:1 with spectral_type
  temperature_k      integer NOT NULL,               -- 2400..45000, banded by spectral_type
  mass_solar         numeric(6,2) NOT NULL,          -- 0.08..90, correlated to type
  radius_solar       numeric(6,2) NOT NULL,          -- 0.10..15, correlated to type
  distance_ly        numeric(7,1) NOT NULL,          -- 4.2..3900, right-skewed
  apparent_magnitude numeric(4,2),                   -- nullable (a few NULL)
  discovery_year     integer                         -- nullable (naked-eye stars NULL)
);
CREATE TABLE planets (
  planet_id           integer PRIMARY KEY,
  star_id             integer NOT NULL REFERENCES stars(star_id),
  planet_name         text NOT NULL UNIQUE,          -- host name + letter, LIKE '%b'
  planet_type         text NOT NULL,                 -- Terrestrial|Super-Earth|Neptune-like|Gas Giant
  mass_earth          numeric(8,2),                  -- ~35% NULL (transit-only detections)
  radius_earth        numeric(6,2),                  -- ~18% NULL (radial-velocity-only)
  orbital_period_days numeric(9,2) NOT NULL,         -- Kepler-consistent with semi_major_axis
  semi_major_axis_au  numeric(7,3) NOT NULL,
  equilibrium_temp_k  integer,                       -- ~15% NULL
  discovery_method    text NOT NULL,                 -- Transit|Radial Velocity|Imaging|Microlensing
  discovery_year      integer NOT NULL,              -- 1995..2019
  in_habitable_zone   boolean NOT NULL               -- derived from temp/luminosity
);
CREATE TABLE moons (
  moon_id             integer PRIMARY KEY,
  planet_id           integer NOT NULL REFERENCES planets(planet_id),
  moon_name           text NOT NULL UNIQUE,
  radius_km           numeric(8,1),                  -- ~30% NULL
  orbital_period_days numeric(7,2),                  -- ~30% NULL
  is_confirmed        boolean NOT NULL
);
```

Volume: stars 60, planets 180, moons 40.

Believability (key rules): spectral type fully determines color + temperature band (O 30000-45000K
blue ... M 2400-3700K red, no row mixes); mass/radius track type in solar units; population is M/K
dominated but all 7 types present (hot types over-sampled for category variety); distances right-
skewed with a Proxima-like anchor near 4.2 ly; planet_type follows the mass-radius relation with a
Jupiter anchor (~318 M_earth, 11.2 R_earth); orbital period consistent with semi-major axis and host
mass via Kepler's third law; discovery method ~72% Transit / 18% RV / 5% each imaging+microlensing,
and method drives which measurement is NULL (transit -> radius not mass; RV -> mass not radius); the
habitable-zone flag is derived, not random. Fully clean: one canonical spelling per category, valid
ranges, no whitespace; the only gaps are legitimate scientific NULLs.

Seeded edge cases: all 7 spectral types + all 4 discovery methods present; two different NULL columns
(mass ~35%, radius ~18%) for IS NULL practice; a TRAPPIST-like M dwarf with 7 planets alongside many
single-planet stars (COUNT per star, HAVING COUNT(*) > n); 2-3 planetless stars (LEFT JOIN / "stars
with no planets"); deliberate ties in distance, orbital_period, temperature; a planet at the
habitable-zone boundary; most planets have zero moons.

## Dataset 2: Sideline (intermediate, clean)

Teaches all join types (inner/left/right/full/self/anti/semi), multi-table joins + aliasing,
subqueries (scalar/IN/correlated), CTEs, set operations (UNION/INTERSECT/EXCEPT), CASE, date functions.

```sql
CREATE TABLE region (
  region_id  integer PRIMARY KEY,
  name       text NOT NULL,
  short_code text NOT NULL UNIQUE                    -- NA,EU,KR,BR,CN,SEA,JP,OCE
);
CREATE TABLE team (
  team_id        integer PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  tag            text NOT NULL UNIQUE,               -- 2-4 char ticker
  region_id      integer NOT NULL REFERENCES region(region_id),
  elo_rating     integer NOT NULL,                   -- 1200..2100, observable strength proxy
  founded_date   date NOT NULL,
  disbanded_date date,                               -- NULL for active; set for folded orgs
  home_city      text                                -- a few NULL
);
CREATE TABLE player (
  player_id          integer PRIMARY KEY,
  handle             text NOT NULL UNIQUE,
  full_name          text NOT NULL,                  -- region-appropriate
  country            text NOT NULL,
  role               text NOT NULL CHECK (role IN ('Duelist','Sentinel','Controller','Initiator','IGL','Flex')),
  birth_date         date,                           -- a handful NULL
  team_id            integer REFERENCES team(team_id),   -- NULL = free agent
  signed_date        date,                           -- NULL when free agent
  total_earnings_usd numeric(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE tournament (
  tournament_id  integer PRIMARY KEY,
  name           text NOT NULL,
  region_id      integer REFERENCES region(region_id),   -- NULL = international
  tier           char(1) NOT NULL CHECK (tier IN ('S','A','B')),
  prize_pool_usd numeric(12,2) NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL CHECK (end_date >= start_date),
  host_city      text,                               -- NULL = online
  host_country   text
);
CREATE TABLE match (
  match_id       integer PRIMARY KEY,
  tournament_id  integer NOT NULL REFERENCES tournament(tournament_id),
  stage          text NOT NULL CHECK (stage IN ('Group','Quarterfinal','Semifinal','Final','Grand Final')),
  best_of        smallint NOT NULL CHECK (best_of IN (1,3,5)),
  match_datetime timestamp NOT NULL,                 -- within tournament window
  team_a_id      integer NOT NULL REFERENCES team(team_id),
  team_b_id      integer NOT NULL REFERENCES team(team_id) CHECK (team_a_id <> team_b_id),
  team_a_score   smallint NOT NULL,
  team_b_score   smallint NOT NULL,
  winner_team_id integer NOT NULL REFERENCES team(team_id)
);
CREATE TABLE map_result (
  map_result_id  integer PRIMARY KEY,
  match_id       integer NOT NULL REFERENCES match(match_id),
  map_number     smallint NOT NULL,
  map_name       text NOT NULL,                      -- Valorant pool: Ascent,Bind,Haven,Split,Lotus,Sunset,Icebox
  winner_team_id integer NOT NULL REFERENCES team(team_id),
  team_a_rounds  smallint NOT NULL,
  team_b_rounds  smallint NOT NULL,
  duration_minutes smallint NOT NULL,
  UNIQUE (match_id, map_number)
);
CREATE TABLE roster_change (
  roster_change_id integer PRIMARY KEY,
  player_id        integer NOT NULL REFERENCES player(player_id),
  team_id          integer NOT NULL REFERENCES team(team_id),
  from_date        date NOT NULL,
  to_date          date,                             -- NULL = current/open stint
  change_reason    text NOT NULL CHECK (change_reason IN ('Signed','Transfer','Promoted','Loan','Released','Retired','Benched')),
  UNIQUE (player_id, from_date)
);
CREATE TABLE sponsor (
  sponsor_id           integer PRIMARY KEY,
  name                 text NOT NULL UNIQUE,
  industry             text NOT NULL,
  headquarters_country text NOT NULL
);
CREATE TABLE team_sponsor (
  team_id          integer NOT NULL REFERENCES team(team_id),
  sponsor_id       integer NOT NULL REFERENCES sponsor(sponsor_id),
  contract_start   date NOT NULL,
  contract_end     date,                             -- NULL = active
  annual_value_usd numeric(10,2) NOT NULL,
  PRIMARY KEY (team_id, sponsor_id, contract_start)
);
```

Volume: region 8, team 40, player 280, tournament 24, match 1200, map_result 3000,
roster_change 600, sponsor 30, team_sponsor 120.

Believability (key rules): each team has a latent Beta(2,2) strength baked into `elo_rating`; match
outcomes follow the Elo formula `P(a) = 1/(1+10^((elo_b-elo_a)/400))`, so aggregate win rates track
elo, with ~12% deliberate upsets so CASE-based upset classification has data; map rounds correlate
with the elo gap (first-to-13, ~8% overtime); per-map winners sum to the match score and the majority
side equals `winner_team_id`; earnings correlate with team elo + career length + prize shares; sponsor
value scales with elo + region market size; names are region-weighted; rosters are chronologically
consistent (non-overlapping stints, `from_date >= founded_date`, exactly one open stint per current
player consistent with `player.team_id`).

Seeded edge cases: ~35 free agents (team_id NULL) for LEFT JOIN/anti-join; 4-6 bottom-elo teams that
win zero matches (clean anti-join / EXCEPT "teams that never won"); 2-3 teams with no sponsor rows;
1-2 upcoming tournaments with zero matches; disbanded teams still in historical matches; boomerang
and journeyman players (self-join + HAVING); tie clusters in tournament win counts (RANK vs
DENSE_RANK); one energy-drink megabrand across ~10 teams and one sponsor with all contracts ended;
online tournaments with NULL host_city; overtime map scores. SCD lookup: "who was on team T on date D"
= `WHERE team_id=T AND D >= from_date AND D < COALESCE(to_date, DATE '9999-12-31')`.

## Dataset 3: Rove (advanced, messy)

Teaches window functions (RANK/DENSE_RANK/LAG/LEAD/running totals/moving averages/NTILE), retention
cohorts, funnel conversion, sessionization, ROW_NUMBER dedup, and real data-cleaning
(TRIM/LOWER/CASE/CAST/COALESCE/regex, timezone handling).

**Reconciliation fixes applied to the base design (from adversarial critique), marked FIX below.**
Two-layer build: `generate(seed)` produces a CLEAN, fully consistent core; then `mess.ts` applies
bounded, reversible corruption. A hidden clean column is the answer key for every reversible defect.

```sql
CREATE TABLE cities (
  city_id          smallint PRIMARY KEY,
  name             text NOT NULL,
  country_code     char(2) NOT NULL,
  timezone         text NOT NULL,                    -- clean IANA zone; the R14 answer key
  utc_offset_hours smallint NOT NULL,                -- denormalized hint, made STALE for some rows (trap)
  latitude         numeric(8,5) NOT NULL,
  longitude        numeric(8,5) NOT NULL,
  launched_on      date NOT NULL,
  population_k      integer NOT NULL,
  is_active        boolean NOT NULL DEFAULT true
);
CREATE TABLE merchants (
  merchant_id      integer PRIMARY KEY,
  city_id          smallint NOT NULL REFERENCES cities(city_id),
  name             text NOT NULL,
  category         text NOT NULL,                    -- restaurant|grocery|pharmacy|convenience|alcohol|flowers
  price_tier       smallint NOT NULL,
  onboarded_on     date NOT NULL,
  avg_prep_minutes numeric(4,1) NOT NULL,
  is_active        boolean NOT NULL
);
CREATE TABLE customers (
  customer_id            integer PRIMARY KEY,
  full_name              text,                        -- FIX: added; dirty (casing/whitespace/nickname), sentinel-NULL slice
  email                  text,                        -- FIX: added; dirty (case/space/mailto/domain typos), example.com/org only
  phone                  text,                        -- FIX: added; dirty formats, 555 ranges only
  signup_ts              timestamp NOT NULL,          -- naive local (cohort key via date_trunc)
  signup_city_id         smallint NOT NULL REFERENCES cities(city_id),
  acquisition_channel    text NOT NULL,               -- organic|paid_social|referral|app_store|promo
  birth_year             smallint,                    -- ~8% NULL
  segment                text NOT NULL,               -- new|casual|regular|power (drives frequency)
  referred_by_customer_id integer REFERENCES customers(customer_id),  -- self-ref, ~18%
  master_customer_id     integer NOT NULL,            -- FIX: added HIDDEN answer key; equal across a person's dup rows
  is_deleted             boolean NOT NULL DEFAULT false
);
CREATE TABLE couriers (
  courier_id         integer PRIMARY KEY,
  full_name          text,                            -- FIX: added
  phone              text,                            -- FIX: added; dirty formats, 555 ranges only
  home_city_id       smallint NOT NULL REFERENCES cities(city_id),
  applied_at         timestamp NOT NULL,              -- naive local
  approved_at        timestamp,                       -- NULL ~22% (never cleared vetting)
  activated_at       timestamp,                       -- NULL ~10% (approved, never active)
  churned_at         timestamp,                       -- NULL ~55% (still active)
  status             text NOT NULL,                   -- applied|approved|active|churned (consistent w/ timestamps; dirty casing)
  vehicle_type       text NOT NULL,                   -- bike|ebike|scooter|car (dirty casing/synonyms)
  lifetime_deliveries integer NOT NULL DEFAULT 0,      -- INTENTIONAL exact ties within city (RANK)
  rating_avg         numeric(3,2)                      -- NULL for 0-completed couriers
);
CREATE TABLE orders (
  order_id           bigint PRIMARY KEY,
  customer_id        integer NOT NULL,                -- FIX: NO FK (permit bounded purged-customer orphans, R09)
  courier_id         integer,                         -- FIX: NO FK (NULL pre-accept; bounded soft-deleted/purged orphans, R09)
  merchant_id        integer NOT NULL REFERENCES merchants(merchant_id),
  city_id            smallint NOT NULL REFERENCES cities(city_id),
  status             text NOT NULL,                   -- placed|accepted|picked_up|delivered|cancelled (dirty casing+synonyms)
  placed_at          timestamp NOT NULL,              -- naive local (FIX: timestamp not timestamptz; demand curve; AT TIME ZONE target)
  accepted_at        timestamp,                       -- naive local; NULL onward from cancel stage
  picked_up_at       timestamp,
  delivered_at       timestamp,
  cancelled_at       timestamp,
  distance_km        numeric(5,2) NOT NULL,
  subtotal_cents     integer NOT NULL,
  delivery_fee_cents integer NOT NULL,
  tip_cents          integer,                          -- ~40% NULL (vs 0 distinction for COALESCE)
  discount_cents     integer NOT NULL DEFAULT 0,
  amount_cents       integer NOT NULL,                 -- FIX: added canonical clean total = subtotal+fee+COALESCE(tip,0)-discount
  order_total_legacy text,                             -- FIX: added dirty money-as-text derived from amount_cents ($, commas, USD, '', NULL)
  surge_multiplier   numeric(3,2) NOT NULL DEFAULT 1.00,
  promo_id           integer REFERENCES promos(promo_id),  -- clean parallel FK (~21%)
  promo_code         text,                             -- FIX: added free-text, NO FK (orphans/typos/sentinels, R08)
  vendor_category    text NOT NULL
);
CREATE TABLE payments (
  payment_id       bigint PRIMARY KEY,
  order_id         bigint NOT NULL REFERENCES orders(order_id),   -- NOT unique: R16 allows retries/dupes
  amount_cents     integer NOT NULL,                  -- clean truth
  amount_legacy    text,                              -- FIX: added dirty money-as-text
  currency         char(3) NOT NULL,
  method           text NOT NULL,                     -- dirty casing/synonyms
  status           text NOT NULL,                     -- paid|refunded|chargeback (+ captured/failed synonyms, R02)
  processor        text NOT NULL,
  authorized_at    timestamp NOT NULL,                -- naive local
  captured_at      timestamp,
  refunded_at      timestamp,
  refund_amount_cents integer
);
CREATE TABLE event_log (
  event_id    bigint PRIMARY KEY,
  customer_id integer NOT NULL,                        -- no FK (matches orders looseness)
  order_id    bigint,
  session_id  uuid NOT NULL,                           -- generator ground truth; re-derived in sessionization lesson
  event_type  text NOT NULL,                           -- app_open|search|view_merchant|add_to_cart|checkout_start|order_placed|support_open
  event_ts    timestamp NOT NULL,                      -- naive local (FIX: timestamp; AT TIME ZONE target); bounded clock-skew (R11)
  city_id     smallint NOT NULL REFERENCES cities(city_id),
  device_os   text NOT NULL,
  app_version text NOT NULL
);
CREATE TABLE promos (
  promo_id        integer PRIMARY KEY,
  code            text NOT NULL,                       -- canonical clean code (answer key for R08)
  promo_type      text NOT NULL,                       -- percent|flat|free_delivery
  value_cents     integer,
  percent_off     smallint,
  min_order_cents integer NOT NULL DEFAULT 0,
  starts_at       timestamp NOT NULL,
  ends_at         timestamp NOT NULL,
  city_id         smallint REFERENCES cities(city_id), -- NULL = all cities
  first_order_only boolean NOT NULL,
  max_redemptions integer
);
CREATE TABLE promo_redemption (
  redemption_id  bigint PRIMARY KEY,
  promo_id       integer NOT NULL REFERENCES promos(promo_id),
  customer_id    integer NOT NULL,
  order_id       bigint NOT NULL REFERENCES orders(order_id),
  redeemed_at    timestamp NOT NULL,
  discount_cents integer NOT NULL
);
CREATE TABLE ratings (
  rating_id   bigint PRIMARY KEY,
  order_id    bigint NOT NULL REFERENCES orders(order_id),
  customer_id integer NOT NULL,
  courier_id  integer,
  stars       smallint NOT NULL,                       -- valid 1..5; R12 injects 0/6/-1/99 sentinels
  comment     text,                                    -- ~85% NULL
  rated_at    timestamp NOT NULL
);
CREATE TABLE support_tickets (
  ticket_id        integer PRIMARY KEY,
  customer_id      integer NOT NULL,
  order_id         bigint,                             -- ~30% NULL
  category         text NOT NULL,                      -- dirty casing/synonyms (R01/R02)
  channel          text NOT NULL,
  priority         text NOT NULL,
  opened_at        timestamp NOT NULL,
  first_response_at timestamp,                         -- ~6% NULL (never answered)
  resolved_at      timestamp,
  status           text NOT NULL,
  csat             smallint,                           -- ~40% set
  is_deleted       boolean NOT NULL DEFAULT false
);
```

Volume: cities 16, merchants 1200, customers 45000 (+~5% dup rows), couriers 3800, orders 520000,
payments 470000 (+retries), event_log 2000000 (may dial to 1.2M if VPS load requires), promos 45,
promo_redemption 110000, ratings 150000, support_tickets 22000.

Believability (key rules): demand is a product of local hour-of-day (double lunch/dinner peaks in
each city's IANA zone), day-of-week, and city population; the funnel is monotonic where present
(accept -> prep by merchant.avg_prep_minutes -> deliver by distance/surge), cancels truncate the
chain leaving trailing NULLs; courier earnings + rating rise with tenure; onboarding decays
~100 applied -> 78 approved -> 90% activate -> 45% churn; retention decays by monthly cohort
(~100/48/33/26/22...) with referral/organic retaining slightly better than paid_social; cohort sizes
grow then plateau (two newest cities tiny); money reconciles (`amount_cents = subtotal + fee +
COALESCE(tip,0) - discount`); surge is >1.00 only in peak/bad-weather windows and lifts fees.

Seeded edge cases: RANK ties (courier `lifetime_deliveries` clusters, rating star ties); LAG/LEAD
boundaries (single-order customers) and multi-week gaps; trailing funnel NULLs; sparse ratings
(~37% of delivered orders rated, ~85% NULL comment); uneven cohort sizes; zero-redemption and capped
promos; onboarding NULL stages; sessionization 30-min gap boundaries; timezone traps (dinner peaks
across zones so naive UTC hour GROUP BY gives the WRONG peak; `utc_offset_hours` stale for some
rows); refund/chargeback anomalies concentrated on a few merchants; COALESCE tip trap (NULL not 0).

## Rove mess taxonomy (16 defects; all confined to Rove; each reversible)

| id | defect | where | target rate | teaches | solvable via |
|----|--------|-------|-------------|---------|--------------|
| R01 | Casing + whitespace variance | status, method, vehicle_type, category | ~35-45%/col | LOWER(TRIM), regexp squash | collapses to canonical enum |
| R02 | Synonyms/abbreviations | order.status, ticket.category, payment.status | 15-25% | CASE / map-table | committed synonym->canonical map |
| R03 | Duplicate customer entities | customers rows | ~5% of people | entity resolution, ROW_NUMBER golden row | hidden master_customer_id + normalized email/phone key |
| R04 | Phone format variance | customers.phone, couriers.phone | ~60% non-canonical | regexp_replace digits, RIGHT 10 | underlying digits intact |
| R05 | Email variance + domain typos | customers.email | ~40% + ~2% typos | LOWER/TRIM/REPLACE, typo map | finite typo->domain map |
| R06 | Money-as-text legacy column | orders.order_total_legacy, payments.amount_legacy | ~30% non-plain, ~4% null/empty | regexp_replace + CAST, NULLIF | canonical amount_cents is truth |
| R07 | NULL funnel timestamps | orders accepted/picked_up/delivered_at | ~12% canceled | IS NULL, COUNT FILTER, funnel | status+cancelled_at fully explain NULLs |
| R08 | Orphaned promo_code (no FK) | orders.promo_code | ~8-10% of coded orders | LEFT JOIN anti, TRIM/UPPER pre-join, NULLIF | promos.code authoritative |
| R09 | Orphaned/soft-deleted refs | orders.courier_id/customer_id | ~1-2% | LEFT vs INNER, soft-delete audit | dims retain soft-deleted rows |
| R10 | Duplicate event rows | event_log | ~3-5% | ROW_NUMBER dedup, time-bucket | shared natural key + earliest ts |
| R11 | Out-of-order events (clock skew) | event_log.event_ts vs id | ~6-8% | ORDER BY event_ts, sessionization | bounded skew, never crosses session |
| R12 | Out-of-range/sentinel ratings | ratings.stars | ~3% + ~10% NULL | WHERE BETWEEN, NULLIF sentinel | domain 1..5 explicit |
| R13 | Soft-deleted rows present | customers/couriers/tickets/orders flags | 2-5% | WHERE NOT is_deleted | clean never-NULL boolean |
| R14 | Timezone-naive local timestamps | orders.placed_at, event_log.event_ts | 100% | AT TIME ZONE via city join | cities.timezone total+clean |
| R15 | NULL-as-string sentinels | email, promo_code, phone, etc. | ~3-5% | NULLIF/CASE to real NULL | fixed sentinel vocabulary |
| R16 | Duplicate/retried payments | payments | ~4% of paid orders | filter captured, ROW_NUMBER per order | canonical earliest captured row |

**Solvability contract:** the mess is always REDUNDANT and RECOVERABLE, never the sole source of
truth, via four mechanisms: (1) a parallel clean column as ground truth (amount_cents, canonical
enum, master_customer_id); (2) finite, documented, collision-free variant/synonym/typo/sentinel maps;
(3) bounded, monotonic, self-describing structure (phone digits/email local-part intact, funnel NULLs
explained by status, bounded event skew); (4) authoritative dimensions + clean boolean flags. Every
dirty column is DERIVED from its clean source in `mess.ts`, so it is provably invertible. Aperture and
Sideline are generated by separate code paths that never reference any dirty map, soft-delete column,
legacy column, or naive-local convention, so the mess is structurally impossible to leak into them.

## Test plan

**Unit (node:test, pure, no DB):** PRNG same-seed reproducibility + named-stream independence + a
pinned golden vector; random helpers (inclusive bounds, weighted ratios, shuffle permutation,
bernoulli rate); dates (integer math, TZ-independent formatting, monotonic funnel); pools (non-empty,
no dup keys, no banned tokens); writer (rowsPerChunk math + placeholder/params alignment via a fake
pool); per-DB generate (deterministic counts, full referential integrity, intended NULLs, plausible
ranges); rove-mess (each mess rate within its band AND each defect reversible to the clean truth).

**Integration (verify-datasets.ts vs seeded Postgres, exits nonzero on failure):** volume bounds;
reproducibility (ordered md5 == manifest); clean-DB integrity (zero orphan FKs on Aperture/Sideline);
believability bounds (ratings 1..5 after cleaning, no future birthdates, orbital_period > 0, sane
fare min/avg/max); per-level pattern presence (Aperture: NULLs/ties/HAVING/join return rows; Sideline:
every join type + correlated subquery + set op + CASE branch + multi-month dates return rows; Rove:
LAG/LEAD partitions, RANK gaps vs DENSE_RANK, NTILE fill, dedup targets, multi-period cohorts,
strictly decreasing funnel, sessionization gaps); Rove mess bounds (dirty fraction in [low,high] and
every dirty value has a recoverable canonical form).

**Adversarial (verify-datasets + spot-check SQL):** believability breaks (no dropoff<pickup, no
negative/zero fares, no payment>order-total, correlations present) except deliberate Rove injections;
offensive-text scan of every generated string incl. truncated/concatenated messy variants; PII-shape
scan (emails only example.com/org, phones only 555/reserved, no Luhn-valid card-like sequences);
pattern-expressibility (a 7-day retention cohort returns a monotonic triangle; a funnel strictly
decreases; RANK shows gaps DENSE_RANK does not; ROW_NUMBER dedup removes exactly the injected count;
a Sideline anti-join lists exactly the never-rostered players); determinism adversary (re-seed diff ==
0, generate under TZ=UTC vs America/New_York vs a non-en locale is byte-identical); mess-solvability
adversary (distinct city values BEFORE normalization > AFTER, and the normalized set == the canonical
city list).

## Runbook (Scott runs on the VPS)

```
cd /home/scott/apps/sql-mastery
git pull
npm run build:server                      # tsc compiles src/**, scripts/**, test/** to dist/
createdb aperture && createdb sideline && createdb rove
node dist/scripts/seed-aperture.js
node dist/scripts/seed-sideline.js
node dist/scripts/seed-rove.js            # largest; streams in batches
node dist/scripts/verify-datasets.js      # integration + adversarial assertions; nonzero on failure
node --test dist/test/*.test.js           # pure unit tests (also CI-runnable, no DB)
```
Any seed is safe to re-run (each rebuilds its DB in one transaction). The curriculum-wiring phase
later adds `aperture,sideline,rove` to `SQL_MASTERY_DATABASES` and restarts the app.

## Build order (each step independently testable)

1. **Framework** (`src/datasets/framework/*`) + its unit tests (prng, random, dates, pools, writer).
   No DB. This is the deterministic backbone everything else depends on.
2. **Aperture**: schema DDL + generator + unit tests + seed entrypoint. Smallest, clean; proves the
   end-to-end pipeline (DDL -> generate -> insert -> seed_meta).
3. **Sideline**: schema DDL + generator + unit tests + seed entrypoint. Exercises full referential
   integrity and every join shape.
4. **Rove clean core**: schema DDL + `generate.ts` (pre-mess) + unit tests + seed entrypoint.
5. **Rove mess**: `mess.ts` + `rove-mess.test.ts` (rates + reversibility).
6. **verify-datasets.ts**: integration + adversarial assertions across all three + `manifest.json`.
7. **Adversarial hardening pass**: run verify on the VPS, fix any believability/solvability/PII flags,
   lock the manifest checksums.

## Open decisions (resolved defaults; flag if you disagree)

- Money as integer cents everywhere (avoids float drift); learner queries divide by 100. RESOLVED: cents.
- `DATASET_END` = ANCHOR + 24 months (2022-01-01), a literal, for reproducible "now". RESOLVED.
- `merchants` stays in scope (orders need a believable vendor; enriches joins). RESOLVED: keep.
- `event_log` target 2,000,000 rows, dial to 1,200,000 if VPS insert time/disk requires. RESOLVED: start 2M, fall back.
- `elo_rating` exposed on `team` as the observable strength proxy. RESOLVED: expose.
- Exomoons framed as the fictional archive's curated candidate/confirmed catalog (heavy NULLs,
  `is_confirmed` flag) since real confirmed exomoons are ~nonexistent. RESOLVED: keep with framing.
- Star/planet names are owned synthetic catalog designations grounded in real physics (not scraped
  real object names). RESOLVED: synthetic.
```
