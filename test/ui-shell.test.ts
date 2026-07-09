import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Resolve the repo root from the working directory (tests run from the project root)
// so this works whether the compiled test runs from dist/test or in place.
const rootDir = process.cwd();

test('retired front-end files are gone', () => {
  ['app.js', 'app.css', 'styles.css', 'shared.js', 'index.html'].forEach((file) => {
    assert.equal(fs.existsSync(path.join(rootDir, file)), false, `${file} should be deleted`);
  });
});

test('client design system exists with core tokens', () => {
  const tokens = fs.readFileSync(path.join(rootDir, 'client', 'src', 'theme', 'tokens.css'), 'utf8');
  ['--bg:', '--surface-1:', '--brand:', '--ok:', '--err:', '--font-mono:'].forEach((token) => {
    assert.match(tokens, new RegExp(token), `${token} should be defined`);
  });
});

test('client drops retired localStorage keys', () => {
  const progress = fs.readFileSync(path.join(rootDir, 'client', 'src', 'lib', 'progress.ts'), 'utf8');
  assert.doesNotMatch(progress, /sqlm:product-[a-z-]+:v1/);
});

test('retired lesson and static content sources are gone', () => {
  const staticContentPath = path.join(rootDir, 'content');
  const content = fs.existsSync(staticContentPath)
    ? fs.readdirSync(staticContentPath).filter((f) => f.endsWith('.html'))
    : [];
  assert.equal(content.length, 0);

  assert.equal(fs.existsSync(path.join(rootDir, 'client', 'src', 'lessons')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'client', 'src', 'routes', 'Lesson.tsx')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'client', 'src', 'routes', 'Session.tsx')), false);
});
