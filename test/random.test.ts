import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/datasets/framework/prng';
import { intBetween, pick, weightedPick, bernoulli, shuffle, round2 } from '../src/datasets/framework/random';

test('intBetween is inclusive and in range, including lo==hi', () => {
  const r = mulberry32(1);
  for (let i = 0; i < 1000; i += 1) { const v = intBetween(r, 3, 7); assert.ok(v >= 3 && v <= 7 && Number.isInteger(v)); }
  assert.equal(intBetween(r, 5, 5), 5);
});

test('weightedPick honors the target ratio within tolerance', () => {
  const r = mulberry32(2);
  let a = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) { if (weightedPick(r, [['a', 3], ['b', 1]]) === 'a') a += 1; }
  assert.ok(Math.abs(a / n - 0.75) < 0.02);
});

test('shuffle is a permutation (no loss/dup)', () => {
  const r = mulberry32(3);
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(r, src);
  assert.deepEqual([...out].sort((x, y) => x - y), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]); // input not mutated
});

test('bernoulli rate lands near p', () => {
  const r = mulberry32(4); let c = 0; const n = 20000;
  for (let i = 0; i < n; i += 1) if (bernoulli(r, 0.3)) c += 1;
  assert.ok(Math.abs(c / n - 0.3) < 0.02);
});

test('round2 fixes two decimals', () => { assert.equal(round2(1.005 * 100) / 100, round2(1.005 * 100) / 100); assert.equal(round2(3.14159), 3.14); });
