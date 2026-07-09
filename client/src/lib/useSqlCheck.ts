import { useEffect, useState } from 'react';
import { api } from './api';
import { hasSqlBlank, starterSqlForExercise } from './sqlScaffold';
import type { Exercise, Feedback, QueryResult, CheckResponse, ApiError, SqlDiff } from '../types';

const TONE = { ok: 'tip', err: 'warn', warn: 'caution', info: 'info' };

interface UseSqlCheckOptions {
  onResult?: (correct: boolean, body: CheckResponse) => void;
  onAttempt?: () => void;
  // Initial editor content. When omitted, the exercise's full scaffold is used; callers
  // pass a faded scaffold or '' (blank) to seed the editor differently for reviews.
  seed?: string;
}

interface UseSqlCheckReturn {
  sql: string;
  setSql: React.Dispatch<React.SetStateAction<string>>;
  feedback: Feedback | null;
  result: QueryResult | null;
  checking: boolean;
  runCheck: () => Promise<void>;
}

// Runs one graded SQL check against the server-owned exercise answer. onResult(correct, body)
// lets the caller record mastery / advance. Feedback tone maps to Callout tones.
export function useSqlCheck(exercise: Exercise, { onResult, onAttempt, seed }: UseSqlCheckOptions = {}): UseSqlCheckReturn {
  const [sql, setSql] = useState<string>(() => (seed !== undefined ? seed : starterSqlForExercise(exercise)));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [checking, setChecking] = useState<boolean>(false);

  useEffect(() => {
    setSql(seed !== undefined ? seed : starterSqlForExercise(exercise));
    setFeedback(null);
    setResult(null);
    setChecking(false);
  }, [exercise.id, exercise.starterSql, exercise.expectedSql, seed]);

  async function runCheck(): Promise<void> {
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
    setFeedback({ toneClass: TONE.info, title: 'Checking...', message: 'Running your SQL against the expected answer.' });
    try {
      const body = await api.check(exercise.id, trimmed);
      setResult(body.result || null);
      if (body.correct) {
        setFeedback({ toneClass: TONE.ok, title: body.message || 'Correct!', message: body.why || '' });
      } else {
        setFeedback({
          toneClass: body.feedbackType === 'error' ? TONE.err : TONE.warn,
          title: body.feedbackType === 'error' ? 'Your SQL did not run' : 'Not quite yet',
          message: body.feedbackType === 'error' ? [body.message, body.hint].filter(Boolean).join(': ') : (body.hint || body.message || ''),
          diff: body.diff || null
        });
      }
      onResult?.(Boolean(body.correct), body);
    } catch (error) {
      setResult(null);
      const err = error as ApiError;
      setFeedback({ toneClass: TONE.err, title: 'The checker could not run', message: `${err.message}${err.hint ? `: ${err.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return { sql, setSql, feedback, result, checking, runCheck };
}
