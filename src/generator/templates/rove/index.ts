import type {
  BindingRule,
  CheckpointMeta,
  ConceptMeta,
  GateHints,
  Level,
  PhaseMeta,
  ScaffoldPlan,
  Slot,
  Template,
  TeachBlock
} from '../../types';

const ROVE_SCAFFOLD: ScaffoldPlan = {
  full: 'all-value-slots',
  half: 'harder-half',
  blank: 'whole-clauses',
};

function gate(over: Partial<GateHints> = {}): GateHints {
  return {
    minRows: 1,
    minDistinct: 2,
    rowCeiling: 200,
    orderMatters: true,
    boundedSlice: true,
    ...over,
  };
}

function rv(config: {
  skill: string;
  family: 'single-table' | 'grouped' | 'windowed';
  primaryTable?: string;
  sqlShape: string;
  slots: Slot[];
  bindingRules?: BindingRule[];
  phrasings: string[];
  hint: string;
  gateHints?: Partial<GateHints>;
}): Template {
  return {
    skill: config.skill,
    database: 'rove',
    family: config.family,
    primaryTable: config.primaryTable,
    sqlShape: config.sqlShape,
    slots: config.slots,
    bindingRules: config.bindingRules ?? [],
    phrasings: config.phrasings,
    hintTemplate: config.hint,
    scaffoldPlan: ROVE_SCAFFOLD,
    gateHints: gate(config.gateHints),
  };
}

function tiebreak(name: string, kind: Slot['kind'], table: string, column: string): { slot: Slot; rule: BindingRule } {
  return {
    slot: { name, kind, table },
    rule: { slot: name, predicate: (value: string) => value === column },
  };
}

function teach(plain: string, mentalModel: string, sql: string, note: string): TeachBlock {
  return { plain, mentalModel, example: { sql, note } };
}

function cm(skill: string, phaseId: string, order: number, title: string, block: TeachBlock): ConceptMeta {
  return { skill, phaseId, order, title, teach: block };
}

const cityIdSlot: Slot = { name: 'cityId', kind: 'literal', table: 'orders', op: '=', col: 'city_id' };
const cityNameSlot: Slot = { name: 'cityName', kind: 'literal', table: 'cities', op: '=', col: 'name' };
const courierCitySlot: Slot = { name: 'cityId', kind: 'literal', table: 'couriers', op: '=', col: 'home_city_id' };
const eventCitySlot: Slot = { name: 'cityId', kind: 'literal', table: 'event_log', op: '=', col: 'city_id' };
const customerCitySlot: Slot = { name: 'cityId', kind: 'literal', table: 'customers', op: '=', col: 'signup_city_id' };
const windowStartSlot: Slot = { name: 'windowStart', kind: 'literal', table: 'orders', op: 'BETWEEN', col: 'placed_at' };

export const ROVE_SKILLS: string[] = [
  'rv-profile-dirty-data',
  'rv-text-normalize',
  'rv-case-canonicalize',
  'rv-null-coalesce-nullif',
  'rv-money-text-cast',
  'rv-regex-clean-contacts',
  'rv-timezone-city-join',
  'rv-dedup-rownumber',
  'rv-orphan-anti-join',
  'rv-soft-delete-valid',
  'rv-payment-dedup',
  'rv-rating-outlier-clean',
  'rv-rank-leaderboard',
  'rv-topn-per-group',
  'rv-lag-lead-deltas',
  'rv-running-total',
  'rv-moving-average-frame',
  'rv-ntile-bucketing',
  'rv-sessionization',
  'rv-funnel-conversion',
  'rv-retention-cohort',
  'rv-lifecycle-latency',
  'rv-clean-layer-capstone',
  'rv-recursive-cte',
];

const ADVANCED: Level = 'advanced';

export const ROVE_PHASES: PhaseMeta[] = [
  {
    id: 'rv-clean',
    title: 'Cleaning the raw layer',
    goal: 'Profile and normalize dirty Rove data into a trustworthy base to analyze.',
    level: ADVANCED,
    order: 1,
  },
  {
    id: 'rv-analytic',
    title: 'Analytic windows on the clean layer',
    goal: 'Rank, bucket, and trend the cleaned data with window functions.',
    level: ADVANCED,
    order: 2,
  },
  {
    id: 'rv-behavioral',
    title: 'Behavioral and hierarchical analysis',
    goal: 'Sessionize events, model funnels and retention, and traverse hierarchies.',
    level: ADVANCED,
    order: 3,
  },
];

