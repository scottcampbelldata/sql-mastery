import { safeGet, safeSet } from './progress';
import { api } from './api';

// Cross-device progress sync. Progress lives in localStorage; once signed in, we mirror
// the *progress* keys (not device prefs) to the account under the auth token, and merge
// on load so every device converges. Progress is monotonic, so we union-merge (never
// delete) and can't lose completed work.

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
  'sqlm:runner:db'
]);

// A lesson checkbox: sqlm:<page>:<id> = '1'. Everything under sqlm: that isn't a known
// JSON blob or a device pref, and holds '1', is a checkbox.
function isCheckboxKey(key: string): boolean {
  return key.startsWith('sqlm:') && !SYNCED_JSON.has(key) && !NEVER_SYNC.has(key) && safeGet(key) === '1';
}

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

// Drop null entries so a merged/collected snapshot can be sent over the wire.
function toSyncPayload(values: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value != null) out[key] = value;
  return out;
}

// Pull the account's progress, merge into local, push the union back. Monotonic:
// never deletes. Returns whether local changed.
export async function syncNow(): Promise<boolean> {
  const local = collectProgress();
  let remote: Record<string, string> = {};
  try {
    const rec = await api.getProgress();
    remote = (rec && rec.data) || {};
  } catch {
    return false;
  }
  const merged = mergeProgress(local, remote);
  const changed = applyMerged(merged);
  try { await api.putProgress(toSyncPayload(merged)); } catch { /* best effort */ }
  lastPushedHash = stableHash(merged);
  return changed;
}

export async function pushIfChanged(): Promise<void> {
  const snap = collectProgress();
  const h = stableHash(snap);
  if (h === lastPushedHash) return;
  try { await api.putProgress(toSyncPayload(snap)); lastPushedHash = h; } catch { /* best effort */ }
}
