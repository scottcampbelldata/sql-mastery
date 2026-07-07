import path from 'path';

import type { Prng } from '../framework/prng';
import { deriveStream } from '../framework/prng';
import { intBetween, floatBetween, pick, weightedPick, bernoulli, shuffle } from '../framework/random';
import type { DatasetModule, TableSpec } from '../framework/types';
import {
  SPECTRAL_BANDS,
  SPECTRAL_TYPE_WEIGHTS,
  CONSTELLATIONS,
  STAR_CATALOG_PREFIXES,
  DISCOVERY_METHODS,
  PLANET_TYPES,
  PLANET_TYPE_BANDS,
  ROMAN_NUMERALS,
} from './pools';

type Row = Record<string, unknown>;

export const DB_NAME = 'aperture';
export const SCHEMA_FILE = path.join(process.cwd(), 'datasets', 'schema', 'aperture.sql');
export const SEED = 0x41504552;
export const VERSION = 'aperture-1';

export const TABLES: TableSpec[] = [
  {
    name: 'stars',
    columns: [
      'star_id',
      'star_name',
      'constellation',
      'spectral_type',
      'color',
      'temperature_k',
      'mass_solar',
      'radius_solar',
      'distance_ly',
      'apparent_magnitude',
      'discovery_year',
    ],
  },
  {
    name: 'planets',
    columns: [
      'planet_id',
      'star_id',
      'planet_name',
      'planet_type',
      'mass_earth',
      'radius_earth',
      'orbital_period_days',
      'semi_major_axis_au',
      'equilibrium_temp_k',
      'discovery_method',
      'discovery_year',
      'in_habitable_zone',
    ],
  },
  {
    name: 'moons',
    columns: ['moon_id', 'planet_id', 'moon_name', 'radius_km', 'orbital_period_days', 'is_confirmed'],
  },
];

// Reserved star slots (0 based, out of 60): 0..6 guarantee one star of each spectral type in
// SPECTRAL_BANDS order; 7 is the TRAPPIST-like M dwarf that hosts >= 7 planets; 8 is the
// Proxima-like nearest star (distance_ly forced to 4.2); 9..11 are forced planetless.
const TRAPPIST_IDX = 7;
const PROXIMA_IDX = 8;
const PLANETLESS_IDXS: readonly number[] = [9, 10, 11];
const STAR_COUNT = 60;
const PLANET_COUNT = 180;

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// Snaps a raw integer temperature to the nearest 25K (all SPECTRAL_BANDS boundaries are
// multiples of 25), then clamps back into the band so the snap never crosses a band edge. The
// coarser grid makes accidental cross-star temperature ties plausible without breaking the band.
function bandedTemperature(rng: Prng, range: readonly [number, number]): number {
  const raw = intBetween(rng, range[0], range[1]);
  const snapped = Math.round(raw / 25) * 25;
  return Math.min(range[1], Math.max(range[0], snapped));
}

