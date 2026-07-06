import { describe, it, expect } from 'vitest';
import { rewriteLessonLinks, splitLessonSections } from './lessonUtils.js';

describe('splitLessonSections', () => {
  it('splits intro + one section per h2 and counts drills', () => {
    const html = '<p class="lede">Intro text.</p>'
      + '<h2>1.1 First</h2><p>alpha</p>'
      + '<h2>Practice</h2><div class="problem"><div class="phead"></div></div><div class="problem"></div>';
    const { introHtml, sections } = splitLessonSections(html);
    expect(introHtml).toContain('Intro text');
    expect(sections.length).toBe(2);
    expect(sections[0].title).toBe('1.1 First');
    expect(sections[0].html).toContain('alpha');
    expect(sections[0].drills).toBe(0);
    expect(sections[1].title).toBe('Practice');
    expect(sections[1].drills).toBe(2);
  });
});

describe('rewriteLessonLinks', () => {
  it('rewrites legacy lesson hrefs to router paths', () => {
    const div = document.createElement('div');
    div.innerHTML = '<a href="m2-aggregation.html">next</a><a href="index.html">home</a><a href="https://x.test/a.html">ext</a><a href="#anchor">jump</a>';
    rewriteLessonLinks(div);
    expect(div.querySelectorAll('a')[0].getAttribute('href')).toBe('#/lessons/m2-aggregation');
    expect(div.querySelectorAll('a')[1].getAttribute('href')).toBe('#/');
    expect(div.querySelectorAll('a')[2].getAttribute('href')).toBe('https://x.test/a.html');
    expect(div.querySelectorAll('a')[3].getAttribute('href')).toBe('#anchor');
  });
});
