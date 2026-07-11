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

type RoveTemplateConfig = Parameters<typeof rv>[0];

function singleOrdered(config: Omit<RoveTemplateConfig, 'family' | 'slots' | 'bindingRules'> & {
  slots?: Slot[];
  bindingRules?: BindingRule[];
  sortTable: string;
  sortCol: string;
}): Template {
  const sort = tiebreak('sortKey', 'sortKey', config.sortTable, config.sortCol);
  return rv({
    ...config,
    family: 'single-table',
    slots: [...(config.slots ?? []), sort.slot],
    bindingRules: [...(config.bindingRules ?? []), sort.rule],
  });
}

function groupedBy(config: Omit<RoveTemplateConfig, 'family' | 'slots' | 'bindingRules'> & {
  slots?: Slot[];
  bindingRules?: BindingRule[];
  groupTable: string;
  groupCol: string;
}): Template {
  const group = tiebreak('groupCols', 'groupCols', config.groupTable, config.groupCol);
  return rv({
    ...config,
    family: 'grouped',
    slots: [...(config.slots ?? []), group.slot],
    bindingRules: [...(config.bindingRules ?? []), group.rule],
  });
}

function windowedBy(config: Omit<RoveTemplateConfig, 'family' | 'slots' | 'bindingRules'> & {
  slots?: Slot[];
  bindingRules?: BindingRule[];
  partitionTable: string;
  partitionCol: string;
  rankTable: string;
  rankCol: string;
}): Template {
  const partition = tiebreak('partitionCols', 'partitionCols', config.partitionTable, config.partitionCol);
  const rank = tiebreak('rankKey', 'rankKey', config.rankTable, config.rankCol);
  return rv({
    ...config,
    family: 'windowed',
    slots: [...(config.slots ?? []), partition.slot, rank.slot],
    bindingRules: [...(config.bindingRules ?? []), partition.rule, rank.rule],
  });
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
  cm('rv-profile-dirty-data', 'rv-clean', 1, 'Profile dirty data', { ...teach(
    'Before cleaning anything, count dirty conditions such as nulls, blanks, and out-of-range values.',
    'A data profile is a health report you run once so you know what to fix.',
    "SELECT COUNT(*) FILTER (WHERE tip_cents IS NULL) AS null_tips FROM orders",
    'FILTER counts a condition without a separate scan.'
  ),
    whyWhen:
      "Run a profile as step one on any unfamiliar table so you fix real problems instead of guessing, sizing nulls, blanks, and out-of-range values before committing to a cleaning plan.",
    watchOut:
      "COUNT(col) silently skips NULLs and so understates the gap; use COUNT(*) FILTER (WHERE col IS NULL) to measure each dirty condition in one scan.",
    interviewNote:
      "Data-quality rounds open with 'how would you check this table is trustworthy' - lead with a single-pass FILTER profile rather than row-by-row spot checks.",
  }),
  cm('rv-text-normalize', 'rv-clean', 2, 'Normalize text', { ...teach(
    'Trim whitespace and lowercase text so the same value stops looking like many values.',
    'TRIM plus LOWER collapse cosmetic variants onto one canonical spelling.',
    'SELECT LOWER(TRIM(full_name)) AS clean_name FROM customers',
    'Cleaning can be a projection; it does not have to mutate the table.'
  ),
    whyWhen:
      "Apply TRIM plus LOWER whenever a GROUP BY or JOIN on text splits one real value across cosmetic variants like ' Ana ' and 'ana'.",
    watchOut:
      "Normalizing in the SELECT but grouping on the raw column still double-counts; apply the same LOWER(TRIM(...)) to the GROUP BY and JOIN keys, not just the output.",
    interviewNote:
      "Expect 'why is this category showing up twice' - the answer they want is casing and whitespace, fixed by normalizing before you aggregate.",
  }),
  cm('rv-case-canonicalize', 'rv-clean', 3, 'Canonicalize synonyms', { ...teach(
    'Map casing variants and synonyms such as cc and credit onto one canonical label with CASE.',
    'A CASE ladder is a small lookup table written inline.',
    "SELECT CASE WHEN LOWER(method) IN ('cc', 'credit') THEN 'credit_card' ELSE LOWER(method) END AS method FROM payments",
    'Lowercase first, then match the synonym set.'
  ),
    whyWhen:
      "Use a CASE ladder when variants are true synonyms like 'cc', 'credit', and 'credit card' that TRIM and LOWER alone cannot merge onto one label.",
    watchOut:
      "A CASE with no ELSE returns NULL for any unlisted value and silently drops it; keep an ELSE that passes the cleaned original through.",
    interviewNote:
      "Framed as 'consolidate these payment methods' - show the inline CASE map and mention a lookup or mapping table as the scalable version.",
  }),
  cm('rv-null-coalesce-nullif', 'rv-clean', 4, 'COALESCE and NULLIF', { ...teach(
    'COALESCE fills missing values; NULLIF turns a sentinel such as an empty string back into NULL.',
    'COALESCE picks the first non-null; NULLIF is the inverse for one bad value.',
    "SELECT COALESCE(tip_cents, 0) AS tip_cents, NULLIF(TRIM(order_total_legacy), '') AS raw_total FROM orders",
    'NULL and zero carry different meanings for tips.'
  ),
    whyWhen:
      "Reach for COALESCE to supply a default for a genuinely missing value and NULLIF to turn a fake value like '' or -1 back into NULL before it corrupts math.",
    watchOut:
      "COALESCE(tip_cents, 0) is correct for SUM but wrong for AVG, since it turns unknown tips into real zeros and drags the mean down; only default when zero is the true meaning.",
    interviewNote:
      "Probed as 'these blanks are actually -1, 9999, or N/A, clean them' - answer NULLIF to demote the sentinel, then COALESCE only where a default is meaningful.",
  }),
  cm('rv-money-text-cast', 'rv-clean', 5, 'Cast money text', { ...teach(
    'Strip currency symbols, commas, and words from money-as-text before casting to a number.',
    'Clean the string first, then cast; never sum raw text.',
    "SELECT REGEXP_REPLACE(order_total_legacy, '[^0-9.]', '', 'g')::numeric AS dollars FROM orders",
    'Keep only digits and the decimal point.'
  ),
    whyWhen:
      "Strip-then-cast whenever money is stored as text like '$1,299' or '1,299 USD' and you need to SUM, average, or compare it numerically.",
    watchOut:
      "Casting the raw string errors or truncates because '$' and ',' are not numeric; REGEXP_REPLACE everything except digits and the decimal point first, then cast to numeric.",
    interviewNote:
      "A classic trap is 'sum this revenue column' when it is really text - they watch whether you notice the symbols and clean before CAST instead of summing garbage.",
  }),
  cm('rv-regex-clean-contacts', 'rv-clean', 6, 'Regex-clean contacts', { ...teach(
    'Normalize phone and email with regex: strip non-digits from phones and lowercase email addresses.',
    'REGEXP_REPLACE is find-and-replace with pattern power.',
    "SELECT REGEXP_REPLACE(phone, '[^0-9]', '', 'g') AS phone_digits FROM customers",
    'Digits-only makes phone values comparable.'
  ),
    whyWhen:
      "Use REGEXP_REPLACE to standardize phones and emails so one person stops appearing as several contacts across formats like '(555) 100' and '555-100'.",
    watchOut:
      "Stripping every non-digit from a phone also removes a leading '+' country code; decide whether E.164 matters before flattening, and lowercase-plus-trim emails rather than deleting their punctuation.",
    interviewNote:
      "Phrased as 'dedupe customers by phone or email' - graders want the key normalized first, since the dedupe is only as good as the cleaned contact.",
  }),
  cm('rv-timezone-city-join', 'rv-clean', 7, 'Timezone via city join', { ...teach(
    "Convert a local timestamp using the city's IANA timezone from the cities table.",
    'The city timezone is the source of truth; a stored numeric offset can go stale.',
    'SELECT o.placed_at AT TIME ZONE ci.timezone AS utc_instant FROM orders o JOIN cities ci ON ci.city_id = o.city_id',
    'Join to get the timezone, then convert the timestamp.'
  ),
    whyWhen:
      "Convert naive local timestamps like placed_at with AT TIME ZONE using the city's IANA zone whenever you compare or roll up events across cities.",
    watchOut:
      "The denormalized utc_offset_hours column goes stale across DST and is wrong for some rows on purpose; join cities.timezone and let AT TIME ZONE derive the offset instead of trusting a static number.",
    interviewNote:
      "Expect 'these events span time zones, align them' - name storing UTC timestamptz and converting via the IANA zone, and flag any fixed-offset column as a DST bug.",
  }),
  cm('rv-dedup-rownumber', 'rv-clean', 8, 'Deduplicate with ROW_NUMBER', { ...teach(
    'Collapse duplicate customer rows to one row per person using ROW_NUMBER over master_customer_id.',
    'Number the duplicates inside each identity group, then keep one representative row.',
    'SELECT customer_id, ROW_NUMBER() OVER (PARTITION BY master_customer_id) AS rn FROM customers',
    'master_customer_id is the hidden identity key.'
  ),
    whyWhen:
      "Reach for ROW_NUMBER when a natural key such as master_customer_id repeats and you must keep exactly one row per identity, usually the most recent.",
    watchOut:
      "An ORDER BY with no unique tie-break keeps a nondeterministic row that changes between runs; add a stable key like customer_id so the survivor is reproducible, and note that plain SELECT DISTINCT will not collapse rows differing on a noise column.",
    interviewNote:
      "The canonical prompt is 'keep the latest record per user' - answer ROW_NUMBER() OVER (PARTITION BY key ORDER BY updated_at DESC) filtered to rn = 1, and mention Postgres DISTINCT ON (key) as the shortcut.",
    interviewPattern: "Deduplication",
  }),
  cm('rv-orphan-anti-join', 'rv-clean', 9, 'Find orphan rows', { ...teach(
    'Find orders whose customer_id has no matching customer after purges.',
    'An anti-join keeps the left rows that fail to match.',
    'SELECT o.order_id FROM orders o WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = o.customer_id)',
    'orders.customer_id has no foreign key on purpose.'
  ),
    whyWhen:
      "Use an anti-join to find child rows whose parent is gone, such as orders.customer_id pointing at a purged customer, since orders carries no enforcing foreign key.",
    watchOut:
      "NOT IN returns no rows the moment its subquery yields a single NULL; prefer NOT EXISTS or LEFT JOIN ... WHERE parent.id IS NULL, which are NULL-safe.",
    interviewNote:
      "Asked as 'find records with no matching parent' - reach for NOT EXISTS and explain why it beats NOT IN on nullable keys.",
    interviewPattern: "Anti-join",
  }),
  cm('rv-soft-delete-valid', 'rv-clean', 10, 'Valid non-deleted population', { ...teach(
    'Analyze only the valid population by excluding soft-deleted rows.',
    'Soft-deleted rows still exist; you must filter them out yourself.',
    'SELECT COUNT(*) FROM support_tickets WHERE is_deleted = false',
    'Forgetting this filter inflates metrics.'
  ),
    whyWhen:
      "Add an explicit is_deleted = false filter on any soft-delete table so archived rows stop inflating counts, sums, and averages.",
    watchOut:
      "Deleted rows still live in the table, so omitting the filter silently overstates every metric; bake WHERE is_deleted = false into the base view or CTE so downstream queries cannot forget it.",
    interviewNote:
      "Interviewers plant the soft-delete column and watch whether you filter it; state the assumption out loud ('excluding deleted rows') rather than trusting the table to be clean.",
  }),
  cm('rv-payment-dedup', 'rv-clean', 11, 'Dedup payment retries', { ...teach(
    'Keep one payment per order even when retry rows exist.',
    'Partition retries by order_id, choose one deterministic payment_id, and keep that representative.',
    'SELECT order_id, MIN(payment_id) OVER (PARTITION BY order_id) AS chosen_payment_id FROM payments',
    'The raw table is intentionally not unique by order_id, so the representative needs a stable rule.'
  ),
    whyWhen:
      "Reach for this when a table that should be one-per-key is not - payments allows retry rows per order_id - and you need a single representative before summing amounts.",
    watchOut:
      "Joining orders to raw payments multiplies revenue by counting every retry; collapse to one payment per order_id with a deterministic pick before aggregating.",
    interviewNote:
      "Framed as 'one payment per order' or 'why is revenue doubled' - answer partition by order_id, keep one deterministic row, then join.",
    interviewPattern: "Deduplication",
  }),
  cm('rv-rating-outlier-clean', 'rv-clean', 12, 'Clean rating outliers', { ...teach(
    'Drop out-of-range star ratings before averaging.',
    'Sentinels such as 0, 6, -1, and 99 poison an average; filter to the valid band first.',
    'SELECT AVG(stars) FROM ratings WHERE stars BETWEEN 1 AND 5',
    'Range-guard, then aggregate.'
  ),
    whyWhen:
      "Range-guard before averaging any bounded metric such as 1-5 stars, so injected sentinels like 0, 6, -1, and 99 cannot skew the mean.",
    watchOut:
      "AVG(stars) over raw data quietly absorbs out-of-band sentinels and returns a wrong number with no error; filter stars BETWEEN 1 AND 5 first rather than nulling each bad value one at a time.",
    interviewNote:
      "Probed as 'this average looks off' - the expected move is to spot impossible values, filter to the valid band, then aggregate.",
  }),
  cm('rv-rank-leaderboard', 'rv-analytic', 1, 'Rank a leaderboard', { ...teach(
    'Rank couriers within a city by lifetime deliveries, keeping ties visible.',
    'A ranking window keeps each row while calculating a relative position.',
    'SELECT courier_id, RANK() OVER (PARTITION BY home_city_id) AS city_rank FROM couriers',
    'The partition scopes the leaderboard to one city.'
  ),
    whyWhen:
      "Use RANK or DENSE_RANK when you need a per-partition standing that keeps ties visible, like ranking couriers within home_city_id by lifetime_deliveries.",
    watchOut:
      "RANK leaves gaps after ties (1, 1, 3) while DENSE_RANK does not (1, 1, 2), and ROW_NUMBER forces an arbitrary single winner; pick the one whose tie behavior matches the ask, since lifetime_deliveries has deliberate ties here.",
    interviewNote:
      "Expect 'rank X within each group' - be ready to contrast RANK, DENSE_RANK, and ROW_NUMBER, because the tie semantics are the whole point of the question.",
    interviewPattern: "Ranking",
  }),
  cm('rv-topn-per-group', 'rv-analytic', 2, 'Top-N per group', { ...teach(
    'Return a bounded top slice per group by numbering rows inside each group and filtering the number.',
    'Number rows per group, then keep the first few rows from each group.',
    'SELECT * FROM (SELECT city_id, merchant_id, ROW_NUMBER() OVER (PARTITION BY city_id) AS rn FROM orders) x WHERE rn <= 3',
    'The row number makes a group-local slice possible.'
  ),
    whyWhen:
      "Reach for number-rows-then-filter when you need the top N per group, like the top 3 merchants by order_count in each city_id, not just the single max.",
    watchOut:
      "GROUP BY plus MAX gives only N=1 and drops the other columns; use ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC) in a subquery and keep rn <= N, remembering RANK can return more than N when ties exist.",
    interviewNote:
      "The stock prompt is 'top 2 products by revenue per category' - answer the window-in-subquery pattern and state whether ties should be kept (RANK) or the count capped hard (ROW_NUMBER).",
    interviewPattern: "Top-N per group",
  }),
  cm('rv-lag-lead-deltas', 'rv-analytic', 3, 'LAG and LEAD deltas', { ...teach(
    'Compare the current row to a previous row in the same city with LAG.',
    'LAG pulls another row into the current row so you can subtract.',
    'SELECT amount_cents - LAG(amount_cents) OVER (PARTITION BY city_id) AS delta FROM orders',
    'The first row in a partition has no previous value.'
  ),
    whyWhen:
      "Reach for LAG or LEAD when a row needs a value from the previous or next row in the same ordered partition, such as period-over-period amount deltas within a city_id.",
    watchOut:
      "The first row of each partition has no previous row, so LAG returns NULL and the delta is NULL; supply a default with LAG(x, 1, 0) or filter it, and always set an explicit ORDER BY or the offset is meaningless.",
    interviewNote:
      "Asked as 'change versus the prior period' - answer LAG over an explicit ORDER BY and call out the first-row NULL as the edge case being checked.",
  }),
  cm('rv-running-total', 'rv-analytic', 4, 'Running total', { ...teach(
    'Accumulate a city-level total with a SUM window.',
    'A window aggregate keeps row detail while adding a group-level calculation.',
    'SELECT SUM(amount_cents) OVER (PARTITION BY city_id) AS city_total FROM orders',
    'The row still remains after the window calculation.'
  ),
    whyWhen:
      "Use a windowed SUM with ORDER BY when you need a cumulative total that keeps every row, such as gross revenue accumulating across a city's date range.",
    watchOut:
      "SUM(x) OVER (PARTITION BY ...) with no ORDER BY returns one partition-wide total on every row instead of a running one; add ORDER BY inside OVER() to make it accumulate, and note the default RANGE frame ties rows sharing a sort value.",
    interviewNote:
      "Probed as 'running or cumulative total' - the tell is placing ORDER BY inside OVER(); a bare PARTITION BY total is the common wrong answer.",
  }),
  cm('rv-moving-average-frame', 'rv-analytic', 5, 'Moving average on a date spine', { ...teach(
    'Build a dense date spine before applying a framed moving calculation.',
    'A generated spine makes missing days visible instead of silently skipping them.',
    "SELECT placed_at::date AS order_day, AVG(amount_cents) OVER (ORDER BY placed_at::date ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS framed_avg FROM orders",
    'The frame defines which rows feed each window value - here each day averages itself plus the six days before it.'
  ),
    whyWhen:
      "Frame an AVG over a gap-free date spine for smoothed trends like a 7-day moving average, where missing days would otherwise distort the window.",
    watchOut:
      "ROWS counts physical rows while RANGE counts sort values, so ROWS BETWEEN 6 PRECEDING misfires when dates are missing; build a generate_series spine and LEFT JOIN so every day exists, then frame with ROWS for an exact N-row window.",
    interviewNote:
      "Classic ask is '7-day moving average' - graders look for a date spine to fill gaps plus the correct ROWS versus RANGE choice, not just AVG OVER.",
    interviewPattern: "Moving average",
  }),
  cm('rv-ntile-bucketing', 'rv-analytic', 6, 'NTILE bucketing', { ...teach(
    'Split rows into quartile buckets with NTILE(4).',
    'NTILE assigns each row to one of several size-balanced buckets.',
    'SELECT NTILE(4) OVER (PARTITION BY city_id) AS quartile FROM orders',
    'Buckets are count-balanced, not value-balanced.'
  ),
    whyWhen:
      "Use NTILE(n) to split rows into n equal-count buckets like spend quartiles or deciles; switch to PERCENTILE_CONT when they ask for a median or p90 cut point.",
    watchOut:
      "NTILE balances by row count, not value, so equal-value rows can land in different buckets and any remainder is pushed into the earliest buckets; do not use it when they actually want a median (use PERCENTILE_CONT).",
    interviewNote:
      "Asked as 'split customers into spend quartiles' or 'p90 latency' - know NTILE for even-count buckets and PERCENTILE_CONT or DISC for percentiles, and that AVG is not a median.",
    interviewPattern: "Bucketing",
  }),
  cm('rv-sessionization', 'rv-behavioral', 1, 'Sessionize events', { ...teach(
    'Group a customer event stream into sessions with a 30-minute inactivity gap.',
    'Flag a new session at each gap, then cumulative-sum the flags into a session number.',
    "SELECT LAG(event_ts) OVER (PARTITION BY customer_id) AS previous_event_ts FROM event_log",
    'The previous event timestamp is the comparison point.'
  ),
    whyWhen:
      "Reach for the gaps-and-islands pattern to cut an event stream into sessions by an inactivity threshold, such as a new session after 30 idle minutes per customer.",
    watchOut:
      "Grouping by calendar day splits one late-night session and merges unrelated visits; instead LAG(event_ts) per customer, flag gaps over the threshold, and cumulative-SUM the flags in one linear pass rather than a self-join.",
    interviewNote:
      "Posed as '30-minute inactivity sessions' or 'login streaks' - the expected answer is LAG then a running SUM of the new-session flag, and graders watch that you avoid an O(n^2) self-join.",
    interviewPattern: "Sessionization",
  }),
  cm('rv-funnel-conversion', 'rv-behavioral', 2, 'Funnel conversion', { ...teach(
    'Count distinct customers reaching each funnel step in one city to measure drop-off.',
    'A funnel is one distinct-customer count per step.',
    'SELECT event_type, COUNT(DISTINCT customer_id) FROM event_log GROUP BY event_type',
    'Distinct customers matter more than raw event count.'
  ),
    whyWhen:
      "Build a funnel when you need the count of distinct users clearing each ordered stage, from app_open to order_placed, plus the drop-off between steps.",
    watchOut:
      "COUNT(*) counts events and inflates each step; use COUNT(DISTINCT customer_id), require the stage timestamps to be non-decreasing, and cast when dividing (conversions::numeric / visits) or integer division floors the rate to 0.",
    interviewNote:
      "The stock prompt is 'signup to activate to purchase %' - answer distinct users per ordered step, drop-off via LAG, and flag integer division on the conversion rate.",
    interviewPattern: "Funnel",
  }),
  cm('rv-retention-cohort', 'rv-behavioral', 3, 'Retention cohort', { ...teach(
    'Bucket customers by signup month and measure how many have later order activity.',
    'The cohort key is fixed at signup; the active customer count shows whether customers return.',
    "SELECT date_trunc('month', signup_ts) AS cohort_month FROM customers",
    'The cohort month never changes for a customer.'
  ),
    whyWhen:
      "Use cohort retention to group users by their first-seen period, such as signup month, and measure how many return in each later period.",
    watchOut:
      "Cohorting by calendar activity instead of first-seen inflates retention, and dividing returns by the wrong base distorts the rate; fix the cohort key at each user's MIN signup via date_trunc and always divide by that cohort's original size.",
    interviewNote:
      "Asked for a 'month-N retention matrix' - anchor the cohort to first activity, count returns in period N, and be explicit about the denominator.",
    interviewPattern: "Cohort retention",
  }),
  cm('rv-lifecycle-latency', 'rv-behavioral', 4, 'Lifecycle latency', { ...teach(
    'Measure elapsed time between lifecycle timestamps for courier onboarding.',
    'Subtract two timestamps to get duration, then average it per group.',
    'SELECT EXTRACT(EPOCH FROM approved_at - applied_at) FROM couriers',
    'Filter NULL lifecycle stamps before measuring elapsed time.'
  ),
    whyWhen:
      "Subtract lifecycle timestamps to measure elapsed time between stages, like courier applied_at to approved_at to activated_at, then average per segment.",
    watchOut:
      "Subtracting when either stamp is NULL yields NULL and silently shrinks the sample; keep only rows where both timestamps exist and EXTRACT(EPOCH FROM ...) for comparable seconds.",
    interviewNote:
      "Framed as 'average time from X to Y' - state how you handle NULL or unreached stages, and offer median over mean when the latency distribution is long-tailed.",
  }),
  cm('rv-clean-layer-capstone', 'rv-behavioral', 5, 'Clean-layer capstone', { ...teach(
    'Stack cleaning subqueries for valid customers, canonical labels, and deduped payments, then analyze the bounded slice.',
    'Build a trusted layer first, then ask the business question on top.',
    'SELECT canon.city_id, canon.clean_status, COUNT(*) AS order_count FROM (SELECT city_id, LOWER(TRIM(status)) AS clean_status FROM orders) canon GROUP BY canon.city_id, canon.clean_status',
    'Clean once in an inner layer, then aggregate the cleaned columns; bound the slice before composing bigger stacks.'
  ),
    whyWhen:
      "Stack a clean layer when a question depends on several fixes at once - valid customers, deduped payments, canonical status - composed in CTEs before the final aggregate.",
    watchOut:
      "Cleaning in the final SELECT after the joins already fired multiplies and mislabels rows; build each trusted layer (filter, dedupe, canonicalize) first, then join and aggregate the bounded slice.",
    interviewNote:
      "The take-home version is 'answer the business question on these messy tables' - graders reward a readable CTE stack that cleans before it aggregates over one giant tangled query.",
  }),
  cm('rv-recursive-cte', 'rv-behavioral', 6, 'Recursive CTE category tree', { ...teach(
    'Walk the self-referencing merchant-category tree with WITH RECURSIVE after cleaning dangling parents.',
    'A recursive CTE is a base row UNION ALL a step that joins children to the growing frontier.',
    'WITH RECURSIVE tree AS (SELECT category_id, name, 1 AS depth FROM categories WHERE parent_category_id IS NULL UNION ALL SELECT c.category_id, c.name, t.depth + 1 FROM categories c JOIN tree t ON c.parent_category_id = t.category_id) SELECT category_id, name, depth FROM tree',
    'The base row seeds the roots, the UNION ALL step joins children to the growing frontier, and depth is materialized as it walks.'
  ),
    whyWhen:
      "Reach for WITH RECURSIVE to walk a self-referencing tree of unknown depth, like a merchant-category hierarchy or an org chart, that a fixed set of joins cannot traverse.",
    watchOut:
      "A cycle or a dangling parent pointer can loop forever; null out orphaned parents first and carry a depth or path column so you can cap recursion and detect repeats, anchoring the base case on true roots where parent_category_id IS NULL.",
    interviewNote:
      "Asked as 'list all reports under a manager with their level' - answer an anchor row UNION ALL a child-join step that materializes depth, and mention the termination guard.",
    interviewPattern: "Recursive hierarchy",
  }),
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
      'For city {cityId}, return payment_id, order_id, and canonical_method: cc, credit, and credit card become credit_card; applepay and apple pay become apple_pay; anything else stays as the lowercased trimmed method.',
      'Canonicalize payment method text for city {cityId}: map cc, credit, and credit card to credit_card, map applepay and apple pay to apple_pay, and keep other methods lowercased and trimmed.',
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
  deduped.customer_id
FROM (
  SELECT
    c.master_customer_id,
    MIN(c.customer_id) OVER (PARTITION BY c.master_customer_id) AS customer_id,
    ROW_NUMBER() OVER (PARTITION BY c.master_customer_id) AS rn
  FROM customers c
  WHERE c.signup_city_id = 15 AND c.is_deleted = false
) deduped
WHERE rn = 1
LIMIT 200`,
    slots: [tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').slot],
    bindingRules: [tiebreak('sortKey', 'sortKey', 'customers', 'customer_id').rule],
    phrasings: [
      'For signup city 15, return one active customer_id per master_customer_id.',
      'Deduplicate customers in city 15 with ROW_NUMBER over master_customer_id and keep rn = 1.',
    ],
    hint: 'Use ROW_NUMBER() OVER (PARTITION BY master_customer_id), keep rn = 1, and return the stable chosen customer_id.',
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
      'Clean rating outliers in city {cityId} by keeping only stars between 1 and 5, then average stars per courier_id.',
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
      'For city {cityId} over the 30 days starting {windowStart}, return order_id, placed_at, amount_cents, and amount_delta_cents.',
      'Compute an order amount delta for city {cityId} using LAG within the 30 days starting {windowStart}.',
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
      'For city {cityId} over the 30 days starting {windowStart}, return order_id, placed_at, amount_cents, and running_gross_cents.',
      'Add a city-level running_gross_cents window value to order rows for city {cityId} in the 30 days starting {windowStart}.',
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
      'For city {cityId}, build a dense 30-day date spine starting {windowStart} and return order_day, gross_cents, and trailing_7day_avg_cents.',
      'Compute a framed moving average over a gap-free 30-day spine starting {windowStart} for city {cityId}.',
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
      'Stack clean-layer subqueries (one payment per order; statuses delivered and complete both count as delivered) and report merchant_id, order_count, gross_cents, delivered_orders.',
      'Capstone: build a clean layer with one payment per order and canonical status (complete counts as delivered), then report merchant_id, order_count, gross_cents, delivered_orders.',
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

const ROVE_EXTRA_TEMPLATES: Template[] = [
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'customers',
    sqlShape: `
SELECT
  c.signup_city_id,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE c.full_name IS NULL OR TRIM(c.full_name) = '') AS blank_names,
  COUNT(*) FILTER (WHERE c.birth_year IS NULL) AS null_birth_years,
  COUNT(*) FILTER (WHERE c.is_deleted = true) AS deleted_customers
