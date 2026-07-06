import { useState } from 'react';
import { useFoundations } from '../../state/FoundationsContext';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { recordCorrect, recordAttempt } from '../../lib/foundations';
import { starterSqlForExercise } from '../../lib/sqlScaffold';
import { formatSql } from '../../lib/sqlFormat';
import { useDbSchema } from '../../lib/dbSchema';
import { SqlEditor } from '../../components/SqlEditor';
import { OutputDock } from '../session/OutputDock';
import { Button, Callout } from '../../components/ui';
import type { Exercise, Teach, LearningState } from '../../types';

const isMac = navigator.platform.toUpperCase().includes('MAC');

export function editorPlaceholder(exercise: Exercise): string {
  return starterSqlForExercise(exercise)
    ? 'Replace ____ in the starter SQL, then run it.'
    : 'Type your SQL here...';
}

interface Props {
  exercise: Exercise;
  label: string;
  kind: string;
  teach?: Teach | null;
  stepText?: string;
  onCorrect?: () => void;
}

// LearnSQL-style two panel. LEFT (narrower) = instructions: theory + example + task.
// RIGHT (wider) = console: editor on top, then results / database browser stacked below.
// teach (optional): the concept's teach block, shown on a new lesson's reps.
export function FoundationsRep({ exercise, label, kind, teach, stepText, onCorrect }: Props) {
  const { update } = useFoundations();
  const [hintOpen, setHintOpen] = useState(false);
  const dbSchema = useDbSchema(exercise.database);
  const check = useSqlCheck(exercise, {
    onAttempt: () => update((s: LearningState) => recordAttempt(s, exercise.id)),
    onResult: (correct: boolean) => { if (correct) { update((s: LearningState) => recordCorrect(s, exercise)); onCorrect?.(); } }
  });

  return (
    <div className="lesson-split">
      <aside className="instr">
        <div className="instr-top">
          <span className={`step-badge ${kind === 'review' ? 'review' : 'new'}`}>{label}</span>
          {stepText ? <span className="step-text">{stepText}</span> : null}
        </div>
        {teach ? (
          <div className="instr-teach">
            <p className="instr-lead">{teach.plain}</p>
            <p className="instr-model"><b>Mental model:</b> {teach.mentalModel}</p>
            <div className="instr-example">
              <span className="instr-label">Example</span>
              <pre className="sql-block">{formatSql(teach.example.sql)}</pre>
              <p className="instr-note">{teach.example.note}</p>
            </div>
          </div>
        ) : null}
        <div className="instr-exercise">
          <span className="instr-label">Exercise</span>
          <p className="instr-task">{exercise.task}</p>
        </div>
        {exercise.hint ? (
          <div className="instr-hint">
            <Button onClick={() => setHintOpen(true)} disabled={hintOpen}>Hint</Button>
            {hintOpen ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}
          </div>
        ) : null}
      </aside>

      <section className="console">
        <div className="console-editor">
          <span className="wb-editor-label" aria-hidden="true">Your SQL</span>
          <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
            placeholder={editorPlaceholder(exercise)} ariaLabel="SQL editor" minHeight="180px" schema={dbSchema} />
          <div className="console-actions">
            <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
              {check.checking ? 'Checking…' : `Run and check  ${isMac ? '⌘↵' : 'Ctrl+↵'}`}
            </Button>
          </div>
        </div>
        <div role="status" aria-live="polite">
          {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
        </div>
        <OutputDock exercise={exercise} result={check.result} />
      </section>
    </div>
  );
}
