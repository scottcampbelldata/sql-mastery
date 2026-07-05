const fs = require('node:fs');
const path = require('node:path');

const contentDir = path.join(__dirname, '..', 'content');
const outDir = path.join(__dirname, '..', 'client', 'src', 'lessons', 'fragments');
fs.mkdirSync(outDir, { recursive: true });

const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.html'));
for (const file of files) {
  const html = fs.readFileSync(path.join(contentDir, file), 'utf8');
  const start = html.indexOf('<div class="wrap">');
  if (start === -1) throw new Error(`${file}: no <div class="wrap"> found`);
  const afterStart = start + '<div class="wrap">'.length;
  // fragment ends at the last </div> before the first <script> tag after .wrap (or </body>)
  const scriptIdx = html.indexOf('<script', afterStart);
  const endSearchLimit = scriptIdx === -1 ? html.indexOf('</body>') : scriptIdx;
  const end = html.lastIndexOf('</div>', endSearchLimit);
  if (end === -1 || end <= afterStart) throw new Error(`${file}: could not find closing </div>`);
  const fragment = html.slice(afterStart, end).trim();
  const slug = file.replace(/\.html$/, '');
  fs.writeFileSync(path.join(outDir, `${slug}.html`), fragment + '\n');
  console.log(`extracted ${slug} (${fragment.length} bytes)`);
}
