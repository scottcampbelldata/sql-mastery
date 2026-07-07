import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsPerChunk, insertRows } from '../src/datasets/framework/writer';

test('rowsPerChunk stays under the 65535 param cap and respects rowCap', () => {
  assert.equal(rowsPerChunk(10), 1000);              // capped by rowCap default
  assert.equal(rowsPerChunk(100), 655);              // floor(65535/100)
  assert.equal(rowsPerChunk(3, 5), 5);               // explicit rowCap
});

test('insertRows chunks and flattens params in column order', async () => {
  const calls: { text: string; params: unknown[] }[] = [];
  const client = { query: async (text: string, params?: unknown[]) => { calls.push({ text, params: params || [] }); return { rows: [], rowCount: 0 }; } };
  const rows = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'z' }];
  await insertRows(client, 'demo', ['a', 'b'], rows, 2); // rowCap 2 -> two chunks (2 then 1)
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /INSERT INTO demo \(a, b\) VALUES \(\$1, \$2\), \(\$3, \$4\)/);
  assert.deepEqual(calls[0].params, [1, 'x', 2, 'y']);
  assert.deepEqual(calls[1].params, [3, 'z']);
});
