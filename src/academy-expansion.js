const moduleMeta = {
  m0: ['Know Your Schemas', 'Orient'],
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

function academyExercise(input) {
  const [moduleTitle, stage] = moduleMeta[input.moduleId];
  return {
    sourceFile: input.sourceFile || 'index.html',
    moduleTitle,
    stage,
    level: input.level || 'guided',
    hint: input.hint || 'Read the concept panel, copy the shape of the worked example, then adapt it to the task.',
    solutionNote: input.solutionNote || 'Sample answer: name the grain, write the smallest correct query, then verify columns, row count, and ordering.',
    checkable: Boolean(input.expectedSql && input.database && input.database !== 'any'),
    concept: input.concept || 'SQL is a precise way to ask a database for rows and columns.',
    whyItMatters: input.whyItMatters || 'Interviewers look for clear thinking: what table you need, what grain you need, and how you know the result is right.',
    mentalModel: input.mentalModel || 'Think of a table like a spreadsheet: columns are fields, rows are records, and SQL is the instruction you give to return a smaller, better-shaped spreadsheet.',
    workedExample: input.workedExample || 'Example shape: SELECT the needed columns, FROM the right table, add WHERE only when you need to filter, then ORDER BY and LIMIT when the prompt asks for top or latest rows.',
    steps: input.steps || [
      'Name the table you are querying.',
      'Name the exact columns the prompt asks for.',
      'Add filters, grouping, or ordering only when the prompt requires them.'
    ],
    commonMistakes: input.commonMistakes || [
      'Selecting every column when the prompt asks for specific columns.',
      'Sorting after LIMIT in your thinking instead of using ORDER BY before LIMIT in SQL.',
      'Guessing table names before inspecting the schema.'
    ],
    interviewAngle: input.interviewAngle || 'In an interview, say your plan before typing: table, grain, filters, metric, and sort order.',
    ...input,
    expectedSql: (input.expectedSql || '').trim()
  };
}

const zeroLessons = [
  academyExercise({
    id: 'zero-database-01',
    title: 'Zero SQL 1',
    moduleId: 'm0',
    database: 'chinook',
    level: 'absolute beginner',
    task: 'What is a database? List the user tables in Chinook so you can see what raw material SQL can query.',
    concept: 'A database is a collection of related tables. A table is rows and columns stored so you can ask precise questions.',
    whyItMatters: 'Before you write SQL, you need to know what tables exist. Senior analysts do not guess; they inspect.',
    mentalModel: 'Think of the database as a workbook, each table as a spreadsheet tab, each row as a record, and each column as one attribute.',
    workedExample: 'To inspect tables, query information_schema.tables and exclude PostgreSQL system schemas.',
    steps: [
      'Ask PostgreSQL for its list of tables.',
      'Remove system tables from pg_catalog and information_schema.',
      'Sort the result so the schema is easy to scan.'
    ],
    commonMistakes: [
      'Starting with SELECT * from a guessed table name.',
      'Ignoring schema names when a database has multiple schemas.',
      'Treating the database like one giant table.'
    ],
    interviewAngle: 'In an interview, schema recon shows maturity: you learn the data shape before writing business logic.',
    expectedSql: `
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
`
  }),
  academyExercise({
    id: 'zero-table-row-column-01',
    title: 'Zero SQL 2',
    moduleId: 'm0',
    database: 'chinook',
    level: 'absolute beginner',
    task: 'What are columns? Inspect the track table columns and data types in table order.',
    concept: 'Columns define what each row knows. Data types tell you whether a value behaves like text, a number, a date, or something else.',
    whyItMatters: 'You need column names and data types before filtering, sorting, grouping, or joining.',
    mentalModel: 'A column is a labeled vertical field in a spreadsheet; a data type is the rule for what can live in that field.',
    workedExample: 'information_schema.columns shows column_name, data_type, and ordinal_position.',
    steps: [
      'Choose the table you want to understand.',
      'Read column names and data types.',
      'Use ordinal_position to keep the database-defined order.'
    ],
    commonMistakes: [
      'Assuming a date-looking field is actually a date.',
      'Misspelling column names because you did not inspect them.',
      'Using numeric operations on text columns.'
    ],
    interviewAngle: 'Senior candidates ask about data types because data types control correct comparisons and aggregations.',
    expectedSql: `
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'track'
ORDER BY ordinal_position;
`
  }),
  academyExercise({
    id: 'zero-first-select-01',
    title: 'Zero SQL 3',
    moduleId: 'm1',
    database: 'chinook',
    level: 'absolute beginner',
    task: 'Your first SELECT: return 10 track names from Chinook.',
    concept: 'SELECT chooses columns. FROM chooses the table. LIMIT keeps the output small while you learn.',
    whyItMatters: 'Every advanced query is built from this simple sentence shape.',
    mentalModel: 'SELECT is your shopping list; FROM is the shelf you are shopping from.',
    workedExample: 'SELECT name FROM track LIMIT 10;',
    steps: [
      'Write SELECT.',
      'Name the column you want.',
      'Write FROM and the table name, then LIMIT 10.'
    ],
    commonMistakes: [
      'Forgetting FROM.',
      'Using the database name instead of the table name.',
      'Adding every column before you know what the prompt asks for.'
    ],
    interviewAngle: 'Even senior screens reward clean basics: return exactly what was asked for, no extra noise.',
    expectedSql: `
SELECT name
FROM track
LIMIT 10;
`
  }),
  academyExercise({
    id: 'zero-first-filter-01',
    title: 'Zero SQL 4',
    moduleId: 'm1',
    database: 'chinook',
    level: 'absolute beginner',
    task: 'Your first WHERE: return name and unit_price for Chinook tracks priced at 1 or more.',
    concept: 'WHERE filters rows. It runs before sorting and limiting.',
    whyItMatters: 'Most analyst questions start by reducing the dataset to the relevant population.',
    mentalModel: 'WHERE is a gate: rows pass through only when the condition is true.',
    workedExample: 'SELECT name FROM track WHERE unit_price >= 1;',
    steps: [
      'Select only the requested columns.',
      'Choose the track table.',
      'Add a numeric comparison in WHERE.'
    ],
    commonMistakes: [
      'Putting the filter in SELECT instead of WHERE.',
      'Using => instead of >=.',
      'Quoting numbers as text without a reason.'
    ],
    interviewAngle: 'State your population filter out loud before writing metrics.',
    expectedSql: `
SELECT name, unit_price
FROM track
WHERE unit_price >= 1
ORDER BY unit_price, name;
`
  }),
  academyExercise({
    id: 'zero-first-sort-01',
    title: 'Zero SQL 5',
    moduleId: 'm1',
    database: 'chinook',
    level: 'absolute beginner',
    task: 'Your first ORDER BY: return the 10 longest tracks with name and milliseconds.',
    concept: 'ORDER BY controls row order. DESC means highest or latest first.',
    whyItMatters: 'Top-N interview prompts depend on sorting before limiting.',
    mentalModel: 'ORDER BY sorts the full stack of rows; LIMIT then takes the first few.',
    workedExample: 'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 10;',
    steps: [
      'Select the requested columns.',
      'Sort by the measure that defines longest.',
      'Limit to 10 after the sort.'
    ],
    commonMistakes: [
      'Using LIMIT without ORDER BY for a top-N question.',
      'Sorting ascending when the prompt asks for longest.',
      'Sorting by a formatted label instead of the original numeric field.'
    ],
    interviewAngle: 'For every top-N prompt, say what defines top and how ties should be handled.',
    expectedSql: `
SELECT name, milliseconds
FROM track
ORDER BY milliseconds DESC, name
LIMIT 10;
`
  }),
  academyExercise({
    id: 'senior-analytics-case-01',
    title: 'Senior Analytics Case 1',
    moduleId: 'm7',
    database: 'chinook',
    level: 'senior case',
    task: 'Executive revenue readout: by year, show invoices, revenue, average invoice value, and active customers.',
    concept: 'Senior analytics SQL turns raw rows into decision-ready metrics at a clear grain.',
    whyItMatters: 'Executives need trend, volume, mix, and efficiency in the same result so they can ask better follow-up questions.',
    mentalModel: 'One row per year is the grain. Each metric is a different lens on that yearly grain.',
    workedExample: 'Group by invoice year, aggregate total, and count distinct customers for the active base.',
    steps: [
      'Set the result grain to one row per invoice year.',
      'Compute count, sum, average, and a distinct customer count.',
      'Sort chronologically so the trend is readable.'
    ],
    commonMistakes: [
      'Mixing monthly and yearly grain in one query.',
      'Counting rows when the prompt asks for distinct customers.',
      'Forgetting to round presentation metrics.'
    ],
    interviewAngle: 'Frame the answer like an analyst: revenue trend, volume, average invoice value, and active customer base answer different business questions.',
    expectedSql: `
SELECT EXTRACT(YEAR FROM invoice_date)::int AS invoice_year,
       COUNT(*) AS invoices,
       COUNT(DISTINCT customer_id) AS active_customers,
       ROUND(SUM(total)::numeric, 2) AS revenue,
       ROUND(AVG(total)::numeric, 2) AS avg_invoice_value
FROM invoice
GROUP BY 1
ORDER BY invoice_year;
`
  })
];

const sources = [
  { moduleId: 'm1', database: 'chinook', table: 'album', columns: 'album_id, title, artist_id', orderBy: 'title, album_id', groupColumn: 'artist_id', measureColumn: 'album_id', nullColumn: 'title' },
  { moduleId: 'm1', database: 'chinook', table: 'employee', columns: 'employee_id, first_name, last_name, title, reports_to', orderBy: 'last_name, employee_id', groupColumn: 'title', measureColumn: 'employee_id', nullColumn: 'reports_to' },
  { moduleId: 'm2', database: 'chinook', table: 'playlist_track', columns: 'playlist_id, track_id', orderBy: 'playlist_id, track_id', groupColumn: 'playlist_id', measureColumn: 'track_id', nullColumn: 'track_id' },
  { moduleId: 'm1', database: 'chinook', table: 'track', columns: 'track_id, name, genre_id, milliseconds, unit_price', orderBy: 'milliseconds DESC, name', groupColumn: 'genre_id', measureColumn: 'milliseconds', nullColumn: 'composer' },
  { moduleId: 'm2', database: 'chinook', table: 'invoice', columns: 'invoice_id, customer_id, invoice_date, billing_country, total', orderBy: 'total DESC, invoice_id', groupColumn: 'billing_country', measureColumn: 'total', nullColumn: 'billing_state', dateColumn: 'invoice_date' },
  { moduleId: 'm3', database: 'chinook', table: 'invoice_line', columns: 'invoice_id, track_id, unit_price, quantity', orderBy: 'quantity DESC, invoice_id', groupColumn: 'track_id', measureColumn: 'quantity', nullColumn: 'track_id' },
  { moduleId: 'm1', database: 'chinook', table: 'customer', columns: 'customer_id, first_name, last_name, country, support_rep_id', orderBy: 'customer_id', groupColumn: 'country', measureColumn: 'customer_id', nullColumn: 'support_rep_id' },
  { moduleId: 'm1', database: 'stackoverflow', table: 'users', columns: 'id, displayname, reputation, creationdate', orderBy: 'reputation DESC, id', groupColumn: 'location', measureColumn: 'reputation', nullColumn: 'location', dateColumn: 'creationdate' },
  { moduleId: 'm1', database: 'stackoverflow', table: 'posts', columns: 'id, posttypeid, owneruserid, creationdate, score', orderBy: 'score DESC, id', groupColumn: 'posttypeid', measureColumn: 'score', nullColumn: 'owneruserid', dateColumn: 'creationdate' },
  { moduleId: 'm2', database: 'stackoverflow', table: 'comments', columns: 'id, postid, userid, score, creationdate', orderBy: 'score DESC, id', groupColumn: 'userid', measureColumn: 'score', nullColumn: 'userid', dateColumn: 'creationdate' },
  { moduleId: 'm2', database: 'stackoverflow', table: 'badges', columns: 'id, userid, name, date, class', orderBy: 'date DESC, id', groupColumn: 'name', measureColumn: 'class', nullColumn: 'userid', dateColumn: 'date' },
  { moduleId: 'm1', database: 'stackoverflow', table: 'votes', columns: 'id, postid, votetypeid, bountyamount, creationdate', orderBy: 'creationdate DESC, id', groupColumn: 'votetypeid', measureColumn: 'bountyamount', nullColumn: 'bountyamount', dateColumn: 'creationdate' },
  { moduleId: 'm2', database: 'stackoverflow', table: 'posts', columns: 'id, posttypeid, score, viewcount, answercount, creationdate', orderBy: 'score DESC, id', groupColumn: 'posttypeid', measureColumn: 'viewcount', nullColumn: 'viewcount', dateColumn: 'creationdate' },
  { moduleId: 'm4', database: 'stackoverflow', table: 'posthistory', columns: 'id, posthistorytypeid, postid, userid, creationdate', orderBy: 'creationdate DESC, id', groupColumn: 'posthistorytypeid', measureColumn: 'postid', nullColumn: 'userid', dateColumn: 'creationdate' },
  { moduleId: 'm1', database: 'chinook', table: 'track', columns: 'track_id, name, genre_id, bytes, composer', orderBy: 'bytes DESC, track_id', groupColumn: 'genre_id', measureColumn: 'bytes', nullColumn: 'composer' },
  { moduleId: 'm2', database: 'chinook', table: 'invoice', columns: 'invoice_id, customer_id, billing_country, billing_state, total, invoice_date', orderBy: 'total DESC, invoice_id', groupColumn: 'billing_country', measureColumn: 'total', nullColumn: 'billing_state', dateColumn: 'invoice_date' },
  { moduleId: 'm3', database: 'chinook', table: 'invoice_line', columns: 'invoice_line_id, invoice_id, track_id, unit_price, quantity', orderBy: 'unit_price DESC, invoice_line_id', groupColumn: 'track_id', measureColumn: 'unit_price', nullColumn: 'quantity' },
  { moduleId: 'm3', database: 'chinook', table: 'customer', columns: 'customer_id, first_name, last_name, country, company, support_rep_id', orderBy: 'country, last_name', groupColumn: 'country', measureColumn: 'customer_id', nullColumn: 'company' },
  { moduleId: 'm2', database: 'stackoverflow', table: 'users', columns: 'id, displayname, reputation, upvotes, downvotes, creationdate', orderBy: 'reputation DESC, id', groupColumn: 'location', measureColumn: 'upvotes', nullColumn: 'location', dateColumn: 'creationdate' },
  { moduleId: 'm2', database: 'chinook', table: 'track', columns: 'track_id, album_id, media_type_id, milliseconds, bytes', orderBy: 'bytes DESC, track_id', groupColumn: 'media_type_id', measureColumn: 'bytes', nullColumn: 'album_id' },
  { moduleId: 'm5', database: 'chinook', table: 'album', columns: 'album_id, title, artist_id', orderBy: 'artist_id, album_id', groupColumn: 'artist_id', measureColumn: 'album_id', nullColumn: 'title' },
  { moduleId: 'm6', database: 'chinook', table: 'invoice', columns: 'invoice_id, customer_id, invoice_date, total', orderBy: 'invoice_date, invoice_id', groupColumn: 'customer_id', measureColumn: 'total', nullColumn: 'billing_state', dateColumn: 'invoice_date' }
];

function labelForSource(source) {
  return `${source.database} ${source.table}`;
}

function columnsWithGroup(source) {
  const columns = source.columns.split(',').map((column) => column.trim().toLowerCase());
  return columns.includes(source.groupColumn.toLowerCase())
    ? source.columns
    : `${source.groupColumn}, ${source.columns}`;
}

function withTeaching(source, variant, extra) {
  return academyExercise({
    ...extra,
    concept: extra.concept || variant.concept,
    whyItMatters: extra.whyItMatters || `This pattern appears constantly in analyst work on ${labelForSource(source)}: find the right grain, calculate the metric, and make the output easy to audit.`,
    mentalModel: extra.mentalModel || variant.mentalModel,
    workedExample: extra.workedExample || variant.workedExample,
    steps: extra.steps || variant.steps,
    commonMistakes: extra.commonMistakes || variant.commonMistakes,
    interviewAngle: extra.interviewAngle || variant.interviewAngle
  });
}

const variants = [
  {
    suffix: 'sample',
    moduleId: 'm1',
    level: 'guided drill',
    title: 'Sample Rows',
    concept: 'Sampling rows helps you understand what lives in a table before writing business logic.',
    mentalModel: 'Peek before you calculate.',
    workedExample: 'SELECT a few useful columns FROM one table ORDER BY a stable column LIMIT 25.',
    steps: ['Choose readable columns.', 'Sort deterministically.', 'Limit the output.'],
    commonMistakes: ['Using SELECT * forever.', 'Leaving sample output unordered.', 'Sampling after writing complex logic.'],
    interviewAngle: 'Sampling is how you avoid making assumptions about unfamiliar data.',
    sql: (s) => `SELECT ${s.columns}\nFROM ${s.table}\nORDER BY ${s.orderBy}\nLIMIT 25;`
  },
  {
    suffix: 'count',
    moduleId: 'm1',
    level: 'guided drill',
    title: 'Count Rows',
    concept: 'COUNT(*) gives you the size of a table or filtered population.',
    mentalModel: 'Before measuring, count the population.',
    workedExample: 'SELECT COUNT(*) AS row_count FROM table;',
    steps: ['Start with COUNT(*).', 'Name the metric row_count.', 'Run it before adding complexity.'],
    commonMistakes: ['Counting a nullable column when you mean rows.', 'Skipping baseline counts.', 'Forgetting an alias.'],
    interviewAngle: 'Baseline counts are a senior habit because they catch broken joins and filters.',
    sql: (s) => `SELECT COUNT(*) AS row_count\nFROM ${s.table};`
  },
  {
    suffix: 'null-audit',
    moduleId: 'm4',
    level: 'data quality',
    title: 'Null Audit',
    concept: 'NULL means unknown or missing, not zero and not an empty string.',
    mentalModel: 'NULL is a blank cell with special three-valued logic.',
    workedExample: 'COUNT(*) FILTER (WHERE column IS NULL) counts missing values.',
    steps: ['Count all rows.', 'Count rows where the audit column IS NULL.', 'Compare the two counts.'],
    commonMistakes: ['Writing = NULL.', 'Treating missing as zero.', 'Ignoring NULL before joins.'],
    interviewAngle: 'Data quality checks separate senior analysts from query typists.',
    sql: (s) => `SELECT COUNT(*) AS total_rows,\n       COUNT(*) FILTER (WHERE ${s.nullColumn} IS NULL) AS null_${s.nullColumn}\nFROM ${s.table};`
  },
  {
    suffix: 'group-count',
    moduleId: 'm2',
    level: 'aggregation',
    title: 'Group Count',
    concept: 'GROUP BY changes the grain from individual rows to one row per group.',
    mentalModel: 'GROUP BY makes piles of rows; aggregate functions summarize each pile.',
    workedExample: 'SELECT group_column, COUNT(*) FROM table GROUP BY group_column.',
    steps: ['Choose the grouping column.', 'COUNT rows in each group.', 'Sort largest groups first.'],
    commonMistakes: ['Selecting non-grouped columns.', 'Forgetting GROUP BY.', 'Sorting alphabetically when the prompt asks largest.'],
    interviewAngle: 'Always state the output grain: one row per group.',
    sql: (s) => `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nORDER BY row_count DESC, ${s.groupColumn}\nLIMIT 25;`
  },
  {
    suffix: 'avg-by-group',
    moduleId: 'm2',
    level: 'aggregation',
    title: 'Average By Group',
    concept: 'AVG summarizes a numeric measure inside each group.',
    mentalModel: 'After GROUP BY creates piles, AVG measures the typical value in each pile.',
    workedExample: 'SELECT group_column, AVG(measure) FROM table GROUP BY group_column.',
    steps: ['Group by the dimension.', 'Average the numeric measure.', 'Round the result for readability.'],
    commonMistakes: ['Averaging IDs as if they were business metrics.', 'Forgetting NULLIF in ratios.', 'Not rounding presentation metrics.'],
    interviewAngle: 'Explain whether average is the right metric or whether median would be more robust.',
    sql: (s) => `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(AVG(${s.measureColumn})::numeric, 2) AS avg_${s.measureColumn}\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nORDER BY avg_${s.measureColumn} DESC NULLS LAST, ${s.groupColumn}\nLIMIT 25;`
  },
  {
    suffix: 'sum-by-group',
    moduleId: 'm2',
    level: 'aggregation',
    title: 'Sum By Group',
    concept: 'SUM is the workhorse for revenue, quantity, distance, score, and other additive metrics.',
    mentalModel: 'SUM stacks numeric values inside each group into one total.',
    workedExample: 'SELECT group_column, SUM(measure) FROM table GROUP BY group_column.',
    steps: ['Group by the dimension.', 'Sum the measure.', 'Sort biggest totals first.'],
    commonMistakes: ['Summing after an accidental join fan-out.', 'Forgetting the grouping dimension.', 'Using AVG when the prompt asks total.'],
    interviewAngle: 'For business metrics, say whether the metric is additive at the chosen grain.',
    sql: (s) => `SELECT ${s.groupColumn},\n       ROUND(SUM(${s.measureColumn})::numeric, 2) AS total_${s.measureColumn}\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nORDER BY total_${s.measureColumn} DESC NULLS LAST, ${s.groupColumn}\nLIMIT 25;`
  },
  {
    suffix: 'case-bucket',
    moduleId: 'm4',
    level: 'transformation',
    title: 'CASE Bucket',
    concept: 'CASE turns raw values into analyst-friendly categories.',
    mentalModel: 'CASE checks conditions top to bottom and returns the first matching label.',
    workedExample: 'CASE WHEN measure < 10 THEN low ELSE high END.',
    steps: ['Choose thresholds.', 'Order CASE branches from narrow to broad.', 'Group by the bucket label.'],
    commonMistakes: ['Putting ELSE too early.', 'Overlapping buckets.', 'Forgetting NULL handling.'],
    interviewAngle: 'Buckets are business definitions; say your thresholds and ask if they match stakeholder intent.',
    sql: (s) => `SELECT CASE\n         WHEN ${s.measureColumn} IS NULL THEN 'missing'\n         WHEN ${s.measureColumn} < 10 THEN 'low'\n         WHEN ${s.measureColumn} < 100 THEN 'medium'\n         ELSE 'high'\n       END AS ${s.measureColumn}_bucket,\n       COUNT(*) AS row_count\nFROM ${s.table}\nGROUP BY 1\nORDER BY 1;`
  },
  {
    suffix: 'above-average',
    moduleId: 'm5',
    level: 'subquery',
    title: 'Above Average',
    concept: 'A subquery or CTE lets one part of the query calculate a benchmark and another part use it.',
    mentalModel: 'First calculate the ruler, then compare rows to the ruler.',
    workedExample: 'WITH baseline AS (SELECT AVG(measure) ...) SELECT rows WHERE measure > avg_measure.',
    steps: ['Create a baseline CTE.', 'Join or cross join the baseline into the row query.', 'Filter rows above the benchmark.'],
    commonMistakes: ['Repeating the same subquery several times.', 'Comparing to a grouped average unintentionally.', 'Forgetting to filter out NULL measures.'],
    interviewAngle: 'CTEs make your reasoning readable, which matters in senior interviews.',
    sql: (s) => `WITH baseline AS (\n  SELECT AVG(${s.measureColumn}) AS avg_measure\n  FROM ${s.table}\n  WHERE ${s.measureColumn} IS NOT NULL\n)\nSELECT ${s.columns}\nFROM ${s.table}\nCROSS JOIN baseline\nWHERE ${s.measureColumn} > baseline.avg_measure\nORDER BY ${s.measureColumn} DESC\nLIMIT 25;`
  },
  {
    suffix: 'rank-by-group',
    moduleId: 'm6',
    level: 'window',
    title: 'Rank Within Group',
    concept: 'Window functions calculate across related rows without collapsing them.',
    mentalModel: 'A window function lets every row look sideways at its group.',
    workedExample: 'ROW_NUMBER() OVER (PARTITION BY group_column ORDER BY measure DESC).',
    steps: ['Partition by the group column.', 'Order by the measure inside each group.', 'Filter to the top rows in an outer query.'],
    commonMistakes: ['Filtering rn in the same SELECT where it is created.', 'Using RANK when you need exactly five rows.', 'Forgetting deterministic tie-breakers.'],
    interviewAngle: 'Top-N per group is a signature senior SQL pattern.',
    sql: (s) => `WITH ranked AS (\n  SELECT ${columnsWithGroup(s)},\n         ROW_NUMBER() OVER (PARTITION BY ${s.groupColumn} ORDER BY ${s.measureColumn} DESC) AS rn\n  FROM ${s.table}\n  WHERE ${s.measureColumn} IS NOT NULL\n)\nSELECT *\nFROM ranked\nWHERE rn <= 5\nORDER BY ${s.groupColumn}, rn;`
  },
  {
    suffix: 'having',
    moduleId: 'm2',
    level: 'aggregation',
    title: 'HAVING Filter',
    concept: 'WHERE filters rows before grouping. HAVING filters groups after aggregation.',
    mentalModel: 'WHERE controls ingredients; HAVING controls finished piles.',
    workedExample: 'GROUP BY group_column HAVING COUNT(*) >= 10.',
    steps: ['Group rows.', 'Calculate group metrics.', 'Use HAVING to keep qualifying groups.'],
    commonMistakes: ['Using WHERE COUNT(*) > 1.', 'Filtering too early.', 'Not naming aggregate columns.'],
    interviewAngle: 'Correct WHERE vs HAVING usage is a basic screen for SQL fluency.',
    sql: (s) => `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(SUM(${s.measureColumn})::numeric, 2) AS total_${s.measureColumn}\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nHAVING COUNT(*) >= 2\nORDER BY row_count DESC, ${s.groupColumn}\nLIMIT 25;`
  },
  {
    suffix: 'date-trend',
    moduleId: 'm7',
    level: 'business pattern',
    title: 'Monthly Trend',
    concept: 'Time-series SQL groups events into calendar periods so trends become visible.',
    mentalModel: 'date_trunc rolls many timestamps into the same month bucket.',
    workedExample: "date_trunc('month', created_at)::date AS month.",
    steps: ['Create a month bucket.', 'Count rows and average the measure.', 'Order chronologically.'],
    commonMistakes: ['Sorting month names alphabetically.', 'Using EXTRACT month without year.', 'Ignoring partial-period caveats.'],
    interviewAngle: 'Trend questions should mention grain, timezone, and partial periods.',
    sql: (s) => s.dateColumn
      ? `SELECT date_trunc('month', ${s.dateColumn})::date AS month,\n       COUNT(*) AS row_count,\n       ROUND(AVG(${s.measureColumn})::numeric, 2) AS avg_${s.measureColumn}\nFROM ${s.table}\nGROUP BY 1\nORDER BY 1;`
      : `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(AVG(${s.measureColumn})::numeric, 2) AS avg_${s.measureColumn}\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nORDER BY row_count DESC, ${s.groupColumn};`
  },
  {
    suffix: 'quality-summary',
    moduleId: 'm8',
    level: 'analytics engineering',
    title: 'Quality Summary',
    concept: 'A quality summary checks volume, missingness, and metric range before deeper analysis.',
    mentalModel: 'Before trusting a table, inspect its vital signs.',
    workedExample: 'COUNT rows, count NULLs, MIN and MAX a numeric measure.',
    steps: ['Count all rows.', 'Count missing dimension values.', 'Check min and max of the measure.'],
    commonMistakes: ['Skipping quality checks before a dashboard metric.', 'Assuming negative or zero values are impossible.', 'Not checking missing dimensions.'],
    interviewAngle: 'Analytics engineers are expected to validate data, not just query it.',
    sql: (s) => `SELECT COUNT(*) AS total_rows,\n       COUNT(*) FILTER (WHERE ${s.nullColumn} IS NULL) AS missing_${s.nullColumn},\n       MIN(${s.measureColumn}) AS min_${s.measureColumn},\n       MAX(${s.measureColumn}) AS max_${s.measureColumn}\nFROM ${s.table};`
  },
  {
    suffix: 'percentile',
    moduleId: 'm7',
    level: 'senior metric',
    title: 'Median Metric',
    concept: 'Median is often better than average when a metric has extreme outliers.',
    mentalModel: 'Median is the middle value after sorting.',
    workedExample: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY measure).',
    steps: ['Group by the dimension.', 'Calculate average and median.', 'Compare the two for skew.'],
    commonMistakes: ['Assuming average represents typical behavior.', 'Forgetting WITHIN GROUP syntax.', 'Ignoring NULL measures.'],
    interviewAngle: 'Calling out skew and median is a senior analyst signal.',
    sql: (s) => `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(AVG(${s.measureColumn})::numeric, 2) AS avg_${s.measureColumn},\n       ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${s.measureColumn}))::numeric, 2) AS median_${s.measureColumn}\nFROM ${s.table}\nWHERE ${s.measureColumn} IS NOT NULL\nGROUP BY ${s.groupColumn}\nORDER BY row_count DESC, ${s.groupColumn}\nLIMIT 25;`
  },
  {
    suffix: 'explain-plan',
    moduleId: 'm8',
    level: 'performance',
    title: 'Explain Plan',
    concept: 'EXPLAIN shows how PostgreSQL plans to run your query.',
    mentalModel: 'The plan is the database telling you its route before taking the trip.',
    workedExample: 'EXPLAIN SELECT ... WHERE measure IS NOT NULL ORDER BY measure DESC LIMIT 25.',
    steps: ['Write a selective query.', 'Prefix it with EXPLAIN.', 'Read scan, sort, and estimated row information.'],
    commonMistakes: ['Optimizing before measuring.', 'Reading only the first plan line.', 'Using EXPLAIN ANALYZE on unsafe write queries.'],
    interviewAngle: 'For analytics engineering interviews, explain plans show you can reason about scale.',
    sql: (s) => `EXPLAIN SELECT ${s.columns}\nFROM ${s.table}\nWHERE ${s.measureColumn} IS NOT NULL\nORDER BY ${s.orderBy}\nLIMIT 25;`
  },
  {
    suffix: 'senior-readout',
    moduleId: 'mock',
    level: 'senior case',
    title: 'Senior Readout',
    concept: 'Senior interviews often ask for a metric and an explanation of what it means.',
    mentalModel: 'The SQL result is evidence; the readout is the decision support.',
    workedExample: 'Return grouped count, total, and average, then explain the grain.',
    steps: ['Set the grain.', 'Return volume and value metrics.', 'Sort for the strongest business signal.'],
    commonMistakes: ['Returning a metric without explaining its denominator.', 'Not stating caveats.', 'Letting the output order hide the answer.'],
    interviewAngle: 'After the query, speak like an analyst: what changed, why it might matter, and what you would check next.',
    sql: (s) => `SELECT ${s.groupColumn},\n       COUNT(*) AS row_count,\n       ROUND(SUM(${s.measureColumn})::numeric, 2) AS total_${s.measureColumn},\n       ROUND(AVG(${s.measureColumn})::numeric, 2) AS avg_${s.measureColumn}\nFROM ${s.table}\nGROUP BY ${s.groupColumn}\nORDER BY total_${s.measureColumn} DESC NULLS LAST, ${s.groupColumn}\nLIMIT 20;`
  }
];

function generatedExercise(source, variant, sourceIndex, variantIndex) {
  const baseId = `${source.database}-${source.table}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const number = String(sourceIndex + 1).padStart(2, '0');
  const [moduleTitle, stage] = moduleMeta[variant.moduleId];

  return withTeaching(source, variant, {
    id: `academy-${variant.suffix}-${number}-${baseId}`,
    title: `${variant.title} ${number}.${variantIndex + 1}`,
    moduleId: variant.moduleId,
    moduleTitle,
    stage,
    database: source.database,
    level: variant.level,
    task: `${variant.title} on ${source.table}: use ${source.database} to produce a clean result from ${labelForSource(source)}.`,
    expectedSql: variant.sql(source)
  });
}

function getAcademyExpansionExercises() {
  const generated = sources.flatMap((source, sourceIndex) => (
    variants.map((variant, variantIndex) => generatedExercise(source, variant, sourceIndex, variantIndex))
  ));

  return [
    ...zeroLessons,
    ...generated
  ];
}

module.exports = {
  getAcademyExpansionExercises
};
