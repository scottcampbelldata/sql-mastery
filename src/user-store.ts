import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// A tiny file-backed store for user accounts, keyed by the Google subject id (sub).
// The sub is hashed (sha256) so it never becomes a raw filename, and writes are
// atomic (temp file + rename). Kept separate from the read-only teaching database.
export interface UserRecord {
  sub: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserStore {
  upsert(input: { sub: string; email: string; name: string }): UserRecord;
  getBySub(sub: string): UserRecord | null;
}

export function createUserStore(options: { dir?: string; now?: () => string } = {}): UserStore {
  const dir = options.dir || path.resolve(process.cwd(), 'data', 'users');
  const now = options.now || (() => new Date().toISOString());

  function fileFor(sub: string): string {
    const hash = crypto.createHash('sha256').update(String(sub)).digest('hex');
    return path.join(dir, `${hash}.json`);
  }

  function getBySub(sub: string): UserRecord | null {
    try {
      return JSON.parse(fs.readFileSync(fileFor(sub), 'utf8')) as UserRecord;
    } catch {
      return null;
    }
  }

  function upsert(input: { sub: string; email: string; name: string }): UserRecord {
    fs.mkdirSync(dir, { recursive: true });
    const existing = getBySub(input.sub);
    const record: UserRecord = {
      sub: input.sub,
      email: input.email,
      name: input.name,
      createdAt: existing ? existing.createdAt : now(),
      updatedAt: now()
    };
    const file = fileFor(input.sub);
    const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
    return record;
  }

  return { upsert, getBySub };
}
