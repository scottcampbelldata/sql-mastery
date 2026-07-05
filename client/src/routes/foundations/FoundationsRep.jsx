import { useState } from 'react';
import { useFoundations } from '../../state/FoundationsContext.jsx';
import { useSqlCheck } from '../../lib/useSqlCheck.js';
import { recordCorrect, recordAttempt } from '../../lib/foundations.js';
import { starterSqlForExercise } from '../../lib/sqlScaffold.js';
import { SqlEditor } from '../../components/SqlEditor.jsx';
import { OutputDock } from '../session/OutputDock.jsx';
import { Button, Callout, Pill } from '../../components/ui.jsx';

const isMac = navigator.platform.toUpperCase().includes('MAC');

export function editorPlaceholder(exercise) {
  return starterSqlForExercise(exercise)
    ? 'Replace ____ in the starter SQL, then run it.'
    : 'Type your SQL here...';
}

// label: e.g. "Review: Sort and take the top rows" or "New — Rep 2 of 3".
// onCorrect: called once when this rep is first answered correctly (to advance the queue).
export function FoundationsRep({ exercise, label, kind, onCorrect }) {
  const { update } = useFoundations();
  const check = useSqlCheck(exercise, {
    onAttempt: () => update((s) => recordAttempt(s, exercise.id)),
    onResult: (correct) => { if (correct) { update((s) => recordCorrect(s, exercise)); onCorrect?.(); } }
  });

  return (
    <article className="fnd-rep">
      <div className="fnd-rep-head">
        <Pill tone={kind === 'review' ? 'info' : 'brand'}>{label}</Pill>
        <Pill tone="info">chinook</Pill>
      </div>
      <p className="fnd-task">{exercise.task}</p>
      <span className="wb-editor-label" aria-hidden="true">Your SQL — write your answer here</span>
      <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
        placeholder={editorPlaceholder(exercise)} ariaLabel="SQL editor" />
      <div className="fnd-actions">
        <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
          {check.checking ? 'Checking…' : `Run & check  ${isMac ? '⌘⏎' : 'Ctrl+⏎'}`}
        </Button>
        {exercise.hint ? <HintButton hint={exercise.hint} /> : null}
      </div>
      <div role="status" aria-live="polite">
        {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
      </div>
      <OutputDock exercise={exercise} result={check.result} />
    </article>
  );
}

function HintButton({ hint }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={open}>Hint</Button>
      {open ? <Callout tone="tip" title="Hint">{hint}</Callout> : null}
    </>
  );
}
