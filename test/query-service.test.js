const test = require('node:test');
const assert = require('node:assert/strict');

const { createQueryService, QueryServiceError } = require('../src/query-service');

class FakePool {
  static configs = [];
  static queries = [];
  static result = {
    command: 'SELECT',
    rowCount: 1,
    fields: [{ name: 'answer' }],
    rows: [{ answer: 42 }]
  };

  constructor(config) {
    this.config = config;
    FakePool.configs.push(config);
  }

  async query(sql) {
    FakePool.queries.push(sql);
    return FakePool.result;
  }

  async end() {}
}

test('executeQuery connects to the selected local database and formats results', async () => {
  FakePool.configs = [];
  FakePool.queries = [];
  FakePool.result = {
    command: 'SELECT',
    rowCount: 1,
    fields: [{ name: 'answer' }, { name: 'label' }],
    rows: [{ answer: 42, label: 'life' }]
  };

  const service = createQueryService({
    Pool: FakePool,
    env: { SQL_MASTERY_DATABASES: 'northwind,chinook', PGUSER: 'scott' },
    clock: () => 100
  });

  const result = await service.executeQuery({
    database: 'northwind',
    sql: 'SELECT 42 AS answer'
  });

  assert.equal(FakePool.configs[0].database, 'northwind');
  assert.equal(FakePool.configs[0].user, 'scott');
  assert.deepEqual(FakePool.queries, ['SELECT 42 AS answer']);
  assert.deepEqual(result.columns, ['answer', 'label']);
  assert.deepEqual(result.rows, [{ answer: 42, label: 'life' }]);
  assert.equal(result.command, 'SELECT');
  assert.equal(result.rowCount, 1);
  assert.equal(result.database, 'northwind');
  assert.equal(typeof result.durationMs, 'number');
});

test('executeQuery rejects empty SQL with a structured validation error', async () => {
  const service = createQueryService({ Pool: FakePool, env: {} });

  await assert.rejects(
    () => service.executeQuery({ database: 'northwind', sql: '   ' }),
    (error) => {
      assert.ok(error instanceof QueryServiceError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'EMPTY_SQL');
      return true;
    }
  );
});

test('executeQuery rejects databases outside the configured list', async () => {
  const service = createQueryService({
    Pool: FakePool,
    env: { SQL_MASTERY_DATABASES: 'northwind' }
  });

  await assert.rejects(
    () => service.executeQuery({ database: 'nyctaxi', sql: 'SELECT 1' }),
    (error) => {
      assert.ok(error instanceof QueryServiceError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'UNKNOWN_DATABASE');
      return true;
    }
  );
});

test('executeQuery maps missing SCRAM passwords to a setup error', async () => {
  class AuthPool {
    async query() {
      throw new Error('SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string');
    }

    async end() {}
  }

  const service = createQueryService({ Pool: AuthPool, env: {} });

  await assert.rejects(
    () => service.executeQuery({ database: 'chinook', sql: 'SELECT 1' }),
    (error) => {
      assert.ok(error instanceof QueryServiceError);
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, 'MISSING_DATABASE_PASSWORD');
      assert.match(error.message, /PGPASSWORD/);
      return true;
    }
  );
});

test('checkQuery returns success when user and expected result sets match', async () => {
  class QueuePool {
    static results = [
      {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'ok' }],
        rows: [{ ok: 1 }]
      },
      {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'ok' }],
        rows: [{ ok: 1 }]
      }
    ];

    async query() {
      return QueuePool.results.shift();
    }

    async end() {}
  }

  const service = createQueryService({ Pool: QueuePool, env: {} });
  const feedback = await service.checkQuery({
    database: 'chinook',
    sql: 'SELECT 1 AS ok',
    expectedSql: 'SELECT 1 AS ok'
  });

  assert.equal(feedback.correct, true);
  assert.equal(feedback.feedbackType, 'success');
  assert.match(feedback.message, /You got it right/);
  assert.deepEqual(feedback.result.rows, [{ ok: 1 }]);
});

test('checkQuery explains column mismatches without exposing expected rows', async () => {
  class QueuePool {
    static results = [
      {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'wrong_name' }],
        rows: [{ wrong_name: 1 }]
      },
      {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'ok' }],
        rows: [{ ok: 1 }]
      }
    ];

    async query() {
      return QueuePool.results.shift();
    }

    async end() {}
  }

  const service = createQueryService({ Pool: QueuePool, env: {} });
  const feedback = await service.checkQuery({
    database: 'chinook',
    sql: 'SELECT 1 AS wrong_name',
    expectedSql: 'SELECT 1 AS ok'
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.feedbackType, 'mismatch');
  assert.equal(feedback.reason, 'columns');
  assert.match(feedback.hint, /SELECT list/);
  assert.deepEqual(feedback.expectedSummary, { columns: ['ok'], rowCount: 1 });
  assert.equal(feedback.expectedRows, undefined);
});

