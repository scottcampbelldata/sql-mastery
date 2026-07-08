import { createQueryService } from '../query-service';

export interface ColumnInfo {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export type JoinPair = ForeignKey;

export interface TableCatalog {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  foreignKeys: ForeignKey[];
}

export interface Catalog {
  database: string;
  tables: TableCatalog[];
}

interface DescribedColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  foreignKey?: {
    table: string;
    column: string;
  } | null;
}

interface DescribedTable {
  schema: string;
  name: string;
  columns: DescribedColumn[];
}

interface DescribedDatabase {
  database: string;
  tables: DescribedTable[];
}

const NUMERIC_TYPE = /^(smallint|integer|bigint|int2|int4|int8|int|smallserial|bigserial|serial|numeric|decimal|real|double precision|money|float4|float8)/;
const TEXT_TYPE = /^(text|character varying|character|varchar|bpchar|char|citext|uuid|name)/;
const DATE_TYPE = /^(timestamptz|timestamp|date|timetz|time|interval)/;
const BOOL_TYPE = /^bool/;

export async function loadCatalog(database: string): Promise<Catalog> {
  const service = createQueryService();

  try {
    const described = await service.describeDatabase({ database }) as DescribedDatabase;
    const rawTables = Array.isArray(described.tables) ? described.tables : [];
    return {
      database: described.database,
      tables: rawTables.map((table) => {
        const rawColumns = Array.isArray(table.columns) ? table.columns : [];
        const columns = rawColumns.map((column) => ({
          name: column.name,
          dataType: column.type,
          isNullable: column.nullable,
          isPrimaryKey: column.isPrimaryKey
        }));

        return {
          schema: table.schema,
          name: table.name,
          columns,
          primaryKey: columns.filter((column) => column.isPrimaryKey).map((column) => column.name),
          foreignKeys: rawColumns
            .filter((column) => !!column.foreignKey)
            .map((column) => ({
              fromTable: table.name,
              fromColumn: column.name,
              toTable: column.foreignKey!.table,
              toColumn: column.foreignKey!.column
            }))
        };
      })
    };
  } finally {
    await service.close();
  }
}

export function numericCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsMatching(catalog, table, NUMERIC_TYPE);
}

export function textCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsMatching(catalog, table, TEXT_TYPE);
}

export function dateCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsMatching(catalog, table, DATE_TYPE);
}

export function boolCols(catalog: Catalog, table: string): ColumnInfo[] {
  return colsMatching(catalog, table, BOOL_TYPE);
}

export function nullableCols(catalog: Catalog, table: string): ColumnInfo[] {
  const found = findTable(catalog, table);
  if (!found) return [];
  return found.columns.filter((column) => column.isNullable).map(copyColumn);
}

export function pk(catalog: Catalog, table: string): string[] {
  return findTable(catalog, table)?.primaryKey.slice() ?? [];
}

export function fksFrom(catalog: Catalog, table: string): ForeignKey[] {
  return findTable(catalog, table)?.foreignKeys.map(copyForeignKey) ?? [];
}

export function fksTo(catalog: Catalog, table: string): ForeignKey[] {
  return catalog.tables
    .flatMap((catalogTable) => catalogTable.foreignKeys)
    .filter((foreignKey) => foreignKey.toTable === table)
    .map(copyForeignKey);
}

export function joinPairs(catalog: Catalog): JoinPair[] {
  return catalog.tables
    .flatMap((table) => table.foreignKeys)
    .map(copyForeignKey);
}

function findTable(catalog: Catalog, table: string): TableCatalog | undefined {
  return catalog.tables.find((catalogTable) => catalogTable.name === table);
}

function colsMatching(catalog: Catalog, table: string, pattern: RegExp): ColumnInfo[] {
  const found = findTable(catalog, table);
  if (!found) return [];
  return found.columns
    .filter((column) => pattern.test(column.dataType.toLowerCase()))
    .map(copyColumn);
}

function copyColumn(column: ColumnInfo): ColumnInfo {
  return { ...column };
}

function copyForeignKey(foreignKey: ForeignKey): ForeignKey {
  return { ...foreignKey };
}
