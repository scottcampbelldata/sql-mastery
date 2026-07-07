import type { Prng } from './prng';

export function intBetween(rng: Prng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function floatBetween(rng: Prng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

export function pick<T>(rng: Prng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedPick<T>(rng: Prng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let draw = rng() * total;
  for (const [value, weight] of items) {
    draw -= weight;
    if (draw < 0) return value;
  }
  return items[items.length - 1][0];
}

export function bernoulli(rng: Prng, p: number): boolean {
  return rng() < p;
}

export function gaussian(rng: Prng, mean: number, sd: number): number {
  const u1 = 1 - rng();
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * sd;
}

export function shuffle<T>(rng: Prng, arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = intBetween(rng, 0, i);
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

export function sampleWithout<T>(rng: Prng, arr: readonly T[], k: number): T[] {
  return shuffle(rng, arr).slice(0, k);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
