import { useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Button, Callout } from '../components/ui';
import { GoogleSignIn } from '../components/GoogleSignIn';
import { useAuth } from '../state/AuthContext';
import { syncNow } from '../lib/sync';
import { getLog, summarizeLog, clearLog } from '../lib/learningLog';
import {
  loadAiSettings, saveAiSettings, coachConfigured, testCoachConnection,
  DEFAULT_MODEL, DEFAULT_OLLAMA_URL, PROVIDER_LABEL, type AiSettings, type AiProvider
} from '../lib/aiCoach';
import './settings.css';

const SIGNIN_CONFIGURED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
const PROVIDERS: AiProvider[] = ['off', 'ollama', 'openai', 'anthropic', 'gemini'];

function AccountCard() {
  const { user, signOut } = useAuth();
  const [syncState, setSyncState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  async function runSync() {
    setSyncState('busy');
    try {
      await syncNow();
      setSyncState('done');
    } catch {
      setSyncState('failed');
    }
  }

  return (
    <section className="set-card">
      <h2>Account</h2>
      {user ? (
        <>
          <p className="set-lead">
            Signed in as <b>{user.name || user.email}</b>. Your lesson progress, checkpoint and gauntlet
            results, and learning log sync to your account, so any signed-in browser picks up where you left off.
          </p>
          <div className="set-row">
            <Button variant="primary" onClick={runSync} disabled={syncState === 'busy'}>
              {syncState === 'busy' ? 'Syncing...' : 'Sync now'}
            </Button>
            <Button onClick={signOut}>Sign out</Button>
            {syncState === 'done' ? <span className="set-ok">Synced.</span> : null}
            {syncState === 'failed' ? <span className="set-warn">Sync failed. Check your connection and try again.</span> : null}
          </div>
        </>
      ) : SIGNIN_CONFIGURED ? (
        <>
          <p className="set-lead">
            Sign in with Google to save your progress across devices. Progress on this browser merges with
            your account the moment you sign in - nothing is lost in either direction.
          </p>
          <GoogleSignIn />
        </>
      ) : (
        <p className="set-lead">
          Google sign-in is not configured on this deployment yet. Your progress still saves in this browser;
          cross-device sync switches on once sign-in is set up.
        </p>
      )}
    </section>
  );
}

function CoachCard() {
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<{ state: 'idle' | 'busy' | 'ok' | 'failed'; detail: string }>({ state: 'idle', detail: '' });
  const configured = useMemo(() => coachConfigured(settings), [settings]);

  function patch(next: Partial<AiSettings>) {
    setSettings((current) => ({ ...current, ...next }));
    setSaved(false);
    setTest({ state: 'idle', detail: '' });
  }

  function save() {
    saveAiSettings(settings);
    setSaved(true);
  }

  async function runTest() {
    saveAiSettings(settings);
    setSaved(true);
    setTest({ state: 'busy', detail: '' });
    try {
      const reply = await testCoachConnection(settings);
      setTest({ state: 'ok', detail: reply });
    } catch (error) {
      setTest({ state: 'failed', detail: (error as Error).message });
    }
  }

  const needsKey = settings.provider === 'openai' || settings.provider === 'anthropic' || settings.provider === 'gemini';
  const modelPlaceholder = settings.provider === 'off' ? '' : DEFAULT_MODEL[settings.provider];

  return (
    <section className="set-card">
      <h2>AI coach</h2>
      <p className="set-lead">
        When an answer comes back wrong, the coach reads your SQL, the task, and the checker's diff, then
        nudges you toward the fix without giving the answer away. Bring your own model: a local Ollama, or
        your own API key for OpenAI, Anthropic, or Google Gemini.
      </p>
      <div className="set-field">
        <label htmlFor="ai-provider">Provider</label>
        <select id="ai-provider" value={settings.provider}
          onChange={(e) => patch({ provider: e.target.value as AiProvider })}>
          {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>)}
        </select>
      </div>
      {settings.provider === 'ollama' ? (
        <div className="set-field">
          <label htmlFor="ai-ollama">Ollama URL</label>
          <input id="ai-ollama" type="text" value={settings.ollamaUrl} placeholder={DEFAULT_OLLAMA_URL}
            onChange={(e) => patch({ ollamaUrl: e.target.value })} autoComplete="off" spellCheck={false} />
          <p className="set-hint">
            Ollama runs on your machine. If you are using this site from the web (not localhost), start
            Ollama with OLLAMA_ORIGINS set to this site's origin so your browser may call it.
          </p>
        </div>
      ) : null}
      {needsKey ? (
        <div className="set-field">
          <label htmlFor="ai-key">API key</label>
          <input id="ai-key" type="password" value={settings.apiKey} placeholder="Paste your key"
            onChange={(e) => patch({ apiKey: e.target.value })} autoComplete="off" spellCheck={false} />
        </div>
      ) : null}
      {settings.provider !== 'off' ? (
        <div className="set-field">
          <label htmlFor="ai-model">Model</label>
          <input id="ai-model" type="text" value={settings.model} placeholder={`${modelPlaceholder} (default)`}
            onChange={(e) => patch({ model: e.target.value })} autoComplete="off" spellCheck={false} />
        </div>
      ) : null}
      <div className="set-row">
        <Button variant="primary" onClick={save}>Save</Button>
        {settings.provider !== 'off' ? (
          <Button onClick={runTest} disabled={!configured || test.state === 'busy'}>
            {test.state === 'busy' ? 'Testing...' : 'Test connection'}
          </Button>
        ) : null}
        {saved && test.state === 'idle' ? <span className="set-ok">Saved.</span> : null}
        {test.state === 'ok' ? <span className="set-ok">Connected. Reply: {test.detail}</span> : null}
      </div>
      {test.state === 'failed' ? <Callout tone="caution" title="Connection failed">{test.detail}</Callout> : null}
      <p className="set-privacy">
        Your key is stored only in this browser and sent only to {settings.provider === 'off' ? 'the provider you pick' : PROVIDER_LABEL[settings.provider]} directly.
        It never touches the SQL Mastery server and is never synced to other devices.
      </p>
    </section>
  );
}

function DataCard() {
  const [cleared, setCleared] = useState(false);

  function download() {
    const summary = summarizeLog();
    const payload = {
      generatedAt: Date.now(),
      summary: summary.text,
      bySkill: summary.bySkill,
      topMisconceptions: summary.topMisconceptions,
      events: getLog()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'sql-mastery-learning-log.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function clear() {
    if (!window.confirm('Clear the learning log on this browser? Progress and unlocks are not affected.')) return;
    clearLog();
    setCleared(true);
  }

  return (
    <section className="set-card">
      <h2>Your data</h2>
      <p className="set-lead">
        The learning log records what you practice, how long each task takes, and your common mistakes.
        Export it to feed an AI, or clear it to start the record fresh.
      </p>
      <div className="set-row">
        <Button variant="primary" onClick={download}>Download log (JSON)</Button>
        <Button onClick={clear}>Clear log</Button>
        {cleared ? <span className="set-ok">Cleared.</span> : null}
      </div>
    </section>
  );
}

export default function Settings() {
  return (
    <AppShell breadcrumb={<span className="here">Settings</span>}>
      <div className="settings">
        <header className="set-head">
          <h1>Settings</h1>
          <p className="set-sub">Account and sync, your AI coach, and your data.</p>
        </header>
        <AccountCard />
        <CoachCard />
        <DataCard />
      </div>
    </AppShell>
  );
}
