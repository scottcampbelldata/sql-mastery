async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    Object.assign(error, { code: body.code, hint: body.hint, position: body.position, detail: body.detail });
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
