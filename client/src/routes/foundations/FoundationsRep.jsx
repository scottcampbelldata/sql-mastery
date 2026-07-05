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
  const [hintOpen, setHintOpen] = useState(false);
  const check = useSqlCheck(exercise, {
    onAttempt: () => update((s) => recordAttempt(s, exercise.id)),
    onResult: (correct) => { if (correct) { update((s) => recordCorrect(s, exercise)); onCorrect?.(); } }
  });

  return (
    <article className="fnd-rep">
      <div className="rep-split">
        <div className="rep-left">
          <div className="fnd-rep-head">
            <Pill tone={kind === 'review' ? 'info' : 'brand'}>{label}</Pill>
            <Pill tone="info">chinook</Pill>
          </div>
          <p className="fnd-task">{exercise.task}</p>
          <div className="rep-editor">
            <span className="wb-editor-label" aria-hidden="true">Your SQL</span>
            <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
              placeholder={editorPlaceholder(exercise)} ariaLabel="SQL editor" minHeight="240px" />
          </div>
          <div className="fnd-actions">
            <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
              {check.checking ? 'Checking…' : `Run & check  ${isMac ? '⌘⏎' : 'Ctrl+⏎'}`}
            </Button>
            {exercise.hint ? <Button onClick={() => setHintOpen(true)} disabled={hintOpen}>Hint</Button> : null}
          </div>
          {hintOpen && exercise.hint ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}
          <div role="status" aria-live="polite">
            {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
          </div>
        </div>
        <div className="rep-right">
          <OutputDock exercise={exercise} result={check.result} />
        </div>
      </div>
    </article>
  );
}
