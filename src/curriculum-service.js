const fs = require('fs');
const path = require('path');
const { getAcademyExpansionExercises } = require('./academy-expansion');
const { getInterviewExpansionExercises } = require('./interview-expansion');

const MODULES = [
  { id: 'm0', file: 'schemas.html', title: 'Know Your Schemas', stage: 'Orient' },
  { id: 'm1', file: 'm1-fundamentals.html', title: 'Fundamentals', stage: 'Foundations' },
  { id: 'm2', file: 'm2-aggregation.html', title: 'Aggregation', stage: 'Summarize' },
  { id: 'm3', file: 'm3-joins.html', title: 'Joins', stage: 'Relate' },
  { id: 'm4', file: 'm4-transformation.html', title: 'Transformation', stage: 'Shape' },
  { id: 'm5', file: 'm5-subqueries-ctes.html', title: 'Subqueries and CTEs', stage: 'Compose' },
  { id: 'm6', file: 'm6-window-functions.html', title: 'Window Functions', stage: 'Sequence' },
  { id: 'm7', file: 'm7-interview-patterns.html', title: 'Interview Patterns', stage: 'Recognize' },
  { id: 'm8', file: 'm8-performance.html', title: 'Performance', stage: 'Optimize' },
  { id: 'mock', file: 'mock-interviews.html', title: 'Mock Interviews', stage: 'Prove' }
];

const WEEK_THEMES = [
  ['Databases from zero', 'Understand databases, tables, rows, columns, schemas, and safe exploration.'],
  ['First SQL sentences', 'Build SELECT, FROM, ORDER BY, LIMIT, and exact column selection from scratch.'],
  ['Filtering foundations', 'Use WHERE, comparisons, text filters, numeric filters, and date ranges.'],
  ['NULL and truth', 'Reason about missing values, IS NULL, boolean logic, and three-valued SQL behavior.'],
  ['Sorting and top-N fluency', 'Answer top, latest, biggest, smallest, and deterministic ordering prompts.'],
  ['Data types and expressions', 'Calculate derived fields, cast values, round numbers, and format outputs.'],
  ['CASE and bucketing', 'Turn raw values into business categories and ordered labels.'],
  ['Aggregation foundations', 'Use COUNT, SUM, AVG, MIN, MAX, and GROUP BY at the right grain.'],
  ['Aggregation for metrics', 'Build business metrics, percentages, guarded ratios, and readable summaries.'],
  ['HAVING and grouped filters', 'Filter grouped results without confusing WHERE and HAVING.'],
  ['Schema-driven joins', 'Find join keys, inspect grain, and plan joins before typing.'],
  ['Inner and outer joins', 'Use INNER, LEFT, and FULL reasoning to preserve or restrict populations.'],
  ['Join fan-out control', 'Detect duplication, pre-aggregate safely, and reconcile row counts.'],
  ['Anti-joins and existence', 'Use NOT EXISTS, EXISTS, and left anti-joins for missingness questions.'],
  ['Text and date transformation', 'Clean strings, parse dates, bucket time, and handle partial periods.'],
  ['Data quality checks', 'Audit NULLs, ranges, duplicates, impossible values, and metric caveats.'],
  ['Subqueries from first principles', 'Use scalar, IN, EXISTS, and correlated subqueries deliberately.'],
  ['CTE composition', 'Break multi-step questions into named, testable blocks.'],
  ['Advanced CTE patterns', 'Use staging CTEs for cohorts, first events, and reconciliation.'],
  ['Window foundations', 'Use ROW_NUMBER, RANK, LAG, LEAD, and running totals.'],
  ['Window frames and partitions', 'Control frames, partitions, moving averages, and cumulative metrics.'],
  ['Top-N per group mastery', 'Solve ranked lists, tie rules, and per-segment comparisons.'],
  ['Retention and cohort SQL', 'Build first-event, cohort, lifetime value, and returning-user patterns.'],
  ['Time-series analytics', 'Build monthly trends, rolling windows, seasonality checks, and caveats.'],
  ['Analytics engineering habits', 'Use staging, naming, grain checks, and validation like production analysts.'],
  ['Performance literacy', 'Read EXPLAIN output, identify scans, sorts, joins, and expensive patterns.'],
  ['Dashboard metric readiness', 'Build metrics with stable definitions, tests, and stakeholder caveats.'],
  ['Ambiguous prompt handling', 'Ask clarifying questions and define user, event, time window, and exclusions.'],
  ['Executive case studies', 'Convert raw data into leadership-ready revenue, retention, and marketplace readouts.'],
  ['Product analytics cases', 'Answer funnel, activation, engagement, cohort, and marketplace questions.'],
  ['Analytics engineer cases', 'Model facts and dimensions, test assumptions, and explain tradeoffs.'],
  ['Senior SQL debugging', 'Diagnose broken joins, wrong denominators, duplicated rows, and slow queries.'],
  ['Mixed-pattern interviews', 'Combine joins, CTEs, windows, aggregation, and business interpretation.'],
  ['Timed senior screens', 'Practice under interview timing with real result checking.'],
  ['Mock interview loops', 'Answer, explain, repair, and present results with senior-level framing.'],
  ['Final proof week', 'Complete capstone interviews and review weak spots before applying.']
];

