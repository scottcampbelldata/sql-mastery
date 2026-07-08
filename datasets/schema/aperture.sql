DROP TABLE IF EXISTS moons, planets, stars, facility, seed_meta CASCADE;

CREATE TABLE seed_meta (
  db text,
  version text,
  seed bigint,
  row_counts jsonb
);

CREATE TABLE facility (
  facility_id integer PRIMARY KEY,
  name        text NOT NULL UNIQUE            -- discovery observatory/telescope
);

CREATE TABLE stars (
  star_id       integer PRIMARY KEY,
  star_name     text NOT NULL UNIQUE,          -- real host name or famous star name
  spectral_type char(1) NOT NULL,               -- O,B,A,F,G,K,M
  temperature_k integer NOT NULL,
  mass_solar    numeric(7,3),                   -- nullable (real completeness varies)
  radius_solar  numeric(7,3),                   -- nullable
  distance_ly   numeric(8,2) NOT NULL
);

CREATE TABLE planets (
  planet_id           integer PRIMARY KEY,
  star_id             integer NOT NULL REFERENCES stars(star_id),
  planet_name         text NOT NULL UNIQUE,
  planet_type         text NOT NULL,            -- Terrestrial|Super-Earth|Neptune-like|Gas Giant
  mass_earth          numeric(10,2),            -- nullable
  radius_earth        numeric(8,2),             -- nullable
  -- Scale kept at the spec's 4 decimal places, but precision widened from 12 to 16 (12 integer
  -- digits) because the real committed source data includes COCONUTS-2 b, a confirmed
  -- wide-separation companion with an orbital_period_days of 402,000,000 (9 integer digits);
  -- numeric(12,4) only allows 8 integer digits and would overflow on that row.
  orbital_period_days numeric(16,4) NOT NULL,
  semi_major_axis_au  numeric(9,4),             -- nullable (real: ~1% null)
  equilibrium_temp_k  integer,                  -- nullable (real: ~6% null; the IS NULL teaching column)
  discovery_method    text NOT NULL,
  discovery_year      integer,
  facility_id         integer NOT NULL REFERENCES facility(facility_id),
  in_habitable_zone   boolean NOT NULL
);