export const ROVE_CHECKPOINTS: CheckpointMeta[] = [
  {
    id: 'cp1',
    phaseId: 'rv-clean',
    afterOrder: 6,
    drawFromSkills: ROVE_SKILLS.slice(0, 6),
    title: 'Cleaning fundamentals check',
  },
  {
    id: 'cp2',
    phaseId: 'rv-clean',
    afterOrder: 12,
    drawFromSkills: ROVE_SKILLS.slice(0, 12),
    title: 'Clean layer checkpoint',
  },
  {
    id: 'cp3',
    phaseId: 'rv-analytic',
    afterOrder: 3,
    drawFromSkills: ROVE_SKILLS.slice(12, 15),
    title: 'Ranking and deltas check',
  },
  {
    id: 'cp4',
    phaseId: 'rv-analytic',
    afterOrder: 6,
    drawFromSkills: ROVE_SKILLS.slice(12, 18),
    title: 'Analytic windows checkpoint',
  },
  {
    id: 'cp5',
    phaseId: 'rv-behavioral',
    afterOrder: 6,
    drawFromSkills: [...ROVE_SKILLS],
    title: 'Advanced capstone (all Rove skills)',
  },
];

export const ROVE_CONCEPT_META: ConceptMeta[] = [
  cm('rv-profile-dirty-data', 'rv-clean', 1, 'Profile dirty data', teach(
    'Before cleaning anything, count dirty conditions such as nulls, blanks, and out-of-range values.',
    'A data profile is a health report you run once so you know what to fix.',
    "SELECT COUNT(*) FILTER (WHERE tip_cents IS NULL) AS null_tips FROM orders",
    'FILTER counts a condition without a separate scan.'
  )),
  cm('rv-text-normalize', 'rv-clean', 2, 'Normalize text', teach(
    'Trim whitespace and lowercase text so the same value stops looking like many values.',
    'TRIM plus LOWER collapse cosmetic variants onto one canonical spelling.',
    'SELECT LOWER(TRIM(full_name)) AS clean_name FROM customers',
    'Cleaning can be a projection; it does not have to mutate the table.'
  )),
  cm('rv-case-canonicalize', 'rv-clean', 3, 'Canonicalize synonyms', teach(
    'Map casing variants and synonyms such as cc and credit onto one canonical label with CASE.',
    'A CASE ladder is a small lookup table written inline.',
    "SELECT CASE WHEN LOWER(method) IN ('cc', 'credit') THEN 'credit_card' ELSE LOWER(method) END AS method FROM payments",
    'Lowercase first, then match the synonym set.'
  )),
  cm('rv-null-coalesce-nullif', 'rv-clean', 4, 'COALESCE and NULLIF', teach(
    'COALESCE fills missing values; NULLIF turns a sentinel such as an empty string back into NULL.',
    'COALESCE picks the first non-null; NULLIF is the inverse for one bad value.',
    "SELECT COALESCE(tip_cents, 0) AS tip_cents, NULLIF(TRIM(order_total_legacy), '') AS raw_total FROM orders",
    'NULL and zero carry different meanings for tips.'
  )),
  cm('rv-money-text-cast', 'rv-clean', 5, 'Cast money text', teach(
    'Strip currency symbols, commas, and words from money-as-text before casting to a number.',
    'Clean the string first, then cast; never sum raw text.',
    "SELECT REGEXP_REPLACE(order_total_legacy, '[^0-9.]', '', 'g')::numeric AS dollars FROM orders",
    'Keep only digits and the decimal point.'
  )),
  cm('rv-regex-clean-contacts', 'rv-clean', 6, 'Regex-clean contacts', teach(
    'Normalize phone and email with regex: strip non-digits from phones and lowercase email addresses.',
    'REGEXP_REPLACE is find-and-replace with pattern power.',
    "SELECT REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS phone_digits FROM customers",
    'Digits-only makes phone values comparable.'
  )),
  cm('rv-timezone-city-join', 'rv-clean', 7, 'Timezone via city join', teach(
    "Convert a local timestamp using the city's IANA timezone from the cities table.",
    'The city timezone is the source of truth; a stored numeric offset can go stale.',
    'SELECT o.placed_at AT TIME ZONE ci.timezone AS utc_instant FROM orders o JOIN cities ci ON ci.city_id = o.city_id',
    'Join to get the timezone, then convert the timestamp.'
  )),
  cm('rv-dedup-rownumber', 'rv-clean', 8, 'Deduplicate with ROW_NUMBER', teach(
    'Collapse duplicate customer rows to one row per person using ROW_NUMBER over master_customer_id.',
    'Number the duplicates inside each identity group, then keep one representative row.',
    'SELECT customer_id, ROW_NUMBER() OVER (PARTITION BY master_customer_id) AS rn FROM customers',
    'master_customer_id is the hidden identity key.'
  )),
  cm('rv-orphan-anti-join', 'rv-clean', 9, 'Find orphan rows', teach(
    'Find orders whose customer_id has no matching customer after purges.',
    'An anti-join keeps the left rows that fail to match.',
    'SELECT o.order_id FROM orders o WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)',
    'orders.customer_id has no foreign key on purpose.'
  )),
  cm('rv-soft-delete-valid', 'rv-clean', 10, 'Valid non-deleted population', teach(
    'Analyze only the valid population by excluding soft-deleted rows.',
    'Soft-deleted rows still exist; you must filter them out yourself.',
    'SELECT COUNT(*) FROM support_tickets WHERE is_deleted = false',
    'Forgetting this filter inflates metrics.'
  )),
  cm('rv-payment-dedup', 'rv-clean', 11, 'Dedup payment retries', teach(
    'Keep one payment per order even when retry rows exist.',
    'Partition retries by order_id, choose one deterministic payment_id, and keep that representative.',
    'SELECT order_id, MIN(payment_id) OVER (PARTITION BY order_id) AS chosen_payment_id FROM payments',
    'The raw table is intentionally not unique by order_id, so the representative needs a stable rule.'
  )),
  cm('rv-rating-outlier-clean', 'rv-clean', 12, 'Clean rating outliers', teach(
    'Drop out-of-range star ratings before averaging.',
    'Sentinels such as 0, 6, -1, and 99 poison an average; filter to the valid band first.',
    'SELECT AVG(stars) FROM ratings WHERE stars BETWEEN 1 AND 5',
    'Range-guard, then aggregate.'
  )),
  cm('rv-rank-leaderboard', 'rv-analytic', 1, 'Rank a leaderboard', teach(
    'Rank couriers within a city by lifetime deliveries, keeping ties visible.',
    'A ranking window keeps each row while calculating a relative position.',
    'SELECT courier_id, RANK() OVER (PARTITION BY home_city_id) AS city_rank FROM couriers',
    'The partition scopes the leaderboard to one city.'
  )),
  cm('rv-topn-per-group', 'rv-analytic', 2, 'Top-N per group', teach(
    'Return a bounded top slice per group by numbering rows inside each group and filtering the number.',
    'Number rows per group, then keep the first few rows from each group.',
    'SELECT * FROM (SELECT city_id, merchant_id, ROW_NUMBER() OVER (PARTITION BY city_id) AS rn FROM orders) x WHERE rn <= 3',
    'The row number makes a group-local slice possible.'
  )),
  cm('rv-lag-lead-deltas', 'rv-analytic', 3, 'LAG and LEAD deltas', teach(
    'Compare the current row to a previous row in the same city with LAG.',
    'LAG pulls another row into the current row so you can subtract.',
    'SELECT amount_cents - LAG(amount_cents) OVER (PARTITION BY city_id) AS delta FROM orders',
    'The first row in a partition has no previous value.'
  )),
  cm('rv-running-total', 'rv-analytic', 4, 'Running total', teach(
    'Accumulate a city-level total with a SUM window.',
    'A window aggregate keeps row detail while adding a group-level calculation.',
    'SELECT SUM(amount_cents) OVER (PARTITION BY city_id) AS city_total FROM orders',
    'The row still remains after the window calculation.'
  )),
  cm('rv-moving-average-frame', 'rv-analytic', 5, 'Moving average on a date spine', teach(
    'Build a dense date spine before applying a framed moving calculation.',
    'A generated spine makes missing days visible instead of silently skipping them.',
    "SELECT AVG(n) OVER (RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS framed_avg FROM daily",
    'The frame defines which rows feed each window value.'
  )),
  cm('rv-ntile-bucketing', 'rv-analytic', 6, 'NTILE bucketing', teach(
    'Split rows into quartile buckets with NTILE(4).',
    'NTILE assigns each row to one of several size-balanced buckets.',
    'SELECT NTILE(4) OVER (PARTITION BY city_id) AS quartile FROM orders',
    'Buckets are count-balanced, not value-balanced.'
  )),
  cm('rv-sessionization', 'rv-behavioral', 1, 'Sessionize events', teach(
    'Group a customer event stream into sessions with a 30-minute inactivity gap.',
    'Flag a new session at each gap, then cumulative-sum the flags into a session number.',
    "SELECT LAG(event_ts) OVER (PARTITION BY customer_id) AS previous_event_ts FROM event_log",
    'The previous event timestamp is the comparison point.'
  )),
  cm('rv-funnel-conversion', 'rv-behavioral', 2, 'Funnel conversion', teach(
    'Count distinct customers reaching each funnel step in one city to measure drop-off.',
    'A funnel is one distinct-customer count per step.',
    'SELECT event_type, COUNT(DISTINCT customer_id) FROM event_log GROUP BY event_type',
    'Distinct customers matter more than raw event count.'
  )),
  cm('rv-retention-cohort', 'rv-behavioral', 3, 'Retention cohort', teach(
    'Bucket customers by signup month and measure how many have later order activity.',
    'The cohort key is fixed at signup; the active customer count shows whether customers return.',
    "SELECT date_trunc('month', signup_ts) AS cohort_month FROM customers",
    'The cohort month never changes for a customer.'
  )),
  cm('rv-lifecycle-latency', 'rv-behavioral', 4, 'Lifecycle latency', teach(
    'Measure elapsed time between lifecycle timestamps for courier onboarding.',
    'Subtract two timestamps to get duration, then average it per group.',
    'SELECT EXTRACT(EPOCH FROM approved_at - applied_at) FROM couriers',
    'Filter NULL lifecycle stamps before measuring elapsed time.'
  )),
  cm('rv-clean-layer-capstone', 'rv-behavioral', 5, 'Clean-layer capstone', teach(
    'Stack cleaning subqueries for valid customers, canonical labels, and deduped payments, then analyze the bounded slice.',
    'Build a trusted layer first, then ask the business question on top.',
    'SELECT merchant_id, clean_status, COUNT(*) FROM clean_orders GROUP BY merchant_id, clean_status',
    'The performance story is to bound the slice before composing the layers.'
  )),
  cm('rv-recursive-cte', 'rv-behavioral', 6, 'Recursive CTE category tree', teach(
    'Walk the self-referencing merchant-category tree with WITH RECURSIVE after cleaning dangling parents.',
    'A recursive CTE is a base row UNION ALL a step that joins children to the growing frontier.',
    'WITH RECURSIVE tree AS (SELECT root_id UNION ALL SELECT child_id FROM child JOIN tree ON true) SELECT * FROM tree',
    'Materialize depth and path while traversing the hierarchy.'
  )),
];

