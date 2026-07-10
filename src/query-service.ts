import { Pool as DefaultPool } from 'pg';
import {
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase
} from './db-config';
import {
  hashRowsOrdered,
  hashRowsUnordered,
  normalizeCell,
  toPositionalRows,
  type Fingerprint
} from './fingerprint';

class QueryServiceError extends Error {
  statusCode?: number;
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  [key: string]: any;

  constructor(message: string, statusCode?: number, code?: string, extras: Record<string, any> = {}) {
    super(message);
    this.name = 'QueryServiceError';
    this.statusCode = statusCode;
    this.code = code;
    Object.assign(this, extras);
  }
}

function makePgError(error: any): QueryServiceError {
  const message = error.message || 'Query failed.';

  if (/SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be (a |a non-empty )?string/.test(message)) {
    return new QueryServiceError(
      'PostgreSQL requires a password. Set PGPASSWORD in .env and restart npm start.',
      503,
      'MISSING_DATABASE_PASSWORD'
    );
  }

  if (error.code === '28P01') {
    return new QueryServiceError(
      'PostgreSQL rejected the configured username or password.',
      503,
      'DATABASE_AUTH_FAILED'
    );
  }

  if (error.code === 'ECONNREFUSED') {
    return new QueryServiceError(
      'Could not connect to PostgreSQL on the configured host and port.',
      503,
      'DATABASE_UNAVAILABLE'
    );
  }

  return new QueryServiceError(error.message || 'Query failed.', 400, error.code || 'QUERY_FAILED', {
    detail: error.detail,
    hint: error.hint,
    position: error.position
  });
}

function normalizeRowsByName(result: any): (string | null)[][] {
  return result.rows.map((row: any) => result.columns.map((column: string) => normalizeCell(row[column])));
}

function normalizeRows(result: any): (string | null)[][] {
  if (!Array.isArray(result.rows) || result.rows.some((row: any) => !Array.isArray(row))) {
    throw new QueryServiceError('Fingerprint checks require array-mode query results.', 500, 'ARRAY_ROW_MODE_REQUIRED');
  }

  return toPositionalRows({
    fields: Array.isArray(result.fields) ? result.fields : [],
    rows: result.rows
  });
}

// Convert an array-mode result (rowMode 'array', positional rows) into the object-keyed
// shape the client's QueryResult contract expects for display. Fingerprint grading needs
// positional rows, but the learner-facing result must be keyed by column name or the
// client DataTable (which reads row[columnName]) renders every cell as NULL. Object-mode
// rows pass through unchanged, so this is a safe no-op on the legacy expectedSql path.
function toDisplayResult(result: any): any {
  const fields = Array.isArray(result.fields) ? result.fields : [];
  const names = fields.map((field: any) => field.name);
  const rows = Array.isArray(result.rows)
    ? result.rows.map((row: any) => {
        if (!Array.isArray(row)) return row;
        const record: Record<string, unknown> = {};
        for (let i = 0; i < names.length; i++) record[names[i]] = row[i];
        return record;
      })
    : [];
  return { ...result, rows };
}

function boundedLimit(value: unknown, fallback = 20, max = 100): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function quoteIdentifier(value: unknown): string {
  const identifier = typeof value === 'string' ? value.trim() : '';
  if (!identifier) {
    throw new QueryServiceError('Schema and table names are required.', 400, 'MISSING_TABLE_NAME');
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function isTruthyDatabaseFlag(value: any): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function parseEstimatedRows(value: any): number | null {
  const rows = Number(value);
  return Number.isFinite(rows) && rows >= 0 ? rows : null;
}

const READ_ONLY_STARTERS = new Set(['SELECT', 'WITH']);
const WRITE_OR_ADMIN_KEYWORDS = new Set([
  'ALTER', 'ANALYZE', 'BEGIN', 'CALL', 'CLUSTER', 'COMMENT', 'COMMIT', 'COPY',
  'CREATE', 'DEALLOCATE', 'DELETE', 'DO', 'DROP', 'EXECUTE', 'GRANT', 'INSERT',
  'LISTEN', 'LOCK', 'MERGE', 'NOTIFY', 'PREPARE', 'REFRESH', 'REINDEX', 'RESET',
  'REVOKE', 'ROLLBACK', 'SET', 'TRUNCATE', 'UPDATE', 'VACUUM'
]);
const WRITE_OR_VOLATILE_FUNCTIONS = new Set(['NEXTVAL', 'SETVAL']);

function sqlWordsOutsideLiterals(sql: string): string[] {
  const words: string[] = [];
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === '-' && next === '-') {
      i += 2;
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
      i = Math.min(sql.length, i + 2);
      continue;
    }

    if (ch === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === '$') {
      const tagMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end >= 0 ? end + tag.length : sql.length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_$]/.test(sql[j])) j += 1;
      words.push(sql.slice(i, j).toUpperCase());
      i = j;
      continue;
    }

    i += 1;
  }

  return words;
}

