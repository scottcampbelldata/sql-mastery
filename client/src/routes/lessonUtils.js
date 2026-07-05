const LESSON_FILES = [
  'schemas', 'm1-fundamentals', 'm2-aggregation', 'm3-joins', 'm4-transformation',
  'm5-subqueries-ctes', 'm6-window-functions', 'm7-interview-patterns', 'm8-performance', 'mock-interviews'
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
