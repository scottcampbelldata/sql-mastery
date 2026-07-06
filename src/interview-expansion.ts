function exercise(input: any) {
  return {
    sourceFile: 'index.html',
    hint: '',
    solutionNote: 'Sample answer: explain the grain first, state any filter assumptions, run the query, then sanity-check row count and ordering.',
    checkable: Boolean(input.expectedSql && input.database),
    ...input
  };
}

const moduleMeta: Record<string, [string, string]> = {
  m1: ['Fundamentals', 'Foundations'],
  m2: ['Aggregation', 'Summarize'],
  m3: ['Joins', 'Relate'],
  m4: ['Transformation', 'Shape'],
  m5: ['Subqueries and CTEs', 'Compose'],
  m6: ['Window Functions', 'Sequence'],
  m7: ['Interview Patterns', 'Recognize'],
  m8: ['Performance', 'Optimize'],
  mock: ['Mock Interviews', 'Prove']
};

function withModule(id: string, moduleId: string, title: string, database: string, level: string, task: string, expectedSql: string, extra: any = {}) {
  const [moduleTitle, stage] = moduleMeta[moduleId];
  return exercise({
    id,
    title,
    moduleId,
    moduleTitle,
    stage,
    database,
    level,
    task,
    expectedSql: expectedSql.trim(),
    ...extra
  });
}

