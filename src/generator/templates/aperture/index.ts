import type {
  Template,
  ConceptMeta,
  PhaseMeta,
  CheckpointMeta,
  ScaffoldPlan,
  GateHints
} from '../../types';
import { numericCols, textCols } from '../../schema-catalog';

const PLAN: ScaffoldPlan = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' };

function gate(minRows: number, minDistinct: number, orderMatters: boolean): GateHints {
  return { minRows, minDistinct, rowCeiling: 200, orderMatters, boundedSlice: false };
}

export const APERTURE_SKILLS: string[] = [
  'ap-select-all',
  'ap-select-columns',
  'ap-order-by',
  'ap-limit-topn',
  'ap-distinct',
  'ap-where-comparison',
  'ap-where-boolean-logic',
  'ap-where-between-in',
  'ap-where-like',
  'ap-null-handling',
  'ap-computed-columns',
  'ap-column-alias',
  'ap-aggregate-scalar',
  'ap-group-by',
  'ap-having',
  'ap-group-by-sort-top',
  'ap-join-intro'
];

export const APERTURE_PHASES: PhaseMeta[] = [
  { id: 'ap-basics', title: 'Reading a table', goal: 'Select columns, sort rows, limit results, and remove duplicates.', level: 'beginner', order: 1 },
  { id: 'ap-filtering', title: 'Filtering rows', goal: 'Use WHERE with comparisons, logic, ranges, text patterns, and missing values.', level: 'beginner', order: 2 },
  { id: 'ap-shaping', title: 'Shaping output', goal: 'Compute new values and rename result columns.', level: 'beginner', order: 3 },
  { id: 'ap-aggregation', title: 'Summarising rows', goal: 'Collapse rows with aggregate functions, groups, group filters, and grouped top-N results.', level: 'beginner', order: 4 },
  { id: 'ap-join', title: 'A first join', goal: 'Combine planets with their host stars using an inner join.', level: 'beginner', order: 5 }
];

export const APERTURE_CHECKPOINTS: CheckpointMeta[] = [
  { id: 'cpA', phaseId: 'ap-basics', afterOrder: 5, title: 'Checkpoint A: reading a table', drawFromSkills: ['ap-select-all', 'ap-select-columns', 'ap-order-by', 'ap-limit-topn', 'ap-distinct'] },
  { id: 'cpB', phaseId: 'ap-filtering', afterOrder: 5, title: 'Checkpoint B: filtering rows', drawFromSkills: ['ap-where-comparison', 'ap-where-boolean-logic', 'ap-where-between-in', 'ap-where-like', 'ap-null-handling'] },
  { id: 'cpC', phaseId: 'ap-shaping', afterOrder: 2, title: 'Checkpoint C: shaping output', drawFromSkills: ['ap-computed-columns', 'ap-column-alias'] },
  { id: 'cpD', phaseId: 'ap-aggregation', afterOrder: 4, title: 'Checkpoint D: summarising rows', drawFromSkills: ['ap-aggregate-scalar', 'ap-group-by', 'ap-having', 'ap-group-by-sort-top'] },
  { id: 'cpE', phaseId: 'ap-join', afterOrder: 1, title: 'Checkpoint E: aperture capstone', drawFromSkills: APERTURE_SKILLS }
];