FROM customers c
GROUP BY c.signup_city_id`,
    groupTable: 'customers',
    groupCol: 'signup_city_id',
    phrasings: [
      'Profile customers by signup_city_id with total_rows, blank_names, null_birth_years, and deleted_customers.',
      'For each customer signup city, count missing names, missing birth years, and soft-deleted rows.',
    ],
    hint: 'Use FILTER clauses to count several dirty customer conditions in one grouped scan.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  p.processor,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE TRIM(COALESCE(p.amount_legacy, '')) = '') AS blank_legacy_amounts,
  COUNT(*) FILTER (WHERE p.captured_at IS NULL) AS uncaptured_rows,
  COUNT(*) FILTER (WHERE p.refund_amount_cents IS NOT NULL) AS refund_rows
FROM payments p
GROUP BY p.processor`,
    groupTable: 'payments',
    groupCol: 'processor',
    phrasings: [
      'Profile payments by processor with total_rows, blank_legacy_amounts, uncaptured_rows, and refund_rows.',
      'For each payment processor, count dirty legacy amounts plus uncaptured and refunded rows.',
    ],
    hint: 'Each COUNT(*) FILTER clause can target a separate payment quality condition.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.home_city_id,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE c.approved_at IS NULL) AS null_approved_at,
  COUNT(*) FILTER (WHERE c.activated_at IS NULL) AS null_activated_at,
  COUNT(*) FILTER (WHERE c.rating_avg IS NULL) AS null_rating_avg