const SESSION_COUNTS = {
  m0: 8,
  m1: 18,
  m2: 18,
  m3: 18,
  m4: 14,
  m5: 14,
  m6: 16,
  m7: 16,
  m8: 12,
  mock: 10
};

function decodeHtml(value = '') {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rarr;/g, '->')
    .replace(/&larr;/g, '<-')
    .replace(/&nbsp;/g, ' ');
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function protectLooseLessThanOperators(value = '') {
  return value.replace(/<(?!\/?[a-z][a-z0-9:-]*(?:\s|>|\/)|!--|!doctype|\?)/gi, '&lt;');
}

function stripCodeTags(value = '') {
  return decodeHtml(protectLooseLessThanOperators(value).replace(/<[^>]*>/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(value, regex) {
  const match = value.match(regex);
  return match ? match[1] : '';
}

function extractProblems(html) {
  const pieces = html.split('<div class="problem">').slice(1);
  return pieces.map((piece) => piece.split(/<div class="pager">|<\/body>/)[0]);
}

function extractFirstSqlStatement(sql) {
  const statementIndex = sql.search(/\b(with|select)\b/i);
  if (statementIndex === -1) return '';

  const statement = sql.slice(statementIndex);
  const semicolonIndex = statement.indexOf(';');
  return (semicolonIndex === -1 ? statement : statement.slice(0, semicolonIndex + 1)).trim();
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const STACKOVERFLOW_IDENTIFIER_MAP = [
  ['accepted_answer_id', 'acceptedanswerid'],
  ['last_activity_date', 'lastactivitydate'],
  ['last_editor_user_id', 'lasteditoruserid'],
  ['last_access_date', 'lastaccessdate'],
  ['last_edit_date', 'lasteditdate'],
  ['favorite_count', 'favoritecount'],
  ['comment_count', 'commentcount'],
  ['answer_count', 'answercount'],
  ['bounty_amount', 'bountyamount'],
  ['creation_date', 'creationdate'],
  ['display_name', 'displayname'],
  ['owner_user_id', 'owneruserid'],
  ['post_type_id', 'posttypeid'],
  ['vote_type_id', 'votetypeid'],
  ['view_count', 'viewcount'],
  ['account_id', 'accountid'],
  ['parent_id', 'parentid'],
  ['post_id', 'postid'],
  ['user_id', 'userid'],
  ['tag_based', 'tagbased'],
  ['up_votes', 'upvotes'],
  ['down_votes', 'downvotes'],
  ['about_me', 'aboutme'],
  ['website_url', 'websiteurl']
];

function adaptStackOverflowIdentifiers(value = '') {
  return STACKOVERFLOW_IDENTIFIER_MAP.reduce(
    (current, [from, to]) => current.replace(new RegExp(`\\b${from}\\b`, 'gi'), to),
    value
  );
}

function adaptExerciseToLocalDatabase(exercise) {
  if (exercise.database !== 'stackoverflow') return exercise;

  return {
    ...exercise,
    task: adaptStackOverflowIdentifiers(exercise.task),
    hint: adaptStackOverflowIdentifiers(exercise.hint),
    expectedSql: adaptStackOverflowIdentifiers(exercise.expectedSql),
    solutionNote: adaptStackOverflowIdentifiers(exercise.solutionNote)
  };
}

function parseExercise(piece, moduleInfo, index) {
  const title = stripTags(firstMatch(piece, /<span class="pid">([\s\S]*?)<\/span>/));
  const database = stripTags(firstMatch(piece, /<span class="db">([\s\S]*?)<\/span>/));
  const level = stripTags(firstMatch(piece, /<span class="chip[^"]*">([\s\S]*?)<\/span>/));
  const task = stripTags(firstMatch(piece, /<div class="pbody"><p>([\s\S]*?)<\/p>/));
  const hint = stripTags(firstMatch(piece, /<details class="hint">[\s\S]*?<div class="sbody">([\s\S]*?)<\/div><\/details>/));
  const solutionBody = firstMatch(piece, /<details class="sol">[\s\S]*?<div class="sbody">([\s\S]*?)<\/div><\/details>/);
  const solutionPre = firstMatch(solutionBody, /<pre>([\s\S]*?)<\/pre>/);
  const expectedSql = extractFirstSqlStatement(stripCodeTags(solutionPre));
  const solutionNote = stripTags(solutionBody.replace(/<pre>[\s\S]*?<\/pre>/, ''));
  const checkable = Boolean(expectedSql && database && !/all five|any/i.test(database));

  return adaptExerciseToLocalDatabase({
    id: slug(title || `${moduleInfo.id}-${index + 1}`),
    title,
    moduleId: moduleInfo.id,
    moduleTitle: moduleInfo.title,
    stage: moduleInfo.stage,
    sourceFile: moduleInfo.file,
    database,
    level,
    task,
    hint,
    expectedSql,
    solutionNote,
    checkable
  });
}

function parseModule(rootDir, moduleInfo) {
  const html = fs.readFileSync(path.join(rootDir, moduleInfo.file), 'utf8');
  return extractProblems(html)
    .map((piece, index) => parseExercise(piece, moduleInfo, index))
    .filter((exercise) => exercise.title && exercise.task);
}

function schemaExercise(input) {
  return {
    sourceFile: 'schemas.html',
    moduleId: 'm0',
    moduleTitle: 'Know Your Schemas',
    stage: 'Orient',
    level: 'schema recon',
    hint: 'Use information_schema to inspect tables and columns before you guess at table names.',
    solutionNote: 'Sample answer: schema reconnaissance is the first move in a real SQL interview because it prevents table-name guesses and exposes join keys.',
    checkable: true,
    ...input,
    expectedSql: input.expectedSql.trim()
  };
}

function getSchemaOrientationExercises() {
  return [
    schemaExercise({
      id: 'schema-recon-01',
      title: 'Schema Recon 1',
      database: 'chinook',
      task: 'List every user table available in the Chinook database. Show schema and table name, sorted alphabetically.',
      expectedSql: `
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
ORDER BY table_schema, table_name;
`
    }),
    schemaExercise({
      id: 'schema-recon-02',
      title: 'Schema Recon 2',
      database: 'northwind',
      task: 'Inspect likely order-analysis tables in Northwind. Show table name, column name, and data type for customers, orders, and order_details.',
      expectedSql: `
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'orders', 'order_details')
ORDER BY table_name, ordinal_position;
`
    }),
    schemaExercise({
      id: 'schema-recon-03',
      title: 'Schema Recon 3',
      database: 'stackoverflow',
      task: 'Inspect the StackOverflow posts table. Show column name and data type in table order.',
      expectedSql: `
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'posts'
ORDER BY ordinal_position;
`
    }),
    schemaExercise({
      id: 'schema-recon-04',
      title: 'Schema Recon 4',
      database: 'adventureworks',
      task: 'Map AdventureWorks by schema. Count base tables in each non-system schema.',
      expectedSql: `
SELECT table_schema, COUNT(*)::int AS table_count
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND table_type = 'BASE TABLE'
GROUP BY table_schema
ORDER BY table_schema;
`
    }),
    schemaExercise({
      id: 'schema-recon-05',
      title: 'Schema Recon 5',
      database: 'nyctaxi',
      task: 'Inspect the NYC taxi trips table. Show column name and data type in table order.',
      expectedSql: `
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trips'
ORDER BY ordinal_position;
`
    }),
    schemaExercise({
      id: 'schema-recon-06',
      title: 'Schema Recon 6',
      database: 'chinook',
      task: 'Estimate which Chinook tables are largest. Show table name and PostgreSQL estimated rows, largest first.',
      expectedSql: `
SELECT c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY estimated_rows DESC, table_name;
`
    })
  ];
}

function chunkForSession(exercises, sessionIndex, sessionCount) {
  if (!exercises.length) return [];
  const start = Math.floor((sessionIndex * exercises.length) / sessionCount);
  const end = Math.floor(((sessionIndex + 1) * exercises.length) / sessionCount);
  const chunk = exercises.slice(start, Math.max(end, start + 1));
  return chunk.length ? chunk : [exercises[sessionIndex % exercises.length]];
}

function sessionTitle(moduleInfo, sessionNumber, sessionCount) {
  if (sessionNumber === sessionCount) return `${moduleInfo.title}: review and proof`;
  if (sessionNumber === 1) return `${moduleInfo.title}: first pass`;
  return `${moduleInfo.title}: session ${sessionNumber}`;
}

function buildSessions(exercises) {
  const sessions = [];
  let globalIndex = 0;

  MODULES.forEach((moduleInfo) => {
    const moduleExercises = exercises.filter((exercise) => exercise.moduleId === moduleInfo.id);
    const count = SESSION_COUNTS[moduleInfo.id];

    for (let i = 0; i < count; i += 1) {
      const week = Math.floor(globalIndex / 4) + 1;
      const day = (globalIndex % 4) + 1;
      const sessionExercises = chunkForSession(moduleExercises, i, count);
      sessions.push({
        id: `w${String(week).padStart(2, '0')}-s${String(day).padStart(2, '0')}`,
        sequence: globalIndex + 1,
        week,
        day,
        moduleId: moduleInfo.id,
        moduleTitle: moduleInfo.title,
        stage: moduleInfo.stage,
        title: sessionTitle(moduleInfo, i + 1, count),
        durationMinutes: moduleInfo.id === 'mock' ? 45 : 35,
        type: i === count - 1 ? 'review' : 'lesson',
        goal: sessionExercises.length > 1
          ? `Complete ${sessionExercises.length} graded attempts and repair every miss before moving on.`
          : 'Complete the graded attempt, then rerun it cold before moving on.',
        exerciseIds: sessionExercises.map((exercise) => exercise.id)
      });
      globalIndex += 1;
    }
  });

  return sessions;
}

function buildWeeks(sessions) {
  return WEEK_THEMES.map(([title, outcome], index) => {
    const week = index + 1;
    const weekSessions = sessions.filter((session) => session.week === week);
    return {
      id: `week-${String(week).padStart(2, '0')}`,
      number: week,
      title,
      outcome,
      sessions: weekSessions.map((session) => session.id),
      minutes: weekSessions.reduce((sum, session) => sum + session.durationMinutes, 0)
    };
  });
}

function buildCurriculum(options = {}) {
  const rootDir = options.rootDir || path.join(__dirname, '..');
  const exercises = [
    ...getAcademyExpansionExercises(),
    ...getSchemaOrientationExercises(),
    ...MODULES.flatMap((moduleInfo) => parseModule(rootDir, moduleInfo)),
    ...getInterviewExpansionExercises()
  ].map(adaptExerciseToLocalDatabase);
  const sessions = buildSessions(exercises);
  const weeks = buildWeeks(sessions);
  const checkableExercises = exercises.filter((exercise) => exercise.checkable).length;

  return {
    product: {
      name: 'SQL Mastery Path',
      promise: 'A 36-week zero-to-senior SQL academy built on your real PostgreSQL databases.',
      cadence: '4 sessions per week, 35-50 minutes per session'
    },
    weeks,
    sessions,
    exercises,
    stats: {
      totalWeeks: weeks.length,
      totalSessions: sessions.length,
      totalExercises: exercises.length,
      checkableExercises,
      estimatedAttempts: exercises.length * 3,
      totalMinutes: sessions.reduce((sum, session) => sum + session.durationMinutes, 0)
    }
  };
}

module.exports = {
  buildCurriculum
};
