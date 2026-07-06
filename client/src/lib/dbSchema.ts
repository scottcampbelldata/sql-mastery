import { useEffect, useState } from 'react';
import { api } from './api';
import type { DbSchemaMap, SchemaResponse } from '../types';

// Cache the { tableName: [columnNames] } map per database so the editor's
// autocomplete and the schema browser don't both re-fetch it.
const cache = new Map<string, Promise<DbSchemaMap | null>>(); // database -> Promise<map | null>

export function loadSchemaMap(database: string | undefined): Promise<DbSchemaMap | null> {
  if (!database) return Promise.resolve(null);
  if (!cache.has(database)) {
    cache.set(database, api.schema(database)
      .then((body: SchemaResponse) => {
        const map: DbSchemaMap = {};
        (body.tables || []).forEach((t) => {
          if (t && t.name) map[t.name] = (t.columns || []).map((c) => c.name);
        });
        return map;
      })
      .catch(() => null));
  }
  return cache.get(database) as Promise<DbSchemaMap | null>;
}

// Returns the schema map for a database (null until loaded). Stable reference once loaded.
export function useDbSchema(database: string | undefined): DbSchemaMap | null {
  const [schema, setSchema] = useState<DbSchemaMap | null>(null);
  useEffect(() => {
    let alive = true;
    setSchema(null);
    loadSchemaMap(database).then((m) => { if (alive) setSchema(m); });
    return () => { alive = false; };
  }, [database]);
  return schema;
}
