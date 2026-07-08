import fs from 'fs';
import path from 'path';

import type { DatasetModule, TableSpec } from '../framework/types';

type Row = Record<string, unknown>;

export const DB_NAME = 'aperture';
export const SCHEMA_FILE = path.join(process.cwd(), 'datasets', 'schema', 'aperture.sql');
// Kept for DatasetModule interface compatibility (seed-runner.ts records it in seed_meta) but the
// data below is real and committed, not generated from a PRNG stream, so this value is unused by
// generate().
export const SEED = 0x41504552;
export const VERSION = 'aperture-2';

export const TABLES: TableSpec[] = [
  {
    name: 'facility',
    columns: ['facility_id', 'name'],
  },
  {
    name: 'stars',
    columns: [
      'star_id',
      'star_name',
      'spectral_type',
      'temperature_k',
      'mass_solar',
      'radius_solar',
      'distance_ly',
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
      'facility_id',
      'in_habitable_zone',
    ],
  },
];

const SOURCE_CSV = path.join(process.cwd(), 'datasets', 'aperture-source.csv');
const PLANETLESS_STARS_CSV = path.join(process.cwd(), 'datasets', 'aperture-planetless-stars.csv');

const PARSECS_TO_LIGHT_YEARS = 3.26156;

// -------------------------------------------------------------------------------------------
// A small, dependency-free CSV parser. Handles double-quoted fields (so a field value may
// contain a literal comma or a literal double quote written as ""), and treats an empty
// (unquoted) field as a missing value. None of the committed source files use embedded
// newlines inside a quoted field, so a line-by-line split is safe here.
// -------------------------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);

  return fields;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    const record: Record<string, string> = {};
    header.forEach((col, idx) => {
      record[col] = fields[idx] ?? '';
    });
    records.push(record);
  }

  return records;
}

function readCsv(absPath: string): Record<string, string>[] {
  return parseCsv(fs.readFileSync(absPath, 'utf8'));
}

function stringOrNull(v: string | undefined): string | null {
  if (v === undefined || v.trim() === '') return null;
  return v;
}

function numberOrNull(v: string | undefined): number | null {
  const s = stringOrNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: string | undefined): number | null {
  const n = numberOrNull(v);
  return n === null ? null : Math.round(n);
}