function makeStarName(rng: Prng, used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const prefix = pick(rng, STAR_CATALOG_PREFIXES);
    const num = intBetween(rng, 1, 999);
    const name = `${prefix}-${num}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `HD-${intBetween(rng, 100000, 999999)}`;
  used.add(fallback);
  return fallback;
}

function buildStars(seed: number): Row[] {
  const rng = deriveStream(seed, 'stars');
  const usedNames = new Set<string>(['TRAPPIST-1', 'Proxima Centauri']);
  const forcedTypeOrder = SPECTRAL_BANDS.map((band) => band.type);
  const stars: Row[] = [];

  for (let i = 0; i < STAR_COUNT; i += 1) {
    let type: string;
    if (i < 7) {
      type = forcedTypeOrder[i];
    } else if (i === TRAPPIST_IDX || i === PROXIMA_IDX) {
      type = 'M';
    } else {
      type = weightedPick(rng, SPECTRAL_TYPE_WEIGHTS);
    }

    const band = SPECTRAL_BANDS.find((b) => b.type === type)!;
    const temperature_k = bandedTemperature(rng, band.tempRange);
    const mass_solar = roundTo(floatBetween(rng, band.massRange[0], band.massRange[1]), 2);
    const radius_solar = roundTo(floatBetween(rng, band.radiusRange[0], band.radiusRange[1]), 2);

    let distance_ly = roundTo(4.2 + Math.pow(rng(), 3) * (3900 - 4.2), 1);
    if (i === PROXIMA_IDX) distance_ly = 4.2;

    const apparent_magnitude = bernoulli(rng, 0.1) ? null : roundTo(floatBetween(rng, -1.44, 15), 2);

    // Naked eye visible stars (magnitude 6.5 or brighter) have no formal "discovery": they have
    // been known since antiquity, so discovery_year is a legitimate scientific NULL there.
    const discovery_year =
      apparent_magnitude !== null && apparent_magnitude <= 6.5 ? null : intBetween(rng, 1750, 2020);

    let star_name: string;
    if (i === TRAPPIST_IDX) star_name = 'TRAPPIST-1';
    else if (i === PROXIMA_IDX) star_name = 'Proxima Centauri';
    else star_name = makeStarName(rng, usedNames);

    stars.push({
      star_id: i + 1,
      star_name,
      constellation: pick(rng, CONSTELLATIONS),
      spectral_type: type,
      color: band.color,
      temperature_k,
      mass_solar,
      radius_solar,
      distance_ly,
      apparent_magnitude,
      discovery_year,
    });
  }

  // Seeded tie: two general population stars share an identical distance_ly value.
  stars[21].distance_ly = stars[20].distance_ly;

  // Seeded tie: the first two stars that share a spectral_type also share a temperature_k.
  findTie: for (let a = 1; a < stars.length; a += 1) {
    for (let b = 0; b < a; b += 1) {
      if (stars[b].spectral_type === stars[a].spectral_type && stars[b].temperature_k !== stars[a].temperature_k) {
        stars[a].temperature_k = stars[b].temperature_k;
        break findTie;
      }
    }
  }

  return stars;
}

// Distributes 180 planets across 60 stars: the TRAPPIST-like dwarf gets exactly 7, three stars
// get 0, and the remaining 56 stars start at 1 planet each with the surplus handed out by
// repeated weighted draws (capped at 6 per star) so most systems stay small.
function planetsPerStarCounts(rng: Prng): number[] {
  const counts = new Array(STAR_COUNT).fill(0) as number[];
  counts[TRAPPIST_IDX] = 7;

  const generalIdxs: number[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    if (i === TRAPPIST_IDX || PLANETLESS_IDXS.includes(i)) continue;
    generalIdxs.push(i);
    counts[i] = 1;
  }

  let remaining = PLANET_COUNT - counts[TRAPPIST_IDX] - generalIdxs.length;
  let guard = 0;
  while (remaining > 0 && guard < 100000) {
    const i = pick(rng, generalIdxs);
    if (counts[i] < 6) {
      counts[i] += 1;
      remaining -= 1;
    }
    guard += 1;
  }

  return counts;
}

function buildPlanets(seed: number, stars: Row[]): Row[] {
  const rng = deriveStream(seed, 'planets');
  const counts = planetsPerStarCounts(rng);

  const starForSlot: number[] = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    for (let k = 0; k < counts[i]; k += 1) starForSlot.push(i);
  }

  // Slot 0 is reserved for the Jupiter anchor (Imaging method, Gas Giant, exact 318 M_earth /
  // 11.2 R_earth) so the mass-radius category boundary has a real, fully visible reference row.
  // The habitable zone boundary planet is pinned to the forced G-type (Sun-like) star at index
  // 4 rather than an arbitrary slot, so its boundary distance lands near a familiar ~1 AU
  // instead of the hundreds of AU a hot O-type star's habitable zone would place it at.
  const HZ_BOUNDARY_STAR_IDX = 4;
  const hzBoundarySlot = starForSlot.indexOf(HZ_BOUNDARY_STAR_IDX);
  // DISCOVERY_METHODS is ['Transit', 'Radial Velocity', 'Imaging', 'Microlensing']; these counts
  // sum to 179 (slot 0's Imaging anchor takes the 9th Imaging slot) and land on the spec's
  // ~72/18/5/5 split: 130 Transit, 32 Radial Velocity, 9 Imaging, 9 Microlensing of 180 total.
  const methodTargetCounts: readonly number[] = [130, 32, 8, 9];
  const methodPool: string[] = [];
  DISCOVERY_METHODS.forEach((method, idx) => {
    for (let k = 0; k < methodTargetCounts[idx]; k += 1) methodPool.push(method);
  });
  const methods = ['Imaging', ...shuffle(rng, methodPool)];

  // PLANET_TYPES is ['Terrestrial', 'Super-Earth', 'Neptune-like', 'Gas Giant']; these counts sum
  // to 179 (slot 0's Gas Giant anchor takes the 27th Gas Giant slot).
  const categoryTargetCounts: readonly number[] = [54, 54, 45, 26];
  const categoryPool: string[] = [];
  PLANET_TYPES.forEach((category, idx) => {
    for (let k = 0; k < categoryTargetCounts[idx]; k += 1) categoryPool.push(category);
  });
  const categories = ['Gas Giant', ...shuffle(rng, categoryPool)];

  // Transit detections reveal radius but not mass unless a follow-up campaign confirms mass;
  // exactly 63 of the 130 Transit slots (35% of all 180 planets) are picked to stay mass-only.
  const transitSlots: number[] = [];
  methods.forEach((m, idx) => { if (m === 'Transit') transitSlots.push(idx); });
  const massNullSlots = new Set(shuffle(rng, transitSlots).slice(0, 63));

  const perStarSeen = new Array(STAR_COUNT).fill(0) as number[];
  let trappistFirstAxis = 0;
  const planets: Row[] = [];

  for (let slot = 0; slot < PLANET_COUNT; slot += 1) {
    const starIdx = starForSlot[slot];
    const star = stars[starIdx];
    const method = methods[slot];
    const category = categories[slot];
    const isAnchor = slot === 0;
    const isBoundary = slot === hzBoundarySlot;
    const localIdx = perStarSeen[starIdx];
    perStarSeen[starIdx] += 1;

    let massTrue: number;
    let radiusTrue: number;
    if (isAnchor) {
      massTrue = 318.0;
      radiusTrue = 11.2;
    } else {
      const band = PLANET_TYPE_BANDS.find((b) => b.type === category)!;
      massTrue = floatBetween(rng, band.massRange[0], band.massRange[1]);
      radiusTrue = floatBetween(rng, band.radiusRange[0], band.radiusRange[1]);
    }

    let axisAu = bernoulli(rng, 0.1) ? floatBetween(rng, 3, 20) : floatBetween(rng, 0.02, 3);

    // Seeded tie: the TRAPPIST-like dwarf's second planet reuses its first planet's semi major
    // axis, so both rows land on an identical, Kepler-consistent orbital_period_days.
    if (starIdx === TRAPPIST_IDX && localIdx === 0) trappistFirstAxis = axisAu;
    if (starIdx === TRAPPIST_IDX && localIdx === 1) axisAu = trappistFirstAxis;

    const starRadiusSolar = Number(star.radius_solar);
    const starTemperatureK = Number(star.temperature_k);
    const starMassSolar = Number(star.mass_solar);

    const luminositySolar = Math.pow(starRadiusSolar, 2) * Math.pow(starTemperatureK / 5772, 4);
    const hzInnerAu = Math.sqrt(luminositySolar / 1.1);
    const hzOuterAu = Math.sqrt(luminositySolar / 0.53);

    // Seeded edge case: one planet sits exactly on the inner habitable zone boundary.
    if (isBoundary) axisAu = hzInnerAu;
    axisAu = roundTo(axisAu, 3);

    const periodYears = Math.sqrt(Math.pow(axisAu, 3) / starMassSolar);
    const orbital_period_days = roundTo(periodYears * 365.25, 2);

    const starRadiusAu = starRadiusSolar * 0.00465047;
    const equilibriumTempRaw = starTemperatureK * Math.sqrt(starRadiusAu / (2 * axisAu));
    const equilibrium_temp_k_value = Math.round(equilibriumTempRaw);

    const in_habitable_zone = isBoundary ? true : axisAu >= hzInnerAu && axisAu <= hzOuterAu;

    const massNull = !isAnchor && massNullSlots.has(slot);
    const radiusNull = !isAnchor && method === 'Radial Velocity';
    const equilibriumNull = !isAnchor && bernoulli(rng, 0.15);

    const letter = String.fromCharCode(98 + localIdx); // 98 = 'b'
    const discovery_year = intBetween(rng, 1995, 2019);

    planets.push({
      planet_id: slot + 1,
      star_id: star.star_id,
      planet_name: `${star.star_name} ${letter}`,
      planet_type: category,
      mass_earth: massNull ? null : roundTo(massTrue, 2),
      radius_earth: radiusNull ? null : roundTo(radiusTrue, 2),
      orbital_period_days,
      semi_major_axis_au: axisAu,
      equilibrium_temp_k: equilibriumNull ? null : equilibrium_temp_k_value,
      discovery_method: method,
      discovery_year,
      in_habitable_zone,
    });
  }

  return planets;
}

function buildMoons(seed: number, planets: Row[]): Row[] {
  const rng = deriveStream(seed, 'moons');
  const totalMoons = 40;
  const numHosts = 28;

  const hostOrder = shuffle(rng, planets.map((_, idx) => idx));
  const hosts = hostOrder.slice(0, numHosts);

  const counts = new Array(numHosts).fill(1) as number[];
  let remaining = totalMoons - numHosts;
  let guard = 0;
  while (remaining > 0 && guard < 100000) {
    const h = intBetween(rng, 0, numHosts - 1);
    if (counts[h] < 3) {
      counts[h] += 1;
      remaining -= 1;
    }
    guard += 1;
  }

  const moons: Row[] = [];
  let moonId = 1;
  for (let h = 0; h < numHosts; h += 1) {
    const planet = planets[hosts[h]];
    for (let k = 0; k < counts[h]; k += 1) {
      const radius_km = bernoulli(rng, 0.3) ? null : roundTo(floatBetween(rng, 200, 5000), 1);
      const orbital_period_days = bernoulli(rng, 0.3) ? null : roundTo(floatBetween(rng, 0.3, 400), 2);
      moons.push({
        moon_id: moonId,
        planet_id: planet.planet_id,
        moon_name: `${planet.planet_name} ${ROMAN_NUMERALS[k]}`,
        radius_km,
        orbital_period_days,
        is_confirmed: bernoulli(rng, 0.85),
      });
      moonId += 1;
    }
  }

  return moons;
}

export function generate(seed: number): Record<string, Row[]> {
  const stars = buildStars(seed);
  const planets = buildPlanets(seed, stars);
  const moons = buildMoons(seed, planets);
  return { stars, planets, moons };
}

const mod: DatasetModule = { DB_NAME, SCHEMA_FILE, SEED, VERSION, TABLES, generate };
export default mod;