test('checkQuery turns SQL errors into learning feedback', async () => {
  class ErrorPool {
    async query() {
      const error = new Error('column "bad_column" does not exist');
      error.code = '42703';
      throw error;
    }

    async end() {}
  }

  const service = createQueryService({ Pool: ErrorPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'chinook',
    sql: 'SELECT bad_column FROM orders',
    expectedSql: 'SELECT order_id FROM orders'
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.feedbackType, 'error');
  assert.equal(feedback.code, '42703');
  assert.match(feedback.hint, /column/i);
});

test('describeDatabase groups table columns with key metadata', async () => {
  class SchemaPool {
    async query(sql) {
      assert.match(sql, /information_schema\.columns/);
      return {
        fields: [],
        rows: [
          {
            table_schema: 'public',
            table_name: 'orders',
            estimated_rows: '830',
            column_name: 'order_id',
            formatted_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            ordinal_position: 1,
            is_primary_key: true,
            foreign_table_schema: null,
            foreign_table_name: null,
            foreign_column_name: null
          },
          {
            table_schema: 'public',
            table_name: 'orders',
            estimated_rows: '830',
            column_name: 'customer_id',
            formatted_type: 'integer',
            is_nullable: 'YES',
            column_default: null,
            ordinal_position: 2,
            is_primary_key: false,
            foreign_table_schema: 'public',
            foreign_table_name: 'customers',
            foreign_column_name: 'customer_id'
          }
        ]
      };
    }

    async end() {}
  }

  const service = createQueryService({
    Pool: SchemaPool,
    env: { SQL_MASTERY_DATABASES: 'northwind' }
  });

  const schema = await service.describeDatabase({ database: 'northwind' });

  assert.equal(schema.database, 'northwind');
  assert.equal(schema.stats.tableCount, 1);
  assert.equal(schema.stats.columnCount, 2);
  assert.equal(schema.tables[0].name, 'orders');
  assert.equal(schema.tables[0].estimatedRows, 830);
  assert.deepEqual(schema.tables[0].columns[0], {
    name: 'order_id',
    type: 'integer',
    nullable: false,
    defaultValue: null,
    position: 1,
    isPrimaryKey: true,
    foreignKey: null
  });
  assert.deepEqual(schema.tables[0].columns[1].foreignKey, {
    schema: 'public',
    table: 'customers',
    column: 'customer_id'
  });
});

test('describeDatabase treats negative PostgreSQL row estimates as unknown', async () => {
  class UnknownEstimatePool {
    async query() {
      return {
        fields: [],
        rows: [
          {
            table_schema: 'public',
            table_name: 'genre',
            estimated_rows: '-1',
            column_name: 'genre_id',
            formatted_type: 'integer',
            is_nullable: 'NO',
            column_default: null,
            ordinal_position: 1,
            is_primary_key: true,
            foreign_table_schema: null,
            foreign_table_name: null,
            foreign_column_name: null
          }
        ]
      };
    }

    async end() {}
  }

  const service = createQueryService({
    Pool: UnknownEstimatePool,
    env: { SQL_MASTERY_DATABASES: 'chinook' }
  });

  const schema = await service.describeDatabase({ database: 'chinook' });

  assert.equal(schema.tables[0].estimatedRows, null);
});

test('previewTable validates the table and quotes schema identifiers', async () => {
  class PreviewPool {
    static queries = [];

    async query(sql, params) {
      PreviewPool.queries.push({ sql, params });
      if (/information_schema\.tables/.test(sql)) {
        return { rowCount: 1, rows: [{ table_schema: 'Sales Data', table_name: 'Order"Lines' }] };
      }

      return {
        command: 'SELECT',
        fields: [{ name: 'order_id' }],
        rows: [{ order_id: 12 }],
        rowCount: 1
      };
    }

    async end() {}
  }

  PreviewPool.queries = [];
  const service = createQueryService({
    Pool: PreviewPool,
    env: { SQL_MASTERY_DATABASES: 'warehouse' },
    clock: () => 200
  });

  const preview = await service.previewTable({
    database: 'warehouse',
    schema: 'Sales Data',
    table: 'Order"Lines',
    limit: 999
  });

  assert.equal(preview.limit, 100);
  assert.deepEqual(preview.columns, ['order_id']);
  assert.deepEqual(preview.rows, [{ order_id: 12 }]);
  assert.deepEqual(PreviewPool.queries[0].params, ['Sales Data', 'Order"Lines']);
  assert.match(PreviewPool.queries[1].sql, /FROM "Sales Data"\."Order""Lines"/);
  assert.match(PreviewPool.queries[1].sql, /LIMIT 100/);
});
