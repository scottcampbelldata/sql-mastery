import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SqlEditor } from './SqlEditor';
import { OutputDock } from '../routes/session/OutputDock';
import { Button, Callout } from './ui';
import { DiffPanel } from './DiffPanel';
import { useSqlCheck } from '../lib/useSqlCheck';
import { useDbSchema } from '../lib/dbSchema';
import type { Exercise } from '../types';

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC');

interface Props {
  exercise: Exercise;
  onClose: () => void;
  onSolved?: (id: string) => void;
}

// A pop-out editor for one drill: write SQL, run it against the live database, and
// auto-grade against the drill's expected answer. Reuses the same editor + checker
// as the guided session, so grading is identical.
export function DrillModal({ exercise, onClose, onSolved }: Props) {
  const schema = useDbSchema(exercise.database);
  const check = useSqlCheck(exercise, {
    onResult: (correct: boolean) => { if (correct) onSolved?.(exercise.id); }
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  return createPortal(
    <div className="drill-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="drill-modal" role="dialog" aria-modal="true" aria-label="Practice this drill">
        <div className="drill-modal-head">
          {exercise.id ? <span className="drill-modal-pid">{String(exercise.id).toUpperCase()}</span> : null}
          <span className="drill-modal-db">{exercise.database}</span>
          <button type="button" className="drill-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {exercise.task ? <p className="drill-modal-task">{exercise.task}</p> : null}

        {exercise.expectedSql ? (
          <>
            <div className="drill-modal-editor">
              <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
                schema={schema} minHeight="150px" ariaLabel="Drill SQL editor"
                placeholder="Write your SQL here, then Run & check." />
            </div>
            <div className="drill-modal-actions">
              <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
                {check.checking ? 'Checking…' : `Run & check  ${isMac ? '⌘↵' : 'Ctrl+↵'}`}
              </Button>
              {exercise.hint ? (
                <details className="drill-modal-hint"><summary>Hint</summary><p>{exercise.hint}</p></details>
              ) : null}
            </div>
            <div role="status" aria-live="polite">
              {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
              {check.feedback?.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
            </div>
            <OutputDock exercise={exercise} result={check.result} />
          </>
        ) : (
          <Callout tone="info" title="No auto-grader for this one">
            This drill has no stored answer to check against. Use the Databases page to run SQL freely.
          </Callout>
        )}
      </div>
    </div>,
    document.body
  );
}
