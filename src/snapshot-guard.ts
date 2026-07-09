import * as fs from 'node:fs';

import { getDatabaseNames } from './db-config';
import { computeSnapshotHash, snapshotFilePath } from './snapshot';

export interface SnapshotGuardDeps {
  databases?: string[];
  computeHash?: (database: string) => Promise<string>;
  readRecorded?: (database: string) => string;
}

export interface SnapshotGuardFailure {
  database: string;
  expected?: string;
  actual?: string;
  message: string;
}

export class SnapshotGuardError extends Error {
  failures: SnapshotGuardFailure[];

  constructor(failures: SnapshotGuardFailure[]) {
    super(formatSnapshotGuardMessage(failures));
    this.name = 'SnapshotGuardError';
    this.failures = failures;
  }
}

export function recordedSnapshotPath(database: string): string {
  return snapshotFilePath(database);
}

export function parseRecordedSnapshot(raw: string, database: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Recorded snapshot for "${database}" is not valid JSON.`);
  }

  if (typeof parsed === 'string') return parsed;

  if (parsed && typeof parsed === 'object') {
    const record = parsed as { snapshotHash?: unknown };
    if (typeof record.snapshotHash === 'string') return record.snapshotHash;
  }

  throw new Error(`Recorded snapshot for "${database}" must be a string or { snapshotHash }.`);
}

export function readRecordedSnapshot(database: string): string {
  const file = recordedSnapshotPath(database);
  if (!fs.existsSync(file)) {
    throw new Error(`Recorded snapshot for "${database}" was not found at ${file}.`);
  }

  return parseRecordedSnapshot(fs.readFileSync(file, 'utf8'), database);
}

function formatShort(hash: string | undefined): string {
  return hash ? hash.slice(0, 12) : 'unavailable';
}

function formatSnapshotGuardMessage(failures: SnapshotGuardFailure[]): string {
  const details = failures
    .map((failure) => {
      const drift = failure.expected && failure.actual
        ? ` expected ${formatShort(failure.expected)} but live ${formatShort(failure.actual)}.`
        : '';
      return `${failure.database}: ${failure.message}${drift}`;
    })
    .join(' ');

  return `Serve-time snapshot check failed. The live database snapshots must match the validated snapshots before the server can start. ${details}`;
}

export async function assertServedSnapshotsMatch(deps: SnapshotGuardDeps = {}): Promise<void> {
  const databases = deps.databases || getDatabaseNames();
  const computeHash = deps.computeHash || computeSnapshotHash;
  const readRecorded = deps.readRecorded || readRecordedSnapshot;
  const failures: SnapshotGuardFailure[] = [];

  for (const database of databases) {
    let expected: string;
    try {
      expected = readRecorded(database);
    } catch (error) {
      failures.push({
        database,
        message: (error as Error).message || 'recorded snapshot is unavailable'
      });
      continue;
    }

    let actual: string;
    try {
      actual = await computeHash(database);
    } catch (error) {
      failures.push({
        database,
        expected,
        message: `could not compute live snapshot: ${(error as Error).message}`
      });
      continue;
    }

    if (actual !== expected) {
      failures.push({
        database,
        expected,
        actual,
        message: 'snapshot drift detected'
      });
    }
  }

  if (failures.length) {
    throw new SnapshotGuardError(failures);
  }
}
