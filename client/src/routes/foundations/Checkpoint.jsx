import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppShell } from '../../components/AppShell.jsx';
import { EmptyState, Button, Callout } from '../../components/ui.jsx';
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { recordCheckpointResult, advanceSession, recordCorrect, recordAttempt, CHECKPOINT_SIZE, CHECKPOINT_PASS } from '../../lib/foundations.js';
import { FoundationsRep } from './FoundationsRep.jsx';
import './foundations.css';

// Deterministic shuffle seeded by sessionCounter so the question set is stable within a visit.
function seededPick(pool, count, seed) {
  const arr = [...pool];
  let s = seed + 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

export default function Checkpoint() {
  const { id } = useParams();
  const { track, state, update } = useFoundations();
  const navigate = useNavigate();

  const checkpoint = track ? track.checkpoints.find((c) => c.id === id) : null;
  const questions = useMemo(() => {
    if (!track || !checkpoint) return [];
    const pool = track.exercises.filter((e) => checkpoint.drawFromSkills.includes(e.skill));
    return seededPick(pool, CHECKPOINT_SIZE, state.sessionCounter); // eslint-disable-line react-hooks/exhaustive-deps
  }, [track, checkpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const [index, setIndex] = useState(0);
  const [results, setResults] = useState([]); // booleans, per question
  const [done, setDone] = useState(false);

  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading…" /></AppShell>;
  if (!checkpoint) return <AppShell breadcrumb={<span className="here">Checkpoint</span>}><EmptyState title="Checkpoint not found" /></AppShell>;

  function answer(correct, exercise) {
    update((s) => { recordAttempt(s, exercise.id); if (correct) recordCorrect(s, exercise); });
    const nextResults = [...results, correct];
    if (index + 1 >= questions.length) finish(nextResults);
    else { setResults(nextResults); setIndex((i) => i + 1); }
  }

  function finish(finalResults) {
    const score = finalResults.filter(Boolean).length;
    const missedSkills = questions.filter((q, i) => !finalResults[i]).map((q) => q.skill);
    update((s) => { recordCheckpointResult(s, checkpoint, score, missedSkills); advanceSession(s); });
    setResults(finalResults);
    setDone(true);
  }

  if (done) {
    const score = results.filter(Boolean).length;
    const passed = score >= CHECKPOINT_PASS;
    return (
      <AppShell breadcrumb={<span className="here">Checkpoint result</span>}>
        <div className="fnd-done">
          <h1>{passed ? 'Checkpoint passed! ' : 'Almost there'}</h1>
          <p style={{ color: passed ? 'var(--ok)' : 'var(--ink-dim)' }}>You scored {score} / {questions.length} (need {CHECKPOINT_PASS} to pass).</p>
          {!passed ? <Callout tone="caution" title="Keep practicing">The skills you missed will come back as reviews. Try the checkpoint again after a bit more practice.</Callout> : null}
          <div style={{ marginTop: 'var(--s-4)' }}><Button variant="primary" onClick={() => navigate('/learn')}>Back to Foundations</Button></div>
        </div>
      </AppShell>
    );
  }

  const q = questions[index];
  return (
    <AppShell breadcrumb={<span className="here">{checkpoint.title}</span>}>
      <div className="fnd-session-progress">Mixed practice · Question {index + 1} of {questions.length}</div>
      <div className="cp-dots">
        {questions.map((_, i) => (
          <span key={i} className={`cp-dot ${i < results.length ? (results[i] ? 'pass' : 'fail') : ''} ${i === index ? 'current' : ''}`} />
        ))}
      </div>
      <FoundationsRep key={q.id} exercise={q} label="Mixed practice" kind="new" onCorrect={() => { /* advance handled by button */ }} />
      <div style={{ marginTop: 'var(--s-4)', display: 'flex', gap: 'var(--s-2)' }}>
        <Button variant="primary" onClick={() => answer(true, q)}>I solved it → next</Button>
        <Button variant="secondary" onClick={() => answer(false, q)}>Skip / couldn't solve</Button>
      </div>
      <p style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-xs)', marginTop: 'var(--s-2)' }}>
        Run &amp; check above to confirm your answer, then click "I solved it".
      </p>
    </AppShell>
  );
}
