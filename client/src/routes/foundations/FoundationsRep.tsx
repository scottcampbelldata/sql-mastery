import { useState, useEffect, useRef } from 'react';
import { useFoundations } from '../../state/FoundationsContext';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { recordConceptProgress, recordAttempt, recordReviewPass, isSkillStrong } from '../../lib/foundations';
import type { ScaffoldTier } from '../../lib/foundations';
import { pickStarter, starterSqlForExercise } from '../../lib/sqlScaffold';
import { formatSql } from '../../lib/sqlFormat';
import { logEvent } from '../../lib/learningLog';
import { useDbSchema } from '../../lib/dbSchema';
import { SqlEditor } from '../../components/SqlEditor';
import { OutputDock } from './OutputDock';
import { Button, Callout } from '../../components/ui';
import { DiffPanel } from '../../components/DiffPanel';
import type { Exercise, Teach, LearningState, CheckResponse } from '../../types';

const isMac = navigator.platform.toUpperCase().includes('MAC');

export function editorPlaceholder(exercise: Exercise, tier: ScaffoldTier = 'full'): string {
  return starterSqlForExercise(exercise, tier)
    ? 'Replace ____ in the starter SQL, then run it.'
    : 'Type your SQL here...';
}

// "New | Select every column" / "Practice: Select every column" -> "Select every column"
function conceptTitleFrom(label: string): string {
  return label.replace(/^(New|Review)\s*\|\s*/, '').replace(/^Practice:\s*/, '').trim();
}
function kindLabelFrom(label: string): string {
  if (/^Review/.test(label)) return 'Spaced review';
  if (/^Practice/.test(label)) return 'Practice';
  return 'New lesson';
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

export function FoundationsRep({ exercise, label, kind, teach, stepText, onCorrect, tier = 'full' }: Props) {
  const { track, state, update } = useFoundations();
  const [hintOpen, setHintOpen] = useState(false);
  // Two-beat flow: read the concept first ("learn"), then work the exercise ("try").
  // Reps with no teach block (steps 2+) open straight into "try".
  const hasTeach = Boolean(teach);
  const [phase, setPhase] = useState<'learn' | 'try'>(hasTeach ? 'learn' : 'try');
  const dbSchema = useDbSchema(exercise.database);
  const fullStarter = pickStarter(exercise, 'full');
  const seed = pickStarter(exercise, tier);
  const startedAt = useRef<number>(Date.now());
  const attempts = useRef<number>(0);

  useEffect(() => {
    startedAt.current = Date.now();
    attempts.current = 0;
    setHintOpen(false);
    logEvent({ type: 'start', exerciseId: exercise.id, skill: exercise.skill, tier });
  }, [exercise.id, tier]);

  const check = useSqlCheck(exercise, {
    onAttempt: () => {
      attempts.current += 1;
      update((s: LearningState) => recordAttempt(s, exercise.id));
    },
    onResult: (correct: boolean, body: CheckResponse) => {
      logEvent({
        type: 'attempt',
        exerciseId: exercise.id,
        skill: exercise.skill,
        outcome: correct ? 'correct' : (body.feedbackType === 'error' ? 'error' : 'incorrect'),
        misconception: body.coaching ? body.coaching.label : undefined
      });
      if (!correct) return;
      update((s: LearningState) => { if (track) recordConceptProgress(track, s, exercise); });
      if (kind === 'review' && exercise.skill && isSkillStrong(state, exercise.skill)) {
        update((s: LearningState) => recordReviewPass(s, exercise.skill as string));
      }
      logEvent({
        type: 'complete',
        exerciseId: exercise.id,
        skill: exercise.skill,
        durationMs: Date.now() - startedAt.current,
        attempts: attempts.current
      });
      onCorrect?.();
    },
    seed
  });

  const wrong = check.outcome === 'incorrect' || check.outcome === 'error';
  const resetToStarter = () => {
    check.setSql(seed);
    logEvent({ type: 'reset', exerciseId: exercise.id, skill: exercise.skill });
  };

  const title = conceptTitleFrom(label);
  const kindLabel = kindLabelFrom(label);
  const hasMore = Boolean(teach && (teach.watchOut || teach.whyWhen || teach.interviewNote));

  // ---- LEARN: one calm concept card, then a single "Try it" ----
  if (phase === 'learn' && teach) {
    return (
      <div className="lesson2">
        <div className="l2-flow" aria-hidden="true">
          <span className="l2-beat active"><i>1</i> Learn</span>
          <span className="l2-rule" />
          <span className="l2-beat"><i>2</i> Try</span>
        </div>
        <section className="learn-view">
          <div className="l2-tag">{kindLabel}{stepText ? ` - ${stepText}` : ''}</div>
          <h1 className="l2-title">{title}</h1>
          {teach.interviewPattern ? <span className="l2-pattern">Pattern: {teach.interviewPattern}</span> : null}
          <p className="l2-lede">{teach.plain}</p>
          <p className="l2-model">{teach.mentalModel}</p>
          <div className="l2-example">
            <pre className="sql-block">{formatSql(teach.example.sql)}</pre>
            {teach.example.note ? <p className="l2-note">{teach.example.note}</p> : null}
          </div>
          {hasMore ? (
            <details className="l2-more">
              <summary>Good to know</summary>
              {teach.watchOut ? <p><b>Watch out:</b> {teach.watchOut}</p> : null}
              {teach.whyWhen ? <p>{teach.whyWhen}</p> : null}
              {teach.interviewNote ? <p><b>In interviews:</b> {teach.interviewNote}</p> : null}
            </details>
          ) : null}
          <div className="l2-cta">
            <Button variant="primary" onClick={() => setPhase('try')}>Try it</Button>
          </div>
        </section>
      </div>
    );
  }

  // ---- TRY: the exercise is the focus ----
  return (
    <div className="lesson2">
      {hasTeach ? (
        <div className="l2-flow" aria-hidden="true">
          <span className="l2-beat done"><i>1</i> Learn</span>
          <span className="l2-rule" />
          <span className="l2-beat active"><i>2</i> Try</span>
        </div>
      ) : null}
      <section className="try-view">
        {hasTeach ? (
          <button className="l2-back" onClick={() => setPhase('learn')}>Back to the lesson</button>
        ) : (
          <div className="l2-tag">{kindLabel}{stepText ? ` - ${stepText}` : ''}</div>
        )}
        <h2 className="l2-task-h">Your turn</h2>
        <p className="l2-task">{exercise.task}</p>

        <div className="console-editor">
          <span className="wb-editor-label" aria-hidden="true">Your SQL</span>
          <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
            placeholder={tier === 'blank' && !seed ? 'Write the query from memory. Stuck? Use "Show the starter".'
              : tier === 'blank' ? 'Fill in the broad starter blanks. Stuck? Use "Show the starter".'
              : tier === 'half' ? 'Fill in the remaining blanks. Stuck? Use "Show the starter".'
              : editorPlaceholder(exercise, tier)}
            ariaLabel="SQL editor" minHeight="180px" schema={dbSchema} />
          <div className="console-actions">
            <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
              {check.checking ? 'Checking...' : `Run and check  ${isMac ? 'Cmd+Enter' : 'Ctrl+Enter'}`}
            </Button>
            {wrong ? <Button onClick={resetToStarter}>Reset to the starter</Button> : null}
            {tier !== 'full' && fullStarter ? <Button onClick={() => check.setSql(fullStarter)}>Show the starter</Button> : null}
            {exercise.hint ? (
              <Button onClick={() => { setHintOpen(true); logEvent({ type: 'hint', exerciseId: exercise.id, skill: exercise.skill }); }} disabled={hintOpen}>Hint</Button>
            ) : null}
          </div>
        </div>

        {hintOpen && exercise.hint ? <Callout tone="tip" title="Hint">{exercise.hint}</Callout> : null}

        {check.feedback ? (
          <div className="lesson-feedback" role="status" aria-live="polite">
            <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout>
            {check.feedback.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
          </div>
        ) : null}

        <OutputDock exercise={exercise} result={check.result} />
      </section>
    </div>
  );
}
