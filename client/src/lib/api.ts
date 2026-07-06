import type { Curriculum, CheckResponse, SchemaResponse, QueryResult, ApiError } from '../types';

// In a same-origin deployment (Express serves the built client) leave VITE_API_BASE_URL
// unset and calls stay relative ("/api/..."). For a split deployment (Cloudflare Pages
// front end + a separate backend), set VITE_API_BASE_URL to the backend's public origin
// at build time, e.g. https://api.example.com, so every call is then absolute to the VPS.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path: string): string => `${API_BASE}${path}`;

async function request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch {
    const error = new Error('Could not reach the local server. Is `npm start` running?') as ApiError;
    error.code = 'NETWORK';
    throw error;
  }
  // Server always sends JSON; tolerate non-JSON bodies (proxies, hard crashes) with an empty object.
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed') as ApiError;
    const extras: Record<string, unknown> = { code: body.code, hint: body.hint, position: body.position, detail: body.detail };
    for (const [key, value] of Object.entries(extras)) {
      if (value !== undefined) (error as unknown as Record<string, unknown>)[key] = value;
    }
    throw error;
  }
  return body as T;
}

const post = <T = unknown>(url: string, payload: unknown): Promise<T> => request<T>(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});

export const api = {
  curriculum: (): Promise<Curriculum> => request<Curriculum>(apiUrl('/api/curriculum')),
  databases: (): Promise<unknown> => request(apiUrl('/api/databases')),
  schema: (database: string): Promise<SchemaResponse> => request<SchemaResponse>(apiUrl(`/api/schema?database=${encodeURIComponent(database)}`)),
  tablePreview: (database: string, schema: string, table: string, limit = 6): Promise<QueryResult> =>
    post<QueryResult>(apiUrl('/api/table-preview'), { database, schema, table, limit }),
  query: (database: string, sql: string): Promise<QueryResult> => post<QueryResult>(apiUrl('/api/query'), { database, sql }),
  check: (database: string | undefined, sql: string, expectedSql: string | undefined): Promise<CheckResponse> =>
    post<CheckResponse>(apiUrl('/api/check'), { database, sql, expectedSql })
};
