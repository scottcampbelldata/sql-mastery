import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  buildFingerprint,
  hashRowsOrdered,
  hashRowsUnordered,
  normalizeCell,
  rowKey,
  toPositionalRows
} from '../src/fingerprint';

function sha256(parts: string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

test('normalizeCell preserves the query-service cell semantics', () => {
  assert.equal(normalizeCell(null), null);
  assert.equal(normalizeCell(undefined), null);
  assert.equal(normalizeCell(new Date('2026-01-02T03:04:05.000Z')), '2026-01-02T03:04:05.000Z');
  assert.equal(normalizeCell(Buffer.from('sql')), 'c3Fs');
  assert.equal(normalizeCell({ b: 2, a: 1 }), '{"b":2,"a":1}');
  assert.equal(normalizeCell(42), '42');
  assert.equal(normalizeCell(false), 'false');
});

test('toPositionalRows uses field positions instead of column names', () => {
  const result = {
    fields: [{ name: 'value' }, { name: 'value' }, { name: 'label' }],
    rows: [
      [1, 2, 'first'],
      [1, 1, null]
    ]
  };

  assert.deepEqual(toPositionalRows(result), [
    ['1', '2', 'first'],
    ['1', '1', null]
  ]);
});

test('rowKey is stable and JSON-stringify based', () => {
  const row: (string | null)[] = ['a', null, '3'];

  assert.equal(rowKey(row), JSON.stringify(row));
  assert.equal(rowKey(row), rowKey(['a', null, '3']));
});

test('row hashes are ordered or multiset-invariant as requested', () => {
  const rows: (string | null)[][] = [
    ['b', '2'],
    ['a', '1'],
    ['a', '1']
  ];
  const keys = rows.map(rowKey);

  assert.equal(hashRowsOrdered(rows), sha256(keys));
  assert.equal(hashRowsUnordered(rows), sha256([...keys].sort()));
  assert.notEqual(hashRowsOrdered(rows), hashRowsUnordered(rows));
  assert.equal(hashRowsUnordered(rows), hashRowsUnordered([...rows].reverse()));
});

test('buildFingerprint captures columns, row count, and both row hashes', () => {
  const result = {
    fields: [{ name: 'value' }, { name: 'value' }],
    rows: [
      [2, 'second'],
      [1, 'first']
    ]
  };

  const positionalRows = toPositionalRows(result);
  assert.deepEqual(buildFingerprint(result), {
    columns: ['value', 'value'],
    rowCount: 2,
    orderedRowHash: hashRowsOrdered(positionalRows),
    unorderedRowHash: hashRowsUnordered(positionalRows)
  });
});
