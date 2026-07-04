const express = require('express');
const path = require('path');
const { buildCurriculum } = require('./curriculum-service');
const { createQueryService } = require('./query-service');

function createApp(options = {}) {
  const app = express();
  const queryService = options.queryService || createQueryService();
  const curriculumService = options.curriculumService || { buildCurriculum };
  const staticDir = options.staticDir || path.join(__dirname, '..');
  const contentDir = options.contentDir || path.join(__dirname, '..', 'content');

  app.disable('x-powered-by');
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

  app.use(express.static(contentDir, {
    extensions: ['html']
  }));

  app.use(express.static(staticDir, {
    extensions: ['html']
  }));

  return app;
}

module.exports = { createApp };