FROM couriers c
GROUP BY c.home_city_id`,
    groupTable: 'couriers',
    groupCol: 'home_city_id',
    phrasings: [
      'Profile couriers by home_city_id with total_rows, null_approved_at, null_activated_at, and null_rating_avg.',
      'For each courier home city, count missing lifecycle timestamps and missing ratings.',
    ],
    hint: 'Profile nullable lifecycle fields before measuring courier onboarding.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'support_tickets',
    sqlShape: `
SELECT
  t.channel,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE t.first_response_at IS NULL) AS null_first_response_at,
  COUNT(*) FILTER (WHERE t.resolved_at IS NULL) AS unresolved_rows,
  COUNT(*) FILTER (WHERE t.is_deleted = true) AS deleted_rows
FROM support_tickets t
GROUP BY t.channel`,
    groupTable: 'support_tickets',
    groupCol: 'channel',
    phrasings: [
      'Profile support_tickets by channel with total_rows, null_first_response_at, unresolved_rows, and deleted_rows.',
      'For each support channel, count missing first responses, unresolved rows, and soft deletes.',
    ],
    hint: 'Keep the channel grouping and count each ticket quality condition with FILTER.',
    gateHints: { minDistinct: 1 },
  }),

  singleOrdered({
    skill: 'rv-text-normalize',
    primaryTable: 'merchants',
    slots: [{ name: 'cityId', kind: 'literal', table: 'merchants', op: '=', col: 'city_id' }],
    sortTable: 'merchants',
    sortCol: 'merchant_id',
    sqlShape: `
SELECT
  m.merchant_id,
  LOWER(TRIM(m.name)) AS clean_merchant_name,
  LOWER(TRIM(m.category)) AS clean_category
