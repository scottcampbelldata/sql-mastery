import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCurriculum } from '../../state/CurriculumContext.jsx';
import { api } from '../../lib/api.js';
import { markComplete } from '../../lib/progress.js';
import { lessonSlug } from '../../lib/curriculum.js';
import { Button, Pill, Callout } from '../../components/ui.jsx';
import { SqlEditor } from '../../components/SqlEditor.jsx';
import { LearnAccordion } from './LearnAccordion.jsx';
import { OutputDock } from './OutputDock.jsx';

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

  function persistSql(value) {
    setSql(value);
    updateProgress((p) => { p.lastSql[exercise.id] = value; });
  }

  async function runCheck() {
    const trimmed = sql.trim();
    if (!trimmed) {
      setFeedback({ tone: 'warn', title: 'Type a query first', message: 'Use the task statement to decide your SELECT, FROM, filters, sort, and limit.' });
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
          message: body.hint || body.message
        });
      }
    } catch (error) {
      setFeedback({ tone: 'err', title: 'The checker could not run', message: `${error.message}${error.hint ? ` — ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return (
    <article className="workbench">
      <div className="wb-meta">
        <Pill tone="brand">{exercise.stage}</Pill>
        <Pill>{exercise.moduleTitle}</Pill>
        {exercise.database ? <Pill tone="info">{exercise.database}</Pill> : <Pill>verbal</Pill>}
        <Pill tone={exercise.checkable ? 'ok' : 'neutral'}>{exercise.checkable ? 'graded' : 'manual'}</Pill>
        {done ? <Pill tone="ok">solved</Pill> : null}
        <Link className="wb-lesson-link" to={`/lessons/${lessonSlug(exercise.sourceFile)}`}>Open lesson ↗</Link>
      </div>
      <h2>{exercise.title}</h2>
      <p className="wb-task">{exercise.task}</p>
      <LearnAccordion exercise={exercise} defaultOpen={!attempted} />
      <SqlEditor value={sql} onChange={persistSql} onSubmit={runCheck}
        placeholder={(exercise.expectedSql || '').split('\n')[0] || 'SELECT ...'} />
      <div className="wb-actions">
        <Button variant="primary" onClick={runCheck} disabled={!exercise.checkable || checking}>
          {checking ? 'Checking…' : 'Run & check  ⌘⏎'}
        </Button>
        {exercise.hint ? <Button onClick={() => setHintShown(true)} disabled={hintShown}>Hint</Button> : null}
        <Button onClick={() => setAnswerOpen(!answerOpen)}>{answerOpen ? 'Hide answer' : 'Reveal answer'}</Button>
        {nextTarget ? <Link to={nextTarget.to} className="btn btn-secondary wb-next">{nextTarget.label} →</Link> : null}
      </div>
      {hintShown && exercise.hint ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}
      {feedback ? (
        <Callout tone={feedback.tone === 'ok' ? 'tip' : feedback.tone === 'err' ? 'warn' : 'info'} title={feedback.title}>
          {feedback.message}
        </Callout>
      ) : null}
      {answerOpen ? <pre className="answer">{exercise.expectedSql || exercise.solutionNote || 'This exercise is manually reviewed.'}</pre> : null}
      <OutputDock exercise={exercise} result={result} />
    </article>
  );
}
