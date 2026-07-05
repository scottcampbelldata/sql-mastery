import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.jsx';
import { EmptyState, Button } from '../../components/ui.jsx';
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { buildTodaySession, advanceSession } from '../../lib/foundations.js';
import { TeachCard } from './TeachCard.jsx';
import { FoundationsRep } from './FoundationsRep.jsx';
import './foundations.css';

export default function FoundationsSession() {
  const { track, state, update } = useFoundations();
  const navigate = useNavigate();

  // Freeze the session plan for this visit so completing reps does not reshuffle it.
  const plan = useMemo(() => (track ? buildTodaySession(track, state) : null), [track]); // eslint-disable-line react-hooks/exhaustive-deps
  const steps = useMemo(() => {
    if (!plan) return [];
    const s = plan.reviews.map((r) => ({ type: 'review', exercise: r.exercise, concept: r.concept }));
    if (plan.main.kind === 'lesson') plan.main.reps.forEach((ex) => s.push({ type: 'rep', exercise: ex, concept: plan.main.concept }));
    return s;
  }, [plan]);

  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading…" /></AppShell>;
  if (plan.main.kind === 'checkpoint') { navigate(`/learn/checkpoint/${plan.main.checkpoint.id}`, { replace: true }); return null; }
  if (plan.main.kind === 'graduated') { navigate('/learn', { replace: true }); return null; }

  function completeSession() {
    update((s) => advanceSession(s));
    setFinished(true);
  }

  if (finished) {
    return (
      <AppShell breadcrumb={<span className="here">Learn — session complete</span>}>
        <div className="fnd-done">
          <h1>Nice work.</h1>
          <p style={{ color: 'var(--ink-dim)' }}>You finished today's session. Come back for the next lesson and your spaced reviews.</p>
          <Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button>
        </div>
      </AppShell>
    );
  }

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const showTeach = step.type === 'rep' && (index === 0 || steps[index - 1].type !== 'rep');
  const label = step.type === 'review'
    ? `Review: ${step.concept.title}`
    : `New — ${step.concept.title}`;

  function next() { if (isLast) completeSession(); else setIndex((i) => i + 1); }

  return (
    <AppShell breadcrumb={<span className="here">Learn — Foundations</span>}>
      <div className="fnd-session-progress">Step {index + 1} of {steps.length}{step.type === 'review' ? ' · spaced review' : ''}</div>
      {showTeach ? <TeachCard concept={step.concept} /> : null}
      <FoundationsRep key={step.exercise.id} exercise={step.exercise} label={label} kind={step.type === 'review' ? 'review' : 'new'} />
      <div style={{ marginTop: 'var(--s-4)' }}>
        <Button variant="secondary" onClick={next}>{isLast ? 'Finish session' : 'Next →'}</Button>
      </div>
    </AppShell>
  );
}
