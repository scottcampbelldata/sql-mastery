export interface DbClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number }>;
}

export interface TableSpec {
  name: string;
  columns: string[]; // insert order = parents before children
}

export interface DatasetModule {
  DB_NAME: string;
  SCHEMA_FILE: string;
  SEED: number;
  VERSION: string;
  TABLES: TableSpec[];
  generate(seed: number): Record<string, Record<string, unknown>[]>;
}
