import { useState } from 'react';
import { useFoundations } from '../../state/FoundationsContext';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { recordCorrect, recordAttempt, recordReviewPass, isSkillStrong } from '../../lib/foundations';
import type { ScaffoldTier } from '../../lib/foundations';
import { starterSqlForExercise, revealHalfScaffold } from '../../lib/sqlScaffold';
import { formatSql } from '../../lib/sqlFormat';
import { useDbSchema } from '../../lib/dbSchema';
import { SqlEditor } from '../../components/SqlEditor';
import { OutputDock } from '../session/OutputDock';
import { Button, Callout } from '../../components/ui';
import { DiffPanel } from '../../components/DiffPanel';
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
  tier?: ScaffoldTier;
}

// LearnSQL-style two panel. LEFT (narrower) = instructions: theory + example + task.
// RIGHT (wider) = console: editor on top, then results / database browser stacked below.
// teach (optional): the concept's teach block, shown on a new lesson's reps.
// tier: how much starter to seed the editor with - 'full' scaffold, 'half' (reveal about
// half the blanks), or 'blank'. A "Show the starter" button always restores the full
// scaffold so a learner is never stranded.
export function FoundationsRep({ exercise, label, kind, teach, stepText, onCorrect, tier = 'full' }: Props) {
  const { state, update } = useFoundations();
  const [hintOpen, setHintOpen] = useState(false);
  const dbSchema = useDbSchema(exercise.database);
  const fullStarter = starterSqlForExercise(exercise);
  const seed = tier === 'blank' ? '' : tier === 'half' ? revealHalfScaffold(fullStarter, exercise.expectedSql) : undefined;
  const check = useSqlCheck(exercise, {
    onAttempt: () => update((s: LearningState) => recordAttempt(s, exercise.id)),
    onResult: (correct: boolean) => {
      if (!correct) return;
      update((s: LearningState) => recordCorrect(s, exercise));
      // A passed review of an already-mastered skill advances its scaffold fade.
      if (kind === 'review' && exercise.skill && isSkillStrong(state, exercise.skill)) {
        update((s: LearningState) => recordReviewPass(s, exercise.skill as string));
      }
      onCorrect?.();
    },
    seed
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
            placeholder={tier === 'blank' ? 'Write the query from memory. Stuck? Use "Show the starter".'
              : tier === 'half' ? 'Fill in the remaining blanks. Stuck? Use "Show the starter".'
              : editorPlaceholder(exercise)} ariaLabel="SQL editor" minHeight="180px" schema={dbSchema} />
          <div className="console-actions">
            <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
              {check.checking ? 'Checking…' : `Run and check  ${isMac ? '⌘↵' : 'Ctrl+↵'}`}
            </Button>
            {tier !== 'full' ? <Button onClick={() => check.setSql(fullStarter)}>Show the starter</Button> : null}
          </div>
        </div>
        <div role="status" aria-live="polite">
          {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
          {check.feedback?.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
        </div>
        <OutputDock exercise={exercise} result={check.result} />
      </section>
    </div>
  );
}
