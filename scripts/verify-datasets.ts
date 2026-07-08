// Integration + adversarial verification harness for the three owned datasets (Aperture,
// Sideline, Rove). Connects to each already-seeded database, runs a fixed list of named
// assertions (volume bounds, referential integrity, believability, mess presence/reversibility,
// pattern-expressibility, PII/offensive-text scans), accumulates every failure instead of
// stopping at the first one, prints a grouped db -> check -> PASS/FAIL report, and exits nonzero
// if any check failed.
//
// Usage: node dist/scripts/verify-datasets.js

import { Pool, PoolClient } from 'pg';

import { buildClientConfig } from '../src/db-config';
import { containsBanned, looksLikeRealEmail, looksLikeRealPhone } from '../src/datasets/framework/text';
import { EMAIL_TYPO_MAP, NULL_SENTINELS, SYNONYM_MAP } from '../src/datasets/rove/mess';
import manifestJson from '../datasets/manifest.json';

type Row = Record<string, any>;
type RowCountManifest = Record<string, Record<string, [number, number]>>;

const manifest = manifestJson as unknown as RowCountManifest;

// -------------------------------------------------------------------------------------------
// Outcome tracking + report printing.
// -------------------------------------------------------------------------------------------

interface Outcome {
  db: string;
  check: string;
  pass: boolean;
  detail: string;
}

const outcomes: Outcome[] = [];

function record(db: string, check: string, pass: boolean, detail: string): void {
  outcomes.push({ db, check, pass, detail });
}

function printReport(): number {
  const dbOrder = ['aperture', 'sideline', 'rove'];
  let failureCount = 0;

  for (const db of dbOrder) {
    const dbOutcomes = outcomes.filter((o) => o.db === db);
    if (dbOutcomes.length === 0) continue;

    console.log(`\n=== ${db.toUpperCase()} (${dbOutcomes.length} checks) ===`);
    for (const o of dbOutcomes) {
      const status = o.pass ? 'PASS' : 'FAIL';
      if (!o.pass) failureCount += 1;
      console.log(`  [${status}] ${o.check} -- ${o.detail}`);
    }
  }

  const total = outcomes.length;
  console.log(`\n=== SUMMARY: ${total - failureCount}/${total} passed, ${failureCount} failed ===`);
  return failureCount;
}

// -------------------------------------------------------------------------------------------
// Generic check helpers. Every helper catches its own query errors and records a FAIL rather
// than throwing, so one bad query never aborts the rest of the run.
// -------------------------------------------------------------------------------------------

async function checkCount(
  client: PoolClient,
  db: string,
  name: string,
  sql: string,
  predicate: (n: number) => boolean,
  expectedDescription: string
): Promise<void> {
  try {
    const res = await client.query(sql);
    const n = Number(res.rows[0].n);
    record(db, name, predicate(n), `actual=${n} expected=${expectedDescription}`);
  } catch (err) {
    record(db, name, false, `query error: ${(err as Error).message}`);
  }
}

async function checkRate(
  client: PoolClient,
  db: string,
  name: string,
  sql: string,
  lo: number,
  hi: number
): Promise<void> {
  try {
    const res = await client.query(sql);
    const numerator = Number(res.rows[0].numerator);
    const denominator = Number(res.rows[0].denominator);
    const rate = denominator > 0 ? numerator / denominator : NaN;
    const pass = denominator > 0 && rate >= lo && rate <= hi;
    record(db, name, pass, `actual=${numerator}/${denominator}=${rate.toFixed(4)} expected band=[${lo}, ${hi}]`);
  } catch (err) {
    record(db, name, false, `query error: ${(err as Error).message}`);
  }
}

async function checkValue(
  client: PoolClient,
  db: string,
  name: string,
  sql: string,
  expected: string
): Promise<void> {
  try {
    const res = await client.query(sql);
    const actual = res.rows.length > 0 ? String(res.rows[0].v) : '<no rows>';
    record(db, name, actual === expected, `actual="${actual}" expected="${expected}"`);
  } catch (err) {
    record(db, name, false, `query error: ${(err as Error).message}`);
  }
}

async function checkRows(
  client: PoolClient,
  db: string,
  name: string,
  sql: string,
  assertion: (rows: Row[]) => { pass: boolean; detail: string }
): Promise<void> {
  try {
    const res = await client.query(sql);
    const { pass, detail } = assertion(res.rows);
    record(db, name, pass, detail);
  } catch (err) {
    record(db, name, false, `query error: ${(err as Error).message}`);
  }
}

