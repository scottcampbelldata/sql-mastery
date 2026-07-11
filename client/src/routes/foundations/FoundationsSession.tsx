import { useEffect, useState, useMemo } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState, Button } from '../../components/ui';
import { useFoundations } from '../../state/FoundationsContext';
import { buildTodaySession, advanceSession, scaffoldTier } from '../../lib/foundations';
import { scaffoldCtxFor } from '../../lib/bands';
import { buildLessonSteps } from '../../lib/lessonSteps';
import { FoundationsRep } from './FoundationsRep';
import type { TodaySession } from '../../lib/foundations';
import type { Exercise, Concept, LearningState } from '../../types';
import './foundations.css';

interface Step {
  type: 'review' | 'rep';
  exercise: Exercise;
  concept: Concept;
  tier: ReturnType<typeof scaffoldTier>;
}

export default function FoundationsSession() {
  const { track, state, update } = useFoundations();
  const navigate = useNavigate();

  // Freeze the session plan for this visit so completing reps does not reshuffle it.
  const plan = useMemo<TodaySession | null>(() => (track ? buildTodaySession(track, state) : null), [track]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tiers are frozen alongside the plan: only the first rep of a brand-new skill gets the
  // first-exposure help bump, and passing a step (or a review) must not re-scaffold the
  // exercise still on screen.
  const steps = useMemo<Step[]>(() => {
    if (!plan) return [];
    const s: Step[] = plan.reviews.map((r) => ({
      type: 'review', exercise: r.exercise, concept: r.concept,
      tier: scaffoldTier(state, r.concept.skill, true, scaffoldCtxFor(track?.phases, state, r.concept.skill))
    }));
    if (plan.main.kind === 'lesson') {
      const concept = (plan.main as { concept: Concept }).concept;
      const ctx = scaffoldCtxFor(track?.phases, state, concept.skill);
      buildLessonSteps(concept, plan.main.reps).forEach((step, stepIndex) => s.push({
        type: 'rep', exercise: step.exercise, concept,
        tier: scaffoldTier(state, concept.skill, false, ctx && { ...ctx, firstExposure: ctx.firstExposure && stepIndex === 0 })
      }));
    }
    return s;
  }, [plan]); // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const firstOpen = steps.findIndex((step) => !(state.skillCorrect[step.concept.skill] || []).includes(step.exercise.id));
    setIndex(firstOpen >= 0 ? firstOpen : Math.max(0, steps.length - 1));
  }, [steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading..." /></AppShell>;
  // Declarative redirects (safe during render) for the boundary cases: a checkpoint is due,
  // or the learner has graduated and has no lesson queued.
  if (plan!.main.kind === 'checkpoint') return <Navigate to={`/learn/checkpoint/${plan!.main.checkpoint.id}`} replace />;
  if (plan!.main.kind === 'graduated') return <Navigate to="/learn" replace />;

  function completeSession() {
    update((s: LearningState) => advanceSession(s));
    setFinished(true);
  }

  if (finished) {
    return (
      <AppShell breadcrumb={<span className="here">Learn / session complete</span>}>
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
  const stepDone = (state.skillCorrect[step.concept.skill] || []).includes(step.exercise.id);
  const showTeach = step.type === 'rep' && (index === 0 || steps[index - 1].type !== 'rep');
  const label = step.type === 'review'
    ? `Review | ${step.concept.title}`
    : `New | ${step.concept.title}`;
  const stepText = `Step ${index + 1} of ${steps.length}${step.type === 'review' ? ' | spaced review' : ''}`;

  function next() {
    if (!stepDone) return;
    if (isLast) completeSession();
    else setIndex((i) => i + 1);
  }

  return (
    <AppShell breadcrumb={<span className="here">Learn / Today's lesson</span>}>
      <FoundationsRep key={step.exercise.id} exercise={step.exercise}
        label={label} kind={step.type === 'review' ? 'review' : 'new'}
        tier={step.tier}
        teach={showTeach ? step.concept.teach : null} stepText={stepText} />
      <div className="session-footer">
        <Button variant="primary" onClick={next} disabled={!stepDone}>{isLast ? 'Finish session' : 'Next exercise'}</Button>
      </div>
    </AppShell>
  );
}
