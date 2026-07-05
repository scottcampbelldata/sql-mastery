import { useState } from 'react';

const SECTIONS = [
  ['concept', 'What you are learning'],
  ['whyItMatters', 'Why it matters'],
  ['mentalModel', 'Mental model'],
  ['workedExample', 'Worked example']
];

export function LearnAccordion({ exercise, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = SECTIONS.some(([k]) => exercise[k]) ||
    (exercise.steps || []).length || (exercise.commonMistakes || []).length || exercise.interviewAngle;
  if (!hasContent) return null;
  return (
    <section className={`learn ${open ? 'open' : ''}`}>
      <button className="learn-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>Learn this first</span><span className="learn-chevron">{open ? '−' : '+'}</span>
      </button>
      {open ? (
        <div className="learn-body">
          {SECTIONS.map(([key, label]) => exercise[key]
            ? <div key={key} className="learn-block"><span>{label}</span><p>{exercise[key]}</p></div> : null)}
          {(exercise.steps || []).length ? (
            <div className="learn-block"><span>How to approach it</span>
              <ol>{exercise.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></div>) : null}
          {(exercise.commonMistakes || []).length ? (
            <div className="learn-block warn"><span>Common mistakes</span>
              <ul>{exercise.commonMistakes.map((s, i) => <li key={i}>{s}</li>)}</ul></div>) : null}
          {exercise.interviewAngle
            ? <div className="learn-block brand"><span>Interview angle</span><p>{exercise.interviewAngle}</p></div> : null}
        </div>
      ) : null}
    </section>
  );
}