FROM merchants m
WHERE m.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return merchant_id, clean_merchant_name, and clean_category after trimming and lowercasing merchant text.',
      'Normalize merchant names and categories in city {cityId}.',
    ],
    hint: 'Apply TRIM before LOWER so leading and trailing spaces do not survive normalization.',
  }),
  singleOrdered({
    skill: 'rv-text-normalize',
    primaryTable: 'couriers',
    slots: [courierCitySlot],
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  c.courier_id,
  LOWER(TRIM(c.full_name)) AS clean_name,
  LOWER(TRIM(c.vehicle_type)) AS clean_vehicle_type
FROM couriers c
WHERE c.home_city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For courier home city {cityId}, return courier_id, clean_name, and clean_vehicle_type.',
      'Normalize courier names and vehicle text in home city {cityId}.',
    ],
    hint: 'LOWER(TRIM(...)) makes dirty casing and spacing comparable.',
  }),
  singleOrdered({
    skill: 'rv-text-normalize',
    primaryTable: 'support_tickets',
    slots: [cityIdSlot],
    sortTable: 'support_tickets',
    sortCol: 'ticket_id',
    sqlShape: `
SELECT
  t.ticket_id,
  LOWER(TRIM(t.category)) AS clean_category,
  LOWER(TRIM(t.priority)) AS clean_priority
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return ticket_id, clean_category, and clean_priority after text normalization.',
      'Normalize support ticket category and priority text for tickets tied to city {cityId}.',
    ],
    hint: 'Normalize categorical text before grouping or comparing support ticket labels.',
  }),
  singleOrdered({
    skill: 'rv-text-normalize',
    primaryTable: 'customers',
    slots: [customerCitySlot],
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  c.customer_id,
  LOWER(TRIM(c.acquisition_channel)) AS clean_acquisition_channel,
  LOWER(TRIM(c.segment)) AS clean_segment
FROM customers c
WHERE c.signup_city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For signup city {cityId}, return customer_id, clean_acquisition_channel, and clean_segment.',
      'Normalize customer acquisition channel and segment labels in city {cityId}.',
    ],
    hint: 'Even controlled labels should be normalized before downstream analysis.',
  }),

  singleOrdered({
    skill: 'rv-case-canonicalize',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  CASE
    WHEN LOWER(TRIM(o.status)) IN ('complete', 'completed', 'delivered') THEN 'delivered'
    WHEN LOWER(TRIM(o.status)) IN ('cancelled', 'canceled', 'cncl') THEN 'cancelled'
    ELSE LOWER(TRIM(o.status))
  END AS canonical_status
FROM orders o
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return order_id and canonical_status: complete, completed, and delivered become delivered; cancelled, canceled, and cncl become cancelled; anything else stays lowercased and trimmed.',
      'Canonicalize order status text for city {cityId}: map complete, completed, and delivered to delivered, map cancelled, canceled, and cncl to cancelled, and keep other statuses lowercased and trimmed.',
    ],
    hint: 'Lowercase and trim the status before testing synonym sets in CASE.',
  }),
  singleOrdered({
    skill: 'rv-case-canonicalize',
    primaryTable: 'couriers',
    slots: [courierCitySlot],
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  c.courier_id,
  CASE
    WHEN LOWER(TRIM(c.vehicle_type)) IN ('bike', 'bicycle') THEN 'bike'
    WHEN LOWER(TRIM(c.vehicle_type)) IN ('e-bike', 'ebike', 'electric bike') THEN 'ebike'
    ELSE LOWER(TRIM(c.vehicle_type))
  END AS canonical_vehicle_type
FROM couriers c
WHERE c.home_city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For courier home city {cityId}, return courier_id and canonical_vehicle_type: bike and bicycle become bike; e-bike, ebike, and electric bike become ebike; anything else stays lowercased and trimmed.',
      'Canonicalize courier vehicle text in home city {cityId}: map bike and bicycle to bike, map e-bike, ebike, and electric bike to ebike, and keep other vehicle types lowercased and trimmed.',
    ],
    hint: 'A CASE ladder turns messy vehicle labels into one stable category set.',
  }),
  singleOrdered({
    skill: 'rv-case-canonicalize',
    primaryTable: 'support_tickets',
    slots: [cityIdSlot],
    sortTable: 'support_tickets',
    sortCol: 'ticket_id',
    sqlShape: `
SELECT
  t.ticket_id,
  CASE
    WHEN LOWER(TRIM(t.priority)) IN ('urgent', 'high', 'p1') THEN 'high'
    WHEN LOWER(TRIM(t.priority)) IN ('normal', 'medium', 'p2') THEN 'medium'
    ELSE LOWER(TRIM(t.priority))
  END AS canonical_priority
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return ticket_id and canonical_priority: urgent, high, and p1 become high; normal, medium, and p2 become medium; anything else stays lowercased and trimmed.',
      'Canonicalize ticket priority text for city {cityId}: map urgent, high, and p1 to high, map normal, medium, and p2 to medium, and keep other priorities lowercased and trimmed.',
    ],
    hint: 'Use CASE to collapse several dirty priority names to a short canonical set.',
  }),
  singleOrdered({
    skill: 'rv-case-canonicalize',
    primaryTable: 'payments',
    slots: [cityIdSlot],
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  p.payment_id,
  CASE
    WHEN LOWER(TRIM(p.status)) IN ('paid', 'captured', 'settled') THEN 'paid'
    WHEN LOWER(TRIM(p.status)) IN ('refunded', 'refund') THEN 'refunded'
    ELSE LOWER(TRIM(p.status))
  END AS canonical_payment_status
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return payment_id and canonical_payment_status: paid, captured, and settled become paid; refunded and refund become refunded; anything else stays lowercased and trimmed.',
      'Canonicalize payment status text for city {cityId}: map paid, captured, and settled to paid, map refunded and refund to refunded, and keep other statuses lowercased and trimmed.',
    ],
    hint: 'Normalize the text first, then put synonyms in CASE branches.',
  }),

  singleOrdered({
    skill: 'rv-null-coalesce-nullif',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  COALESCE(o.tip_cents, 0) AS tip_cents_filled,
  NULLIF(TRIM(COALESCE(o.promo_code, '')), '') AS promo_code_or_null
FROM orders o
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return order_id, tip_cents_filled, and promo_code_or_null.',
      'Fill missing tips and convert blank promo codes to NULL for city {cityId}.',
    ],
    hint: 'Use COALESCE for missing numeric tips and NULLIF for blank promo-code sentinels.',
  }),
  singleOrdered({
    skill: 'rv-null-coalesce-nullif',
    primaryTable: 'customers',
    slots: [customerCitySlot],
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  c.customer_id,
  COALESCE(c.birth_year, 0) AS birth_year_filled,
  NULLIF(TRIM(COALESCE(c.email, '')), '') AS email_or_null
FROM customers c
WHERE c.signup_city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For signup city {cityId}, return customer_id, birth_year_filled, and email_or_null.',
      'Fill missing birth years and turn blank customer emails into NULL for city {cityId}.',
    ],
    hint: 'COALESCE gives a fallback value; NULLIF restores NULL semantics for blank text.',
  }),
  singleOrdered({
    skill: 'rv-null-coalesce-nullif',
    primaryTable: 'couriers',
    slots: [courierCitySlot],
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  c.courier_id,
  COALESCE(c.rating_avg, 0) AS rating_avg_filled,
  COALESCE(c.churned_at, c.activated_at, c.approved_at) AS latest_lifecycle_at
FROM couriers c
WHERE c.home_city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For courier home city {cityId}, return courier_id, rating_avg_filled, and latest_lifecycle_at.',
      'Coalesce courier rating and lifecycle timestamps for home city {cityId}.',
    ],
    hint: 'COALESCE can fall through several nullable lifecycle timestamps.',
  }),
  singleOrdered({
    skill: 'rv-null-coalesce-nullif',
    primaryTable: 'support_tickets',
    slots: [cityIdSlot],
    sortTable: 'support_tickets',
    sortCol: 'ticket_id',
    sqlShape: `
SELECT
  t.ticket_id,
  COALESCE(t.csat, 0) AS csat_filled,
  COALESCE(t.resolved_at, t.first_response_at, t.opened_at) AS last_touch_at
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return ticket_id, csat_filled, and last_touch_at for support tickets.',
      'Fill missing support CSAT and coalesce ticket lifecycle timestamps for city {cityId}.',
    ],
    hint: 'Use COALESCE to pick the most complete support timestamp available.',
  }),

  singleOrdered({
    skill: 'rv-money-text-cast',
    primaryTable: 'payments',
    slots: [cityIdSlot],
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  p.payment_id,
  REGEXP_REPLACE(p.amount_legacy, '[^0-9.]', '', 'g')::numeric AS legacy_payment_dollars
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(p.amount_legacy, '')), '') IS NOT NULL
  AND p.amount_legacy ~ '[0-9]'
LIMIT 200`,
    phrasings: [
      'For city {cityId}, parse payment amount_legacy into numeric legacy_payment_dollars.',
      'Strip non-numeric payment legacy amount text and cast it for payments in city {cityId}.',
    ],
    hint: 'Clean amount_legacy with REGEXP_REPLACE before casting it to numeric.',
  }),
  singleOrdered({
    skill: 'rv-money-text-cast',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  (REGEXP_REPLACE(o.order_total_legacy, '[^0-9.]', '', 'g')::numeric * 100)::integer AS legacy_total_cents
FROM orders o
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') IS NOT NULL
  AND o.order_total_legacy ~ '[0-9]'
LIMIT 200`,
    phrasings: [
      'For city {cityId}, parse order_total_legacy into integer legacy_total_cents.',
      'Convert dirty order total text to cents for city {cityId}.',
    ],
    hint: 'After stripping currency text, multiply dollars by 100 and cast to integer cents.',
  }),
  groupedBy({
    skill: 'rv-money-text-cast',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  o.merchant_id,
  SUM(REGEXP_REPLACE(o.order_total_legacy, '[^0-9.]', '', 'g')::numeric) AS parsed_legacy_dollars
FROM orders o
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(o.order_total_legacy, '')), '') IS NOT NULL
  AND o.order_total_legacy ~ '[0-9]'
GROUP BY o.merchant_id
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'merchant_id',
    phrasings: [
      'For city {cityId}, sum parsed_legacy_dollars per merchant_id from dirty order_total_legacy text.',
      'Clean and cast legacy order totals before aggregating merchant totals in city {cityId}.',
    ],
    hint: 'Cast the cleaned text inside SUM so the aggregation uses numeric values.',
  }),
  groupedBy({
    skill: 'rv-money-text-cast',
    primaryTable: 'payments',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  p.processor,
  SUM(REGEXP_REPLACE(p.amount_legacy, '[^0-9.]', '', 'g')::numeric) AS parsed_payment_dollars
FROM payments p
JOIN orders o ON o.order_id = p.order_id
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(p.amount_legacy, '')), '') IS NOT NULL
  AND p.amount_legacy ~ '[0-9]'
GROUP BY p.processor
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'processor',
    phrasings: [
      'For city {cityId}, sum parsed_payment_dollars per processor after cleaning payment amount_legacy.',
      'Aggregate cleaned legacy payment amounts by processor for city {cityId}.',
    ],
    hint: 'Keep only numeric characters before casting amount_legacy for processor totals.',
  }),

  singleOrdered({
    skill: 'rv-regex-clean-contacts',
    primaryTable: 'couriers',
    slots: [courierCitySlot],
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  c.courier_id,
  REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
  LOWER(TRIM(c.full_name)) AS clean_name
FROM couriers c
WHERE c.home_city_id = {cityId} AND c.phone IS NOT NULL
LIMIT 200`,
    phrasings: [
      'For courier home city {cityId}, return courier_id, phone_digits, and clean_name.',
      'Regex-clean courier phone numbers and normalize courier names in city {cityId}.',
    ],
    hint: "REGEXP_REPLACE(phone, '[^0-9]', '', 'g') strips punctuation from courier phones.",
  }),
  singleOrdered({
    skill: 'rv-regex-clean-contacts',
    primaryTable: 'customers',
    slots: [customerCitySlot],
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  c.customer_id,
  REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
  REGEXP_REPLACE(LOWER(TRIM(c.email)), '^mailto:', '') AS email_without_mailto
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.email IS NOT NULL
LIMIT 200`,
    phrasings: [
      'For signup city {cityId}, return customer_id, phone_digits, and email_without_mailto.',
      'Regex-clean customer phones and strip mailto: from emails in city {cityId}.',
    ],
    hint: 'Use one regex for phone digits and another to remove a leading mailto: prefix.',
  }),
  singleOrdered({
    skill: 'rv-regex-clean-contacts',
    primaryTable: 'couriers',
    slots: [courierCitySlot],
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  c.courier_id,
  RIGHT(REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g'), 10) AS phone_last10,
  REGEXP_REPLACE(LOWER(TRIM(c.full_name)), '\\s+', ' ', 'g') AS compact_name
FROM couriers c
WHERE c.home_city_id = {cityId} AND c.phone IS NOT NULL
LIMIT 200`,
    phrasings: [
      'For courier home city {cityId}, return courier_id, phone_last10, and compact_name.',
      'Normalize courier phone digits to the last 10 digits and compact name whitespace for city {cityId}.',
    ],
    hint: 'Regex can strip punctuation from phones and collapse repeated whitespace in names.',
  }),
  singleOrdered({
    skill: 'rv-regex-clean-contacts',
    primaryTable: 'customers',
    slots: [customerCitySlot],
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  c.customer_id,
  REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
  REGEXP_REPLACE(LOWER(TRIM(c.email)), 'example\\.org$', 'example.com') AS normalized_email_domain
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.email IS NOT NULL
LIMIT 200`,
    phrasings: [
      'For signup city {cityId}, return customer_id, phone_digits, and normalized_email_domain.',
      'Clean customer phone digits and normalize example.org email domains for city {cityId}.',
    ],
    hint: 'REGEXP_REPLACE can target the email domain after lowercasing and trimming.',
  }),

  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.city_id,
  ci.timezone AS iana_timezone,
  MAX(o.delivered_at AT TIME ZONE ci.timezone) AS latest_delivery_utc,
  COUNT(*) AS delivered_orders
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.delivered_at IS NOT NULL
GROUP BY o.city_id, ci.timezone`,
    groupTable: 'orders',
    groupCol: 'city_id',
    phrasings: [
      'For each city, return city_id, iana_timezone, latest_delivery_utc, and delivered_orders using city timezone conversion.',
      'Join orders to cities and convert delivered_at to each city timezone before finding the latest delivery instant.',
    ],
    hint: 'Use cities.timezone with AT TIME ZONE instead of the denormalized offset column.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'event_log',
    sqlShape: `
SELECT
  e.city_id,
  ci.name AS city_name,
  MIN(e.event_ts AT TIME ZONE ci.timezone) AS first_event_utc,
  COUNT(*) AS event_count
FROM event_log e
JOIN cities ci ON ci.city_id = e.city_id
GROUP BY e.city_id, ci.name`,
    groupTable: 'event_log',
    groupCol: 'city_id',
    phrasings: [
      'For each city, return city_id, city_name, first_event_utc, and event_count after timezone conversion.',
      'Join event_log to cities and convert event_ts with the city IANA timezone.',
    ],
    hint: 'The event timestamp is local to the city, so join to cities before converting.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.home_city_id,
  ci.timezone AS iana_timezone,
  MIN(c.applied_at AT TIME ZONE ci.timezone) AS first_application_utc,
  COUNT(*) AS courier_count
FROM couriers c
JOIN cities ci ON ci.city_id = c.home_city_id
GROUP BY c.home_city_id, ci.timezone`,
    groupTable: 'couriers',
    groupCol: 'home_city_id',
    phrasings: [
      'For each courier home city, return home_city_id, iana_timezone, first_application_utc, and courier_count.',
      'Convert courier applied_at timestamps through the joined city timezone.',
    ],
    hint: 'home_city_id determines which IANA timezone should convert applied_at.',
    gateHints: { minDistinct: 1 },
  }),
  singleOrdered({
    skill: 'rv-timezone-city-join',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  o.placed_at AS local_placed_at,
  o.placed_at AT TIME ZONE ci.timezone AS placed_utc,
  ci.timezone AS iana_timezone
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return order_id, local_placed_at, placed_utc, and iana_timezone.',
      'Join city timezone data to convert each order placed_at in city {cityId}.',
    ],
    hint: 'Convert the local placed_at timestamp with the timezone from the joined city row.',
  }),

  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'payments',
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  ranked.order_id,
  ranked.payment_id,
  ranked.status
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.status,
    ROW_NUMBER() OVER (PARTITION BY p.order_id) AS rn
  FROM payments p
  WHERE p.order_id >= 259100 AND p.order_id < 259200
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'Deduplicate payments for order_id range 259100-259199 and return order_id, payment_id, and status.',
      'Keep one representative payment attempt per order in order_id range 259100-259199.',
    ],
    hint: 'Partition by order_id, number each retry group, then keep rn = 1.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'customers',
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  ranked.customer_id,
  ranked.normalized_email,
  ranked.signup_ts
FROM (
  SELECT
    c.customer_id,
    LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', ''))) AS normalized_email,
    c.signup_ts,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', '')))) AS rn
  FROM customers c
  WHERE c.signup_city_id = 15 AND c.email IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For signup city 15, deduplicate customers by normalized_email and return customer_id, normalized_email, signup_ts.',
      'Use ROW_NUMBER to keep one customer row per cleaned email in city 15.',
    ],
    hint: 'Normalize email inside the partition expression so cosmetic variants dedupe together.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'event_log',
    sortTable: 'event_log',
    sortCol: 'event_id',
    sqlShape: `
SELECT
  ranked.event_id,
  ranked.customer_id,
  ranked.event_type,
  ranked.event_ts
FROM (
  SELECT
    e.event_id,
    e.customer_id,
    e.event_type,
    e.event_ts,
    ROW_NUMBER() OVER (PARTITION BY e.customer_id, e.session_id, e.event_type) AS rn
  FROM event_log e
  WHERE e.city_id = 15 AND e.event_type = 'order_placed'
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For city 15 order_placed events, deduplicate repeated event types within each customer session and return event_id, customer_id, event_type, event_ts.',
      'Use ROW_NUMBER to keep one order_placed event per customer and session in city 15.',
    ],
    hint: 'Partition by the natural duplicate key, then keep rn = 1.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'couriers',
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  ranked.courier_id,
  ranked.phone_digits,
  ranked.applied_at
FROM (
  SELECT
    c.courier_id,
    REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
    c.applied_at,
    ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS rn
  FROM couriers c
  WHERE c.home_city_id = 5 AND c.status = 'active' AND c.phone IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For active couriers in home city 5, deduplicate by phone_digits and return courier_id, phone_digits, applied_at.',
      'Use ROW_NUMBER to keep one active courier row per cleaned phone number in city 5.',
    ],
    hint: 'Clean the phone number before using it as the duplicate partition key.',
  }),

  singleOrdered({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  ranked.order_id,
  ranked.payment_id,
  ranked.status
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.status,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
) ranked
WHERE ranked.payment_id = ranked.chosen_payment_id
LIMIT 200`,
    phrasings: [
      'Keep the earliest payment attempt per order and return order_id, payment_id, and status.',
      'Deduplicate payment retries by row-numbering attempts per order.',
    ],
    hint: 'Partition by order_id and keep rn = 1 for a deterministic retry representative.',
  }),
  groupedBy({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  deduped.processor,
  COUNT(*) AS paid_order_count,
  SUM(deduped.amount_cents) AS paid_amount_cents
FROM (
  SELECT
    p.processor,
    p.order_id,
    p.payment_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
  WHERE LOWER(TRIM(p.status)) IN ('paid', 'captured')
) deduped
WHERE deduped.payment_id = deduped.chosen_payment_id
GROUP BY deduped.processor
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'processor',
    phrasings: [
      'After deduplicating retries among payments with status paid or captured, report processor, paid_order_count, and paid_amount_cents.',
      'Keep one payment per order among status paid or captured rows, then aggregate deduped payment totals by processor.',
    ],
    hint: 'Deduplicate inside the subquery before grouping by processor.',
  }),
  groupedBy({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  deduped.method,
  COUNT(*) AS deduped_payments,
  SUM(deduped.amount_cents) AS deduped_amount_cents
FROM (
  SELECT
    LOWER(TRIM(p.method)) AS method,
    p.order_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id,
    p.payment_id
  FROM payments p
) deduped
WHERE deduped.payment_id = deduped.chosen_payment_id
GROUP BY deduped.method
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'method',
    phrasings: [
      'Deduplicate payments by order_id, then report method, deduped_payments, and deduped_amount_cents.',
      'Choose one payment per order and aggregate deduped totals by normalized method.',
    ],
    hint: 'Choose the representative payment before counting payment methods.',
  }),
  singleOrdered({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    slots: [cityIdSlot],
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  picked.order_id,
  picked.payment_id,
  picked.amount_cents,
  picked.currency
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.amount_cents,
    p.currency,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  WHERE o.city_id = {cityId}
) picked
WHERE picked.payment_id = picked.chosen_payment_id
LIMIT 200`,
    phrasings: [
      'For city {cityId}, keep one payment per order and return order_id, payment_id, amount_cents, and currency.',
      'Deduplicate payment retry rows inside city {cityId} with ROW_NUMBER.',
    ],
    hint: 'Bound to the city first, row-number retries per order, and keep rn = 1.',
  }),

  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.home_city_id,
  AVG(EXTRACT(EPOCH FROM c.approved_at - c.applied_at)) AS avg_apply_to_approve_seconds,
  COUNT(*) AS approved_couriers
