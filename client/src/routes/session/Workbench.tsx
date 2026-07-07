import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurriculum } from '../../state/CurriculumContext';
import { api } from '../../lib/api';
import { markComplete } from '../../lib/progress';
import { hasSqlBlank, starterSqlForExercise } from '../../lib/sqlScaffold';
import { formatSql } from '../../lib/sqlFormat';
import { lessonSlug } from '../../lib/curriculum';
import { useDbSchema } from '../../lib/dbSchema';
import { Button, Pill, Callout } from '../../components/ui';
import { DiffPanel } from '../../components/DiffPanel';
import { SqlEditor } from '../../components/SqlEditor';
import { LearnAccordion } from './LearnAccordion';
import { OutputDock } from './OutputDock';
import type { Exercise, Session, Progress, Feedback, QueryResult, ApiError } from '../../types';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const FEEDBACK_TONE: Record<string, string> = { ok: 'tip', err: 'warn', warn: 'caution' }; // anything else → default info

export function initialWorkbenchSql(exercise: Exercise, progress?: Partial<Progress>): string {
  const saved = progress?.lastSql?.[exercise.id];
  return typeof saved === 'string' && saved.trim() ? saved : starterSqlForExercise(exercise);
}

interface NextTarget {
  label: string;
  to: string;
}

interface Props {
  exercise: Exercise;
  session: Session;
  nextTarget: NextTarget | null;
}

export function Workbench({ exercise, session, nextTarget }: Props) {
  const { progress, updateProgress } = useCurriculum();
  const [sql, setSql] = useState(() => initialWorkbenchSql(exercise, progress));
  const [feedback, setFeedback] = useState<Feedback | null>(null); // {tone, title, message}
  const [result, setResult] = useState<QueryResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const dbSchema = useDbSchema(exercise.database);

  const attempted = Boolean(progress.attempts[exercise.id] || progress.completed[exercise.id]);
  const done = Boolean(progress.completed[exercise.id]);

  /* Persist SQL with a debounce: setSql updates the editor immediately, but writing to
     the progress store (localStorage + a re-render of every context consumer) waits
     ~400ms after the last keystroke. Pending text is flushed before a check runs and
     on unmount so nothing is lost. */
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSql = useRef<string | null>(null);

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

  function persistSql(value: string) {
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
    if (hasSqlBlank(trimmed)) {
      updateProgress((p) => { p.attempts[exercise.id] = (p.attempts[exercise.id] || 0) + 1; });
      setFeedback({ tone: 'warn', title: 'Fill the blanks', message: 'Replace every ____ marker with the missing SQL, or clear the editor and type the whole query.' });
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
        setFeedback({ tone: 'ok', title: body.message!, message: body.why! });
      } else {
        setFeedback({
          tone: body.feedbackType === 'error' ? 'err' : 'warn',
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Close, but not correct yet',
          message: body.feedbackType === 'error'
            ? [body.message, body.hint].filter(Boolean).join(': ')
            : (body.hint || body.message)!,
          diff: body.diff || null
        });
      }
    } catch (error) {
      setResult(null);
      const err = error as ApiError;
      setFeedback({ tone: 'err', title: 'The checker could not run', message: `${err.message}${err.hint ? `: ${err.hint}` : ''}` });
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
        <span className="wb-editor-label" aria-hidden="true">Your SQL: write your answer here</span>
        <SqlEditor value={sql} onChange={persistSql} onSubmit={runCheck}
          placeholder="Type SQL here..." schema={dbSchema} />
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
          <Callout tone={FEEDBACK_TONE[feedback.tone!] || 'info'} title={feedback.title}>
            {feedback.message}
          </Callout>
        ) : null}
        {feedback?.diff ? <DiffPanel diff={feedback.diff} /> : null}
      </div>
      {answerOpen ? <pre className="answer sql-block">{formatSql(exercise.expectedSql) || exercise.solutionNote || 'This exercise is manually reviewed.'}</pre> : null}
      <OutputDock exercise={exercise} result={result} />
    </article>
  );
}
