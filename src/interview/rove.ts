import type { DraftInterviewProblem } from './types';

// Hand-crafted, business-framed interview problems on the Rove (gig delivery/mobility marketplace) database.
// Rove is large (520k orders, 1.2M events) and intentionally messy: dirty status/money text, NULL
// sentinels, duplicate payments, orphaned rows, stale offsets, and a self-referencing category tree.
// Every problem is bounded to one city and/or a fixed window (or a small aggregate) so results stay
// deterministic and <= 200 rows. Validated + fingerprinted by scripts/validate-interview.ts.
export const ROVE_INTERVIEW: DraftInterviewProblem[] = [
  {
    id: 'iv-rv-payment-dedup-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Deduplication',
    difficulty: 3,
    scenario:
      "You are the revenue analyst at Rove. Finance found that the payments table sometimes holds more than one row per order because the app retries a capture, so gross revenue looks inflated. They want the Chicago books for 2021 restated after collapsing each order's retries down to a single payment.",
    task:
      "For orders in city_id 8 with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01), keep exactly one payment row per order: the earliest by authorized_at, breaking ties by the lower payment_id. Return one row per calendar month of placed_at with order_month (first day of the month, a date), orders (orders kept), dup_payment_rows_removed (payment rows dropped as retries), and deduped_amount_cents (sum of amount_cents over the kept rows). Order by order_month ascending.",
    expectedSql: `WITH ranked AS (
  SELECT p.order_id,
         p.amount_cents,
         o.placed_at,
         ROW_NUMBER() OVER (PARTITION BY p.order_id ORDER BY p.authorized_at, p.payment_id) AS rn
  FROM orders o
  JOIN payments p ON p.order_id = o.order_id
  WHERE o.city_id = 8
    AND o.placed_at >= DATE '2021-01-01'
    AND o.placed_at <  DATE '2022-01-01'
)
SELECT date_trunc('month', placed_at)::date AS order_month,
       count(*) FILTER (WHERE rn = 1) AS orders,
       count(*) FILTER (WHERE rn > 1) AS dup_payment_rows_removed,
       sum(amount_cents) FILTER (WHERE rn = 1) AS deduped_amount_cents
FROM ranked
GROUP BY 1
ORDER BY 1`,
    modelAnswer: `-- Rank the payments inside each order; rn = 1 is the true capture, rn > 1 are retries.
WITH ranked AS (
  SELECT p.order_id,
         p.amount_cents,
         o.placed_at,
         ROW_NUMBER() OVER (PARTITION BY p.order_id
                            ORDER BY p.authorized_at, p.payment_id) AS rn
  FROM orders o
  JOIN payments p ON p.order_id = o.order_id
  WHERE o.city_id = 8
    AND o.placed_at >= DATE '2021-01-01'
    AND o.placed_at <  DATE '2022-01-01'
)
-- Aggregate only the rn = 1 rows for revenue; count rn > 1 as the retries removed.
SELECT date_trunc('month', placed_at)::date AS order_month,
       count(*) FILTER (WHERE rn = 1) AS orders,
       count(*) FILTER (WHERE rn > 1) AS dup_payment_rows_removed,
       sum(amount_cents) FILTER (WHERE rn = 1) AS deduped_amount_cents
FROM ranked
GROUP BY 1
ORDER BY 1;`,
    approachNote:
      'Number payments within each order with ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY authorized_at, payment_id); rn = 1 is the canonical capture and rn > 1 are the retries. The common wrong turn is joining payments to orders and summing amount_cents without deduping first, which double counts every retried order and overstates revenue.',
    orderMatters: true,
    rowCeiling: 12,
  },
  {
    id: 'iv-rv-courier-top3-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Top-N per group',
    difficulty: 2,
    scenario:
      'You are the operations analyst at Rove. Each regional ops lead wants their busiest couriers surfaced for a loyalty bonus. lifetime_deliveries has genuine ties at the top of several cities, and a tied courier must not be silently dropped from the list.',
    task:
      'For every home_city_id, rank couriers by lifetime_deliveries descending using RANK() so tied couriers share a rank, and return all couriers whose rank is 3 or better. Output home_city_id, courier_id, lifetime_deliveries, and rnk. Order by home_city_id ascending, lifetime_deliveries descending, then courier_id ascending.',
    expectedSql: `WITH ranked AS (
  SELECT home_city_id,
         courier_id,
         lifetime_deliveries,
         RANK() OVER (PARTITION BY home_city_id ORDER BY lifetime_deliveries DESC) AS rnk
  FROM couriers
)
SELECT home_city_id, courier_id, lifetime_deliveries, rnk
FROM ranked
WHERE rnk <= 3
ORDER BY home_city_id, lifetime_deliveries DESC, courier_id`,
    modelAnswer: `-- RANK() keeps every member of a tie at the same rank, so tied leaders both survive rnk <= 3.
WITH ranked AS (
  SELECT home_city_id,
         courier_id,
         lifetime_deliveries,
         RANK() OVER (PARTITION BY home_city_id
                      ORDER BY lifetime_deliveries DESC) AS rnk
  FROM couriers
)
SELECT home_city_id, courier_id, lifetime_deliveries, rnk
FROM ranked
WHERE rnk <= 3
ORDER BY home_city_id, lifetime_deliveries DESC, courier_id;`,
    approachNote:
      'RANK() assigns the same rank to ties and then skips, so filtering rnk <= 3 returns all tied couriers. ROW_NUMBER() would arbitrarily pick one of two couriers tied at the top and hide the other, which is the classic wrong turn. DENSE_RANK() is not interchangeable: because it does not skip after a tie, rnk <= 3 would admit an extra tier of couriers.',
    orderMatters: true,
    rowCeiling: 48,
  },
  {
    id: 'iv-rv-acquisition-funnel-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Funnel',
    difficulty: 3,
    scenario:
      'You are the growth product analyst at Rove. The PM for the Chicago market wants the classic app funnel for January 2021 to see how many shoppers move from opening the app toward placing an order.',
    task:
      "Using event_log for city_id 8 with event_ts in January 2021 (>= 2021-01-01 and < 2021-02-01), count the distinct customers who performed each of the six funnel event types (app_open, search, view_merchant, add_to_cart, checkout_start, order_placed). Return stage_rank (1 for app_open through 6 for order_placed), stage (the event_type), customers (distinct customer_id), and pct_of_entry (customers as a percentage of the app_open count, rounded to 1 decimal). Order by stage_rank ascending.",
    expectedSql: `WITH stage_counts AS (
  SELECT CASE event_type
           WHEN 'app_open'       THEN 1
           WHEN 'search'         THEN 2
           WHEN 'view_merchant'  THEN 3
           WHEN 'add_to_cart'    THEN 4
           WHEN 'checkout_start' THEN 5
           WHEN 'order_placed'   THEN 6
         END AS stage_rank,
         event_type AS stage,
         count(DISTINCT customer_id) AS customers
  FROM event_log
  WHERE city_id = 8
    AND event_ts >= DATE '2021-01-01'
    AND event_ts <  DATE '2021-02-01'
    AND event_type IN ('app_open','search','view_merchant','add_to_cart','checkout_start','order_placed')
  GROUP BY 1, 2
)
SELECT stage_rank,
       stage,
       customers,
       round(100.0 * customers / first_value(customers) OVER (ORDER BY stage_rank), 1) AS pct_of_entry
FROM stage_counts
ORDER BY stage_rank`,
    modelAnswer: `-- Distinct customers per stage, with a fixed stage ordering supplied by a CASE.
WITH stage_counts AS (
  SELECT CASE event_type
           WHEN 'app_open'       THEN 1
           WHEN 'search'         THEN 2
           WHEN 'view_merchant'  THEN 3
           WHEN 'add_to_cart'    THEN 4
           WHEN 'checkout_start' THEN 5
           WHEN 'order_placed'   THEN 6
         END AS stage_rank,
         event_type AS stage,
         count(DISTINCT customer_id) AS customers
  FROM event_log
  WHERE city_id = 8
    AND event_ts >= DATE '2021-01-01'
    AND event_ts <  DATE '2021-02-01'
    AND event_type IN ('app_open','search','view_merchant',
                       'add_to_cart','checkout_start','order_placed')
  GROUP BY 1, 2
)
-- first_value over the stage order grabs the entry-stage (app_open) count as the denominator.
SELECT stage_rank,
       stage,
       customers,
       round(100.0 * customers
             / first_value(customers) OVER (ORDER BY stage_rank), 1) AS pct_of_entry
FROM stage_counts
ORDER BY stage_rank;`,
    approachNote:
      'Count DISTINCT customer_id per event_type, attach the fixed stage order with a CASE, and divide by the entry-stage count taken with first_value() over the stage order. This is a reach funnel (did the customer ever do the step in the window) so it can be non-monotonic here, with view_merchant above search. Summing raw event rows instead of counting distinct customers inflates every stage with repeat actions.',
    orderMatters: true,
    rowCeiling: 6,
  },
  {
    id: 'iv-rv-cohort-retention-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Cohort retention',
    difficulty: 3,
    scenario:
      'You are the retention analyst at Rove. Leadership wants to know how sticky new Chicago customers are: of the shoppers who placed their first Chicago order in a given 2021 month, what share return and order again in each of the next three months.',
    task:
      "Define each customer's Chicago cohort as the month (first day of month) of their earliest order in city_id 8, and keep cohorts from January through June 2021. For month_offset 0 through 3 (whole calendar months after the cohort month), a customer is retained at that offset if they placed any city_id 8 order in that month. Return cohort_month (date), month_offset (integer), cohort_size (customers in the cohort), retained (distinct retained customers), and retention_pct (100 * retained / cohort_size, rounded to 1 decimal). Order by cohort_month ascending, then month_offset ascending.",
    expectedSql: `WITH first_order AS (
  SELECT customer_id,
         min(date_trunc('month', placed_at)) AS cohort_month
  FROM orders
  WHERE city_id = 8
  GROUP BY customer_id
),
cohorts AS (
  SELECT customer_id, cohort_month
  FROM first_order
  WHERE cohort_month >= DATE '2021-01-01'
    AND cohort_month <  DATE '2021-07-01'
),
sizes AS (
  SELECT cohort_month, count(*) AS cohort_size
  FROM cohorts
  GROUP BY cohort_month
),
active AS (
  SELECT DISTINCT c.cohort_month,
         c.customer_id,
         ((extract(year FROM o.placed_at) * 12 + extract(month FROM o.placed_at))
        - (extract(year FROM c.cohort_month) * 12 + extract(month FROM c.cohort_month)))::int AS month_offset
  FROM cohorts c
  JOIN orders o ON o.customer_id = c.customer_id AND o.city_id = 8
)
SELECT a.cohort_month::date AS cohort_month,
       a.month_offset,
       s.cohort_size,
       count(DISTINCT a.customer_id) AS retained,
       round(100.0 * count(DISTINCT a.customer_id) / s.cohort_size, 1) AS retention_pct
FROM active a
JOIN sizes s ON s.cohort_month = a.cohort_month
WHERE a.month_offset BETWEEN 0 AND 3
GROUP BY a.cohort_month, a.month_offset, s.cohort_size
ORDER BY a.cohort_month, a.month_offset`,
    modelAnswer: `-- Each customer's cohort is the month of their first Chicago order.
WITH first_order AS (
  SELECT customer_id,
         min(date_trunc('month', placed_at)) AS cohort_month
  FROM orders
  WHERE city_id = 8
  GROUP BY customer_id
),
cohorts AS (   -- keep the H1 2021 cohorts
  SELECT customer_id, cohort_month
  FROM first_order
  WHERE cohort_month >= DATE '2021-01-01'
    AND cohort_month <  DATE '2021-07-01'
),
sizes AS (     -- denominator: customers per cohort
  SELECT cohort_month, count(*) AS cohort_size
  FROM cohorts
  GROUP BY cohort_month
),
active AS (    -- every later Chicago month each cohort customer was active, as a whole-month offset
  SELECT DISTINCT c.cohort_month,
         c.customer_id,
         ((extract(year FROM o.placed_at) * 12 + extract(month FROM o.placed_at))
        - (extract(year FROM c.cohort_month) * 12 + extract(month FROM c.cohort_month)))::int
           AS month_offset
  FROM cohorts c
  JOIN orders o ON o.customer_id = c.customer_id AND o.city_id = 8
)
SELECT a.cohort_month::date AS cohort_month,
       a.month_offset,
       s.cohort_size,
       count(DISTINCT a.customer_id) AS retained,
       round(100.0 * count(DISTINCT a.customer_id) / s.cohort_size, 1) AS retention_pct
FROM active a
JOIN sizes s ON s.cohort_month = a.cohort_month
WHERE a.month_offset BETWEEN 0 AND 3
GROUP BY a.cohort_month, a.month_offset, s.cohort_size
ORDER BY a.cohort_month, a.month_offset;`,
    approachNote:
      "Compute each customer's first Chicago order month with min(date_trunc('month', placed_at)), then join their later Chicago orders back and derive the whole-month gap from year*12 + month arithmetic. month_offset 0 is 100 percent by construction. Common wrong turns are measuring the offset as raw day differences, or reusing a global first-order month instead of the city-scoped one, which drops customers into the wrong cohort.",
    orderMatters: true,
    rowCeiling: 24,
  },
  {
    id: 'iv-rv-sessionization-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Sessionization',
    difficulty: 3,
    scenario:
      'You are the product analytics engineer at Rove. The app does not persist a usable session id, so you reconstruct sessions from the raw event stream: a session ends after 30 minutes of a customer being inactive, and their next event starts a new one.',
    task:
      "For event_log rows in city_id 8 with event_ts from 2021-01-04 up to (but not including) 2021-01-11, reconstruct sessions per customer: a new session starts on a customer's first event or whenever the gap from their previous event exceeds 30 minutes (order a customer's events by event_ts then event_id). Assign each session to the calendar date of its first event. Return session_day (date), sessions (sessions starting that day), total_events (events in those sessions), and avg_events_per_session (total_events / sessions, rounded to 2 decimals). Order by session_day ascending.",
    expectedSql: `WITH ev AS (
  SELECT customer_id,
         event_id,
         event_ts,
         CASE
           WHEN lag(event_ts) OVER w IS NULL
             OR event_ts - lag(event_ts) OVER w > INTERVAL '30 minutes'
           THEN 1 ELSE 0
         END AS is_new_session
  FROM event_log
  WHERE city_id = 8
    AND event_ts >= DATE '2021-01-04'
    AND event_ts <  DATE '2021-01-11'
  WINDOW w AS (PARTITION BY customer_id ORDER BY event_ts, event_id)
),
marked AS (
  SELECT customer_id,
         event_ts,
         sum(is_new_session) OVER (PARTITION BY customer_id ORDER BY event_ts, event_id
                                   ROWS UNBOUNDED PRECEDING) AS session_seq
  FROM ev
),
sessions AS (
  SELECT customer_id,
         session_seq,
         min(event_ts)::date AS session_day,
         count(*) AS events
  FROM marked
  GROUP BY customer_id, session_seq
)
SELECT session_day,
       count(*) AS sessions,
       sum(events) AS total_events,
       round(avg(events), 2) AS avg_events_per_session
FROM sessions
GROUP BY session_day
ORDER BY session_day`,
    modelAnswer: `-- Flag a session boundary when the inactivity gap exceeds 30 minutes (or it is the first event).
WITH ev AS (
  SELECT customer_id,
         event_id,
         event_ts,
         CASE
           WHEN lag(event_ts) OVER w IS NULL
             OR event_ts - lag(event_ts) OVER w > INTERVAL '30 minutes'
           THEN 1 ELSE 0
         END AS is_new_session
  FROM event_log
  WHERE city_id = 8
    AND event_ts >= DATE '2021-01-04'
    AND event_ts <  DATE '2021-01-11'
  WINDOW w AS (PARTITION BY customer_id ORDER BY event_ts, event_id)
),
marked AS (   -- running sum of the boundary flag numbers each customer's sessions
  SELECT customer_id,
         event_ts,
         sum(is_new_session) OVER (PARTITION BY customer_id ORDER BY event_ts, event_id
                                   ROWS UNBOUNDED PRECEDING) AS session_seq
  FROM ev
),
sessions AS (  -- one row per reconstructed session, dated by its first event
  SELECT customer_id,
         session_seq,
         min(event_ts)::date AS session_day,
         count(*) AS events
  FROM marked
  GROUP BY customer_id, session_seq
)
SELECT session_day,
       count(*) AS sessions,
       sum(events) AS total_events,
       round(avg(events), 2) AS avg_events_per_session
FROM sessions
GROUP BY session_day
ORDER BY session_day;`,
    approachNote:
      'Classic gaps-and-islands: mark a boundary with lag(event_ts) when the gap exceeds 30 minutes, take a running sum of the boundary flag per customer to number sessions, then group by (customer, session number). Include event_id in every window ORDER BY so events sharing a timestamp sequence deterministically. Do not substitute the stored session_id: the task defines sessions by the 30-minute rule and the generator grouping will not match it exactly. Forgetting PARTITION BY customer_id leaks gaps across customers.',
    orderMatters: true,
    rowCeiling: 7,
  },
  {
    id: 'iv-rv-orders-movingavg-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Moving average',
    difficulty: 2,
    scenario:
      'You are the demand analyst at Rove. The Chicago ops team wants a smoothed view of daily completed-order volume for the first quarter of 2021 so that weekday and weekend swings do not obscure the underlying trend.',
    task:
      "Build a gap-free daily date spine from 2021-01-01 through 2021-03-31 and, for city_id 8, count completed orders per day (status, trimmed and lower-cased, in delivered, completed, fulfilled) joined onto the spine so days with no orders show 0. Return order_date (date), daily_orders (integer), and ma_7 (the trailing 7-day average of daily_orders over the current day and the 6 prior days, rounded to 2 decimals). Order by order_date ascending.",
    expectedSql: `WITH spine AS (
  SELECT generate_series(DATE '2021-01-01', DATE '2021-03-31', INTERVAL '1 day')::date AS d
),
daily AS (
  SELECT placed_at::date AS d,
         count(*) AS orders
  FROM orders
  WHERE city_id = 8
    AND lower(btrim(status)) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-01-01'
    AND placed_at <  DATE '2021-04-01'
  GROUP BY placed_at::date
)
SELECT s.d AS order_date,
       coalesce(dl.orders, 0) AS daily_orders,
       round(avg(coalesce(dl.orders, 0)) OVER (ORDER BY s.d
                                               ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7
FROM spine s
LEFT JOIN daily dl ON dl.d = s.d
ORDER BY s.d`,
    modelAnswer: `-- generate_series gives a gap-free spine so zero-order days are not skipped.
WITH spine AS (
  SELECT generate_series(DATE '2021-01-01', DATE '2021-03-31', INTERVAL '1 day')::date AS d
),
daily AS (   -- completed-order counts, tolerating the dirty status casing/synonyms
  SELECT placed_at::date AS d,
         count(*) AS orders
  FROM orders
  WHERE city_id = 8
    AND lower(btrim(status)) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-01-01'
    AND placed_at <  DATE '2021-04-01'
  GROUP BY placed_at::date
)
-- Trailing 7-row window over the spine equals a true 7 calendar days because there are no gaps.
SELECT s.d AS order_date,
       coalesce(dl.orders, 0) AS daily_orders,
       round(avg(coalesce(dl.orders, 0)) OVER (ORDER BY s.d
                                               ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS ma_7
FROM spine s
LEFT JOIN daily dl ON dl.d = s.d
ORDER BY s.d;`,
    approachNote:
      'Left join the daily counts onto a generate_series spine so absent days become 0, then average with AVG(...) OVER (ORDER BY order_date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW). Computing the average straight from orders without the spine is the usual mistake: missing days vanish and the 7-row window silently spans more than 7 calendar days.',
    orderMatters: true,
    rowCeiling: 90,
  },
  {
    id: 'iv-rv-money-text-clean-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Money-text cleaning',
    difficulty: 3,
    scenario:
      'You are the finance data analyst at Rove. An older ingest wrote each order total into order_total_legacy as free text: some values carry a dollar sign, some a USD prefix or suffix, some are blank or NULL. Before that column can be deprecated you must show it reconciles to the clean amount_cents.',
    task:
      'For city_id 8 orders with placed_at in February 2021 (>= 2021-02-01 and < 2021-03-01), parse order_total_legacy into a numeric dollar amount by stripping every character that is not a digit or a period, treating an empty result or NULL as unparseable. Return one row per day: order_date (date), orders (total orders), parsed_orders (orders whose legacy text parsed), missing_legacy (orders that did not parse), and parsed_cents (sum over parsed orders of parsed dollars times 100, rounded to whole cents, as a bigint). Order by order_date ascending.',
    expectedSql: `WITH parsed AS (
  SELECT placed_at::date AS d,
         amount_cents,
         nullif(regexp_replace(coalesce(order_total_legacy, ''), '[^0-9.]', '', 'g'), '')::numeric AS legacy_dollars
  FROM orders
  WHERE city_id = 8
    AND placed_at >= DATE '2021-02-01'
    AND placed_at <  DATE '2021-03-01'
)
SELECT d AS order_date,
       count(*) AS orders,
       count(legacy_dollars) AS parsed_orders,
       count(*) - count(legacy_dollars) AS missing_legacy,
       coalesce(sum(round(legacy_dollars * 100)), 0)::bigint AS parsed_cents
FROM parsed
GROUP BY d
ORDER BY d`,
    modelAnswer: `-- Strip anything but digits/period, turn '' into NULL, then cast to numeric dollars.
WITH parsed AS (
  SELECT placed_at::date AS d,
         amount_cents,
         nullif(regexp_replace(coalesce(order_total_legacy, ''), '[^0-9.]', '', 'g'), '')::numeric
           AS legacy_dollars
  FROM orders
  WHERE city_id = 8
    AND placed_at >= DATE '2021-02-01'
    AND placed_at <  DATE '2021-03-01'
)
-- count(legacy_dollars) ignores NULLs, so it counts only rows that parsed.
SELECT d AS order_date,
       count(*) AS orders,
       count(legacy_dollars) AS parsed_orders,
       count(*) - count(legacy_dollars) AS missing_legacy,
       coalesce(sum(round(legacy_dollars * 100)), 0)::bigint AS parsed_cents
FROM parsed
GROUP BY d
ORDER BY d;`,
    approachNote:
      "Strip formatting with regexp_replace(text, '[^0-9.]', '', 'g'), collapse '' to NULL with nullif, then cast to numeric; count() of the parsed column counts only non-NULL parses. Multiplying parsed dollars by 100 reconciles exactly to amount_cents on every parseable row. Typical mistakes are casting the raw text directly (it errors on the $ and USD tokens) or treating blank strings as zero, which understates missing_legacy.",
    orderMatters: true,
    rowCeiling: 28,
  },
  {
    id: 'iv-rv-tip-bucketing-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Bucketing',
    difficulty: 2,
    scenario:
      'You are the courier economics analyst at Rove. A NULL tip means the shopper left none, which is different from a recorded 0, and the team wants Chicago tipping grouped into bands for a courier-pay proposal.',
    task:
      "For city_id 8 completed orders (status trimmed and lower-cased in delivered, completed, fulfilled) with placed_at in Q1 2021 (>= 2021-01-01 and < 2021-04-01), treat a NULL tip_cents as 0 and bucket each order by effective tip into '1: none' (exactly 0), '2: under $2' (1 to 199 cents), '3: $2 to $5' (200 to 499 cents), and '4: $5 plus' (500 or more). Return tip_bucket, orders (count), and pct_of_orders (100 * orders / total, rounded to 1 decimal). Order by tip_bucket ascending.",
    expectedSql: `WITH tips AS (
  SELECT coalesce(tip_cents, 0) AS tip
  FROM orders
  WHERE city_id = 8
    AND lower(btrim(status)) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-01-01'
    AND placed_at <  DATE '2021-04-01'
)
SELECT CASE
         WHEN tip = 0   THEN '1: none'
         WHEN tip < 200 THEN '2: under $2'
         WHEN tip < 500 THEN '3: $2 to $5'
         ELSE '4: $5 plus'
       END AS tip_bucket,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders
FROM tips
GROUP BY 1
ORDER BY 1`,
    modelAnswer: `-- COALESCE collapses the NULL-vs-0 distinction the business cares about into an effective tip.
WITH tips AS (
  SELECT coalesce(tip_cents, 0) AS tip
  FROM orders
  WHERE city_id = 8
    AND lower(btrim(status)) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-01-01'
    AND placed_at <  DATE '2021-04-01'
)
-- Labels are prefixed 1..4 so a plain ascending sort orders the bands; the window is the grand total.
SELECT CASE
         WHEN tip = 0   THEN '1: none'
         WHEN tip < 200 THEN '2: under $2'
         WHEN tip < 500 THEN '3: $2 to $5'
         ELSE '4: $5 plus'
       END AS tip_bucket,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders
FROM tips
GROUP BY 1
ORDER BY 1;`,
    approachNote:
      'coalesce(tip_cents, 0) folds the NULL-versus-0 distinction into an effective tip, then a CASE assigns bands whose numeric label prefixes make a plain sort correct. pct uses sum(count(*)) OVER () as the grand-total denominator in one pass. The common wrong turn is filtering out NULL tips (dropping roughly 40 percent of orders) or comparing tip_cents to the thresholds without COALESCE, so NULL rows fall through every branch.',
    orderMatters: true,
    rowCeiling: 4,
  },
  {
    id: 'iv-rv-orphan-orders-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the data quality analyst at Rove. When a shopper is purged for privacy their customers row is deleted but their historical orders remain, leaving orders that point at a customer_id no longer in the table. You need to size that orphaned volume for Chicago.',
    task:
      'For city_id 8 orders with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01), find orders whose customer_id has no matching row in customers. Return one row per calendar month: order_month (first day of the month, a date), orphaned_orders (count), and orphaned_amount_cents (sum of amount_cents). Order by order_month ascending.',
    expectedSql: `SELECT date_trunc('month', o.placed_at)::date AS order_month,
       count(*) AS orphaned_orders,
       sum(o.amount_cents) AS orphaned_amount_cents
FROM orders o
WHERE o.city_id = 8
  AND o.placed_at >= DATE '2021-01-01'
  AND o.placed_at <  DATE '2022-01-01'
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)
GROUP BY 1
ORDER BY 1`,
    modelAnswer: `-- Anti-join: keep only orders with no surviving customer row, then roll up by month.
SELECT date_trunc('month', o.placed_at)::date AS order_month,
       count(*) AS orphaned_orders,
       sum(o.amount_cents) AS orphaned_amount_cents
FROM orders o
WHERE o.city_id = 8
  AND o.placed_at >= DATE '2021-01-01'
  AND o.placed_at <  DATE '2022-01-01'
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)
GROUP BY 1
ORDER BY 1;`,
    approachNote:
      'Anti-join with NOT EXISTS (or a LEFT JOIN ... WHERE customers.customer_id IS NULL); both compile to the same anti-join. The frequent mistake is a plain INNER JOIN, which silently discards exactly the orphaned rows you are trying to count, or NOT IN against a subquery that can contain NULLs and then returns nothing.',
    orderMatters: true,
    rowCeiling: 12,
  },
  {
    id: 'iv-rv-category-tree-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Recursive hierarchy',
    difficulty: 3,
    scenario:
      'You are the catalog analyst at Rove. The categories table is a self-referencing tree, but some parent pointers reference parents that were purged. Merchandising wants the clean hierarchy that is actually reachable from the top-level roots, with each node labelled by its depth and root.',
    task:
      'Starting from root categories (parent_category_id IS NULL, depth 1), walk the parent-to-child hierarchy with a recursive CTE and return every category reachable from a root. Output category_id, name, depth (root = 1), and root_name (the name of the top-level ancestor). Order by depth ascending, then category_id ascending.',
    expectedSql: `WITH RECURSIVE tree AS (
  SELECT category_id, name, 1 AS depth, name AS root_name
  FROM categories
  WHERE parent_category_id IS NULL
  UNION ALL
  SELECT c.category_id, c.name, t.depth + 1, t.root_name
  FROM categories c
  JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT category_id, name, depth, root_name
FROM tree
ORDER BY depth, category_id`,
    modelAnswer: `-- Anchor on the roots (parent_category_id IS NULL), carrying the root's own name down.
WITH RECURSIVE tree AS (
  SELECT category_id, name, 1 AS depth, name AS root_name
  FROM categories
  WHERE parent_category_id IS NULL
  UNION ALL
  -- Each step joins children onto the parent already in the tree, deepening by one.
  SELECT c.category_id, c.name, t.depth + 1, t.root_name
  FROM categories c
  JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT category_id, name, depth, root_name
FROM tree
ORDER BY depth, category_id;`,
    approachNote:
      'The recursive CTE anchors on parent_category_id IS NULL and joins children on child.parent_category_id = parent.category_id, threading root_name down from the anchor. Categories whose parent pointer references a purged id (the 9000-range ids) are never reached and correctly drop out, which is the point. LEFT JOINing a fixed number of times, or anchoring on the wrong end of the relationship, either truncates deep branches or drags in the orphaned subtrees.',
    orderMatters: true,
    rowCeiling: 34,
  },
  {
    id: 'iv-rv-customer-dedup-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Deduplication',
    difficulty: 3,
    scenario:
      'You are the CRM analyst at Rove. Account merges left the same person as several customers rows that share a master_customer_id (different email casing, sometimes a soft-deleted twin). Marketing needs an accurate per-channel headcount for Chicago signups.',
    task:
      'Among customers with signup_city_id 8, collapse to one surviving row per master_customer_id, preferring a non-deleted row (is_deleted = false) and then the lowest customer_id. Return one row per acquisition_channel with raw_rows (all city-8 customer rows for that channel) and deduped_customers (surviving rows whose survivor carries that channel). Order by acquisition_channel ascending.',
    expectedSql: `WITH survivors AS (
  SELECT DISTINCT ON (master_customer_id)
         master_customer_id,
         customer_id,
         acquisition_channel
  FROM customers
  WHERE signup_city_id = 8
  ORDER BY master_customer_id, is_deleted ASC, customer_id ASC
)
SELECT c.acquisition_channel,
       count(*) AS raw_rows,
       (SELECT count(*) FROM survivors s WHERE s.acquisition_channel = c.acquisition_channel) AS deduped_customers
FROM customers c
WHERE c.signup_city_id = 8
GROUP BY c.acquisition_channel
ORDER BY c.acquisition_channel`,
    modelAnswer: `-- DISTINCT ON keeps one preferred row per person: is_deleted false sorts first, then lowest id.
WITH survivors AS (
  SELECT DISTINCT ON (master_customer_id)
         master_customer_id,
         customer_id,
         acquisition_channel
  FROM customers
  WHERE signup_city_id = 8
  ORDER BY master_customer_id, is_deleted ASC, customer_id ASC
)
-- Compare the raw per-channel row counts against the deduplicated survivor counts.
SELECT c.acquisition_channel,
       count(*) AS raw_rows,
       (SELECT count(*) FROM survivors s
         WHERE s.acquisition_channel = c.acquisition_channel) AS deduped_customers
FROM customers c
WHERE c.signup_city_id = 8
GROUP BY c.acquisition_channel
ORDER BY c.acquisition_channel;`,
    approachNote:
      'DISTINCT ON (master_customer_id) with ORDER BY master_customer_id, is_deleted ASC, customer_id ASC keeps exactly the preferred survivor per person (false sorts before true). Attribute survivors by their own channel, which can differ from the raw per-channel totals. Counting DISTINCT master_customer_id alone answers headcount but cannot carry the survivor channel, and grouping the raw rows without deduping double counts merged accounts.',
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-rv-utc-hour-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Timezone conversion',
    difficulty: 3,
    scenario:
      'You are the platform analyst at Rove. placed_at is stored as naive local wall-clock time, and the infra team wants Chicago 2021 order volume expressed in UTC hours to line up with server logs. The denormalized utc_offset_hours column is stale across daylight-saving months and must not be used.',
    task:
      "For city_id 8 orders with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01), interpret placed_at as local time in the city's IANA timezone (join cities and use the timezone column) and convert it to UTC, then report order counts by UTC hour-of-day. Return utc_hour (integer 0 to 23) and orders (count). Order by utc_hour ascending.",
    expectedSql: `SELECT extract(hour FROM (o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::int AS utc_hour,
       count(*) AS orders
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = 8
  AND o.placed_at >= DATE '2021-01-01'
  AND o.placed_at <  DATE '2022-01-01'
GROUP BY 1
ORDER BY 1`,
    modelAnswer: `-- First AT TIME ZONE reads the naive stamp as Chicago local and yields an instant (timestamptz);
-- the second re-expresses that instant as a UTC wall clock, whose hour we extract.
SELECT extract(hour FROM (o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::int AS utc_hour,
       count(*) AS orders
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = 8
  AND o.placed_at >= DATE '2021-01-01'
  AND o.placed_at <  DATE '2022-01-01'
GROUP BY 1
ORDER BY 1;`,
    approachNote:
      "Converting a naive timestamp to UTC is a double application of AT TIME ZONE: (placed_at AT TIME ZONE cities.timezone) yields a timestamptz instant, and AT TIME ZONE 'UTC' turns it back into a UTC wall-clock timestamp whose hour you extract. The stale utc_offset_hours (a flat -6 for Chicago) misplaces every daylight-saving order by an hour; the IANA timezone string is daylight-saving aware and is the answer key. Dropping the second AT TIME ZONE just leaves the original local hour.",
    orderMatters: true,
    rowCeiling: 24,
  },
  {
    id: 'iv-rv-promo-redemption-dedup-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Deduplication',
    difficulty: 3,
    scenario:
      "You are the promotions analyst at Rove. Each promo is meant to be usable once per customer, but a checkout race let some shoppers stack the same code across several orders, so redemption counts overstate true reach. For the Phoenix market you need each promo's genuine unique reach separated from the duplicate redemptions.",
    task:
      "For promo redemptions tied to Phoenix orders (join promo_redemption to orders on order_id, city_id 5) with redeemed_at in 2021 (>= 2021-01-01 and < 2022-01-01), keep one redemption per (promo_id, customer_id) pair: the earliest by redeemed_at, breaking ties by the lower redemption_id. Return one row per promo_id with redemptions (all redemption rows), unique_customers (kept rows), repeat_redemptions (rows dropped as duplicates), and repeat_discount_cents (sum of discount_cents over the dropped rows). Order by promo_id ascending.",
    expectedSql: `WITH r AS (
  SELECT pr.promo_id, pr.customer_id, pr.discount_cents,
         row_number() OVER (PARTITION BY pr.promo_id, pr.customer_id
                            ORDER BY pr.redeemed_at, pr.redemption_id) AS rn
  FROM promo_redemption pr
  JOIN orders o ON o.order_id = pr.order_id
  WHERE o.city_id = 5
    AND pr.redeemed_at >= DATE '2021-01-01'
    AND pr.redeemed_at <  DATE '2022-01-01'
)
SELECT promo_id,
       count(*) AS redemptions,
       count(*) FILTER (WHERE rn = 1) AS unique_customers,
       count(*) FILTER (WHERE rn > 1) AS repeat_redemptions,
       coalesce(sum(discount_cents) FILTER (WHERE rn > 1), 0) AS repeat_discount_cents
FROM r
GROUP BY promo_id
ORDER BY promo_id`,
    modelAnswer: `-- Number each customer's redemptions of a given promo; rn = 1 is the legitimate one.
WITH r AS (
  SELECT pr.promo_id, pr.customer_id, pr.discount_cents,
         row_number() OVER (PARTITION BY pr.promo_id, pr.customer_id
                            ORDER BY pr.redeemed_at, pr.redemption_id) AS rn
  FROM promo_redemption pr
  JOIN orders o ON o.order_id = pr.order_id
  WHERE o.city_id = 5
    AND pr.redeemed_at >= DATE '2021-01-01'
    AND pr.redeemed_at <  DATE '2022-01-01'
)
-- rn = 1 counts unique reach; rn > 1 is duplicate reach and the discount it leaked.
SELECT promo_id,
       count(*) AS redemptions,
       count(*) FILTER (WHERE rn = 1) AS unique_customers,
       count(*) FILTER (WHERE rn > 1) AS repeat_redemptions,
       coalesce(sum(discount_cents) FILTER (WHERE rn > 1), 0) AS repeat_discount_cents
FROM r
GROUP BY promo_id
ORDER BY promo_id;`,
    approachNote:
      'ROW_NUMBER() OVER (PARTITION BY promo_id, customer_id ORDER BY redeemed_at, redemption_id) marks rn = 1 as the legitimate redemption and rn > 1 as the stacked duplicates. The common wrong turn is treating every redemption row as reach; count(DISTINCT customer_id) recovers unique reach but cannot also measure the duplicate discount leakage in the same pass, which the numbering approach does.',
    orderMatters: true,
    rowCeiling: 50,
  },
  {
    id: 'iv-rv-payment-capture-dedup-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Deduplication',
    difficulty: 3,
    scenario:
      'You are the payments analyst at Rove. A single order can carry several payment rows because the gateway retries and sometimes logs a failed attempt before the real capture. Finance wants the Dallas Q4 2020 books rebuilt on exactly one canonical payment per order, preferring the successful capture.',
    task:
      "For payments whose order is in city_id 9 with placed_at in Q4 2020 (>= 2020-10-01 and < 2021-01-01), collapse to one payment per order_id: prefer a canonical paid status (the status stripped of non-letters and lower-cased, in paid, captured, success, successful) over any other, then the latest captured_at (NULLs last), then the lowest payment_id. Report one row per canonical payment method (the method stripped of non-letters and lower-cased) with deduped_payments (surviving payments) and deduped_amount_cents (sum of amount_cents over survivors). Order by method ascending.",
    expectedSql: `WITH bound AS (
  SELECT p.payment_id, p.order_id, p.amount_cents,
         lower(regexp_replace(p.status, '[^a-z]', '', 'gi')) AS st,
         lower(regexp_replace(p.method, '[^a-z]', '', 'gi')) AS meth,
         p.captured_at
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  WHERE o.city_id = 9
    AND o.placed_at >= DATE '2020-10-01'
    AND o.placed_at <  DATE '2021-01-01'
),
survivor AS (
  SELECT DISTINCT ON (order_id) order_id, amount_cents, meth
  FROM bound
  ORDER BY order_id,
           (st IN ('paid','captured','success','successful')) DESC,
           captured_at DESC NULLS LAST,
           payment_id ASC
)
SELECT meth AS method,
       count(*) AS deduped_payments,
       sum(amount_cents) AS deduped_amount_cents
FROM survivor
GROUP BY meth
ORDER BY meth`,
    modelAnswer: `-- Bound to Dallas Q4 2020 and normalize the dirty status/method text (strip non-letters, lower-case).
WITH bound AS (
  SELECT p.payment_id, p.order_id, p.amount_cents,
         lower(regexp_replace(p.status, '[^a-z]', '', 'gi')) AS st,
         lower(regexp_replace(p.method, '[^a-z]', '', 'gi')) AS meth,
         p.captured_at
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  WHERE o.city_id = 9
    AND o.placed_at >= DATE '2020-10-01'
    AND o.placed_at <  DATE '2021-01-01'
),
-- DISTINCT ON keeps one payment per order: paid first, then latest capture, then lowest id.
survivor AS (
  SELECT DISTINCT ON (order_id) order_id, amount_cents, meth
  FROM bound
  ORDER BY order_id,
           (st IN ('paid','captured','success','successful')) DESC,
           captured_at DESC NULLS LAST,
           payment_id ASC
)
SELECT meth AS method,
       count(*) AS deduped_payments,
       sum(amount_cents) AS deduped_amount_cents
FROM survivor
GROUP BY meth
ORDER BY meth;`,
    approachNote:
      'DISTINCT ON (order_id) with an ORDER BY that encodes the business preference: a boolean paid-first flag DESC, then captured_at DESC NULLS LAST, then payment_id. The frequent wrong turns are summing every payment row (which counts retries and failed attempts) and ordering only by captured_at, which can keep a failed attempt when the true capture has a NULL timestamp.',
    orderMatters: true,
    rowCeiling: 8,
  },
  {
    id: 'iv-rv-merchant-revenue-topn-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Top-N per group',
    difficulty: 2,
    scenario:
      'You are the marketplace analyst at Rove. The Phoenix category managers each want their three highest-grossing merchants for a 2021 year-in-review, and a tie on revenue should surface every tied merchant rather than silently drop one.',
    task:
      'For city_id 5 completed orders (status stripped of non-letters and lower-cased in delivered, completed, fulfilled) with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01), sum amount_cents per merchant and, within each merchant category (merchants.category), rank merchants by revenue descending with RANK() so ties share a rank. Return the merchants at rank 3 or better with category, merchant_id, name, revenue_cents, and rnk. Order by category ascending, revenue_cents descending, then merchant_id ascending.',
    expectedSql: `WITH rev AS (
  SELECT m.category, m.merchant_id, m.name, sum(o.amount_cents) AS revenue_cents
  FROM orders o
  JOIN merchants m ON m.merchant_id = o.merchant_id
  WHERE o.city_id = 5
    AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
    AND lower(regexp_replace(o.status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
  GROUP BY m.category, m.merchant_id, m.name
),
ranked AS (
  SELECT category, merchant_id, name, revenue_cents,
         rank() OVER (PARTITION BY category ORDER BY revenue_cents DESC) AS rnk
  FROM rev
)
SELECT category, merchant_id, name, revenue_cents, rnk
FROM ranked
WHERE rnk <= 3
ORDER BY category, revenue_cents DESC, merchant_id`,
    modelAnswer: `-- Revenue per merchant from completed orders (status normalized for dirty casing/synonyms).
WITH rev AS (
  SELECT m.category, m.merchant_id, m.name, sum(o.amount_cents) AS revenue_cents
  FROM orders o
  JOIN merchants m ON m.merchant_id = o.merchant_id
  WHERE o.city_id = 5
    AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
    AND lower(regexp_replace(o.status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
  GROUP BY m.category, m.merchant_id, m.name
),
-- RANK within each category so tied revenues share a rank and both survive rnk <= 3.
ranked AS (
  SELECT category, merchant_id, name, revenue_cents,
         rank() OVER (PARTITION BY category ORDER BY revenue_cents DESC) AS rnk
  FROM rev
)
SELECT category, merchant_id, name, revenue_cents, rnk
FROM ranked
WHERE rnk <= 3
ORDER BY category, revenue_cents DESC, merchant_id;`,
    approachNote:
      'Aggregate revenue per merchant first, then RANK() OVER (PARTITION BY category ORDER BY revenue_cents DESC) so filtering rnk <= 3 keeps every tied merchant. Wrong turns: ROW_NUMBER() would hide a merchant tied at the boundary, and ranking before the merchant-level GROUP BY double counts order rows.',
    orderMatters: true,
    rowCeiling: 24,
  },
  {
    id: 'iv-rv-courier-vclass-topn-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Top-N per group',
    difficulty: 3,
    scenario:
      'You are the courier operations analyst at Rove. Austin is running an equipment-upgrade pilot and wants the two most productive couriers in each vehicle class. The vehicle_type field is entered free-form (casing, punctuation, embedded tabs, and synonyms), so classes must be canonicalized first, and genuine ties for the top spot must not be dropped.',
    task:
      'Among couriers with home_city_id 7, canonicalize vehicle_type by stripping non-letters and lower-casing, then map to a vehicle_class: bike (bike, bicycle), ebike (ebike, electricbike), scooter (scooter, escooter), car (car, automobile, vehicle). Within each class rank couriers by lifetime_deliveries descending with RANK() and return those at rank 2 or better. Output vehicle_class, courier_id, lifetime_deliveries, and rnk. Order by vehicle_class ascending, lifetime_deliveries descending, then courier_id ascending.',
    expectedSql: `WITH c AS (
  SELECT courier_id, lifetime_deliveries,
         CASE lower(regexp_replace(vehicle_type, '[^a-z]', '', 'gi'))
           WHEN 'bike' THEN 'bike' WHEN 'bicycle' THEN 'bike'
           WHEN 'ebike' THEN 'ebike' WHEN 'electricbike' THEN 'ebike'
           WHEN 'scooter' THEN 'scooter' WHEN 'escooter' THEN 'scooter'
           WHEN 'car' THEN 'car' WHEN 'automobile' THEN 'car' WHEN 'vehicle' THEN 'car'
         END AS vehicle_class
  FROM couriers
  WHERE home_city_id = 7
),
ranked AS (
  SELECT vehicle_class, courier_id, lifetime_deliveries,
         rank() OVER (PARTITION BY vehicle_class ORDER BY lifetime_deliveries DESC) AS rnk
  FROM c
)
SELECT vehicle_class, courier_id, lifetime_deliveries, rnk
FROM ranked
WHERE rnk <= 2
ORDER BY vehicle_class, lifetime_deliveries DESC, courier_id`,
    modelAnswer: `-- Canonicalize free-text vehicle_type (strip non-letters, lower-case) then fold synonyms into 4 classes.
WITH c AS (
  SELECT courier_id, lifetime_deliveries,
         CASE lower(regexp_replace(vehicle_type, '[^a-z]', '', 'gi'))
           WHEN 'bike' THEN 'bike' WHEN 'bicycle' THEN 'bike'
           WHEN 'ebike' THEN 'ebike' WHEN 'electricbike' THEN 'ebike'
           WHEN 'scooter' THEN 'scooter' WHEN 'escooter' THEN 'scooter'
           WHEN 'car' THEN 'car' WHEN 'automobile' THEN 'car' WHEN 'vehicle' THEN 'car'
         END AS vehicle_class
  FROM couriers
  WHERE home_city_id = 7
),
-- RANK within each class keeps tied leaders (the scooter class ties at the top).
ranked AS (
  SELECT vehicle_class, courier_id, lifetime_deliveries,
         rank() OVER (PARTITION BY vehicle_class ORDER BY lifetime_deliveries DESC) AS rnk
  FROM c
)
SELECT vehicle_class, courier_id, lifetime_deliveries, rnk
FROM ranked
WHERE rnk <= 2
ORDER BY vehicle_class, lifetime_deliveries DESC, courier_id;`,
    approachNote:
      "Canonicalize with regexp_replace(vehicle_type, '[^a-z]', '', 'gi') before the CASE: btrim and lower alone leave embedded tabs, so 'car' and a tabbed 'car' split into separate buckets. RANK then keeps both members of the top tie. Wrong turns: grouping on raw casing/synonyms scatters a single class across many labels, and ROW_NUMBER drops the co-leader in the scooter tie.",
    orderMatters: true,
    rowCeiling: 16,
  },
  {
    id: 'iv-rv-funnel-step-conv-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Funnel',
    difficulty: 3,
    scenario:
      'You are the growth analyst at Rove. The Dallas PM wants the September 2021 browse-to-order funnel expressed as step-to-step conversion, so each stage is measured against the stage immediately before it rather than against the top of the funnel.',
    task:
      "Using event_log for city_id 9 with event_ts in September 2021 (>= 2021-09-01 and < 2021-10-01), count distinct customers who performed each stage in the ordered set app_open (1), view_merchant (2), add_to_cart (3), checkout_start (4), order_placed (5). Return stage_rank, stage (the event_type), customers (distinct customer_id), and pct_of_previous (100 * customers / the previous stage's customers, rounded to 1 decimal; NULL for the first stage). Order by stage_rank ascending.",
    expectedSql: `WITH sc AS (
  SELECT CASE event_type
           WHEN 'app_open' THEN 1 WHEN 'view_merchant' THEN 2 WHEN 'add_to_cart' THEN 3
           WHEN 'checkout_start' THEN 4 WHEN 'order_placed' THEN 5 END AS stage_rank,
         event_type AS stage,
         count(DISTINCT customer_id) AS customers
  FROM event_log
  WHERE city_id = 9
    AND event_ts >= DATE '2021-09-01' AND event_ts < DATE '2021-10-01'
    AND event_type IN ('app_open','view_merchant','add_to_cart','checkout_start','order_placed')
  GROUP BY 1, 2
)
SELECT stage_rank, stage, customers,
       round(100.0 * customers / lag(customers) OVER (ORDER BY stage_rank), 1) AS pct_of_previous
FROM sc
ORDER BY stage_rank`,
    modelAnswer: `-- Distinct customers per stage, with the fixed funnel order supplied by a CASE.
WITH sc AS (
  SELECT CASE event_type
           WHEN 'app_open' THEN 1 WHEN 'view_merchant' THEN 2 WHEN 'add_to_cart' THEN 3
           WHEN 'checkout_start' THEN 4 WHEN 'order_placed' THEN 5 END AS stage_rank,
         event_type AS stage,
         count(DISTINCT customer_id) AS customers
  FROM event_log
  WHERE city_id = 9
    AND event_ts >= DATE '2021-09-01' AND event_ts < DATE '2021-10-01'
    AND event_type IN ('app_open','view_merchant','add_to_cart','checkout_start','order_placed')
  GROUP BY 1, 2
)
-- lag() over the stage order supplies the previous stage's customers as the denominator.
SELECT stage_rank, stage, customers,
       round(100.0 * customers / lag(customers) OVER (ORDER BY stage_rank), 1) AS pct_of_previous
FROM sc
ORDER BY stage_rank;`,
    approachNote:
      'Count DISTINCT customer_id per stage, attach the fixed order with a CASE, then divide by lag(customers) over the stage order. This is a reach funnel (did the customer ever hit the step in the window), so a later stage can exceed its predecessor and push pct_of_previous above 100: here order_placed exceeds checkout_start because a reorder or deep link can place an order without a logged checkout_start. Wrong turns: counting event rows instead of distinct customers, or dividing by the entry stage (that is pct-of-entry, a different metric).',
    orderMatters: true,
    rowCeiling: 6,
  },
  {
    id: 'iv-rv-weekly-signup-cohort-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Cohort retention',
    difficulty: 3,
    scenario:
      'You are the lifecycle analyst at Rove. Rather than first-purchase cohorts, Portland growth wants weekly acquisition cohorts: group new signups by the week they registered and track what share place a Portland order in each of the next few weeks, including the signup week itself.',
    task:
      "Define each customer's cohort as date_trunc('week', signup_ts) for customers with signup_city_id 1 and signup_ts in the window >= 2021-04-05 and < 2021-05-10. For week_offset 0 through 3 (whole weeks after the cohort week), a customer is retained at that offset if they placed any city_id 1 order in that week (derive the offset as the whole-week difference between the order's week and the cohort week). Return cohort_week (date), week_offset (integer), cohort_size (customers in the cohort), retained (distinct retained customers), and retention_pct (100 * retained / cohort_size, rounded to 1 decimal). Order by cohort_week ascending, then week_offset ascending.",
    expectedSql: `WITH cohorts AS (
  SELECT customer_id, date_trunc('week', signup_ts) AS cohort_week
  FROM customers
  WHERE signup_city_id = 1
    AND signup_ts >= DATE '2021-04-05' AND signup_ts < DATE '2021-05-10'
),
sizes AS (SELECT cohort_week, count(*) AS cohort_size FROM cohorts GROUP BY cohort_week),
active AS (
  SELECT DISTINCT c.cohort_week, c.customer_id,
         ((date_trunc('week', o.placed_at)::date - c.cohort_week::date) / 7)::int AS week_offset
  FROM cohorts c JOIN orders o ON o.customer_id = c.customer_id AND o.city_id = 1
)
SELECT a.cohort_week::date AS cohort_week, a.week_offset, s.cohort_size,
       count(DISTINCT a.customer_id) AS retained,
       round(100.0 * count(DISTINCT a.customer_id) / s.cohort_size, 1) AS retention_pct
FROM active a JOIN sizes s ON s.cohort_week = a.cohort_week
WHERE a.week_offset BETWEEN 0 AND 3
GROUP BY a.cohort_week, a.week_offset, s.cohort_size
ORDER BY a.cohort_week, a.week_offset`,
    modelAnswer: `-- Cohort = the ISO week a customer signed up in Portland.
WITH cohorts AS (
  SELECT customer_id, date_trunc('week', signup_ts) AS cohort_week
  FROM customers
  WHERE signup_city_id = 1
    AND signup_ts >= DATE '2021-04-05' AND signup_ts < DATE '2021-05-10'
),
sizes AS (SELECT cohort_week, count(*) AS cohort_size FROM cohorts GROUP BY cohort_week),
-- Each later Portland order week becomes a whole-week offset from the cohort week.
active AS (
  SELECT DISTINCT c.cohort_week, c.customer_id,
         ((date_trunc('week', o.placed_at)::date - c.cohort_week::date) / 7)::int AS week_offset
  FROM cohorts c JOIN orders o ON o.customer_id = c.customer_id AND o.city_id = 1
)
SELECT a.cohort_week::date AS cohort_week, a.week_offset, s.cohort_size,
       count(DISTINCT a.customer_id) AS retained,
       round(100.0 * count(DISTINCT a.customer_id) / s.cohort_size, 1) AS retention_pct
FROM active a JOIN sizes s ON s.cohort_week = a.cohort_week
WHERE a.week_offset BETWEEN 0 AND 3
GROUP BY a.cohort_week, a.week_offset, s.cohort_size
ORDER BY a.cohort_week, a.week_offset;`,
    approachNote:
      'These are signup-week (acquisition) cohorts, not first-order cohorts, so offset 0 is not 100 percent: not everyone orders the week they register. Both week starts are Monday-aligned by date_trunc, so the whole-week offset is (order_week - cohort_week)/7 on the date-cast Mondays. Wrong turns: dividing raw placed_at day differences by 7 drifts because days are not aligned to the cohort Monday, and measuring retention off a global first order rather than the signup week mixes cohorts.',
    orderMatters: true,
    rowCeiling: 24,
  },
  {
    id: 'iv-rv-sessionization-bounce-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Sessionization',
    difficulty: 3,
    scenario:
      'You are the product analytics engineer at Rove. Phoenix growth wants a week of reconstructed sessions with a tighter 20-minute inactivity timeout, plus the share of sessions that bounce (a single event and out).',
    task:
      "For event_log rows in city_id 5 with event_ts from 2021-06-07 up to (but not including) 2021-06-14, reconstruct sessions per customer: a new session starts on a customer's first event or whenever the gap from their previous event exceeds 20 minutes (order a customer's events by event_ts then event_id). Assign each session to the calendar date of its first event. Return session_day (date), sessions (sessions starting that day), bounce_sessions (sessions with exactly one event), bounce_pct (100 * bounce_sessions / sessions, rounded to 1 decimal), and avg_events (events per session, rounded to 2 decimals). Order by session_day ascending.",
    expectedSql: `WITH ev AS (
  SELECT customer_id, event_id, event_ts,
         CASE WHEN lag(event_ts) OVER w IS NULL
                OR event_ts - lag(event_ts) OVER w > INTERVAL '20 minutes'
              THEN 1 ELSE 0 END AS is_new
  FROM event_log
  WHERE city_id = 5 AND event_ts >= DATE '2021-06-07' AND event_ts < DATE '2021-06-14'
  WINDOW w AS (PARTITION BY customer_id ORDER BY event_ts, event_id)
),
marked AS (
  SELECT customer_id, event_ts,
         sum(is_new) OVER (PARTITION BY customer_id ORDER BY event_ts, event_id
                           ROWS UNBOUNDED PRECEDING) AS sess
  FROM ev
),
sessions AS (
  SELECT customer_id, sess, min(event_ts)::date AS session_day, count(*) AS events
  FROM marked GROUP BY customer_id, sess
)
SELECT session_day,
       count(*) AS sessions,
       count(*) FILTER (WHERE events = 1) AS bounce_sessions,
       round(100.0 * count(*) FILTER (WHERE events = 1) / count(*), 1) AS bounce_pct,
       round(avg(events), 2) AS avg_events
FROM sessions GROUP BY session_day ORDER BY session_day`,
    modelAnswer: `-- Flag a session boundary when the gap exceeds 20 minutes (or it is the customer's first event).
WITH ev AS (
  SELECT customer_id, event_id, event_ts,
         CASE WHEN lag(event_ts) OVER w IS NULL
                OR event_ts - lag(event_ts) OVER w > INTERVAL '20 minutes'
              THEN 1 ELSE 0 END AS is_new
  FROM event_log
  WHERE city_id = 5 AND event_ts >= DATE '2021-06-07' AND event_ts < DATE '2021-06-14'
  WINDOW w AS (PARTITION BY customer_id ORDER BY event_ts, event_id)
),
-- Running sum of the boundary flag numbers each customer's sessions.
marked AS (
  SELECT customer_id, event_ts,
         sum(is_new) OVER (PARTITION BY customer_id ORDER BY event_ts, event_id
                           ROWS UNBOUNDED PRECEDING) AS sess
  FROM ev
),
-- One row per reconstructed session, dated by its first event; a bounce has exactly one event.
sessions AS (
  SELECT customer_id, sess, min(event_ts)::date AS session_day, count(*) AS events
  FROM marked GROUP BY customer_id, sess
)
SELECT session_day,
       count(*) AS sessions,
       count(*) FILTER (WHERE events = 1) AS bounce_sessions,
       round(100.0 * count(*) FILTER (WHERE events = 1) / count(*), 1) AS bounce_pct,
       round(avg(events), 2) AS avg_events
FROM sessions GROUP BY session_day ORDER BY session_day;`,
    approachNote:
      'Gaps-and-islands with a 20-minute threshold: lag(event_ts) flags a boundary, a running sum of that flag numbers sessions per customer, then group by (customer, session number); a bounce is a session whose event count is 1. Include event_id in every window ORDER BY so same-timestamp events sequence deterministically. Wrong turns: dropping event_id makes ties nondeterministic, and reusing the stored session_id will not reproduce the 20-minute rule.',
    orderMatters: true,
    rowCeiling: 7,
  },
  {
    id: 'iv-rv-gmv-movingavg-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Moving average',
    difficulty: 2,
    scenario:
      'You are the finance analyst at Rove. Seattle leadership wants daily gross merchandise value for the second quarter of 2021 smoothed with a trailing two-week average, so payday and weekend spikes do not dominate the underlying trend.',
    task:
      'Build a gap-free daily date spine from 2021-04-01 through 2021-06-30 and, for city_id 2 completed orders (status stripped of non-letters and lower-cased in delivered, completed, fulfilled), sum amount_cents per day joined onto the spine so days with no orders show 0. Return order_date (date), gmv_cents (integer), and ma14_cents (the trailing 14-day average of gmv_cents over the current day and the 13 prior days, rounded to whole cents). Order by order_date ascending.',
    expectedSql: `WITH spine AS (
  SELECT generate_series(DATE '2021-04-01', DATE '2021-06-30', INTERVAL '1 day')::date AS d
),
daily AS (
  SELECT placed_at::date AS d, sum(amount_cents) AS gmv
  FROM orders
  WHERE city_id = 2 AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-04-01' AND placed_at < DATE '2021-07-01'
  GROUP BY placed_at::date
)
SELECT s.d AS order_date,
       coalesce(dl.gmv, 0) AS gmv_cents,
       round(avg(coalesce(dl.gmv, 0)) OVER (ORDER BY s.d ROWS BETWEEN 13 PRECEDING AND CURRENT ROW), 0) AS ma14_cents
FROM spine s LEFT JOIN daily dl ON dl.d = s.d
ORDER BY s.d`,
    modelAnswer: `-- generate_series builds a gap-free daily spine so zero-GMV days are not skipped.
WITH spine AS (
  SELECT generate_series(DATE '2021-04-01', DATE '2021-06-30', INTERVAL '1 day')::date AS d
),
daily AS (   -- daily GMV from completed orders (status normalized for dirty casing/synonyms)
  SELECT placed_at::date AS d, sum(amount_cents) AS gmv
  FROM orders
  WHERE city_id = 2 AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
    AND placed_at >= DATE '2021-04-01' AND placed_at < DATE '2021-07-01'
  GROUP BY placed_at::date
)
-- Trailing 14-row frame over the gap-free spine equals a true 14 calendar days.
SELECT s.d AS order_date,
       coalesce(dl.gmv, 0) AS gmv_cents,
       round(avg(coalesce(dl.gmv, 0)) OVER (ORDER BY s.d ROWS BETWEEN 13 PRECEDING AND CURRENT ROW), 0) AS ma14_cents
FROM spine s LEFT JOIN daily dl ON dl.d = s.d
ORDER BY s.d;`,
    approachNote:
      'Left join daily GMV onto a generate_series spine so absent days become 0, then AVG(...) OVER (ORDER BY order_date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW). Averaging straight from orders is the usual mistake: missing days vanish and the 14-row frame silently spans more than 14 calendar days.',
    orderMatters: true,
    rowCeiling: 91,
  },
  {
    id: 'iv-rv-spend-quartiles-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Bucketing',
    difficulty: 2,
    scenario:
      'You are the customer analytics lead at Rove. Austin marketing wants its 2021 buyers split into four equal-sized spend quartiles to size a top-tier loyalty offer.',
    task:
      'For customers with at least one city_id 7 completed order (status stripped of non-letters and lower-cased in delivered, completed, fulfilled) placed in 2021 (>= 2021-01-01 and < 2022-01-01), compute each customer total amount_cents, then assign quartiles with NTILE(4) ordered by total spend ascending (break ties by customer_id so buckets are stable). Return quartile (1 = lowest spend), customers (count in the quartile), min_spend_cents, max_spend_cents, and total_spend_cents. Order by quartile ascending.',
    expectedSql: `WITH cust AS (
  SELECT customer_id, sum(amount_cents) AS spend
  FROM orders
  WHERE city_id = 7 AND placed_at >= DATE '2021-01-01' AND placed_at < DATE '2022-01-01'
    AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
  GROUP BY customer_id
),
q AS (SELECT customer_id, spend, ntile(4) OVER (ORDER BY spend, customer_id) AS quartile FROM cust)
SELECT quartile, count(*) AS customers,
       min(spend) AS min_spend_cents, max(spend) AS max_spend_cents, sum(spend) AS total_spend_cents
FROM q GROUP BY quartile ORDER BY quartile`,
    modelAnswer: `-- Total spend per customer from their completed Austin 2021 orders.
WITH cust AS (
  SELECT customer_id, sum(amount_cents) AS spend
  FROM orders
  WHERE city_id = 7 AND placed_at >= DATE '2021-01-01' AND placed_at < DATE '2022-01-01'
    AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
  GROUP BY customer_id
),
-- NTILE(4) over ascending spend (customer_id tiebreak) splits customers into four equal buckets.
q AS (SELECT customer_id, spend, ntile(4) OVER (ORDER BY spend, customer_id) AS quartile FROM cust)
SELECT quartile, count(*) AS customers,
       min(spend) AS min_spend_cents, max(spend) AS max_spend_cents, sum(spend) AS total_spend_cents
FROM q GROUP BY quartile ORDER BY quartile;`,
    approachNote:
      'Aggregate spend per customer first, then NTILE(4) over spend with a customer_id tiebreak so bucket edges are deterministic. Wrong turns: running NTILE over the raw order rows buckets orders rather than customers, and leaving the tiebreak out makes the boundary assignment (and the min/max at the seam) nondeterministic across runs.',
    orderMatters: true,
    rowCeiling: 4,
  },
  {
    id: 'iv-rv-amount-percentiles-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Bucketing',
    difficulty: 2,
    scenario:
      'You are the pricing analyst at Rove. Seattle wants the middle and upper end of order value by merchant category for 2021, using percentiles so a few very large baskets do not distort the picture the way an average would.',
    task:
      'For city_id 2 completed orders (status stripped of non-letters and lower-cased in delivered, completed, fulfilled) with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01), join merchants and, per merchant category, compute orders (order count), median_cents (continuous median of amount_cents), and p90_cents (continuous 90th percentile of amount_cents), each rounded to 2 decimals. Order by category ascending.',
    expectedSql: `SELECT m.category,
       count(*) AS orders,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY o.amount_cents)::numeric, 2) AS median_cents,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY o.amount_cents)::numeric, 2) AS p90_cents
FROM orders o JOIN merchants m ON m.merchant_id = o.merchant_id
WHERE o.city_id = 2 AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
  AND lower(regexp_replace(o.status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
GROUP BY m.category ORDER BY m.category`,
    modelAnswer: `-- Continuous percentiles interpolate the cut, unlike an average or a discrete data point.
SELECT m.category,
       count(*) AS orders,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY o.amount_cents)::numeric, 2) AS median_cents,
       round(percentile_cont(0.9) WITHIN GROUP (ORDER BY o.amount_cents)::numeric, 2) AS p90_cents
FROM orders o JOIN merchants m ON m.merchant_id = o.merchant_id
WHERE o.city_id = 2 AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
  AND lower(regexp_replace(o.status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
GROUP BY m.category ORDER BY m.category;`,
    approachNote:
      'percentile_cont(0.5) and percentile_cont(0.9) WITHIN GROUP (ORDER BY amount_cents) return the interpolated median and p90 per category. Wrong turns: percentile_disc returns an actual data point rather than the interpolated cut, and AVG is not a percentile and is exactly what the business asked to avoid.',
    orderMatters: true,
    rowCeiling: 6,
  },
  {
    id: 'iv-rv-distance-bands-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Bucketing',
    difficulty: 2,
    scenario:
      'You are the logistics analyst at Rove. Denver ops wants third-quarter 2021 deliveries grouped into distance bands to see how trip length is distributed and whether longer trips carry larger baskets.',
    task:
      "For city_id 4 completed orders (status stripped of non-letters and lower-cased in delivered, completed, fulfilled) with placed_at in Q3 2021 (>= 2021-07-01 and < 2021-10-01), bucket each order by distance_km into '1: under 2km' (< 2), '2: 2 to 4km' (>= 2 and < 4), '3: 4 to 6km' (>= 4 and < 6), '4: 6 to 8km' (>= 6 and < 8), and '5: 8km plus' (>= 8). Return distance_band, orders (count), pct_of_orders (100 * orders / total, rounded to 1 decimal), and avg_amount_cents (rounded to whole cents). Order by distance_band ascending.",
    expectedSql: `WITH o AS (
  SELECT distance_km, amount_cents FROM orders
  WHERE city_id = 4 AND placed_at >= DATE '2021-07-01' AND placed_at < DATE '2021-10-01'
    AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
)
SELECT CASE
         WHEN distance_km < 2 THEN '1: under 2km'
         WHEN distance_km < 4 THEN '2: 2 to 4km'
         WHEN distance_km < 6 THEN '3: 4 to 6km'
         WHEN distance_km < 8 THEN '4: 6 to 8km'
         ELSE '5: 8km plus' END AS distance_band,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders,
       round(avg(amount_cents), 0) AS avg_amount_cents
FROM o GROUP BY 1 ORDER BY 1`,
    modelAnswer: `-- Half-open CASE bands so each distance falls in exactly one bucket.
WITH o AS (
  SELECT distance_km, amount_cents FROM orders
  WHERE city_id = 4 AND placed_at >= DATE '2021-07-01' AND placed_at < DATE '2021-10-01'
    AND lower(regexp_replace(status, '[^a-z]', '', 'gi')) IN ('delivered','completed','fulfilled')
)
-- Numeric label prefixes make a plain sort order the bands; sum(count(*)) OVER () is the grand total.
SELECT CASE
         WHEN distance_km < 2 THEN '1: under 2km'
         WHEN distance_km < 4 THEN '2: 2 to 4km'
         WHEN distance_km < 6 THEN '3: 4 to 6km'
         WHEN distance_km < 8 THEN '4: 6 to 8km'
         ELSE '5: 8km plus' END AS distance_band,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders,
       round(avg(amount_cents), 0) AS avg_amount_cents
FROM o GROUP BY 1 ORDER BY 1;`,
    approachNote:
      'Half-open CASE bands (each uses < on the upper edge) so no distance lands in two buckets, numeric label prefixes so a plain ascending sort orders the bands, and sum(count(*)) OVER () for the grand-total denominator in one scan. Wrong turns: overlapping edges (mixing <= and >= on the same boundary) double count, and per-band percentages that requery the table drift from a single pass.',
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-rv-orphan-courier-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the data quality analyst at Rove. When a courier offboards, their couriers row can be purged while historical orders keep pointing at the vanished courier_id. Dallas ops wants that orphaned assignment volume sized for 2021.',
    task:
      'For city_id 9 orders with placed_at in 2021 (>= 2021-01-01 and < 2022-01-01) that carry a non-null courier_id with no matching row in couriers, return one row per calendar month: order_month (first day of the month, a date), orphaned_orders (count), and orphaned_amount_cents (sum of amount_cents). Order by order_month ascending.',
    expectedSql: `SELECT date_trunc('month', o.placed_at)::date AS order_month,
       count(*) AS orphaned_orders,
       sum(o.amount_cents) AS orphaned_amount_cents
FROM orders o
WHERE o.city_id = 9 AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
  AND o.courier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM couriers c WHERE c.courier_id = o.courier_id)
GROUP BY 1 ORDER BY 1`,
    modelAnswer: `-- Anti-join: keep orders whose non-null courier_id has no surviving couriers row, then roll up by month.
SELECT date_trunc('month', o.placed_at)::date AS order_month,
       count(*) AS orphaned_orders,
       sum(o.amount_cents) AS orphaned_amount_cents
FROM orders o
WHERE o.city_id = 9 AND o.placed_at >= DATE '2021-01-01' AND o.placed_at < DATE '2022-01-01'
  AND o.courier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM couriers c WHERE c.courier_id = o.courier_id)
GROUP BY 1 ORDER BY 1;`,
    approachNote:
      'NOT EXISTS is the anti-join, guarded by courier_id IS NOT NULL so pre-assignment nulls are not mistaken for orphans. Wrong turns: an INNER JOIN silently drops exactly the orphaned rows you are trying to count, and NOT IN against a subquery that yields any NULL returns nothing at all.',
    orderMatters: true,
    rowCeiling: 12,
  },
  {
    id: 'iv-rv-promo-never-redeemed-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the promotions analyst at Rove. Before the promo catalog is pruned, marketing wants every promo code that has never once been redeemed, so dead campaigns can be retired.',
    task:
      'Return every promo in promos that has no matching row in promo_redemption. Output promo_id, code, promo_type, city_id (NULL means all-cities), starts_on (starts_at as a date), and ends_on (ends_at as a date). Order by promo_id ascending.',
    expectedSql: `SELECT p.promo_id, p.code, p.promo_type, p.city_id,
       p.starts_at::date AS starts_on, p.ends_at::date AS ends_on
FROM promos p
WHERE NOT EXISTS (SELECT 1 FROM promo_redemption r WHERE r.promo_id = p.promo_id)
ORDER BY p.promo_id`,
    modelAnswer: `-- Anti-join from promos to promo_redemption: keep only promos with no redemption at all.
SELECT p.promo_id, p.code, p.promo_type, p.city_id,
       p.starts_at::date AS starts_on, p.ends_at::date AS ends_on
FROM promos p
WHERE NOT EXISTS (SELECT 1 FROM promo_redemption r WHERE r.promo_id = p.promo_id)
ORDER BY p.promo_id;`,
    approachNote:
      'NOT EXISTS from promos to promo_redemption on promo_id keeps only the never-redeemed promos; the promos table is small so the result is naturally bounded. Wrong turns: a LEFT JOIN that forgets to filter to the NULL side lists every promo, and a redemption count per promo needs HAVING count = 0 rather than a plain join.',
    orderMatters: true,
    rowCeiling: 10,
  },
  {
    id: 'iv-rv-never-ordered-signup-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the acquisition analyst at Rove. Boston wants to know how many 2021 signups never converted to a single order, split by the channel that brought them in, to judge channel quality.',
    task:
      'Among customers with signup_city_id 12 and signup_ts in 2021 (>= 2021-01-01 and < 2022-01-01), a customer never converted if they have no row in orders. Return one row per acquisition_channel with signups (customers in that channel), never_ordered (those with no orders), and never_ordered_pct (100 * never_ordered / signups, rounded to 1 decimal). Order by acquisition_channel ascending.',
    expectedSql: `WITH s AS (
  SELECT customer_id, acquisition_channel FROM customers
  WHERE signup_city_id = 12 AND signup_ts >= DATE '2021-01-01' AND signup_ts < DATE '2022-01-01'
)
SELECT s.acquisition_channel,
       count(*) AS signups,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = s.customer_id)) AS never_ordered,
       round(100.0 * count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = s.customer_id)) / count(*), 1) AS never_ordered_pct
FROM s GROUP BY s.acquisition_channel ORDER BY s.acquisition_channel`,
    modelAnswer: `-- Boston 2021 signups; a NOT EXISTS against orders marks the ones that never converted.
WITH s AS (
  SELECT customer_id, acquisition_channel FROM customers
  WHERE signup_city_id = 12 AND signup_ts >= DATE '2021-01-01' AND signup_ts < DATE '2022-01-01'
)
-- COUNT(*) FILTER keeps the signups denominator and the never-ordered tally in one pass.
SELECT s.acquisition_channel,
       count(*) AS signups,
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = s.customer_id)) AS never_ordered,
       round(100.0 * count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = s.customer_id)) / count(*), 1) AS never_ordered_pct
FROM s GROUP BY s.acquisition_channel ORDER BY s.acquisition_channel;`,
    approachNote:
      'A NOT EXISTS against orders inside COUNT(*) FILTER yields the never-converted tally next to the channel total in a single pass. Wrong turns: doing the anti-join before the per-channel aggregate loses the signups denominator, and equating never-ordered with is_deleted confuses account churn with non-conversion.',
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-rv-category-path-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Recursive hierarchy',
    difficulty: 3,
    scenario:
      'You are the catalog analyst at Rove. Merchandising wants the category tree flattened into readable breadcrumb paths from each root down to every reachable node, so a nested menu can be rendered and audited. Some parent pointers reference purged parents and must simply drop out.',
    task:
      "Starting from root categories (parent_category_id IS NULL, depth 1), walk the parent-to-child hierarchy with a recursive CTE. For every category reachable from a root, return category_id, name, depth (root = 1), and path (the names from the root to the node joined by ' > '). Order by path ascending.",
    expectedSql: `WITH RECURSIVE tree AS (
  SELECT category_id, name, 1 AS depth, name::text AS path
  FROM categories WHERE parent_category_id IS NULL
  UNION ALL
  SELECT c.category_id, c.name, t.depth + 1, t.path || ' > ' || c.name
  FROM categories c JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT category_id, name, depth, path FROM tree ORDER BY path`,
    modelAnswer: `-- Anchor on the roots (parent_category_id IS NULL), seeding the path with the root's own name.
WITH RECURSIVE tree AS (
  SELECT category_id, name, 1 AS depth, name::text AS path
  FROM categories WHERE parent_category_id IS NULL
  UNION ALL
  -- Each step appends the child's name; branches under a purged parent are never reached.
  SELECT c.category_id, c.name, t.depth + 1, t.path || ' > ' || c.name
  FROM categories c JOIN tree t ON c.parent_category_id = t.category_id
)
SELECT category_id, name, depth, path FROM tree ORDER BY path;`,
    approachNote:
      "The recursive CTE grows a breadcrumb string (parent.path || ' > ' || child.name) down each branch; categories whose parent pointer references a purged id (the 9000-range ids) are never reached and correctly drop out. Ordering by the path text gives a stable depth-first-looking traversal. Wrong turns: anchoring on the leaves or joining a fixed number of times either inverts the path or truncates the deep branches.",
    orderMatters: true,
    rowCeiling: 34,
  },
  {
    id: 'iv-rv-payment-legacy-reconcile-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Money-text cleaning',
    difficulty: 3,
    scenario:
      'You are the finance data analyst at Rove. The payments table still carries amount_legacy, a free-text money field from an old processor feed (dollar signs, USD tokens, blanks, and NULLs). Before it is dropped you must show that, where it parses, it reconciles exactly to the clean amount_cents for the Phoenix August 2021 payments.',
    task:
      "For payments whose order is in city_id 5 with placed_at in August 2021 (>= 2021-08-01 and < 2021-09-01), parse amount_legacy into a numeric dollar amount by stripping every character that is not a digit or a period, treating an empty result or NULL as unparseable. Return one row per day of the order's placed_at: pay_date (date), payments (total payment rows), parsed (rows whose legacy text parsed), unparsed (rows that did not parse), legacy_cents (sum over parsed rows of parsed dollars times 100, as a bigint), and clean_cents (sum of amount_cents over the same parsed rows, as a bigint). Order by pay_date ascending.",
    expectedSql: `WITH p AS (
  SELECT o.placed_at::date AS d, pay.amount_cents,
         nullif(regexp_replace(coalesce(pay.amount_legacy, ''), '[^0-9.]', '', 'g'), '')::numeric AS legacy_dollars
  FROM payments pay JOIN orders o ON o.order_id = pay.order_id
  WHERE o.city_id = 5 AND o.placed_at >= DATE '2021-08-01' AND o.placed_at < DATE '2021-09-01'
)
SELECT d AS pay_date,
       count(*) AS payments,
       count(legacy_dollars) AS parsed,
       count(*) - count(legacy_dollars) AS unparsed,
       coalesce(sum(round(legacy_dollars * 100)) FILTER (WHERE legacy_dollars IS NOT NULL), 0)::bigint AS legacy_cents,
       coalesce(sum(amount_cents) FILTER (WHERE legacy_dollars IS NOT NULL), 0)::bigint AS clean_cents
FROM p GROUP BY d ORDER BY d`,
    modelAnswer: `-- Strip anything but digits/period, turn '' into NULL, then cast to numeric dollars.
WITH p AS (
  SELECT o.placed_at::date AS d, pay.amount_cents,
         nullif(regexp_replace(coalesce(pay.amount_legacy, ''), '[^0-9.]', '', 'g'), '')::numeric AS legacy_dollars
  FROM payments pay JOIN orders o ON o.order_id = pay.order_id
  WHERE o.city_id = 5 AND o.placed_at >= DATE '2021-08-01' AND o.placed_at < DATE '2021-09-01'
)
-- count(legacy_dollars) counts only parsed rows; legacy_cents equals clean_cents on every parsed row.
SELECT d AS pay_date,
       count(*) AS payments,
       count(legacy_dollars) AS parsed,
       count(*) - count(legacy_dollars) AS unparsed,
       coalesce(sum(round(legacy_dollars * 100)) FILTER (WHERE legacy_dollars IS NOT NULL), 0)::bigint AS legacy_cents,
       coalesce(sum(amount_cents) FILTER (WHERE legacy_dollars IS NOT NULL), 0)::bigint AS clean_cents
FROM p GROUP BY d ORDER BY d;`,
    approachNote:
      "Strip formatting with regexp_replace(amount_legacy, '[^0-9.]', '', 'g'), collapse '' to NULL with nullif, then cast to numeric; count() of the parsed column counts only non-NULL parses, and legacy_cents (parsed dollars times 100) equals clean_cents (amount_cents) on every day, which proves the reconciliation. Wrong turns: casting the raw text errors on the $ and USD tokens, and treating blanks as 0 understates unparsed and breaks the tie-out.",
    orderMatters: true,
    rowCeiling: 31,
  },
  {
    id: 'iv-rv-rating-sentinel-1',
    database: 'rove',
    level: 'advanced',
    difficulty: 2,
    scenario:
      "You are the CSAT analyst at Rove. The ratings feed is polluted with out-of-range sentinel values (0, -1, 6, 99) that stand in for bad or missing input. Miami's 2021 satisfaction trend must be computed on valid one-to-five stars only, while still reporting how much junk was filtered.",
    task:
      'For ratings whose order is in city_id 13 with rated_at in 2021 (>= 2021-01-01 and < 2022-01-01), treat a star value as valid only when it is between 1 and 5 inclusive; everything else is an invalid sentinel. Return one row per calendar month of rated_at: rating_month (first day of the month, a date), ratings (all rows), valid_ratings (valid stars), invalid_ratings (sentinels), and avg_valid_stars (average of the valid stars only, rounded to 2 decimals). Order by rating_month ascending.',
    expectedSql: `WITH r AS (
  SELECT date_trunc('month', ra.rated_at)::date AS m, ra.stars
  FROM ratings ra JOIN orders o ON o.order_id = ra.order_id
  WHERE o.city_id = 13 AND ra.rated_at >= DATE '2021-01-01' AND ra.rated_at < DATE '2022-01-01'
)
SELECT m AS rating_month,
       count(*) AS ratings,
       count(*) FILTER (WHERE stars BETWEEN 1 AND 5) AS valid_ratings,
       count(*) FILTER (WHERE stars NOT BETWEEN 1 AND 5) AS invalid_ratings,
       round(avg(stars) FILTER (WHERE stars BETWEEN 1 AND 5), 2) AS avg_valid_stars
FROM r GROUP BY m ORDER BY m`,
    modelAnswer: `-- Bound to Miami 2021 ratings; validity is stars BETWEEN 1 AND 5, everything else is a sentinel.
WITH r AS (
  SELECT date_trunc('month', ra.rated_at)::date AS m, ra.stars
  FROM ratings ra JOIN orders o ON o.order_id = ra.order_id
  WHERE o.city_id = 13 AND ra.rated_at >= DATE '2021-01-01' AND ra.rated_at < DATE '2022-01-01'
)
-- Average only the valid stars; FILTER separates the sentinel count without a second scan.
SELECT m AS rating_month,
       count(*) AS ratings,
       count(*) FILTER (WHERE stars BETWEEN 1 AND 5) AS valid_ratings,
       count(*) FILTER (WHERE stars NOT BETWEEN 1 AND 5) AS invalid_ratings,
       round(avg(stars) FILTER (WHERE stars BETWEEN 1 AND 5), 2) AS avg_valid_stars
FROM r GROUP BY m ORDER BY m;`,
    approachNote:
      'Restrict validity with stars BETWEEN 1 AND 5 and average only those rows, using COUNT(*) FILTER to tally the sentinels in the same pass. Wrong turns: averaging stars raw drags the 0, -1, 6, and 99 sentinels into the mean, and treating 0 as a real low score understates satisfaction while overstating volume.',
    orderMatters: true,
    rowCeiling: 12,
  },
  {
    id: 'iv-rv-status-canon-1',
    database: 'rove',
    level: 'advanced',
    difficulty: 2,
    scenario:
      'You are the operations analyst at Rove. Order status is entered inconsistently across apps: casing varies, some use underscores or spaces, some carry embedded tabs, and several synonyms mean the same lifecycle stage. Austin ops wants July 2021 orders folded into five clean stages with their mix.',
    task:
      'For city_id 7 orders with placed_at in July 2021 (>= 2021-07-01 and < 2021-08-01), canonicalize status by stripping non-letters and lower-casing, then map to a stage: placed (placed, new, pending), accepted (accepted, confirmed), in_transit (pickedup, intransit, outfordelivery), delivered (delivered, completed, fulfilled), cancelled (cancelled, canceled, cancel). Return stage_rank (1 placed, 2 accepted, 3 in_transit, 4 delivered, 5 cancelled), stage, orders (count), and pct_of_orders (100 * orders / total, rounded to 1 decimal). Order by stage_rank ascending.',
    expectedSql: `WITH o AS (
  SELECT CASE lower(regexp_replace(status, '[^a-z]', '', 'gi'))
           WHEN 'placed' THEN 'placed' WHEN 'new' THEN 'placed' WHEN 'pending' THEN 'placed'
           WHEN 'accepted' THEN 'accepted' WHEN 'confirmed' THEN 'accepted'
           WHEN 'pickedup' THEN 'in_transit' WHEN 'intransit' THEN 'in_transit' WHEN 'outfordelivery' THEN 'in_transit'
           WHEN 'delivered' THEN 'delivered' WHEN 'completed' THEN 'delivered' WHEN 'fulfilled' THEN 'delivered'
           WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled' WHEN 'cancel' THEN 'cancelled'
         END AS stage
  FROM orders
  WHERE city_id = 7 AND placed_at >= DATE '2021-07-01' AND placed_at < DATE '2021-08-01'
)
SELECT CASE stage WHEN 'placed' THEN 1 WHEN 'accepted' THEN 2 WHEN 'in_transit' THEN 3
                  WHEN 'delivered' THEN 4 WHEN 'cancelled' THEN 5 END AS stage_rank,
       stage,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders
FROM o GROUP BY stage ORDER BY stage_rank`,
    modelAnswer: `-- Normalize status (strip non-letters, lower-case) then fold the synonym families into 5 stages.
WITH o AS (
  SELECT CASE lower(regexp_replace(status, '[^a-z]', '', 'gi'))
           WHEN 'placed' THEN 'placed' WHEN 'new' THEN 'placed' WHEN 'pending' THEN 'placed'
           WHEN 'accepted' THEN 'accepted' WHEN 'confirmed' THEN 'accepted'
           WHEN 'pickedup' THEN 'in_transit' WHEN 'intransit' THEN 'in_transit' WHEN 'outfordelivery' THEN 'in_transit'
           WHEN 'delivered' THEN 'delivered' WHEN 'completed' THEN 'delivered' WHEN 'fulfilled' THEN 'delivered'
           WHEN 'cancelled' THEN 'cancelled' WHEN 'canceled' THEN 'cancelled' WHEN 'cancel' THEN 'cancelled'
         END AS stage
  FROM orders
  WHERE city_id = 7 AND placed_at >= DATE '2021-07-01' AND placed_at < DATE '2021-08-01'
)
-- Stage-rank prefixes make a plain sort order the lifecycle; the window is the grand total.
SELECT CASE stage WHEN 'placed' THEN 1 WHEN 'accepted' THEN 2 WHEN 'in_transit' THEN 3
                  WHEN 'delivered' THEN 4 WHEN 'cancelled' THEN 5 END AS stage_rank,
       stage,
       count(*) AS orders,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_orders
FROM o GROUP BY stage ORDER BY stage_rank;`,
    approachNote:
      "Normalize with regexp_replace(status, '[^a-z]', '', 'gi') to collapse casing, underscores, spaces, and embedded tabs, then a CASE folds the synonym families into five stages. Wrong turns: lower(btrim(status)) alone leaves underscores, spaces, and tabs, so 'picked_up', 'picked up', and a tabbed variant scatter into separate groups, and grouping on raw status inflates the stage count.",
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-rv-utc-date-rollover-1',
    database: 'rove',
    level: 'advanced',
    pattern: 'Timezone conversion',
    difficulty: 3,
    scenario:
      'You are the platform analyst at Rove. placed_at is naive local wall-clock time, and the billing system settles on UTC calendar days, so late-evening Denver orders roll into the next UTC date. The denormalized utc_offset_hours is a flat -7 that is wrong during daylight-saving months and must not be used.',
    task:
      "For city_id 4 orders with placed_at in July 2021 (>= 2021-07-01 and < 2021-08-01), interpret placed_at as local time in the city's IANA timezone (join cities and use the timezone column), convert it to UTC, and compare its UTC calendar date to the local date. Return one row per local_date (placed_at as a date): orders (count), rolled_next_utc_day (orders whose UTC date is later than the local date), and rolled_pct (100 * rolled_next_utc_day / orders, rounded to 1 decimal). Order by local_date ascending.",
    expectedSql: `SELECT o.placed_at::date AS local_date,
       count(*) AS orders,
       count(*) FILTER (WHERE ((o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::date > o.placed_at::date) AS rolled_next_utc_day,
       round(100.0 * count(*) FILTER (WHERE ((o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::date > o.placed_at::date) / count(*), 1) AS rolled_pct
FROM orders o JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = 4 AND o.placed_at >= DATE '2021-07-01' AND o.placed_at < DATE '2021-08-01'
GROUP BY o.placed_at::date ORDER BY o.placed_at::date`,
    modelAnswer: `-- First AT TIME ZONE reads placed_at as Denver local and yields an instant (timestamptz);
-- the second re-expresses that instant as UTC wall-clock time, whose date we compare to the local date.
SELECT o.placed_at::date AS local_date,
       count(*) AS orders,
       count(*) FILTER (WHERE ((o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::date > o.placed_at::date) AS rolled_next_utc_day,
       round(100.0 * count(*) FILTER (WHERE ((o.placed_at AT TIME ZONE ci.timezone) AT TIME ZONE 'UTC')::date > o.placed_at::date) / count(*), 1) AS rolled_pct
FROM orders o JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = 4 AND o.placed_at >= DATE '2021-07-01' AND o.placed_at < DATE '2021-08-01'
GROUP BY o.placed_at::date ORDER BY o.placed_at::date;`,
    approachNote:
      "Converting a naive timestamp to UTC is a double AT TIME ZONE: (placed_at AT TIME ZONE cities.timezone) yields a timestamptz instant, and AT TIME ZONE 'UTC' turns it into a UTC wall-clock timestamp whose date you compare to the local date. In July, Denver is on MDT (-6), so the stored flat -7 utc_offset_hours misplaces boundary orders by an hour; the IANA zone is daylight-saving aware and is the answer key. Wrong turns: adding a flat 7 hours from utc_offset_hours, or dropping the second AT TIME ZONE and comparing the untouched local timestamp.",
    orderMatters: true,
    rowCeiling: 31,
  },
  {
    id: 'iv-rv-payment-status-canon-1',
    database: 'rove',
    level: 'advanced',
    difficulty: 2,
    scenario:
      'You are the payments analyst at Rove. Payment status arrives in dozens of surface forms (casing, punctuation, and synonyms like captured, success, reversed, and disputed). Nashville finance wants second-quarter 2021 payments folded into three settlement outcomes with their share.',
    task:
      'For payments whose order is in city_id 10 with placed_at in Q2 2021 (>= 2021-04-01 and < 2021-07-01), canonicalize status by stripping non-letters and lower-casing, then map to a canonical_status: paid (paid, captured, success, successful), refunded (refunded), chargeback (chargeback, reversed, disputed). Return canonical_status, payments (count), pct_of_payments (100 * payments / total, rounded to 1 decimal), and amount_cents (sum of amount_cents). Order by canonical_status ascending.',
    expectedSql: `WITH p AS (
  SELECT CASE lower(regexp_replace(pay.status, '[^a-z]', '', 'gi'))
           WHEN 'paid' THEN 'paid' WHEN 'captured' THEN 'paid' WHEN 'success' THEN 'paid' WHEN 'successful' THEN 'paid'
           WHEN 'refunded' THEN 'refunded'
           WHEN 'chargeback' THEN 'chargeback' WHEN 'reversed' THEN 'chargeback' WHEN 'disputed' THEN 'chargeback'
         END AS canonical_status,
         pay.amount_cents
  FROM payments pay JOIN orders o ON o.order_id = pay.order_id
  WHERE o.city_id = 10 AND o.placed_at >= DATE '2021-04-01' AND o.placed_at < DATE '2021-07-01'
)
SELECT canonical_status,
       count(*) AS payments,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_payments,
       sum(amount_cents) AS amount_cents
FROM p GROUP BY canonical_status ORDER BY canonical_status`,
    modelAnswer: `-- Normalize payment status (strip non-letters, lower-case) then fold synonyms into 3 outcomes.
WITH p AS (
  SELECT CASE lower(regexp_replace(pay.status, '[^a-z]', '', 'gi'))
           WHEN 'paid' THEN 'paid' WHEN 'captured' THEN 'paid' WHEN 'success' THEN 'paid' WHEN 'successful' THEN 'paid'
           WHEN 'refunded' THEN 'refunded'
           WHEN 'chargeback' THEN 'chargeback' WHEN 'reversed' THEN 'chargeback' WHEN 'disputed' THEN 'chargeback'
         END AS canonical_status,
         pay.amount_cents
  FROM payments pay JOIN orders o ON o.order_id = pay.order_id
  WHERE o.city_id = 10 AND o.placed_at >= DATE '2021-04-01' AND o.placed_at < DATE '2021-07-01'
)
SELECT canonical_status,
       count(*) AS payments,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_of_payments,
       sum(amount_cents) AS amount_cents
FROM p GROUP BY canonical_status ORDER BY canonical_status;`,
    approachNote:
      "regexp_replace(status, '[^a-z]', '', 'gi') collapses the casing and punctuation variants, then a CASE folds the synonyms into three settlement outcomes, with sum(count(*)) OVER () supplying the share denominator in one pass. Wrong turns: grouping on raw status yields dozens of near-duplicate buckets, and leaving reversed or disputed unmapped drops real chargeback volume.",
    orderMatters: true,
    rowCeiling: 3,
  },
];
