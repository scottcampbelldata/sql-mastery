import type { DbSchemaMap, SqlDiff } from '../types';

// Bring-your-own-model AI coach. The learner picks a provider - a local Ollama, or their
// own OpenAI / Anthropic / Gemini API key - and every request goes straight from THIS
// browser to that provider. The key is stored only in this browser's localStorage under
// AI_SETTINGS_KEY, which is deliberately absent from the progress-sync allowlist, so it
// never reaches the SQL Mastery server or any other device.

export type AiProvider = 'off' | 'ollama' | 'openai' | 'anthropic' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

export const AI_SETTINGS_KEY = 'sqlm:ai:v1';
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  off: 'Off',
  ollama: 'Ollama (local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini'
};

export const DEFAULT_MODEL: Record<Exclude<AiProvider, 'off'>, string> = {
  ollama: 'llama3.1',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
  gemini: 'gemini-2.5-flash'
};

function defaults(): AiSettings {
  return { provider: 'off', apiKey: '', model: '', ollamaUrl: DEFAULT_OLLAMA_URL };
}

export function loadAiSettings(): AiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) as string);
    if (!parsed || typeof parsed !== 'object') return defaults();
    const provider: AiProvider = ['off', 'ollama', 'openai', 'anthropic', 'gemini'].includes(parsed.provider)
      ? parsed.provider : 'off';
    return {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      ollamaUrl: typeof parsed.ollamaUrl === 'string' && parsed.ollamaUrl ? parsed.ollamaUrl : DEFAULT_OLLAMA_URL
    };
  } catch {
    return defaults();
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try { localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* best effort */ }
}

export function coachConfigured(settings: AiSettings = loadAiSettings()): boolean {
  if (settings.provider === 'off') return false;
  if (settings.provider === 'ollama') return Boolean(settings.ollamaUrl);
  return Boolean(settings.apiKey);
}

export function modelFor(settings: AiSettings): string {
  if (settings.model.trim()) return settings.model.trim();
  return settings.provider === 'off' ? '' : DEFAULT_MODEL[settings.provider];
}

export interface CoachContext {
  task: string;
  sql: string;
  database: string;
  feedbackTitle: string;
  feedbackMessage: string;
  diff?: SqlDiff | null;
  schema?: DbSchemaMap | null;
}

// The coach nudges; it never writes the answer. Keeping that rule in the system prompt is
// what separates "personal tutor" from "answer vending machine".
export function buildCoachPrompt(ctx: CoachContext): { system: string; user: string } {
  const system = [
    'You are a senior data analyst coaching a learner through a SQL exercise they just got wrong.',
    'Never write the full corrected query and never reveal the complete answer.',
    'Identify the single most likely mistake in their SQL, explain it plainly in at most 120 words,',
    'name the clause involved (SELECT list, FROM/JOIN, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT),',
    'and end with exactly one short guiding question that points them at the fix.',
    'Plain text only: no markdown, no headings, no code blocks longer than one line.'
  ].join(' ');

  const lines: string[] = [];
  lines.push(`Task: ${ctx.task}`);
  lines.push(`Database: ${ctx.database}`);
  if (ctx.schema && Object.keys(ctx.schema).length) {
    const tables = Object.entries(ctx.schema).slice(0, 12)
      .map(([table, cols]) => `${table}(${cols.slice(0, 20).join(', ')})`);
    lines.push(`Schema: ${tables.join('; ')}`);
  }
  lines.push(`Learner SQL:\n${ctx.sql}`);
  lines.push(`Checker feedback: ${[ctx.feedbackTitle, ctx.feedbackMessage].filter(Boolean).join(' - ')}`);
  if (ctx.diff) {
    const d = ctx.diff;
    const bits: string[] = [`mismatch reason: ${d.reason}`];
    if (d.yourColumns && d.expectedColumns) bits.push(`their columns: [${d.yourColumns.join(', ')}] expected: [${d.expectedColumns.join(', ')}]`);
    if (typeof d.yourRowCount === 'number' && typeof d.expectedRowCount === 'number') bits.push(`their rows: ${d.yourRowCount}, expected rows: ${d.expectedRowCount}`);
    if (d.orderOnly) bits.push('values match but row order differs');
    lines.push(`Result diff: ${bits.join('; ')}`);
  }
  return { system, user: lines.join('\n\n') };
}

