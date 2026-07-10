import type { DraftInterviewProblem } from './types';

// Hand-crafted, business-framed interview problems on the Aperture (exoplanet) database.
// Filled by the content pass; validated + fingerprinted by scripts/validate-interview.ts.
export const APERTURE_INTERVIEW: DraftInterviewProblem[] = [
  {
    id: 'iv-ap-habitable-shortlist-1',
    database: 'aperture',
    level: 'beginner',
    difficulty: 1,
    scenario:
      "You are the data analyst for an exoplanet survey. The lead scientist is assembling a shortlist of potentially habitable worlds for a follow-up observing proposal, and wants only the planets already flagged as sitting inside their star's habitable zone.",
    task: 'Return planet_name and planet_type for every planet whose in_habitable_zone flag is true. Sort the results by planet_name in ascending (A to Z) order.',
    expectedSql:
      'SELECT planet_name, planet_type FROM planets WHERE in_habitable_zone = true ORDER BY planet_name',
    modelAnswer: `-- The habitability call is already stored as a boolean, so filter on it directly.
SELECT planet_name,
       planet_type
FROM planets
WHERE in_habitable_zone = true
ORDER BY planet_name;`,
    approachNote:
      "Filter on the boolean column directly (in_habitable_zone = true, or simply WHERE in_habitable_zone). The common slip is comparing against the string 'true' instead of the boolean literal.",
    orderMatters: true,
    rowCeiling: 30,
  },
  {
    id: 'iv-ap-nearby-hosts-1',
    database: 'aperture',
    level: 'beginner',
    difficulty: 1,
    scenario:
      "The public engagement team is building a 'closest exoplanet host stars' web feature. They want every catalogued host star that lies within 25 light-years of Earth so they can highlight our nearest neighbours.",
    task: 'Return star_name, spectral_type, and distance_ly for stars with distance_ly of 25 or less. Sort by distance_ly ascending, then star_name ascending as a tie-breaker.',
    expectedSql:
      'SELECT star_name, spectral_type, distance_ly FROM stars WHERE distance_ly <= 25 ORDER BY distance_ly, star_name',
    modelAnswer: `-- Inclusive range filter; tie-break on the unique star_name for a stable order.
SELECT star_name,
       spectral_type,
       distance_ly
FROM stars
WHERE distance_ly <= 25
ORDER BY distance_ly, star_name;`,
    approachNote:
      'A simple range filter with <= 25; the boundary is inclusive, so Vega at exactly 25.00 light-years must stay in. The star_name tie-breaker keeps the ordering deterministic.',
    orderMatters: true,
    rowCeiling: 25,
  },
  {
    id: 'iv-ap-recent-discoveries-1',
    database: 'aperture',
    level: 'beginner',
    difficulty: 1,
    scenario:
      "For the observatory's 2026 annual review, the communications lead needs the roster of the most recently discovered planets to feature in the report.",
    task: 'Return planet_name, discovery_year, and discovery_method for every planet discovered in 2023 or later (discovery_year >= 2023). Sort by discovery_year descending (newest first), then planet_name ascending.',
    expectedSql:
      'SELECT planet_name, discovery_year, discovery_method FROM planets WHERE discovery_year >= 2023 ORDER BY discovery_year DESC, planet_name',
    modelAnswer: `-- Newest first, then alphabetical within each year.
SELECT planet_name,
       discovery_year,
       discovery_method
FROM planets
WHERE discovery_year >= 2023
ORDER BY discovery_year DESC, planet_name;`,
    approachNote:
      'Filter with discovery_year >= 2023, then sort newest-first with discovery_year DESC and break ties on planet_name so rows within the same year have a fixed order.',
    orderMatters: true,
    rowCeiling: 25,
  },
  {
    id: 'iv-ap-gas-giant-count-1',
    database: 'aperture',
    level: 'beginner',
    difficulty: 1,
    scenario:
      'The quarterly catalog summary opens with one headline statistic: how many of the confirmed planets are gas giants.',
    task: "Return a single row with one column named gas_giant_count holding the number of planets whose planet_type is 'Gas Giant'.",
    expectedSql:
      "SELECT count(*) AS gas_giant_count FROM planets WHERE planet_type = 'Gas Giant'",
    modelAnswer: `-- One filtered count, aliased exactly as requested.
SELECT count(*) AS gas_giant_count
FROM planets
WHERE planet_type = 'Gas Giant';`,
    approachNote:
      'count(*) over a filtered set, aliased to the requested name. The common wrong turn is grouping by planet_type and returning every type instead of the single filtered number.',
    orderMatters: false,
    rowCeiling: 1,
  },
  {
    id: 'iv-ap-method-share-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'group-by',
    difficulty: 1,
    scenario:
      'The methodology section of the survey report breaks the catalog down by how each planet was found. The lead scientist wants the planet tally for every discovery technique.',
    task: 'For each discovery_method, return discovery_method and the number of planets as planet_count. Sort by planet_count descending, then discovery_method ascending.',
    expectedSql:
      'SELECT discovery_method, count(*) AS planet_count FROM planets GROUP BY discovery_method ORDER BY count(*) DESC, discovery_method',
    modelAnswer: `-- One row per method; order by the tally, break ties on the label.
SELECT discovery_method,
       count(*) AS planet_count
FROM planets
GROUP BY discovery_method
ORDER BY count(*) DESC, discovery_method;`,
    approachNote:
      'Group by the category column and count rows per group, then sort by the aggregate descending with the label as a tie-breaker. A frequent mistake is selecting a non-grouped column, which Postgres rejects.',
    orderMatters: true,
    rowCeiling: 10,
  },
  {
    id: 'iv-ap-avg-temp-by-type-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'group-by',
    difficulty: 2,
    scenario:
      'A researcher is characterising how hot each class of planet tends to run. She asks for the typical equilibrium temperature of each planet type across the whole catalog.',
    task: 'For each planet_type, return planet_type and the average equilibrium_temp_k rounded to one decimal place as avg_temp_k. Sort by avg_temp_k descending, then planet_type ascending.',
    expectedSql:
      'SELECT planet_type, round(avg(equilibrium_temp_k), 1) AS avg_temp_k FROM planets GROUP BY planet_type ORDER BY avg_temp_k DESC, planet_type',
    modelAnswer: `-- avg() skips the NULL temperatures automatically; round to match the column.
SELECT planet_type,
       round(avg(equilibrium_temp_k), 1) AS avg_temp_k
FROM planets
GROUP BY planet_type
ORDER BY avg_temp_k DESC, planet_type;`,
    approachNote:
      'avg() ignores rows where equilibrium_temp_k is NULL, so no explicit filter is needed; round to one decimal to match the requested column. The common slip is reaching for count() instead of avg().',
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-ap-prolific-facilities-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'having',
    difficulty: 2,
    scenario:
      'The operations director wants to recognise the workhorse observatories in the network. She asks which discovery facilities have each found more than five planets.',
    task: 'Join planets to facility and, for each facility that has discovered more than 5 planets, return the facility name as facility_name and the planet tally as planet_count. Sort by planet_count descending, then facility_name ascending.',
    expectedSql:
      'SELECT f.name AS facility_name, count(*) AS planet_count FROM planets p JOIN facility f ON f.facility_id = p.facility_id GROUP BY f.name HAVING count(*) > 5 ORDER BY count(*) DESC, f.name',
    modelAnswer: `-- HAVING filters the groups after aggregation; WHERE cannot see count(*).
SELECT f.name AS facility_name,
       count(*) AS planet_count
FROM planets p
JOIN facility f ON f.facility_id = p.facility_id
GROUP BY f.name
HAVING count(*) > 5
ORDER BY count(*) DESC, f.name;`,
    approachNote:
      'Filter groups with HAVING count(*) > 5 (not WHERE, which runs before aggregation). Joining to facility turns the numeric facility_id into a human-readable name for the report.',
    orderMatters: true,
    rowCeiling: 10,
  },
  {
    id: 'iv-ap-hottest-planets-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'top-n',
    difficulty: 1,
    scenario:
      "An 'extreme worlds' outreach post will spotlight the five hottest planets in the catalog. The editor needs their names and equilibrium temperatures.",
    task: 'Among planets that have a recorded equilibrium_temp_k (not NULL), return planet_name and equilibrium_temp_k for the five hottest. Sort by equilibrium_temp_k descending, then planet_name ascending, and return only 5 rows.',
    expectedSql:
      'SELECT planet_name, equilibrium_temp_k FROM planets WHERE equilibrium_temp_k IS NOT NULL ORDER BY equilibrium_temp_k DESC, planet_name LIMIT 5',
    modelAnswer: `-- Exclude NULL temps so they do not float to the top under DESC.
SELECT planet_name,
       equilibrium_temp_k
FROM planets
WHERE equilibrium_temp_k IS NOT NULL
ORDER BY equilibrium_temp_k DESC, planet_name
LIMIT 5;`,
    approachNote:
      'Sort descending and LIMIT 5 for a top-N. The subtle trap: in Postgres NULLs sort first under DESC, so without the IS NOT NULL filter planets with no recorded temperature would head the list.',
    orderMatters: true,
    rowCeiling: 5,
  },
  {
    id: 'iv-ap-largest-planets-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'top-n',
    difficulty: 1,
    scenario:
      'The visualization team is designing a scale graphic of the biggest planets in the survey. They need the ten largest by radius, with each planet type labelled.',
    task: 'Return planet_name, planet_type, and radius_earth for the ten planets with the largest radius_earth. Sort by radius_earth descending, then planet_name ascending, and return only 10 rows.',
    expectedSql:
      'SELECT planet_name, planet_type, radius_earth FROM planets ORDER BY radius_earth DESC, planet_name LIMIT 10',
    modelAnswer: `-- Classic top-N: order by the measure descending, then LIMIT.
SELECT planet_name,
       planet_type,
       radius_earth
FROM planets
ORDER BY radius_earth DESC, planet_name
LIMIT 10;`,
    approachNote:
      'ORDER BY radius_earth DESC with LIMIT 10. radius_earth has no NULLs here, so no filter is needed; the planet_name tie-breaker guarantees a single deterministic ordering.',
    orderMatters: true,
    rowCeiling: 10,
  },
  {
    id: 'iv-ap-m-dwarf-planets-1',
    database: 'aperture',
    level: 'beginner',
    pattern: 'join',
    difficulty: 2,
    scenario:
      'Red-dwarf (M-type) stars are prime targets for finding small planets. The science team wants every planet in the catalog that orbits an M-type host star, each labelled with the star it circles.',
    task: "Join planets to stars and return planet_name and star_name for planets whose host star has spectral_type 'M'. Sort by planet_name ascending.",
    expectedSql:
      "SELECT p.planet_name, s.star_name FROM planets p JOIN stars s ON s.star_id = p.star_id WHERE s.spectral_type = 'M' ORDER BY p.planet_name",
    modelAnswer: `-- Join on the star_id foreign key, then filter the joined host's type.
SELECT p.planet_name,
       s.star_name
FROM planets p
JOIN stars s ON s.star_id = p.star_id
WHERE s.spectral_type = 'M'
ORDER BY p.planet_name;`,
    approachNote:
      'Join on the star_id foreign key, then filter the joined star spectral_type. The common wrong turn is omitting the ON condition, which produces a Cartesian product; planet_name is unique so it fixes the order.',
    orderMatters: true,
    rowCeiling: 60,
  },
];