const CLEAN_TEMPLATES: Template[] = [
  rv({
    skill: 'rv-profile-dirty-data',
    family: 'grouped',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.city_id,
  'orders' AS table_name,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE o.tip_cents IS NULL) AS null_tips,
  COUNT(*) FILTER (WHERE TRIM(COALESCE(o.order_total_legacy, '')) = '') AS blank_totals
FROM orders o
GROUP BY o.city_id`,
    slots: [tiebreak('groupCols', 'groupCols', 'orders', 'city_id').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'city_id').rule],
    phrasings: [
      'For each city, report city_id, table_name, total_rows, null_tips, and blank_totals for orders.',
      'Profile orders by city_id: count total rows plus null tips and blank legacy totals.',
    ],
    hint: 'Use COUNT(*) FILTER (WHERE ...) to count each dirty condition in one grouped scan.',
    gateHints: { minDistinct: 1 },
  }),
  rv({
    skill: 'rv-text-normalize',
    family: 'single-table',
    primaryTable: 'customers',
    sqlShape: `
SELECT
  c.customer_id,
  LOWER(TRIM(c.full_name)) AS clean_name
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.full_name IS NOT NULL
LIMIT 200`,
    slots: [customerCitySlot, tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').rule],
    phrasings: [
      'For signup city {cityId}, return customer_id and clean_name as the trimmed, lowercased full_name.',
      'Normalize customer names in signup city {cityId} with TRIM plus LOWER.',
    ],
    hint: 'LOWER(TRIM(full_name)) collapses casing and whitespace variants.',
  }),
  rv({
    skill: 'rv-case-canonicalize',
    family: 'single-table',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  p.payment_id,
  p.order_id,
  CASE
    WHEN LOWER(TRIM(p.method)) IN ('cc', 'credit', 'credit card') THEN 'credit_card'
    WHEN LOWER(TRIM(p.method)) IN ('applepay', 'apple pay') THEN 'apple_pay'
    ELSE LOWER(TRIM(p.method))
  END AS canonical_method
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'payments', 'payment_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'payments', 'payment_id').rule],
    phrasings: [
      'For city {cityId}, return payment_id, order_id, and canonical_method after mapping method synonyms.',
      'Canonicalize payment method casing and synonyms for payments attached to city {cityId}.',
    ],
    hint: 'Lowercase and trim first, then map synonym groups with a CASE ladder.',
  }),
  rv({
    skill: 'rv-null-coalesce-nullif',
    family: 'single-table',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  COALESCE(o.tip_cents, 0) AS tip_cents_filled,
  NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') AS legacy_total_or_null
FROM orders o
WHERE o.city_id = {cityId}
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'order_id').rule],
    phrasings: [
      'For city {cityId}, return order_id, tip_cents_filled, and legacy_total_or_null.',
      'Fill missing tips with zero and turn blank legacy totals into NULL for city {cityId}.',
    ],
    hint: 'COALESCE fills a missing value; NULLIF turns an empty-string sentinel back into NULL.',
  }),
  rv({
    skill: 'rv-money-text-cast',
    family: 'single-table',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  REGEXP_REPLACE(o.order_total_legacy, '[^0-9.]', '', 'g')::numeric AS legacy_dollars
FROM orders o
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') IS NOT NULL
  AND o.order_total_legacy ~ '[0-9]'
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'order_id').rule],
    phrasings: [
      'For city {cityId}, parse order_total_legacy into numeric legacy_dollars for rows containing a number.',
      'Strip currency symbols from order_total_legacy in city {cityId} and cast the result to numeric.',
    ],
    hint: "REGEXP_REPLACE(text, '[^0-9.]', '', 'g') keeps digits and decimal points before the cast.",
  }),
  rv({
    skill: 'rv-regex-clean-contacts',
    family: 'single-table',
    primaryTable: 'customers',
    sqlShape: `
SELECT
  c.customer_id,
  REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
  LOWER(TRIM(REGEXP_REPLACE(c.email, '^mailto:', ''))) AS clean_email
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.phone IS NOT NULL
LIMIT 200`,
    slots: [customerCitySlot, tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').rule],
    phrasings: [
      'For signup city {cityId}, return customer_id, phone_digits, and clean_email.',
      'Regex-clean contacts in city {cityId}: keep phone digits and normalize email text.',
    ],
    hint: "REGEXP_REPLACE(phone, '[^0-9]', '', 'g') keeps only digits; strip a leading mailto: from email.",
  }),
  rv({
    skill: 'rv-timezone-city-join',
    family: 'grouped',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.city_id,
  ci.name AS city_name,
  ci.timezone AS iana_timezone,
  MIN(o.placed_at AT TIME ZONE ci.timezone) AS earliest_utc_instant,
  COUNT(*) AS orders_placed
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
GROUP BY o.city_id, ci.name, ci.timezone`,
    slots: [tiebreak('groupCols', 'groupCols', 'orders', 'city_id').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'city_id').rule],
    phrasings: [
      'For each city, return city_id, city_name, iana_timezone, earliest_utc_instant, and orders_placed.',
      'Join city timezone data for every city and convert placed_at with AT TIME ZONE.',
    ],
    hint: 'Join cities to read timezone, then convert placed_at with AT TIME ZONE; do not trust the offset column.',
    gateHints: { minDistinct: 1 },
  }),
  rv({
    skill: 'rv-dedup-rownumber',
    family: 'single-table',
    primaryTable: 'customers',
    sqlShape: `
SELECT
  deduped.master_customer_id,
  deduped.customer_id,
  deduped.full_name
FROM (
  SELECT
    c.master_customer_id,
    c.customer_id,
    c.full_name,
    ROW_NUMBER() OVER (PARTITION BY c.master_customer_id) AS rn
  FROM customers c
  WHERE c.signup_city_id = {cityId} AND c.is_deleted = false
) deduped
WHERE deduped.rn = 1
LIMIT 200`,
    slots: [customerCitySlot, tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').rule],
    phrasings: [
      'For signup city {cityId}, return one active row per master_customer_id.',
      'Deduplicate customers in city {cityId} with ROW_NUMBER over master_customer_id and keep rn = 1.',
    ],
    hint: 'Use ROW_NUMBER() OVER (PARTITION BY master_customer_id), then keep rn = 1.',
  }),
  rv({
    skill: 'rv-orphan-anti-join',
    family: 'single-table',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  o.customer_id
FROM orders o
WHERE o.city_id = {cityId}
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('sortKey', 'sortKey', 'orders', 'order_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'orders', 'order_id').rule],
    phrasings: [
      'For city {cityId}, list order_id and customer_id for orders whose customer no longer exists.',
      'Find orphaned orders in city {cityId} with an anti-join against customers.',
    ],
    hint: 'NOT EXISTS keeps only orders that fail to match a customer row.',
  }),
  rv({
    skill: 'rv-soft-delete-valid',
    family: 'grouped',
    primaryTable: 'support_tickets',
    sqlShape: `
SELECT
  t.category,
  COUNT(*) AS valid_tickets
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId} AND t.is_deleted = false
GROUP BY t.category
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'support_tickets', 'category').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'support_tickets', 'category').rule],
    phrasings: [
      'For city {cityId}, count valid_tickets per support ticket category, excluding soft-deleted tickets.',
      'Report non-deleted support ticket counts by category for city {cityId}.',
    ],
    hint: 'Soft-deleted tickets still exist; filter t.is_deleted = false before counting. LIMIT bounds noisy category variants.',
  }),
  rv({
    skill: 'rv-payment-dedup',
    family: 'single-table',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  winner.order_id,
  winner.payment_id,
  winner.amount_cents
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
) winner
WHERE winner.payment_id = winner.chosen_payment_id
LIMIT 200`,
    slots: [tiebreak('sortKey', 'sortKey', 'payments', 'payment_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'payments', 'payment_id').rule],
    phrasings: [
      'Keep one payment per order and return order_id, payment_id, amount_cents.',
      'Deduplicate payment retries by choosing one payment_id per order.',
    ],
    hint: 'Use a partitioned MIN(payment_id) to choose one deterministic representative payment per order.',
  }),
  rv({
    skill: 'rv-rating-outlier-clean',
    family: 'grouped',
    primaryTable: 'ratings',
    sqlShape: `
SELECT
  r.courier_id,
  AVG(r.stars) AS avg_stars,
  COUNT(*) AS rating_count
FROM ratings r
JOIN orders o ON o.order_id = r.order_id
WHERE o.city_id = {cityId} AND r.stars BETWEEN 1 AND 5 AND r.courier_id IS NOT NULL
GROUP BY r.courier_id
LIMIT 200`,
    slots: [cityIdSlot, tiebreak('groupCols', 'groupCols', 'ratings', 'courier_id').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'ratings', 'courier_id').rule],
    phrasings: [
      'For city {cityId}, report courier_id, avg_stars, and rating_count using only valid 1..5 ratings.',
      'Clean rating outliers in city {cityId}, then average stars per courier_id.',
    ],
    hint: 'Filter stars BETWEEN 1 AND 5 before calculating AVG.',
  }),
];

const ANALYTIC_TEMPLATES: Template[] = [
  rv({
    skill: 'rv-rank-leaderboard',
    family: 'windowed',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.courier_id,
  c.home_city_id,
  c.lifetime_deliveries,
  RANK() OVER (PARTITION BY c.home_city_id) AS delivery_rank
FROM couriers c
WHERE c.home_city_id = {cityId} AND c.status = 'active'
LIMIT 200`,
    slots: [
      courierCitySlot,
      tiebreak('partitionCols', 'partitionCols', 'couriers', 'home_city_id').slot,
      tiebreak('rankKey', 'rankKey', 'couriers', 'courier_id').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'couriers', 'home_city_id').rule,
      tiebreak('rankKey', 'rankKey', 'couriers', 'courier_id').rule,
    ],
    phrasings: [
      'For city {cityId}, rank active couriers by lifetime_deliveries and return courier_id, lifetime_deliveries, delivery_rank.',
      'Build a courier leaderboard for city {cityId} using RANK over active couriers.',
    ],
    hint: 'Use RANK() OVER (PARTITION BY home_city_id) and keep the result bounded to one city.',
  }),
  rv({
    skill: 'rv-topn-per-group',
    family: 'windowed',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  top3.city_id,
  top3.merchant_id,
  top3.order_count
FROM (
  SELECT
    o.city_id,
    o.merchant_id,
    COUNT(*) AS order_count,
    ROW_NUMBER() OVER (PARTITION BY o.city_id) AS rn
  FROM orders o
  WHERE o.city_id = {cityId}
  GROUP BY o.city_id, o.merchant_id
) top3
WHERE top3.rn <= 3
LIMIT 200`,
    slots: [
      cityIdSlot,
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'merchant_id').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'merchant_id').rule,
    ],
    phrasings: [
      'For city {cityId}, return three merchant rows with city_id, merchant_id, and order_count.',
      'Use ROW_NUMBER per city to keep a bounded merchant slice for city {cityId}.',
    ],
    hint: 'Aggregate by city_id and merchant_id, add ROW_NUMBER() OVER (PARTITION BY city_id), then keep rn <= 3.',
  }),
  rv({
    skill: 'rv-lag-lead-deltas',
    family: 'windowed',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  o.city_id,
  o.placed_at,
  o.amount_cents,
  o.amount_cents - LAG(o.amount_cents) OVER (PARTITION BY o.city_id) AS amount_delta_cents
FROM orders o
WHERE o.city_id = {cityId}
  AND o.placed_at >= '{windowStart}'::timestamp
  AND o.placed_at < '{windowStart}'::timestamp + INTERVAL '30 days'
LIMIT 100`,
    slots: [
      { ...cityIdSlot, sampleStrategy: 'compound-row' },
      { ...windowStartSlot, sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').rule,
    ],
    phrasings: [
      'For city {cityId} over a 30-day window, return order_id, placed_at, amount_cents, and amount_delta_cents.',
      'Compute an order amount delta for city {cityId} using LAG within the bounded date range.',
    ],
    hint: 'LAG(amount_cents) pulls another row from the same city partition so the current row can subtract it.',
    gateHints: { rowCeiling: 100 },
  }),
  rv({
    skill: 'rv-running-total',
    family: 'windowed',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  o.city_id,
  o.placed_at,
  o.amount_cents,
  SUM(o.amount_cents) OVER (PARTITION BY o.city_id) AS running_gross_cents
FROM orders o
WHERE o.city_id = {cityId}
  AND o.placed_at >= '{windowStart}'::timestamp
  AND o.placed_at < '{windowStart}'::timestamp + INTERVAL '30 days'
LIMIT 100`,
    slots: [
      { ...cityIdSlot, sampleStrategy: 'compound-row' },
      { ...windowStartSlot, sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').rule,
    ],
    phrasings: [
      'For city {cityId} over a 30-day window, return order_id, placed_at, amount_cents, and running_gross_cents.',
      'Add a city-level running_gross_cents window value to the bounded order rows for city {cityId}.',
    ],
    hint: 'SUM(amount_cents) OVER (PARTITION BY city_id) keeps row detail while adding a city-level total.',
    gateHints: { rowCeiling: 100 },
  }),
  rv({
    skill: 'rv-moving-average-frame',
    family: 'windowed',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  {cityId}::smallint AS city_id,
  spine.order_day::timestamp AS placed_at,
  spine.order_day,
  COALESCE(daily.gross_cents, 0) AS gross_cents,
  AVG(COALESCE(daily.gross_cents, 0)) OVER (
    RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS trailing_7day_avg_cents
FROM generate_series('{windowStart}'::date, '{windowStart}'::date + INTERVAL '29 days', INTERVAL '1 day') AS spine(order_day)
LEFT JOIN (
  SELECT
    o.placed_at::date AS order_day,
    SUM(o.amount_cents) AS gross_cents
  FROM orders o
  WHERE o.city_id = {cityId}
    AND o.placed_at::date BETWEEN '{windowStart}'::date AND ('{windowStart}'::date + INTERVAL '29 days')
  GROUP BY o.placed_at::date
) daily ON daily.order_day = spine.order_day`,
    slots: [
      { ...cityIdSlot, sampleStrategy: 'compound-row' },
      { ...windowStartSlot, sampleStrategy: 'compound-row' },
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'placed_at').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'placed_at').rule,
    ],
    phrasings: [
      'For city {cityId}, build a dense 30-day spine and return order_day, gross_cents, and trailing_7day_avg_cents.',
      'Compute a framed moving average over a gap-free date spine for city {cityId}.',
    ],
    hint: 'Use generate_series for the date spine, LEFT JOIN daily totals, then AVG over a RANGE BETWEEN frame.',
    gateHints: { rowCeiling: 30 },
  }),
  rv({
    skill: 'rv-ntile-bucketing',
    family: 'windowed',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.order_id,
  o.city_id,
  o.merchant_id,
  o.amount_cents,
  NTILE(4) OVER (PARTITION BY o.city_id) AS aov_quartile
FROM orders o
WHERE o.city_id = {cityId}
LIMIT 200`,
    slots: [
      cityIdSlot,
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').slot,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').slot,
    ],
    bindingRules: [
      tiebreak('partitionCols', 'partitionCols', 'orders', 'city_id').rule,
      tiebreak('rankKey', 'rankKey', 'orders', 'order_id').rule,
    ],
    phrasings: [
      'For city {cityId}, bucket bounded order rows into quartiles by average-order-value proxy fields.',
      'Assign each bounded city {cityId} order an aov_quartile with NTILE(4).',
    ],
    hint: 'NTILE(4) OVER (PARTITION BY city_id) splits the bounded partition into four buckets.',
  }),
];

const BEHAVIORAL_TEMPLATES: Template[] = [
  rv({
    skill: 'rv-sessionization',
    family: 'grouped',
    primaryTable: 'event_log',
    sqlShape: `
SELECT
  sessioned.session_id,
  sessioned.customer_id,
  sessioned.session_seq,
  MIN(sessioned.event_ts) AS session_start,
  MAX(sessioned.event_ts) AS session_end,
  COUNT(*) AS event_count
FROM (
  SELECT
    flagged.session_id,
    flagged.customer_id,
    flagged.event_ts,
    SUM(flagged.is_new_session) OVER (PARTITION BY flagged.customer_id, flagged.session_id) AS session_seq
  FROM (
    SELECT
      e.session_id,
      e.customer_id,
      e.event_ts,
      CASE
        WHEN LAG(e.event_ts) OVER (PARTITION BY e.customer_id, e.session_id) IS NULL
          OR e.event_ts - LAG(e.event_ts) OVER (PARTITION BY e.customer_id, e.session_id) > INTERVAL '30 minutes'
        THEN 1 ELSE 0
      END AS is_new_session
    FROM event_log e
    WHERE e.city_id = {cityId}
  ) flagged
) sessioned
GROUP BY sessioned.session_id, sessioned.customer_id, sessioned.session_seq
LIMIT 100`,
    slots: [
      eventCitySlot,
      tiebreak('groupCols', 'groupCols', 'event_log', 'session_id').slot,
    ],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'event_log', 'session_id').rule],
    phrasings: [
      'For city {cityId}, split events into 30-minute-gap sessions and summarize each session.',
      'Sessionize events in city {cityId}; return session_id, customer_id, session_seq, session_start, session_end, event_count.',
    ],
    hint: "Flag a new session when LAG(event_ts) is NULL or the gap exceeds INTERVAL '30 minutes', then sum the flags into session_seq.",
    gateHints: { rowCeiling: 100 },
  }),
  rv({
    skill: 'rv-funnel-conversion',
    family: 'grouped',
    primaryTable: 'event_log',
    sqlShape: `
SELECT
  e.event_type,
  COUNT(DISTINCT e.customer_id) AS reached_customers
FROM event_log e
WHERE e.city_id = {cityId}
  AND e.event_type IN ('app_open', 'view_merchant', 'add_to_cart', 'checkout_start', 'order_placed')
GROUP BY e.event_type`,
    slots: [eventCitySlot, tiebreak('groupCols', 'groupCols', 'event_log', 'event_type').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'event_log', 'event_type').rule],
    phrasings: [
      'For city {cityId}, count reached_customers at each funnel event_type from app_open to order_placed.',
      'Measure funnel drop-off in city {cityId}: distinct customers per event_type step.',
    ],
    hint: 'COUNT(DISTINCT customer_id) per event_type gives the funnel width at each step.',
  }),
  rv({
    skill: 'rv-retention-cohort',
    family: 'grouped',
    primaryTable: 'customers',
    sqlShape: `
SELECT
  date_trunc('month', c.signup_ts)::date AS signup_ts,
  COUNT(DISTINCT c.customer_id) AS active_customers
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
WHERE c.signup_city_id = {cityId} AND c.is_deleted = false
GROUP BY date_trunc('month', c.signup_ts)
LIMIT 200`,
    slots: [customerCitySlot, tiebreak('groupCols', 'groupCols', 'customers', 'signup_ts').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'customers', 'signup_ts').rule],
    phrasings: [
      'For signup city {cityId}, return signup_ts cohort month and active_customers with orders.',
      'Build a retention cohort rollup for city {cityId}: signup_ts month and active_customers.',
    ],
    hint: "date_trunc('month', signup_ts) is the cohort month; date_trunc('month', placed_at) is the activity month.",
    gateHints: { rowCeiling: 150 },
  }),
  rv({
    skill: 'rv-lifecycle-latency',
    family: 'grouped',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.vehicle_type,
  AVG(EXTRACT(EPOCH FROM c.approved_at - c.applied_at)) AS avg_apply_to_approve_seconds,
  AVG(EXTRACT(EPOCH FROM c.activated_at - c.approved_at)) AS avg_approve_to_active_seconds
FROM couriers c
WHERE c.approved_at IS NOT NULL
  AND c.activated_at IS NOT NULL
GROUP BY c.vehicle_type
LIMIT 200`,
    slots: [tiebreak('groupCols', 'groupCols', 'couriers', 'vehicle_type').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'couriers', 'vehicle_type').rule],
    phrasings: [
      'Report vehicle_type plus average apply-to-approve and approve-to-active seconds.',
      'Measure courier onboarding latency per vehicle_type.',
    ],
    hint: 'Subtract timestamps, extract epoch seconds, filter NULL stamps, then average per vehicle_type.',
  }),
  rv({
    skill: 'rv-clean-layer-capstone',
    family: 'grouped',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  canon.merchant_id,
  COUNT(*) AS order_count,
  SUM(canon.amount_cents) AS gross_cents,
  COUNT(*) FILTER (WHERE canon.clean_status = 'delivered') AS delivered_orders
FROM (
  SELECT
    o.order_id,
    o.merchant_id,
    dp.amount_cents,
    CASE
      WHEN LOWER(TRIM(o.status)) IN ('delivered', 'complete') THEN 'delivered'
      ELSE LOWER(TRIM(o.status))
    END AS clean_status
  FROM orders o
  JOIN (SELECT customer_id FROM customers WHERE is_deleted = false) valid_customers
    ON valid_customers.customer_id = o.customer_id
  JOIN (
    SELECT
      chosen.order_id,
      chosen.amount_cents
    FROM (
      SELECT
        p.order_id,
        p.amount_cents,
        MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id,
        p.payment_id
      FROM payments p
    ) chosen
    WHERE chosen.payment_id = chosen.chosen_payment_id
  ) dp ON dp.order_id = o.order_id
) canon
GROUP BY canon.merchant_id
LIMIT 200`,
    slots: [tiebreak('groupCols', 'groupCols', 'orders', 'merchant_id').slot],
    bindingRules: [tiebreak('groupCols', 'groupCols', 'orders', 'merchant_id').rule],
    phrasings: [
      'Stack clean-layer subqueries and report merchant_id, order_count, gross_cents, delivered_orders.',
      'Capstone: build a clean layer with valid customers, deduped payments, canonical status, and merchant totals.',
    ],
    hint: 'Compose the trusted layer from valid customers, one payment per order, and canonical status, then aggregate the bounded city slice.',
    gateHints: { rowCeiling: 200 },
  }),
  rv({
    skill: 'rv-recursive-cte',
    family: 'single-table',
    primaryTable: 'categories',
    sqlShape: `
SELECT
  tree_walk.category_id,
  tree_walk.name,
  tree_walk.depth,
  tree_walk.path
FROM (
  WITH RECURSIVE cleaned AS (
    SELECT
      c.category_id,
      c.name,
      CASE
        WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id
        ELSE NULL
      END AS parent_category_id
    FROM categories c
  ),
  tree AS (
    SELECT
      cleaned.category_id,
      cleaned.name,
      1 AS depth,
      cleaned.name AS path
    FROM cleaned
    WHERE cleaned.category_id = (SELECT MIN(category_id) FROM cleaned WHERE parent_category_id IS NULL)
    UNION ALL
    SELECT
      child.category_id,
      child.name,
      parent.depth + 1,
      parent.path || ' > ' || child.name
    FROM cleaned child
    JOIN tree parent ON child.parent_category_id = parent.category_id
  )
  SELECT category_id, name, depth, path
  FROM tree
) tree_walk`,
    slots: [tiebreak('sortKey', 'sortKey', 'categories', 'category_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'categories', 'category_id').rule],
    phrasings: [
      'Walk the category tree from its cleaned root and return category_id, name, depth, and path.',
      'Traverse the merchant-category hierarchy after nulling dangling parent pointers.',
    ],
    hint: 'Clean dangling parents first, then use WITH RECURSIVE: base root row, recursive child join, and path extension.',
    gateHints: { rowCeiling: 60, minDistinct: 3 },
  }),
];

export const ROVE_TEMPLATES: Template[] = [
  ...CLEAN_TEMPLATES,
  ...ANALYTIC_TEMPLATES,
  ...BEHAVIORAL_TEMPLATES,
];
