import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseMistake } from '../src/coach';

test('flags = NULL and points to IS NULL', () => {
  const c = diagnoseMistake({ sql: 'SELECT * FROM planets WHERE equilibrium_temp_k = NULL' });
  assert.ok(c);
  assert.match(c!.text, /IS NULL/);
  assert.match(c!.label, /NULL/i);
});

test('flags != NULL and <> NULL too', () => {
  assert.ok(diagnoseMistake({ sql: 'select * from p where x <> null' }));
  assert.ok(diagnoseMistake({ sql: 'select * from p where x != NULL' }));
});

test('does not flag correct IS NULL usage', () => {
  const c = diagnoseMistake({ sql: 'SELECT * FROM planets WHERE equilibrium_temp_k IS NULL' });
  assert.equal(c, null);
});

test('flags LIMIT without ORDER BY as nondeterministic', () => {
  const c = diagnoseMistake({ sql: 'SELECT planet_name FROM planets LIMIT 5', diff: { reason: 'values' } });
  assert.ok(c);
  assert.match(c!.text, /ORDER BY/);
});

test('does not flag LIMIT when ORDER BY is present', () => {
  const c = diagnoseMistake({ sql: 'SELECT planet_name FROM planets ORDER BY mass_earth DESC LIMIT 5', diff: { reason: 'values' } });
  assert.equal(c, null);
});

test('maps 42803 grouping error to GROUP BY coaching', () => {
  const c = diagnoseMistake({
    sql: 'SELECT star_id, count(*) FROM planets',
    pgError: { code: '42803', message: 'column "planets.star_id" must appear in the GROUP BY clause' }
  });
  assert.ok(c);
  assert.match(c!.text, /GROUP BY/);
});

test('maps 42703 undefined column to a name/quoting hint', () => {
  const c = diagnoseMistake({ sql: 'SELECT nam FROM stars', pgError: { code: '42703', message: 'column "nam" does not exist' } });
  assert.ok(c);
  assert.match(c!.text, /spelling|case|quote/i);
});

test('order-only mismatch coaches ORDER BY', () => {
  const c = diagnoseMistake({ sql: 'SELECT star_name FROM stars', diff: { reason: 'rows', orderOnly: true } });
  assert.ok(c);
  assert.match(c!.text, /ORDER BY/);
});

test('SELECT * with a column mismatch coaches listing columns', () => {
  const c = diagnoseMistake({
    sql: 'SELECT * FROM planets',
    taskText: 'Return the planet_name and planet_type columns.',
    diff: { reason: 'columns' }
  });
  assert.ok(c);
  assert.match(c!.text, /\*|specific columns|list/i);
});

test('too many rows + top-N task + no LIMIT coaches LIMIT', () => {
  const c = diagnoseMistake({
    sql: 'SELECT planet_name FROM planets ORDER BY mass_earth DESC',
    taskText: 'Return the top 5 heaviest planets.',
    diff: { reason: 'rowCount', yourRowCount: 140, expectedRowCount: 5 }
  });
  assert.ok(c);
  assert.match(c!.text, /LIMIT/);
});

test('too many rows + distinct task + no DISTINCT coaches DISTINCT', () => {
  const c = diagnoseMistake({
    sql: 'SELECT spectral_type FROM stars',
    taskText: 'List each distinct spectral type.',
    diff: { reason: 'rowCount', yourRowCount: 77, expectedRowCount: 7 }
  });
  assert.ok(c);
  assert.match(c!.text, /DISTINCT/);
});

test('too many rows with a JOIN coaches fan-out', () => {
  const c = diagnoseMistake({
    sql: 'SELECT p.planet_name, s.star_name FROM planets p JOIN stars s ON p.star_id = s.star_id',
    diff: { reason: 'rowCount', yourRowCount: 300, expectedRowCount: 140 }
  });
  assert.ok(c);
  assert.match(c!.text, /fan-out|multiply|one-to-many/i);
});

test('too few rows with an inner JOIN coaches LEFT JOIN', () => {
  const c = diagnoseMistake({
    sql: 'SELECT s.star_name, p.planet_name FROM stars s JOIN planets p ON p.star_id = s.star_id',
    diff: { reason: 'rowCount', yourRowCount: 60, expectedRowCount: 77 }
  });
  assert.ok(c);
  assert.match(c!.text, /LEFT JOIN/);
});

test('flags NOT IN with a subquery (NULL trap)', () => {
  const c = diagnoseMistake({ sql: 'SELECT name FROM teams WHERE id NOT IN (SELECT team_id FROM players)', diff: { reason: 'rowCount', yourRowCount: 0, expectedRowCount: 3 } });
  assert.ok(c);
  assert.match(c!.text, /NOT EXISTS/);
});

test('flags an empty OVER() window', () => {
  const c = diagnoseMistake({ sql: 'SELECT name, ROW_NUMBER() OVER () rn FROM players', diff: { reason: 'values' } });
  assert.ok(c);
  assert.match(c!.text, /PARTITION BY|ORDER BY/);
});

test('flags filtering the right table of a LEFT JOIN in WHERE', () => {
  const c = diagnoseMistake({
    sql: "SELECT c.name FROM customers c LEFT JOIN orders o ON o.cust_id = c.id WHERE o.status = 'shipped'",
    diff: { reason: 'rowCount', yourRowCount: 5, expectedRowCount: 20 }
  });
  assert.ok(c);
  assert.match(c!.text, /ON clause|inner join/i);
});

test('does not flag a correct LEFT JOIN anti-join (WHERE right IS NULL)', () => {
  const c = diagnoseMistake({
    sql: 'SELECT c.name FROM customers c LEFT JOIN orders o ON o.cust_id = c.id WHERE o.id IS NULL',
    diff: { reason: 'values' }
  });
  assert.equal(c, null);
});

test('returns null when no signature matches', () => {
  const c = diagnoseMistake({ sql: 'SELECT star_name FROM stars WHERE spectral_type = \'G\'', diff: { reason: 'values' } });
  assert.equal(c, null);
});
