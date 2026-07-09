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
      example: { sql: 'SELECT * FROM stars', note: 'The star means all columns.' }
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
      example: { sql: 'SELECT planet_name, planet_type FROM planets', note: 'The result has those two columns in that order.' }
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
      example: { sql: 'SELECT star_name, temperature_k FROM stars ORDER BY temperature_k', note: 'Ascending is the default sort direction.' }
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
      example: { sql: 'SELECT planet_name, mass_earth FROM planets ORDER BY mass_earth DESC LIMIT 5', note: 'The ORDER BY defines what top means.' }
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
      example: { sql: 'SELECT DISTINCT planet_type FROM planets', note: 'One row appears for each planet type.' }
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
      example: { sql: 'SELECT star_name FROM stars WHERE temperature_k > 6000', note: 'Only hotter stars pass.' }
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
      example: { sql: "SELECT planet_name FROM planets WHERE in_habitable_zone = true AND planet_type = 'Terrestrial'", note: 'Both conditions must be true.' }
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
      example: { sql: 'SELECT planet_name FROM planets WHERE discovery_year IN (2012, 2013)', note: 'The row passes if its year is in the list.' }
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
      example: { sql: "SELECT star_name FROM stars WHERE star_name LIKE 'Kepler%'", note: 'The pattern matches names that start with Kepler.' }
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
      example: { sql: 'SELECT planet_name FROM planets WHERE equilibrium_temp_k IS NULL', note: 'This finds rows with a missing temperature.' }
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
      example: { sql: 'SELECT planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets', note: 'The expression is evaluated for each row.' }
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
      example: { sql: 'SELECT distance_ly AS light_years FROM stars', note: 'The result column is named light_years.' }
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
      example: { sql: 'SELECT COUNT(*) AS planet_count, AVG(mass_earth) AS avg_mass FROM planets', note: 'Without GROUP BY, the table becomes one summary row.' }
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
      example: { sql: 'SELECT planet_type, COUNT(*) AS n FROM planets GROUP BY planet_type', note: 'There is one output row per planet_type.' }
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
      example: { sql: 'SELECT planet_type, COUNT(*) AS n FROM planets GROUP BY planet_type HAVING COUNT(*) > 2', note: 'Only groups with more than two rows remain.' }
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
      example: { sql: 'SELECT discovery_method, COUNT(*) AS n FROM planets GROUP BY discovery_method ORDER BY discovery_method LIMIT 3', note: 'The sorted group labels decide which rows appear first.' }
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
      example: { sql: 'SELECT planets.planet_name, stars.star_name FROM planets JOIN stars ON planets.star_id = stars.star_id', note: 'The ON clause explains how the tables match.' }
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
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'star_id' }],
    phrasings: [
      'Show every stars column (star_id, star_name, spectral_type, temperature_k, mass_solar, radius_solar, distance_ly), ordered by star_id.',
      'Return star_id, star_name, spectral_type, temperature_k, mass_solar, radius_solar, and distance_ly from stars, ordered by star_id.'
    ],
    hintTemplate: 'Use SELECT * when you want every column.',
    scaffoldPlan: PLAN,
    gateHints: gate(2, 1, true)
  },
  {
    skill: 'ap-select-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, planet_type FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Show planet_id, planet_name, and planet_type from planets, ordered by planet_id.',
      'Return planet_id with each planet_name and planet_type, ordered by planet_id.'
    ],
    hintTemplate: 'Put the exact columns you need after SELECT, separated by commas.',
    scaffoldPlan: PLAN,
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
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'mass_earth' }],
    phrasings: [
      'Show the first {topN} planet_id, planet_name, and mass_earth rows after ordering by mass_earth and then planet_id.',
      'Return {topN} rows with planet_id, planet_name, and mass_earth from planets, ordered by mass_earth and planet_id.'
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
      'Return planet_id, planet_name, in_habitable_zone, and planet_type for rows matching both conditions, ordered by planet_id.'
    ],
    hintTemplate: 'AND means both WHERE conditions must be true for the same row.',
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
    skill: 'ap-computed-columns',
    database: 'aperture',
    family: 'single-table',
    primaryTable: 'planets',
    sqlShape: 'SELECT planet_id, planet_name, orbital_period_days / 365.0 AS orbital_years FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey', table: 'planets' }],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'planet_id' }],
    phrasings: [
      'Compute orbital_years and show planet_id, planet_name, and orbital_years, ordered by planet_id.',
      'Show planet_id, planet_name, and orbital_years from planets, ordered by planet_id.'
    ],
    hintTemplate: 'Put orbital_period_days / 365.0 in the SELECT list and name it with AS.',
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
    skill: 'ap-aggregate-scalar',
    database: 'aperture',
    family: 'aggregate-scalar',
    primaryTable: 'planets',
    sqlShape: 'SELECT COUNT(*) AS planet_count, AVG(mass_earth) AS avg_mass FROM planets',
    slots: [],
    bindingRules: [],
    phrasings: [
      'Return planet_count and avg_mass for all planets, ordered by planet_count.',
      'Count all planets as planet_count and show avg_mass, ordered by planet_count.'
    ],
    hintTemplate: 'With no GROUP BY, COUNT and AVG summarize the whole table into one row.',
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
    bindingRules: [{ slot: 'groupCols', predicate: (value: string) => ['planet_type', 'discovery_method', 'discovery_year'].includes(value) }],
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
    bindingRules: [{ slot: 'groupCols', predicate: (value: string) => ['planet_type', 'discovery_method'].includes(value) }],
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
      'Return planet_id, planet_name, and star_name for joined rows matching the habitable-zone condition, ordered by planet_id.'
    ],
    hintTemplate: 'Join on planets.star_id = stars.star_id to attach each planet to its host star.',
    scaffoldPlan: PLAN,
    gateHints: gate(1, 1, true)
  }
];
