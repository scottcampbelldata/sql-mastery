import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, fnv1a, deriveStream } from '../src/datasets/framework/prng';

test('mulberry32 is deterministic and stable across instances', () => {
  const a = mulberry32(12345); const b = mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) { assert.ok(v >= 0 && v < 1); }
});

test('mulberry32 first outputs match a pinned golden vector', () => {
  const r = mulberry32(0x41504552);
  const got = [r(), r(), r()].map((x) => Math.round(x * 1e9));
  // GOLDEN: fill these with the actual first-run values, then never change them.
  assert.deepEqual(got, [867800199, 378007272, 745308599]);
});

test('deriveStream gives independent, order-stable sub-streams', () => {
  const s1 = deriveStream(1, 'planets'); const s2 = deriveStream(1, 'stars');
  assert.notDeepEqual([s1(), s1(), s1()], [s2(), s2(), s2()]);
  // Re-deriving 'planets' after 'stars' yields the same sequence (order-stable).
  const s1b = deriveStream(1, 'planets');
  const first = deriveStream(1, 'planets');
  assert.deepEqual([first(), first(), first()], [s1b(), s1b(), s1b()]);
});

test('fnv1a is a stable 32-bit hash', () => {
  assert.equal(fnv1a('planets'), fnv1a('planets'));
  assert.ok(fnv1a('a') !== fnv1a('b'));
  assert.ok(fnv1a('x') >>> 0 === fnv1a('x'));
});
