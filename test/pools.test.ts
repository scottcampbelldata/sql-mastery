import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GIVEN_NAMES, SURNAMES, CITY_NAMES, WORD_PARTS } from '../src/datasets/framework/pools';
import { BANNED_TOKENS, containsBanned, looksLikeRealEmail, looksLikeRealPhone } from '../src/datasets/framework/text';

const ALL_POOLS: Array<[string, readonly string[]]> = [
  ['GIVEN_NAMES', GIVEN_NAMES],
  ['SURNAMES', SURNAMES],
  ['CITY_NAMES', CITY_NAMES],
  ['WORD_PARTS', WORD_PARTS],
];

test('required pools meet their minimum sizes', () => {
  assert.ok(GIVEN_NAMES.length >= 40, 'GIVEN_NAMES should have at least 40 entries');
  assert.ok(SURNAMES.length >= 40, 'SURNAMES should have at least 40 entries');
  assert.ok(CITY_NAMES.length >= 25, 'CITY_NAMES should have at least 25 entries');
});

test('every exported pool is non-empty, deduplicated, and free of banned entries', () => {
  for (const [name, pool] of ALL_POOLS) {
    assert.ok(pool.length > 0, `${name} should be non-empty`);
    assert.equal(new Set(pool).size, pool.length, `${name} should have no duplicate entries`);
    for (const entry of pool) {
      assert.equal(containsBanned(entry), false, `${name} entry "${entry}" should not trip containsBanned`);
    }
  }
});

test('containsBanned matches a banned token even through punctuation and spacing, and clears clean text', () => {
  const token = BANNED_TOKENS[0];
  const disguised = `Hey, ${token.split('').join('-* ')}!!`;
  assert.equal(containsBanned(disguised), true);
  assert.equal(containsBanned('a perfectly ordinary sentence about pipelines and cities'), false);
});

test('looksLikeRealEmail flags live domains and clears reserved example domains', () => {
  assert.equal(looksLikeRealEmail('a@gmail.com'), true);
  assert.equal(looksLikeRealEmail('user@example.com'), false);
  assert.equal(looksLikeRealEmail('user@example.org'), false);
  assert.equal(looksLikeRealEmail('user@example.net'), false);
  assert.equal(looksLikeRealEmail('not-an-email'), false);
});

test('looksLikeRealPhone flags non-555 exchanges and clears the reserved 555 exchange', () => {
  assert.equal(looksLikeRealPhone('212-555-0100'), false);
  assert.equal(looksLikeRealPhone('212-867-5309'), true);
  assert.equal(looksLikeRealPhone('555-0100'), false); // fewer than 10 digits
});