async function checkRowCountBands(client: PoolClient, db: string): Promise<void> {
  const bands = manifest[db] || {};
  for (const [table, [lo, hi]] of Object.entries(bands)) {
    await checkCount(
      client,
      db,
      `row count: ${table}`,
      `SELECT COUNT(*) AS n FROM ${table}`,
      (n) => n >= lo && n <= hi,
      `[${lo}, ${hi}]`
    );
  }
}

// -------------------------------------------------------------------------------------------
// SQL-safety helpers shared by the Rove checks.
// -------------------------------------------------------------------------------------------

function escapeSqlLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${escapeSqlLiteral(v)}'`).join(', ');
}

const NULL_SENTINEL_SQL_LIST = sqlInList(NULL_SENTINELS);

// Builds a CASE expression that maps a dirty enum column to its canonical value using the
// single committed SYNONYM_MAP (mess.ts), the same recipe the Rove mess taxonomy documents as
// the recovery path for R01/R02. REGEXP_REPLACE(...,'^\s+|\s+$','','g') is used instead of plain
// TRIM() because Postgres TRIM() only strips the space character by default, not tabs, and the
// R01 whitespace noise generator sometimes appends a tab.
function buildSynonymCaseSql(columnExpr: string): string {
  const trimmed = `LOWER(REGEXP_REPLACE(${columnExpr}, '^\\s+|\\s+$', '', 'g'))`;
  const branches = Object.entries(SYNONYM_MAP)
    .map(([surface, canonical]) => `WHEN '${escapeSqlLiteral(surface)}' THEN '${escapeSqlLiteral(canonical)}'`)
    .join(' ');
  return `CASE ${trimmed} ${branches} ELSE ${trimmed} END`;
}

// -------------------------------------------------------------------------------------------
// APERTURE checks.
// -------------------------------------------------------------------------------------------

async function runApertureChecks(client: PoolClient): Promise<void> {
  const db = 'aperture';

  await checkRowCountBands(client, db);

  await checkCount(
    client,
    db,
    '7 distinct spectral types present',
    'SELECT COUNT(DISTINCT spectral_type) AS n FROM stars',
    (n) => n === 7,
    '7'
  );

  await checkCount(
    client,
    db,
    '0 stars violating their spectral-type temperature band',
    `SELECT COUNT(*) AS n FROM stars WHERE NOT (
       (spectral_type = 'O' AND temperature_k BETWEEN 30000 AND 45000) OR
       (spectral_type = 'B' AND temperature_k BETWEEN 10000 AND 30000) OR
       (spectral_type = 'A' AND temperature_k BETWEEN 7500 AND 10000) OR
       (spectral_type = 'F' AND temperature_k BETWEEN 6000 AND 7500) OR
       (spectral_type = 'G' AND temperature_k BETWEEN 5200 AND 6000) OR
       (spectral_type = 'K' AND temperature_k BETWEEN 3700 AND 5200) OR
       (spectral_type = 'M' AND temperature_k BETWEEN 2400 AND 3700)
     )`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '>= 2 planetless stars',
    `SELECT COUNT(*) AS n FROM stars s
     WHERE NOT EXISTS (SELECT 1 FROM planets p WHERE p.star_id = s.star_id)`,
    (n) => n >= 2,
    '>= 2'
  );

  await checkCount(
    client,
    db,
    'a star exists with >= 7 planets',
    `SELECT MAX(cnt) AS n FROM (SELECT COUNT(*) AS cnt FROM planets GROUP BY star_id) t`,
    (n) => n >= 7,
    '>= 7'
  );

  await checkCount(
    client,
    db,
    '0 orphan planets (star_id not in stars)',
    `SELECT COUNT(*) AS n FROM planets p LEFT JOIN stars s ON p.star_id = s.star_id WHERE s.star_id IS NULL`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '0 orphan moons (planet_id not in planets)',
    `SELECT COUNT(*) AS n FROM moons m LEFT JOIN planets p ON m.planet_id = p.planet_id WHERE p.planet_id IS NULL`,
    (n) => n === 0,
    '0'
  );

  await checkRate(
    client,
    db,
    'mass_earth NULL rate near 35%',
    `SELECT COUNT(*) FILTER (WHERE mass_earth IS NULL) AS numerator, COUNT(*) AS denominator FROM planets`,
    0.28,
    0.42
  );

  await checkRate(
    client,
    db,
    'radius_earth NULL rate near 18%',
    `SELECT COUNT(*) FILTER (WHERE radius_earth IS NULL) AS numerator, COUNT(*) AS denominator FROM planets`,
    0.12,
    0.24
  );

  await checkCount(
    client,
    db,
    'ORDER BY ties exist (distance_ly)',
    `SELECT COUNT(*) AS n FROM (
       SELECT distance_ly FROM stars GROUP BY distance_ly HAVING COUNT(*) > 1
     ) t`,
    (n) => n >= 1,
    '>= 1 tie group'
  );

  await checkCount(
    client,
    db,
    'a GROUP BY ... HAVING group qualifies (stars with > 3 planets)',
    `SELECT COUNT(*) AS n FROM (
       SELECT star_id FROM planets GROUP BY star_id HAVING COUNT(*) > 3
     ) t`,
    (n) => n >= 1,
    '>= 1'
  );
}

