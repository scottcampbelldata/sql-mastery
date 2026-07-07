import { DbClient } from './types';

export function rowsPerChunk(columnCount: number, rowCap = 1000): number {
  return Math.min(rowCap, Math.floor(65535 / columnCount));
}

export async function insertRows(
  client: DbClient,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  rowCap = 1000
): Promise<void> {
  if (rows.length === 0) return;

  const chunkSize = rowsPerChunk(columns.length, rowCap);
  const columnList = columns.join(', ');

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const params: unknown[] = [];
    const valueGroups: string[] = [];

    for (const row of chunk) {
      const placeholders: string[] = [];
      for (const col of columns) {
        params.push(row[col]);
        placeholders.push(`$${params.length}`);
      }
      valueGroups.push(`(${placeholders.join(', ')})`);
    }

    const text = `INSERT INTO ${table} (${columnList}) VALUES ${valueGroups.join(', ')}`;
    await client.query(text, params);
  }
}