function assertReadOnlySql(sql: string): void {
  const words = sqlWordsOutsideLiterals(sql);
  const starter = words[0];
  if (!starter || !READ_ONLY_STARTERS.has(starter)) {
    throw new QueryServiceError('Only read-only SELECT queries can be run from the browser.', 400, 'READ_ONLY_SQL_REQUIRED');
  }

  const unsafe = words.find((word) => WRITE_OR_ADMIN_KEYWORDS.has(word) || WRITE_OR_VOLATILE_FUNCTIONS.has(word));
  if (unsafe) {
    throw new QueryServiceError('Only read-only SELECT queries can be run from the browser.', 400, 'READ_ONLY_SQL_REQUIRED');
  }
}

function groupSchemaRows(database: string, rows: any[]): any {
  const tables: any[] = [];
  const byKey = new Map<string, any>();

  rows.forEach((row) => {
    const schema = row.table_schema;
    const name = row.table_name;
    const key = `${schema}.${name}`;

    if (!byKey.has(key)) {
      const table = {
        schema,
        name,
        estimatedRows: parseEstimatedRows(row.estimated_rows),
        columns: []
      };
      byKey.set(key, table);
      tables.push(table);
    }

    byKey.get(key).columns.push({
      name: row.column_name,
      type: row.formatted_type || row.data_type || '',
      nullable: row.is_nullable === 'YES' || row.is_nullable === true,
      defaultValue: row.column_default || null,
      position: Number(row.ordinal_position),
      isPrimaryKey: isTruthyDatabaseFlag(row.is_primary_key),
      foreignKey: row.foreign_table_name
        ? {
            schema: row.foreign_table_schema,
            table: row.foreign_table_name,
            column: row.foreign_column_name
          }
        : null
    });
  });

  return {
    database,
    tables,
    stats: {
      tableCount: tables.length,
      columnCount: tables.reduce((sum, table) => sum + table.columns.length, 0)
    }
  };
}

function arraysMatch(left: any, right: any): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hintForError(error: any): string {
  if (error.code === 'EMPTY_SQL') {
    return 'Type a SELECT query before running the check.';
  }
  if (error.code === '42601') {
    return 'PostgreSQL found a syntax problem. Check commas, parentheses, quotes, and keyword order near the reported position.';
  }
  if (error.code === '42703') {
    return 'PostgreSQL could not find one of your columns. Check the table map for the exact column name and alias spelling.';
  }
  if (error.code === '42P01') {
    return 'PostgreSQL could not find one of your tables. Check the selected database and whether the table needs a schema prefix.';
  }
  if (error.code === '42803') {
    return 'Your SELECT list and GROUP BY do not agree. Every non-aggregated selected column must be grouped.';
  }
  if (error.code === '42883') {
    return 'PostgreSQL could not find a matching function or operator. Check casts and argument types.';
  }

  return 'Read the database error, then compare your SELECT, FROM, WHERE, GROUP BY, ORDER BY, and LIMIT against the task.';
}