// -------------------------------------------------------------------------------------------
// SIDELINE checks.
// -------------------------------------------------------------------------------------------

async function runSidelineChecks(client: PoolClient): Promise<void> {
  const db = 'sideline';

  await checkRowCountBands(client, db);

  await checkCount(
    client,
    db,
    '0 matches with winner not in {team_a, team_b} or team_a = team_b',
    `SELECT COUNT(*) AS n FROM match
     WHERE winner_team_id NOT IN (team_a_id, team_b_id) OR team_a_id = team_b_id`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    'map winners sum to every match score',
    `WITH agg AS (
       SELECT mr.match_id,
         SUM(CASE WHEN mr.winner_team_id = m.team_a_id THEN 1 ELSE 0 END) AS a_wins,
         SUM(CASE WHEN mr.winner_team_id = m.team_b_id THEN 1 ELSE 0 END) AS b_wins
       FROM map_result mr JOIN match m ON mr.match_id = m.match_id
       GROUP BY mr.match_id
     )
     SELECT COUNT(*) AS n FROM match m JOIN agg a ON a.match_id = m.match_id
     WHERE a.a_wins <> m.team_a_score OR a.b_wins <> m.team_b_score`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    'winner is the majority-map side for every match',
    `WITH agg AS (
       SELECT mr.match_id,
         SUM(CASE WHEN mr.winner_team_id = m.team_a_id THEN 1 ELSE 0 END) AS a_wins,
         SUM(CASE WHEN mr.winner_team_id = m.team_b_id THEN 1 ELSE 0 END) AS b_wins
       FROM map_result mr JOIN match m ON mr.match_id = m.match_id
       GROUP BY mr.match_id
     )
     SELECT COUNT(*) AS n FROM match m JOIN agg a ON a.match_id = m.match_id
     WHERE (CASE WHEN a.a_wins > a.b_wins THEN m.team_a_id
                 WHEN a.b_wins > a.a_wins THEN m.team_b_id
                 ELSE NULL END) IS DISTINCT FROM m.winner_team_id`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '>= 4 zero-win teams',
    `SELECT COUNT(*) AS n FROM team t
     WHERE NOT EXISTS (SELECT 1 FROM match m WHERE m.winner_team_id = t.team_id)`,
    (n) => n >= 4,
    '>= 4'
  );

  await checkCount(
    client,
    db,
    '>= 20 free agents',
    `SELECT COUNT(*) AS n FROM player WHERE team_id IS NULL`,
    (n) => n >= 20,
    '>= 20'
  );

  await checkCount(
    client,
    db,
    'every current player has exactly one open roster stint on their team',
    `SELECT COUNT(*) AS n FROM player p
     WHERE p.team_id IS NOT NULL
     AND (
       SELECT COUNT(*) FROM roster_change rc
       WHERE rc.player_id = p.player_id AND rc.to_date IS NULL AND rc.team_id = p.team_id
     ) <> 1`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '0 matches outside their tournament window',
    `SELECT COUNT(*) AS n FROM match m JOIN tournament t ON m.tournament_id = t.tournament_id
     WHERE m.match_datetime::date < t.start_date OR m.match_datetime::date > t.end_date`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    'all FKs valid (0 orphans: team/player/match/map_result/roster_change/team_sponsor)',
    `SELECT
       (SELECT COUNT(*) FROM team t LEFT JOIN region r ON t.region_id = r.region_id WHERE r.region_id IS NULL) +
       (SELECT COUNT(*) FROM player p LEFT JOIN team t ON p.team_id = t.team_id WHERE p.team_id IS NOT NULL AND t.team_id IS NULL) +
       (SELECT COUNT(*) FROM match m LEFT JOIN tournament t ON m.tournament_id = t.tournament_id WHERE t.tournament_id IS NULL) +
       (SELECT COUNT(*) FROM match m LEFT JOIN team ta ON m.team_a_id = ta.team_id WHERE ta.team_id IS NULL) +
       (SELECT COUNT(*) FROM match m LEFT JOIN team tb ON m.team_b_id = tb.team_id WHERE tb.team_id IS NULL) +
       (SELECT COUNT(*) FROM match m LEFT JOIN team tw ON m.winner_team_id = tw.team_id WHERE tw.team_id IS NULL) +
       (SELECT COUNT(*) FROM map_result mr LEFT JOIN match m ON mr.match_id = m.match_id WHERE m.match_id IS NULL) +
       (SELECT COUNT(*) FROM roster_change rc LEFT JOIN player p ON rc.player_id = p.player_id WHERE p.player_id IS NULL) +
       (SELECT COUNT(*) FROM roster_change rc LEFT JOIN team t ON rc.team_id = t.team_id WHERE t.team_id IS NULL) +
       (SELECT COUNT(*) FROM team_sponsor ts LEFT JOIN team t ON ts.team_id = t.team_id WHERE t.team_id IS NULL) +
       (SELECT COUNT(*) FROM team_sponsor ts LEFT JOIN sponsor s ON ts.sponsor_id = s.sponsor_id WHERE s.sponsor_id IS NULL)
       AS n`,
    (n) => n === 0,
    '0'
  );

  await checkRows(
    client,
    db,
    'anti-join "teams that never won" returns exactly the zero-win set (non-empty)',
    `SELECT
       (SELECT ARRAY_AGG(team_id ORDER BY team_id) FROM team
        WHERE NOT EXISTS (SELECT 1 FROM match m WHERE m.winner_team_id = team.team_id)) AS anti_join_ids,
       (SELECT ARRAY_AGG(team_id ORDER BY team_id) FROM (
          SELECT team_id FROM team EXCEPT SELECT winner_team_id FROM match
        ) t) AS except_ids`,
    (rows) => {
      const antiJoinIds: number[] = rows[0].anti_join_ids || [];
      const exceptIds: number[] = rows[0].except_ids || [];
      const sameSet =
        antiJoinIds.length === exceptIds.length && antiJoinIds.every((id, i) => id === exceptIds[i]);
      const pass = antiJoinIds.length >= 4 && sameSet;
      return {
        pass,
        detail: `anti_join=[${antiJoinIds.join(',')}] except=[${exceptIds.join(',')}] (expect non-empty, equal, >= 4)`,
      };
    }
  );
}

