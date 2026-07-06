import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button } from '../components/ui.jsx';
import { useFoundations } from '../state/FoundationsContext.jsx';
import { skillLevel, buildTodaySession, graduationStatus } from '../lib/foundations.js';
import { currentPhase, phaseGraduation } from '../lib/learning-path.js';
import './foundations/foundations.css';

function Ring({ value }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg className="lh-ring-svg" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--brand)" strokeWidth="11"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
    </svg>
  );
}

export default function Foundations() {
  const { track, phases, state } = useFoundations();
  const navigate = useNavigate();
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path…" /></AppShell>;

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const active = currentPhase(phases, state);
  const started = Object.values(state.skillCorrect).some((a) => a.length);
  const pct = Math.round((grad.strongSkills / grad.totalSkills) * 100);

  const todayLabel = session.main.kind === 'graduated' ? 'Every phase complete'
    : session.main.kind === 'checkpoint' ? session.main.checkpoint.title
    : `${session.reviews.length ? `${session.reviews.length} review${session.reviews.length > 1 ? 's' : ''} + ` : ''}new lesson: ${session.main.concept.title}`;

  function go() {
    navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session');
  }

  return (
    <AppShell breadcrumb={<span className="here">Your path</span>}>
      <section className="lh-hero">
        <div className="lh-hero-copy">
          <span className="lh-kick">{started ? 'Keep going' : 'Start here'}</span>
          <h1>Your path to senior SQL</h1>
          <p className="lh-sub">From your first query to interview-ready analysis: one dataset, one step at a time, with everything you learn coming back so it sticks.</p>
          {session.main.kind === 'graduated'
            ? <p className="lh-grad">You’ve completed every phase. Senior-ready.</p>
            : <>
                <div className="lh-today"><span>Today</span> {todayLabel}</div>
                <Button variant="primary" onClick={go}>{started ? "Continue today's session" : 'Start lesson 1'} →</Button>
              </>}
        </div>
        <div className="lh-ring">
          <Ring value={pct} />
          <div className="lh-ring-num"><b>{grad.strongSkills}<span>/{grad.totalSkills}</span></b><em>skills strong</em></div>
        </div>
      </section>

      <div className="lh-sec-head">
        <h2><span className="lh-sec-num">Phase {active.order}</span> {active.title}</h2>
        <p>{active.goal}</p>
      </div>
      <div className="lh-grid">
        {active.concepts.map((c) => {
          const lvl = skillLevel(state, c.skill);
          return (
            <div key={c.id} className={`lh-tile ${lvl.tier === 'strong' ? 'ok' : lvl.count ? 'now' : ''}`}>
              <div className="lh-tile-head">
                <span className="lh-tile-num">{lvl.tier === 'strong' ? '✓' : c.order}</span>
                <strong>{c.title}</strong>
                <span className="lh-tile-tier">{lvl.tier === 'strong' ? 'strong' : lvl.count ? `${lvl.count}/3` : 'new'}</span>
              </div>
              <div className="lh-tile-bar"><i style={{ width: `${Math.min(100, (lvl.count / 3) * 100)}%` }} /></div>
            </div>
          );
        })}
        {active.checkpoints.map((cp) => {
          const passed = state.checkpointsPassed.includes(cp.id);
          return (
            <div key={cp.id} className={`lh-tile lh-tile-cp ${passed ? 'ok' : ''}`}>
              <div className="lh-tile-head">
                <span className="lh-tile-num">{passed ? '✓' : '★'}</span>
                <strong>{cp.title}</strong>
                <span className="lh-tile-tier">{passed ? 'passed' : 'checkpoint'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="lh-sec-head lh-sec-head-sub"><h2>All phases</h2></div>
      <div className="lh-phaselist">
        {phases.map((phase) => {
          const pg = phaseGraduation(phase, state);
          const isActive = phase.id === active.id;
          const locked = phase.order > active.order;
          const status = locked ? 'locked' : pg.complete ? 'complete' : isActive ? 'in progress' : 'available';
          return (
            <div key={phase.id} className={`lh-prow ${isActive ? 'active' : ''} ${locked ? 'locked' : ''} ${pg.complete ? 'done' : ''}`}>
              <span className="lh-prow-num">{pg.complete ? '✓' : phase.order}</span>
              <div className="lh-prow-body">
                <strong>{phase.title}</strong>
                <span>{phase.goal}</span>
              </div>
              <span className={`lh-prow-badge ${pg.complete ? 'done' : locked ? 'lock' : 'active'}`}>{status}</span>
              <span className="lh-prow-score">{pg.strong}/{pg.total}</span>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
