import { useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { EmptyState, Button } from '../../components/ui';
import { FoundationsRep } from './FoundationsRep';
import { useFoundations } from '../../state/FoundationsContext';
import { conceptPracticeTarget, checkpointDue } from '../../lib/foundations';

export default function ConceptPractice() {
  const { conceptId } = useParams();
  const { track, state } = useFoundations();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading..." /></AppShell>;
  const concept = conceptPracticeTarget(track, state, conceptId || '');
  if (!concept) return <Navigate to="/learn" replace />;

  if (done) {
    const cpDue = checkpointDue(track, state);
    return (
      <AppShell breadcrumb={<span className="here">Learn / {concept.title}</span>}>
        <div className="fnd-done">
          <h1>Concept practiced.</h1>
          <p style={{ color: 'var(--ink-dim)' }}>
            {cpDue ? 'A checkpoint is ready. Run your guided session to take it and bank your reviews.'
              : 'Run your guided session to keep your spaced reviews on track.'}
          </p>
          <Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button>
        </div>
      </AppShell>
    );
  }

  const reps = concept.exercises;
  const ex = reps[index];
  const isLast = index === reps.length - 1;
  return (
    <AppShell breadcrumb={<span className="here">Learn / {concept.title}</span>}>
      <FoundationsRep key={ex.id} exercise={ex} label={`Practice: ${concept.title}`} kind="new"
        tier="full" teach={index === 0 ? concept.teach : null}
        stepText={`Step ${index + 1} of ${reps.length} - focused practice`} />
      <div className="session-footer">
        <Button variant="primary" onClick={() => (isLast ? setDone(true) : setIndex((i) => i + 1))}>
          {isLast ? 'Done' : 'Next exercise'}
        </Button>
      </div>
    </AppShell>
  );
}
