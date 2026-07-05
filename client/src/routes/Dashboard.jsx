import { Link, useNavigate } from 'react-router-dom';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { AppShell } from '../components/AppShell.jsx';
import { Button, Pill, ProgressMeter, EmptyState } from '../components/ui.jsx';
import { percent, completedCount, sessionComplete, currentSession } from '../lib/curriculum.js';
import { safeGet, safeSet } from '../lib/progress.js';
import { useState } from 'react';
import './dashboard.css';

const WELCOME_KEY = 'sqlm:welcome-dismissed:v1';

export default function Dashboard() {
  const { curriculum, progress, activeSessionId } = useCurriculum();
  const navigate = useNavigate();
  const [queueOpen, setQueueOpen] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => safeGet(WELCOME_KEY) === '1');

  function dismissWelcome() {
    safeSet(WELCOME_KEY, '1');
    setWelcomeDismissed(true);
  }

  const done = Object.keys(progress.completed).length;
  const total = curriculum.exercises.length;
  const current = currentSession(curriculum.sessions, progress.completed, activeSessionId);

  if (!current) {
    return (
      <AppShell breadcrumb={<span className="here">Dashboard</span>}>
        <EmptyState title="No sessions found" />
      </AppShell>
    );
  }

  const started = done > 0;
  const queue = curriculum.sessions.filter((s) => !sessionComplete(s, progress.completed));
  const shownQueue = queueOpen ? queue : queue.slice(0, 8);

  return (
    <AppShell breadcrumb={<span className="here">Dashboard</span>}>
      {!welcomeDismissed && done < 5 ? (
        <section className="welcome-card card" aria-label="How this app works">
          <div className="welcome-head">
            <h2>New here? Three things to know</h2>
            <Button variant="ghost" onClick={dismissWelcome}>Got it, hide this</Button>
          </div>
          <div className="welcome-grid">
            <div>
              <span className="welcome-num">1</span>
              <strong>Practice sessions</strong>
              <p>Press the big button below. Each session gives you a small task, teaches the idea, and checks your answer instantly. No setup, no grading anxiety — try, miss, retry.</p>
            </div>
            <div>
              <span className="welcome-num">2</span>
              <strong>Lessons</strong>
              <p>Prefer reading first? The Lessons list in the menu holds the full textbook — every concept explained with examples you can copy.</p>
            </div>
            <div>
              <span className="welcome-num">3</span>
              <strong>Databases</strong>
              <p>All practice runs on real sample databases (music shop, trading company, taxi trips). Open Databases in the menu anytime to poke around freely.</p>
            </div>
          </div>
        </section>
      ) : null}
      <section className="continue-card card">
        <div className="continue-copy">
          <span className="kicker">{started ? 'Continue' : 'Start here'}</span>
          <h1>{current.title}</h1>
          <p>Week {current.week}, session {current.day} · {current.durationMinutes} min · {completedCount(current.exerciseIds, progress.completed)}/{current.exerciseIds.length} solved</p>
          <p className="goal">{current.goal}</p>
          <Button variant="primary" onClick={() => navigate(`/session/${current.id}`)}>
            {started ? 'Continue session' : 'Start week 1'}
          </Button>
        </div>
        <div className="continue-stats">
          <ProgressMeter value={percent(done, total)} label="Course progress" />
          <div className="stat-row">
            <div><strong>{done}</strong><span>exercises done</span></div>
            <div><strong>{curriculum.stats.totalSessions}</strong><span>sessions</span></div>
            <div><strong>{curriculum.stats.totalWeeks}</strong><span>weeks</span></div>
          </div>
        </div>
      </section>

      <section id="weeks" className="dash-section">
        <h2>Course map</h2>
        <div className="week-grid">
          {curriculum.weeks.map((week) => {
            const sessions = week.sessions.map((id) => curriculum.sessions.find((s) => s.id === id));
            const ids = sessions.flatMap((s) => s.exerciseIds);
            const pct = percent(completedCount(ids, progress.completed), ids.length);
            const isCurrent = current.week === week.number;
            return (
              <Link key={week.number} to={`/session/${week.sessions[0]}`}
                className={`week-card ${pct === 100 ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
                <span className="week-num">W{week.number}</span>
                <strong>{week.title}</strong>
                <div className="meter-track"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="dash-section">
        <h2>Up next</h2>
        <div className="queue">
          {shownQueue.map((s) => (
            <Link key={s.id} to={`/session/${s.id}`} className="queue-row">
              <Pill>W{s.week}.{s.day}</Pill>
              <div className="queue-copy"><strong>{s.title}</strong><span>{s.goal}</span></div>
              <Pill tone={completedCount(s.exerciseIds, progress.completed) ? 'brand' : 'neutral'}>
                {completedCount(s.exerciseIds, progress.completed)}/{s.exerciseIds.length}
              </Pill>
            </Link>
          ))}
        </div>
        {queue.length > 8 ? (
          <Button variant="ghost" onClick={() => setQueueOpen(!queueOpen)}>
            {queueOpen ? 'Show fewer' : `Show all ${queue.length} remaining sessions`}
          </Button>
        ) : null}
      </section>
    </AppShell>
  );
}
