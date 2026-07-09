import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROVE_CHECKPOINTS,
  ROVE_CONCEPT_META,
  ROVE_PHASES,
  ROVE_SKILLS,
  ROVE_TEMPLATES
} from '../src/generator/templates/rove/index';

const EXPECTED_SKILLS = [
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

test('ROVE_SKILLS is the 24 advanced slugs, unique, incl recursive cte', () => {
  assert.equal(ROVE_SKILLS.length, 24);
  assert.deepEqual(ROVE_SKILLS, EXPECTED_SKILLS);
  assert.equal(new Set(ROVE_SKILLS).size, 24);
  assert.ok(ROVE_SKILLS.includes('rv-recursive-cte'));
});

test('every skill has a template; all templates are rove, bounded, <=200, no ORDER BY / no ROUND in sqlShape', () => {
  const covered = new Set(ROVE_TEMPLATES.map((template) => template.skill));
  for (const skill of ROVE_SKILLS) assert.ok(covered.has(skill), `no template for ${skill}`);

  for (const template of ROVE_TEMPLATES) {
    assert.ok(ROVE_SKILLS.includes(template.skill), `unknown skill ${template.skill}`);
    assert.equal(template.database, 'rove', `${template.skill} database`);
    assert.equal(template.gateHints.boundedSlice, true, `${template.skill} boundedSlice`);
    assert.ok(template.gateHints.rowCeiling <= 200, `${template.skill} rowCeiling`);
    assert.ok(template.phrasings.length >= 2, `${template.skill} phrasings>=2`);
    assert.ok(template.hintTemplate.length > 0, `${template.skill} hint`);
    assert.ok(!/\border\s+by\b/i.test(template.sqlShape), `${template.skill} has ORDER BY in sqlShape`);
    assert.ok(!/\bround\s*\(/i.test(template.sqlShape), `${template.skill} hand-writes ROUND`);
    assert.ok(/^[\x00-\x7F]*$/.test(template.sqlShape), `${template.skill} sqlShape non-ascii`);
    assert.ok(/^[\x00-\x7F]*$/.test(template.phrasings.join('') + template.hintTemplate), `${template.skill} text non-ascii`);
  }
});

test('each template declares the tiebreak slot its family requires', () => {
  for (const template of ROVE_TEMPLATES) {
    const kinds = new Set(template.slots.map((slot) => slot.kind));
    if (template.family === 'single-table') {
      assert.ok(kinds.has('sortKey'), `${template.skill} needs sortKey`);
    } else if (template.family === 'grouped') {
      assert.ok(kinds.has('groupCols'), `${template.skill} needs groupCols`);
    } else if (template.family === 'windowed') {
      assert.ok(kinds.has('partitionCols'), `${template.skill} needs partitionCols`);
      assert.ok(kinds.has('rankKey'), `${template.skill} needs rankKey`);
    } else {
      assert.fail(`${template.skill} unexpected family ${template.family}`);
    }
  }
});

test('concept-meta is 1:1 with skills, phaseIds valid, local order contiguous per phase', () => {
  assert.equal(ROVE_CONCEPT_META.length, 24);
  assert.deepEqual(ROVE_CONCEPT_META.map((concept) => concept.skill), ROVE_SKILLS);

  const phaseIds = new Set(ROVE_PHASES.map((phase) => phase.id));
  for (const concept of ROVE_CONCEPT_META) {
    assert.ok(phaseIds.has(concept.phaseId), `${concept.skill} bad phaseId`);
    assert.ok(concept.title.length > 0, `${concept.skill} title`);
    assert.ok(concept.teach.plain.length > 0, `${concept.skill} teach.plain`);
    assert.ok(concept.teach.mentalModel.length > 0, `${concept.skill} teach.mentalModel`);
    assert.ok(concept.teach.example.sql.length > 0, `${concept.skill} teach.example.sql`);
    assert.ok(concept.teach.example.note.length > 0, `${concept.skill} teach.example.note`);
  }

  for (const phase of ROVE_PHASES) {
    const orders = ROVE_CONCEPT_META
      .filter((concept) => concept.phaseId === phase.id)
      .map((concept) => concept.order)
      .sort((a, b) => a - b);
    assert.deepEqual(orders, orders.map((_, index) => index + 1), `${phase.id} local order not contiguous 1..n`);
  }
});

test('three rove phases, all advanced, order 1..3', () => {
  assert.deepEqual(ROVE_PHASES.map((phase) => phase.id), ['rv-clean', 'rv-analytic', 'rv-behavioral']);
  assert.deepEqual(ROVE_PHASES.map((phase) => phase.order), [1, 2, 3]);
  for (const phase of ROVE_PHASES) {
    assert.equal(phase.level, 'advanced', `${phase.id} level`);
    assert.ok(phase.title.length > 0 && phase.goal.length > 0, `${phase.id} text`);
  }
});

test('checkpoints cp1..cp4 mid + cp5 capstone drawing ALL rove skills', () => {
  assert.deepEqual(ROVE_CHECKPOINTS.map((checkpoint) => checkpoint.id), ['cp1', 'cp2', 'cp3', 'cp4', 'cp5']);

  const phaseIds = new Set(ROVE_PHASES.map((phase) => phase.id));
  const skillSet = new Set(ROVE_SKILLS);
  for (const checkpoint of ROVE_CHECKPOINTS) {
    assert.ok(phaseIds.has(checkpoint.phaseId), `${checkpoint.id} bad phaseId`);
    assert.ok(checkpoint.drawFromSkills.length > 0, `${checkpoint.id} drawFromSkills`);
    for (const skill of checkpoint.drawFromSkills) {
      assert.ok(skillSet.has(skill), `${checkpoint.id} draws unknown skill ${skill}`);
    }
  }

  const cp5 = ROVE_CHECKPOINTS.find((checkpoint) => checkpoint.id === 'cp5');
  assert.equal(cp5?.phaseId, 'rv-behavioral');
  assert.deepEqual([...(cp5?.drawFromSkills ?? [])].sort(), [...ROVE_SKILLS].sort());
});

test('rv-recursive-cte walks the categories tree (cleaned), not customers', () => {
  const recursive = ROVE_TEMPLATES.find((template) => template.skill === 'rv-recursive-cte');
  assert.ok(recursive, 'rv-recursive-cte template missing');

  const sql = recursive.sqlShape.toLowerCase();
  assert.ok(sql.includes('with recursive'), 'must use WITH RECURSIVE');
  assert.ok(sql.includes('categories'), 'must read the categories tree');
  assert.ok(sql.includes('parent_category_id'), 'must walk parent_category_id');
  assert.ok(sql.includes('in (select category_id from categories)'), 'must clean dangling parents');
  assert.ok(!sql.includes('referred_by_customer_id'), 'must NOT use customers self-ref');
});

test('rove signature templates carry their required advanced clauses', () => {
  const bySkill = (skill: string) => ROVE_TEMPLATES.find((template) => template.skill === skill)?.sqlShape ?? '';

  assert.ok(bySkill('rv-timezone-city-join').includes('AT TIME ZONE'), 'tz template uses AT TIME ZONE');
  assert.ok(bySkill('rv-moving-average-frame').includes('generate_series'), 'moving-avg uses a date spine');
  assert.ok(bySkill('rv-moving-average-frame').toUpperCase().includes('RANGE BETWEEN'), 'moving-avg uses RANGE frame');
  assert.ok(bySkill('rv-sessionization').includes('INTERVAL '), 'sessionization uses a gap interval');
  assert.ok(bySkill('rv-sessionization').toUpperCase().includes('LAG('), 'sessionization uses LAG');
});
