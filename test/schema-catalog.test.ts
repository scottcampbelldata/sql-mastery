import test from 'node:test';
import assert from 'node:assert/strict';

import {
  loadCatalog,
  numericCols,
  textCols,
  dateCols,
  boolCols,
  nullableCols,
  pk,
  fksFrom,
  fksTo,
  joinPairs,
  type Catalog
} from '../src/generator/schema-catalog';

// Loaded once; every helper test reuses the same real aperture catalog.
let catalog: Catalog;

test('loadCatalog(aperture) returns the seeded base tables', async () => {
  process.env.SQL_MASTERY_DATABASES = 'aperture,sideline,rove';
  catalog = await loadCatalog('aperture');
  assert.equal(catalog.database, 'aperture');
  const names = catalog.tables.map((t) => t.name);
  assert.ok(names.includes('planets'), 'planets table present');
  assert.ok(names.includes('stars'), 'stars table present');
  assert.ok(names.includes('facility'), 'facility table present');
});

test('numericCols reports the real numeric columns', () => {
  const starsNum = numericCols(catalog, 'stars').map((c) => c.name);
  assert.ok(starsNum.includes('temperature_k'), 'integer counts as numeric');
  assert.ok(starsNum.includes('distance_ly'), 'numeric(8,2) counts as numeric');
  assert.ok(starsNum.includes('mass_solar'), 'nullable numeric counts as numeric');
  assert.ok(!starsNum.includes('star_name'), 'text is not numeric');
});

test('textCols reports the real text columns', () => {
  const starsText = textCols(catalog, 'stars').map((c) => c.name);
  assert.ok(starsText.includes('star_name'), 'text column');
  assert.ok(starsText.includes('spectral_type'), 'char(1) column is text');
  assert.ok(!starsText.includes('temperature_k'), 'integer is not text');
});

test('boolCols reports only boolean columns', () => {
  assert.deepEqual(
    boolCols(catalog, 'planets').map((c) => c.name),
    ['in_habitable_zone']
  );
});

test('dateCols is empty for aperture (no date/timestamp columns)', () => {
  assert.deepEqual(dateCols(catalog, 'stars'), []);
  assert.deepEqual(dateCols(catalog, 'planets'), []);
});

test('nullableCols reflects the real NULL-able columns', () => {
  const planetsNullable = nullableCols(catalog, 'planets').map((c) => c.name);
  assert.ok(planetsNullable.includes('equilibrium_temp_k'), 'nullable teaching column');
  assert.ok(planetsNullable.includes('mass_earth'), 'nullable numeric');
  assert.ok(!planetsNullable.includes('planet_id'), 'primary key is NOT NULL');
});

test('pk reports the primary key of each table', () => {
  assert.deepEqual(pk(catalog, 'planets'), ['planet_id']);
  assert.deepEqual(pk(catalog, 'stars'), ['star_id']);
  assert.deepEqual(pk(catalog, 'facility'), ['facility_id']);
});

test('fksFrom reports the outgoing foreign keys of planets', () => {
  const pf = fksFrom(catalog, 'planets');
  assert.ok(
    pf.some((fk) => fk.fromColumn === 'star_id' && fk.toTable === 'stars' && fk.toColumn === 'star_id'),
    'planets.star_id -> stars.star_id'
  );
  assert.ok(
    pf.some((fk) => fk.fromColumn === 'facility_id' && fk.toTable === 'facility' && fk.toColumn === 'facility_id'),
    'planets.facility_id -> facility.facility_id'
  );
});

test('fksTo reports the incoming foreign keys of stars', () => {
  const tf = fksTo(catalog, 'stars');
  assert.ok(
    tf.some((fk) => fk.fromTable === 'planets' && fk.fromColumn === 'star_id'),
    'planets.star_id references stars'
  );
});

test('joinPairs flattens every FK in the catalog', () => {
  const jp = joinPairs(catalog);
  assert.ok(jp.length >= 2, 'at least the two planets FKs');
  assert.ok(jp.some((p) => p.fromTable === 'planets' && p.toTable === 'stars'));
  assert.ok(jp.some((p) => p.fromTable === 'planets' && p.toTable === 'facility'));
});

test('helpers bind only to names that exist (unknown table -> empty)', () => {
  assert.deepEqual(numericCols(catalog, 'does_not_exist'), []);
  assert.deepEqual(pk(catalog, 'does_not_exist'), []);
  assert.deepEqual(fksFrom(catalog, 'does_not_exist'), []);
});
