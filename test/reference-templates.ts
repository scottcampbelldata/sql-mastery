// Worked aperture reference templates for Task 4 (emit/bind convention).
// T7 copies this exact shape. NOT a *.test.ts file, so node --test ignores it.
import type { Template } from '../src/generator/types';
import type { Catalog } from '../src/generator/schema-catalog';

const SCAFFOLD_PLAN = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' } as const;

// Reference 1: single-table WHERE with a compound AND lifted from ONE real row.
export const REF_WHERE: Template = {
  skill: 'ap-where-comparison',
  database: 'aperture',
  family: 'single-table',
  primaryTable: 'planets',
  // NO ORDER BY, NO ROUND in sqlShape. emit owns both.
  sqlShape:
    "SELECT planet_name, planet_type, orbital_period_days FROM planets " +
    "WHERE planet_type = '{ptype}' AND in_habitable_zone = {hz}",
  slots: [
    { name: 'ptype', kind: 'literal', op: '=', col: 'planet_type', sampleStrategy: 'compound-row' },
    { name: 'hz', kind: 'literal', op: '=', col: 'in_habitable_zone', sampleStrategy: 'compound-row' },
    { name: 'sortKey', kind: 'sortKey' }
  ],
  bindingRules: [
    // Deterministic tiebreak: sortKey must be a primary-key column of planets.
    { slot: 'sortKey', predicate: (v: string, cat: any) =>
        cat.tables.find((t: any) => t.name === 'planets').primaryKey.includes(v) }
  ],
  phrasings: [
    'List {ptype} planets in the habitable zone.',
    'Which {ptype} planets sit in the habitable zone?'
  ],
  hintTemplate: 'Filter planet_type and in_habitable_zone together in one WHERE.',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

// Reference 2: GROUP BY / HAVING with an AVG that emit must ROUND exactly once.
export const REF_GROUPED: Template = {
  skill: 'ap-group-by',
  database: 'aperture',
  family: 'grouped',
  primaryTable: 'planets',
  sqlShape:
    "SELECT {groupCols}, COUNT(*), AVG(orbital_period_days) FROM planets " +
    "GROUP BY {groupCols} HAVING COUNT(*) >= {minCount}",
  slots: [
    { name: 'groupCols', kind: 'groupCols' },
    { name: 'minCount', kind: 'limit' }
  ],
  bindingRules: [
    { slot: 'groupCols', predicate: (v: string) =>
        ['planet_type', 'discovery_method', 'discovery_year'].includes(v) }
  ],
  phrasings: [
    'Count planets and the average orbital period per {groupCols}.',
    'For each {groupCols}, show the planet count and average orbital period.'
  ],
  hintTemplate: 'GROUP BY {groupCols}, then filter groups with HAVING COUNT(*).',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

// Reference 3: intro JOIN. No sortKey/groupCols slot: emit tiebreaks on pk-from-catalog.
export const REF_JOIN: Template = {
  skill: 'ap-join-intro',
  database: 'aperture',
  family: 'join',
  primaryTable: 'planets',
  sqlShape:
    "SELECT planets.planet_name, stars.star_name FROM planets " +
    "JOIN stars ON planets.star_id = stars.star_id WHERE stars.spectral_type = '{stype}'",
  slots: [
    { name: 'stype', kind: 'literal', op: '=', col: 'spectral_type', table: 'stars', sampleStrategy: 'single' }
  ],
  bindingRules: [],
  phrasings: [
    'Show each planet with its host star for spectral type {stype}.',
    'Join planets to their host stars, keeping only spectral type {stype}.'
  ],
  hintTemplate: 'JOIN planets to stars on star_id, then filter stars.spectral_type.',
  scaffoldPlan: SCAFFOLD_PLAN,
  gateHints: { minRows: 1, minDistinct: 2, rowCeiling: 200, orderMatters: false, boundedSlice: false }
};

export const REFERENCE_TEMPLATES: Template[] = [REF_WHERE, REF_GROUPED, REF_JOIN];

// Minimal in-memory Catalog matching datasets/schema/aperture.sql, used by both test files.
const col = (name: string, dataType: string, isNullable: boolean, isPrimaryKey: boolean) =>
  ({ name, dataType, isNullable, isPrimaryKey });

export const REFERENCE_CATALOG: Catalog = {
  database: 'aperture',
  tables: [
    {
      schema: 'public',
      name: 'planets',
      columns: [
        col('planet_id', 'integer', false, true),
        col('star_id', 'integer', false, false),
        col('planet_name', 'text', false, false),
        col('planet_type', 'text', false, false),
        col('orbital_period_days', 'numeric', false, false),
        col('in_habitable_zone', 'boolean', false, false)
      ],
      primaryKey: ['planet_id'],
      foreignKeys: [
        { fromTable: 'planets', fromColumn: 'star_id', toTable: 'stars', toColumn: 'star_id' }
      ]
    },
    {
      schema: 'public',
      name: 'stars',
      columns: [
        col('star_id', 'integer', false, true),
        col('star_name', 'text', false, false),
        col('spectral_type', 'char', false, false)
      ],
      primaryKey: ['star_id'],
      foreignKeys: []
    }
  ]
};
