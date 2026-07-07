DROP TABLE IF EXISTS moons, planets, stars, seed_meta CASCADE;

CREATE TABLE seed_meta (
  db text,
  version text,
  seed bigint,
  row_counts jsonb
);

CREATE TABLE stars (
  star_id            integer PRIMARY KEY,
  star_name          text NOT NULL UNIQUE,           -- catalog designation, LIKE-friendly
  constellation      text NOT NULL,                  -- ~10 values, GROUP BY / LIKE 'C%'
  spectral_type      char(1) NOT NULL,               -- O,B,A,F,G,K,M; drives temp/color/mass
  color              text NOT NULL,                  -- 1:1 with spectral_type
  temperature_k      integer NOT NULL,               -- 2400..45000, banded by spectral_type
  mass_solar         numeric(6,2) NOT NULL,          -- 0.08..90, correlated to type
  radius_solar       numeric(6,2) NOT NULL,          -- 0.10..15, correlated to type
  distance_ly        numeric(7,1) NOT NULL,          -- 4.2..3900, right-skewed
  apparent_magnitude numeric(4,2),                   -- nullable (a few NULL)
  discovery_year     integer                         -- nullable (naked-eye stars NULL)
);
CREATE TABLE planets (
  planet_id           integer PRIMARY KEY,
  star_id             integer NOT NULL REFERENCES stars(star_id),
  planet_name         text NOT NULL UNIQUE,          -- host name + letter, LIKE '%b'
  planet_type         text NOT NULL,                 -- Terrestrial|Super-Earth|Neptune-like|Gas Giant
  mass_earth          numeric(8,2),                  -- ~35% NULL (transit-only detections)
  radius_earth        numeric(6,2),                  -- ~18% NULL (radial-velocity-only)
  orbital_period_days numeric(9,2) NOT NULL,         -- Kepler-consistent with semi_major_axis
  semi_major_axis_au  numeric(7,3) NOT NULL,
  equilibrium_temp_k  integer,                       -- ~15% NULL
  discovery_method    text NOT NULL,                 -- Transit|Radial Velocity|Imaging|Microlensing
  discovery_year      integer NOT NULL,              -- 1995..2019
  in_habitable_zone   boolean NOT NULL               -- derived from temp/luminosity
);
CREATE TABLE moons (
  moon_id             integer PRIMARY KEY,
  planet_id           integer NOT NULL REFERENCES planets(planet_id),
  moon_name           text NOT NULL UNIQUE,
  radius_km           numeric(8,1),                  -- ~30% NULL
  orbital_period_days numeric(7,2),                  -- ~30% NULL
  is_confirmed        boolean NOT NULL
);
