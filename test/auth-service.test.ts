import test from 'node:test';
import assert from 'node:assert/strict';

import { createAuthService } from '../src/auth-service';

function service() {
  return createAuthService({
    clientId: 'test-client',
    sessionSecret: 'test-secret',
    verifyGoogle: async (idToken: string) => {
      if (idToken !== 'good') throw new Error('bad token');
      return { sub: 'g-42', email: 'x@y.com', name: 'Ex' };
    }
  });
}

test('verifyGoogleToken returns the profile for a valid token', async () => {
  const profile = await service().verifyGoogleToken('good');
  assert.deepEqual(profile, { sub: 'g-42', email: 'x@y.com', name: 'Ex' });
});

test('verifyGoogleToken rejects an invalid token', async () => {
  await assert.rejects(() => service().verifyGoogleToken('bad'));
});

test('issueSession then verifySession round-trips the sub', () => {
  const auth = service();
  const token = auth.issueSession('g-42');
  assert.deepEqual(auth.verifySession(token), { sub: 'g-42' });
});

test('verifySession returns null for a tampered token', () => {
  const auth = service();
  assert.equal(auth.verifySession('not.a.jwt'), null);
});

test('verifySession returns null when signed with a different secret', () => {
  const a = createAuthService({ sessionSecret: 'one', verifyGoogle: async () => ({ sub: 's', email: '', name: '' }) });
  const b = createAuthService({ sessionSecret: 'two', verifyGoogle: async () => ({ sub: 's', email: '', name: '' }) });
  assert.equal(b.verifySession(a.issueSession('s')), null);
});
