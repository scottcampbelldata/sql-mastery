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
  curriculum: () => request('/api/curriculum'),
  databases: () => request('/api/databases'),
  schema: (database) => request(`/api/schema?database=${encodeURIComponent(database)}`),
  tablePreview: (database, schema, table, limit = 6) => post('/api/table-preview', { database, schema, table, limit }),
  query: (database, sql) => post('/api/query', { database, sql }),
  check: (database, sql, expectedSql) => post('/api/check', { database, sql, expectedSql })
};
