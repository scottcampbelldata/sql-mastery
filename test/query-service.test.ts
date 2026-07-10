import test from 'node:test';
import assert from 'node:assert/strict';

import { createQueryService, QueryServiceError, mismatchFeedback } from '../src/query-service';
import { buildFingerprint } from '../src/fingerprint';

const R = (columns: string[], rows: Record<string, unknown>[]) => ({ columns, rows });

class FakePool {
  static configs: any[] = [];
  static queries: any[] = [];
  static result: any = {
    command: 'SELECT',
    rowCount: 1,
    fields: [{ name: 'answer' }],
    rows: [{ answer: 42 }]
  };

  config: any;

  constructor(config: any) {
    this.config = config;
    FakePool.configs.push(config);
  }

  async query(sql: any) {
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
    env: { SQL_MASTERY_DATABASES: 'sideline,aperture', PGUSER: 'scott' },
    clock: () => 100
  });

  const result = await service.executeQuery({
    database: 'sideline',
    sql: 'SELECT 42 AS answer'
  });

  assert.equal(FakePool.configs[0].database, 'sideline');
  assert.equal(FakePool.configs[0].user, 'scott');
  assert.deepEqual(FakePool.queries, ['SELECT 42 AS answer']);
  assert.deepEqual(result.columns, ['answer', 'label']);
  assert.deepEqual(result.fields, [{ name: 'answer' }, { name: 'label' }]);
  assert.deepEqual(result.rows, [{ answer: 42, label: 'life' }]);
  assert.equal(result.command, 'SELECT');
  assert.equal(result.rowCount, 1);
  assert.equal(result.database, 'sideline');
  assert.equal(typeof result.durationMs, 'number');
});

test('executeQuery passes rowMode array through to pg and returns fields', async () => {
  class ArrayModePool {
    static queries: any[] = [];

    async query(query: any) {
      ArrayModePool.queries.push(query);
      return {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'answer' }, { name: 'answer' }],
        rows: [[42, 'life']]
      };
    }

    async end() {}
  }

  ArrayModePool.queries = [];
  const service = createQueryService({
    Pool: ArrayModePool,
    env: { SQL_MASTERY_DATABASES: 'sideline' }
  });

  const result = await service.executeQuery({
    database: 'sideline',
    sql: ' SELECT 42 AS answer, $q$life$q$ AS answer ',
    rowMode: 'array'
  });

  assert.deepEqual(ArrayModePool.queries, [{ text: 'SELECT 42 AS answer, $q$life$q$ AS answer', rowMode: 'array' }]);
  assert.deepEqual(result.columns, ['answer', 'answer']);
  assert.deepEqual(result.fields, [{ name: 'answer' }, { name: 'answer' }]);
  assert.deepEqual(result.rows, [[42, 'life']]);
});

test('executeQuery rejects empty SQL with a structured validation error', async () => {
  const service = createQueryService({ Pool: FakePool, env: {} });

  await assert.rejects(
    () => service.executeQuery({ database: 'sideline', sql: '   ' }),
    (error: any) => {
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
    env: { SQL_MASTERY_DATABASES: 'sideline' }
  });

  await assert.rejects(
    () => service.executeQuery({ database: 'rove', sql: 'SELECT 1' }),
    (error: any) => {
      assert.ok(error instanceof QueryServiceError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'UNKNOWN_DATABASE');
      return true;
    }
  );
});

test('executeQuery rejects non-read-only SQL before it reaches Postgres', async () => {
  FakePool.queries = [];
  const service = createQueryService({
    Pool: FakePool,
    env: { SQL_MASTERY_DATABASES: 'sideline' }
  });

  await assert.rejects(
    () => service.executeQuery({ database: 'sideline', sql: 'DROP TABLE teams' }),
    (error: any) => {
      assert.ok(error instanceof QueryServiceError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, 'READ_ONLY_SQL_REQUIRED');
      return true;
    }
  );
  assert.deepEqual(FakePool.queries, []);
});

