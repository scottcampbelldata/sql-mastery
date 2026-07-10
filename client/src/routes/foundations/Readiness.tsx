import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useFoundations } from '../../state/FoundationsContext';
import { frontierConcept } from '../../lib/foundations';
import { readinessReport, type ReadinessStatus } from '../../lib/readiness';
import './readiness.css';

const STATUS_LABEL: Record<ReadinessStatus, string> = {
  mastered: 'Mastered',
  practicing: 'Practicing',
  'not-started': 'Not started'
};

export function Readiness() {
  const { track, phases, state } = useFoundations();
  const report = useMemo(() => readinessReport(phases, state), [phases, state]);
  const frontier = useMemo(() => (track ? frontierConcept(track, state) : null), [track, state]);

  if (!phases.length) return <div className="table-note">Loading your path...</div>;

  return (
    <div className="readiness">
      <header className="rd-head">
        <h1>Interview readiness</h1>
        <p className="rd-sub">
          Your progress toward a senior data-analyst / BI SQL interview, topic by topic. A topic reads
          as <b>Mastered</b> once you have answered it correctly enough times for it to enter spaced review.
        </p>
      </header>

      <section className="rd-summary">
        <div className="rd-overall">
          <div className="rd-overall-top">
            <span className="rd-overall-pct">{report.pct}%</span>
            <span className="rd-overall-meta">{report.mastered} of {report.total} topics mastered</span>
          </div>
          <div className="rd-bar"><span style={{ width: report.pct + '%' }} /></div>
        </div>
        <div className="rd-band-mini">
          {report.bands.map((band) => (
            <div key={band.level} className="rd-mini">
              <div className="rd-mini-top">
                <span className="rd-mini-title">{band.title}</span>
                <span className="rd-mini-count">{band.mastered}/{band.total}</span>
              </div>
              <div className="rd-bar sm"><span style={{ width: band.pct + '%' }} /></div>
            </div>
          ))}
        </div>
      </section>

      {frontier ? (
        <div className="rd-next">
          <span className="rd-next-tag">Next up</span>
          <span className="rd-next-title">{frontier.title}</span>
          <Link className="rd-next-link" to="/learn">Go practice</Link>
        </div>
      ) : null}

      {report.bands.map((band) => (
        <section key={band.level} className="rd-band">
          <div className="rd-band-head">
            <h2>{band.title}</h2>
            <span className="rd-badge">{band.badge}</span>
            <span className="rd-band-count">{band.mastered}/{band.total} mastered</span>
          </div>
          {band.phases.map((phase) => (
            <div key={phase.id} className="rd-phase">
              <h3 className="rd-phase-title">{phase.title}</h3>
              <ul className="rd-list">
                {phase.concepts.map((row) => (
                  <li key={row.concept.id} className={`rd-row rd-${row.status}`}>
                    <span className={`rd-dot rd-${row.status}`} aria-hidden="true" />
                    <div className="rd-row-main">
                      <div className="rd-row-top">
                        <span className="rd-topic">{row.concept.title}</span>
                        <span className="rd-status">{STATUS_LABEL[row.status]}</span>
                      </div>
                      {row.concept.teach?.interviewNote ? (
                        <p className="rd-interview">{row.concept.teach.interviewNote}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
