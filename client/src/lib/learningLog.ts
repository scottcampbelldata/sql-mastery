// Private, local learning telemetry. Records timing, attempts, mistakes, hints, and
// resets per exercise so you can see where you struggle and export it (or feed it to an
// AI) for feedback. Stored only in this browser (localStorage), capped, never sent
// anywhere unless you export it.

const LOG_KEY = 'sqlm:log:v1';
const MAX_EVENTS = 2000;

export type LogEventType = 'start' | 'attempt' | 'hint' | 'reset' | 'complete' | 'coach' | 'gauntlet';

export interface LogEvent {
  t: number; // epoch ms
  type: LogEventType;
  exerciseId: string;
  skill?: string;
  title?: string;
  tier?: string;
  outcome?: 'correct' | 'incorrect' | 'error';
  misconception?: string; // coach label, when a wrong answer was diagnosed
  durationMs?: number; // on 'complete' and 'gauntlet'
  attempts?: number; // on 'complete'
  score?: number; // on 'gauntlet'
  total?: number; // on 'gauntlet'
}

function read(): LogEvent[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(events: LogEvent[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // localStorage full or unavailable; telemetry is best-effort.
  }
}

export function logEvent(event: Omit<LogEvent, 't'> & { t?: number }): void {
  const events = read();
  events.push({ ...event, t: typeof event.t === 'number' ? event.t : Date.now() });
  write(events);
}

export function getLog(): LogEvent[] {
  return read();
}

export function clearLog(): void {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

export interface SkillStruggle {
  skill: string;
  title: string;
  attempts: number;
  wrong: number;
  completes: number;
  avgDurationMs: number;
  hints: number;
  resets: number;
  misconceptions: Record<string, number>;
  struggleScore: number;
}

export interface LogSummary {
  exercisesCompleted: number;
  totalAttempts: number;
  bySkill: SkillStruggle[]; // worst struggle first
  topMisconceptions: { label: string; count: number }[];
  text: string;
}

function humanize(skill: string): string {
  return skill.replace(/^(ap|sl|rv)-/, '').replace(/-/g, ' ');
}

function fmtMinutes(ms: number): string {
  if (!ms) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  return m + 'm ' + (s % 60) + 's';
}

export function summarizeLog(events: LogEvent[] = read()): LogSummary {
  const bySkill = new Map<string, SkillStruggle>();
  const ensure = (skill: string, title?: string): SkillStruggle => {
    let row = bySkill.get(skill);
    if (!row) {
      row = { skill, title: title || humanize(skill), attempts: 0, wrong: 0, completes: 0, avgDurationMs: 0, hints: 0, resets: 0, misconceptions: {}, struggleScore: 0 };
      bySkill.set(skill, row);
    }
    if (title && row.title === humanize(skill)) row.title = title;
    return row;
  };

  const durations = new Map<string, number[]>();
  let totalAttempts = 0;
  let exercisesCompleted = 0;
  const allMisconceptions: Record<string, number> = {};

  for (const e of events) {
    if (!e.skill) continue;
    const row = ensure(e.skill, e.title);
    if (e.type === 'attempt') {
      row.attempts += 1;
      totalAttempts += 1;
      if (e.outcome === 'incorrect' || e.outcome === 'error') {
        row.wrong += 1;
        if (e.misconception) {
          row.misconceptions[e.misconception] = (row.misconceptions[e.misconception] || 0) + 1;
          allMisconceptions[e.misconception] = (allMisconceptions[e.misconception] || 0) + 1;
        }
      }
    } else if (e.type === 'hint') {
      row.hints += 1;
    } else if (e.type === 'reset') {
      row.resets += 1;
    } else if (e.type === 'complete') {
      row.completes += 1;
      exercisesCompleted += 1;
      if (typeof e.durationMs === 'number') {
        const arr = durations.get(e.skill) || [];
        arr.push(e.durationMs);
        durations.set(e.skill, arr);
      }
    }
  }

  const rows = Array.from(bySkill.values());
  for (const row of rows) {
    const arr = durations.get(row.skill) || [];
    row.avgDurationMs = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    // Struggle: wrong answers weigh most, then hint/reset leans, then slowness.
    row.struggleScore = row.wrong * 2 + row.hints + row.resets + row.avgDurationMs / 60000;
  }
  rows.sort((a, b) => b.struggleScore - a.struggleScore);

  const topMisconceptions = Object.entries(allMisconceptions)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const worst = rows.filter((r) => r.struggleScore > 0).slice(0, 3);
  const lines: string[] = [];
  lines.push(`You have completed ${exercisesCompleted} exercise(s) across ${totalAttempts} attempt(s).`);
  if (worst.length) {
    lines.push('Where you struggled most: ' + worst.map((r) => `${r.title} (${r.wrong} wrong, avg ${fmtMinutes(r.avgDurationMs)})`).join('; ') + '.');
  }
  if (topMisconceptions.length) {
    lines.push('Most common misconceptions: ' + topMisconceptions.map((m) => `${m.label} (${m.count}x)`).join('; ') + '.');
  }
  if (!worst.length && !topMisconceptions.length) {
    lines.push('No struggles recorded yet. Do a few lessons and check back.');
  }

  return { exercisesCompleted, totalAttempts, bySkill: rows, topMisconceptions, text: lines.join(' ') };
}
