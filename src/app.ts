import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'path';
import { buildCurriculum } from './curriculum-service';
import { createQueryService } from './query-service';
import { createProgressStore } from './progress-store';
import { createUserStore } from './user-store';
import { createAuthService } from './auth-service';

function createApp(options: any = {}) {
  const app = express();
  const queryService = options.queryService || createQueryService();
  const curriculumService = options.curriculumService || { buildCurriculum };
  const progressStore = options.progressStore || createProgressStore();
  const userStore = options.userStore || createUserStore();
  const authService = options.authService || createAuthService();
  // Resolve default dirs from the project root (process.cwd()) rather than __dirname,
  // because the compiled file runs from dist/src/ while content/ and client/dist/ stay
  // at the project root and the server is always started from the project root.
  const contentDir = options.contentDir || path.resolve(process.cwd(), 'content');
  const clientDir = options.clientDir || path.resolve(process.cwd(), 'client', 'dist');

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
      .split(',').map((origin: string) => origin.trim()).filter(Boolean));

  app.disable('x-powered-by');

  app.use((request: Request, response: Response, next: NextFunction) => {
    const origin = request.headers.origin;
    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.setHeader('Access-Control-Max-Age', '86400');
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/databases', (request: Request, response: Response) => {
    response.json({ databases: queryService.listDatabases() });
  });

  app.get('/api/curriculum', (request: Request, response: Response) => {
    try {
      response.json(curriculumService.buildCurriculum({ rootDir: contentDir }));
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      response.status(500).json({
        error: err.message || 'Curriculum could not be loaded.',
        code: 'CURRICULUM_LOAD_FAILED'
      });
    }
  });

  app.get('/api/schema', async (request: Request, response: Response) => {
    try {
      const result = await queryService.describeDatabase({
        database: request.query && request.query.database
      });

      response.json(result);
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      response.status(err.statusCode || 500).json({
        error: err.message || 'Database schema could not be loaded.',
        code: err.code || 'SCHEMA_LOAD_FAILED',
        detail: err.detail,
        hint: err.hint
      });
    }
  });

  app.post('/api/table-preview', async (request: Request, response: Response) => {
    try {
      const result = await queryService.previewTable({
        database: request.body && request.body.database,
        schema: request.body && request.body.schema,
        table: request.body && request.body.table,
        limit: request.body && request.body.limit
      });

      response.json(result);
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      response.status(err.statusCode || 500).json({
        error: err.message || 'Table preview could not be loaded.',
        code: err.code || 'TABLE_PREVIEW_FAILED',
        detail: err.detail,
        hint: err.hint
      });
    }
  });

  app.post('/api/query', async (request: Request, response: Response) => {
    try {
      const result = await queryService.executeQuery({
        database: request.body && request.body.database,
        sql: request.body && request.body.sql
      });

      response.json(result);
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      response.status(err.statusCode || 500).json({
        error: err.message || 'Query failed.',
        code: err.code || 'QUERY_FAILED',
        detail: err.detail,
        hint: err.hint,
        position: err.position
      });
    }
  });

  app.post('/api/check', async (request: Request, response: Response) => {
    try {
      const result = await queryService.checkQuery({
        database: request.body && request.body.database,
        sql: request.body && request.body.sql,
        expectedSql: request.body && request.body.expectedSql
      });

      response.json(result);
    } catch (error) {
      const err = error as { message?: string; code?: string; detail?: string; hint?: string; position?: string; statusCode?: number };
      response.status(err.statusCode || 500).json({
        error: err.message || 'Check failed.',
        code: err.code || 'CHECK_FAILED',
        detail: err.detail,
        hint: err.hint,
        position: err.position
      });
    }
  });

  function requireAuth(request: Request, response: Response, next: NextFunction) {
    const header = String(request.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const session = token ? authService.verifySession(token) : null;
    if (!session) {
      response.status(401).json({ error: 'Sign in to sync your progress.', code: 'AUTH_REQUIRED' });
      return;
    }
    response.locals.sub = session.sub;
    next();
  }

  app.post('/api/auth/google', async (request: Request, response: Response) => {
    try {
      const idToken = request.body && request.body.idToken;
      if (typeof idToken !== 'string' || !idToken) {
        return response.status(400).json({ error: 'A Google credential is required.', code: 'MISSING_ID_TOKEN' });
      }
      const profile = await authService.verifyGoogleToken(idToken);
      const user = userStore.upsert(profile);
      const token = authService.issueSession(user.sub);
      response.json({ token, user: { sub: user.sub, email: user.email, name: user.name } });
    } catch {
      response.status(401).json({ error: 'Could not verify that Google sign-in.', code: 'GOOGLE_VERIFY_FAILED' });
    }
  });

  app.get('/api/me', requireAuth, (request: Request, response: Response) => {
    const user = userStore.getBySub(response.locals.sub);
    if (!user) return response.status(401).json({ error: 'Session expired.', code: 'AUTH_REQUIRED' });
    response.json({ user: { sub: user.sub, email: user.email, name: user.name } });
  });

  // Cross-device progress sync, keyed by the signed-in user's Google sub. Progress is a
  // best-effort blob of localStorage keys; the server just stores and returns it.
  app.get('/api/progress', requireAuth, (request: Request, response: Response) => {
    const record = progressStore.get(response.locals.sub);
    response.json(record || { data: null, updatedAt: null });
  });

  app.put('/api/progress', requireAuth, (request: Request, response: Response) => {
    const body = request.body || {};
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return response.status(400).json({ error: 'A progress data object is required.', code: 'BAD_PROGRESS' });
    }
    if (JSON.stringify(body.data).length > 512 * 1024) {
      return response.status(413).json({ error: 'Progress payload is too large.', code: 'PROGRESS_TOO_LARGE' });
    }
    try {
      const record = progressStore.set(response.locals.sub, body.data);
      response.json({ ok: true, updatedAt: record.updatedAt });
    } catch {
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

export { createApp };