FROM couriers c
WHERE c.approved_at IS NOT NULL
GROUP BY c.home_city_id
LIMIT 200`,
    groupTable: 'couriers',
    groupCol: 'home_city_id',
    phrasings: [
      'Report home_city_id, avg_apply_to_approve_seconds, and approved_couriers for approved couriers.',
      'Measure average application approval latency per courier home city.',
    ],
    hint: 'Subtract applied_at from approved_at and extract epoch seconds before averaging.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.status,
  AVG(EXTRACT(EPOCH FROM c.activated_at - c.approved_at)) AS avg_approve_to_active_seconds,
  COUNT(*) AS activated_couriers
FROM couriers c
WHERE c.approved_at IS NOT NULL AND c.activated_at IS NOT NULL
GROUP BY c.status
LIMIT 200`,
    groupTable: 'couriers',
    groupCol: 'status',
    phrasings: [
      'Report status, avg_approve_to_active_seconds, and activated_couriers for couriers with activation timestamps.',
      'Measure approval-to-activation latency per courier status.',
    ],
    hint: 'Filter out NULL lifecycle endpoints before subtracting timestamps.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'support_tickets',
    sqlShape: `
SELECT
  t.priority,
  AVG(EXTRACT(EPOCH FROM t.first_response_at - t.opened_at)) AS avg_first_response_seconds,
  AVG(EXTRACT(EPOCH FROM t.resolved_at - t.opened_at)) AS avg_resolution_seconds
FROM support_tickets t
WHERE t.first_response_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.is_deleted = false
GROUP BY t.priority
LIMIT 200`,
    groupTable: 'support_tickets',
    groupCol: 'priority',
    phrasings: [
      'Report priority plus avg_first_response_seconds and avg_resolution_seconds for valid support tickets.',
      'Measure support ticket lifecycle latency per priority after excluding soft-deleted tickets.',
    ],
    hint: 'Timestamp subtraction works for support lifecycles too; filter NULL endpoints first.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  o.status,
  AVG(EXTRACT(EPOCH FROM o.delivered_at - o.placed_at)) AS avg_place_to_deliver_seconds,
  COUNT(*) AS delivered_orders
