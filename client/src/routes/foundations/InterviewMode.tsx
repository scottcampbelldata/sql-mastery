import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useSqlCheck } from '../../lib/useSqlCheck';
import { useDbSchema } from '../../lib/dbSchema';
import { logEvent } from '../../lib/learningLog';
import { formatSql } from '../../lib/sqlFormat';
import { SqlEditor } from '../../components/SqlEditor';
import { OutputDock } from './OutputDock';
import { Button, Callout } from '../../components/ui';
import { DiffPanel } from '../../components/DiffPanel';
import type { Exercise, PublicInterviewProblem, InterviewSolution } from '../../types';
import './interview.css';

const isMac = navigator.platform.toUpperCase().includes('MAC');
const LEVELS = ['all', 'beginner', 'intermediate', 'advanced'];

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function pickRandom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

export function InterviewMode() {
  const [problems, setProblems] = useState<PublicInterviewProblem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [level, setLevel] = useState('all');
  const [pattern, setPattern] = useState('all');
  const [current, setCurrent] = useState<PublicInterviewProblem | null>(null);
  const [solved, setSolved] = useState(false);
  const [solution, setSolution] = useState<InterviewSolution | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    api.interview().then((r) => setProblems(r.problems)).catch((e) => setLoadError(e.message || 'Could not load problems.'));
  }, []);

  const patterns = useMemo(() => {
    const set = new Set<string>();
    (problems || []).forEach((p) => { if (p.pattern) set.add(p.pattern); });
    return ['all', ...Array.from(set).sort()];
  }, [problems]);

  const pool = useMemo(() => (problems || []).filter((p) =>
    (level === 'all' || p.level === level) && (pattern === 'all' || p.pattern === pattern)
  ), [problems, level, pattern]);

  useEffect(() => {
    if (!current || solved || solution) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startRef.current), 1000);
    return () => window.clearInterval(id);
  }, [current, solved, solution]);

  function startProblem() {
    const chosen = pickRandom(pool);
    if (!chosen) return;
    setCurrent(chosen);
    setSolved(false);
    setSolution(null);
    startRef.current = Date.now();
    setElapsed(0);
    logEvent({ type: 'start', exerciseId: chosen.id, skill: chosen.id, tier: 'interview' });
  }

  if (loadError) return <div className="table-note">Could not load interview problems: {loadError}</div>;
  if (!problems) return <div className="table-note">Loading interview problems...</div>;
  if (!problems.length) return <div className="table-note">No interview problems available yet. Check back soon.</div>;

  if (!current) {
    return (
      <div className="iv">
        <header className="iv-head">
          <h1>Interview mode</h1>
          <p className="iv-sub">Business-framed problems, no scaffold, a running clock. Solve it, then compare against the model answer.</p>
        </header>
        <div className="iv-filters">
          <label className="iv-field">Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label className="iv-field">Pattern
            <select value={pattern} onChange={(e) => setPattern(e.target.value)}>
              {patterns.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <Button variant="primary" onClick={startProblem} disabled={!pool.length}>
            Start ({pool.length} problem{pool.length === 1 ? '' : 's'})
          </Button>
        </div>
      </div>
    );
  }

  return (
    <InterviewProblemView
      key={current.id}
      problem={current}
      elapsed={elapsed}
      solved={solved}
      solution={solution}
      startedAt={startRef.current}
      onSolved={() => setSolved(true)}
      onReveal={setSolution}
      onNext={startProblem}
      onExit={() => setCurrent(null)}
    />
  );
}

interface ViewProps {
  problem: PublicInterviewProblem;
  elapsed: number;
  solved: boolean;
  solution: InterviewSolution | null;
  startedAt: number;
  onSolved: () => void;
  onReveal: (s: InterviewSolution) => void;
  onNext: () => void;
  onExit: () => void;
}

function InterviewProblemView({ problem, elapsed, solved, solution, startedAt, onSolved, onReveal, onNext, onExit }: ViewProps) {
  const dbSchema = useDbSchema(problem.database);
  const asExercise = useMemo(
    () => ({ id: problem.id, database: problem.database, task: problem.task, skill: problem.id, starterSql: '', expectedSql: '' } as unknown as Exercise),
    [problem.id, problem.database, problem.task]
  );
  const check = useSqlCheck(asExercise, {
    seed: '',
    onResult: (correct: boolean) => {
      if (correct && !solved) {
        onSolved();
        logEvent({ type: 'complete', exerciseId: problem.id, skill: problem.id, durationMs: Date.now() - startedAt });
        api.interviewSolution(problem.id).then(onReveal).catch(() => undefined);
      }
    }
  });

  const revealAnswer = () => {
    logEvent({ type: 'hint', exerciseId: problem.id, skill: problem.id });
    api.interviewSolution(problem.id).then(onReveal).catch(() => undefined);
  };

  return (
    <div className="iv-problem">
      <div className="iv-bar">
        <Button onClick={onExit}>Back</Button>
        <span className={`iv-level iv-${problem.level}`}>{problem.level}</span>
        {problem.pattern ? <span className="iv-pattern">{problem.pattern}</span> : null}
        <span className="iv-timer">{fmtElapsed(elapsed)}</span>
      </div>
      <section className="iv-prompt">
        <p className="iv-scenario">{problem.scenario}</p>
        <p className="iv-task">{problem.task}</p>
      </section>
      <div className="console-editor">
        <span className="wb-editor-label" aria-hidden="true">Your SQL</span>
        <SqlEditor value={check.sql} onChange={check.setSql} onSubmit={check.runCheck}
          placeholder="Write your query from scratch, then run it." ariaLabel="SQL editor" minHeight="200px" schema={dbSchema} />
        <div className="console-actions">
          <Button variant="primary" onClick={check.runCheck} disabled={check.checking}>
            {check.checking ? 'Checking...' : `Run and check  ${isMac ? 'Cmd+Enter' : 'Ctrl+Enter'}`}
          </Button>
          {!solution ? <Button onClick={revealAnswer}>Reveal answer</Button> : null}
          {(solved || solution) ? <Button onClick={onNext}>Next problem</Button> : null}
        </div>
      </div>
      <div role="status" aria-live="polite">
        {solved ? <Callout tone="tip" title="Solved">Solved in {fmtElapsed(elapsed)}. Compare your query with the model answer below.</Callout> : null}
        {check.feedback ? <Callout tone={check.feedback.toneClass} title={check.feedback.title}>{check.feedback.message}</Callout> : null}
        {check.feedback?.diff ? <DiffPanel diff={check.feedback.diff} /> : null}
      </div>
      {solution ? (
        <section className="iv-solution">
          <span className="teach-example-label">Model answer</span>
          <pre className="sql-block">{formatSql(solution.modelAnswer)}</pre>
          <p className="iv-approach"><b>Approach:</b> {solution.approachNote}</p>
        </section>
      ) : null}
      <OutputDock exercise={asExercise} result={check.result} />
    </div>
  );
}
