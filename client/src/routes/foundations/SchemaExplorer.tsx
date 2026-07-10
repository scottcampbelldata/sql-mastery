import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { DataTable } from '../../components/DataTable';
import { Callout } from '../../components/ui';
import type { QueryResult, ApiError } from '../../types';

// The schema endpoint returns tables carrying a `schema` name alongside `name`/`columns`,
// which the browser keys and previews on; type it locally to keep that access.
interface ExplorerTable {
  name: string;
  schema: string;
  columns?: { name: string; type?: string }[];
}
interface ExplorerSchema {
  tables: ExplorerTable[];
}

// LearnSQL-style database browser: a row of table tabs, and the selected table's
// data shown as a grid below.
interface Props {
  database?: string;
  preferTable?: string;
}

export function SchemaExplorer({ database, preferTable }: Props) {
  const [schema, setSchema] = useState<ExplorerSchema | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [activeTable, setActiveTable] = useState<ExplorerTable | null>(null);
  const [preview, setPreview] = useState<QueryResult | null>(null);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);

  useEffect(() => {
    let alive = true;
    setSchema(null); setError(null); setActiveTable(null);
    api.schema(database as string)
      .then((body) => {
        if (!alive) return;
        const s = body as unknown as ExplorerSchema;
        setSchema(s);
        if (s.tables?.length) {
          const match = preferTable ? s.tables.find((t) => t.name.toLowerCase() === preferTable.toLowerCase()) : undefined;
          setActiveTable(match || s.tables[0]);
        }
      })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [database, preferTable]);

  useEffect(() => {
    if (!activeTable) return;
    let alive = true;
    setPreview(null); setPreviewError(null);
    api.tablePreview(database as string, activeTable.schema, activeTable.name, 50)
      .then((body) => alive && setPreview(body))
      .catch((e) => alive && setPreviewError(e));
    return () => { alive = false; };
  }, [database, activeTable]);

  if (error) return <Callout tone="warn" title={`Could not load ${database}`}>{error.message}{error.hint ? `: ${error.hint}` : ''}</Callout>;
  if (!schema) return <div className="table-note">Loading {database} tables...</div>;
  if (!schema.tables.length) return <div className="table-note">{database} has no user tables.</div>;

  const isActive = (t: ExplorerTable) => activeTable && t.name === activeTable.name && t.schema === activeTable.schema;

  return (
    <div className="db-explorer">
      <div className="db-tabs" role="tablist" aria-label={`${database} tables`}>
        {schema.tables.map((t) => (
          <button key={`${t.schema}.${t.name}`} role="tab" aria-selected={Boolean(isActive(t))}
            className={`db-tab ${isActive(t) ? 'active' : ''}`} onClick={() => setActiveTable(t)}>
            {t.name}
          </button>
        ))}
      </div>
      <div className="db-grid">
        {previewError ? <Callout tone="warn" title="Preview failed">{previewError.message}</Callout>
          : preview ? <DataTable columns={preview.columns || []} rows={(preview.rows as any) || []} maxRows={50} />
          : <div className="table-note">Loading {activeTable?.name}...</div>}
      </div>
    </div>
  );
}