FROM orders o
WHERE o.city_id = {cityId} AND o.delivered_at IS NOT NULL
GROUP BY o.status
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'status',
    phrasings: [
      'For city {cityId}, report status, avg_place_to_deliver_seconds, and delivered_orders.',
      'Measure order lifecycle latency from placed_at to delivered_at by status in city {cityId}.',
    ],
    hint: 'Bound to a city, filter delivered_at, then average elapsed delivery seconds.',
  }),

  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'payments',
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  ranked.order_id,
  ranked.payment_id,
  ranked.status
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.status,
    ROW_NUMBER() OVER (PARTITION BY p.order_id) AS rn
  FROM payments p
  WHERE p.order_id >= 259100 AND p.order_id < 259200
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'Deduplicate payments for order_id range 259100-259199 and return order_id, payment_id, and status.',
      'Keep one representative payment attempt per order in order_id range 259100-259199.',
    ],
    hint: 'Partition by order_id, number each retry group, then keep rn = 1.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'customers',
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  ranked.customer_id,
  ranked.normalized_email,
  ranked.signup_ts
FROM (
  SELECT
    c.customer_id,
    LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', ''))) AS normalized_email,
    c.signup_ts,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', '')))) AS rn
  FROM customers c
  WHERE c.signup_city_id = 15 AND c.email IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For signup city 15, deduplicate customers by normalized_email and return customer_id, normalized_email, signup_ts.',
      'Use ROW_NUMBER to keep one customer row per cleaned email in city 15.',
    ],
    hint: 'Normalize email inside the partition expression so cosmetic variants dedupe together.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'event_log',
    sortTable: 'event_log',
    sortCol: 'event_id',
    sqlShape: `
SELECT
  ranked.event_id,
  ranked.customer_id,
  ranked.event_type,
  ranked.event_ts
FROM (
  SELECT
    e.event_id,
    e.customer_id,
    e.event_type,
    e.event_ts,
    ROW_NUMBER() OVER (PARTITION BY e.customer_id, e.session_id, e.event_type) AS rn
  FROM event_log e
  WHERE e.city_id = 15 AND e.event_type = 'order_placed'
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For city 15 order_placed events, deduplicate repeated event types within each customer session and return event_id, customer_id, event_type, event_ts.',
      'Use ROW_NUMBER to keep one order_placed event per customer and session in city 15.',
    ],
    hint: 'Partition by the natural duplicate key, then keep the first timestamped event.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'couriers',
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  ranked.courier_id,
  ranked.phone_digits,
  ranked.applied_at
FROM (
  SELECT
    c.courier_id,
    REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
    c.applied_at,
    ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS rn
  FROM couriers c
  WHERE c.home_city_id = 5 AND c.status = 'active' AND c.phone IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For active couriers in home city 5, deduplicate by phone_digits and return courier_id, phone_digits, applied_at.',
      'Use ROW_NUMBER to keep one active courier row per cleaned phone number in city 5.',
    ],
    hint: 'Clean the phone number before using it as the duplicate partition key.',
  }),

  singleOrdered({
    skill: 'rv-orphan-anti-join',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  o.courier_id
FROM orders o
WHERE o.city_id = {cityId}
  AND o.courier_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM couriers c WHERE c.courier_id = o.courier_id)
LIMIT 200`,
    phrasings: [
      'For city {cityId}, list order_id and courier_id for orders whose courier no longer exists.',
      'Find orders in city {cityId} with orphaned courier_id values.',
    ],
    hint: 'NOT EXISTS keeps orders whose courier_id cannot match the couriers table.',
  }),
  singleOrdered({
    skill: 'rv-orphan-anti-join',
    primaryTable: 'event_log',
    slots: [eventCitySlot],
    sortTable: 'event_log',
    sortCol: 'event_id',
    sqlShape: `
SELECT
  e.event_id,
  e.customer_id
FROM event_log e
WHERE e.city_id = {cityId}
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = e.customer_id)
LIMIT 200`,
    phrasings: [
      'For city {cityId}, list event_id and customer_id for events whose customer no longer exists.',
      'Find orphaned event_log customer references in city {cityId}.',
    ],
    hint: 'An anti-join is useful when event data outlives purged customer rows.',
  }),
  singleOrdered({
    skill: 'rv-orphan-anti-join',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  o.promo_code
FROM orders o
WHERE o.city_id = {cityId}
  AND NULLIF(TRIM(COALESCE(o.promo_code, '')), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM promos p WHERE LOWER(p.code) = LOWER(TRIM(o.promo_code)))
LIMIT 200`,
    phrasings: [
      'For city {cityId}, list order_id and promo_code for promo codes that do not match promos.code.',
      'Find orphaned free-text promo codes in city {cityId} with an anti-join to promos.',
    ],
    hint: 'Normalize the free-text promo code before checking whether a clean promo row exists.',
  }),
  singleOrdered({
    skill: 'rv-orphan-anti-join',
    primaryTable: 'support_tickets',
    slots: [cityIdSlot],
    sortTable: 'support_tickets',
    sortCol: 'ticket_id',
    sqlShape: `
SELECT
  t.ticket_id,
  t.customer_id
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId}
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.customer_id = t.customer_id)
LIMIT 200`,
    phrasings: [
      'For city {cityId}, list ticket_id and customer_id for support tickets whose customer no longer exists.',
      'Find orphaned support ticket customer references for city {cityId}.',
    ],
    hint: 'Use NOT EXISTS against customers after bounding tickets to the city through orders.',
  }),

  groupedBy({
    skill: 'rv-soft-delete-valid',
    primaryTable: 'customers',
    slots: [customerCitySlot],
    sqlShape: `
SELECT
  c.segment,
  COUNT(*) AS valid_customers
