const LESSON_FILES = [
  'schemas', 'm1-fundamentals', 'm2-aggregation', 'm3-joins', 'm4-transformation',
  'm5-subqueries-ctes', 'm6-window-functions', 'm7-interview-patterns', 'm8-performance',
  'm9-data-modeling', 'mock-interviews', 'dialects'
];

export function rewriteLessonLinks(root) {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return;
    const clean = href.replace(/\.html$/, '');
    if (clean === 'index') { a.setAttribute('href', '#/'); return; }
    if (LESSON_FILES.includes(clean)) a.setAttribute('href', `#/lessons/${clean}`);
  });
}

// Split a lesson fragment into an intro (content before the first <h2>) and one
// section per <h2>. Each section is a self-contained page in the multi-page viewer.
export function splitLessonSections(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const intro = [];
  const sections = [];
  let current = null;
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 1 && node.tagName === 'H2') {
      current = { title: node.textContent || '', parts: [] };
      sections.push(current);
    } else if (current) {
      current.parts.push(node);
    } else {
      intro.push(node);
    }
  }
  const toHtml = (parts) => parts
    .map((n) => (n.nodeType === 1 ? n.outerHTML : (n.textContent || '')))
    .join('');
  return {
    introHtml: toHtml(intro),
    sections: sections.map((s) => ({
      title: s.title,
      html: toHtml(s.parts),
      drills: s.parts.filter((n) => n.nodeType === 1 && n.matches && n.matches('.problem')).length
    }))
  };
}
