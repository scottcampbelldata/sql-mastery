// In a same-origin deployment (Express serves the built client) leave VITE_API_BASE_URL
// unset and calls stay relative ("/api/..."). For a split deployment (Cloudflare Pages
// front end + a separate backend), set VITE_API_BASE_URL to the backend's public origin
// at build time, e.g. https://api.example.com — every call is then absolute to the VPS.
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const apiUrl = (path) => `${API_BASE}${path}`;

async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    const error = new Error('Could not reach the local server. Is `npm start` running?');
    error.code = 'NETWORK';
    throw error;
  }
  // Server always sends JSON; tolerate non-JSON bodies (proxies, hard crashes) with an empty object.
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    const extras = { code: body.code, hint: body.hint, position: body.position, detail: body.detail };
    for (const [key, value] of Object.entries(extras)) {
      if (value !== undefined) error[key] = value;
    }
    throw error;
  }
  return body;
}
const post = (url, payload) => request(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload)
});

export const api = {
  curriculum: () => request(apiUrl('/api/curriculum')),
  databases: () => request(apiUrl('/api/databases')),
  schema: (database) => request(apiUrl(`/api/schema?database=${encodeURIComponent(database)}`)),
  tablePreview: (database, schema, table, limit = 6) => post(apiUrl('/api/table-preview'), { database, schema, table, limit }),
  query: (database, sql) => post(apiUrl('/api/query'), { database, sql }),
  check: (database, sql, expectedSql) => post(apiUrl('/api/check'), { database, sql, expectedSql })
};