FROM customers c
WHERE c.signup_city_id = {cityId} AND c.is_deleted = false
GROUP BY c.segment
LIMIT 200`,
    groupTable: 'customers',
    groupCol: 'segment',
    phrasings: [
      'For signup city {cityId}, count valid_customers per customer segment, excluding soft-deleted customers.',
      'Report non-deleted customer counts by segment for city {cityId}.',
    ],
    hint: 'Filter is_deleted = false before grouping the valid customer population.',
  }),
  groupedBy({
    skill: 'rv-soft-delete-valid',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  o.status,
  COUNT(*) AS valid_customer_orders
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.city_id = {cityId} AND c.is_deleted = false
GROUP BY o.status
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'status',
    phrasings: [
      'For city {cityId}, count valid_customer_orders per order status after excluding soft-deleted customers.',
      'Analyze order status counts for city {cityId} using only non-deleted customer rows.',
    ],
    hint: 'Join to customers and filter c.is_deleted = false before counting orders.',
  }),
  groupedBy({
    skill: 'rv-soft-delete-valid',
    primaryTable: 'support_tickets',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  t.priority,
  COUNT(*) AS valid_tickets
FROM support_tickets t
JOIN orders o ON o.order_id = t.order_id
WHERE o.city_id = {cityId} AND t.is_deleted = false
GROUP BY t.priority
LIMIT 200`,
    groupTable: 'support_tickets',
    groupCol: 'priority',
    phrasings: [
      'For city {cityId}, count valid_tickets per support priority, excluding soft-deleted tickets.',
      'Report non-deleted support ticket counts by priority for city {cityId}.',
    ],
    hint: 'Apply the soft-delete filter before grouping ticket priorities.',
  }),
  groupedBy({
    skill: 'rv-soft-delete-valid',
    primaryTable: 'ratings',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  r.courier_id,
  COUNT(*) AS valid_customer_ratings
FROM ratings r
JOIN customers c ON c.customer_id = r.customer_id
JOIN orders o ON o.order_id = r.order_id
WHERE o.city_id = {cityId} AND c.is_deleted = false AND r.courier_id IS NOT NULL
GROUP BY r.courier_id
LIMIT 200`,
    groupTable: 'ratings',
    groupCol: 'courier_id',
    phrasings: [
      'For city {cityId}, count valid_customer_ratings per courier_id after excluding soft-deleted customers.',
      'Use only non-deleted customer rows when counting ratings by courier_id in city {cityId}.',
    ],
    hint: 'Soft-deleted customers can still have historical rows, so filter them before rating analysis.',
  }),
];

const ROVE_GAP_TEMPLATES: Template[] = [
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'payments',
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  ranked.order_id,
  ranked.payment_id
FROM (
  SELECT
    p.order_id,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS payment_id,
    ROW_NUMBER() OVER (PARTITION BY p.order_id) AS rn
  FROM payments p
  WHERE p.order_id >= 259100 AND p.order_id < 259200
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'Deduplicate payments for order_id range 259100-259199 and return order_id and payment_id.',
      'Keep one representative payment_id per order in order_id range 259100-259199.',
    ],
    hint: 'Partition by order_id, number each retry group, keep rn = 1, and return the stable chosen payment_id.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'customers',
    sortTable: 'customers',
    sortCol: 'customer_id',
    sqlShape: `
SELECT
  ranked.customer_id,
  ranked.email
FROM (
  SELECT
    MIN(c.customer_id) OVER (PARTITION BY LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', '')))) AS customer_id,
    LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', ''))) AS email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(REGEXP_REPLACE(COALESCE(c.email, ''), '^mailto:', '')))) AS rn
  FROM customers c
  WHERE c.signup_city_id = 15 AND c.email IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For signup city 15, deduplicate customers by cleaned email and return customer_id and email.',
      'Use ROW_NUMBER to keep one customer row per cleaned email in city 15.',
    ],
    hint: 'Normalize email inside the partition expression, keep rn = 1, and return the stable chosen customer_id.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'event_log',
    sortTable: 'event_log',
    sortCol: 'event_id',
    sqlShape: `
SELECT
  ranked.event_id,
  ranked.customer_id,
  ranked.session_id,
  ranked.event_type,
FROM (
  SELECT
    MIN(e.event_id) OVER (PARTITION BY e.customer_id, e.session_id, e.event_type) AS event_id,
    e.customer_id,
    e.session_id,
    e.event_type,
    ROW_NUMBER() OVER (PARTITION BY e.customer_id, e.session_id, e.event_type) AS rn
  FROM event_log e
  WHERE e.city_id = 15 AND e.event_type = 'order_placed'
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For city 15 order_placed events, deduplicate repeated event types within each customer session and return event_id, customer_id, session_id, and event_type.',
      'Use ROW_NUMBER to keep one order_placed event per customer and session in city 15.',
    ],
    hint: 'Partition by the natural duplicate key, keep rn = 1, and return the stable chosen event_id.',
  }),
  singleOrdered({
    skill: 'rv-dedup-rownumber',
    primaryTable: 'couriers',
    sortTable: 'couriers',
    sortCol: 'courier_id',
    sqlShape: `
SELECT
  ranked.courier_id,
  ranked.phone_digits
FROM (
  SELECT
    MIN(c.courier_id) OVER (PARTITION BY REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS courier_id,
    REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g') AS phone_digits,
    ROW_NUMBER() OVER (PARTITION BY REGEXP_REPLACE(c.phone, '[^0-9]', '', 'g')) AS rn
  FROM couriers c
  WHERE c.home_city_id = 5 AND c.status = 'active' AND c.phone IS NOT NULL
) ranked
WHERE rn = 1
LIMIT 200`,
    phrasings: [
      'For active couriers in home city 5, deduplicate by phone_digits and return courier_id and phone_digits.',
      'Use ROW_NUMBER to keep one active courier row per cleaned phone number in city 5.',
    ],
    hint: 'Clean the phone number before partitioning, keep rn = 1, and return the stable chosen courier_id.',
  }),

  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'promo_redemption',
    sqlShape: `
SELECT
  pr.promo_id,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE pr.discount_cents <= 0) AS nonpositive_discounts,
  COUNT(*) FILTER (WHERE pr.redeemed_at IS NULL) AS null_redeemed_at
FROM promo_redemption pr
GROUP BY pr.promo_id
LIMIT 200`,
    groupTable: 'promo_redemption',
    groupCol: 'promo_id',
    phrasings: [
      'Profile promo_redemption by promo_id with total_rows, nonpositive_discounts, and null_redeemed_at.',
      'For each promo_id, count redemption rows plus nonpositive discounts and missing redeemed_at values.',
    ],
    hint: 'Profile redemption defects with FILTER counts before trusting discount analysis.',
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.status,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE o.accepted_at IS NULL) AS null_accepted_at,
  COUNT(*) FILTER (WHERE o.delivered_at IS NULL) AS null_delivered_at,
  COUNT(*) FILTER (WHERE NULLIF(TRIM(COALESCE(o.promo_code, '')), '') IS NULL) AS blank_promo_codes
FROM orders o
GROUP BY o.status
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'status',
    phrasings: [
      'Profile orders by status with total_rows, null_accepted_at, null_delivered_at, and blank_promo_codes.',
      'For each order status, count missing lifecycle timestamps and blank promo codes.',
    ],
    hint: 'A status-level profile shows whether missing timestamps are expected or suspicious.',
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'event_log',
    sqlShape: `
SELECT
  e.event_type,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE e.order_id IS NULL) AS null_order_ids,
  COUNT(*) FILTER (WHERE e.customer_id IS NULL) AS null_customer_ids
FROM event_log e
GROUP BY e.event_type`,
    groupTable: 'event_log',
    groupCol: 'event_type',
    phrasings: [
      'Profile event_log by event_type with total_rows, null_order_ids, and null_customer_ids.',
      'For each event_type, count rows and missing optional order or customer references.',
    ],
    hint: 'Event profiles often separate optional references from true defects.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-profile-dirty-data',
    primaryTable: 'merchants',
    sqlShape: `
SELECT
  m.category,
  COUNT(*) AS total_rows,
  COUNT(*) FILTER (WHERE m.avg_prep_minutes <= 0) AS nonpositive_prep_minutes,
  COUNT(*) FILTER (WHERE m.is_active = false) AS inactive_merchants
FROM merchants m
GROUP BY m.category`,
    groupTable: 'merchants',
    groupCol: 'category',
    phrasings: [
      'Profile merchants by category with total_rows, nonpositive_prep_minutes, and inactive_merchants.',
      'For each merchant category, count prep-time defects and inactive merchants.',
    ],
    hint: 'Use conditional counts to profile operational fields before ranking merchants.',
    gateHints: { minDistinct: 1 },
  }),

  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  o.city_id,
  ci.timezone AS iana_timezone,
  MAX(o.delivered_at AT TIME ZONE ci.timezone) AS latest_delivery_utc,
  COUNT(*) AS delivered_orders
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.delivered_at IS NOT NULL
GROUP BY o.city_id, ci.timezone`,
    groupTable: 'orders',
    groupCol: 'city_id',
    phrasings: [
      'For each city, return city_id, iana_timezone, latest_delivery_utc, and delivered_orders using city timezone conversion.',
      'Join orders to cities and convert delivered_at to each city timezone before finding the latest delivery instant.',
    ],
    hint: 'Use cities.timezone with AT TIME ZONE instead of the denormalized offset column.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'event_log',
    sqlShape: `
SELECT
  e.city_id,
  ci.name AS city_name,
  MIN(e.event_ts AT TIME ZONE ci.timezone) AS first_event_utc,
  COUNT(*) AS event_count
FROM event_log e
JOIN cities ci ON ci.city_id = e.city_id
GROUP BY e.city_id, ci.name`,
    groupTable: 'event_log',
    groupCol: 'city_id',
    phrasings: [
      'For each city, return city_id, city_name, first_event_utc, and event_count after timezone conversion.',
      'Join event_log to cities and convert event_ts with the city IANA timezone.',
    ],
    hint: 'The event timestamp is local to the city, so join to cities before converting.',
    gateHints: { minDistinct: 1 },
  }),
  groupedBy({
    skill: 'rv-timezone-city-join',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.home_city_id,
  ci.timezone AS iana_timezone,
  MIN(c.applied_at AT TIME ZONE ci.timezone) AS first_application_utc,
  COUNT(*) AS courier_count
FROM couriers c
JOIN cities ci ON ci.city_id = c.home_city_id
GROUP BY c.home_city_id, ci.timezone`,
    groupTable: 'couriers',
    groupCol: 'home_city_id',
    phrasings: [
      'For each courier home city, return home_city_id, iana_timezone, first_application_utc, and courier_count.',
      'Convert courier applied_at timestamps through the joined city timezone.',
    ],
    hint: 'home_city_id determines which IANA timezone should convert applied_at.',
    gateHints: { minDistinct: 1 },
  }),
  singleOrdered({
    skill: 'rv-timezone-city-join',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sortTable: 'orders',
    sortCol: 'order_id',
    sqlShape: `
SELECT
  o.order_id,
  o.placed_at AS local_placed_at,
  o.placed_at AT TIME ZONE ci.timezone AS placed_utc,
  ci.timezone AS iana_timezone
FROM orders o
JOIN cities ci ON ci.city_id = o.city_id
WHERE o.city_id = {cityId}
LIMIT 200`,
    phrasings: [
      'For city {cityId}, return order_id, local_placed_at, placed_utc, and iana_timezone.',
      'Join city timezone data to convert each order placed_at in city {cityId}.',
    ],
    hint: 'Convert the local placed_at timestamp with the timezone from the joined city row.',
  }),

  singleOrdered({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  ranked.order_id,
  ranked.payment_id,
  ranked.status
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.status,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
) ranked
WHERE ranked.payment_id = ranked.chosen_payment_id
LIMIT 200`,
    phrasings: [
      'Keep the earliest payment attempt per order and return order_id, payment_id, and status.',
      'Deduplicate payment retries by row-numbering attempts per order.',
    ],
    hint: 'Partition by order_id and keep rn = 1 for a deterministic retry representative.',
  }),
  groupedBy({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  deduped.processor,
  COUNT(*) AS paid_order_count,
  SUM(deduped.amount_cents) AS paid_amount_cents
FROM (
  SELECT
    p.processor,
    p.order_id,
    p.payment_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
  WHERE LOWER(TRIM(p.status)) IN ('paid', 'captured')
) deduped
WHERE deduped.payment_id = deduped.chosen_payment_id
GROUP BY deduped.processor
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'processor',
    phrasings: [
      'After deduplicating retries among payments with status paid or captured, report processor, paid_order_count, and paid_amount_cents.',
      'Keep one payment per order among status paid or captured rows, then aggregate deduped payment totals by processor.',
    ],
    hint: 'Deduplicate inside the subquery before grouping by processor.',
  }),
  groupedBy({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  deduped.method,
  COUNT(*) AS deduped_payments,
  SUM(deduped.amount_cents) AS deduped_amount_cents
FROM (
  SELECT
    LOWER(TRIM(p.method)) AS method,
    p.order_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id,
    p.payment_id
  FROM payments p
) deduped
WHERE deduped.payment_id = deduped.chosen_payment_id
GROUP BY deduped.method
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'method',
    phrasings: [
      'Deduplicate payments by order_id, then report method, deduped_payments, and deduped_amount_cents.',
      'Choose one payment per order and aggregate deduped totals by normalized method.',
    ],
    hint: 'Choose the representative payment before counting payment methods.',
  }),
  singleOrdered({
    skill: 'rv-payment-dedup',
    primaryTable: 'payments',
    slots: [cityIdSlot],
    sortTable: 'payments',
    sortCol: 'payment_id',
    sqlShape: `
SELECT
  picked.order_id,
  picked.payment_id,
  picked.amount_cents,
  picked.currency
FROM (
  SELECT
    p.order_id,
    p.payment_id,
    p.amount_cents,
    p.currency,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  WHERE o.city_id = {cityId}
) picked
WHERE picked.payment_id = picked.chosen_payment_id
LIMIT 200`,
    phrasings: [
      'For city {cityId}, keep one payment per order and return order_id, payment_id, amount_cents, and currency.',
      'Deduplicate payment retry rows inside city {cityId} with ROW_NUMBER.',
    ],
    hint: 'Bound to the city first, row-number retries per order, and keep rn = 1.',
  }),

  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.home_city_id,
  AVG(EXTRACT(EPOCH FROM c.approved_at - c.applied_at)) AS avg_apply_to_approve_seconds,
  COUNT(*) AS approved_couriers
FROM couriers c
WHERE c.approved_at IS NOT NULL
GROUP BY c.home_city_id
LIMIT 200`,
    groupTable: 'couriers',
    groupCol: 'home_city_id',
    phrasings: [
      'Report home_city_id, avg_apply_to_approve_seconds, and approved_couriers for approved couriers.',
      'Measure average application approval latency per courier home city.',
    ],
    hint: 'Subtract applied_at from approved_at and extract epoch seconds before averaging.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'couriers',
    sqlShape: `
SELECT
  c.status,
  AVG(EXTRACT(EPOCH FROM c.activated_at - c.approved_at)) AS avg_approve_to_active_seconds,
  COUNT(*) AS activated_couriers
FROM couriers c
WHERE c.approved_at IS NOT NULL AND c.activated_at IS NOT NULL
GROUP BY c.status
LIMIT 200`,
    groupTable: 'couriers',
    groupCol: 'status',
    phrasings: [
      'Report status, avg_approve_to_active_seconds, and activated_couriers for couriers with activation timestamps.',
      'Measure approval-to-activation latency per courier status.',
    ],
    hint: 'Filter out NULL lifecycle endpoints before subtracting timestamps.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'support_tickets',
    sqlShape: `
SELECT
  t.priority,
  AVG(EXTRACT(EPOCH FROM t.first_response_at - t.opened_at)) AS avg_first_response_seconds,
  AVG(EXTRACT(EPOCH FROM t.resolved_at - t.opened_at)) AS avg_resolution_seconds
