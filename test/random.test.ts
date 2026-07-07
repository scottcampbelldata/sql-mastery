import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/datasets/framework/prng';
import { intBetween, pick, weightedPick, bernoulli, gaussian, shuffle, sampleWithout, floatBetween, round2 } from '../src/datasets/framework/random';

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

test('round2 fixes two decimals', () => {
  assert.equal(round2(3.14159), 3.14);
  assert.equal(round2(2.71828), 2.72);
});

test('gaussian draws have the expected mean and stddev', () => {
  const r = mulberry32(5);
  const n = 20000;
  const mean = 5;
  const sd = 2;
  const samples: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = gaussian(r, mean, sd);
    assert.ok(!Number.isNaN(v) && Number.isFinite(v));
    samples.push(v);
  }
  const empiricalMean = samples.reduce((sum, v) => sum + v, 0) / n;
  const variance = samples.reduce((sum, v) => sum + (v - empiricalMean) ** 2, 0) / n;
  const empiricalSd = Math.sqrt(variance);
  assert.ok(Math.abs(empiricalMean - mean) < 0.1);
  assert.ok(Math.abs(empiricalSd - sd) < 0.15);
});

test('sampleWithout returns k distinct elements from the source array', () => {
  const r = mulberry32(6);
  const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const out = sampleWithout(r, src, 4);
  assert.equal(out.length, 4);
  assert.equal(new Set(out).size, 4);
  for (const v of out) assert.ok(src.includes(v));
});

test('floatBetween stays within [lo, hi)', () => {
  const r = mulberry32(7);
  const lo = 2;
  const hi = 5;
  for (let i = 0; i < 20000; i += 1) {
    const v = floatBetween(r, lo, hi);
    assert.ok(v >= lo && v < hi);
  }
});
