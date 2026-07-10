import { useState } from 'react';
import { Pill } from '../../components/ui';
import { DataTable } from '../../components/DataTable';
import { SchemaExplorer } from './SchemaExplorer';
import type { Exercise, QueryResult } from '../../types';

type RunResult = QueryResult & { command?: string; durationMs?: number };

interface Props {
  exercise: Exercise;
  result: RunResult | null;
}

// Calm data panel: your results show only after you run; the table reference stays
// tucked into a collapsed "peek" so it never competes with the exercise.
export function OutputDock({ exercise, result }: Props) {
  const hasDb = Boolean(exercise.database);
  const [peekOpen, setPeekOpen] = useState(false);

  return (
    <div className="dock2">
      {result ? (
        <section className="dock-results">
          <div className="dock-results-meta">
            <Pill tone="ok">{result.command} | {result.rowCount} rows | {result.durationMs} ms</Pill>
          </div>
          <DataTable columns={result.columns || []} rows={(result.rows as any) || []} />
        </section>
      ) : null}

      {hasDb ? (
        <details className="dock-peek" onToggle={(e) => setPeekOpen((e.target as HTMLDetailsElement).open)}>
          <summary>Peek at the {exercise.database} tables</summary>
          {peekOpen ? <div className="dock-peek-body"><SchemaExplorer database={exercise.database} /></div> : null}
        </details>
      ) : null}
    </div>
  );
}
