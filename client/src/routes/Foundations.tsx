import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { EmptyState, Button } from '../components/ui';
import { useFoundations } from '../state/FoundationsContext';
import { buildTodaySession, graduationStatus, weakSpots, resetConcept } from '../lib/foundations';
import { bandGroups } from '../lib/bands';
import type { LearningState } from '../types';
import { BandSection } from './foundations/BandSection';
import './foundations/foundations.css';
import './foundations/bands.css';

interface RingProps {
  value: number;
}

function Ring({ value }: RingProps) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <svg className="lh-ring-svg" width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="11" />
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--brand)" strokeWidth="11"
        strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
    </svg>
  );
}

export default function Foundations() {
  const { track, phases, state, update } = useFoundations();
  const navigate = useNavigate();
  const [undo, setUndo] = useState<{ skill: string; title: string; slice: { correct?: string[]; reviews?: number; last?: number } } | null>(null);
  if (!track) return <AppShell breadcrumb={<span className="here">Learn</span>}><EmptyState title="Loading your path..." /></AppShell>;
  if (!phases.length) return <AppShell breadcrumb={<span className="here">Your path</span>}><EmptyState title="Learning path unavailable" /></AppShell>;

  function handleReset(skill: string) {
    const concept = track!.concepts.find((c) => c.skill === skill);
    setUndo({
      skill,
      title: concept ? concept.title : skill,
      slice: { correct: state.skillCorrect[skill], reviews: state.reviewsPassed[skill], last: state.lastPracticedSession[skill] }
    });
    update((s: LearningState) => resetConcept(s, skill));
  }

  function undoReset() {
    if (!undo) return;
    const { skill, slice } = undo;
    update((s: LearningState) => {
      if (slice.correct !== undefined) s.skillCorrect = { ...s.skillCorrect, [skill]: slice.correct };
      if (slice.reviews !== undefined) s.reviewsPassed = { ...s.reviewsPassed, [skill]: slice.reviews };
      if (slice.last !== undefined) s.lastPracticedSession = { ...s.lastPracticedSession, [skill]: slice.last };
    });
    setUndo(null);
  }

  const grad = graduationStatus(track, state);
  const session = buildTodaySession(track, state);
  const weak = weakSpots(track, state, 3);
  const started = Object.values(state.skillCorrect).some((a) => (a as string[]).length);
  const pct = grad.totalSkills ? Math.round((grad.strongSkills / grad.totalSkills) * 100) : 0;
  const bands = bandGroups(phases, state);

  const todayLabel = session.main.kind === 'graduated' ? 'Every phase complete'
    : session.main.kind === 'checkpoint' ? session.main.checkpoint.title
    : `${session.reviews.length ? `${session.reviews.length} review${session.reviews.length > 1 ? 's' : ''} + ` : ''}new lesson: ${session.main.concept.title}`;

  function go() {
    navigate(session.main.kind === 'checkpoint' ? `/learn/checkpoint/${session.main.checkpoint.id}` : '/learn/session');
  }

  return (
    <AppShell breadcrumb={<span className="here">Your path</span>}>
      <section className="lh-hero">
        <div className="lh-hero-copy">
          <span className="lh-kick">{started ? 'Keep going' : 'Start here'}</span>
          <h1>Your path to senior SQL</h1>
          <p className="lh-sub">From your first query to interview-ready analysis: three datasets, one step at a time, with everything you learn coming back so it sticks.</p>
          {session.main.kind === 'graduated'
            ? <>
                <p className="lh-grad">You have completed every phase. Senior ready.</p>
                <div className="lh-freeprac">
                  <span>Free practice: pick any lesson below, or drill your weakest.</span>
                  <div className="lh-freeprac-links">
                    {weak.map((w) => {
                      const c = track.concepts.find((x) => x.skill === w.skill);
                      return c ? <Button key={w.skill} onClick={() => navigate(`/learn/concept/${c.id}`)}>{w.title}</Button> : null;
                    })}
                  </div>
                </div>
              </>
            : <>
                <div className="lh-today"><span>Today</span> {todayLabel}</div>
                <Button variant="primary" onClick={go}>{started ? "Continue today's session" : 'Start lesson 1'}</Button>
              </>}
        </div>
        <div className="lh-ring">
          <Ring value={pct} />
          <div className="lh-ring-num"><b>{grad.strongSkills}<span>/{grad.totalSkills}</span></b><em>skills strong</em></div>
        </div>
      </section>

      <div className="band-stack">
        {bands.map((band) => (
          <BandSection key={band.meta.level} group={band} track={track} state={state} onReset={handleReset} />
        ))}
      </div>
      {undo ? (
        <div className="lh-toast" role="status" aria-live="polite">
          <span>Reset {undo.title}. Its full scaffold is back.</span>
          <button type="button" onClick={undoReset}>Undo</button>
          <button type="button" onClick={() => setUndo(null)}>Dismiss</button>
        </div>
      ) : null}
      {weak.length ? (
        <p className="lh-weakspots">Weak spots to review: {weak.map((w) => w.title).join(', ')}. A short session a day beats a long one a week.</p>
      ) : (
        <p className="lh-weakspots">A short session a day beats a long one a week.</p>
      )}
    </AppShell>
  );
}
