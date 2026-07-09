import { describe, it, expect, afterEach, vi } from 'vitest';
import { api, setAuthToken } from './api';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body)
  };
}

function nonJsonResponse(ok = false, status = 502) {
  return {
    ok,
    status,
    json: () => Promise.reject(new Error('invalid json'))
  };
}

describe('api request wrapper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed body on an ok JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ databases: ['pagila'] })));
    await expect(api.databases()).resolves.toEqual({ databases: ['pagila'] });
  });

  it('rejects non-ok JSON responses with message and error metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse({ error: 'syntax error', code: '42601', hint: 'check your SELECT', position: 7 }, false, 400)
    ));
    const err = await api.query('pagila', 'SELEC 1').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('syntax error');
    expect(err.code).toBe('42601');
    expect(err.hint).toBe('check your SELECT');
    expect(err.position).toBe(7);
  });

  it('rejects non-ok non-JSON responses with the fallback message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(nonJsonResponse()));
    const err = await api.curriculum().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Request failed');
  });

  it('reshapes fetch rejection into a NETWORK error with a human message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.curriculum().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('NETWORK');
    expect(err.message).toBe('Could not reach the local server. Is `npm start` running?');
  });

  it('attaches a Bearer header when a token is set, and omits it when cleared', async () => {
    const calls: RequestInit[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (_url: string, options: RequestInit = {}) => {
      calls.push(options);
      return { ok: true, json: async () => ({ ok: true }) } as any;
    }) as any;
    try {
      setAuthToken('tok-123');
      await api.me();
      const withTok = new Headers(calls[0].headers);
      expect(withTok.get('authorization')).toBe('Bearer tok-123');

      setAuthToken(null);
      await api.me();
      const without = new Headers(calls[1].headers);
      expect(without.get('authorization')).toBe(null);
    } finally {
      globalThis.fetch = orig;
      setAuthToken(null);
    }
  });

  it('posts exercise ids for checks without sending the model answer', async () => {
    const calls: Array<{ url: string; options: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, options: RequestInit = {}) => {
      calls.push({ url, options });
      return Promise.resolve(jsonResponse({ correct: true }));
    }));

    await api.check('exercise-1', 'SELECT 1');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/check');
    expect(JSON.parse(calls[0].options.body as string)).toEqual({
      exerciseId: 'exercise-1',
      sql: 'SELECT 1'
    });
  });
});
