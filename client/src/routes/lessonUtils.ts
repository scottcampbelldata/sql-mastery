const LESSON_FILES = [
  'schemas', 'm1-fundamentals', 'm2-aggregation', 'm3-joins', 'm4-transformation',
  'm5-subqueries-ctes', 'm6-window-functions', 'm7-interview-patterns', 'm8-performance',
  'm9-data-modeling', 'mock-interviews', 'dialects'
];

export function rewriteLessonLinks(root: ParentNode): void {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return;
    const clean = href.replace(/\.html$/, '');
    if (clean === 'index') { a.setAttribute('href', '#/'); return; }
    if (LESSON_FILES.includes(clean)) a.setAttribute('href', `#/lessons/${clean}`);
  });
}

interface LessonSection {
  title: string;
  html: string;
  drills: number;
}

interface SplitLessonResult {
  introHtml: string;
  sections: LessonSection[];
}

// Split a lesson fragment into an intro (content before the first <h2>) and one
// section per <h2>. Each section is a self-contained page in the multi-page viewer.
export function splitLessonSections(html: string): SplitLessonResult {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const intro: Node[] = [];
  const sections: { title: string; parts: Node[] }[] = [];
  let current: { title: string; parts: Node[] } | null = null;
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 1 && (node as Element).tagName === 'H2') {
      current = { title: node.textContent || '', parts: [] };
      sections.push(current);
    } else if (current) {
      current.parts.push(node);
    } else {
      intro.push(node);
    }
  }
  const toHtml = (parts: Node[]): string => parts
    .map((n) => (n.nodeType === 1 ? (n as Element).outerHTML : (n.textContent || '')))
    .join('');
  return {
    introHtml: toHtml(intro),
    sections: sections.map((s) => ({
      title: s.title,
      html: toHtml(s.parts),
      drills: s.parts.filter((n) => n.nodeType === 1 && (n as Element).matches && (n as Element).matches('.problem')).length
    }))
  };
}