function rowMultiset(rows: (string | null)[][]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = JSON.stringify(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function multisetDiff(userRows: (string | null)[][], expectedRows: (string | null)[][]): { extra: number; missing: number } {
  const inUser = rowMultiset(userRows);
  const inExpected = rowMultiset(expectedRows);
  let extra = 0;
  let missing = 0;
  for (const [key, n] of inUser) extra += Math.max(0, n - (inExpected.get(key) || 0));
  for (const [key, n] of inExpected) missing += Math.max(0, n - (inUser.get(key) || 0));
  return { extra, missing };
}

function mismatchFeedback(userResult: any, expectedResult: any): any {
  const yourRowCount = userResult.rows.length;
  const expectedRowCount = expectedResult.rows.length;

  if (!arraysMatch(userResult.columns, expectedResult.columns)) {
    return {
      reason: 'columns',
      hint: 'Your query ran, but the output columns do not match. Check the SELECT list, aliases, and column order.',
      diff: {
        reason: 'columns',
        yourColumns: userResult.columns,
        expectedColumns: expectedResult.columns,
        yourRowCount, expectedRowCount, orderOnly: false, extraRows: 0, missingRows: 0
      }
    };
  }

  const userRows = normalizeRowsByName(userResult);
  const expectedRows = normalizeRowsByName(expectedResult);
  const { extra, missing } = multisetDiff(userRows, expectedRows);

  if (yourRowCount !== expectedRowCount) {
    return {
      reason: 'row-count',
      hint: 'Your query ran, but it returned a different number of rows. Check filters, joins, grouping, and LIMIT.',
      diff: { reason: 'row-count', yourRowCount, expectedRowCount, orderOnly: false, extraRows: extra, missingRows: missing }
    };
  }

  if (!arraysMatch(userRows, expectedRows)) {
    return {
      reason: 'row-values',
      hint: 'Your query returned the right shape, but the values or row order differ. Check expressions, NULL handling, and ORDER BY.',
      diff: { reason: 'row-values', yourRowCount, expectedRowCount, orderOnly: extra === 0 && missing === 0, extraRows: extra, missingRows: missing }
    };
  }

  return null;
}

function isFingerprint(value: any): value is Fingerprint {
  return !!value
    && Array.isArray(value.columns)
    && typeof value.rowCount === 'number'
    && typeof value.orderedRowHash === 'string'
    && typeof value.unorderedRowHash === 'string';
}

function learningErrorFeedback(error: any): any {
  const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
  return {
    correct: false,
    feedbackType: 'error',
    message: err.message || 'Your SQL did not run.',
    code: err.code || 'QUERY_FAILED',
    hint: hintForError(error),
    detail: err.detail,
    position: err.position
  };
}

function fingerprintMismatchFeedback(userResult: any, fingerprint: Fingerprint, orderMatters: boolean): any {
  const yourRowCount = userResult.rows.length;
  const expectedRowCount = fingerprint.rowCount;

  if (!arraysMatch(userResult.columns, fingerprint.columns)) {
    return {
      reason: 'columns',
      hint: 'Your query ran, but the output columns do not match. Check the SELECT list, aliases, and column order.',
      diff: {
        reason: 'columns',
        yourColumns: userResult.columns,
        expectedColumns: fingerprint.columns,
        yourRowCount,
        expectedRowCount,
        orderOnly: false,
        extraRows: 0,
        missingRows: 0
      }
    };
  }

  if (yourRowCount !== expectedRowCount) {
    return {
      reason: 'row-count',
      hint: 'Your query ran, but it returned a different number of rows. Check filters, joins, grouping, and LIMIT.',
      diff: {
        reason: 'row-count',
        yourRowCount,
        expectedRowCount,
        orderOnly: false,
        extraRows: Math.max(0, yourRowCount - expectedRowCount),
        missingRows: Math.max(0, expectedRowCount - yourRowCount)
      }
    };
  }

  const userRows = normalizeRows(userResult);
  const orderedRowHash = hashRowsOrdered(userRows);
  const unorderedRowHash = hashRowsUnordered(userRows);
  const matches = orderMatters
    ? orderedRowHash === fingerprint.orderedRowHash
    : unorderedRowHash === fingerprint.unorderedRowHash;

  if (!matches) {
    return {
      reason: 'row-values',
      hint: orderMatters
        ? 'Your query returned the right shape, but the values or row order differ. Check expressions, NULL handling, and ORDER BY.'
        : 'Your query returned the right shape, but the values differ. Check expressions, filters, joins, grouping, and NULL handling.',
      diff: {
        reason: 'row-values',
        yourRowCount,
        expectedRowCount,
        orderOnly: orderMatters && unorderedRowHash === fingerprint.unorderedRowHash,
        extraRows: 0,
        missingRows: 0
      }
    };
  }

  return null;
}

function createQueryService(options: any = {}): any {
  const Pool = options.Pool || DefaultPool;
  const env = options.env || process.env;
  const clock = options.clock || (() => Date.now());
  const pools = new Map<string, any>();

  function listDatabases() {
    return getDatabaseNames(env);
  }

  function getPool(database: string) {
    if (!database || !isAllowedDatabase(database, env)) {
      throw new QueryServiceError(`Unknown database "${database || ''}".`, 400, 'UNKNOWN_DATABASE');
    }

    if (!pools.has(database)) {
      pools.set(database, new Pool({
        ...buildClientConfig(database, env),
        max: Number(env.SQL_MASTERY_POOL_SIZE || 4)
      }));
    }

    return pools.get(database);
  }

  async function executeQuery(input: any = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql.trim() : '';

    if (!sql) {
      throw new QueryServiceError('SQL is required.', 400, 'EMPTY_SQL');
    }

    if (sql.length > 200000) {
      throw new QueryServiceError('SQL is too large to run from the browser.', 400, 'SQL_TOO_LARGE');
    }

    assertReadOnlySql(sql);

    const startedAt = clock();

    try {
      const queryInput = input.rowMode === 'array' ? { text: sql, rowMode: 'array' } : sql;
      const pool = getPool(database);
      const result = typeof pool.connect === 'function'
        ? await runReadOnlyTransaction(pool, queryInput)
        : await pool.query(queryInput);
      const durationMs = Math.max(0, Math.round(clock() - startedAt));
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const fields = Array.isArray(result.fields) ? result.fields.map((field: any) => ({ name: field.name })) : [];

      return {
        database,
        sql,
        columns: fields.map((field: any) => field.name),
        fields,
        rows,
        rowCount: Number.isInteger(result.rowCount) ? result.rowCount : rows.length,
        command: result.command || 'QUERY',
        durationMs
      };
    } catch (error) {
      if (error instanceof QueryServiceError) throw error;
      throw makePgError(error);
    }
  }

  async function runReadOnlyTransaction(pool: any, queryInput: any) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      const result = await client.query(queryInput);
      await client.query('ROLLBACK');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original query failure.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function describeDatabase(input: any = {}) {
    const database = input.database;
    const sql = `
      WITH base_tables AS (
        SELECT t.table_schema, t.table_name
        FROM information_schema.tables t
        WHERE t.table_type = 'BASE TABLE'
          AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      ),
      column_types AS (
        SELECT n.nspname AS table_schema,
               c.relname AS table_name,
               a.attname AS column_name,
               pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE a.attnum > 0
          AND NOT a.attisdropped
      ),
      primary_keys AS (
        SELECT kcu.table_schema, kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
         AND kcu.table_name = tc.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ),
      foreign_keys AS (
        SELECT kcu.table_schema,
               kcu.table_name,
               kcu.column_name,
               ccu.table_schema AS foreign_table_schema,
               ccu.table_name AS foreign_table_name,
               ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema = tc.table_schema
         AND kcu.table_name = tc.table_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
      )
      SELECT cols.table_schema,
             cols.table_name,
             COALESCE(cls.reltuples, 0)::bigint AS estimated_rows,
             cols.column_name,
             COALESCE(ct.formatted_type, cols.data_type) AS formatted_type,
             cols.data_type,
             cols.is_nullable,
             cols.column_default,
             cols.ordinal_position,
             (pk.column_name IS NOT NULL) AS is_primary_key,
             fk.foreign_table_schema,
             fk.foreign_table_name,
             fk.foreign_column_name
      FROM information_schema.columns cols
      JOIN base_tables bt
        ON bt.table_schema = cols.table_schema
       AND bt.table_name = cols.table_name
      LEFT JOIN pg_namespace ns ON ns.nspname = cols.table_schema
      LEFT JOIN pg_class cls
        ON cls.relnamespace = ns.oid
       AND cls.relname = cols.table_name
       AND cls.relkind = 'r'
      LEFT JOIN column_types ct
        ON ct.table_schema = cols.table_schema
       AND ct.table_name = cols.table_name
       AND ct.column_name = cols.column_name
      LEFT JOIN primary_keys pk
        ON pk.table_schema = cols.table_schema
       AND pk.table_name = cols.table_name
       AND pk.column_name = cols.column_name
      LEFT JOIN foreign_keys fk
        ON fk.table_schema = cols.table_schema
       AND fk.table_name = cols.table_name
       AND fk.column_name = cols.column_name
      ORDER BY cols.table_schema, cols.table_name, cols.ordinal_position;
    `;

    try {
      const result = await getPool(database).query(sql);
      return groupSchemaRows(database, result.rows || []);
    } catch (error) {
      if (error instanceof QueryServiceError) throw error;
      throw makePgError(error);
    }
  }

  async function previewTable(input: any = {}) {
    const database = input.database;
    const schema = typeof input.schema === 'string' ? input.schema.trim() : '';
    const table = typeof input.table === 'string' ? input.table.trim() : '';
    const limit = boundedLimit(input.limit);

    if (!schema || !table) {
      throw new QueryServiceError('Schema and table names are required.', 400, 'MISSING_TABLE_NAME');
    }

    const pool = getPool(database);
    const existsSql = `
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema = $1
        AND table_name = $2;
    `;

    try {
      const exists = await pool.query(existsSql, [schema, table]);
      if (!exists.rows || !exists.rows.length) {
        throw new QueryServiceError(`Table "${schema}.${table}" was not found.`, 404, 'TABLE_NOT_FOUND');
      }

      const startedAt = clock();
      const result = await pool.query(`SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} LIMIT ${limit};`);
      const durationMs = Math.max(0, Math.round(clock() - startedAt));
      const rows = Array.isArray(result.rows) ? result.rows : [];

      return {
        database,
        schema,
        table,
        limit,
        columns: Array.isArray(result.fields) ? result.fields.map((field: any) => field.name) : [],
        rows,
        rowCount: rows.length,
        durationMs
      };
    } catch (error) {
      if (error instanceof QueryServiceError) throw error;
      throw makePgError(error);
    }
  }

  async function checkQuery(input: any = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql : '';
    const fingerprint = input.fingerprint;

    if (fingerprint !== undefined && fingerprint !== null) {
      if (!isFingerprint(fingerprint)) {
        throw new QueryServiceError('This exercise has an invalid result fingerprint.', 500, 'INVALID_FINGERPRINT');
      }

      let userResult;
      try {
        userResult = await executeQuery({ database, sql, rowMode: 'array' });
      } catch (error) {
        return learningErrorFeedback(error);
      }

      const expectedSummary = {
        columns: fingerprint.columns,
        rowCount: fingerprint.rowCount
      };
      const mismatch = fingerprintMismatchFeedback(userResult, fingerprint, input.orderMatters !== false);

      if (mismatch) {
        return {
          correct: false,
          feedbackType: 'mismatch',
          message: 'Your SQL ran, but it does not match the expected result yet.',
          reason: mismatch.reason,
          orderOnly: mismatch.diff.orderOnly,
          yourRowCount: mismatch.diff.yourRowCount,
          expectedRowCount: mismatch.diff.expectedRowCount,
          hint: mismatch.hint,
          diff: mismatch.diff,
          result: toDisplayResult(userResult),
          expectedSummary
        };
      }

      return {
        correct: true,
        feedbackType: 'success',
        message: 'You got it right.',
        why: input.orderMatters === false
          ? 'Your columns, row count, and row values match the model answer on this database.'
          : 'Your columns, row count, row values, and row order match the model answer on this database.',
        result: toDisplayResult(userResult),
        expectedSummary
      };
    }

    const expectedSql = typeof input.expectedSql === 'string' ? input.expectedSql.trim() : '';

    if (!expectedSql) {
      throw new QueryServiceError('This exercise does not have a checkable answer yet.', 400, 'MISSING_EXPECTED_SQL');
    }

    let userResult;
    try {
      userResult = await executeQuery({ database, sql });
    } catch (error) {
      return learningErrorFeedback(error);
    }

    let expectedResult;
    try {
      expectedResult = await executeQuery({ database, sql: expectedSql });
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      throw new QueryServiceError(
        'The stored answer for this exercise could not be checked.',
        500,
        'EXPECTED_QUERY_FAILED',
        { detail: err.message }
      );
    }

    const mismatch = mismatchFeedback(userResult, expectedResult);
    const expectedSummary = {
      columns: expectedResult.columns,
      rowCount: expectedResult.rows.length
    };

    if (mismatch) {
      return {
        correct: false,
        feedbackType: 'mismatch',
        message: 'Your SQL ran, but it does not match the expected result yet.',
        reason: mismatch.reason,
        hint: mismatch.hint,
        diff: mismatch.diff,
        result: toDisplayResult(userResult),
        expectedSummary
      };
    }

    return {
      correct: true,
      feedbackType: 'success',
      message: 'You got it right.',
      why: 'Your columns, row count, row values, and row order match the model answer on this database.',
      result: toDisplayResult(userResult),
      expectedSummary
    };
  }

  async function close() {
    await Promise.all(Array.from(pools.values(), (pool) => pool.end()));
    pools.clear();
  }

  return {
    checkQuery,
    close,
    describeDatabase,
    executeQuery,
    listDatabases,
    previewTable
  };
}

export {
  QueryServiceError,
  createQueryService,
  mismatchFeedback
};
