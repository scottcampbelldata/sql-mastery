import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import { createQueryService } from './query-service';

export interface QueryLike {
  describeDatabase(input: { database: string }): Promise<{
    database: string;
    tables: Array<{
      schema: string;
      name: string;
      columns: Array<{ name: string; type?: string; dataType?: string; nullable?: boolean; isNullable?: boolean; position?: number }>;
    }>;
  }>;
  executeQuery(input: { database: string; sql: string; rowMode?: 'array' }): Promise<{
    columns?: string[];
    rows: any[];
    rowCount: number;
  }>;
  close?: () => Promise<void>;
}

function quoteIdent(value: string): string {
  return '"' + value.replace(/"/g, '""') + '"';
}

function columnType(column: { type?: string; dataType?: string }): string {
  return column.type || column.dataType || '';
}

function columnNullable(column: { nullable?: boolean; isNullable?: boolean }): boolean {
  return typeof column.nullable === 'boolean' ? column.nullable : column.isNullable === true;
}

function columnPosition(column: { position?: number }, index: number): number {
  return typeof column.position === 'number' ? column.position : index + 1;
}

function rowValue(row: any, key: string, index: number): string {
  if (Array.isArray(row)) return String(row[index] ?? '');
  return String(row?.[key] ?? '');
}

export function snapshotFilePath(database: string): string {
  return path.join(__dirname, '..', '..', 'scripts', 'snapshots', `${database}.snapshot.${'json'}`);
}

export async function computeSnapshotHash(
  database: string,
  deps: { service?: QueryLike } = {}
): Promise<string> {
  const ownsService = !deps.service;
  const service: QueryLike = deps.service || (createQueryService() as unknown as QueryLike);

  try {
    const schema = await service.describeDatabase({ database });
    const tables = [...schema.tables].sort((a, b) =>
      `${a.schema}.${a.name}`.localeCompare(`${b.schema}.${b.name}`)
    );

    const hash = createHash('sha256');
    hash.update(`db:${database}\n`);

    for (const table of tables) {
      const columns = [...table.columns]
        .sort((a, b) => columnPosition(a, 0) - columnPosition(b, 0))
        .map((column, index) =>
          `${column.name}:${columnType(column)}:${columnNullable(column) ? 1 : 0}:${columnPosition(column, index)}`
        )
        .join(',');
      hash.update(`table:${table.schema}.${table.name}|cols:${columns}\n`);

      const rel = `${quoteIdent(table.schema)}.${quoteIdent(table.name)}`;
      const digestSql =
        `SELECT COUNT(*) AS n, ` +
        `COALESCE(MD5(STRING_AGG(x.rowtext, ',' ORDER BY x.rowtext)), '') AS d ` +
        `FROM (SELECT (r)::text AS rowtext FROM ${rel} r) x`;
      const result = await service.executeQuery({ database, sql: digestSql, rowMode: 'array' });
      const row = (result.rows && result.rows[0]) || {};
      hash.update(`rows:${rowValue(row, 'n', 0)}|digest:${rowValue(row, 'd', 1)}\n`);
    }

    return hash.digest('hex');
  } finally {
    if (ownsService && typeof service.close === 'function') {
      await service.close();
    }
  }
}

export function readServedSnapshot(database: string): string | null {
  const file = snapshotFilePath(database);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as { snapshotHash?: unknown };
      if (typeof record.snapshotHash === 'string') return record.snapshotHash;
    }
    return null;
  } catch {
    return null;
  }
}

export async function recordSnapshot(
  database: string,
  deps: { service?: QueryLike } = {}
): Promise<string> {
  const hash = await computeSnapshotHash(database, deps);
  const file = snapshotFilePath(database);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ database, snapshotHash: hash }, null, 2) + '\n');
  return hash;
}