test('executeQuery allows dangerous words inside string literals', async () => {
  FakePool.queries = [];
  FakePool.result = {
    command: 'SELECT',
    rowCount: 1,
    fields: [{ name: 'warning' }],
    rows: [{ warning: 'DROP TABLE teams' }]
  };
  const service = createQueryService({
    Pool: FakePool,
    env: { SQL_MASTERY_DATABASES: 'sideline' }
  });

  const result = await service.executeQuery({ database: 'sideline', sql: "SELECT 'DROP TABLE teams' AS warning" });

  assert.deepEqual(FakePool.queries, ["SELECT 'DROP TABLE teams' AS warning"]);
  assert.deepEqual(result.rows, [{ warning: 'DROP TABLE teams' }]);
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
    () => service.executeQuery({ database: 'aperture', sql: 'SELECT 1' }),
    (error: any) => {
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
    static results: any[] = [
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
    database: 'aperture',
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
    static results: any[] = [
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
    database: 'aperture',
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
      const error = new Error('column "bad_column" does not exist') as Error & { code?: string };
      error.code = '42703';
      throw error;
    }

    async end() {}
  }

  const service = createQueryService({ Pool: ErrorPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT bad_column FROM orders',
    expectedSql: 'SELECT order_id FROM orders'
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.feedbackType, 'error');
  assert.equal(feedback.code, '42703');
  assert.match(feedback.hint, /column/i);
});

test('checkQuery accepts a matching fingerprint without expectedSql', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'ok' }],
    rows: [[1], [2]]
  });

  class FingerprintPool {
    static queries: any[] = [];

    async query(query: any) {
      FingerprintPool.queries.push(query);
      return {
        command: 'SELECT',
        rowCount: 2,
        fields: [{ name: 'ok' }],
        rows: [[1], [2]]
      };
    }

    async end() {}
  }

  FingerprintPool.queries = [];
  const service = createQueryService({ Pool: FingerprintPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT ok FROM answers',
    fingerprint,
    orderMatters: true
  });

  assert.equal(FingerprintPool.queries.length, 1);
  assert.deepEqual(FingerprintPool.queries[0], { text: 'SELECT ok FROM answers', rowMode: 'array' });
  assert.equal(feedback.correct, true);
  assert.equal(feedback.feedbackType, 'success');
  assert.deepEqual(feedback.expectedSummary, { columns: ['ok'], rowCount: 2 });
});

test('checkQuery returns object-keyed display rows for a fingerprint pass (client renders row[name])', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'star_id' }, { name: 'star_name' }],
    rows: [[1, '47 UMa'], [2, '51 Peg']]
  });

  class DisplayPool {
    async query(query: any) {
      return {
        command: 'SELECT',
        rowCount: 2,
        fields: [{ name: 'star_id' }, { name: 'star_name' }],
        rows: [[1, '47 UMa'], [2, '51 Peg']]
      };
    }
    async end() {}
  }

  const service = createQueryService({ Pool: DisplayPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT star_id, star_name FROM stars',
    fingerprint,
    orderMatters: true
  });

  // Grading is array-based internally, but the result shown to the learner must be
  // object-keyed by column name (QueryResult contract) or DataTable renders all NULL.
  assert.equal(feedback.correct, true);
  assert.deepEqual(feedback.result.columns, ['star_id', 'star_name']);
  assert.deepEqual(feedback.result.rows, [
    { star_id: 1, star_name: '47 UMa' },
    { star_id: 2, star_name: '51 Peg' }
  ]);
});

test('checkQuery reports fingerprint column mismatches', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'ok' }],
    rows: [[1]]
  });

  class ColumnMismatchPool {
    async query() {
      return {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'wrong_name' }],
        rows: [[1]]
      };
    }

    async end() {}
  }

  const service = createQueryService({ Pool: ColumnMismatchPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT 1 AS wrong_name',
    fingerprint
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.reason, 'columns');
  assert.deepEqual(feedback.diff.yourColumns, ['wrong_name']);
  assert.deepEqual(feedback.diff.expectedColumns, ['ok']);
});

test('checkQuery reports fingerprint row-count mismatches', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'ok' }],
    rows: [[1], [2]]
  });

  class RowCountMismatchPool {
    async query() {
      return {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'ok' }],
        rows: [[1]]
      };
    }

    async end() {}
  }

  const service = createQueryService({ Pool: RowCountMismatchPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT ok FROM answers LIMIT 1',
    fingerprint
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.reason, 'row-count');
  assert.equal(feedback.yourRowCount, 1);
  assert.equal(feedback.expectedRowCount, 2);
  assert.equal(feedback.diff.yourRowCount, 1);
  assert.equal(feedback.diff.expectedRowCount, 2);
});

