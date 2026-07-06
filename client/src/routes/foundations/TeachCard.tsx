import { formatSql } from '../../lib/sqlFormat';
import type { Concept } from '../../types';

interface Props {
  concept: Concept;
}

export function TeachCard({ concept }: Props) {
  const { teach, title } = concept as Concept & { teach: NonNullable<Concept['teach']> };
  return (
    <section className="teach-card">
      <span className="teach-kicker">Learn this</span>
      <h2>{title}</h2>
      <p className="teach-plain">{teach.plain}</p>
      <p className="teach-model"><strong>Mental model:</strong> {teach.mentalModel}</p>
      <div className="teach-example">
        <span className="teach-example-label">Worked example</span>
        <pre className="sql-block">{formatSql(teach.example.sql)}</pre>
        <p>{teach.example.note}</p>
      </div>
    </section>
  );
}
