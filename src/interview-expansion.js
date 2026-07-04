function exercise(input) {
  return {
    sourceFile: 'index.html',
    hint: '',
    solutionNote: 'Sample answer: explain the grain first, state any filter assumptions, run the query, then sanity-check row count and ordering.',
    checkable: Boolean(input.expectedSql && input.database),
    ...input
  };
}

const moduleMeta = {
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

function withModule(id, moduleId, title, database, level, task, expectedSql, extra = {}) {
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
  SELECT EXTRACT(YEAR FROM creation_date)::int AS year,
         COUNT(*) AS questions,
         COUNT(accepted_answer_id) AS accepted
  FROM posts
  WHERE post_type_id = 1
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
  withModule('senior-window-02','m6','Senior Window 2','northwind','senior','Monthly revenue with running year-to-date total and month-over-month change for all order lines.',`
WITH monthly AS (
  SELECT date_trunc('month', o.order_date)::date AS month,
         SUM(od.unit_price * od.quantity * (1 - od.discount)) AS revenue
  FROM orders o
  JOIN order_details od ON od.order_id = o.order_id
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
  withModule('senior-window-04','m6','Senior Window 4','nyctaxi','senior','Daily trips with a 7-day trailing moving average. Include the number of days in each frame.',`
WITH daily AS (
  SELECT pickup_datetime::date AS day,
         COUNT(*) AS trips
  FROM trips
  GROUP BY 1
)
SELECT day,
       trips,
       ROUND(AVG(trips) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 1) AS trailing_7_day_avg,
       COUNT(*) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS days_in_frame
FROM daily
ORDER BY day;
`),
  withModule('senior-window-05','m6','Senior Window 5','adventureworks','senior','Rank territories by annual revenue and return the top 5 territories per year.',`
WITH yearly AS (
  SELECT EXTRACT(YEAR FROM orderdate)::int AS order_year,
         territoryid,
         SUM(totaldue) AS revenue
  FROM sales.salesorderheader
  GROUP BY 1, 2
),
ranked AS (
  SELECT order_year,
         territoryid,
         revenue,
         RANK() OVER (PARTITION BY order_year ORDER BY revenue DESC) AS territory_rank
  FROM yearly
)
SELECT order_year, territoryid, ROUND(revenue::numeric, 2) AS revenue, territory_rank
FROM ranked
WHERE territory_rank <= 5
ORDER BY order_year, territory_rank, territoryid;
`),
  withModule('senior-cte-01','m5','Senior CTE 1','stackoverflow','senior','Find users who posted questions but never posted answers. Return the 50 highest-reputation users.',`
SELECT u.id, u.display_name, u.reputation
FROM users u
WHERE EXISTS (
  SELECT 1 FROM posts q
  WHERE q.owner_user_id = u.id AND q.post_type_id = 1
)
AND NOT EXISTS (
  SELECT 1 FROM posts a
  WHERE a.owner_user_id = u.id AND a.post_type_id = 2
)
ORDER BY u.reputation DESC
LIMIT 50;
`),
  withModule('senior-cte-02','m5','Senior CTE 2','northwind','senior','Find customers whose first order was also their largest order by revenue.',`
WITH order_revenue AS (
  SELECT o.customer_id,
         o.order_id,
         o.order_date,
         SUM(od.unit_price * od.quantity * (1 - od.discount)) AS revenue
  FROM orders o
  JOIN order_details od ON od.order_id = o.order_id
  GROUP BY o.customer_id, o.order_id, o.order_date
),
ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date, order_id) AS first_order_rank,
         RANK() OVER (PARTITION BY customer_id ORDER BY revenue DESC) AS revenue_rank
  FROM order_revenue
)
SELECT customer_id, order_id, order_date, ROUND(revenue::numeric, 2) AS revenue
FROM ranked
WHERE first_order_rank = 1 AND revenue_rank = 1
ORDER BY revenue DESC;
`),
  withModule('senior-debug-01','m3','Senior Debug 1','northwind','senior','Debug fan-out: compare order count before and after joining order_details by customer. Return customers where joined rows exceed orders.',`
SELECT o.customer_id,
       COUNT(DISTINCT o.order_id) AS orders,
       COUNT(*) AS joined_rows
FROM orders o
JOIN order_details od ON od.order_id = o.order_id
GROUP BY o.customer_id
HAVING COUNT(*) > COUNT(DISTINCT o.order_id)
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
  withModule('case-executive-sales-01','m7','Executive Sales Case 1','adventureworks','case','Executive case: identify annual revenue, order count, average order value, and online revenue share for leadership.',`
SELECT EXTRACT(YEAR FROM orderdate)::int AS order_year,
       COUNT(*) AS orders,
       ROUND(SUM(totaldue)::numeric, 2) AS revenue,
       ROUND(AVG(totaldue)::numeric, 2) AS avg_order_value,
       ROUND(100.0 * SUM(totaldue) FILTER (WHERE onlineorderflag = true) / NULLIF(SUM(totaldue), 0), 1) AS online_revenue_pct
FROM sales.salesorderheader
GROUP BY 1
ORDER BY order_year;
`,
    {
      hint: 'Leadership wants one row per year. Use FILTER for the online slice.',
      solutionNote: 'Sample executive framing: revenue trend, volume, average deal size, and channel mix answer different executive questions; call out that online revenue share can move independently from order count.'
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
  SELECT date_trunc('month', creation_date)::date AS month,
         COUNT(*) FILTER (WHERE post_type_id = 1) AS questions,
         COUNT(*) FILTER (WHERE post_type_id = 2) AS answers
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

const fluencySources = [
  ['m1','northwind','products','product_name, unit_price, units_in_stock','unit_price DESC','category_id','units_in_stock','product_name'],
  ['m1','northwind','orders','order_id, customer_id, order_date, freight','order_date DESC','ship_country','freight','customer_id'],
  ['m1','northwind','customers','customer_id, company_name, city, country','country, company_name','country','customer_id','city'],
  ['m2','northwind','order_details','order_id, product_id, unit_price, quantity, discount','quantity DESC','product_id','quantity','order_id'],
  ['m1','chinook','track','track_id, name, milliseconds, unit_price','milliseconds DESC','genre_id','milliseconds','composer'],
  ['m2','chinook','invoice','invoice_id, customer_id, invoice_date, billing_country, total','total DESC','billing_country','total','customer_id'],
  ['m1','chinook','customer','customer_id, first_name, last_name, country','country, last_name','country','customer_id','support_rep_id'],
  ['m3','chinook','invoice_line','invoice_id, track_id, unit_price, quantity','quantity DESC','track_id','quantity','invoice_id'],
  ['m1','stackoverflow','users','id, display_name, reputation, creation_date','reputation DESC','location','reputation','location'],
  ['m1','stackoverflow','posts','id, post_type_id, owner_user_id, creation_date, score','score DESC','post_type_id','score','owner_user_id'],
  ['m2','stackoverflow','badges','id, user_id, name, date','date DESC','name','user_id','date'],
  ['m2','stackoverflow','comments','id, post_id, user_id, score, creation_date','score DESC','user_id','score','post_id'],
  ['m1','nyctaxi','trips','trip_id, pickup_datetime, passenger_count, trip_distance, total_amount','pickup_datetime DESC','payment_type','total_amount','passenger_count'],
  ['m2','nyctaxi','trips','payment_type, passenger_count, fare_amount, tip_amount, total_amount','total_amount DESC','passenger_count','tip_amount','payment_type'],
  ['m1','adventureworks','production.product','productid, name, color, listprice','listprice DESC','color','listprice','color'],
  ['m2','adventureworks','sales.salesorderheader','salesorderid, customerid, orderdate, totaldue','totaldue DESC','territoryid','totaldue','shipdate'],
  ['m3','adventureworks','sales.salesorderdetail','salesorderid, productid, orderqty, linetotal','linetotal DESC','productid','orderqty','salesorderid'],
  ['m3','adventureworks','sales.customer','customerid, personid, storeid, territoryid','customerid','territoryid','customerid','storeid']
];

function fluencyExercise(source, variantIndex, sourceIndex) {
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

module.exports = {
  getInterviewExpansionExercises
};
