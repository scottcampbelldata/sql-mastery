const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');

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
  const progress = fs.readFileSync(path.join(rootDir, 'client', 'src', 'lib', 'progress.js'), 'utf8');
  assert.match(progress, /sqlm:product-progress:v1/);
  assert.match(progress, /sqlm:product-active-session:v1/);
});

test('lesson content lives in content/ and fragments are generated', () => {
  const content = fs.readdirSync(path.join(rootDir, 'content')).filter((f) => f.endsWith('.html'));
  assert.equal(content.length, 12);
  const fragments = fs.readdirSync(path.join(rootDir, 'client', 'src', 'lessons', 'fragments'));
  assert.equal(fragments.filter((f) => f.endsWith('.html')).length, content.length);
});
