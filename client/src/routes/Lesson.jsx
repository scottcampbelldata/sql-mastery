import { useParams, Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState, Button } from '../components/ui.jsx';
import { LESSONS } from '../lessons/manifest.js';
import { rewriteLessonLinks, splitLessonSections } from './lessonUtils.js';
import { isLessonBoxChecked, setLessonBox } from '../lib/progress.js';
import { useCurriculum } from '../state/CurriculumContext.jsx';
import { DrillModal } from '../components/DrillModal.jsx';
import './lesson.css';

const fragments = import.meta.glob('../lessons/fragments/*.html', { query: '?raw', import: 'default', eager: true });

export default function Lesson() {
  const { slug, step } = useParams();
  const navigate = useNavigate();
  const meta = LESSONS.find((l) => l.slug === slug);
  const html = fragments[`../lessons/fragments/${slug}.html`];
  const { curriculum } = useCurriculum();

  const parsed = useMemo(() => (html ? splitLessonSections(html) : null), [html]);
  const exerciseById = useMemo(() => {
    const map = {};
    (curriculum?.exercises || []).forEach((e) => { map[e.id] = e; });
    return map;
  }, [curriculum]);

  const bodyRef = useRef(null);
  const [modalEx, setModalEx] = useState(null);
  const [tick, setTick] = useState(0); // re-render after a drill is solved

  const stepIndex = step ? Number(step) - 1 : -1;
  const total = parsed ? parsed.sections.length : 0;
  const section = parsed && stepIndex >= 0 && stepIndex < total ? parsed.sections[stepIndex] : null;

  // Build an exercise for the modal: prefer the parsed curriculum exercise (its
  // expectedSql is adapted for the real DB), else read the drill's own solution.
  const buildExercise = useCallback((problem) => {
    const dataId = problem.querySelector('input.done')?.dataset.id;
    const fromCurriculum = dataId && exerciseById[dataId];
    if (fromCurriculum && fromCurriculum.expectedSql && fromCurriculum.database) {
      return { ...fromCurriculum, starterSql: '' };
    }
    return {
      id: dataId || 'drill',
      database: problem.querySelector('.db')?.textContent?.trim(),
      expectedSql: problem.querySelector('details.sol pre')?.textContent?.trim(),
      task: problem.querySelector('.pbody > p')?.textContent?.trim(),
      hint: problem.querySelector('details.hint .sbody')?.textContent?.trim(),
      starterSql: ''
    };
  }, [exerciseById]);

  useEffect(() => { window.scrollTo(0, 0); }, [slug, step]);

  // Post-process rendered HTML: rewrite links, bind checkboxes, inject Solve buttons.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !meta) return;
    rewriteLessonLinks(root);
    if (!section) return;
    root.querySelectorAll('input.done[data-id]').forEach((cb) => {
      cb.checked = isLessonBoxChecked(meta.page, cb.dataset.id);
      cb.onchange = () => setLessonBox(meta.page, cb.dataset.id, cb.checked);
    });
    root.querySelectorAll('.problem').forEach((problem) => {
      const phead = problem.querySelector('.phead');
      if (!phead || phead.querySelector('.solve-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'solve-btn';
      btn.textContent = 'Solve ▸';
      btn.addEventListener('click', () => setModalEx(buildExercise(problem)));
      phead.appendChild(btn);
    });
  }, [meta, section, buildExercise, tick]);

  if (!meta || !parsed) {
    return <AppShell breadcrumb={<span className="here">Lesson</span>}><EmptyState title="Lesson not found" /></AppShell>;
  }

  const sectionProgress = (sec) => {
    const ids = [...sec.html.matchAll(/data-id="([^"]+)"/g)].map((m) => m[1]);
    if (!ids.length) return null;
    return { done: ids.filter((id) => isLessonBoxChecked(meta.page, id)).length, total: ids.length };
  };

  function markSolved(id) {
    setLessonBox(meta.page, id, true);
    const cb = bodyRef.current?.querySelector(`input.done[data-id="${id}"]`);
    if (cb) cb.checked = true;
    setTick((t) => t + 1);
  }

  const crumb = (
    <>
      <Link to="/academy">Dashboard</Link><span className="sep">/</span>
      <Link to={`/lessons/${slug}`}>{meta.title}</Link>
      {section ? <><span className="sep">/</span><span className="here">Step {stepIndex + 1}</span></> : null}
    </>
  );

  // ---- Overview: intro + a clickable list of the lesson's steps ----
  if (!section) {
    const totalDrills = parsed.sections.reduce((n, s) => n + (sectionProgress(s)?.total || 0), 0);
    const doneDrills = parsed.sections.reduce((n, s) => n + (sectionProgress(s)?.done || 0), 0);
    return (
      <AppShell breadcrumb={crumb}>
        <div className="lesson-overview">
          <div ref={bodyRef} className="lesson-body lesson-intro" dangerouslySetInnerHTML={{ __html: parsed.introHtml }} />
          <div className="lesson-overview-meta">
            {total} steps{totalDrills ? ` · ${doneDrills}/${totalDrills} drills solved` : ''}
          </div>
          <ol className="lesson-steps">
            {parsed.sections.map((sec, i) => {
              const p = sectionProgress(sec);
              const complete = p && p.done === p.total;
              return (
                <li key={i}>
                  <Link to={`/lessons/${slug}/${i + 1}`} className={`lesson-step-link${complete ? ' done' : ''}`}>
                    <span className="lesson-step-num">{complete ? '✓' : i + 1}</span>
                    <span className="lesson-step-title">{sec.title}</span>
                    {p ? <span className="lesson-step-badge">{p.done}/{p.total}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="lesson-overview-foot">
            <Button variant="primary" onClick={() => navigate(`/lessons/${slug}/1`)}>Start &rarr;</Button>
          </div>
        </div>
        {modalEx ? <DrillModal exercise={modalEx} onClose={() => setModalEx(null)} onSolved={markSolved} /> : null}
      </AppShell>
    );
  }

  // ---- Step: one section, with prev/next and interactive drills ----
  return (
    <AppShell breadcrumb={crumb}>
      <div className="lesson-step">
        <div className="lesson-step-head">
          <span className="lesson-step-count">Step {stepIndex + 1} of {total}</span>
          <h1>{section.title}</h1>
        </div>
        <div ref={bodyRef} className="lesson-body" dangerouslySetInnerHTML={{ __html: section.html }} />
        <div className="lesson-step-nav">
          {stepIndex > 0
            ? <Button onClick={() => navigate(`/lessons/${slug}/${stepIndex}`)}>&larr; Previous</Button>
            : <Button onClick={() => navigate(`/lessons/${slug}`)}>&larr; Overview</Button>}
          <span className="lesson-step-dots">{stepIndex + 1} / {total}</span>
          {stepIndex < total - 1
            ? <Button variant="primary" onClick={() => navigate(`/lessons/${slug}/${stepIndex + 2}`)}>Next &rarr;</Button>
            : <Button variant="primary" onClick={() => navigate(`/lessons/${slug}`)}>Finish ✓</Button>}
        </div>
      </div>
      {modalEx ? <DrillModal exercise={modalEx} onClose={() => setModalEx(null)} onSolved={markSolved} /> : null}
    </AppShell>
  );
}
