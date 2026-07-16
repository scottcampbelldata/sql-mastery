import { safeGet, safeSet } from './progress';
import { api } from './api';

// Only these keys ever leave the browser. AI-coach settings (sqlm:ai:v1, which can hold a
// provider API key) and the auth token are deliberately NOT here.
const SYNCED_JSON = new Set([
  'sqlm:learning:v1',
  'sqlm:log:v1'
]);

// The learning log grows without bound locally; cap what syncs so the payload stays well
// under the server's write limit while still carrying enough history for analysis.
const LOG_KEY = 'sqlm:log:v1';
const SYNCED_LOG_EVENTS = 1200;

function trimForSync(key: string, value: string | null): string | null {
  if (key !== LOG_KEY || value == null) return value;
  try {
    const events = JSON.parse(value);
    if (!Array.isArray(events) || events.length <= SYNCED_LOG_EVENTS) return value;
    return JSON.stringify(events.slice(-SYNCED_LOG_EVENTS));
  } catch {
    return value;
  }
}

export function collectProgress(): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && SYNCED_JSON.has(key)) out[key] = trimForSync(key, safeGet(key));
  }
  return out;
}

export function deepMerge(a: any, b: any): any {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (typeof a === 'number' && typeof b === 'number') return Math.max(a, b);
  if (Array.isArray(a) && Array.isArray(b)) {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of [...a, ...b]) {
      const id = typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (!seen.has(id)) {
        seen.add(id);
        out.push(item);
      }
    }
    return out;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const out: Record<string, any> = { ...a };
    for (const key of Object.keys(b)) out[key] = key in a ? deepMerge(a[key], b[key]) : b[key];
    return out;
  }
  return b;
}

const LEARNING_KEY = 'sqlm:learning:v1';
const RESET_SCOPED_FIELDS = ['skillCorrect', 'reviewsPassed', 'lastPracticedSession'] as const;

// The learning state needs one rule the generic union merge cannot express: a lesson reset.
// Each reset bumps skillResets[skill]; when the epochs differ, the side with the higher
// epoch wins that skill's progress wholesale (typically: none, right after the reset), so
// the reset propagates instead of being resurrected by the union. Equal epochs merge
// loss-free exactly as before.
export function mergeLearningState(a: any, b: any): any {
  const merged = deepMerge(a, b);
  const skills = new Set([...Object.keys(a?.skillResets || {}), ...Object.keys(b?.skillResets || {})]);
  if (!skills.size) return merged;
  merged.skillResets = { ...(merged.skillResets || {}) };
  for (const skill of skills) {
    const epochA = (a?.skillResets || {})[skill] || 0;
    const epochB = (b?.skillResets || {})[skill] || 0;
    merged.skillResets[skill] = Math.max(epochA, epochB);
    if (epochA === epochB) continue;
    const winner = epochA > epochB ? a : b;
    for (const field of RESET_SCOPED_FIELDS) {
      if (!merged[field]) continue;
      const kept = winner?.[field]?.[skill];
      if (kept === undefined) delete merged[field][skill];
      else merged[field][skill] = kept;
    }
  }
  return merged;
}

function mergeValue(key: string, local: string | null, remote: string | null): string | null {
  if (local == null) return remote;
  if (remote == null) return local;
  if (local === remote) return local;
  if (SYNCED_JSON.has(key)) {
    try {
      const merge = key === LEARNING_KEY ? mergeLearningState : deepMerge;
      return JSON.stringify(merge(JSON.parse(local), JSON.parse(remote)));
    } catch {
      return local;
    }
  }
  return local;
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
    if (value != null && safeGet(key) !== value) {
      safeSet(key, value);
      changed = true;
    }
  }
  // Tell live views the stored state moved under them, so a pulled sync shows up without
  // a manual reload (FoundationsContext re-reads on this event).
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('sqlm:learning-updated'));
  }
  return changed;
}

function stableHash(obj: Record<string, string | null>): string {
  const s = Object.keys(obj).sort().map((key) => `${key}=${obj[key]}`).join('\n');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

let lastPushedHash: string | null = null;

function toSyncPayload(values: Record<string, string | null>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value != null) out[key] = value;
  return out;
}

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
  try {
    await api.putProgress(toSyncPayload(merged));
  } catch {
    // Best effort.
  }
  lastPushedHash = stableHash(merged);
  return changed;
}

export async function pushIfChanged(): Promise<void> {
  const snap = collectProgress();
  const h = stableHash(snap);
  if (h === lastPushedHash) return;
  try {
    await api.putProgress(toSyncPayload(snap));
    lastPushedHash = h;
  } catch {
    // Best effort.
  }
}
