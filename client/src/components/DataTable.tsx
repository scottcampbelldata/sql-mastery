import './components.css';

function formatCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') { try { return JSON.stringify(value); } catch { return String(value); } }
  return String(value);
}

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  maxRows?: number;
}

export function DataTable({ columns, rows, maxRows = 100 }: DataTableProps) {
  if (!columns || !columns.length) return null;
  if (!rows.length) return <div className="table-note">0 rows returned.</div>;
  const shown = rows.slice(0, maxRows);
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = formatCell(row[c]);
                return v === null
                  ? <td key={c} className="cell-null">NULL</td>
                  : <td key={c} title={v}>{v}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > maxRows
        ? <div className="table-note">Showing first {maxRows} of {rows.length} rows.</div>
        : null}
    </div>
  );
}
