const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');

test('premium analyst cockpit shell hooks are present', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(rootDir, 'app.css'), 'utf8');

  [
    'cockpit-header',
    'mission-panel',
    'metric-card',
    'week-lattice',
    'studio-workbench',
    'editor-shell',
    'coach-panel'
  ].forEach((className) => {
    assert.match(appJs, new RegExp(className), `${className} should be rendered by the SPA`);
    assert.match(appCss, new RegExp(`\\.${className}\\b`), `${className} should be styled`);
  });
});

test('teaching workbench hooks are present for beginner lessons', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(rootDir, 'app.css'), 'utf8');

  [
    'lesson-brief',
    'lesson-concept',
    'mental-model',
    'worked-example',
    'lesson-steps',
    'mistake-list',
    'interview-angle'
  ].forEach((className) => {
    assert.match(appJs, new RegExp(className), `${className} should be rendered by the SPA`);
    assert.match(appCss, new RegExp(`\\.${className}\\b`), `${className} should be styled`);
  });
});

test('database companion tab hooks are present in the workbench', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(rootDir, 'app.css'), 'utf8');

  [
    'query-tabs',
    'schema-explorer',
    'table-strip',
    'table-preview',
    'database-grid'
  ].forEach((className) => {
    assert.match(appJs, new RegExp(className), `${className} should be rendered by the SPA`);
    assert.match(appCss, new RegExp(`\\.${className}\\b`), `${className} should be styled`);
  });

  assert.match(appJs, /\/api\/schema/, 'the SPA should fetch database metadata');
  assert.match(appJs, /\/api\/table-preview/, 'the SPA should fetch table samples');
});

test('database companion renders as a bounded compact dock', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(rootDir, 'app.css'), 'utf8');

  assert.match(appJs, /compact-dock/, 'the output area should opt into compact dock styling');
  assert.match(appCss, /\.compact-dock\{[^}]*max-height:340px/s, 'the dock should have a fixed maximum height');
  assert.match(appCss, /\.table-strip\{[^}]*max-height:86px/s, 'table choices should stay in a short picker');
  assert.match(appCss, /\.table-preview\{[^}]*max-height:190px/s, 'sample rows should be a small preview, not a full-screen table');
});

test('index uses cache-busted app assets for fast UI iteration', () => {
  const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');

  assert.match(html, /app\.css\?v=/, 'stylesheet should include a version query');
  assert.match(html, /app\.js\?v=/, 'script should include a version query');
});

test('sidebar can collapse into a compact rail', () => {
  const appJs = fs.readFileSync(path.join(rootDir, 'app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(rootDir, 'app.css'), 'utf8');

  assert.match(appJs, /sidebarKey/, 'collapsed state should be persisted');
  assert.match(appJs, /toggle-sidebar/, 'sidebar should render a collapse toggle action');
  assert.match(appJs, /sidebar-collapsed/, 'shell should render a collapsed class');
  assert.match(appCss, /\.sidebar-collapsed\{[^}]*grid-template-columns:76px/s, 'collapsed shell should shrink the sidebar column');
  assert.match(appCss, /\.sidebar-collapsed\s+\.nav-text/s, 'collapsed sidebar should hide nav text');
});
