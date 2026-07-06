import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { api } from '../lib/api';
import { SchemaExplorer } from './session/SchemaExplorer';
import { SqlEditor } from '../components/SqlEditor';
import { DataTable } from '../components/DataTable';
import { Button, Callout, Pill, cx } from '../components/ui';
import { safeGet, safeSet } from '../lib/progress';
import { useDbSchema } from '../lib/dbSchema';
import type { QueryResult, ApiError } from '../types';
import './session/session.css';
import './databases.css';

const RUNNER_SQL_KEY = 'sqlm:runner:sql';
const RUNNER_DB_KEY = 'sqlm:runner:db';

const isMac = navigator.platform.toUpperCase().includes('MAC');

export default function Databases() {
  const [databases, setDatabases] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [sql, setSql] = useState<string>(() => safeGet(RUNNER_SQL_KEY) || 'SELECT * FROM ');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [running, setRunning] = useState(false);
  const dbSchema = useDbSchema(active);
  const activeRef = useRef<string>(active);
  activeRef.current = active;

  useEffect(() => {
    let alive = true;
    api.databases().then((body) => {
      if (!alive) return;
      const list = (body as { databases?: string[] }).databases || [];
      setDatabases(list);
      const saved = safeGet(RUNNER_DB_KEY);
      setActive(saved && list.includes(saved) ? saved : list[0] || '');
    }).catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, []);

  async function run() {
    if (running) return;
    if (!sql.trim() || !active) return;
    const db = active;
    safeSet(RUNNER_SQL_KEY, sql);
    safeSet(RUNNER_DB_KEY, db);
    setRunning(true); setError(null); setResult(null);
    try {
      const body = await api.query(db, sql.trim());
      if (db === activeRef.current) setResult(body);
    } catch (e) {
      if (db === activeRef.current) setError(e as ApiError);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell breadcrumb={<span className="here">Databases</span>}>
      <div className="session-head">
        <span className="kicker">Explore</span>
        <h1>Databases</h1>
        <p className="goal">Browse every practice database and run scratch queries against it.</p>
      </div>
      <div className="db-chip-row">
        {databases.map((db) => (
          <button key={db} type="button" aria-pressed={db === active}
            className={cx('table-chip', db === active && 'active')}
            onClick={() => { setActive(db); setResult(null); setError(null); }}>
            <strong>{db}</strong>
          </button>
        ))}
      </div>
      {active ? (
        <>
          <SqlEditor value={sql} onChange={setSql} onSubmit={run}
            placeholder="SELECT * FROM orders LIMIT 20;" ariaLabel="Scratch query editor" schema={dbSchema} />
          <div className="db-action-row">
            <Button variant="primary" onClick={run} disabled={running || !sql.trim()}>
              {running ? 'Running…' : `Run  ${isMac ? '⌘⏎' : 'Ctrl+⏎'}`}
            </Button>
            {result ? <Pill tone="ok">{(result as QueryResult & { command?: string }).command} · {result.rowCount} rows · {(result as QueryResult & { durationMs?: number }).durationMs} ms</Pill> : null}
          </div>
          {error ? <Callout tone="warn" title="Query failed">{error.message}{error.hint ? `: ${error.hint}` : ''}</Callout> : null}
          {result ? <DataTable columns={result.columns || []} rows={result.rows || []} maxRows={500} /> : null}
          <section className="dock db-dock">
            <h2 className="db-tables-heading">Tables in {active}</h2>
            <SchemaExplorer database={active} />
          </section>
        </>
      ) : error ? <Callout tone="warn" title="No databases">{error.message}</Callout> : null}
    </AppShell>
  );
}
