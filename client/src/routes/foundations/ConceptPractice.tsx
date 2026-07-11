import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState, Button } from '../../components/ui';
import { FoundationsRep } from './FoundationsRep';
import { useFoundations } from '../../state/FoundationsContext';
import { buildTodaySession, conceptPracticeTarget, scaffoldTier } from '../../lib/foundations';
import { scaffoldCtxFor } from '../../lib/bands';
import { buildLessonSteps } from '../../lib/lessonSteps';

export default function ConceptPractice() {
  const { conceptId } = useParams();
  const { track, state } = useFoundations();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [locallyCorrect, setLocallyCorrect] = useState<Record<string, boolean>>({});

  const concept = track ? conceptPracticeTarget(track, state, conceptId || '') : null;
  const steps = useMemo(() => (concept ? buildLessonSteps(concept) : []), [concept]);
  const savedCorrect = new Set(concept ? (state.skillCorrect[concept.skill] || []) : []);

  useEffect(() => {
    if (!concept || !steps.length) return;
    const firstOpen = steps.findIndex((step) => !savedCorrect.has(step.id) && !locallyCorrect[step.id]);
    setIndex(firstOpen >= 0 ? firstOpen : steps.length - 1);
  }, [concept?.id, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading..." /></AppShell>;
  if (!concept || !steps.length) return <Navigate to="/learn" replace />;

  const step = steps[Math.min(index, steps.length - 1)];
  const stepDone = savedCorrect.has(step.id) || locallyCorrect[step.id];
  const isLast = index === steps.length - 1;

  function goAfterLesson() {
    const session = buildTodaySession(track!, state);
    if (session.main.kind === 'checkpoint') {
      navigate(`/learn/checkpoint/${session.main.checkpoint.id}`);
    } else if (session.main.kind === 'lesson') {
      navigate(`/learn/concept/${session.main.concept.id}`);
    } else {
      navigate('/learn');
    }
  }

  function continueLesson() {
    if (!stepDone) return;
    if (isLast) goAfterLesson();
    else setIndex((i) => i + 1);
  }

  return (
    <AppShell breadcrumb={<span className="here">Learn / {concept.title}</span>}>
      <FoundationsRep key={step.id} exercise={step.exercise} label={`Practice: ${concept.title}`} kind="new"
        tier={scaffoldTier(state, concept.skill, false, scaffoldCtxFor(track.phases, state, concept.skill))}
        teach={index === 0 ? concept.teach : null}
        stepText={`Step ${index + 1} of ${steps.length} - focused practice`}
        onCorrect={() => setLocallyCorrect((current) => ({ ...current, [step.id]: true }))} />
      <div className="session-footer">
        <Button variant="primary" onClick={continueLesson} disabled={!stepDone}>
          {isLast ? 'Done' : 'Next exercise'}
        </Button>
      </div>
    </AppShell>
  );
}
