import { useEffect, useState } from 'react';
import { api } from './api.js';

// Cache the { tableName: [columnNames] } map per database so the editor's
// autocomplete and the schema browser don't both re-fetch it.
const cache = new Map(); // database -> Promise<map | null>

export function loadSchemaMap(database) {
  if (!database) return Promise.resolve(null);
  if (!cache.has(database)) {
    cache.set(database, api.schema(database)
      .then((body) => {
        const map = {};
        (body.tables || []).forEach((t) => {
          if (t && t.name) map[t.name] = (t.columns || []).map((c) => c.name);
        });
        return map;
      })
      .catch(() => null));
  }
  return cache.get(database);
}

// Returns the schema map for a database (null until loaded). Stable reference once loaded.
export function useDbSchema(database) {
  const [schema, setSchema] = useState(null);
  useEffect(() => {
    let alive = true;
    setSchema(null);
    loadSchemaMap(database).then((m) => { if (alive) setSchema(m); });
    return () => { alive = false; };
  }, [database]);
  return schema;
}
