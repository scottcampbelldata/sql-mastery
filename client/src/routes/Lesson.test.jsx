import { describe, it, expect, beforeEach } from 'vitest';
import { rewriteLessonLinks } from './lessonUtils.js';

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
