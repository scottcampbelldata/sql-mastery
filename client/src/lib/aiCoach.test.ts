import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AI_SETTINGS_KEY, DEFAULT_OLLAMA_URL, loadAiSettings, saveAiSettings, coachConfigured,
  modelFor, buildCoachPrompt, askCoach, testCoachConnection, mixedContentRisk, type AiSettings
} from './aiCoach';

function settings(over: Partial<AiSettings> = {}): AiSettings {
  return { provider: 'off', apiKey: '', model: '', ollamaUrl: DEFAULT_OLLAMA_URL, baseUrl: '', ...over };
}

const CTX = {
  task: 'Return planet_id and planet_name. Order by: planet_id.',
  sql: 'SELECT planet_name FROM planets ORDER BY planet_id',
  database: 'aperture',
  feedbackTitle: 'Not quite yet',
  feedbackMessage: 'Your query ran, but the output columns do not match.',
  diff: {
    reason: 'columns' as const,
    yourColumns: ['planet_name'],
    expectedColumns: ['planet_id', 'planet_name'],
    yourRowCount: 140, expectedRowCount: 140, orderOnly: false, extraRows: 0, missingRows: 0
  },
  schema: { planets: ['planet_id', 'planet_name', 'planet_type'] }
};

describe('AI coach settings', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips settings and defaults bad data', () => {
    expect(loadAiSettings()).toEqual(settings());
    saveAiSettings(settings({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' }));
    expect(loadAiSettings()).toEqual(settings({ provider: 'anthropic', apiKey: 'k', model: 'claude-x' }));
    localStorage.setItem(AI_SETTINGS_KEY, '{"provider":"nope","ollamaUrl":""}');
    expect(loadAiSettings()).toEqual(settings());
  });

  it('knows when the coach is usable', () => {
    expect(coachConfigured(settings())).toBe(false);
    expect(coachConfigured(settings({ provider: 'openai' }))).toBe(false);
    expect(coachConfigured(settings({ provider: 'openai', apiKey: 'k' }))).toBe(true);
    expect(coachConfigured(settings({ provider: 'ollama' }))).toBe(true);
    expect(coachConfigured(settings({ provider: 'compat' }))).toBe(false);
    expect(coachConfigured(settings({ provider: 'compat', baseUrl: 'http://localhost:1234' }))).toBe(true);
  });

  it('falls back to per-provider default models', () => {
    expect(modelFor(settings({ provider: 'openai' }))).toBe('gpt-4o-mini');
    expect(modelFor(settings({ provider: 'openai', model: ' my-model ' }))).toBe('my-model');
  });

  it('flags plain-http URLs as mixed content from an https page, except localhost', () => {
    expect(mixedContentRisk('http://100.91.251.89:11434', 'https:')).toBe(true);
    expect(mixedContentRisk('http://192.168.1.20:1234', 'https:')).toBe(true);
    expect(mixedContentRisk('http://localhost:11434', 'https:')).toBe(false);
    expect(mixedContentRisk('http://127.0.0.1:11434', 'https:')).toBe(false);
    expect(mixedContentRisk('https://box.tail1234.ts.net', 'https:')).toBe(false);
    expect(mixedContentRisk('http://100.91.251.89:11434', 'http:')).toBe(false);
    expect(mixedContentRisk('not a url', 'https:')).toBe(false);
  });
});

describe('coach prompt', () => {
  it('carries the task, SQL, feedback, diff, and schema; forbids full answers', () => {
    const { system, user } = buildCoachPrompt(CTX);
    expect(system).toMatch(/never write the full corrected query/i);
    expect(user).toContain(CTX.task);
    expect(user).toContain(CTX.sql);
    expect(user).toContain('planets(planet_id, planet_name, planet_type)');
    expect(user).toContain('their columns: [planet_name]');
    expect(user).toContain('columns do not match');
  });
});

