import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_MS, addDays, addSeconds, formatTimestamp, formatDate } from '../src/datasets/framework/dates';

test('formatting is UTC-field based and TZ-independent', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'America/New_York';
  const a = formatTimestamp(ANCHOR_MS);
  process.env.TZ = 'UTC';
  const b = formatTimestamp(ANCHOR_MS);
  process.env.TZ = prev;
  assert.equal(a, b);
  assert.equal(a, '2020-01-01 00:00:00');
});

test('addDays / addSeconds are integer epoch math', () => {
  assert.equal(formatDate(addDays(ANCHOR_MS, 31)), '2020-02-01');
  assert.equal(formatTimestamp(addSeconds(ANCHOR_MS, 3661)), '2020-01-01 01:01:01');
});
