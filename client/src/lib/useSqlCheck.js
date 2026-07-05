import { useState } from 'react';
import { api } from './api.js';

const TONE = { ok: 'tip', err: 'warn', warn: 'caution', info: 'info' };

// Runs one graded SQL check against an exercise's expectedSql. onResult(correct, body)
// lets the caller record mastery / advance. Feedback tone maps to Callout tones.
export function useSqlCheck(exercise, { onResult, onAttempt } = {}) {
  const [sql, setSql] = useState(exercise.starterSql || '');
  const [feedback, setFeedback] = useState(null);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);

  async function runCheck() {
    if (checking) return;
    const trimmed = sql.trim();
    if (!trimmed || trimmed === (exercise.starterSql || '').trim()) {
      setFeedback({ toneClass: TONE.warn, title: 'Write your query first', message: 'Replace the blank (____) or type your SQL, then run it.' });
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
          message: body.feedbackType === 'error' ? [body.message, body.hint].filter(Boolean).join(' — ') : (body.hint || body.message)
        });
      }
      onResult?.(Boolean(body.correct), body);
    } catch (error) {
      setResult(null);
      setFeedback({ toneClass: TONE.err, title: 'The checker could not run', message: `${error.message}${error.hint ? ` — ${error.hint}` : ''}` });
    } finally {
      setChecking(false);
    }
  }

  return { sql, setSql, feedback, result, checking, runCheck };
}