const seniorScreens = [
  withModule(
    'senior-window-01',
    'm6',
    'Senior Window 1',
    'stackoverflow',
    'senior',
    'Accepted answer rate by question year: show year, question count, accepted count, accepted rate, and year-over-year accepted-rate change.',
    `
WITH yearly AS (
  SELECT EXTRACT(YEAR FROM creationdate)::int AS year,
         COUNT(*) AS questions,
         COUNT(acceptedanswerid) AS accepted
  FROM posts
  WHERE posttypeid = 1
  GROUP BY 1
)
SELECT year,
       questions,
       accepted,
       ROUND(100.0 * accepted / NULLIF(questions, 0), 1) AS accepted_rate,
       ROUND(100.0 * accepted / NULLIF(questions, 0), 1)
         - LAG(ROUND(100.0 * accepted / NULLIF(questions, 0), 1)) OVER (ORDER BY year) AS yoy_rate_change
FROM yearly
ORDER BY year;
`,
    {
      hint: 'Aggregate to one row per year first, then use LAG over the yearly result.',
      solutionNote: 'Sample answer: the CTE fixes the grain at one row per year; the window compares each year to the prior year without rejoining.'
    }
  ),
  withModule('senior-window-02','m6','Senior Window 2','chinook','senior','Monthly invoice revenue with a running total and month-over-month change.',`
WITH monthly AS (
  SELECT date_trunc('month', invoice_date)::date AS month,
         SUM(total) AS revenue
  FROM invoice
  GROUP BY 1
)
SELECT month,
       ROUND(revenue::numeric, 2) AS revenue,
       ROUND(SUM(revenue) OVER (ORDER BY month)::numeric, 2) AS running_revenue,
       ROUND((revenue - LAG(revenue) OVER (ORDER BY month))::numeric, 2) AS mom_change
FROM monthly
ORDER BY month;
`),
  withModule('senior-window-03','m6','Senior Window 3','chinook','senior','For each customer invoice, show invoice sequence number and customer lifetime spend so far.',`
SELECT customer_id,
       invoice_id,
       invoice_date,
       total,
       ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY invoice_date, invoice_id) AS invoice_number,
       SUM(total) OVER (PARTITION BY customer_id ORDER BY invoice_date, invoice_id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS lifetime_spend
FROM invoice
ORDER BY customer_id, invoice_date, invoice_id;
`),
  withModule('senior-window-04','m6','Senior Window 4','stackoverflow','senior','Daily posts in early 2016 with a 7-day trailing moving average. Include the number of days in each frame.',`
WITH daily AS (
  SELECT creationdate::date AS day,
         COUNT(*) AS post_count
  FROM posts
  WHERE creationdate >= DATE '2016-01-01' AND creationdate < DATE '2016-02-01'
  GROUP BY 1
)
SELECT day,
       post_count,
       ROUND(AVG(post_count) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS trailing_7_day_avg,
       COUNT(*) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS days_in_frame
FROM daily
ORDER BY day;
`),
  withModule('senior-window-05','m6','Senior Window 5','stackoverflow','senior','Rank questions by score within each year and return the top 5 questions per year.',`
WITH yearly AS (
  SELECT EXTRACT(YEAR FROM creationdate)::int AS post_year,
         id,
         score
  FROM posts
  WHERE posttypeid = 1
),
ranked AS (
  SELECT post_year,
         id,
         score,
         RANK() OVER (PARTITION BY post_year ORDER BY score DESC) AS score_rank
  FROM yearly
)
SELECT post_year, id, score, score_rank
FROM ranked
WHERE score_rank <= 5
ORDER BY post_year, score_rank, id;
`),
  withModule('senior-cte-01','m5','Senior CTE 1','stackoverflow','senior','Find users who posted questions but never posted answers. Return the 50 highest-reputation users.',`
SELECT u.id, u.displayname, u.reputation
FROM users u
WHERE EXISTS (
  SELECT 1 FROM posts q
  WHERE q.owneruserid = u.id AND q.posttypeid = 1
)
AND NOT EXISTS (
  SELECT 1 FROM posts a
  WHERE a.owneruserid = u.id AND a.posttypeid = 2
)
ORDER BY u.reputation DESC
LIMIT 50;
`),
  withModule('senior-cte-02','m5','Senior CTE 2','chinook','senior','Find customers whose first invoice was also their largest invoice by total.',`
WITH invoice_revenue AS (
  SELECT customer_id,
         invoice_id,
         invoice_date,
         total AS revenue
  FROM invoice
),
ranked AS (
  SELECT customer_id, invoice_id, invoice_date, revenue,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY invoice_date, invoice_id) AS first_invoice_rank,
         RANK() OVER (PARTITION BY customer_id ORDER BY revenue DESC) AS revenue_rank
  FROM invoice_revenue
)
SELECT customer_id, invoice_id, invoice_date, ROUND(revenue::numeric, 2) AS revenue
FROM ranked
WHERE first_invoice_rank = 1 AND revenue_rank = 1
ORDER BY revenue DESC;
`),
  withModule('senior-debug-01','m3','Senior Debug 1','chinook','senior','Debug fan-out: compare invoice count before and after joining invoice_line by customer. Return customers where joined rows exceed invoices.',`
SELECT i.customer_id,
       COUNT(DISTINCT i.invoice_id) AS invoices,
       COUNT(*) AS joined_rows
FROM invoice i
JOIN invoice_line il ON il.invoice_id = i.invoice_id
GROUP BY i.customer_id
HAVING COUNT(*) > COUNT(DISTINCT i.invoice_id)
ORDER BY joined_rows DESC;
`),
  withModule('senior-debug-02','m2','Senior Debug 2','chinook','senior','Find countries where average invoice total is above global average invoice total.',`
SELECT billing_country,
       ROUND(AVG(total)::numeric, 2) AS avg_invoice_total
FROM invoice
GROUP BY billing_country
HAVING AVG(total) > (SELECT AVG(total) FROM invoice)
ORDER BY avg_invoice_total DESC;
`),
  withModule('case-executive-sales-01','m7','Executive Sales Case 1','chinook','case','Executive case: identify annual revenue, invoice count, active customers, and average invoice value for leadership.',`
SELECT EXTRACT(YEAR FROM invoice_date)::int AS invoice_year,
       COUNT(*) AS invoices,
       COUNT(DISTINCT customer_id) AS active_customers,
       ROUND(SUM(total)::numeric, 2) AS revenue,
       ROUND(AVG(total)::numeric, 2) AS avg_invoice_value
FROM invoice
GROUP BY 1
ORDER BY invoice_year;
`,
    {
      hint: 'Leadership wants one row per year. COUNT(DISTINCT customer_id) gives the active customer base.',
      solutionNote: 'Sample executive framing: revenue trend, invoice volume, active customer base, and average invoice value each answer a different leadership question; call out that average invoice value can move independently from total revenue.'
    }
  ),
  withModule('case-retention-01','m7','Retention Case 1','chinook','case','Cohort-style case: for each first invoice year, count customers and total lifetime revenue.',`
WITH first_invoice AS (
  SELECT customer_id,
         MIN(invoice_date)::date AS first_invoice_date
  FROM invoice
  GROUP BY customer_id
)
SELECT EXTRACT(YEAR FROM f.first_invoice_date)::int AS cohort_year,
       COUNT(DISTINCT f.customer_id) AS customers,
       ROUND(SUM(i.total)::numeric, 2) AS lifetime_revenue
FROM first_invoice f
JOIN invoice i ON i.customer_id = f.customer_id
GROUP BY 1
ORDER BY cohort_year;
`),
  withModule('case-marketplace-01','m7','Marketplace Case 1','stackoverflow','case','Marketplace-style case: monthly question supply, answer supply, and answer-to-question ratio.',`
WITH monthly AS (
  SELECT date_trunc('month', creationdate)::date AS month,
         COUNT(*) FILTER (WHERE posttypeid = 1) AS questions,
         COUNT(*) FILTER (WHERE posttypeid = 2) AS answers
  FROM posts
  GROUP BY 1
)
SELECT month,
       questions,
       answers,
       ROUND(1.0 * answers / NULLIF(questions, 0), 2) AS answers_per_question
FROM monthly
ORDER BY month;
`)
];

