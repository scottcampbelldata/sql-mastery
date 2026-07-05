import { useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell.jsx';
import { EmptyState } from '../components/ui.jsx';
import { LESSONS } from '../lessons/manifest.js';
import { rewriteLessonLinks } from './lessonUtils.js';
import { isLessonBoxChecked, setLessonBox } from '../lib/progress.js';
import { Link } from 'react-router-dom';
import './lesson.css';

const fragments = import.meta.glob('../lessons/fragments/*.html', { query: '?raw', import: 'default', eager: true });

export default function Lesson() {
  const { slug } = useParams();
  const meta = LESSONS.find((l) => l.slug === slug);
  const html = fragments[`../lessons/fragments/${slug}.html`];
  const bodyRef = useRef(null);
  const [toc, setToc] = useState([]);

  useEffect(() => {
    const root = bodyRef.current;
    if (!root || !meta) return;
    rewriteLessonLinks(root);
    // progress checkboxes — legacy keys
    root.querySelectorAll('input.done[data-id]').forEach((cb) => {
      cb.checked = isLessonBoxChecked(meta.page, cb.dataset.id);
      cb.onchange = () => setLessonBox(meta.page, cb.dataset.id, cb.checked);
    });
    // table of contents from h2s
    const heads = [...root.querySelectorAll('h2')].map((h, i) => {
      if (!h.id) h.id = `sec-${i}`;
      return { id: h.id, text: h.textContent };
    });
    setToc(heads);
  }, [slug, meta]);

  if (!meta || !html) {
    return <AppShell breadcrumb={<span className="here">Lesson</span>}><EmptyState title="Lesson not found" /></AppShell>;
  }

  return (
    <AppShell breadcrumb={<>
      <Link to="/academy">Dashboard</Link><span className="sep">/</span>
      <span>Lessons</span><span className="sep">/</span>
      <span className="here">{meta.title}</span>
    </>}>
      <div className="lesson-layout">
        <article ref={bodyRef} className="lesson-body" dangerouslySetInnerHTML={{ __html: html }} />
        {toc.length ? (
          <nav className="lesson-toc">
            <span className="toc-label">On this page</span>
            {toc.map((t) => <a key={t.id} href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{t.text}</a>)}
          </nav>
        ) : null}
      </div>
    </AppShell>
  );
}