// -------------------------------------------------------------------------------------------
// ROVE checks.
// -------------------------------------------------------------------------------------------

async function runRoveChecks(client: PoolClient): Promise<void> {
  const db = 'rove';

  await checkRowCountBands(client, db);

  await checkCount(
    client,
    db,
    '45000 distinct master_customer_id',
    `SELECT COUNT(DISTINCT master_customer_id) AS n FROM customers`,
    (n) => n === 45000,
    '45000'
  );

  const moneyRecoverySql = (legacyCol: string, amountCol: string, table: string): string => `
    WITH stripped AS (
      SELECT ${amountCol} AS amount_cents, REGEXP_REPLACE(${legacyCol}, '[^0-9.]', '', 'g') AS digits
      FROM ${table}
      WHERE ${legacyCol} IS NOT NULL AND TRIM(${legacyCol}) <> ''
    ),
    classified AS (
      SELECT amount_cents,
        CASE WHEN digits ~ '^[0-9]+(\\.[0-9]+)?$' THEN ROUND(CAST(digits AS NUMERIC) * 100) ELSE NULL END AS recovered_cents
      FROM stripped
    )
    SELECT COUNT(*) AS denominator,
      COUNT(*) FILTER (WHERE recovered_cents IS DISTINCT FROM amount_cents) AS numerator
    FROM classified`;

  await checkRate(
    client,
    db,
    'order_total_legacy recovers amount_cents with zero failures on non-empty',
    moneyRecoverySql('order_total_legacy', 'amount_cents', 'orders'),
    0,
    0
  );

  await checkRate(
    client,
    db,
    'payments.amount_legacy recovers amount_cents with zero failures on non-empty',
    moneyRecoverySql('amount_legacy', 'amount_cents', 'payments'),
    0,
    0
  );

  await checkCount(
    client,
    db,
    'every ratings.stars in valid(1-5) UNION sentinel(0,6,-1,99)',
    `SELECT COUNT(*) AS n FROM ratings WHERE stars NOT IN (1, 2, 3, 4, 5, 0, 6, -1, 99)`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    'funnel timestamps are monotonic (placed <= accepted <= picked_up <= delivered)',
    `SELECT COUNT(*) AS n FROM orders
     WHERE (accepted_at IS NOT NULL AND accepted_at < placed_at)
        OR (picked_up_at IS NOT NULL AND accepted_at IS NOT NULL AND picked_up_at < accepted_at)
        OR (delivered_at IS NOT NULL AND picked_up_at IS NOT NULL AND delivered_at < picked_up_at)`,
    (n) => n === 0,
    '0'
  );

  const orderStatusClean = buildSynonymCaseSql('status');

  await checkCount(
    client,
    db,
    '0 delivered orders missing a funnel timestamp',
    `SELECT COUNT(*) AS n FROM orders
     WHERE ${orderStatusClean} = 'delivered'
     AND (accepted_at IS NULL OR picked_up_at IS NULL OR delivered_at IS NULL)`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '0 cancelled orders with a delivery timestamp',
    `SELECT COUNT(*) AS n FROM orders
     WHERE ${orderStatusClean} = 'cancelled' AND delivered_at IS NOT NULL`,
    (n) => n === 0,
    '0'
  );

  await checkCount(
    client,
    db,
    '0 orders whose courier was not active at accept',
    `SELECT COUNT(*) AS n FROM orders o JOIN couriers c ON o.courier_id = c.courier_id
     WHERE o.courier_id IS NOT NULL AND o.accepted_at IS NOT NULL
     AND NOT (
       c.activated_at IS NOT NULL AND c.activated_at <= o.accepted_at
       AND (c.churned_at IS NULL OR c.churned_at > o.accepted_at)
     )`,
    (n) => n === 0,
    '0'
  );

  await checkValue(
    client,
    db,
    "orders.placed_at is 'timestamp without time zone' (naive local)",
    `SELECT data_type AS v FROM information_schema.columns
     WHERE table_name = 'orders' AND column_name = 'placed_at'`,
    'timestamp without time zone'
  );

  // ---- Mess presence bounds ----

  await checkCount(
    client,
    db,
    'soft-deleted customers present',
    `SELECT COUNT(*) AS n FROM customers WHERE is_deleted`,
    (n) => n > 0,
    '> 0'
  );

  await checkCount(
    client,
    db,
    'soft-deleted support_tickets present',
    `SELECT COUNT(*) AS n FROM support_tickets WHERE is_deleted`,
    (n) => n > 0,
    '> 0'
  );

  await checkCount(
    client,
    db,
    'duplicate-payment orders present',
    `SELECT COUNT(*) AS n FROM (
       SELECT order_id FROM payments GROUP BY order_id HAVING COUNT(*) > 1
     ) t`,
    (n) => n > 0,
    '> 0'
  );

  await checkCount(
    client,
    db,
    'event_log total row count exceeds 1.2M',
    `SELECT COUNT(*) AS n FROM event_log`,
    (n) => n > 1200000,
    '> 1200000'
  );

  await checkCount(
    client,
    db,
    'duplicate event_log rows present (natural key session_id + event_type)',
    `SELECT COUNT(*) AS n FROM (
       SELECT session_id, event_type FROM event_log GROUP BY session_id, event_type HAVING COUNT(*) > 1
     ) t`,
    (n) => n > 0,
    '> 0'
  );

  await checkCount(
    client,
    db,
    'dirty phone formats present (customers + couriers)',
    `SELECT
       (SELECT COUNT(*) FROM customers
        WHERE phone IS NOT NULL AND phone NOT IN (${NULL_SENTINEL_SQL_LIST})
        AND phone !~ '^\\(\\d{3}\\) 555-\\d{4}$') +
       (SELECT COUNT(*) FROM couriers WHERE phone !~ '^\\(\\d{3}\\) 555-\\d{4}$')
       AS n`,
    (n) => n > 0,
    '> 0'
  );

  await checkCount(
    client,
    db,
    'string NULL-sentinels present (full_name, phone, promo_code)',
    `SELECT
       (SELECT COUNT(*) FROM customers WHERE full_name IN (${NULL_SENTINEL_SQL_LIST})) +
       (SELECT COUNT(*) FROM customers WHERE phone IN (${NULL_SENTINEL_SQL_LIST})) +
       (SELECT COUNT(*) FROM orders WHERE promo_id IS NULL AND promo_code IN (${NULL_SENTINEL_SQL_LIST}))
       AS n`,
    (n) => n > 0,
    '> 0'
  );

  // ---- R08 / R15 metric separation: NEVER conflated, measured over disjoint order slices. ----

  await checkRate(
    client,
    db,
    'R08: promo_code orphan rate among promo_id IS NOT NULL orders (expect ~8-10%)',
    `SELECT COUNT(*) AS denominator,
       COUNT(*) FILTER (
         WHERE UPPER(REGEXP_REPLACE(COALESCE(o.promo_code, ''), '^\\s+|\\s+$', '', 'g')) <> UPPER(p.code)
       ) AS numerator
     FROM orders o JOIN promos p ON o.promo_id = p.promo_id`,
    0.04,
    0.16
  );

  await checkRate(
    client,
    db,
    'R15: promo_code NULL-sentinel rate among promo_id IS NULL orders (expect ~3-5%)',
    `SELECT COUNT(*) AS denominator,
       COUNT(*) FILTER (WHERE promo_code IN (${NULL_SENTINEL_SQL_LIST})) AS numerator
     FROM orders WHERE promo_id IS NULL`,
    0.02,
    0.07
  );

  // ---- Pattern-expressibility ----

  await checkRows(
    client,
    db,
    'funnel query returns strictly decreasing counts across stages',
    `SELECT COUNT(*) AS placed,
       COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) AS accepted,
       COUNT(*) FILTER (WHERE picked_up_at IS NOT NULL) AS picked_up,
       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered
     FROM orders`,
    (rows) => {
      const r = rows[0];
      const placed = Number(r.placed);
      const accepted = Number(r.accepted);
      const pickedUp = Number(r.picked_up);
      const delivered = Number(r.delivered);
      const pass = placed > accepted && accepted > pickedUp && pickedUp > delivered;
      return { pass, detail: `placed=${placed} accepted=${accepted} picked_up=${pickedUp} delivered=${delivered}` };
    }
  );

  await checkRows(
    client,
    db,
    'RANK shows gaps DENSE_RANK does not (couriers by lifetime_deliveries within city)',
    `SELECT home_city_id, MAX(rnk) AS max_rank, MAX(drnk) AS max_dense_rank FROM (
       SELECT home_city_id,
         RANK() OVER (PARTITION BY home_city_id ORDER BY lifetime_deliveries DESC) AS rnk,
         DENSE_RANK() OVER (PARTITION BY home_city_id ORDER BY lifetime_deliveries DESC) AS drnk
       FROM couriers
     ) t
     GROUP BY home_city_id`,
    (rows) => {
      const citiesWithGap = rows.filter((r) => Number(r.max_rank) > Number(r.max_dense_rank)).length;
      return {
        pass: citiesWithGap >= 1,
        detail: `${citiesWithGap} of ${rows.length} cities show RANK > DENSE_RANK (expect >= 1)`,
      };
    }
  );

  await checkRows(
    client,
    db,
    'monthly retention cohort curve is monotonic non-increasing',
    `WITH cohorts AS (
       SELECT customer_id, date_trunc('month', signup_ts) AS cohort_month FROM customers
     ),
     cohort_sizes AS (
       SELECT cohort_month, COUNT(*) AS n FROM cohorts GROUP BY cohort_month ORDER BY cohort_month LIMIT 12
     ),
     best AS (
       SELECT cohort_month FROM cohort_sizes ORDER BY n DESC LIMIT 1
     ),
     cohort_customers AS (
       SELECT c.customer_id FROM cohorts c JOIN best b ON c.cohort_month = b.cohort_month
     ),
     order_months AS (
       SELECT DISTINCT o.customer_id, date_trunc('month', o.placed_at) AS order_month
       FROM orders o JOIN cohort_customers cc ON o.customer_id = cc.customer_id
     )
     SELECT gs.offset_n,
       (SELECT COUNT(*) FROM order_months om, best b
        WHERE om.order_month = b.cohort_month + (gs.offset_n || ' months')::interval
       ) AS retained
     FROM generate_series(0, 7) AS gs(offset_n)
     ORDER BY gs.offset_n`,
    (rows) => {
      const curve = rows.map((r) => Number(r.retained));
      let monotonic = true;
      for (let i = 1; i < curve.length; i += 1) {
        if (curve[i] > curve[i - 1]) monotonic = false;
      }
      return { pass: monotonic && curve[0] > 0, detail: `curve=[${curve.join(', ')}]` };
    }
  );

  // ---- Adversarial: offensive-text scan ----

  const bannedScanTargets: { table: string; column: string; where?: string }[] = [
    { table: 'customers', column: 'full_name' },
    { table: 'couriers', column: 'full_name' },
    { table: 'merchants', column: 'name' },
    { table: 'cities', column: 'name' },
    { table: 'promos', column: 'code' },
    { table: 'ratings', column: 'comment', where: 'comment IS NOT NULL' },
  ];

  for (const target of bannedScanTargets) {
    const sql = `SELECT DISTINCT ${target.column} AS v FROM ${target.table}${target.where ? ` WHERE ${target.where}` : ''}`;
    await checkRows(client, db, `offensive-text scan: ${target.table}.${target.column}`, sql, (rows) => {
      const hits = rows.filter((r) => r.v !== null && containsBanned(String(r.v))).length;
      return { pass: hits === 0, detail: `${hits} banned-token hits across ${rows.length} distinct values` };
    });
  }

  // ---- Adversarial: PII-shape scan (emails, phones) ----

  await checkRows(
    client,
    db,
    'customers.email is never real-looking (normalized: mailto:/whitespace stripped, typo domains resolved)',
    `SELECT email AS v FROM customers WHERE email IS NOT NULL`,
    (rows) => {
      let hits = 0;
      for (const r of rows) {
        let s = String(r.v).trim();
        if (s.toLowerCase().startsWith('mailto:')) s = s.slice(7);
        s = s.replace(/\s+/g, '');
        const at = s.lastIndexOf('@');
        if (at >= 0) {
          const local = s.slice(0, at);
          const domain = s.slice(at + 1).toLowerCase();
          const canonicalDomain = EMAIL_TYPO_MAP[domain] ?? domain;
          s = `${local}@${canonicalDomain}`;
        }
        if (looksLikeRealEmail(s)) hits += 1;
      }
      return { pass: hits === 0, detail: `${hits} real-looking emails across ${rows.length} rows` };
    }
  );

  await checkRows(
    client,
    db,
    'customers.phone is never real-looking (555 exchange, sentinel rows excluded)',
    `SELECT phone AS v FROM customers WHERE phone IS NOT NULL`,
    (rows) => {
      let checked = 0;
      let hits = 0;
      for (const r of rows) {
        const s = String(r.v);
        if (NULL_SENTINELS.includes(s)) continue;
        checked += 1;
        if (looksLikeRealPhone(s)) hits += 1;
      }
      return { pass: hits === 0, detail: `${hits} real-looking phones across ${checked} checked rows` };
    }
  );

  await checkRows(client, db, 'couriers.phone is never real-looking (555 exchange)', `SELECT phone AS v FROM couriers`, (rows) => {
    const hits = rows.filter((r) => looksLikeRealPhone(String(r.v))).length;
    return { pass: hits === 0, detail: `${hits} real-looking phones across ${rows.length} rows` };
  });
}

// -------------------------------------------------------------------------------------------
// Main.
// -------------------------------------------------------------------------------------------

async function runDbChecks(db: string, runner: (client: PoolClient) => Promise<void>): Promise<void> {
  const pool = new Pool(buildClientConfig(db, process.env));
  try {
    const client = await pool.connect();
    try {
      await runner(client);
    } finally {
      client.release();
    }
  } catch (err) {
    record(db, 'connect + run checks', false, `failed to connect or run checks: ${(err as Error).message}`);
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  await runDbChecks('aperture', runApertureChecks);
  await runDbChecks('sideline', runSidelineChecks);
  await runDbChecks('rove', runRoveChecks);

  const failureCount = printReport();
  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('verify-datasets crashed:', err);
  process.exit(1);
});
