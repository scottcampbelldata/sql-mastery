import type { DbSchemaMap, SqlDiff } from '../types';

// Bring-your-own-model AI coach. The learner picks a provider - a local Ollama, or their
// own OpenAI / Anthropic / Gemini API key - and every request goes straight from THIS
// browser to that provider. The key is stored only in this browser's localStorage under
// AI_SETTINGS_KEY, which is deliberately absent from the progress-sync allowlist, so it
// never reaches the SQL Mastery server or any other device.

export type AiProvider = 'off' | 'ollama' | 'compat' | 'openai' | 'anthropic' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
  // OpenAI-compatible server root (LM Studio, vLLM, llama.cpp, Open WebUI). The app calls
  // {baseUrl}/v1/chat/completions on it; the API key is optional for servers that need one.
  baseUrl: string;
}

export const AI_SETTINGS_KEY = 'sqlm:ai:v1';
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  off: 'Off',
  ollama: 'Ollama (local)',
  compat: 'OpenAI-compatible (local)',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini'
};

export const DEFAULT_MODEL: Record<Exclude<AiProvider, 'off'>, string> = {
  ollama: 'llama3.1',
  compat: '',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
  gemini: 'gemini-2.5-flash'
};

function defaults(): AiSettings {
  return { provider: 'off', apiKey: '', model: '', ollamaUrl: DEFAULT_OLLAMA_URL, baseUrl: '' };
}

// True when the browser will refuse (or silently upgrade) the request: an https page may
// not call a plain-http server unless it is localhost. Tailscale/LAN IPs hit this.
export function mixedContentRisk(url: string, pageProtocol: string = window.location.protocol): boolean {
  if (pageProtocol !== 'https:') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:') return false;
    return !['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export const MIXED_CONTENT_HELP =
  'This site is https, so browsers block plain-http calls to anything except localhost. ' +
  'Give the server an https address - on Tailscale, run: tailscale serve --bg --https=443 localhost:11434 ' +
  'on that machine and use the https://<machine>.<tailnet>.ts.net URL it prints - or allow ' +
  '"Insecure content" for this site in your browser\'s site settings.';

// Local models can be legitimately slow, but a request that never settles leaves the UI
// stuck on "Testing...". Abort with a readable message instead.
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, onAbortMessage: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(onAbortMessage);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Generous ceiling: a large local model composing 400 tokens can take minutes.
const CHAT_TIMEOUT_MS = 240000;

function abortMessageFor(url: string): string {
  if (mixedContentRisk(url)) return `No response - the browser likely blocked the plain-http request. ${MIXED_CONTENT_HELP}`;
  return 'The model did not answer within 4 minutes. Check that the server is up and the model is loaded.';
}

export function loadAiSettings(): AiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(AI_SETTINGS_KEY) as string);
    if (!parsed || typeof parsed !== 'object') return defaults();
    const provider: AiProvider = ['off', 'ollama', 'compat', 'openai', 'anthropic', 'gemini'].includes(parsed.provider)
      ? parsed.provider : 'off';
    return {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
      ollamaUrl: typeof parsed.ollamaUrl === 'string' && parsed.ollamaUrl ? parsed.ollamaUrl : DEFAULT_OLLAMA_URL,
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : ''
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
  if (settings.provider === 'compat') return Boolean(settings.baseUrl);
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
  const detail = String(body?.error?.message || body?.error || body?.detail || body?.message || '');
  if (provider === 'ollama') {
    // Ollama has no API keys; its 403 means the browser's Origin was refused, and a
    // 404/405 usually means the URL points at a web UI instead of the Ollama API.
    if (status === 403) {
      return new Error(
        `Ollama refused this site. On the Ollama machine set OLLAMA_ORIGINS=${window.location.origin} ` +
        '(or OLLAMA_ORIGINS=*) and restart Ollama, then try again.'
      );
    }
    if (status === 404 && /model/i.test(detail)) {
      return new Error(`Ollama does not have that model${detail ? ` (${detail.slice(0, 120)})` : ''}. Check the model name in Settings or pull it with: ollama pull <name>`);
    }
    if (status === 404 || status === 405) {
      return new Error(
        'That server answered, but it is not the Ollama chat API. Web UIs such as Open WebUI usually listen ' +
        'on port 8080, while the Ollama API itself listens on port 11434. Point the URL at the Ollama port, ' +
        'or switch the provider to OpenAI-compatible for a web UI or LM Studio style server.'
      );
    }
  }
  if (status === 401 || status === 403) return new Error(`${PROVIDER_LABEL[provider]} rejected the API key. Check it in Settings.`);
  if (status === 404) return new Error(`${PROVIDER_LABEL[provider]} does not know that model. Check the model name in Settings.`);
  if (status === 429) return new Error(`${PROVIDER_LABEL[provider]} rate limit hit. Wait a moment and try again.`);
  return new Error(`${PROVIDER_LABEL[provider]} request failed (${status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
}

async function chatOllama(settings: AiSettings, system: string, user: string): Promise<string> {
  const base = settings.ollamaUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetchWithTimeout(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelFor(settings),
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    }, CHAT_TIMEOUT_MS, abortMessageFor(base));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('No response')) throw error;
    if (error instanceof Error && error.message.startsWith('The model did not answer')) throw error;
    if (mixedContentRisk(base)) throw new Error(`The browser blocked the plain-http request to ${base}. ${MIXED_CONTENT_HELP}`);
    throw new Error(
      `Could not reach Ollama at ${base}. Is it running, is OLLAMA_HOST set so it listens beyond localhost, ` +
      `and is OLLAMA_ORIGINS set to this site (for example OLLAMA_ORIGINS=${window.location.origin})?`
    );
  }
  const body = await readBody(response);
  if (!response.ok) throw providerError('ollama', response.status, body);
  const text = body?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Ollama returned an empty reply.');
  return text.trim();
}

// Any local server speaking the OpenAI chat protocol: LM Studio, vLLM, llama.cpp's
// llama-server, or Open WebUI (which fronts Ollama and issues its own API keys).
async function chatCompat(settings: AiSettings, system: string, user: string): Promise<string> {
  const base = settings.baseUrl.replace(/\/+$/, '');
  const model = modelFor(settings);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {})
      },
      body: JSON.stringify({
        ...(model ? { model } : {}),
        max_tokens: 400,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    }, CHAT_TIMEOUT_MS, abortMessageFor(base));
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith('No response') || error.message.startsWith('The model did not answer'))) throw error;
    if (mixedContentRisk(base)) throw new Error(`The browser blocked the plain-http request to ${base}. ${MIXED_CONTENT_HELP}`);
    throw new Error(`Could not reach the server at ${base}. Is it running, and does it allow requests from this site?`);
  }
  const body = await readBody(response);
  if (!response.ok) throw providerError('compat', response.status, body);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw new Error('The server returned an empty reply.');
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
    case 'compat': return chatCompat(settings, system, user);
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
