import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Callout } from '../../components/ui.jsx';

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
    api.tablePreview(database, activeTable.schema, activeTable.name)
      .then((body) => alive && setPreview(body))
      .catch((e) => alive && setPreviewError(e));
    return () => { alive = false; };
  }, [database, activeTable]);

  if (error) return <Callout tone="warn" title={`Could not load ${database}`}>{error.message}{error.hint ? ` — ${error.hint}` : ''}</Callout>;
  if (!schema) return <div className="table-note">Loading {database} tables…</div>;
  if (!schema.tables.length) return <div className="table-note">{database} has no user tables.</div>;

  return (
    <div className="schema-explorer">
      <div className="table-strip">
        {schema.tables.map((t) => (
          <button key={`${t.schema}.${t.name}`}
            aria-pressed={Boolean(activeTable && t.name === activeTable.name && t.schema === activeTable.schema)}
            className={`table-chip ${activeTable && t.name === activeTable.name && t.schema === activeTable.schema ? 'active' : ''}`}
            onClick={() => setActiveTable(t)}>
            <strong>{t.name}</strong>
            <span>{Number.isFinite(Number(t.estimatedRows)) ? `~${Number(t.estimatedRows).toLocaleString()}` : '?'} rows</span>
          </button>
        ))}
      </div>
      {activeTable ? (
        <div className="schema-detail">
          <div className="column-list">
            {activeTable.columns.map((c) => (
              <div key={c.name} className="column-row">
                <strong>{c.name}</strong>
                <span>{c.type}{c.nullable ? '' : ' · required'}</span>
                <span className="key-badges">
                  {c.isPrimaryKey ? <em>PK</em> : null}
                  {c.foreignKey ? <em>FK → {c.foreignKey.table}.{c.foreignKey.column}</em> : null}
                </span>
              </div>
            ))}
          </div>
          <div className="preview-pane">
            {previewError ? <Callout tone="warn" title="Preview failed">{previewError.message}</Callout>
              : preview ? <DataTable columns={preview.columns || []} rows={preview.rows || []} maxRows={6} />
              : <div className="table-note">Loading sample rows…</div>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
