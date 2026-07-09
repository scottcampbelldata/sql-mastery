import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Resolve the repo root from the working directory (tests run from the project root)
// so this works whether the compiled test runs from dist/test or in place.
const rootDir = process.cwd();

test('legacy front-end files are gone', () => {
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

test('client preserves legacy localStorage keys', () => {
  const progress = fs.readFileSync(path.join(rootDir, 'client', 'src', 'lib', 'progress.ts'), 'utf8');
  assert.match(progress, /sqlm:product-progress:v1/);
  assert.match(progress, /sqlm:product-active-session:v1/);
});

test('retired lesson source content is gone', () => {
  const contentDir = path.join(rootDir, 'content');
  const content = fs.existsSync(contentDir)
    ? fs.readdirSync(contentDir).filter((f) => f.endsWith('.html'))
    : [];
  assert.equal(content.length, 0);

  const fragments = fs.readdirSync(path.join(rootDir, 'client', 'src', 'lessons', 'fragments'));
  assert.ok(fragments.filter((f) => f.endsWith('.html')).length > 0);
});
