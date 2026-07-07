// Curated value pools for the Aperture dataset (stars, planets, moons). Everything here is a
// plain, real-sounding value with no banned tokens; combining it via the generator's seeded
// streams is what makes the output deterministic.

export interface SpectralBand {
  type: string; // single-letter OBAFGKM class
  color: string; // 1:1 with type, used verbatim in stars.color
  tempRange: readonly [number, number]; // Kelvin
  massRange: readonly [number, number]; // solar masses
  radiusRange: readonly [number, number]; // solar radii
}

// Ordered hottest (O) to coolest (M). Ranges are contiguous and cover the DDL-wide bounds
// (temperature_k 2400..45000, mass_solar 0.08..90, radius_solar 0.10..15) exactly at the
// extremes, so no row can mix a spectral_type with an out-of-band color/temp/mass/radius.
export const SPECTRAL_BANDS: readonly SpectralBand[] = [
  { type: 'O', color: 'Blue', tempRange: [30000, 45000], massRange: [16, 90], radiusRange: [6.6, 15] },
  { type: 'B', color: 'Blue-white', tempRange: [10000, 30000], massRange: [2.1, 16], radiusRange: [1.8, 6.6] },
  { type: 'A', color: 'White', tempRange: [7500, 10000], massRange: [1.4, 2.1], radiusRange: [1.4, 1.8] },
  { type: 'F', color: 'Yellow-white', tempRange: [6000, 7500], massRange: [1.04, 1.4], radiusRange: [1.15, 1.4] },
  { type: 'G', color: 'Yellow', tempRange: [5200, 6000], massRange: [0.8, 1.04], radiusRange: [0.96, 1.15] },
  { type: 'K', color: 'Orange', tempRange: [3700, 5200], massRange: [0.45, 0.8], radiusRange: [0.7, 0.96] },
  { type: 'M', color: 'Red', tempRange: [2400, 3700], massRange: [0.08, 0.45], radiusRange: [0.1, 0.7] },
];

// Weighted pool for the general (non-forced) star population: M/K dominated, but hot types are
// deliberately over-sampled relative to real-world stellar demographics so a beginner query has
// enough O/B/A/F rows to group and filter on.
export const SPECTRAL_TYPE_WEIGHTS: readonly (readonly [string, number])[] = [
  ['M', 30],
  ['K', 25],
  ['G', 15],
  ['F', 10],
  ['A', 8],
  ['B', 7],
  ['O', 5],
];

export const CONSTELLATIONS: readonly string[] = [
  'Orion',
  'Cygnus',
  'Lyra',
  'Andromeda',
  'Cassiopeia',
  'Draco',
  'Perseus',
  'Aquila',
  'Centaurus',
  'Ursa Major',
];

// Real-astronomy-style catalog prefixes used to build unique star_name values, e.g. "Kepler-186",
// "HD-40307". A plain ASCII hyphen joins prefix and number for every prefix, so names stay
// LIKE-friendly without per-prefix formatting rules.
export const STAR_CATALOG_PREFIXES: readonly string[] = [
  'Kepler',
  'HD',
  'Gliese',
  'GJ',
  'TOI',
  'WASP',
  'HAT-P',
  'K2',
  'CoRoT',
  'TrES',
  'XO',
  'Ross',
];

export const DISCOVERY_METHODS: readonly string[] = ['Transit', 'Radial Velocity', 'Imaging', 'Microlensing'];

export const PLANET_TYPES: readonly string[] = ['Terrestrial', 'Super-Earth', 'Neptune-like', 'Gas Giant'];

export interface PlanetTypeBand {
  type: string;
  massRange: readonly [number, number]; // Earth masses
  radiusRange: readonly [number, number]; // Earth radii
}

// Non-overlapping mass/radius bands keyed to planet_type, ordered smallest to largest so
// planet_type always matches the underlying mass-radius relation. The Gas Giant band brackets
// the real Jupiter anchor (318 M_earth, 11.2 R_earth) used for the seeded anchor row.
export const PLANET_TYPE_BANDS: readonly PlanetTypeBand[] = [
  { type: 'Terrestrial', massRange: [0.1, 2], radiusRange: [0.3, 1.25] },
  { type: 'Super-Earth', massRange: [2, 10], radiusRange: [1.25, 3.5] },
  { type: 'Neptune-like', massRange: [10, 80], radiusRange: [3.5, 6] },
  { type: 'Gas Giant', massRange: [80, 500], radiusRange: [6, 14] },
];

// Roman numerals for moon_name suffixes (Io/Europa-style catalogs rarely exceed a handful of
// confirmed moons per planet in this dataset).
export const ROMAN_NUMERALS: readonly string[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];
