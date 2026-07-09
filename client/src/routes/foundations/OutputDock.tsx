import { useEffect, useState } from 'react';
import { Tabs, Pill } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { SchemaExplorer } from './SchemaExplorer';
import type { Exercise, QueryResult } from '../../types';

type RunResult = QueryResult & { command?: string; durationMs?: number };

interface Props {
  exercise: Exercise;
  result: RunResult | null;
}

export function OutputDock({ exercise, result }: Props) {
  const hasDb = Boolean(exercise.database);
  const [tab, setTab] = useState(result ? 'results' : hasDb ? 'schema' : 'results');

  useEffect(() => { if (result) setTab('results'); }, [result]);

  return (
    <section className="dock">
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'results', label: 'Query results' },
        { id: 'schema', label: 'Database', disabled: !hasDb }
      ]} />
      <div className="dock-panel">
        {tab === 'schema'
          ? <SchemaExplorer database={exercise.database} />
          : result
            ? (<>
                <div className="dock-results-meta">
                  <Pill tone="ok">{result.command} | {result.rowCount} rows | {result.durationMs} ms</Pill>
                </div>
                <DataTable columns={result.columns || []} rows={(result.rows as any) || []} />
              </>)
            : <div className="table-note">Run your SQL to see rows here.</div>}
      </div>
    </section>
  );
}
