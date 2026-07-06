const express = require('express');
const path = require('path');
const { buildCurriculum } = require('./curriculum-service');
const { createQueryService } = require('./query-service');
const { createProgressStore } = require('./progress-store');

function createApp(options = {}) {
  const app = express();
  const queryService = options.queryService || createQueryService();
  const curriculumService = options.curriculumService || { buildCurriculum };
  const progressStore = options.progressStore || createProgressStore();
  const contentDir = options.contentDir || path.join(__dirname, '..', 'content');
  const clientDir = options.clientDir || path.join(__dirname, '..', 'client', 'dist');

  // Whether this backend also serves the built front end (all-in-one). In a split
  // deployment (front end on Cloudflare Pages) set SQL_MASTERY_SERVE_CLIENT=false so
  // the VPS runs API-only. Defaults to true for local dev / monolith hosting.
  const serveClient = options.serveClient !== undefined
    ? options.serveClient
    : (process.env.SQL_MASTERY_SERVE_CLIENT || 'true').toLowerCase() !== 'false';

  // Cross-origin allowlist for split deployments (e.g. a Cloudflare Pages front end
  // calling this backend on a different origin). Comma-separated list of allowed
  // origins; empty means same-origin only (no CORS headers emitted). "*" allows any.
  const allowedOrigins = (options.allowedOrigins
    || (process.env.SQL_MASTERY_ALLOWED_ORIGINS || '')
      .split(',').map((origin) => origin.trim()).filter(Boolean));

  app.disable('x-powered-by');

  app.use((request, response, next) => {
    const origin = request.headers.origin;
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.setHeader('Access-Control-Max-Age', '86400');
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/databases', (request, response) => {
    response.json({ databases: queryService.listDatabases() });
  });

  app.get('/api/curriculum', (request, response) => {
    try {
      response.json(curriculumService.buildCurriculum({ rootDir: contentDir }));
    } catch (error) {
      response.status(500).json({
        error: error.message || 'Curriculum could not be loaded.',
        code: 'CURRICULUM_LOAD_FAILED'
      });
    }
  });

  app.get('/api/schema', async (request, response) => {
    try {
      const result = await queryService.describeDatabase({
        database: request.query && request.query.database
      });

      response.json(result);
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: error.message || 'Database schema could not be loaded.',
        code: error.code || 'SCHEMA_LOAD_FAILED',
        detail: error.detail,
        hint: error.hint
      });
    }
  });

  app.post('/api/table-preview', async (request, response) => {
    try {
      const result = await queryService.previewTable({
        database: request.body && request.body.database,
        schema: request.body && request.body.schema,
        table: request.body && request.body.table,
        limit: request.body && request.body.limit
      });

      response.json(result);
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: error.message || 'Table preview could not be loaded.',
        code: error.code || 'TABLE_PREVIEW_FAILED',
        detail: error.detail,
        hint: error.hint
      });
    }
  });

  app.post('/api/query', async (request, response) => {
    try {
      const result = await queryService.executeQuery({
        database: request.body && request.body.database,
        sql: request.body && request.body.sql
      });

      response.json(result);
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: error.message || 'Query failed.',
        code: error.code || 'QUERY_FAILED',
        detail: error.detail,
        hint: error.hint,
        position: error.position
      });
    }
  });

  app.post('/api/check', async (request, response) => {
    try {
      const result = await queryService.checkQuery({
        database: request.body && request.body.database,
        sql: request.body && request.body.sql,
        expectedSql: request.body && request.body.expectedSql
      });

      response.json(result);
    } catch (error) {
      response.status(error.statusCode || 500).json({
        error: error.message || 'Check failed.',
        code: error.code || 'CHECK_FAILED',
        detail: error.detail,
        hint: error.hint,
        position: error.position
      });
    }
  });

  // Cross-device progress sync, keyed by a user-chosen sync code. Progress is a
  // best-effort blob of localStorage keys; the server just stores and returns it.
  const isValidCode = (code) => typeof code === 'string' && code.trim().length >= 6 && code.trim().length <= 128;

  app.get('/api/progress', (request, response) => {
    const code = request.query && request.query.code;
    if (!isValidCode(code)) {
      return response.status(400).json({ error: 'A sync code of at least 6 characters is required.', code: 'BAD_SYNC_CODE' });
    }
    const record = progressStore.get(code.trim());
    response.json(record || { data: null, updatedAt: null });
  });

  app.put('/api/progress', (request, response) => {
    const body = request.body || {};
    if (!isValidCode(body.code)) {
      return response.status(400).json({ error: 'A sync code of at least 6 characters is required.', code: 'BAD_SYNC_CODE' });
    }
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return response.status(400).json({ error: 'A progress data object is required.', code: 'BAD_PROGRESS' });
    }
    if (JSON.stringify(body.data).length > 512 * 1024) {
      return response.status(413).json({ error: 'Progress payload is too large.', code: 'PROGRESS_TOO_LARGE' });
    }
    try {
      const record = progressStore.set(body.code.trim(), body.data);
      response.json({ ok: true, updatedAt: record.updatedAt });
    } catch (error) {
      response.status(500).json({ error: 'Could not save progress.', code: 'PROGRESS_SAVE_FAILED' });
    }
  });

  // Serve the built front end only in all-in-one mode. When SQL_MASTERY_SERVE_CLIENT
  // is false (split deployment) the VPS runs API-only and Cloudflare Pages serves the UI.
  if (serveClient) {
    app.use(express.static(clientDir));
    app.use(express.static(contentDir, {
      extensions: ['html']
    }));
  }

  return app;
}

module.exports = { createApp };
