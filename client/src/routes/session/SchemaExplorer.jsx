import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Callout } from '../../components/ui.jsx';

// LearnSQL-style database browser: a row of table tabs, and the selected table's
// data shown as a grid below.
export function SchemaExplorer({ database }) {
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    let alive = true;
    setSchema(null); setError(null); setActiveTable(null);
    api.schema(database)
      .then((body) => { if (!alive) return; setSchema(body); if (body.tables?.length) setActiveTable(body.tables[0]); })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [database]);

  useEffect(() => {
    if (!activeTable) return;
    let alive = true;
    setPreview(null); setPreviewError(null);
    api.tablePreview(database, activeTable.schema, activeTable.name, 50)
      .then((body) => alive && setPreview(body))
      .catch((e) => alive && setPreviewError(e));
    return () => { alive = false; };
  }, [database, activeTable]);

  if (error) return <Callout tone="warn" title={`Could not load ${database}`}>{error.message}{error.hint ? `: ${error.hint}` : ''}</Callout>;
  if (!schema) return <div className="table-note">Loading {database} tables…</div>;
  if (!schema.tables.length) return <div className="table-note">{database} has no user tables.</div>;

  const isActive = (t) => activeTable && t.name === activeTable.name && t.schema === activeTable.schema;

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
          : preview ? <DataTable columns={preview.columns || []} rows={preview.rows || []} maxRows={50} />
          : <div className="table-note">Loading {activeTable.name}…</div>}
      </div>
    </div>
  );
}
