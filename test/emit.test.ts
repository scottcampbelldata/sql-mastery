import { test } from 'node:test';
import assert from 'node:assert/strict';

import { emitSql } from '../src/generator/emit';
import type { Template, Binding } from '../src/generator/types';
import { REF_WHERE, REF_GROUPED, REF_JOIN, REFERENCE_CATALOG } from './reference-templates';

const b = (slots: Record<string, string>, literals: Record<string, string>): Binding => ({
  skill: 'x', database: 'aperture', bindingIndex: 0, slots, literals
});

test('single-table emit: unique aliases + sortKey tiebreak, no double ORDER BY', () => {
  const sql = emitSql(REF_WHERE, b({ sortKey: 'planet_id' }, { ptype: 'Gas Giant', hz: 'true' }), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planet_name AS planet_name, planet_type AS planet_type, orbital_period_days AS orbital_period_days " +
    "FROM planets WHERE planet_type = 'Gas Giant' AND in_habitable_zone = true ORDER BY planet_id"
  );
  assert.equal((sql.match(/order by/gi) || []).length, 1);
});

test('grouped emit: single ROUND wrap, distinct aliases, groupCols tiebreak', () => {
  const sql = emitSql(REF_GROUPED, b({ groupCols: 'planet_type', minCount: '3' }, {}), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planet_type AS planet_type, COUNT(*) AS count, ROUND(AVG(orbital_period_days), 2) AS avg_orbital_period_days " +
    "FROM planets GROUP BY planet_type HAVING COUNT(*) >= 3 ORDER BY planet_type"
  );
  assert.equal((sql.match(/round\(/gi) || []).length, 1); // no double ROUND
  assert.equal((sql.match(/order by/gi) || []).length, 1); // no double ORDER BY
});

test('join emit: aliases + pk-from-catalog tiebreak', () => {
  const sql = emitSql(REF_JOIN, b({}, { stype: 'G' }), REFERENCE_CATALOG);
  assert.equal(
    sql,
    "SELECT planets.planet_name AS planet_name, stars.star_name AS star_name " +
    "FROM planets JOIN stars ON planets.star_id = stars.star_id WHERE stars.spectral_type = 'G' " +
    "ORDER BY planets.planet_id"
  );
});

test('duplicate projected expressions get unique aliases (count, count_2)', () => {
  const dup: Template = {
    ...REF_WHERE,
    skill: 'ap-dup', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT COUNT(*), COUNT(*) FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey' }],
    bindingRules: []
  };
  const sql = emitSql(dup, b({ sortKey: 'planet_id' }, {}), REFERENCE_CATALOG);
  assert.equal(sql, 'SELECT COUNT(*) AS count, COUNT(*) AS count_2 FROM planets ORDER BY planet_id');
});

test('already-wrapped ROUND is not double-wrapped', () => {
  const t: Template = {
    ...REF_WHERE, skill: 'ap-preround', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT ROUND(AVG(orbital_period_days), 2) FROM planets',
    slots: [{ name: 'sortKey', kind: 'sortKey' }], bindingRules: []
  };
  const sql = emitSql(t, b({ sortKey: 'planet_id' }, {}), REFERENCE_CATALOG);
  assert.equal((sql.match(/round\(/gi) || []).length, 1);
});

test('missing required tiebreak slot throws a descriptive error (not silent)', () => {
  const bad: Template = {
    ...REF_WHERE, skill: 'ap-notiebreak', family: 'single-table', primaryTable: 'planets',
    sqlShape: 'SELECT planet_name FROM planets', slots: [], bindingRules: []
  };
  assert.throws(() => emitSql(bad, b({}, {}), REFERENCE_CATALOG), /sortKey/);
});
