DROP TABLE IF EXISTS team_sponsor, sponsor, roster_change, map_result, match, tournament, player, team, region, seed_meta CASCADE;

CREATE TABLE seed_meta (
  db text,
  version text,
  seed bigint,
  row_counts jsonb
);

CREATE TABLE region (
  region_id  integer PRIMARY KEY,
  name       text NOT NULL,
  short_code text NOT NULL UNIQUE                    -- NA,EU,KR,BR,CN,SEA,JP,OCE
);
CREATE TABLE team (
  team_id        integer PRIMARY KEY,
  name           text NOT NULL UNIQUE,
  tag            text NOT NULL UNIQUE,               -- 2-4 char ticker
  region_id      integer NOT NULL REFERENCES region(region_id),
  elo_rating     integer NOT NULL,                   -- 1200..2100, observable strength proxy
  founded_date   date NOT NULL,
  disbanded_date date,                               -- NULL for active; set for folded orgs
  home_city      text                                -- a few NULL
);
CREATE TABLE player (
  player_id          integer PRIMARY KEY,
  handle             text NOT NULL UNIQUE,
  full_name          text NOT NULL,                  -- region-appropriate
  country            text NOT NULL,
  role               text NOT NULL CHECK (role IN ('Duelist','Sentinel','Controller','Initiator','IGL','Flex')),
  birth_date         date,                           -- a handful NULL
  team_id            integer REFERENCES team(team_id),   -- NULL = free agent
  signed_date        date,                           -- NULL when free agent
  total_earnings_usd numeric(10,2) NOT NULL DEFAULT 0
);
CREATE TABLE tournament (
  tournament_id  integer PRIMARY KEY,
  name           text NOT NULL,
  region_id      integer REFERENCES region(region_id),   -- NULL = international
  tier           char(1) NOT NULL CHECK (tier IN ('S','A','B')),
  prize_pool_usd numeric(12,2) NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL CHECK (end_date >= start_date),
  host_city      text,                               -- NULL = online
  host_country   text
);
CREATE TABLE match (
  match_id       integer PRIMARY KEY,
  tournament_id  integer NOT NULL REFERENCES tournament(tournament_id),
  stage          text NOT NULL CHECK (stage IN ('Group','Quarterfinal','Semifinal','Final','Grand Final')),
  best_of        smallint NOT NULL CHECK (best_of IN (1,3,5)),
  match_datetime timestamp NOT NULL,                 -- within tournament window
  team_a_id      integer NOT NULL REFERENCES team(team_id),
  team_b_id      integer NOT NULL REFERENCES team(team_id) CHECK (team_a_id <> team_b_id),
  team_a_score   smallint NOT NULL,
  team_b_score   smallint NOT NULL,
  winner_team_id integer NOT NULL REFERENCES team(team_id)
);
CREATE TABLE map_result (
  map_result_id  integer PRIMARY KEY,
  match_id       integer NOT NULL REFERENCES match(match_id),
  map_number     smallint NOT NULL,
  map_name       text NOT NULL,                      -- Valorant pool: Ascent,Bind,Haven,Split,Lotus,Sunset,Icebox
  winner_team_id integer NOT NULL REFERENCES team(team_id),
  team_a_rounds  smallint NOT NULL,
  team_b_rounds  smallint NOT NULL,
  duration_minutes smallint NOT NULL,
  UNIQUE (match_id, map_number)
);
CREATE TABLE roster_change (
  roster_change_id integer PRIMARY KEY,
  player_id        integer NOT NULL REFERENCES player(player_id),
  team_id          integer NOT NULL REFERENCES team(team_id),
  from_date        date NOT NULL,
  to_date          date,                             -- NULL = current/open stint
  change_reason    text NOT NULL CHECK (change_reason IN ('Signed','Transfer','Promoted','Loan','Released','Retired','Benched')),
  UNIQUE (player_id, from_date)
);
CREATE TABLE sponsor (
  sponsor_id           integer PRIMARY KEY,
  name                 text NOT NULL UNIQUE,
  industry             text NOT NULL,
  headquarters_country text NOT NULL
);
CREATE TABLE team_sponsor (
  team_id          integer NOT NULL REFERENCES team(team_id),
  sponsor_id       integer NOT NULL REFERENCES sponsor(sponsor_id),
  contract_start   date NOT NULL,
  contract_end     date,                             -- NULL = active
  annual_value_usd numeric(10,2) NOT NULL,
  PRIMARY KEY (team_id, sponsor_id, contract_start)
);
