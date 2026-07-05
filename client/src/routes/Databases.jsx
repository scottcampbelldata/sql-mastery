import { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell.jsx';
import { api } from '../lib/api.js';
import { SchemaExplorer } from './session/SchemaExplorer.jsx';
import { SqlEditor } from '../components/SqlEditor.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { Button, Callout, Pill } from '../components/ui.jsx';

const RUNNER_SQL_KEY = 'sqlm:runner:sql';
const RUNNER_DB_KEY = 'sqlm:runner:db';

/* localStorage can throw (Safari private mode, quota, disabled storage) —
   treat storage as best-effort, same convention as lib/progress.js. */
function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch { /* best-effort: ignore */ }
}

export default function Databases() {
  const [databases, setDatabases] = useState([]);
  const [active, setActive] = useState('');
  const [sql, setSql] = useState(() => safeGet(RUNNER_SQL_KEY) || 'SELECT * FROM ');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.databases().then((body) => {
      const list = body.databases || [];
      setDatabases(list);
      const saved = safeGet(RUNNER_DB_KEY);
      setActive(saved && list.includes(saved) ? saved : list[0] || '');
    }).catch((e) => setError(e));
  }, []);

  async function run() {
    if (running) return;
    if (!sql.trim() || !active) return;
    safeSet(RUNNER_SQL_KEY, sql);
    safeSet(RUNNER_DB_KEY, active);
    setRunning(true); setError(null); setResult(null);
    try { setResult(await api.query(active, sql.trim())); }
    catch (e) { setError(e); }
    finally { setRunning(false); }
  }

  return (
    <AppShell breadcrumb={<span className="here">Databases</span>}>
      <div className="session-head">
        <span className="kicker">Explore</span>
        <h1>Databases</h1>
        <p className="goal">Browse every practice database and run scratch queries against it.</p>
      </div>
      <div style={{ display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-4) 0' }}>
        {databases.map((db) => (
          <button key={db} type="button" className={`table-chip ${db === active ? 'active' : ''}`}
            onClick={() => { setActive(db); setResult(null); setError(null); }}>
            <strong>{db}</strong>
          </button>
        ))}
      </div>
      {active ? (
        <>
          <SqlEditor value={sql} onChange={setSql} onSubmit={run}
            placeholder="SELECT * FROM orders LIMIT 20;" ariaLabel="Scratch query editor" />
          <div style={{ display: 'flex', gap: 'var(--s-2)', margin: 'var(--s-3) 0', alignItems: 'center' }}>
            <Button variant="primary" onClick={run} disabled={running}>{running ? 'Running…' : 'Run  ⌘⏎'}</Button>
            {result ? <Pill tone="ok">{result.command} · {result.rowCount} rows · {result.durationMs} ms</Pill> : null}
          </div>
          {error ? <Callout tone="warn" title="Query failed">{error.message}{error.hint ? ` — ${error.hint}` : ''}</Callout> : null}
          {result ? <DataTable columns={result.columns || []} rows={result.rows || []} maxRows={500} /> : null}
          <section className="dock" style={{ marginTop: 'var(--s-5)' }}>
            <h2 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--s-3)' }}>Tables in {active}</h2>
            <SchemaExplorer database={active} />
          </section>
        </>
      ) : error ? <Callout tone="warn" title="No databases">{error.message}</Callout> : null}
    </AppShell>
  );
}
