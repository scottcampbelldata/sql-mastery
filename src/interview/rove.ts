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
];
