import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button, ProgressMeter } from '../components/ui.jsx';
import { useFoundations } from '../state/FoundationsContext.jsx';
import { skillLevel, buildTodaySession, graduationStatus } from '../lib/foundations.js';
import { currentPhase, phaseGraduation } from '../lib/learning-path.js';
import './foundations/foundations.css';

export default function Foundations() {
  const { track, phases, state } = useFoundations();
  const navigate = useNavigate();
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path…" /></AppShell>;

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const active = currentPhase(phases, state);
  const started = Object.values(state.skillCorrect).some((a) => a.length);

  const todayLabel = session.main.kind === 'graduated' ? 'All phases complete'
    : session.main.kind === 'checkpoint' ? `Checkpoint: ${session.main.checkpoint.title}`
    : `${session.reviews.length ? `${session.reviews.length} review${session.reviews.length > 1 ? 's' : ''} + ` : ''}New: ${session.main.concept.title}`;

  return (
    <AppShell breadcrumb={<span className="here">Learn — your path</span>}>
      <div className="fnd-home-head">
        <span className="teach-kicker">{started ? 'Keep going' : 'Start here'}</span>
        <h1>Your SQL path</h1>
        <p className="goal">From your first query to senior-level analysis, one dataset, one step at a time — with everything you learn coming back for review so it sticks.</p>
      </div>

      <section className="card" style={{ marginBottom: 'var(--s-4)' }}>
        <ProgressMeter value={Math.round((grad.strongSkills / grad.totalSkills) * 100)} label="Overall mastery" />
        <p style={{ color: 'var(--ink-dim)', fontSize: 'var(--text-sm)', margin: 'var(--s-2) 0 var(--s-3)' }}>
          {grad.strongSkills} of {grad.totalSkills} skills strong · {grad.checkpointsPassed.length} checkpoints passed
        </p>
        {session.main.kind === 'graduated' ? (
          <p style={{ color: 'var(--ok)' }}>You have completed every phase. Senior-ready. 🎉</p>
        ) : (
          <>
            <p style={{ color: 'var(--ink-strong)', marginBottom: 'var(--s-3)' }}>Today: {todayLabel}</p>
            <Button variant="primary" onClick={() => navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session')}>
              {started ? "Continue today's session" : 'Start lesson 1'}
            </Button>
          </>
        )}
      </section>

      {phases.map((phase) => {
        const pg = phaseGraduation(phase, state);
        const isActive = phase.id === active.id;
        const locked = phase.order > active.order;
        return (
          <section key={phase.id} className={`fnd-phase ${isActive ? 'active' : ''} ${locked ? 'locked' : ''}`}>
            <div className="fnd-phase-head">
              <div>
                <span className="fnd-phase-kicker">Phase {phase.order}{locked ? ' · locked' : pg.complete ? ' · complete' : isActive ? ' · in progress' : ''}</span>
                <h2>{phase.title}</h2>
                <p>{phase.goal}</p>
              </div>
              <span className="fnd-phase-score">{pg.strong}/{pg.total}</span>
            </div>
            {!locked ? (
              <div className="fnd-path">
                {phase.concepts.map((c) => {
                  const lvl = skillLevel(state, c.skill);
                  return (
                    <div key={c.id} className={`fnd-step ${lvl.tier === 'strong' ? 'strong' : ''}`}>
                      <span className="fnd-step-num">{lvl.tier === 'strong' ? '✓' : c.order}</span>
                      <div className="fnd-step-body">
                        <strong>{c.title}</strong>
                        <div className="fnd-step-meter"><span style={{ width: `${Math.min(100, (lvl.count / 3) * 100)}%` }} /></div>
                      </div>
                      <span className="fnd-step-tier">{lvl.tier === 'strong' ? 'strong' : lvl.tier === 'learning' ? `${lvl.count}/3` : 'new'}</span>
                    </div>
                  );
                })}
                {phase.checkpoints.map((cp) => (
                  <div key={cp.id} className={`fnd-step fnd-checkpoint-row ${state.checkpointsPassed.includes(cp.id) ? 'strong' : ''}`}>
                    <span className="fnd-step-num">{state.checkpointsPassed.includes(cp.id) ? '✓' : '★'}</span>
                    <div className="fnd-step-body"><strong>{cp.title}</strong></div>
                    <span className="fnd-step-tier">{state.checkpointsPassed.includes(cp.id) ? 'passed' : 'checkpoint'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="fnd-phase-lockmsg">Unlocks when you finish {phases.find((p) => p.order === phase.order - 1).title}.</p>
            )}
          </section>
        );
      })}
    </AppShell>
  );
}
