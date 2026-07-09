import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertServedSnapshotsMatch,
  parseRecordedSnapshot,
  readRecordedSnapshot,
  recordedSnapshotPath,
  SnapshotGuardError
} from '../src/snapshot-guard';

test('parseRecordedSnapshot accepts every recorded snapshot shape', () => {
  assert.equal(parseRecordedSnapshot('"abc123"', 'aperture'), 'abc123');
  assert.equal(parseRecordedSnapshot('{"snapshotHash":"def456"}', 'sideline'), 'def456');
});

test('readRecordedSnapshot reads every recorded snapshot file shape', () => {
  const database = `snapshot_guard_${process.pid}`;
  const file = recordedSnapshotPath(database);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  try {
    fs.writeFileSync(file, JSON.stringify('string-hash'));
    assert.equal(readRecordedSnapshot(database), 'string-hash');

    fs.writeFileSync(file, JSON.stringify({ database, snapshotHash: 'recorded-hash' }));
    assert.equal(readRecordedSnapshot(database), 'recorded-hash');
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

test('assertServedSnapshotsMatch uses injected providers without touching Postgres', async () => {
  const checked: string[] = [];

  await assertServedSnapshotsMatch({
    databases: ['aperture', 'sideline'],
    readRecorded: (database) => `${database}-hash`,
    computeHash: async (database) => {
      checked.push(database);
      return `${database}-hash`;
    }
  });

  assert.deepEqual(checked, ['aperture', 'sideline']);
});

test('assertServedSnapshotsMatch throws a clear fatal error for missing or drifted snapshots', async () => {
  await assert.rejects(
    () => assertServedSnapshotsMatch({
      databases: ['aperture', 'sideline'],
      readRecorded: (database) => {
        if (database === 'aperture') throw new Error('recorded snapshot missing');
        return 'expected-sideline-hash';
      },
      computeHash: async () => 'actual-sideline-hash'
    }),
    (error: unknown) => {
      assert.ok(error instanceof SnapshotGuardError);
      assert.match(error.message, /Serve-time snapshot check failed/);
      assert.match(error.message, /aperture: recorded snapshot missing/);
      assert.match(error.message, /sideline: snapshot drift detected/);
      assert.equal(error.failures.length, 2);
      return true;
    }
  );
});
