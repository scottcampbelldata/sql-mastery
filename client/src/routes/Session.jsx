import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState } from '../components/ui.jsx';
import { ExerciseRail } from './session/ExerciseRail.jsx';
import { Workbench } from './session/Workbench.jsx';
import './session/session.css';

export default function Session() {
  const { sessionId, exerciseId } = useParams();
  const { curriculum, progress, setActiveSessionId } = useCurriculum();
  const navigate = useNavigate();

  const session = curriculum.sessions.find((s) => s.id === sessionId);
  useEffect(() => { if (session) setActiveSessionId(session.id); }, [session, setActiveSessionId]);

  if (!session) return <AppShell breadcrumb={<span className="here">Session</span>}><EmptyState title="Session not found" /></AppShell>;

  const firstIncomplete = session.exerciseIds.find((id) => !progress.completed[id]) || session.exerciseIds[0];
  const activeId = exerciseId && session.exerciseIds.includes(exerciseId) ? exerciseId : firstIncomplete;
  const exercise = curriculum.exercises.find((e) => e.id === activeId);

  // Canonicalize a bad exercise id in the URL instead of silently diverging from it.
  if (exerciseId && exerciseId !== activeId) {
    return <Navigate replace to={`/session/${session.id}/${activeId}`} />;
  }
  if (!exercise) {
    return (
      <AppShell breadcrumb={<span className="here">{session.title}</span>}>
        <EmptyState title="Exercise not found" />
      </AppShell>
    );
  }

  const goTo = (exId) => navigate(`/session/${session.id}/${exId}`);
  const nextTarget = (() => {
    const i = session.exerciseIds.indexOf(activeId);
    if (i < session.exerciseIds.length - 1) return { label: 'Next exercise', to: `/session/${session.id}/${session.exerciseIds[i + 1]}` };
    const nextSession = curriculum.sessions[session.sequence]; // sequence is 1-based
    return nextSession ? { label: 'Next session', to: `/session/${nextSession.id}` } : null;
  })();

  return (
    <AppShell breadcrumb={<>
      <Link to="/academy">Dashboard</Link><span className="sep">/</span>
      <span>Week {session.week}</span><span className="sep">/</span>
      <span className="here">{session.title}</span>
    </>}>
      <div className="session-head">
        <div>
          <span className="kicker">Week {session.week} · Session {session.day} · {session.durationMinutes} min</span>
          <h1>{session.title}</h1>
          <p className="goal">{session.goal}</p>
        </div>
      </div>
      <div className="session-layout">
        <ExerciseRail session={session} activeId={activeId} onSelect={goTo} />
        <Workbench key={exercise.id} exercise={exercise} session={session} nextTarget={nextTarget} />
      </div>
    </AppShell>
  );
}
