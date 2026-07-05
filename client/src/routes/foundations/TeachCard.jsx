export function TeachCard({ concept }) {
  const { teach, title } = concept;
  return (
    <section className="teach-card">
      <span className="teach-kicker">Learn this</span>
      <h2>{title}</h2>
      <p className="teach-plain">{teach.plain}</p>
      <p className="teach-model"><strong>Mental model:</strong> {teach.mentalModel}</p>
      <div className="teach-example">
        <span className="teach-example-label">Worked example</span>
        <pre>{teach.example.sql}</pre>
        <p>{teach.example.note}</p>
      </div>
    </section>
  );
}
