import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSnapshotHash } from '../src/snapshot';

function fakeService(digest: string) {
  return {
    async describeDatabase(_input: { database: string }) {
      return {
        database: 'aperture',
        tables: [
          {
            schema: 'public',
            name: 'cameras',
            columns: [
              { name: 'id', type: 'integer', nullable: false, position: 1 },
              { name: 'model', type: 'text', nullable: true, position: 2 }
            ]
          }
        ]
      };
    },
    async executeQuery(_input: { database: string; sql: string }) {
      return { columns: ['n', 'd'], rows: [{ n: '3', d: digest }], rowCount: 1 };
    }
  };
}

test('computeSnapshotHash is deterministic for identical DB content', async () => {
  const a = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
  const b = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('computeSnapshotHash changes when table content digest changes', async () => {
  const a = await computeSnapshotHash('aperture', { service: fakeService('abc') as any });
  const b = await computeSnapshotHash('aperture', { service: fakeService('xyz') as any });
  assert.notEqual(a, b);
});
