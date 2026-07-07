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
