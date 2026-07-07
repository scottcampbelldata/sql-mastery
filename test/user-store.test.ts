import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createUserStore } from '../src/user-store';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sqlm-users-'));
}

test('upsert creates a user on first login and returns it', () => {
  const store = createUserStore({ dir: tmpDir(), now: () => '2026-01-01T00:00:00.000Z' });
  const user = store.upsert({ sub: 'g-123', email: 'a@b.com', name: 'Ann' });
  assert.equal(user.sub, 'g-123');
  assert.equal(user.email, 'a@b.com');
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
});

test('upsert on repeat login keeps createdAt and refreshes profile', () => {
  const dir = tmpDir();
  const first = createUserStore({ dir, now: () => '2026-01-01T00:00:00.000Z' });
  first.upsert({ sub: 'g-1', email: 'old@b.com', name: 'Old' });
  const second = createUserStore({ dir, now: () => '2026-02-02T00:00:00.000Z' });
  const user = second.upsert({ sub: 'g-1', email: 'new@b.com', name: 'New' });
  assert.equal(user.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(user.updatedAt, '2026-02-02T00:00:00.000Z');
  assert.equal(user.email, 'new@b.com');
});

test('getBySub returns null for an unknown user', () => {
  const store = createUserStore({ dir: tmpDir() });
  assert.equal(store.getBySub('nope'), null);
});
