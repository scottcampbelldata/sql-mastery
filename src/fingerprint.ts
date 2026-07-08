import { createHash } from 'node:crypto';

// The ONLY hashing/normalization module. query-service and the generator both depend on it.
// fnv1a from prng.ts is reserved for PRNG stream derivation, NOT fingerprints.
export interface Fingerprint {
  columns: string[];
  rowCount: number;
  orderedRowHash: string;
  unorderedRowHash: string;
}

export function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function toPositionalRows(result: {
  fields: { name: string }[];
  rows: unknown[][];
}): (string | null)[][] {
  return result.rows.map((row) => row.map((cell) => normalizeCell(cell)));
}

export function rowKey(row: (string | null)[]): string {
  return JSON.stringify(row);
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashRowsOrdered(rows: (string | null)[][]): string {
  return sha256Hex(rows.map(rowKey).join('\n'));
}

export function hashRowsUnordered(rows: (string | null)[][]): string {
  return sha256Hex(rows.map(rowKey).sort().join('\n'));
}

export function buildFingerprint(result: {
  fields: { name: string }[];
  rows: unknown[][];
}): Fingerprint {
  const positional = toPositionalRows(result);
  return {
    columns: result.fields.map((field) => field.name),
    rowCount: positional.length,
    orderedRowHash: hashRowsOrdered(positional),
    unorderedRowHash: hashRowsUnordered(positional)
  };
}