FROM support_tickets t
WHERE t.first_response_at IS NOT NULL AND t.resolved_at IS NOT NULL AND t.is_deleted = false
GROUP BY t.priority
LIMIT 200`,
    groupTable: 'support_tickets',
    groupCol: 'priority',
    phrasings: [
      'Report priority plus avg_first_response_seconds and avg_resolution_seconds for valid support tickets.',
      'Measure support ticket lifecycle latency per priority after excluding soft-deleted tickets.',
    ],
    hint: 'Timestamp subtraction works for support lifecycles too; filter NULL endpoints first.',
  }),
  groupedBy({
    skill: 'rv-lifecycle-latency',
    primaryTable: 'orders',
    slots: [cityIdSlot],
    sqlShape: `
SELECT
  o.status,
  AVG(EXTRACT(EPOCH FROM o.delivered_at - o.placed_at)) AS avg_place_to_deliver_seconds,
  COUNT(*) AS delivered_orders
FROM orders o
WHERE o.city_id = {cityId} AND o.delivered_at IS NOT NULL
GROUP BY o.status
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'status',
    phrasings: [
      'For city {cityId}, report status, avg_place_to_deliver_seconds, and delivered_orders.',
      'Measure order lifecycle latency from placed_at to delivered_at by status in city {cityId}.',
    ],
    hint: 'Bound to a city, filter delivered_at, then average elapsed delivery seconds.',
  }),

  groupedBy({
    skill: 'rv-clean-layer-capstone',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  canon.status,
  COUNT(*) AS order_count,
  SUM(canon.amount_cents) AS gross_cents
FROM (
  SELECT
    o.order_id,
    CASE
      WHEN LOWER(TRIM(o.status)) IN ('delivered', 'complete') THEN 'delivered'
      ELSE LOWER(TRIM(o.status))
    END AS status,
    dp.amount_cents
  FROM orders o
  JOIN (SELECT customer_id FROM customers WHERE is_deleted = false) valid_customers
    ON valid_customers.customer_id = o.customer_id
  JOIN (
    SELECT picked.order_id, picked.amount_cents
    FROM (
      SELECT p.order_id, p.payment_id, p.amount_cents, MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
      FROM payments p
    ) picked
    WHERE picked.payment_id = picked.chosen_payment_id
  ) dp ON dp.order_id = o.order_id
) canon
GROUP BY canon.status
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'status',
    phrasings: [
      'Build a clean layer with non-deleted customers and one payment per order, mapping statuses delivered and complete to delivered, then report status, order_count, and gross_cents.',
      'Canonicalize order status after clean-layer joins (delivered and complete both count as delivered) and aggregate by status.',
    ],
    hint: 'Stack valid customers, one payment per order, and canonical status before grouping.',
  }),
  groupedBy({
    skill: 'rv-clean-layer-capstone',
    primaryTable: 'orders',
    sqlShape: `
SELECT
  canon.city_id,
  COUNT(*) AS order_count,
  COUNT(*) FILTER (WHERE canon.status = 'delivered') AS delivered_orders
FROM (
  SELECT
    o.order_id,
    o.city_id,
    CASE
      WHEN LOWER(TRIM(o.status)) IN ('delivered', 'complete') THEN 'delivered'
      ELSE LOWER(TRIM(o.status))
    END AS status
  FROM orders o
  JOIN customers c ON c.customer_id = o.customer_id
  WHERE c.is_deleted = false
) canon
GROUP BY canon.city_id
LIMIT 200`,
    groupTable: 'orders',
    groupCol: 'city_id',
    phrasings: [
      'Build a clean layer over non-deleted customers, mapping statuses delivered and complete to delivered, and report city_id, order_count, and delivered_orders.',
      'Aggregate clean orders by city_id after excluding soft-deleted customers, counting statuses delivered and complete as delivered.',
    ],
    hint: 'The clean layer filters customers before the city rollup.',
  }),
  groupedBy({
    skill: 'rv-clean-layer-capstone',
    primaryTable: 'payments',
    sqlShape: `
SELECT
  canon.method,
  COUNT(*) AS payment_count,
  SUM(canon.amount_cents) AS amount_cents
FROM (
  SELECT
    LOWER(TRIM(p.method)) AS method,
    p.payment_id,
    p.amount_cents,
    MIN(p.payment_id) OVER (PARTITION BY p.order_id) AS chosen_payment_id
  FROM payments p
  JOIN orders o ON o.order_id = p.order_id
  JOIN customers c ON c.customer_id = o.customer_id
  WHERE c.is_deleted = false
) canon
WHERE canon.payment_id = canon.chosen_payment_id
GROUP BY canon.method
LIMIT 200`,
    groupTable: 'payments',
    groupCol: 'method',
    phrasings: [
      'Build a valid-customer payment layer, deduplicate by order, and report method, payment_count, and amount_cents.',
      'Normalize payment method after clean-layer joins and aggregate one payment per order.',
    ],
    hint: 'Filter to valid customers and rn = 1 before grouping payment methods.',
  }),
  groupedBy({
    skill: 'rv-clean-layer-capstone',
    primaryTable: 'merchants',
    sqlShape: `
SELECT
  canon.category,
  COUNT(*) AS order_count,
  SUM(canon.amount_cents) AS gross_cents
FROM (
  SELECT
    LOWER(TRIM(m.category)) AS category,
    o.amount_cents
  FROM orders o
  JOIN merchants m ON m.merchant_id = o.merchant_id
  JOIN customers c ON c.customer_id = o.customer_id
  WHERE c.is_deleted = false AND m.is_active = true
) canon
GROUP BY canon.category
LIMIT 200`,
    groupTable: 'merchants',
    groupCol: 'category',
    phrasings: [
      'Build a clean active-merchant order layer and report category, order_count, and gross_cents.',
      'Normalize merchant category in a clean layer before aggregating active merchant order volume.',
    ],
    hint: 'Join active merchants and valid customers before grouping normalized category.',
  }),

  singleOrdered({
    skill: 'rv-recursive-cte',
    primaryTable: 'categories',
    sortTable: 'categories',
    sortCol: 'category_id',
    sqlShape: `
SELECT
  tree_walk.category_id,
  tree_walk.name,
  tree_walk.parent_category_id,
  tree_walk.depth
FROM (
  WITH RECURSIVE cleaned AS (
    SELECT c.category_id, c.name,
           CASE WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id ELSE NULL END AS parent_category_id
    FROM categories c
  ),
  tree AS (
    SELECT category_id, name, parent_category_id, 1 AS depth
    FROM cleaned
    WHERE parent_category_id IS NULL
    UNION ALL
    SELECT child.category_id, child.name, child.parent_category_id, parent.depth + 1
    FROM cleaned child
    JOIN tree parent ON child.parent_category_id = parent.category_id
  )
  SELECT category_id, name, parent_category_id, depth FROM tree
) tree_walk`,
    phrasings: [
      'Clean dangling category parents, then walk all roots and return category_id, name, parent_category_id, and depth.',
      'Use WITH RECURSIVE to traverse every cleaned category root with depth.',
    ],
    hint: 'The cleaned CTE nulls dangling parents before the recursive tree walk.',
    gateHints: { rowCeiling: 60 },
  }),
  singleOrdered({
    skill: 'rv-recursive-cte',
    primaryTable: 'categories',
    sortTable: 'categories',
    sortCol: 'category_id',
    sqlShape: `
SELECT
  tree_walk.category_id,
  tree_walk.name,
  tree_walk.depth,
  tree_walk.path
FROM (
  WITH RECURSIVE cleaned AS (
    SELECT c.category_id, c.name,
           CASE WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id ELSE NULL END AS parent_category_id
    FROM categories c
  ),
  tree AS (
    SELECT category_id, name, 1 AS depth, name AS path
    FROM cleaned
    WHERE parent_category_id IS NULL
    UNION ALL
    SELECT child.category_id, child.name, parent.depth + 1, parent.path || ' > ' || child.name
    FROM cleaned child
    JOIN tree parent ON child.parent_category_id = parent.category_id
  )
  SELECT category_id, name, depth, path FROM tree
) tree_walk`,
    phrasings: [
      'Walk cleaned category roots and return category_id, name, depth, and path.',
      'Use WITH RECURSIVE to build a readable category path from every root.',
    ],
    hint: 'Concatenate the parent path with each child name during the recursive step.',
    gateHints: { rowCeiling: 60 },
  }),
  singleOrdered({
    skill: 'rv-recursive-cte',
    primaryTable: 'categories',
    sortTable: 'categories',
    sortCol: 'category_id',
    sqlShape: `
SELECT
  tree_walk.category_id,
  tree_walk.name,
  tree_walk.depth,
  tree_walk.is_leaf
FROM (
  WITH RECURSIVE cleaned AS (
    SELECT c.category_id, c.name,
           CASE WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id ELSE NULL END AS parent_category_id
    FROM categories c
  ),
  tree AS (
    SELECT category_id, name, 1 AS depth
    FROM cleaned
    WHERE parent_category_id IS NULL
    UNION ALL
    SELECT child.category_id, child.name, parent.depth + 1
    FROM cleaned child
    JOIN tree parent ON child.parent_category_id = parent.category_id
  )
  SELECT tree.category_id, tree.name, tree.depth,
         NOT EXISTS (SELECT 1 FROM cleaned child WHERE child.parent_category_id = tree.category_id) AS is_leaf
  FROM tree
) tree_walk`,
    phrasings: [
      'Walk cleaned categories and return category_id, name, depth, and is_leaf.',
      'Use WITH RECURSIVE plus a leaf test against cleaned children.',
    ],
    hint: 'After the recursive walk, NOT EXISTS can identify categories without cleaned children.',
    gateHints: { rowCeiling: 60 },
  }),
  singleOrdered({
    skill: 'rv-recursive-cte',
    primaryTable: 'categories',
    sortTable: 'categories',
    sortCol: 'category_id',
    sqlShape: `
SELECT
  tree_walk.category_id,
  tree_walk.name,
  tree_walk.depth,
  tree_walk.path_ids
FROM (
  WITH RECURSIVE cleaned AS (
    SELECT c.category_id, c.name,
           CASE WHEN c.parent_category_id IN (SELECT category_id FROM categories) THEN c.parent_category_id ELSE NULL END AS parent_category_id
    FROM categories c
  ),
  tree AS (
    SELECT category_id, name, 1 AS depth, category_id::text AS path_ids
    FROM cleaned
    WHERE parent_category_id IS NULL
    UNION ALL
    SELECT child.category_id, child.name, parent.depth + 1, parent.path_ids || '>' || child.category_id::text
    FROM cleaned child
    JOIN tree parent ON child.parent_category_id = parent.category_id
  )
  SELECT category_id, name, depth, path_ids FROM tree
) tree_walk`,
    phrasings: [
      'Walk cleaned categories and return category_id, name, depth, and path_ids.',
      'Use WITH RECURSIVE to build an id path while traversing the category tree.',
    ],
    hint: 'Carry a text path_ids value through each recursive child step.',
    gateHints: { rowCeiling: 60 },
  }),
];

export const ROVE_TEMPLATES: Template[] = [
  ...CLEAN_TEMPLATES,
  ...ANALYTIC_TEMPLATES,
  ...BEHAVIORAL_TEMPLATES,
  ...ROVE_GAP_TEMPLATES,
];