function roundTo(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

// Derives an OBAFGKM spectral class from an effective temperature in Kelvin. Boundaries are
// inclusive on the lower edge of each band (matches the checks in scripts/verify-datasets.ts).
function spectralTypeFromTemp(teffK: number): string {
  if (teffK >= 30000) return 'O';
  if (teffK >= 10000) return 'B';
  if (teffK >= 7500) return 'A';
  if (teffK >= 6000) return 'F';
  if (teffK >= 5200) return 'G';
  if (teffK >= 3700) return 'K';
  return 'M';
}

// Derives planet_type from radius when available (transit-derived), falling back to mass
// (radial-velocity-only detections) when radius is missing.
function planetTypeFor(radiusEarth: number | null, massEarth: number | null): string {
  if (radiusEarth !== null) {
    if (radiusEarth < 1.25) return 'Terrestrial';
    if (radiusEarth < 2.0) return 'Super-Earth';
    if (radiusEarth < 6.0) return 'Neptune-like';
    return 'Gas Giant';
  }

  const mass = massEarth ?? 0;
  if (mass < 2) return 'Terrestrial';
  if (mass < 10) return 'Super-Earth';
  if (mass < 50) return 'Neptune-like';
  return 'Gas Giant';
}

function buildFacilities(sourceRows: Record<string, string>[]): Row[] {
  const names = Array.from(new Set(sourceRows.map((r) => r.disc_facility))).sort((a, b) =>
    a.localeCompare(b)
  );

  return names.map((name, idx) => ({
    facility_id: idx + 1,
    name,
  }));
}

interface StarBuild {
  stars: Row[];
  hostToStarId: Map<string, number>;
}

function buildStars(sourceRows: Record<string, string>[], planetlessRows: Record<string, string>[]): StarBuild {
  // Dedup source rows by hostname, keeping the first occurrence encountered in source order.
  const firstRowByHost = new Map<string, Record<string, string>>();
  for (const row of sourceRows) {
    if (!firstRowByHost.has(row.hostname)) {
      firstRowByHost.set(row.hostname, row);
    }
  }

  const hostnames = Array.from(firstRowByHost.keys()).sort((a, b) => a.localeCompare(b));

  const stars: Row[] = [];
  const hostToStarId = new Map<string, number>();
  let nextStarId = 1;

  for (const hostname of hostnames) {
    const row = firstRowByHost.get(hostname)!;
    const teff = numberOrNull(row.st_teff);
    if (teff === null) {
      throw new Error(`aperture: host "${hostname}" is missing st_teff, cannot derive spectral_type`);
    }
    const sy_dist = numberOrNull(row.sy_dist);
    if (sy_dist === null) {
      throw new Error(`aperture: host "${hostname}" is missing sy_dist, cannot derive distance_ly`);
    }

    const star_id = nextStarId;
    nextStarId += 1;
    hostToStarId.set(hostname, star_id);

    stars.push({
      star_id,
      star_name: hostname,
      spectral_type: spectralTypeFromTemp(teff),
      temperature_k: Math.round(teff),
      mass_solar: numberOrNull(row.st_mass),
      radius_solar: numberOrNull(row.st_rad),
      distance_ly: roundTo(sy_dist * PARSECS_TO_LIGHT_YEARS, 2),
    });
  }

  for (const row of planetlessRows) {
    const star_id = nextStarId;
    nextStarId += 1;

    stars.push({
      star_id,
      star_name: row.star_name,
      spectral_type: row.spectral_type,
      temperature_k: Math.round(Number(row.temperature_k)),
      mass_solar: numberOrNull(row.mass_solar),
      radius_solar: numberOrNull(row.radius_solar),
      distance_ly: Number(row.distance_ly),
    });
  }

  return { stars, hostToStarId };
}

function buildPlanets(
  sourceRows: Record<string, string>[],
  hostToStarId: Map<string, number>,
  facilityNameToId: Map<string, number>
): Row[] {
  const planets: Row[] = [];

  sourceRows.forEach((row, idx) => {
    const star_id = hostToStarId.get(row.hostname);
    if (star_id === undefined) {
      throw new Error(`aperture: planet "${row.pl_name}" references unknown hostname "${row.hostname}"`);
    }

    const facility_id = facilityNameToId.get(row.disc_facility);
    if (facility_id === undefined) {
      throw new Error(`aperture: planet "${row.pl_name}" references unknown disc_facility "${row.disc_facility}"`);
    }

    const orbitalPeriodDays = numberOrNull(row.pl_orbper);
    if (orbitalPeriodDays === null) {
      throw new Error(`aperture: planet "${row.pl_name}" is missing pl_orbper`);
    }

    const massEarth = numberOrNull(row.pl_bmasse);
    const radiusEarth = numberOrNull(row.pl_rade);
    const equilibriumTempK = intOrNull(row.pl_eqt);
    const inHabitableZone = equilibriumTempK !== null && equilibriumTempK >= 180 && equilibriumTempK <= 310;

    planets.push({
      planet_id: idx + 1,
      star_id,
      planet_name: row.pl_name,
      planet_type: planetTypeFor(radiusEarth, massEarth),
      mass_earth: massEarth !== null ? roundTo(massEarth, 2) : null,
      radius_earth: radiusEarth !== null ? roundTo(radiusEarth, 2) : null,
      orbital_period_days: roundTo(orbitalPeriodDays, 4),
      semi_major_axis_au: numberOrNull(row.pl_orbsmax),
      equilibrium_temp_k: equilibriumTempK,
      discovery_method: row.discoverymethod,
      discovery_year: intOrNull(row.disc_year),
      facility_id,
      in_habitable_zone: inHabitableZone,
    });
  });

  return planets;
}

export function generate(seed: number): Record<string, Row[]> {
  void seed; // unused: the data is real and committed, not derived from the seed.

  const sourceRows = readCsv(SOURCE_CSV);
  const planetlessRows = readCsv(PLANETLESS_STARS_CSV);

  const facility = buildFacilities(sourceRows);
  const facilityNameToId = new Map(facility.map((f) => [f.name as string, f.facility_id as number]));

  const { stars, hostToStarId } = buildStars(sourceRows, planetlessRows);
  const planets = buildPlanets(sourceRows, hostToStarId, facilityNameToId);

  return { facility, stars, planets };
}

const mod: DatasetModule = { DB_NAME, SCHEMA_FILE, SEED, VERSION, TABLES, generate };
export default mod;