const fluencySources: string[][] = [
  ['m1','chinook','album','album_id, title, artist_id','title, album_id','artist_id','album_id','title'],
  ['m1','chinook','employee','employee_id, first_name, last_name, title, reports_to','last_name, employee_id','title','employee_id','reports_to'],
  ['m1','stackoverflow','votes','id, postid, votetypeid, bountyamount','id DESC','votetypeid','bountyamount','bountyamount'],
  ['m2','chinook','invoice_line','invoice_line_id, invoice_id, track_id, unit_price, quantity','quantity DESC, invoice_line_id','track_id','quantity','quantity'],
  ['m1','chinook','track','track_id, name, genre_id, milliseconds, unit_price','milliseconds DESC, track_id','genre_id','milliseconds','composer'],
  ['m2','chinook','invoice','invoice_id, customer_id, billing_country, total','total DESC, invoice_id','billing_country','total','customer_id'],
  ['m1','chinook','customer','customer_id, first_name, last_name, country, support_rep_id','country, last_name','country','customer_id','support_rep_id'],
  ['m3','chinook','playlist_track','playlist_id, track_id','playlist_id, track_id','playlist_id','track_id','track_id'],
  ['m1','stackoverflow','users','id, displayname, reputation, location, upvotes','reputation DESC, id','location','reputation','location'],
  ['m1','stackoverflow','posts','id, posttypeid, owneruserid, score, viewcount','score DESC, id','posttypeid','score','owneruserid'],
  ['m2','stackoverflow','badges','id, userid, name, class','id DESC','name','class','userid'],
  ['m2','stackoverflow','comments','id, postid, userid, score','score DESC, id','userid','score','userid'],
  ['m1','stackoverflow','posts','id, posttypeid, score, viewcount, answercount','viewcount DESC, id','posttypeid','viewcount','answercount'],
  ['m2','stackoverflow','posthistory','id, posthistorytypeid, postid, userid','id DESC','posthistorytypeid','postid','userid'],
  ['m1','chinook','track','track_id, name, genre_id, bytes, composer','bytes DESC, track_id','genre_id','bytes','composer'],
  ['m2','chinook','customer','customer_id, last_name, country, company, support_rep_id','country, last_name','country','customer_id','company'],
  ['m3','chinook','invoice_line','invoice_line_id, invoice_id, track_id, unit_price, quantity','unit_price DESC, invoice_line_id','track_id','unit_price','quantity'],
  ['m3','chinook','album','album_id, title, artist_id','artist_id, album_id','artist_id','album_id','title']
];