export const APERTURE_CONCEPT_META: ConceptMeta[] = [
  {
    skill: 'ap-select-all',
    phaseId: 'ap-basics',
    order: 1,
    title: 'Select every column',
    teach: {
      plain: 'SELECT * returns every column from every row in a table.',
      mentalModel: 'Think of the table as a spreadsheet; SELECT * hands you the whole sheet.',
      example: { sql: 'SELECT * FROM stars', note: 'The star means all columns.' },
      whyWhen: 'Use SELECT * for a quick peek at an unfamiliar table; in real reports you name the columns you need so results stay small and predictable.',
      watchOut: 'SELECT * pulls every column and its column order can shift if the table changes, so avoid it in saved queries and reports; list the columns once you know which you want.',
      interviewNote: 'Interviewers expect you to know SELECT * is fine for exploring but rarely what you ship, so be ready to say why you would name columns instead.'
    }
  },
  {
    skill: 'ap-select-columns',
    phaseId: 'ap-basics',
    order: 2,
    title: 'Pick specific columns',
    teach: {
      plain: 'List column names after SELECT to choose exactly which output columns you want.',
      mentalModel: 'You keep a few spreadsheet columns and leave the rest behind.',
      example: { sql: 'SELECT planet_name, planet_type FROM planets', note: 'The result has those two columns in that order.' },
      whyWhen: 'This is the everyday default: pick just planet_name and planet_type instead of dragging every column along.',
      watchOut: 'Forgetting the comma is the classic slip: SELECT planet_name planet_type reads planet_type as an alias for planet_name, not two columns, so always comma-separate your columns.',
      interviewNote: 'Interviewers watch whether you select only the columns the question asks for; pulling extras reads as careless.'
    }
  },
  {
    skill: 'ap-order-by',
    phaseId: 'ap-basics',
    order: 3,
    title: 'Order the rows',
    teach: {
      plain: 'ORDER BY sorts the result by one or more values.',
      mentalModel: 'The same rows are stacked into a predictable order before you read them.',
      example: { sql: 'SELECT star_name, temperature_k FROM stars ORDER BY temperature_k', note: 'Ascending is the default sort direction.' },
      whyWhen: 'Reach for ORDER BY whenever the reader needs a meaningful sequence, like hottest stars first, instead of the arbitrary order the database happens to return.',
      watchOut: 'ORDER BY sorts ascending by default, so add DESC for largest-first; and when the sort column has ties, add a second key like star_id so tied rows do not shuffle between runs.',
      interviewNote: 'Interviewers commonly ask you to sort by one column and break ties with another (for example temperature_k then star_id), and check that you name that tiebreaker.'
    }
  },
  {
    skill: 'ap-limit-topn',
    phaseId: 'ap-basics',
    order: 4,
    title: 'Take the top N',
    teach: {
      plain: 'LIMIT keeps only the first N rows after the query has been ordered.',
      mentalModel: 'Sort the pile first, then slice off the first few rows.',
      example: { sql: 'SELECT planet_name, mass_earth FROM planets ORDER BY mass_earth DESC LIMIT 5', note: 'The ORDER BY defines what top means.' },
      whyWhen: 'LIMIT answers top-N questions like the five most massive planets, and keeps exploratory queries fast by returning just a small sample.',
      watchOut: 'LIMIT with no ORDER BY returns arbitrary rows, not the top ones, so always ORDER BY (with a tiebreaker) first to define what top actually means.',
      interviewNote: 'The classic ask is top 5 by X; interviewers check that you pair ORDER BY ... DESC with LIMIT and handle ties so the result is repeatable.'
    }
  },
  {
    skill: 'ap-distinct',
    phaseId: 'ap-basics',
    order: 5,
    title: 'Remove duplicates',
    teach: {
      plain: 'DISTINCT collapses repeated result rows so each value combination appears once.',
      mentalModel: 'A repeated list becomes one copy of each unique row.',
      example: { sql: 'SELECT DISTINCT planet_type FROM planets', note: 'One row appears for each planet type.' },
      whyWhen: 'Use DISTINCT to get the unique values in a column, like every planet_type present, or to collapse fully repeated rows.',
      watchOut: 'DISTINCT dedupes the whole row, not just the first column, so adding another column can make the duplicates reappear because the combination is now unique.',
      interviewNote: 'Interviewers may ask for a count of unique values, so know COUNT(DISTINCT planet_type) and that DISTINCT applies across every selected column.'
    }
  },
  {
    skill: 'ap-where-comparison',
    phaseId: 'ap-filtering',
    order: 1,
    title: 'Filter with a comparison',
    teach: {
      plain: 'WHERE keeps only rows where a comparison is true.',
      mentalModel: 'Each row approaches a gate; only rows passing the test continue.',
      example: { sql: 'SELECT star_name FROM stars WHERE temperature_k > 6000', note: 'Only hotter stars pass.' },
      whyWhen: 'WHERE answers the only the rows that... questions; it trims the table to the rows worth reporting on before the rest of the query runs.',
      watchOut: "Text values need single quotes, like planet_type = 'Terrestrial'; double quotes mean a column name in Postgres and will error.",
      interviewNote: 'Interviewers check that you filter with WHERE using =, <>, >, and < and quote text correctly, since these comparisons underpin every harder query.'
    }
  },
  {
    skill: 'ap-where-boolean-logic',
    phaseId: 'ap-filtering',
    order: 2,
    title: 'Combine conditions',
    teach: {
      plain: 'AND requires every condition; OR allows any listed condition.',
      mentalModel: 'AND narrows the funnel, while OR widens it.',
      example: { sql: "SELECT planet_name FROM planets WHERE in_habitable_zone = true AND planet_type = 'Terrestrial'", note: 'Both conditions must be true.' },
      whyWhen: 'Combine conditions when one filter is not enough, like habitable planets that are also Terrestrial (AND), or planets of either of two types (OR).',
      watchOut: "AND binds tighter than OR, so in_habitable_zone = true OR planet_type = 'Terrestrial' AND discovery_year = 2013 quietly groups the AND first; wrap the OR group in parentheses to get the rows you intend.",
      interviewNote: 'A favorite trap is mixing AND and OR without parentheses; interviewers check that you group them so the query means what the question asks.'
    }
  },
  {
    skill: 'ap-where-between-in',
    phaseId: 'ap-filtering',
    order: 3,
    title: 'Ranges and lists',
    teach: {
      plain: 'BETWEEN checks a range and IN checks whether a value is in a list.',
      mentalModel: 'BETWEEN is a number-line band; IN is a checklist.',
      example: { sql: 'SELECT planet_name FROM planets WHERE discovery_year IN (2012, 2013)', note: 'The row passes if its year is in the list.' },
      whyWhen: 'BETWEEN is the clean way to ask for a numeric range like a span of discovery years, and IN replaces a stack of OR-equals for a set of values.',
      watchOut: 'BETWEEN includes both endpoints, so discovery_year BETWEEN 2012 AND 2014 also returns 2012 and 2014; and you cannot write discovery_year = 2012 OR 2013, you must use IN (2012, 2013).',
      interviewNote: 'Interviewers check that you know BETWEEN is inclusive of both ends and that IN is the readable replacement for many OR conditions.'
    }
  },
  {
    skill: 'ap-where-like',
    phaseId: 'ap-filtering',
    order: 4,
    title: 'Match text patterns',
    teach: {
      plain: 'LIKE matches text against a pattern; percent means any run of characters.',
      mentalModel: 'A wildcard pattern is a stencil laid over a string.',
      example: { sql: "SELECT star_name FROM stars WHERE star_name LIKE 'Kepler%'", note: 'The pattern matches names that start with Kepler.' },
      whyWhen: 'LIKE finds text by shape when you do not know the exact value, like every star_name that starts with Kepler.',
      watchOut: "LIKE is case-sensitive in Postgres, so 'kepler%' misses 'Kepler-22'; use ILIKE for case-insensitive matching, and remember % means any run of characters while _ means exactly one.",
      interviewNote: 'Expect to build a pattern with % and _ and to explain LIKE versus ILIKE for case; a common ask is names containing a word, written %word%.'
    }
  },
  {
    skill: 'ap-null-handling',
    phaseId: 'ap-filtering',
    order: 5,
    title: 'Handle missing values',
    teach: {
      plain: 'NULL means unknown, so test it with IS NULL or IS NOT NULL.',
      mentalModel: 'A blank cell cannot equal anything; you can only ask whether it is blank.',
      example: { sql: 'SELECT planet_name FROM planets WHERE equilibrium_temp_k IS NULL', note: 'This finds rows with a missing temperature.' },
      whyWhen: 'You need NULL logic whenever a column can be empty, like planets with no recorded equilibrium_temp_k; it is the basis of every which rows have no value question.',
      watchOut: 'Writing equilibrium_temp_k = NULL matches nothing, because any comparison with NULL is UNKNOWN rather than true; use IS NULL or IS NOT NULL instead.',
      interviewNote: 'The classic probe is find the rows with no X (IS NULL) and knowing that = NULL silently returns zero rows; it is one of the most tested beginner filters.'
    }
  },
  {
    skill: 'ap-computed-columns',
    phaseId: 'ap-shaping',
    order: 1,
    title: 'Compute new columns',
    teach: {
      plain: 'A SELECT list can include arithmetic expressions that create derived values.',
      mentalModel: 'It is like adding a formula column to the result.',
      example: { sql: 'SELECT planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets', note: 'The expression is evaluated for each row.' },
      whyWhen: 'Compute a column when the number you need is not stored, like orbital_period_days / 365.0 for years or radius_earth * 6371 for kilometers.',
      watchOut: 'Any arithmetic involving a NULL produces NULL, so equilibrium_temp_k - 273.15 is blank for planets with no recorded temperature; the row still appears but that computed cell is empty.',
      interviewNote: 'Interviewers check that you can derive a value inline and give it a clear alias, and may ask for a unit conversion or a simple per-unit ratio.'
    }
  },
  {
    skill: 'ap-column-alias',
    phaseId: 'ap-shaping',
    order: 2,
    title: 'Rename output columns',
    teach: {
      plain: 'AS gives a result column a friendly output name.',
      mentalModel: 'The alias is a name tag on the result, not a table change.',
      example: { sql: 'SELECT distance_ly AS light_years FROM stars', note: 'The result column is named light_years.' },
      whyWhen: 'Alias a column to give the reader a clean header, especially for computed columns that would otherwise show the raw expression as their name.',
      watchOut: 'An alias only labels the output, so WHERE cannot use it (WHERE light_years > 10 errors) because WHERE runs before the alias exists; filter on the original column, though ORDER BY, which runs later, can use the alias.',
      interviewNote: 'Interviewers expect readable aliases like avg_mass rather than col1, and may ask why WHERE cannot reference an alias while ORDER BY can.'
    }
  },
  {
    skill: 'ap-aggregate-scalar',
    phaseId: 'ap-aggregation',
    order: 1,
    title: 'Summarise to one row',
    teach: {
      plain: 'Aggregate functions such as COUNT and AVG collapse many rows into one summary row.',
      mentalModel: 'A column of rows goes into a funnel and one summary number comes out.',
      example: { sql: 'SELECT COUNT(*) AS planet_count, AVG(mass_earth) AS avg_mass FROM planets', note: 'Without GROUP BY, the table becomes one summary row.' },
      whyWhen: 'Aggregates answer how many or what is the average over a whole table in a single row; reach for them when you want a summary, not the individual rows.',
      watchOut: 'COUNT(*) counts every row, but COUNT(mass_solar) and AVG(mass_solar) skip NULLs, so an average can quietly ignore missing values; pick the one the question actually wants.',
      interviewNote: 'Interviewers often ask for a ratio or rate and watch that you avoid integer division (write / 2.0, not / 2) and that you know COUNT(*) versus COUNT(column).'
    }
  },
  {
    skill: 'ap-group-by',
    phaseId: 'ap-aggregation',
    order: 2,
    title: 'Group and count',
    teach: {
      plain: 'GROUP BY splits rows into buckets and aggregates each bucket separately.',
      mentalModel: 'Sort rows into jars by label, then count each jar.',
      example: { sql: 'SELECT planet_type, COUNT(*) AS n FROM planets GROUP BY planet_type', note: 'There is one output row per planet_type.' },
      whyWhen: 'GROUP BY answers per-category questions, like how many planets of each planet_type; it is the workhorse behind almost every analytics breakdown.',
      watchOut: 'Every non-aggregated column in SELECT must also appear in GROUP BY or Postgres errors, so if you select planet_type you must GROUP BY planet_type.',
      interviewNote: 'Interviewers test grouping granularity (count per X, or a metric per X per Y); the columns you group by define exactly one output row each.'
    }
  },
  {
    skill: 'ap-having',
    phaseId: 'ap-aggregation',
    order: 3,
    title: 'Filter groups',
    teach: {
      plain: 'HAVING filters after GROUP BY has built aggregate rows.',
      mentalModel: 'WHERE filters raw rows; HAVING filters finished buckets.',
      example: { sql: 'SELECT planet_type, COUNT(*) AS n FROM planets GROUP BY planet_type HAVING COUNT(*) > 2', note: 'Only groups with more than two rows remain.' },
      whyWhen: 'HAVING filters the grouped results, like keeping only planet types with more than two planets; it is how you filter on a COUNT or an AVG.',
      watchOut: 'Put raw-row conditions in WHERE (it runs before grouping) and aggregate conditions in HAVING (it runs after); you cannot filter on COUNT(*) in WHERE.',
      interviewNote: 'The classic probe is WHERE versus HAVING; interviewers check that you filter rows with WHERE first, then filter groups with HAVING on the aggregate.'
    }
  },
  {
    skill: 'ap-group-by-sort-top',
    phaseId: 'ap-aggregation',
    order: 4,
    title: 'Rank grouped results',
    teach: {
      plain: 'Grouped LIMIT queries aggregate, sort the groups, then keep a bounded slice.',
      mentalModel: 'Count each bucket, arrange the bucket labels, and keep the first few.',
      example: { sql: 'SELECT discovery_method, COUNT(*) AS n FROM planets GROUP BY discovery_method ORDER BY discovery_method LIMIT 3', note: 'The sorted group labels decide which rows appear first.' },
      whyWhen: 'This is the top-categories pattern, like the three most common discovery_method values: group the rows, sort by the count, then keep the top few.',
      watchOut: 'Sort by the aggregate (ORDER BY n DESC) before LIMIT, or you keep an arbitrary slice instead of the biggest groups; add a tiebreaker so the ranking is stable.',
      interviewNote: 'A very common ask is top 3 categories by count; interviewers check that you combine GROUP BY, ORDER BY the aggregate DESC, and LIMIT correctly.'
    }
  },
  {
    skill: 'ap-join-intro',
    phaseId: 'ap-join',
    order: 1,
    title: 'Join two tables',
    teach: {
      plain: 'A JOIN combines related rows from two tables using matching key columns.',
      mentalModel: 'Each planet row looks up the star row with the same star_id.',
      example: { sql: 'SELECT planets.planet_name, stars.star_name FROM planets JOIN stars ON planets.star_id = stars.star_id', note: 'The ON clause explains how the tables match.' },
      whyWhen: 'Reach for a JOIN when the answer needs columns from two tables at once, like a planet_name from planets and its host star_name from stars, linked by star_id.',
      watchOut: 'An INNER JOIN silently drops rows with no match, so a planet whose star_id is not in stars just disappears; use LEFT JOIN when you need every planet, and suspect a NULL or mismatched key when a count looks low.',
      interviewNote: 'Interviewers probe INNER versus LEFT (customers who never ordered needs LEFT) and watch for fan-out, where a one-to-many join multiplies rows and inflates COUNT and SUM.'
    }
  }
];

