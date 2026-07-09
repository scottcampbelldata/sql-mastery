import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APERTURE_TEMPLATES,
  APERTURE_SKILLS,
  APERTURE_CONCEPT_META,
  APERTURE_PHASES,
  APERTURE_CHECKPOINTS
} from '../src/generator/templates/aperture/index';

const SCHEMA: Record<string, string[]> = {
  facility: ['facility_id', 'name'],
  stars: [
    'star_id',
    'star_name',
    'spectral_type',
    'temperature_k',
    'mass_solar',
    'radius_solar',
    'distance_ly'
  ],
  planets: [
    'planet_id',
    'star_id',
    'planet_name',
    'planet_type',
    'mass_earth',
    'radius_earth',
    'orbital_period_days',
    'semi_major_axis_au',
    'equilibrium_temp_k',
    'discovery_method',
    'discovery_year',
    'facility_id',
    'in_habitable_zone'
  ]
};

const TABLES = Object.keys(SCHEMA);
const ALL_COLS = new Set<string>(Object.values(SCHEMA).flat());

const FIXED_SKILLS = [
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

test('APERTURE_SKILLS is exactly the 17 fixed slugs in canonical order', () => {
  assert.deepEqual(APERTURE_SKILLS, FIXED_SKILLS);
});

test('templates are 1:1 with skills and all target aperture', () => {
  assert.equal(APERTURE_TEMPLATES.length, 17);
  assert.deepEqual(APERTURE_TEMPLATES.map((template) => template.skill), FIXED_SKILLS);
  for (const template of APERTURE_TEMPLATES) assert.equal(template.database, 'aperture');
});

test('concept meta is 1:1 with skills and nonempty teach blocks', () => {
  assert.equal(APERTURE_CONCEPT_META.length, 17);
  assert.deepEqual(
    APERTURE_CONCEPT_META.map((concept) => concept.skill),
    FIXED_SKILLS
  );
  for (const concept of APERTURE_CONCEPT_META) {
    assert.ok(concept.teach.plain.length > 0, `${concept.skill} plain`);
    assert.ok(concept.teach.mentalModel.length > 0, `${concept.skill} mentalModel`);
    assert.ok(concept.teach.example.sql.length > 0, `${concept.skill} example.sql`);
    assert.ok(concept.teach.example.note.length > 0, `${concept.skill} example.note`);
  }
});

test('every template obeys the emit and bind convention', () => {
  for (const template of APERTURE_TEMPLATES) {
    assert.ok(!/order\s+by/i.test(template.sqlShape), `${template.skill} has ORDER BY in sqlShape`);
    assert.ok(!/round\s*\(/i.test(template.sqlShape), `${template.skill} hand-writes ROUND`);
    assert.ok(template.phrasings.length >= 2, `${template.skill} needs at least two phrasings`);
    assert.deepEqual(template.scaffoldPlan, {
      full: 'all-value-slots',
      half: 'harder-half',
      blank: 'whole-clauses'
    });
    assert.equal(template.gateHints.rowCeiling, 200, `${template.skill} rowCeiling`);
    assert.equal(template.gateHints.boundedSlice, false, `${template.skill} boundedSlice`);

    if (template.primaryTable) assert.ok(TABLES.includes(template.primaryTable), `${template.skill} primaryTable`);
    const slotNames = new Set(template.slots.map((slot) => slot.name));
    for (const slot of template.slots) {
      if (slot.table) assert.ok(TABLES.includes(slot.table), `${template.skill}.${slot.name} table`);
      if (slot.col) assert.ok(ALL_COLS.has(slot.col), `${template.skill}.${slot.name} col ${slot.col}`);
      if (slot.kind === 'literal') {
        assert.ok(slot.op, `${template.skill}.${slot.name} literal op`);
        assert.ok(slot.col, `${template.skill}.${slot.name} literal col`);
        assert.ok(!slot.name.startsWith('lit:'), `${template.skill}.${slot.name} plain literal slot name`);
      }
    }
    for (const rule of template.bindingRules) {
      assert.ok(slotNames.has(rule.slot), `${template.skill} rule targets missing slot ${rule.slot}`);
    }
    if (template.family === 'single-table' || template.family === 'join') {
      assert.ok(slotNames.has('sortKey'), `${template.skill} (${template.family}) needs sortKey`);
    }
    if (template.family === 'grouped') {
      assert.ok(slotNames.has('groupCols'), `${template.skill} (grouped) needs groupCols`);
    }
  }
});

test('five beginner phases are in canonical order', () => {
  assert.deepEqual(
    APERTURE_PHASES.map((phase) => phase.id),
    ['ap-basics', 'ap-filtering', 'ap-shaping', 'ap-aggregation', 'ap-join']
  );
  assert.deepEqual(APERTURE_PHASES.map((phase) => phase.order), [1, 2, 3, 4, 5]);
  for (const phase of APERTURE_PHASES) assert.equal(phase.level, 'beginner');
});

test('every concept has a valid phaseId and phase-local orders are contiguous', () => {
  const phaseIds = new Set(APERTURE_PHASES.map((phase) => phase.id));
  for (const concept of APERTURE_CONCEPT_META) {
    assert.ok(phaseIds.has(concept.phaseId), `${concept.skill} bad phaseId ${concept.phaseId}`);
  }
  for (const phaseId of phaseIds) {
    const orders = APERTURE_CONCEPT_META
      .filter((concept) => concept.phaseId === phaseId)
      .map((concept) => concept.order)
      .sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, index) => index + 1), `phase ${phaseId} order gap`);
  }
});

test('checkpoints cpA..cpE reference valid phases and skills; cpE is the capstone', () => {
  assert.deepEqual(APERTURE_CHECKPOINTS.map((checkpoint) => checkpoint.id), ['cpA', 'cpB', 'cpC', 'cpD', 'cpE']);
  const phaseIds = new Set(APERTURE_PHASES.map((phase) => phase.id));
  const skillSet = new Set(APERTURE_SKILLS);
  for (const checkpoint of APERTURE_CHECKPOINTS) {
    assert.ok(phaseIds.has(checkpoint.phaseId), `${checkpoint.id} bad phaseId`);
    assert.ok(checkpoint.drawFromSkills.length >= 1, `${checkpoint.id} empty pool`);
    for (const skill of checkpoint.drawFromSkills) assert.ok(skillSet.has(skill), `${checkpoint.id} bad skill ${skill}`);
  }
  const cpE = APERTURE_CHECKPOINTS.find((checkpoint) => checkpoint.id === 'cpE');
  assert.ok(cpE);
  assert.equal(cpE.phaseId, 'ap-join');
  assert.equal(cpE.afterOrder, 1);
  assert.deepEqual(cpE.drawFromSkills, APERTURE_SKILLS);
});
