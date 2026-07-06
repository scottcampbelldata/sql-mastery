import { useEffect, useState } from 'react';
import { api } from './api.js';
import { hasSqlBlank, starterSqlForExercise } from './sqlScaffold.js';

const TONE = { ok: 'tip', err: 'warn', warn: 'caution', info: 'info' };

// Runs one graded SQL check against an exercise's expectedSql. onResult(correct, body)
// lets the caller record mastery / advance. Feedback tone maps to Callout tones.
export function useSqlCheck(exercise, { onResult, onAttempt } = {}) {
  const [sql, setSql] = useState(() => starterSqlForExercise(exercise));
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setSql(starterSqlForExercise(exercise));
    setFeedback(null);
    setResult(null);
    setChecking(false);
  }, [exercise.id, exercise.starterSql, exercise.expectedSql]);

  async function runCheck() {
    if (checking) return;
    const trimmed = sql.trim();
    if (!trimmed) {
      setFeedback({ toneClass: TONE.warn, title: 'Write your query first', message: 'Use the scaffold or type your full SQL, then run it.' });
      return;
    }
    if (hasSqlBlank(trimmed)) {
      onAttempt?.();
      setFeedback({ toneClass: TONE.warn, title: 'Fill the blanks', message: 'Replace every ____ marker with the missing SQL, or clear the editor and type the whole query.' });
      return;
    }
    setChecking(true);
    onAttempt?.();
    setFeedback({ toneClass: TONE.info, title: 'Checking…', message: 'Running your SQL against the expected answer.' });
    try {
      const body = await api.check(exercise.database, trimmed, exercise.expectedSql);
      setResult(body.result || null);
      if (body.correct) {
        setFeedback({ toneClass: TONE.ok, title: body.message || 'Correct!', message: body.why || '' });
      } else {
        setFeedback({
          toneClass: body.feedbackType === 'error' ? TONE.err : TONE.warn,
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Not quite yet',
          message: body.feedbackType === 'error' ? [body.message, body.hint].filter(Boolean).join(': ') : (body.hint || body.message)
        });
      }
      onResult?.(Boolean(body.correct), body);
    } catch (error) {
      setResult(null);
      setFeedback({ toneClass: TONE.err, title: 'The checker could not run', message: `${error.message}${error.hint ? `: ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return { sql, setSql, feedback, result, checking, runCheck };
}
