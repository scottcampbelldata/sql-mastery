export const ANCHOR_MS = Date.UTC(2020, 0, 1);
export const DATASET_END_MS = Date.UTC(2022, 0, 1);

export function addDays(ms: number, days: number): number {
  return ms + days * 86400000;
}

export function addSeconds(ms: number, secs: number): number {
  return ms + secs * 1000;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const date = pad(d.getUTCDate());
  const hours = pad(d.getUTCHours());
  const minutes = pad(d.getUTCMinutes());
  const seconds = pad(d.getUTCSeconds());
  return `${year}-${month}-${date} ${hours}:${minutes}:${seconds}`;
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const month = pad(d.getUTCMonth() + 1);
  const date = pad(d.getUTCDate());
  return `${year}-${month}-${date}`;
}

// Inverse of formatTimestamp: parses a naive "YYYY-MM-DD HH:MM:SS" string back to the integer ms
// it was formatted from. Pure field extraction plus Date.UTC (not "new Date()"), so this stays
// TZ-independent like the rest of this file. Added for the Rove mess layer (task 11), which needs
// to shift an already-formatted event_ts/authorized_at string by a bounded number of seconds
// (clock-skew, retried-payment offsets) without introducing a second, ad hoc parsing convention
// outside this file.
export function parseTimestamp(s: string): number {
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  const hour = Number(s.slice(11, 13));
  const minute = Number(s.slice(14, 16));
  const second = Number(s.slice(17, 19));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}