describe('provider adapters', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; vi.restoreAllMocks(); });

  function mockFetch(body: unknown, ok = true, status = 200) {
    const fn = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('calls Ollama chat with stream off and reads message.content', async () => {
    const fn = mockFetch({ message: { content: ' Check your SELECT list. ' } });
    const reply = await askCoach(CTX, settings({ provider: 'ollama' }));
    expect(reply).toBe('Check your SELECT list.');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe(`${DEFAULT_OLLAMA_URL}/api/chat`);
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.stream).toBe(false);
    expect(payload.model).toBe('llama3.1');
    expect(payload.messages[1].content).toContain(CTX.sql);
  });

  it('calls OpenAI with a bearer key and reads choices[0]', async () => {
    const fn = mockFetch({ choices: [{ message: { content: 'nudge' } }] });
    const reply = await askCoach(CTX, settings({ provider: 'openai', apiKey: 'sk-test' }));
    expect(reply).toBe('nudge');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBe('Bearer sk-test');
  });

  it('calls Anthropic with the browser-access header and joins content parts', async () => {
    const fn = mockFetch({ content: [{ text: 'part one ' }, { text: 'part two' }] });
    const reply = await askCoach(CTX, settings({ provider: 'anthropic', apiKey: 'ak' }));
    expect(reply).toBe('part one part two');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get('x-api-key')).toBe('ak');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.model).toBe('claude-sonnet-5');
    expect(typeof payload.system).toBe('string');
  });

  it('calls Gemini with the key in the query string and joins parts', async () => {
    const fn = mockFetch({ candidates: [{ content: { parts: [{ text: 'ge' }, { text: 'mini' }] } }] });
    const reply = await askCoach(CTX, settings({ provider: 'gemini', apiKey: 'g-key' }));
    expect(reply).toBe('gemini');
    const [url] = fn.mock.calls[0];
    expect(String(url)).toContain('models/gemini-2.5-flash:generateContent?key=g-key');
  });

  it('calls an OpenAI-compatible server, omitting the model and auth when absent', async () => {
    const fn = mockFetch({ choices: [{ message: { content: 'local nudge' } }] });
    const reply = await askCoach(CTX, settings({ provider: 'compat', baseUrl: 'http://localhost:1234/' }));
    expect(reply).toBe('local nudge');
    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('http://localhost:1234/v1/chat/completions');
    expect(new Headers((init as RequestInit).headers).get('authorization')).toBeNull();
    const payload = JSON.parse((init as RequestInit).body as string);
    expect('model' in payload).toBe(false);

    const fn2 = mockFetch({ choices: [{ message: { content: 'keyed' } }] });
    await askCoach(CTX, settings({ provider: 'compat', baseUrl: 'http://x:8080', apiKey: 'owui-key', model: 'gemma4:31b' }));
    const [, init2] = fn2.mock.calls[0];
    expect(new Headers((init2 as RequestInit).headers).get('authorization')).toBe('Bearer owui-key');
    expect(JSON.parse((init2 as RequestInit).body as string).model).toBe('gemma4:31b');
  });

  it('maps auth failures to a readable message', async () => {
    mockFetch({ error: { message: 'bad key' } }, false, 401);
    await expect(askCoach(CTX, settings({ provider: 'openai', apiKey: 'nope' })))
      .rejects.toThrow(/rejected the API key/i);
  });

  it('explains Ollama origin refusals and wrong-port answers specifically', async () => {
    mockFetch({}, false, 403);
    await expect(askCoach(CTX, settings({ provider: 'ollama' })))
      .rejects.toThrow(/OLLAMA_ORIGINS/);

    mockFetch({ detail: 'Method Not Allowed' }, false, 405);
    await expect(askCoach(CTX, settings({ provider: 'ollama' })))
      .rejects.toThrow(/not the Ollama chat API/i);

    mockFetch({ error: "model 'nope:1b' not found" }, false, 404);
    await expect(askCoach(CTX, settings({ provider: 'ollama' })))
      .rejects.toThrow(/ollama pull/i);
  });

  it('explains an unreachable Ollama including the origins hint', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;
    await expect(askCoach(CTX, settings({ provider: 'ollama' })))
      .rejects.toThrow(/OLLAMA_ORIGINS/);
  });

  it('test connection sends a tiny prompt and returns the reply', async () => {
    mockFetch({ message: { content: 'ready' } });
    await expect(testCoachConnection(settings({ provider: 'ollama' }))).resolves.toBe('ready');
    await expect(testCoachConnection(settings({ provider: 'openai' }))).rejects.toThrow(/key/i);
  });
});
