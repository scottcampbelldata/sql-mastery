const { Pool: DefaultPool } = require('pg');
const {
  buildClientConfig,
  getDatabaseNames,
  isAllowedDatabase
} = require('./db-config');

class QueryServiceError extends Error {
  constructor(message, statusCode, code, extras = {}) {
    super(message);
    this.name = 'QueryServiceError';
    this.statusCode = statusCode;
    this.code = code;
    Object.assign(this, extras);
  }
}

function makePgError(error) {
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

function normalizeCell(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function normalizeRows(result) {
  return result.rows.map((row) => result.columns.map((column) => normalizeCell(row[column])));
}

function boundedLimit(value, fallback = 20, max = 100) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function quoteIdentifier(value) {
  const identifier = typeof value === 'string' ? value.trim() : '';
  if (!identifier) {
    throw new QueryServiceError('Schema and table names are required.', 400, 'MISSING_TABLE_NAME');
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

function isTruthyDatabaseFlag(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function parseEstimatedRows(value) {
  const rows = Number(value);
  return Number.isFinite(rows) && rows >= 0 ? rows : null;
}

function groupSchemaRows(database, rows) {
  const tables = [];
  const byKey = new Map();

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

function arraysMatch(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function hintForError(error) {
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

function mismatchFeedback(userResult, expectedResult) {
  if (!arraysMatch(userResult.columns, expectedResult.columns)) {
    return {
      reason: 'columns',
      hint: 'Your query ran, but the output columns do not match. Check the SELECT list, aliases, and column order.'
    };
  }

  if (userResult.rows.length !== expectedResult.rows.length) {
    return {
      reason: 'row-count',
      hint: 'Your query ran, but it returned a different number of rows. Check filters, joins, grouping, and LIMIT.'
    };
  }

  if (!arraysMatch(normalizeRows(userResult), normalizeRows(expectedResult))) {
    return {
      reason: 'row-values',
      hint: 'Your query returned the right shape, but the values or row order differ. Check expressions, NULL handling, and ORDER BY.'
    };
  }

  return null;
}

function createQueryService(options = {}) {
  const Pool = options.Pool || DefaultPool;
  const env = options.env || process.env;
  const clock = options.clock || (() => Date.now());
  const pools = new Map();

  function listDatabases() {
    return getDatabaseNames(env);
  }

  function getPool(database) {
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

  async function executeQuery(input = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql.trim() : '';

    if (!sql) {
      throw new QueryServiceError('SQL is required.', 400, 'EMPTY_SQL');
    }

    if (sql.length > 200000) {
      throw new QueryServiceError('SQL is too large to run from the browser.', 400, 'SQL_TOO_LARGE');
    }

    const startedAt = clock();

    try {
      const result = await getPool(database).query(sql);
      const durationMs = Math.max(0, Math.round(clock() - startedAt));
      const rows = Array.isArray(result.rows) ? result.rows : [];

      return {
        database,
        sql,
        columns: Array.isArray(result.fields) ? result.fields.map((field) => field.name) : [],
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

  async function describeDatabase(input = {}) {
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

  async function previewTable(input = {}) {
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
        columns: Array.isArray(result.fields) ? result.fields.map((field) => field.name) : [],
        rows,
        rowCount: rows.length,
        durationMs
      };
    } catch (error) {
      if (error instanceof QueryServiceError) throw error;
      throw makePgError(error);
    }
  }

  async function checkQuery(input = {}) {
    const database = input.database;
    const sql = typeof input.sql === 'string' ? input.sql : '';
    const expectedSql = typeof input.expectedSql === 'string' ? input.expectedSql.trim() : '';

    if (!expectedSql) {
      throw new QueryServiceError('This exercise does not have a checkable answer yet.', 400, 'MISSING_EXPECTED_SQL');
    }

    let userResult;
    try {
      userResult = await executeQuery({ database, sql });
    } catch (error) {
      return {
        correct: false,
        feedbackType: 'error',
        message: error.message || 'Your SQL did not run.',
        code: error.code || 'QUERY_FAILED',
        hint: hintForError(error),
        detail: error.detail,
        position: error.position
      };
    }

    let expectedResult;
    try {
      expectedResult = await executeQuery({ database, sql: expectedSql });
    } catch (error) {
      throw new QueryServiceError(
        'The stored answer for this exercise could not be checked.',
        500,
        'EXPECTED_QUERY_FAILED',
        { detail: error.message }
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
        result: userResult,
        expectedSummary
      };
    }

    return {
      correct: true,
      feedbackType: 'success',
      message: 'You got it right.',
      why: 'Your columns, row count, row values, and row order match the model answer on this database.',
      result: userResult,
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

module.exports = {
  QueryServiceError,
  createQueryService
};