export const APERTURE_TEMPLATES: Template[] = [
  {
    skill: 'ap-select-all',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT * FROM stars',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => ['star_id', 'temperature_k', 'mass_solar', 'radius_solar', 'distance_ly'].includes(value) }],
    phrasings: [
      'Show every stars column (star_id, star_name, spectral_type, temperature_k, mass_solar, radius_solar, distance_ly), ordered by {sortKey} and then star_id.',
      'Return star_id, star_name, spectral_type, temperature_k, mass_solar, radius_solar, and distance_ly from stars, ordered by {sortKey} with star_id as the tie-breaker.'
    ],
    hintTemplate: 'SELECT * returns every column, so type * where the blank is.',
    scaffoldPlan: PLAN,
    scaffoldFocus: 'projection',
    gateHints: gate(2, 1, true)
  },
  {
    skill: 'ap-select-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, planet_type FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => ['planet_id', 'star_id', 'mass_earth', 'radius_earth', 'orbital_period_days'].includes(value) }],
    phrasings: [
      'Show planet_id, planet_name, and planet_type from planets, ordered by {sortKey} and then planet_id.',
      'Return planet_id with each planet_name and planet_type, ordered by {sortKey} with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'Put the exact columns you need after SELECT, separated by commas.',
    scaffoldPlan: PLAN,
    scaffoldFocus: 'projection',
    gateHints: gate(2, 2, true)
  },
  {
    skill: 'ap-order-by',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT star_id, star_name, temperature_k FROM stars',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string, catalog: any) => numericCols(catalog, 'stars').some((column) => column.name === value) }],
    phrasings: [
      'List star_id, star_name, and temperature_k, ordered by {sortKey} and then star_id.',
      'Return star_id, star_name, and temperature_k from stars in {sortKey} order, tied by star_id.'
    ],
    hintTemplate: 'The template projects star_name and temperature_k; the emitted query adds the deterministic sort.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 2, true)
  },
  {
    skill: 'ap-limit-topn',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, mass_earth FROM planets LIMIT {topN}',
    slots: [
      { name: 'topN', kind: 'limit' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => ['mass_earth', 'radius_earth'].includes(value) }],
    phrasings: [
      'Show the first {topN} planet_id, planet_name, and mass_earth rows after ordering by {sortKey} and then planet_id.',
      'Return {topN} rows with planet_id, planet_name, and mass_earth from planets, ordered by {sortKey} with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'LIMIT {topN} keeps only the first {topN} rows of the ordered result.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-distinct',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT DISTINCT {sortKey} FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string, catalog: any) => textCols(catalog, 'planets').some((column) => column.name === value) }],
    phrasings: [
      'List every distinct {sortKey} value in planets, ordered by {sortKey}.',
      'Show each unique {sortKey} from planets once, ordered by {sortKey}.'
    ],
    hintTemplate: 'SELECT DISTINCT keeps one row for each unique {sortKey}.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 2, true)
  },
  {
    skill: 'ap-distinct',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT DISTINCT {sortKey} FROM stars',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string, catalog: any) => textCols(catalog, 'stars').some((column) => column.name === value) }],
    phrasings: [
      'List every distinct {sortKey} value in stars, ordered by {sortKey}.',
      'Show each unique {sortKey} from stars once, ordered by {sortKey}.'
    ],
    hintTemplate: 'SELECT DISTINCT keeps one row for each unique {sortKey}.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 2, true)
  },
  {
    skill: 'ap-where-comparison',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT star_id, star_name, temperature_k FROM stars WHERE temperature_k = {temp}',
    slots: [
      { name: 'temp', kind: 'literal', op: '=', col: 'temperature_k', table: 'stars' },
      { name: 'sortKey', kind: 'sortKey', table: 'stars' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'star_id' }],
    phrasings: [
      'List star_id, star_name, and temperature_k for stars where temperature_k equals {temp}, ordered by star_id.',
      'Return star_id, star_name, and temperature_k for stars matching temperature_k = {temp}, ordered by star_id.'
    ],
    hintTemplate: 'Put the comparison in WHERE: temperature_k = {temp}.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 2, true)
  },
  {
    skill: 'ap-where-boolean-logic',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: "SELECT planet_id, planet_name, in_habitable_zone, planet_type FROM planets WHERE in_habitable_zone = {habitable} AND planet_type = '{ptype}'",
    slots: [
      { name: 'habitable', kind: 'literal', op: '=', col: 'in_habitable_zone', table: 'planets', sampleStrategy: 'compound-row' },
      { name: 'ptype', kind: 'literal', op: '=', col: 'planet_type', table: 'planets', sampleStrategy: 'compound-row' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'List planet_id, planet_name, in_habitable_zone, and planet_type where in_habitable_zone is {habitable} and planet_type is {ptype}, ordered by planet_id.',
      'Return planet_id, planet_name, in_habitable_zone, and planet_type for rows where in_habitable_zone = {habitable} and planet_type equals {ptype}, ordered by planet_id.'
    ],
    hintTemplate: 'AND means both WHERE conditions must be true for the same row.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-where-boolean-logic',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, in_habitable_zone, equilibrium_temp_k FROM planets WHERE in_habitable_zone = true OR equilibrium_temp_k IS NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'List planet_id, planet_name, in_habitable_zone, and equilibrium_temp_k where in_habitable_zone is true or equilibrium_temp_k is NULL, ordered by planet_id.',
      'Return planet_id, planet_name, in_habitable_zone, and equilibrium_temp_k for rows where in_habitable_zone = true or equilibrium_temp_k is missing (NULL), ordered by planet_id.'
    ],
    hintTemplate: 'OR keeps a row when either condition is true.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-where-between-in',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, discovery_year FROM planets WHERE discovery_year IN ({year})',
    slots: [
      { name: 'year', kind: 'literal', op: 'IN', col: 'discovery_year', table: 'planets' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'List planet_id, planet_name, and discovery_year where discovery_year is IN ({year}), ordered by planet_id.',
      'Return planet_id, planet_name, and discovery_year for discovery_year IN ({year}), ordered by planet_id.'
    ],
    hintTemplate: 'IN checks whether discovery_year appears inside the parenthesized list.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-where-like',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: "SELECT star_id, star_name FROM stars WHERE star_name LIKE '{namePattern}%'",
    slots: [
      { name: 'namePattern', kind: 'literal', op: 'LIKE', col: 'star_name', table: 'stars' },
      { name: 'sortKey', kind: 'sortKey', table: 'stars' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'star_id' }],
    phrasings: [
      'List star_id and star_name where star_name LIKE {namePattern}%, ordered by star_id.',
      'Return star_id and star_name for stars whose star_name matches {namePattern}%, ordered by star_id.'
    ],
    hintTemplate: 'LIKE compares star_name against the text pattern {namePattern}%.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-null-handling',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, equilibrium_temp_k FROM planets WHERE equilibrium_temp_k IS NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'List planet_id, planet_name, and equilibrium_temp_k where equilibrium_temp_k is NULL, ordered by planet_id.',
      'Return planet_id, planet_name, and equilibrium_temp_k for rows with missing equilibrium_temp_k, ordered by planet_id.'
    ],
    hintTemplate: 'Use IS NULL to find missing values.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-null-handling',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, equilibrium_temp_k FROM planets WHERE equilibrium_temp_k IS NOT NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'equilibrium_temp_k' }],
    phrasings: [
      'List planet_id, planet_name, and equilibrium_temp_k where equilibrium_temp_k is not NULL, ordered by equilibrium_temp_k and then planet_id.',
      'Return planet_id, planet_name, and equilibrium_temp_k for rows with present equilibrium_temp_k, ordered by equilibrium_temp_k with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'Use IS NOT NULL to keep rows where equilibrium_temp_k is present.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-null-handling',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, semi_major_axis_au FROM planets WHERE semi_major_axis_au IS NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'semi_major_axis_au' }],
    phrasings: [
      'List planet_id, planet_name, and semi_major_axis_au where semi_major_axis_au is NULL, ordered by semi_major_axis_au and then planet_id.',
      'Return planet_id, planet_name, and semi_major_axis_au for rows with missing semi_major_axis_au, ordered by semi_major_axis_au with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'Use IS NULL rather than = NULL.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-null-handling',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, semi_major_axis_au FROM planets WHERE semi_major_axis_au IS NOT NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'semi_major_axis_au' }],
    phrasings: [
      'List planet_id, planet_name, and semi_major_axis_au where semi_major_axis_au is not NULL, ordered by semi_major_axis_au and then planet_id.',
      'Return planet_id, planet_name, and semi_major_axis_au for rows with present semi_major_axis_au, ordered by semi_major_axis_au with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'IS NOT NULL checks whether the value is present.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-null-handling',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT star_id, star_name, radius_solar FROM stars WHERE radius_solar IS NULL',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'radius_solar' }],
    phrasings: [
      'List star_id, star_name, and radius_solar where radius_solar is NULL, ordered by radius_solar and then star_id.',
      'Return star_id, star_name, and radius_solar for rows with missing radius_solar, ordered by radius_solar with star_id as the tie-breaker.'
    ],
    hintTemplate: 'Use IS NULL to test for missing star radius values.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Compute orbital_years as orbital_period_days / 365.0 and show planet_id, planet_name, and orbital_years, ordered by planet_id.',
      'Show planet_id, planet_name, and orbital_years (orbital_period_days / 365.0) from planets, ordered by planet_id.'
    ],
    hintTemplate: 'Put orbital_period_days / 365.0 in the SELECT list and name it with AS.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, radius_earth * 6371 AS radius_km FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'radius_earth' }],
    phrasings: [
      'Compute radius_km as radius_earth * 6371 and show planet_id, planet_name, and radius_km, ordered by radius_earth and then planet_id.',
      'Show planet_id, planet_name, and radius_km (radius_earth * 6371) from planets, ordered by radius_earth with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'Put radius_earth * 6371 in the SELECT list and name it with AS.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, semi_major_axis_au * 149597870.7 AS axis_km FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'semi_major_axis_au' }],
    phrasings: [
      'Compute axis_km as semi_major_axis_au * 149597870.7 and show planet_id, planet_name, and axis_km, ordered by semi_major_axis_au and then planet_id.',
      'Show planet_id, planet_name, and axis_km (semi_major_axis_au * 149597870.7) from planets, ordered by semi_major_axis_au with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'A computed column can multiply a stored value by a constant.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, equilibrium_temp_k - 273.15 AS temp_c FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'equilibrium_temp_k' }],
    phrasings: [
      'Compute temp_c as equilibrium_temp_k - 273.15 and show planet_id, planet_name, and temp_c, ordered by equilibrium_temp_k and then planet_id.',
      'Show planet_id, planet_name, and temp_c (equilibrium_temp_k - 273.15) from planets, ordered by equilibrium_temp_k with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'A computed column can subtract a constant from a stored value.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, mass_earth / radius_earth AS mass_per_radius FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'mass_earth' }],
    phrasings: [
      'Compute mass_per_radius as mass_earth / radius_earth and show planet_id, planet_name, and mass_per_radius, ordered by mass_earth and then planet_id.',
      'Show planet_id, planet_name, and mass_per_radius (mass_earth / radius_earth) from planets, ordered by mass_earth with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'A computed column can divide one numeric column by another.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-column-alias',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT star_id, star_name AS name, distance_ly AS light_years FROM stars',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'star_id' }],
    phrasings: [
      'Return star_id, name, and light_years from stars, ordered by star_id.',
      'Alias star_name as name and distance_ly as light_years, with star_id, ordered by star_id.'
    ],
    hintTemplate: 'AS changes the output header for a column.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-column-alias',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'stars',
    sqlShape: 'SELECT star_id, spectral_type AS star_class, temperature_k AS kelvin FROM stars',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'stars' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'temperature_k' }],
    phrasings: [
      'Return star_id, star_class, and kelvin from stars, ordered by temperature_k and then star_id.',
      'Alias spectral_type as star_class and temperature_k as kelvin, with star_id, ordered by temperature_k with star_id as the tie-breaker.'
    ],
    hintTemplate: 'AS gives the output column a new name.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-column-alias',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name AS name, planet_type AS type FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Return planet_id, name, and type from planets, ordered by planet_id.',
      'Alias planet_name as name and planet_type as type, with planet_id, ordered by planet_id.'
    ],
    hintTemplate: 'AS changes the column headers in the result.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-column-alias',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, mass_earth AS earth_masses, radius_earth AS earth_radii FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'mass_earth' }],
    phrasings: [
      'Return planet_id, earth_masses, and earth_radii from planets, ordered by mass_earth and then planet_id.',
      'Alias mass_earth as earth_masses and radius_earth as earth_radii, with planet_id, ordered by mass_earth with planet_id as the tie-breaker.'
    ],
    hintTemplate: 'The alias is the output name, not a table change.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-column-alias',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'facility',
    sqlShape: 'SELECT facility_id, name AS facility_name FROM facility',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'facility' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'facility_id' }],
    phrasings: [
      'Return facility_id and facility_name from facility, ordered by facility_id.',
      'Alias name as facility_name, with facility_id, ordered by facility_id.'
    ],
    hintTemplate: 'Use AS to rename name as facility_name.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-aggregate-scalar',
    database: 'aperture',
    family: 'aggregate-scalar',
    primaryTable: 'planets',
    sqlShape: 'SELECT COUNT(*) AS planet_count, AVG({metric}) AS avg_value FROM planets',
    slots: [{ name: 'metric', kind: 'column', table: 'planets' }],
    bindingRules: [{ slot: 'metric', predicate: (value: string) => ['mass_earth', 'radius_earth', 'orbital_period_days', 'semi_major_axis_au', 'equilibrium_temp_k'].includes(value) }],
    phrasings: [
      'Return planet_count and avg_value by averaging {metric} for all planets, ordered by planet_count.',
      'Count all planets as planet_count and show the average {metric} as avg_value, ordered by planet_count.'
    ],
    hintTemplate: 'With no GROUP BY, COUNT and AVG({metric}) summarize the whole table into one row.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, false)
  },
  {
    skill: 'ap-group-by',
    database: 'aperture',
    family: 'grouped',
    primaryTable: 'planets',
    sqlShape: 'SELECT {groupCols}, COUNT(*) AS n FROM planets GROUP BY {groupCols}',
    slots: [{ name: 'groupCols', kind: 'groupCols', table: 'planets' }],
    bindingRules: [{ slot: 'groupCols', predicate: (value: string) => ['planet_type', 'discovery_method', 'discovery_year', 'facility_id', 'in_habitable_zone'].includes(value) }],
    phrasings: [
      'Return {groupCols} and n by counting planets for each {groupCols}, ordered by {groupCols}.',
      'Count planets into n for each {groupCols} value, returning {groupCols} and n ordered by {groupCols}.'
    ],
    hintTemplate: 'GROUP BY {groupCols} creates one bucket per value, then COUNT(*) counts the bucket.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 2, false)
  },
  {
    skill: 'ap-having',
    database: 'aperture',
    family: 'grouped',
    primaryTable: 'planets',
    sqlShape: 'SELECT {groupCols}, COUNT(*) AS n FROM planets GROUP BY {groupCols} HAVING COUNT(*) >= 1',
    slots: [{ name: 'groupCols', kind: 'groupCols', table: 'planets' }],
    bindingRules: [{ slot: 'groupCols', predicate: (value: string) => ['planet_type', 'discovery_method', 'discovery_year', 'facility_id', 'in_habitable_zone'].includes(value) }],
    phrasings: [
      'Return {groupCols} and n for groups with COUNT(*) at least 1, ordered by {groupCols}.',
      'Group planets by {groupCols}, keep groups with COUNT(*) >= 1, and return {groupCols} and n ordered by {groupCols}.'
    ],
    hintTemplate: 'HAVING filters aggregate groups after GROUP BY.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, false)
  },
  {
    skill: 'ap-group-by-sort-top',
    database: 'aperture',
    family: 'grouped',
    primaryTable: 'planets',
    sqlShape: 'SELECT {groupCols}, COUNT(*) AS n FROM planets GROUP BY {groupCols} LIMIT {topN}',
    slots: [
      { name: 'groupCols', kind: 'groupCols', table: 'planets' },
      { name: 'topN', kind: 'limit' }
    ],
    bindingRules: [{ slot: 'groupCols', predicate: (value: string) => ['planet_type', 'discovery_method'].includes(value) }],
    phrasings: [
      'Return the first {topN} grouped rows with {groupCols} and n, ordered by {groupCols}.',
      'Show {topN} {groupCols} groups with n, ordered by {groupCols}.'
    ],
    hintTemplate: 'Group first, then keep only {topN} grouped rows.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-join-intro',
    database: 'aperture',
    family: 'join',
    primaryTable: 'planets',
    sqlShape: 'SELECT planets.planet_id, planets.planet_name, stars.star_name FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE planets.in_habitable_zone = {habitable}',
    slots: [
      { name: 'habitable', kind: 'literal', op: '=', col: 'in_habitable_zone', table: 'planets' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Join planets to stars and list planet_id, planet_name, and star_name where in_habitable_zone is {habitable}, ordered by planet_id.',
      'Return planet_id, planet_name, and star_name for joined rows where in_habitable_zone = {habitable}, ordered by planet_id.'
    ],
    hintTemplate: 'Join on planets.star_id = stars.star_id to attach each planet to its host star.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-join-intro',
    database: 'aperture',
    family: 'join',
    primaryTable: 'planets',
    sqlShape: 'SELECT planets.planet_id, planets.planet_name, stars.star_name, stars.spectral_type, planets.discovery_year FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE planets.discovery_year = {year}',
    slots: [
      { name: 'year', kind: 'literal', op: '=', col: 'discovery_year', table: 'planets' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Join planets to stars and list planet_id, planet_name, star_name, spectral_type, and discovery_year where discovery_year is {year}, ordered by planet_id.',
      'Return planet_id, planet_name, star_name, spectral_type, and discovery_year for joined rows with discovery_year {year}, ordered by planet_id.'
    ],
    hintTemplate: 'Join on planets.star_id = stars.star_id, then filter the planet discovery_year.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-join-intro',
    database: 'aperture',
    family: 'join',
    primaryTable: 'planets',
    sqlShape: "SELECT planets.planet_id, planets.planet_name, stars.star_name, planets.planet_type FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE planets.planet_type = '{ptype}'",
    slots: [
      { name: 'ptype', kind: 'literal', op: '=', col: 'planet_type', table: 'planets' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Join planets to stars and list planet_id, planet_name, star_name, and planet_type where planet_type is {ptype}, ordered by planet_id.',
      'Return planet_id, planet_name, star_name, and planet_type for joined rows with planet_type {ptype}, ordered by planet_id.'
    ],
    hintTemplate: 'The join attaches star_name before the WHERE filter keeps matching planet rows.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  },
  {
    skill: 'ap-join-intro',
    database: 'aperture',
    family: 'join',
    primaryTable: 'planets',
    sqlShape: "SELECT planets.planet_id, planets.planet_name, stars.star_name, planets.discovery_method FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE planets.discovery_method = '{method}'",
    slots: [
      { name: 'method', kind: 'literal', op: '=', col: 'discovery_method', table: 'planets' },
      { name: 'sortKey', kind: 'sortKey', table: 'planets' }
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Join planets to stars and list planet_id, planet_name, star_name, and discovery_method where discovery_method is {method}, ordered by planet_id.',
      'Return planet_id, planet_name, star_name, and discovery_method for joined rows with discovery_method {method}, ordered by planet_id.'
    ],
    hintTemplate: 'Keep the ON clause for the relationship, then filter planets.discovery_method.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  }
];
