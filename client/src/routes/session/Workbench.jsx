import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurriculum } from '../../state/CurriculumContext.jsx';
import { api } from '../../lib/api.js';
import { markComplete } from '../../lib/progress.js';
import { lessonSlug } from '../../lib/curriculum.js';
import { Button, Pill, Callout } from '../../components/ui.jsx';
import { SqlEditor } from '../../components/SqlEditor.jsx';
import { LearnAccordion } from './LearnAccordion.jsx';
import { OutputDock } from './OutputDock.jsx';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const FEEDBACK_TONE = { ok: 'tip', err: 'warn', warn: 'caution' }; // anything else → default info

export function Workbench({ exercise, session, nextTarget }) {
  const { progress, updateProgress } = useCurriculum();
  const [sql, setSql] = useState(progress.lastSql[exercise.id] || '');
  const [feedback, setFeedback] = useState(null); // {tone, title, message}
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);

  const attempted = Boolean(progress.attempts[exercise.id] || progress.completed[exercise.id]);
  const done = Boolean(progress.completed[exercise.id]);

  /* Persist SQL with a debounce: setSql updates the editor immediately, but writing to
     the progress store (localStorage + a re-render of every context consumer) waits
     ~400ms after the last keystroke. Pending text is flushed before a check runs and
     on unmount so nothing is lost. */
  const persistTimer = useRef(null);
  const pendingSql = useRef(null);

  function flushPendingSql() {
    if (persistTimer.current) { clearTimeout(persistTimer.current); persistTimer.current = null; }
    if (pendingSql.current === null) return;
    const value = pendingSql.current;
    pendingSql.current = null;
    updateProgress((p) => { p.lastSql[exercise.id] = value; });
  }
  const flushRef = useRef(flushPendingSql);
  flushRef.current = flushPendingSql;
  useEffect(() => () => flushRef.current(), []); // flush on unmount

  function persistSql(value) {
    setSql(value);
    pendingSql.current = value;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => { persistTimer.current = null; flushPendingSql(); }, 400);
  }

  async function runCheck() {
    if (checking || !exercise.checkable) return;
    flushPendingSql(); // persist the current editor value synchronously before posting
    setHintShown(false); // one message at a time: a new run replaces the hint
    const trimmed = sql.trim();
    if (!trimmed) {
      setFeedback({ tone: 'warn', title: 'Write your query first', message: 'Type your SQL in the editor above, then press Run & check. Not sure how to start? Open "Learn this first" or press Hint.' });
      return;
    }
    setChecking(true);
    setFeedback({ tone: 'info', title: 'Checking…', message: 'Running your SQL and the model answer on the same database.' });
    updateProgress((p) => { p.attempts[exercise.id] = (p.attempts[exercise.id] || 0) + 1; });
    try {
      const body = await api.check(exercise.database, trimmed, exercise.expectedSql);
      setResult(body.result || null);
      if (body.correct) {
        updateProgress((p) => markComplete(p, exercise.id));
        setFeedback({ tone: 'ok', title: body.message, message: body.why });
      } else {
        setFeedback({
          tone: body.feedbackType === 'error' ? 'err' : 'warn',
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Close, but not correct yet',
          message: body.feedbackType === 'error'
            ? [body.message, body.hint].filter(Boolean).join(' — ')
            : (body.hint || body.message)
        });
      }
    } catch (error) {
      setResult(null);
      setFeedback({ tone: 'err', title: 'The checker could not run', message: `${error.message}${error.hint ? ` — ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return (
    <article className="workbench">
      <div className="wb-meta">
        {exercise.database ? <Pill tone="info">database: {exercise.database}</Pill> : <Pill>discussion exercise</Pill>}
        <Pill tone={exercise.checkable ? 'ok' : 'neutral'}>{exercise.checkable ? 'auto-graded' : 'self-check'}</Pill>
        {done ? <Pill tone="ok">✓ solved</Pill> : null}
        <Link className="wb-lesson-link" to={`/lessons/${lessonSlug(exercise.sourceFile)}`}>Read the full lesson ↗</Link>
      </div>
      <h2>{exercise.title}</h2>
      <p className="wb-task">{exercise.task}</p>
      <LearnAccordion exercise={exercise} defaultOpen={!attempted} />
      <div>
        {/* The editor announces itself via its own aria-label; this is the visual cue. */}
        <span className="wb-editor-label" aria-hidden="true">Your SQL — write your answer here</span>
        <SqlEditor value={sql} onChange={persistSql} onSubmit={runCheck}
          placeholder={(exercise.expectedSql || '').split('\n')[0] || 'SELECT ...'} />
      </div>
      <div className="wb-actions">
        <Button variant="primary" onClick={runCheck} disabled={!exercise.checkable || checking}>
          {checking ? 'Checking…' : `Run & check  ${isMac ? '⌘⏎' : 'Ctrl+⏎'}`}
        </Button>
        {exercise.hint ? <Button onClick={() => { setHintShown(true); setFeedback(null); }} disabled={hintShown && !feedback}>Hint</Button> : null}
        <Button variant="ghost" onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? 'Hide answer' : 'Show me the answer'}</Button>
        {nextTarget ? <Link to={nextTarget.to} className="btn btn-secondary wb-next">{nextTarget.label} →</Link> : null}
      </div>
      {/* One message at a time: the hint hides while grading feedback is fresh. */}
      {hintShown && !feedback && exercise.hint ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}
      <div role="status" aria-live="polite">
        {feedback ? (
          <Callout tone={FEEDBACK_TONE[feedback.tone] || 'info'} title={feedback.title}>
            {feedback.message}
          </Callout>
        ) : null}
      </div>
      {answerOpen ? <pre className="answer">{exercise.expectedSql || exercise.solutionNote || 'This exercise is manually reviewed.'}</pre> : null}
      <OutputDock exercise={exercise} result={result} />
    </article>
  );
}
