import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button, ProgressMeter } from '../components/ui.jsx';
import { useFoundations } from '../state/FoundationsContext.jsx';
import { skillLevel, buildTodaySession, graduationStatus } from '../lib/foundations.js';
import './foundations/foundations.css';

export default function Foundations() {
  const { track, state } = useFoundations();
  const navigate = useNavigate();

  if (!track) {
    return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading Foundations…" /></AppShell>;
  }

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const started = Object.values(state.skillCorrect).some((a) => a.length);

  const todayLabel = session.main.kind === 'graduated' ? 'All done'
    : session.main.kind === 'checkpoint' ? `Checkpoint: ${session.main.checkpoint.title}`
    : `${session.reviews.length ? `${session.reviews.length} quick review${session.reviews.length > 1 ? 's' : ''} + ` : ''}New lesson: ${session.main.concept.title}`;

  return (
    <AppShell breadcrumb={<span className="here">Learn — Foundations</span>}>
      <div className="fnd-home-head">
        <span className="teach-kicker">{started ? 'Keep going' : 'Start here'}</span>
        <h1>SQL Foundations</h1>
        <p className="goal">Learn to query a database one step at a time, on a real music-store dataset. Each concept comes back for review so it sticks.</p>
      </div>

      <section className="card" style={{ marginBottom: 'var(--s-4)' }}>
        <ProgressMeter value={Math.round((grad.strongSkills / grad.totalSkills) * 100)} label="Foundations mastery" />
        <p style={{ color: 'var(--ink-dim)', fontSize: 'var(--text-sm)', margin: 'var(--s-2) 0 var(--s-3)' }}>
          {grad.strongSkills} of {grad.totalSkills} skills strong · {grad.checkpointsPassed.length}/2 checkpoints passed
        </p>
        {grad.graduated ? (
          <>
            <p style={{ color: 'var(--ok)' }}>You have single-table fluency. Ready for the interview academy.</p>
            <Button variant="primary" onClick={() => navigate('/academy')}>Go to the Academy →</Button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--ink-strong)', marginBottom: 'var(--s-3)' }}>Today: {todayLabel}</p>
            <Button variant="primary" onClick={() => navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session')}>
              {started ? "Continue today's session" : 'Start lesson 1'}
            </Button>
          </>
        )}
      </section>

      <h2 style={{ fontSize: 'var(--text-lg)', margin: 'var(--s-4) 0 var(--s-2)' }}>Your path</h2>
      <div className="fnd-path">
        {track.concepts.map((c) => {
          const lvl = skillLevel(state, c.skill);
          return (
            <div key={c.id} className={`fnd-step ${lvl.tier === 'strong' ? 'strong' : ''}`}>
              <span className="fnd-step-num">{lvl.tier === 'strong' ? '✓' : c.order}</span>
              <div className="fnd-step-body">
                <strong>{c.title}</strong>
                <div className="fnd-step-meter"><span style={{ width: `${Math.min(100, (lvl.count / 3) * 100)}%` }} /></div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-dim)' }}>
                {lvl.tier === 'strong' ? 'strong' : lvl.tier === 'learning' ? `${lvl.count}/3` : 'new'}
              </span>
            </div>
          );
        })}
        {track.checkpoints.map((cp) => (
          <div key={cp.id} className={`fnd-step fnd-checkpoint-row ${state.checkpointsPassed.includes(cp.id) ? 'strong' : ''}`}>
            <span className="fnd-step-num">{state.checkpointsPassed.includes(cp.id) ? '✓' : '★'}</span>
            <div className="fnd-step-body"><strong>{cp.title}</strong></div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-dim)' }}>
              {state.checkpointsPassed.includes(cp.id) ? 'passed' : 'checkpoint'}
            </span>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
