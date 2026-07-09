import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { RequestListener } from 'node:http';

import { createApp } from '../src/app';
import { createUserStore } from '../src/user-store';
import { createAuthService } from '../src/auth-service';

async function withServer(app: RequestListener, run: (baseUrl: string) => Promise<void>) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test('GET /api/databases returns the configured database names', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture', 'sideline']
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/databases`);
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.deepEqual(body.databases, ['aperture', 'sideline']);
  });
});

test('POST /api/query returns query results from the service', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture'],
      executeQuery: async ({ database, sql }: { database: string; sql: string }) => ({
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
      body: JSON.stringify({ database: 'aperture', sql: 'SELECT 1 AS ok' })
    });
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.deepEqual(body.rows, [{ ok: 1 }]);
    assert.deepEqual(body.columns, ['ok']);
    assert.equal(body.database, 'aperture');
  });
});

test('POST /api/query returns structured errors', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture'],
      executeQuery: async () => {
        const error = new Error('SQL is required.') as Error & { statusCode?: number; code?: string };
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
      body: JSON.stringify({ database: 'aperture', sql: '' })
    });
    const body = await response.json() as any;

    assert.equal(response.status, 400);
    assert.equal(body.error, 'SQL is required.');
    assert.equal(body.code, 'EMPTY_SQL');
  });
});

test('POST /api/check returns guided feedback', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture'],
      checkQuery: async ({ database, sql, expectedSql }: { database: string; sql: string; expectedSql: string }) => ({
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
        database: 'aperture',
        sql: 'SELECT 1 AS ok',
        expectedSql: 'SELECT 1 AS ok'
      })
    });
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.correct, true);
    assert.equal(body.feedbackType, 'success');
    assert.deepEqual(body.result.rows, [{ ok: 1 }]);
  });
});

test('GET /api/curriculum returns the banded learning path', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture']
    },
    curriculumService: {
      buildCurriculum: (...args: unknown[]) => {
        assert.equal(args.length, 0);
        return {
          product: {
            name: 'SQL Mastery',
            bands: [{ level: 'beginner', database: 'aperture', phaseCount: 1, conceptCount: 1 }]
          },
          learningPath: {
            dataset: 'three-band',
            phases: [{ id: 'phase-1', level: 'beginner', database: 'aperture', concepts: [] }],
            concepts: [{ id: 'concept-1' }],
            checkpoints: [],
            exercises: [{ id: 'exercise-1', title: 'P1.1' }]
          },
          stats: { totalPhases: 1, totalConcepts: 1, totalExercises: 1, totalCheckpoints: 0 }
        };
      }
    }
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/curriculum`);
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.learningPath.dataset, 'three-band');
    assert.equal(body.stats.totalPhases, 1);
    assert.equal(body.product.bands[0].database, 'aperture');
    assert.equal(Object.hasOwn(body, 'weeks'), false);
    assert.equal(Object.hasOwn(body, 'sessions'), false);
  });
});

test('GET /api/schema returns table metadata for the selected database', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture'],
      describeDatabase: async ({ database }: { database: string }) => ({
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
    const response = await fetch(`${baseUrl}/api/schema?database=aperture`);
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.equal(body.database, 'aperture');
    assert.equal(body.tables[0].name, 'products');
    assert.equal(body.tables[0].columns[0].isPrimaryKey, true);
  });
});

test('POST /api/table-preview returns sample rows for a schema table', async () => {
  const app = createApp({
    queryService: {
      listDatabases: () => ['aperture'],
      previewTable: async ({ database, schema, table, limit }: { database: string; schema: string; table: string; limit: number }) => ({
        database,
        schema,
        table,
        limit,
        columns: ['product_id', 'product_name'],
        rows: [{ product_id: 1, product_name: 'Aperture Basic' }],
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
        database: 'aperture',
        schema: 'public',
        table: 'products',
        limit: 5
      })
    });
    const body = await response.json() as any;

    assert.equal(response.status, 200);
    assert.deepEqual(body.columns, ['product_id', 'product_name']);
    assert.deepEqual(body.rows, [{ product_id: 1, product_name: 'Aperture Basic' }]);
    assert.equal(body.table, 'products');
  });
});

test('serveClient=false runs API-only (no static front end)', async () => {
  const app = createApp({
    queryService: { listDatabases: () => ['sideline', 'rove'] },
    serveClient: false
  });

  await withServer(app, async (baseUrl) => {
    // API still works.
    const api = await fetch(`${baseUrl}/api/databases`);
    assert.equal(api.status, 200);
    assert.deepEqual((await api.json() as any).databases, ['sideline', 'rove']);
    // The front end is not served: a non-API path 404s instead of returning index.html.
    const root = await fetch(`${baseUrl}/`);
    assert.equal(root.status, 404);
  });
});

test('CORS reflects allowed origins, answers preflight, and ignores others', async () => {
  const app = createApp({
    queryService: { listDatabases: () => ['sideline'] },
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

function authApp() {
  const os = require('node:os');
  const fs = require('node:fs');
  const nodePath = require('node:path');
  const { createProgressStore } = require('../src/progress-store');
  const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'sqlm-auth-'));
  const authService = createAuthService({
    sessionSecret: 'test-secret',
    verifyGoogle: async (t: string) => {
      if (t !== 'good') throw new Error('bad');
      return { sub: 'g-1', email: 'a@b.com', name: 'Ann' };
    }
  });
  return createApp({
    queryService: { listDatabases: () => ['sideline'] },
    userStore: createUserStore({ dir: nodePath.join(dir, 'users') }),
    progressStore: createProgressStore({ dir: nodePath.join(dir, 'progress') }),
    authService
  });
}

test('POST /api/auth/google returns a token and profile for a valid id token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'good' })
    });
    const body = await res.json() as any;
    assert.equal(res.status, 200);
    assert.ok(body.token);
    assert.equal(body.user.email, 'a@b.com');
  });
});

test('POST /api/auth/google rejects an invalid id token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'bad' })
    });
    assert.equal(res.status, 401);
  });
});

test('GET /api/progress requires a valid token', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const anon = await fetch(`${baseUrl}/api/progress`);
    assert.equal(anon.status, 401);
  });
});

test('progress round-trips for the signed-in user', async () => {
  await withServer(authApp() as any, async (baseUrl) => {
    const auth = await (await fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: 'good' })
    })).json() as any;
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${auth.token}` };
    const put = await fetch(`${baseUrl}/api/progress`, { method: 'PUT', headers, body: JSON.stringify({ data: { 'sqlm:m1:p1': '1' } }) });
    assert.equal(put.status, 200);
    const got = await (await fetch(`${baseUrl}/api/progress`, { headers })).json() as any;
    assert.deepEqual(got.data, { 'sqlm:m1:p1': '1' });
  });
});