test('checkQuery compares duplicate columns positionally on fingerprint path', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'answer' }, { name: 'answer' }],
    rows: [[1, 2]]
  });

  class DuplicateColumnPool {
    async query() {
      return {
        command: 'SELECT',
        rowCount: 1,
        fields: [{ name: 'answer' }, { name: 'answer' }],
        rows: [[2, 1]]
      };
    }

    async end() {}
  }

  const service = createQueryService({ Pool: DuplicateColumnPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT 2 AS answer, 1 AS answer',
    fingerprint
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.reason, 'row-values');
  assert.equal(feedback.orderOnly, false);
  assert.equal(feedback.diff.orderOnly, false);
});

test('checkQuery accepts unordered fingerprint row matches when order does not matter', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'ok' }],
    rows: [[1], [2]]
  });

  class UnorderedPool {
    async query() {
      return {
        command: 'SELECT',
        rowCount: 2,
        fields: [{ name: 'ok' }],
        rows: [[2], [1]]
      };
    }

    async end() {}
  }

  const service = createQueryService({ Pool: UnorderedPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT ok FROM answers',
    fingerprint,
    orderMatters: false
  });

  assert.equal(feedback.correct, true);
  assert.equal(feedback.feedbackType, 'success');
});

test('checkQuery flags order-only fingerprint mismatches', async () => {
  const fingerprint = buildFingerprint({
    fields: [{ name: 'ok' }],
    rows: [[1], [2]]
  });

  class OrderOnlyPool {
    async query() {
      return {
        command: 'SELECT',
        rowCount: 2,
        fields: [{ name: 'ok' }],
        rows: [[2], [1]]
      };
    }

    async end() {}
  }

  const service = createQueryService({ Pool: OrderOnlyPool, env: {} });
  const feedback = await service.checkQuery({
    database: 'aperture',
    sql: 'SELECT ok FROM answers ORDER BY ok DESC',
    fingerprint,
    orderMatters: true
  });

  assert.equal(feedback.correct, false);
  assert.equal(feedback.reason, 'row-values');
  assert.equal(feedback.orderOnly, true);
  assert.equal(feedback.diff.orderOnly, true);
});

test('describeDatabase groups table columns with key metadata', async () => {
  class SchemaPool {
    async query(sql: any) {
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
    env: { SQL_MASTERY_DATABASES: 'sideline' }
  });

  const schema = await service.describeDatabase({ database: 'sideline' });

  assert.equal(schema.database, 'sideline');
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
            table_name: 'articles',
            estimated_rows: '-1',
            column_name: 'article_id',
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
    env: { SQL_MASTERY_DATABASES: 'aperture' }
  });

  const schema = await service.describeDatabase({ database: 'aperture' });

  assert.equal(schema.tables[0].estimatedRows, null);
});

test('previewTable validates the table and quotes schema identifiers', async () => {
  class PreviewPool {
    static queries: any[] = [];

    async query(sql: any, params: any) {
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

test('diff: column mismatch reports both column lists', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }]), R(['a', 'b'], [{ a: 1, b: 2 }]));
  assert.equal(m.diff.reason, 'columns');
  assert.deepEqual(m.diff.yourColumns, ['a']);
  assert.deepEqual(m.diff.expectedColumns, ['a', 'b']);
});

test('diff: row-count difference counts extra and missing', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }, { a: 2 }, { a: 3 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-count');
  assert.equal(m.diff.yourRowCount, 3);
  assert.equal(m.diff.expectedRowCount, 2);
  assert.equal(m.diff.extraRows, 1);
  assert.equal(m.diff.missingRows, 0);
});

test('diff: order-only when the same rows are reordered', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 2 }, { a: 1 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-values');
  assert.equal(m.diff.orderOnly, true);
  assert.equal(m.diff.extraRows, 0);
  assert.equal(m.diff.missingRows, 0);
});

test('diff: value difference counts extra and missing', () => {
  const m = mismatchFeedback(R(['a'], [{ a: 1 }, { a: 9 }]), R(['a'], [{ a: 1 }, { a: 2 }]));
  assert.equal(m.diff.reason, 'row-values');
  assert.equal(m.diff.orderOnly, false);
  assert.equal(m.diff.extraRows, 1);
  assert.equal(m.diff.missingRows, 1);
});

test('mismatchFeedback returns null for a matching result', () => {
  assert.equal(mismatchFeedback(R(['a'], [{ a: 1 }]), R(['a'], [{ a: 1 }])), null);
});