function fluencyExercise(source: string[], variantIndex: number, sourceIndex: number) {
  const [moduleId, database, table, columns, orderBy, groupColumn, measureColumn, nullColumn] = source;
  const [moduleTitle, stage] = moduleMeta[moduleId];
  const baseId = `${database.replace(/[^a-z0-9]/gi, '-')}-${table.replace(/[^a-z0-9]/gi, '-')}`;
  const number = String(sourceIndex * 5 + variantIndex + 1).padStart(2, '0');

  if (variantIndex === 0) {
    return exercise({
      id: `fluency-sample-${number}-${baseId}`,
      title: `Fluency Sample ${number}`,
      moduleId,
      moduleTitle,
      stage,
      database,
      level: 'fluency',
      task: `Sample ${table}: return ${columns}, sorted by ${orderBy}, limited to 25 rows.`,
      expectedSql: `SELECT ${columns}\nFROM ${table}\nORDER BY ${orderBy}\nLIMIT 25;`,
      hint: 'Start with SELECT and FROM, then make the ORDER BY deterministic, then add LIMIT.',
      solutionNote: 'Sample answer: exploratory queries should be deterministic when you are showing top, latest, biggest, or smallest rows.'
    });
  }

  if (variantIndex === 1) {
    return exercise({
      id: `fluency-aggregate-${number}-${baseId}`,
      title: `Fluency Aggregate ${number}`,
      moduleId: 'm2',
      moduleTitle: 'Aggregation',
      stage: 'Summarize',
      database,
      level: 'fluency',
      task: `Group ${table} by ${groupColumn}; show row count and average ${measureColumn}, largest groups first.`,
      expectedSql: `SELECT ${groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(AVG(${measureColumn})::numeric, 2) AS avg_${measureColumn}\nFROM ${table}\nGROUP BY ${groupColumn}\nORDER BY row_count DESC, ${groupColumn}\nLIMIT 25;`,
      hint: 'Every non-aggregated selected column must appear in GROUP BY.',
      solutionNote: 'Sample answer: grouped outputs should include the grain column, the metric, and a sort that makes the largest groups visible first.'
    });
  }

  if (variantIndex === 2) {
    return exercise({
      id: `fluency-null-${number}-${baseId}`,
      title: `Fluency Null Audit ${number}`,
      moduleId: 'm4',
      moduleTitle: 'Transformation',
      stage: 'Shape',
      database,
      level: 'fluency',
      task: `Audit ${table}: count total rows and rows where ${nullColumn} is NULL.`,
      expectedSql: `SELECT COUNT(*) AS total_rows,\n       COUNT(*) FILTER (WHERE ${nullColumn} IS NULL) AS null_${nullColumn}\nFROM ${table};`,
      hint: 'Use IS NULL, not = NULL.',
      solutionNote: 'Sample answer: NULL audits are a senior habit before joins, filters, and metric definitions.'
    });
  }

  if (variantIndex === 3) {
    return exercise({
      id: `fluency-window-${number}-${baseId}`,
      title: `Fluency Window ${number}`,
      moduleId: 'm6',
      moduleTitle: 'Window Functions',
      stage: 'Sequence',
      database,
      level: 'fluency',
      task: `Rank rows from ${table} within each ${groupColumn} by ${measureColumn}, returning the top 5 per group.`,
      expectedSql: `WITH ranked AS (\n  SELECT ${columns},\n         ROW_NUMBER() OVER (PARTITION BY ${groupColumn} ORDER BY ${measureColumn} DESC) AS rn\n  FROM ${table}\n)\nSELECT *\nFROM ranked\nWHERE rn <= 5\nORDER BY ${groupColumn}, rn;`,
      hint: 'Use ROW_NUMBER in a CTE, then filter the ranked result.',
      solutionNote: 'Sample answer: top-N per group is one of the most common senior SQL interview patterns.'
    });
  }

  return exercise({
    id: `fluency-debug-${number}-${baseId}`,
    title: `Fluency Debug ${number}`,
    moduleId: 'm8',
    moduleTitle: 'Performance',
    stage: 'Optimize',
    database,
    level: 'debug',
    task: `Explain the plan for a selective query on ${table}; return the PostgreSQL plan rows.`,
    expectedSql: `EXPLAIN SELECT ${columns}\nFROM ${table}\nWHERE ${measureColumn} IS NOT NULL\nORDER BY ${orderBy}\nLIMIT 25;`,
    hint: 'EXPLAIN without ANALYZE is safe and shows the planner strategy.',
    solutionNote: 'Sample answer: read the plan from bottom to top; name scans, joins, sorts, and estimated rows.'
  });
}

const fluencyReps = fluencySources.flatMap((source, sourceIndex) => (
  [0, 1, 2, 3, 4].map((variantIndex) => fluencyExercise(source, variantIndex, sourceIndex))
));

const manualSeniorPrompts = [
  exercise({
    id: 'verbal-data-model-01',
    title: 'Verbal Data Model 1',
    moduleId: 'mock',
    moduleTitle: 'Mock Interviews',
    stage: 'Prove',
    database: 'any',
    level: 'verbal',
    task: 'Design a warehouse model for subscription churn analysis. Name the facts, dimensions, grain, and three leadership queries.',
    expectedSql: '',
    checkable: false,
    solutionNote: 'Sample answer: fact_subscription_events at one row per customer-plan-event, dim_customer, dim_plan, dim_date; key queries are churn rate by cohort, expansion/contraction revenue, and save-offer effectiveness.'
  }),
  exercise({
    id: 'verbal-ambiguity-01',
    title: 'Verbal Ambiguity 1',
    moduleId: 'mock',
    moduleTitle: 'Mock Interviews',
    stage: 'Prove',
    database: 'any',
    level: 'verbal',
    task: 'A VP asks for active users. List five clarifying questions before writing SQL.',
    expectedSql: '',
    checkable: false,
    solutionNote: 'Sample answer: define user, activity event, time window, timezone, bot/test exclusions, and whether multiple platforms are deduped.'
  }),
  exercise({
    id: 'verbal-performance-01',
    title: 'Verbal Performance 1',
    moduleId: 'm8',
    moduleTitle: 'Performance',
    stage: 'Optimize',
    database: 'any',
    level: 'verbal',
    task: 'A dashboard query suddenly got slow. Give a 90-second diagnostic plan.',
    expectedSql: '',
    checkable: false,
    solutionNote: 'Sample answer: confirm query/runtime change, compare EXPLAIN plans, inspect row counts and stale stats, check indexes and non-sargable predicates, then measure one fix at a time.'
  })
];

function getInterviewExpansionExercises() {
  return [
    ...seniorScreens,
    ...fluencyReps,
    ...manualSeniorPrompts
  ];
}

export {
  getInterviewExpansionExercises
};
