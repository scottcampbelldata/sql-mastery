import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { AppShell } from '../../components/AppShell';
import { Button, Callout, EmptyState } from '../../components/ui';
import { SqlEditor } from '../../components/SqlEditor';
import { OutputDock } from './OutputDock';
import { DiffPanel } from '../../components/DiffPanel';
import { useFoundations } from '../../state/FoundationsContext';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { useDbSchema } from '../../lib/dbSchema';
import { logEvent } from '../../lib/learningLog';
import { gauntletById, drawGauntletQuestions, gauntletRecord, gauntletPassed, recordGauntletRun } from '../../lib/gauntlet';
import type { Exercise, LearningState } from '../../types';
import './gauntlet.css';

const isMac = navigator.platform.toUpperCase().includes('MAC');

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface QuestionResult {
  exercise: Exercise;
  correct: boolean;
  seconds: number;
}

// One timed question. Deliberately bare: no hints, no starter, no coach, no resets - just
// the task, the schema peek, and the checker. That is the interview.
function GauntletQuestion({ exercise, onDone }: { exercise: Exercise; onDone: (correct: boolean) => void }) {
  const dbSchema = useDbSchema(exercise.database);
  const [confirmed, setConfirmed] = useState(false);
  const check = useSqlCheck(exercise, { seed: '' });
  const solved = check.outcome === 'correct';

  return (
    <div className="gt-question">
      <p className="gt-task">{exercise.task}</p>
      <div className="console-editor">
        <span className="wb-editor-label" aria-hidden="true">Your SQL</span>
        <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
          placeholder="Write the full query from memory." ariaLabel="SQL editor" minHeight="180px"
          schema={dbSchema} autocomplete={false} />
        <div className="console-actions">
          <Button variant="primary" onClick={check.runCheck} disabled={check.checking || solved}>
            {check.checking ? 'Checking...' : `Run and check  ${isMac ? 'Cmd+Enter' : 'Ctrl+Enter'}`}
          </Button>
          {solved ? (
            <Button variant="primary" onClick={() => { if (!confirmed) { setConfirmed(true); onDone(true); } }}>Next</Button>
          ) : (
            <Button onClick={() => { if (!confirmed) { setConfirmed(true); onDone(false); } }}>Skip this one</Button>
          )}
        </div>
      </div>
      {check.feedback ? (
        <div className="lesson-feedback" role="status" aria-live="polite">
          <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout>
          {check.feedback.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
        </div>
      ) : null}
      <OutputDock exercise={exercise} result={check.result} />
    </div>
  );
}

export default function Gauntlet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { track, state, update } = useFoundations();
  const config = gauntletById(id);

  const [runSeed, setRunSeed] = useState<number | null>(null);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [finished, setFinished] = useState<QuestionResult[] | null>(null);
  const [remaining, setRemaining] = useState(0);
  const deadlineRef = useRef(0);
  const questionStartRef = useRef(0);

  const record = config ? gauntletRecord(state, config.id) : null;

  const questions = useMemo(() => {
    if (!track || !config || runSeed === null) return [];
    return drawGauntletQuestions(track, config, runSeed);
  }, [track, config, runSeed]);

  // Countdown. When it hits zero the run ends; unanswered questions count as wrong.
  useEffect(() => {
    if (runSeed === null || finished) return;
    const tick = () => {
      const left = (deadlineRef.current - Date.now()) / 1000;
      setRemaining(left);
      if (left <= 0) finish(resultsRef.current, true);
    };
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [runSeed, finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // The interval callback needs the latest results without re-arming every answer.
  const resultsRef = useRef<QuestionResult[]>([]);
  useEffect(() => { resultsRef.current = results; }, [results]);

  if (!track || !config) {
    return (
      <AppShell breadcrumb={<span className="here">Gauntlet</span>}>
        {config ? <EmptyState title="Loading..." /> : <EmptyState title="Gauntlet not found" />}
      </AppShell>
    );
  }

  function start() {
    const rec = gauntletRecord(state, config!.id);
    setResults([]);
    setFinished(null);
    setIndex(0);
    setRunSeed(rec.attempts * 7919 + state.sessionCounter + 1);
    deadlineRef.current = Date.now() + config!.minutes * 60 * 1000;
    questionStartRef.current = Date.now();
    setRemaining(config!.minutes * 60);
  }

  function finish(answered: QuestionResult[], expired = false) {
    if (finished) return;
    const all = [...answered];
    if (expired) {
      for (let i = all.length; i < questions.length; i += 1) {
        all.push({ exercise: questions[i], correct: false, seconds: 0 });
      }
    }
    const score = all.filter((r) => r.correct).length;
    const seconds = Math.round((config!.minutes * 60 * 1000 - Math.max(0, deadlineRef.current - Date.now())) / 1000);
    update((s: LearningState) => recordGauntletRun(s, config!.id, { score, total: questions.length, seconds, at: Date.now() }));
    logEvent({ type: 'gauntlet', exerciseId: config!.id, skill: config!.id, score, total: questions.length, durationMs: seconds * 1000 });
    setFinished(all);
  }

  function answer(correct: boolean) {
    const seconds = Math.round((Date.now() - questionStartRef.current) / 1000);
    const next = [...results, { exercise: questions[index], correct, seconds }];
    setResults(next);
    if (index + 1 >= questions.length) {
      finish(next);
    } else {
      questionStartRef.current = Date.now();
      setIndex((i) => i + 1);
    }
  }

  const crumb = <span className="here">{config.title}</span>;

  // ---- Results ----
  if (finished) {
    const score = finished.filter((r) => r.correct).length;
    const passed = score >= config.pass;
    const missed = finished.filter((r) => !r.correct);
    const conceptFor = (skill: string) => track!.concepts.find((c) => c.skill === skill);
    return (
      <AppShell breadcrumb={crumb}>
        <div className="gauntlet">
          <div className={`gt-verdict ${passed ? 'pass' : 'fail'}`}>
            <span className="gt-verdict-word">{passed ? 'Ready.' : 'Not yet.'}</span>
            <span className="gt-verdict-score">{score} / {finished.length} in {fmtClock((state.gauntlets?.[config.id]?.history.slice(-1)[0]?.seconds) || 0)}</span>
            <p className="gt-verdict-note">
              {passed
                ? `You cleared the ${config.title} under interview conditions: timed, unaided, from memory.`
                : `You need ${config.pass} of ${finished.length}. The topics you missed are listed below - practice them, then retake it.`}
            </p>
          </div>
          <ul className="gt-results">
            {finished.map((r, i) => {
              const concept = conceptFor(r.exercise.skill as string);
              return (
                <li key={i} className={r.correct ? 'ok' : 'miss'}>
                  <span className="gt-res-mark" aria-hidden="true">{r.correct ? 'PASS' : 'MISS'}</span>
                  <span className="gt-res-title">{concept ? concept.title : r.exercise.skill}</span>
                  <span className="gt-res-time">{r.seconds ? fmtClock(r.seconds) : '-'}</span>
                </li>
              );
            })}
          </ul>
          {missed.length ? (
            <div className="gt-next-steps">
              <h2>Practice the misses</h2>
              <div className="gt-miss-links">
                {missed.map((r, i) => {
                  const concept = conceptFor(r.exercise.skill as string);
                  return concept ? (
                    <Link key={i} className="gt-miss-link" to={`/learn/concept/${concept.id}`}>{concept.title}</Link>
                  ) : null;
                })}
              </div>
            </div>
          ) : null}
          <div className="gt-actions">
            <Button variant="primary" onClick={start}>Retake with new questions</Button>
            <Button onClick={() => navigate('/readiness')}>Back to readiness</Button>
          </div>
        </div>
      </AppShell>
    );
  }

  // ---- Running ----
  if (runSeed !== null && questions.length) {
    const q = questions[index];
    const low = remaining <= 120;
    return (
      <AppShell breadcrumb={crumb}>
        <div className="gauntlet">
          <div className="gt-bar">
            <span className="gt-progress">Question {index + 1} of {questions.length}</span>
            <span className={`gt-clock ${low ? 'low' : ''}`} aria-live={low ? 'polite' : 'off'}>{fmtClock(remaining)}</span>
          </div>
          <GauntletQuestion key={q.id} exercise={q} onDone={answer} />
        </div>
      </AppShell>
    );
  }

  // ---- Intro ----
  const best = record && record.attempts ? `${record.bestScore} / ${config.questions}` : null;
  return (
    <AppShell breadcrumb={crumb}>
      <div className="gauntlet">
        <div className="gt-intro">
          <span className="gt-kicker">Timed assessment</span>
          <h1>{config.title}</h1>
          <p className="gt-blurb">{config.blurb}</p>
          <ul className="gt-rules">
            <li>{config.questions} questions, one attempt at the paper, {config.minutes} minutes total.</li>
            <li>No hints, no starters, no coach. You may peek at the tables - interviews allow that too.</li>
            <li>Write each query from memory and check it. Pass mark: {config.pass} of {config.questions}.</li>
            <li>Every retake draws a fresh set of questions.</li>
          </ul>
          {best ? (
            <p className="gt-best">
              Best so far: <b>{best}</b> across {record!.attempts} attempt{record!.attempts === 1 ? '' : 's'}
              {gauntletPassed(record!, config) ? ' - passed.' : '.'}
            </p>
          ) : (
            <p className="gt-best">First attempt. Take it when the band feels solid; a miss just shows you where to practice.</p>
          )}
          <div className="gt-actions">
            <Button variant="primary" onClick={start}>Start the clock</Button>
            <Button onClick={() => navigate('/readiness')}>Not yet</Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
