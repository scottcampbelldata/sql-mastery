const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /api/databases returns the configured database names', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind', 'chinook']
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/databases`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.databases, ['northwind', 'chinook']);
  });
});

test('POST /api/query returns query results from the service', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind'],
      executeQuery: async ({ database, sql }) => ({
        database,
        sql,
        columns: ['ok'],
        rows: [{ ok: 1 }],
        rowCount: 1,
        command: 'SELECT',
        durationMs: 3
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ database: 'northwind', sql: 'SELECT 1 AS ok' })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.rows, [{ ok: 1 }]);
    assert.deepEqual(body.columns, ['ok']);
    assert.equal(body.database, 'northwind');
  });
});

test('POST /api/query returns structured errors', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind'],
      executeQuery: async () => {
        const error = new Error('SQL is required.');
        error.statusCode = 400;
        error.code = 'EMPTY_SQL';
        throw error;
      }
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ database: 'northwind', sql: '' })
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'SQL is required.');
    assert.equal(body.code, 'EMPTY_SQL');
  });
});

test('POST /api/check returns guided feedback', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind'],
      checkQuery: async ({ database, sql, expectedSql }) => ({
        correct: true,
        feedbackType: 'success',
        message: 'You got it right.',
        why: 'The result matches.',
        database,
        sql,
        expectedSql,
        result: {
          columns: ['ok'],
          rows: [{ ok: 1 }],
          rowCount: 1,
          command: 'SELECT',
          durationMs: 2
        },
        expectedSummary: {
          columns: ['ok'],
          rowCount: 1
        }
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        database: 'northwind',
        sql: 'SELECT 1 AS ok',
        expectedSql: 'SELECT 1 AS ok'
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.correct, true);
    assert.equal(body.feedbackType, 'success');
    assert.deepEqual(body.result.rows, [{ ok: 1 }]);
  });
});

test('GET /api/curriculum returns the scheduled learning path', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind']
    },
    curriculumService: {
      buildCurriculum: () => ({
        weeks: [{ id: 'week-01', sessions: ['w01-s01'] }],
        sessions: [{ id: 'w01-s01', exerciseIds: ['p1-1'] }],
        exercises: [{ id: 'p1-1', title: 'P1.1' }],
        stats: { totalWeeks: 16, totalSessions: 64 }
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/curriculum`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.stats.totalWeeks, 16);
    assert.equal(body.sessions[0].id, 'w01-s01');
  });
});

test('GET /api/schema returns table metadata for the selected database', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind'],
      describeDatabase: async ({ database }) => ({
        database,
        tables: [
          {
            schema: 'public',
            name: 'products',
            estimatedRows: 77,
            columns: [
              { name: 'product_id', type: 'integer', nullable: false, isPrimaryKey: true }
            ]
          }
        ],
        stats: { tableCount: 1, columnCount: 1 }
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/schema?database=northwind`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.database, 'northwind');
    assert.equal(body.tables[0].name, 'products');
    assert.equal(body.tables[0].columns[0].isPrimaryKey, true);
  });
});

test('POST /api/table-preview returns sample rows for a schema table', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['northwind'],
      previewTable: async ({ database, schema, table, limit }) => ({
        database,
        schema,
        table,
        limit,
        columns: ['product_id', 'product_name'],
        rows: [{ product_id: 1, product_name: 'Chai' }],
        rowCount: 1,
        durationMs: 4
      })
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/table-preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        database: 'northwind',
        schema: 'public',
        table: 'products',
        limit: 5
      })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.columns, ['product_id', 'product_name']);
    assert.deepEqual(body.rows, [{ product_id: 1, product_name: 'Chai' }]);
    assert.equal(body.table, 'products');
  });
});

test('CORS reflects allowed origins, answers preflight, and ignores others', async () => {
  const app = createApp({
    queryService: { listDatabases: () => ['chinook'] },
    allowedOrigins: ['https://sql-mastery.pages.dev']
  });

  await withServer(app, async (baseUrl) => {
    // An allowlisted origin is reflected back.
    const allowed = await fetch(`${baseUrl}/api/databases`, {
      headers: { origin: 'https://sql-mastery.pages.dev' }
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://sql-mastery.pages.dev');

    // A CORS preflight is answered 204 with the allowed methods.
    const preflight = await fetch(`${baseUrl}/api/query`, {
      method: 'OPTIONS',
      headers: { origin: 'https://sql-mastery.pages.dev' }
    });
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('access-control-allow-methods') || '', /POST/);

    // A non-allowlisted origin gets no CORS header.
    const blocked = await fetch(`${baseUrl}/api/databases`, {
      headers: { origin: 'https://evil.example.com' }
    });
    assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  });
});