async function readBody(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

function providerError(provider: AiProvider, status: number, body: any): Error {
  const detail = body?.error?.message || body?.error || body?.message || '';
  if (status === 401 || status === 403) return new Error(`${PROVIDER_LABEL[provider]} rejected the API key. Check it in Settings.`);
  if (status === 404) return new Error(`${PROVIDER_LABEL[provider]} does not know that model. Check the model name in Settings.`);
  if (status === 429) return new Error(`${PROVIDER_LABEL[provider]} rate limit hit. Wait a moment and try again.`);
  return new Error(`${PROVIDER_LABEL[provider]} request failed (${status})${detail ? `: ${String(detail).slice(0, 200)}` : ''}`);
}

async function chatOllama(settings: AiSettings, system: string, user: string): Promise<string> {
  const base = settings.ollamaUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelFor(settings),
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });
  } catch {
    throw new Error(
      `Could not reach Ollama at ${base}. Is it running? If this site is not on localhost, ` +
      'start Ollama with OLLAMA_ORIGINS set to this site (for example OLLAMA_ORIGINS=https://sql-mastery.scottcampbell.io).'
    );
  }
  const body = await readBody(response);
  if (!response.ok) throw providerError('ollama', response.status, body);
  const text = body?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Ollama returned an empty reply.');
  return text.trim();
}

async function chatOpenAi(settings: AiSettings, system: string, user: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({
      model: modelFor(settings),
      max_completion_tokens: 400,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    })
  });
  const body = await readBody(response);
  if (!response.ok) throw providerError('openai', response.status, body);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('OpenAI returned an empty reply.');
  return text.trim();
}

async function chatAnthropic(settings: AiSettings, system: string, user: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      // Required for browser-side calls; the key is the user's own and stays on their machine.
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: modelFor(settings),
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });
  const body = await readBody(response);
  if (!response.ok) throw providerError('anthropic', response.status, body);
  const text = Array.isArray(body?.content) ? body.content.map((part: any) => part?.text || '').join('') : '';
  if (!text.trim()) throw new Error('Anthropic returned an empty reply.');
  return text.trim();
}

async function chatGemini(settings: AiSettings, system: string, user: string): Promise<string> {
  const model = encodeURIComponent(modelFor(settings));
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 400 }
      })
    }
  );
  const body = await readBody(response);
  if (!response.ok) throw providerError('gemini', response.status, body);
  const parts = body?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part: any) => part?.text || '').join('') : '';
  if (!text.trim()) throw new Error('Gemini returned an empty reply.');
  return text.trim();
}

async function chat(settings: AiSettings, system: string, user: string): Promise<string> {
  switch (settings.provider) {
    case 'ollama': return chatOllama(settings, system, user);
    case 'openai': return chatOpenAi(settings, system, user);
    case 'anthropic': return chatAnthropic(settings, system, user);
    case 'gemini': return chatGemini(settings, system, user);
    default: throw new Error('The AI coach is turned off. Pick a provider in Settings.');
  }
}

export async function askCoach(ctx: CoachContext, settings: AiSettings = loadAiSettings()): Promise<string> {
  if (!coachConfigured(settings)) throw new Error('The AI coach is not configured. Set it up in Settings.');
  const { system, user } = buildCoachPrompt(ctx);
  return chat(settings, system, user);
}

// A tiny round trip so Settings can verify the provider, key, and model actually work.
export async function testCoachConnection(settings: AiSettings): Promise<string> {
  if (!coachConfigured(settings)) throw new Error('Pick a provider (and key) first.');
  const reply = await chat(
    settings,
    'You are a connection test. Reply with the single word: ready',
    'Say the word.'
  );
  return reply.slice(0, 80);
}
