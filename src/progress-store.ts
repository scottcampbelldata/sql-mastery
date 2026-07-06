import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// A tiny file-backed store for cross-device progress sync, keyed by a user-chosen
// sync code. The code is hashed (sha256) so the raw code never becomes a filename,
// and writes are atomic (temp file + rename). This is intentionally separate from
// the read-only teaching PostgreSQL role.
function createProgressStore(options: any = {}): any {
  const dir = options.dir || path.join(__dirname, '..', 'data', 'progress');

  function fileFor(code: string) {
    const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
    return path.join(dir, `${hash}.json`);
  }

  function get(code: string) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(code), 'utf8'));
    } catch {
      return null;
    }
  }

  function set(code: string, data: any) {
    fs.mkdirSync(dir, { recursive: true });
    const record = { data, updatedAt: new Date().toISOString() };
    const file = fileFor(code);
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
    return record;
  }

  return { get, set, dir };
}

export { createProgressStore };
