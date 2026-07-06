import { safeGet, safeSet } from './progress';

// Cross-device progress sync. Progress lives in localStorage; when a sync code is set
// we mirror the *progress* keys (not device prefs) to the backend under that code, and
// merge on load so every device converges. Progress is monotonic, so we union-merge
// (never delete) and can't lose completed work.

export const SYNC_CODE_KEY = 'sqlm:sync-code:v1';
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

// Structured JSON progress blobs (deep-merged).
const SYNCED_JSON = new Set([
  'sqlm:product-progress:v1',
  'sqlm:foundations:v1',
  'sqlm:learning:v1'
]);
// sqlm: keys that are device preferences / drafts, never synced.
const NEVER_SYNC = new Set([
  'sqlm:theme:v1',
  'sqlm:sidebar-collapsed:v1',
  'sqlm:welcome-dismissed:v1',
  'sqlm:product-active-session:v1',
  'sqlm:runner:sql',
  'sqlm:runner:db',
  SYNC_CODE_KEY
]);

// A lesson checkbox: sqlm:<page>:<id> = '1'. Everything under sqlm: that isn't a known
// JSON blob or a device pref, and holds '1', is a checkbox.
function isCheckboxKey(key: string): boolean {
  return key.startsWith('sqlm:') && !SYNCED_JSON.has(key) && !NEVER_SYNC.has(key) && safeGet(key) === '1';
}

export function getSyncCode(): string { return safeGet(SYNC_CODE_KEY) || ''; }
export function setSyncCodeValue(code: string): void { safeSet(SYNC_CODE_KEY, code); }
export function clearSyncCode(): void { try { localStorage.removeItem(SYNC_CODE_KEY); } catch { /* ignore */ } }

// Gather all synced progress keys into { key: rawStringValue }.
export function collectProgress(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (SYNCED_JSON.has(key) || isCheckboxKey(key)) out[key] = safeGet(key);
  }
  return out;
}

// Monotonic deep merge: numbers -> max, arrays -> union, objects -> recurse,
// other scalars -> prefer remote (timestamps/last SQL are non-critical).
export function deepMerge(a: any, b: any): any {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of [...a, ...b]) {
      const id = typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (!seen.has(id)) { seen.add(id); out.push(item); }
    }
    return out;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, any> = { ...a };
    for (const key of Object.keys(b)) out[key] = (key in a) ? deepMerge(a[key], b[key]) : b[key];
    return out;
  }
  return b;
}

function mergeValue(key: string, local: string | null, remote: string | null): string | null {
  if (local == null) return remote;
  if (remote == null) return local;
  if (local === remote) return local;
  if (SYNCED_JSON.has(key)) {
    try { return JSON.stringify(deepMerge(JSON.parse(local), JSON.parse(remote))); }
    catch { return local; }
  }
  return (local === '1' || remote === '1') ? '1' : local; // checkbox union
}

export function mergeProgress(local: Record<string, string | null>, remote: Record<string, string | null>): Record<string, string | null> {
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(remote || {})]);
  const out: Record<string, string | null> = {};
  for (const key of keys) out[key] = mergeValue(key, (local || {})[key] ?? null, (remote || {})[key] ?? null);
  return out;
}

function applyMerged(merged: Record<string, string | null>): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(merged)) {
    if (value != null && safeGet(key) !== value) { safeSet(key, value); changed = true; }
  }
  return changed;
}

function stableHash(obj: Record<string, string | null>): string {
  const s = Object.keys(obj).sort().map((k) => `${k}=${obj[k]}`).join('\n');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

let lastPushedHash: string | null = null;

async function apiGet(code: string): Promise<any> {
  const r = await fetch(`${API_BASE}/api/progress?code=${encodeURIComponent(code)}`);
  if (!r.ok) throw new Error('sync get failed');
  return r.json();
}
async function apiPut(code: string, data: Record<string, string | null>): Promise<any> {
  const r = await fetch(`${API_BASE}/api/progress`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, data })
  });
  if (!r.ok) throw new Error('sync put failed');
  return r.json();
}

// Pull remote, merge into local, push the union back. Returns whether local changed.
export async function pullMergePush(code: string): Promise<boolean> {
  const local = collectProgress();
  let remote: Record<string, string | null> = {};
  try {
    const rec = await apiGet(code);
    remote = (rec && rec.data) || {};
  } catch {
    return false; // offline / server down: keep working locally
  }
  const merged = mergeProgress(local, remote);
  const changed = applyMerged(merged);
  try { await apiPut(code, merged); } catch { /* best effort */ }
  lastPushedHash = stableHash(merged);
  return changed;
}

export async function pushIfChanged(code: string): Promise<void> {
  const snap = collectProgress();
  const h = stableHash(snap);
  if (h === lastPushedHash) return;
  try { await apiPut(code, snap); lastPushedHash = h; } catch { /* best effort */ }
}

// Turn on sync with a code (called from the UI). Merges, then reloads so every
// context re-reads the merged progress.
export async function enableSync(code: string): Promise<void> {
  setSyncCodeValue(code);
  await pullMergePush(code);
  window.location.reload();
}

// Called once at startup. If a code is set, converge, then keep pushing in the background.
export async function startSync(): Promise<void> {
  const code = getSyncCode();
  if (!code) return;
  const changed = await pullMergePush(code);
  if (changed && !sessionStorage.getItem('sqlm:sync-applied')) {
    try { sessionStorage.setItem('sqlm:sync-applied', '1'); } catch { /* ignore */ }
    window.location.reload();
    return;
  }
  setInterval(() => pushIfChanged(code), 15000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pushIfChanged(code); });
  window.addEventListener('pagehide', () => pushIfChanged(code));
}
