import { useEffect, useState } from 'react';
import { Tabs } from '../../components/ui.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { SchemaExplorer } from './SchemaExplorer.jsx';

export function OutputDock({ exercise, result }) {
  const hasDb = Boolean(exercise.database);
  const [tab, setTab] = useState(result ? 'results' : hasDb ? 'schema' : 'results');

  useEffect(() => { if (result) setTab('results'); }, [result]);

  return (
    <section className="dock">
      <Tabs active={tab} onChange={setTab} tabs={[
        { id: 'results', label: 'Results' },
        { id: 'schema', label: hasDb ? `Schema · ${exercise.database}` : 'Schema', disabled: !hasDb }
      ]} />
      <div className="dock-panel">
        {tab === 'schema'
          ? <SchemaExplorer database={exercise.database} />
          : result
            ? <DataTable columns={result.columns || []} rows={result.rows || []} />
            : <div className="table-note">Run your SQL to see rows here.</div>}
      </div>
    </section>
  );
}
