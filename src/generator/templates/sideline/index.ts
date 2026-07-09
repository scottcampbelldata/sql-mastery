import type {
  Template,
  ConceptMeta,
  TeachBlock,
  PhaseMeta,
  CheckpointMeta,
  ScaffoldPlan,
  GateHints
} from '../../types';
import { SIDELINE_UNMATCHED_MANIFEST } from './manifest';

export const SIDELINE_SKILLS: string[] = [
  'sl-join-inner',
  'sl-join-multi',
  'sl-join-left',
  'sl-anti-join',
  'sl-semi-join',
  'sl-self-join-match',
  'sl-self-join-compare',
  'sl-join-right-full',
  'sl-join-aggregate',
  'sl-case-expression',
  'sl-subquery-scalar',
  'sl-subquery-in',
  'sl-subquery-correlated',
  'sl-cte',
  'sl-set-ops',
  'sl-date-functions',
  'sl-scd-asof',
  'sl-window-rank',
  'sl-window-lag-lead',
  'sl-window-running',
  'sl-window-frame-basic',
];

const PLAN: ScaffoldPlan = { full: 'all-value-slots', half: 'harder-half', blank: 'whole-clauses' };

function gh(minRows: number, minDistinct: number, orderMatters: boolean): GateHints {
  return { minRows, minDistinct, rowCeiling: 200, orderMatters, boundedSlice: false };
}

const tJoinInner: Template = {
  skill: 'sl-join-inner',
  database: 'sideline',
  family: 'join',
  primaryTable: 'player',
  sqlShape:
    'SELECT p.player_id AS player_id, p.handle AS handle, t.name AS team_name ' +
    'FROM player p JOIN team t ON t.team_id = p.team_id WHERE t.region_id = {regionValue}',
  slots: [
    { name: 'regionValue', kind: 'literal', op: '=', col: 'region_id', table: 'team', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'player' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'player_id' }],
  phrasings: [
    'For region {regionValue}, list each rostered player as player_id, handle, and team_name. Order by player_id.',
    'Join player to team and return player_id, handle, team_name for teams in region {regionValue}, ordered by player_id.',
  ],
  hintTemplate: 'Inner JOIN player to team on team_id; free agents drop out because their team_id is NULL.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tJoinMulti: Template = {
  skill: 'sl-join-multi',
  database: 'sideline',
  family: 'join',
  primaryTable: 'map_result',
  sqlShape:
    'SELECT mr.map_result_id AS map_result_id, mr.map_name AS map_name, m.stage AS stage, t.name AS tournament_name ' +
    "FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN tournament t ON t.tournament_id = m.tournament_id WHERE t.tier = '{tierValue}' LIMIT {topN}",
  slots: [
    { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    { name: 'topN', kind: 'limit' },
    { name: 'sortKey', kind: 'sortKey', table: 'map_result' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'map_result_id' }],
  phrasings: [
    'For tier {tierValue} tournaments, list the first {topN} rows as map_result_id, map_name, stage, and tournament_name. Order by map_result_id.',
    'Chain map_result to match to tournament and return {topN} map_result_id, map_name, stage, tournament_name rows for tier {tierValue}, ordered by map_result_id.',
  ],
  hintTemplate: 'Add one JOIN at a time: map_result to match, then match to tournament; LIMIT keeps the slice small.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tJoinLeft: Template = {
  skill: 'sl-join-left',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team_sponsor',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name, ts.sponsor_id AS sponsor_id, ' +
    'ts.contract_start AS contract_start, ts.annual_value_usd AS annual_value_usd ' +
    'FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team_sponsor' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List every team sponsor row as team_id, team_name, sponsor_id, contract_start, and annual_value_usd, keeping sponsorless teams. Order by team_id, sponsor_id, contract_start.',
    'LEFT JOIN team to team_sponsor and return team_id, team_name, sponsor_id, contract_start, annual_value_usd, ordered by team_id, sponsor_id, contract_start.',
  ],
  hintTemplate: 'LEFT JOIN keeps every team; sponsorless teams show NULL sponsor columns.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const antiJoinNeverPlayed: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name FROM team t ' +
    'LEFT JOIN match m ON (m.team_a_id = t.team_id OR m.team_b_id = t.team_id) WHERE m.match_id IS NULL',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team that has never played a match as team_a or team_b. Order by team_id.',
    'Which teams have zero matches? Return team_id, team_name using an anti-join, ordered by team_id.',
  ],
  hintTemplate:
    'LEFT JOIN match on either team column, then keep only rows where the match side is NULL. The manifest guarantees team ' +
    String(SIDELINE_UNMATCHED_MANIFEST.neverPlayedTeamIds[0]) + ' never played.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinSponsorless: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name FROM team t ' +
    'LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE ts.team_id IS NULL',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team with no sponsor row. Order by team_id.',
    'Find sponsorless teams by anti-joining team to team_sponsor; return team_id, team_name ordered by team_id.',
  ],
  hintTemplate: 'LEFT JOIN team_sponsor and keep rows where ts.team_id IS NULL. The seed guarantees sponsorless teams.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinTeamlessSponsor: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'sponsor',
  sqlShape:
    'SELECT s.sponsor_id AS sponsor_id, s.name AS sponsor_name FROM sponsor s ' +
    'LEFT JOIN team_sponsor ts ON ts.sponsor_id = s.sponsor_id WHERE ts.sponsor_id IS NULL',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'sponsor' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'sponsor_id' }],
  phrasings: [
    'List sponsor_id and sponsor_name for every sponsor that backs no team. Order by sponsor_id.',
    'Which sponsors have zero team deals? Return sponsor_id, sponsor_name using an anti-join, ordered by sponsor_id.',
  ],
  hintTemplate:
    'LEFT JOIN team_sponsor on sponsor_id and keep NULL matches. The manifest reserves sponsor ' +
    String(SIDELINE_UNMATCHED_MANIFEST.teamlessSponsorIds[0]) + ' as team-less.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const antiJoinPlayerless: Template = {
  skill: 'sl-anti-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name FROM team t ' +
    'WHERE NOT EXISTS (SELECT 1 FROM player p WHERE p.team_id = t.team_id)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team with no players on its roster. Order by team_id.',
    'Find player-less teams via NOT EXISTS against player; return team_id, team_name ordered by team_id.',
  ],
  hintTemplate:
    'Use NOT EXISTS against player.team_id. The manifest guarantees team ' +
    String(SIDELINE_UNMATCHED_MANIFEST.playerlessTeamIds[0]) + ' has no players.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const tSemiJoin: Template = {
  skill: 'sl-semi-join',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name FROM team t ' +
    'WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List team_id and team_name for every team that has at least one sponsor, each team once. Order by team_id.',
    'Use EXISTS against team_sponsor to return sponsored teams as team_id, team_name, ordered by team_id.',
  ],
  hintTemplate: 'EXISTS returns each team once even when multiple sponsor rows match.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tSelfJoinMatch: Template = {
  skill: 'sl-self-join-match',
  database: 'sideline',
  family: 'join',
  primaryTable: 'match',
  sqlShape: [
    'SELECT m.match_id AS match_id, w.name AS winner_name, l.name AS loser_name',
    'FROM match m',
    'JOIN team w ON w.team_id = m.winner_team_id',
    'JOIN team l ON l.team_id = CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END',
    "WHERE m.stage = '{stageValue}' LIMIT {topN}",
  ].join('\n'),
  slots: [
    { name: 'stageValue', kind: 'literal', op: '=', col: 'stage', table: 'match', sampleStrategy: 'single' },
    { name: 'topN', kind: 'limit' },
    { name: 'sortKey', kind: 'sortKey', table: 'match' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'match_id' }],
  phrasings: [
    'For {stageValue} matches, list the first {topN} rows as match_id, winner_name, and loser_name. The loser is the team that was not the winner. Order by match_id.',
    'Show {topN} {stageValue} matches as match_id, winner_name, loser_name by joining team twice. Order by match_id.',
  ],
  hintTemplate:
    'Join match to team twice with aliases. One join is on winner_team_id; the other uses CASE to choose the non-winning team id.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tSelfJoinCompare: Template = {
  skill: 'sl-self-join-compare',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT a.team_id AS team_id, a.name AS team_a_name, b.name AS team_b_name ' +
    'FROM team a JOIN team b ON a.region_id = b.region_id AND a.elo_rating = b.elo_rating AND a.team_id < b.team_id',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'Find pairs of teams in the same region with equal elo_rating. Return team_id, team_a_name, team_b_name with a.team_id < b.team_id. Order by team_id.',
    'Self-join team on region_id and elo_rating and return team_id, team_a_name, team_b_name for each pair, ordered by team_id.',
  ],
  hintTemplate: 'Join team to itself; the a.team_id < b.team_id guard removes self-pairs and mirrored duplicates.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const tJoinRightFull: Template = {
  skill: 'sl-join-right-full',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name, ts.sponsor_id AS sponsor_id ' +
    'FROM team t FULL OUTER JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE t.team_id IS NULL OR ts.sponsor_id IS NULL',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'FULL OUTER JOIN team to team_sponsor and keep unmatched rows. Return team_id, team_name, sponsor_id. Order by team_id.',
    'Show the outer edge of team versus team_sponsor: rows where one side is NULL. Return team_id, team_name, sponsor_id, ordered by team_id.',
  ],
  hintTemplate: 'FULL OUTER JOIN keeps unmatched rows, then the WHERE clause filters to only those unmatched cases.',
  scaffoldPlan: PLAN,
  gateHints: gh(1, 1, true),
};

const tJoinAggregate: Template = {
  skill: 'sl-join-aggregate',
  database: 'sideline',
  family: 'grouped',
  primaryTable: 'team',
  sqlShape:
    'SELECT t.team_id AS team_id, t.name AS team_name, count(m.match_id) AS match_count, ' +
    'sum(CASE WHEN m.best_of = 5 THEN 1 ELSE 0 END) AS bo5_count ' +
    'FROM team t JOIN match m ON m.winner_team_id = t.team_id GROUP BY t.team_id, t.name',
  slots: [{ name: 'groupCols', kind: 'groupCols', table: 'team' }],
  bindingRules: [{ slot: 'groupCols', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'For each winning team, return team_id, team_name, match_count, and bo5_count. Order by team_id.',
    'Join team to match, group by team_id and team_name, and return match_count plus bo5_count, ordered by team_id.',
  ],
  hintTemplate: 'Join to match before grouping; SUM over a CASE expression adds a conditional best-of-5 count.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tCaseExpression: Template = {
  skill: 'sl-case-expression',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'team',
  sqlShape:
    "SELECT team_id AS team_id, name AS team_name, CASE WHEN elo_rating >= 1800 THEN 'elite' WHEN elo_rating >= 1500 THEN 'mid' ELSE 'developing' END AS tier FROM team",
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'Label each team by Elo band as tier, and return team_id, team_name, tier. Order by team_id.',
    'Use CASE to bucket elo_rating into tier for every team and return team_id, team_name, tier, ordered by team_id.',
  ],
  hintTemplate: 'CASE WHEN ... THEN ... ELSE ... END returns the first matching branch for each row.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tSubqueryScalar: Template = {
  skill: 'sl-subquery-scalar',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'team',
  sqlShape:
    'SELECT team_id AS team_id, name AS team_name, elo_rating AS elo_rating FROM team ' +
    'WHERE elo_rating > (SELECT avg(elo_rating) FROM team)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List teams whose elo_rating is above the overall average. Return team_id, team_name, elo_rating. Order by team_id.',
    'Compare each team to the scalar average Elo subquery and return team_id, team_name, elo_rating for the above-average teams, ordered by team_id.',
  ],
  hintTemplate: 'A scalar subquery in parentheses returns one number you can compare against.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tSubqueryIn: Template = {
  skill: 'sl-subquery-in',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'team',
  sqlShape:
    "SELECT team_id AS team_id, name AS team_name FROM team WHERE region_id IN (SELECT region_id FROM tournament WHERE tier = 'A' AND region_id IS NOT NULL)",
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'List teams in regions that host at least one tier A tournament. Return team_id and team_name. Order by team_id.',
    'Use region_id IN (a subquery of tier A tournament regions) and return team_id, team_name, ordered by team_id.',
  ],
  hintTemplate: 'Build the set of region_id values inside the subquery, then keep teams whose region_id is IN that set.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tSubqueryCorrelated: Template = {
  skill: 'sl-subquery-correlated',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'player',
  sqlShape:
    'SELECT p.player_id AS player_id, p.handle AS handle FROM player p ' +
    'WHERE p.team_id IS NOT NULL AND p.total_earnings_usd > (SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id)',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'player' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'player_id' }],
  phrasings: [
    'List rostered players who earn more than their own team average. Return player_id and handle. Order by player_id.',
    'Use a correlated subquery on p.team_id to compare each player to teammates and return player_id, handle, ordered by player_id.',
  ],
  hintTemplate: 'The inner query references the outer p.team_id, so it recomputes for each player.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tCte: Template = {
  skill: 'sl-cte',
  database: 'sideline',
  family: 'join',
  primaryTable: 'team',
  sqlShape:
    'SELECT team_id, team_name, wins FROM (' +
    'WITH team_wins AS (SELECT winner_team_id AS team_id, count(*) AS wins FROM match GROUP BY winner_team_id) ' +
    'SELECT t.team_id AS team_id, t.name AS team_name, tw.wins AS wins FROM team t JOIN team_wins tw ON tw.team_id = t.team_id' +
    ') wins_by_team',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'team' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'team_id' }],
  phrasings: [
    'Using a CTE that counts wins per team, return team_id, team_name, wins for teams with at least one win. Order by team_id.',
    'Define WITH team_wins, join it to team, and return team_id, team_name, wins, ordered by team_id.',
  ],
  hintTemplate: 'Name the aggregate in a WITH clause, then join that named result like a table.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tSetOps: Template = {
  skill: 'sl-set-ops',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'player',
  sqlShape:
    'SELECT DISTINCT country AS country FROM (' +
    'SELECT host_country AS country FROM tournament UNION SELECT country AS country FROM player' +
    ') countries WHERE country IS NOT NULL',
  slots: [{ name: 'sortKey', kind: 'sortKey', table: 'player' }],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'country' }],
  phrasings: [
    'Return the distinct set of countries that are either a tournament host_country or a player country, as country. Order by country.',
    'UNION tournament host_country with player country into one country column and return the distinct non-NULL values ordered by country.',
  ],
  hintTemplate: 'Both SELECTs inside the UNION expose one text column named country; the outer query removes NULL.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tDateFunctions: Template = {
  skill: 'sl-date-functions',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'tournament',
  sqlShape:
    "SELECT tournament_id AS tournament_id, name AS name, (end_date - start_date) AS length_days FROM tournament WHERE tier = '{tierValue}'",
  slots: [
    { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    { name: 'sortKey', kind: 'sortKey', table: 'tournament' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'tournament_id' }],
  phrasings: [
    'For tier {tierValue} tournaments, compute length_days as end_date minus start_date. Return tournament_id, name, length_days. Order by tournament_id.',
    'Subtract start_date from end_date for tier {tierValue} tournaments and return tournament_id, name, length_days, ordered by tournament_id.',
  ],
  hintTemplate: 'In Postgres, date minus date returns the integer number of days between them.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tScdAsof: Template = {
  skill: 'sl-scd-asof',
  database: 'sideline',
  family: 'single-table',
  primaryTable: 'roster_change',
  sqlShape:
    'SELECT rc.roster_change_id AS roster_change_id, rc.player_id AS player_id, rc.team_id AS team_id, rc.from_date AS from_date ' +
    "FROM roster_change rc WHERE rc.from_date <= DATE '2025-01-01' AND (rc.to_date IS NULL OR rc.to_date > DATE '2025-01-01') LIMIT {topN}",
  slots: [
    { name: 'topN', kind: 'limit' },
    { name: 'sortKey', kind: 'sortKey', table: 'roster_change' },
  ],
  bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'roster_change_id' }],
  phrasings: [
    'As of 2025-01-01, list the first {topN} active roster stints as roster_change_id, player_id, team_id, and from_date. Order by roster_change_id.',
    'Do an as-of lookup on roster_change for 2025-01-01 and return {topN} roster_change_id, player_id, team_id, from_date rows, ordered by roster_change_id.',
  ],
  hintTemplate: 'The active stint has from_date on or before the as-of date and either an open to_date or a later to_date.',
  scaffoldPlan: PLAN,
  gateHints: gh(2, 2, true),
};

const tWindowRank: Template = {
  skill: 'sl-window-rank',
  database: 'sideline',
  family: 'windowed',
  primaryTable: 'team',
  sqlShape:
    'SELECT team_id AS team_id, name AS team_name, region_id AS region_id, elo_rating AS elo_rating, ' +
    'RANK() OVER (PARTITION BY region_id) AS region_rank FROM team',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'team' },
    { name: 'rankKey', kind: 'rankKey', table: 'team' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (value: string) => value === 'region_id' },
    { slot: 'rankKey', predicate: (value: string) => value === 'team_id' },
  ],
  phrasings: [
    'Rank teams within each region partition and return team_id, team_name, region_id, elo_rating, and region_rank. Order by region_id and team_id.',
    'Use RANK() with PARTITION BY region_id and return team_id, team_name, region_id, elo_rating, region_rank, ordered by region_id and team_id.',
  ],
  hintTemplate: 'PARTITION BY region_id restarts the window calculation for each region; team_id is the final deterministic tiebreak.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tWindowLagLead: Template = {
  skill: 'sl-window-lag-lead',
  database: 'sideline',
  family: 'windowed',
  primaryTable: 'tournament',
  sqlShape:
    'SELECT tournament_id AS tournament_id, region_id AS region_id, name AS name, start_date AS start_date, ' +
    'LAG(start_date) OVER (PARTITION BY region_id) AS prev_start FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (value: string) => value === 'region_id' },
    { slot: 'rankKey', predicate: (value: string) => value === 'tournament_id' },
  ],
  phrasings: [
    'For each region partition, show each tournament with prev_start from LAG(start_date). Return tournament_id, region_id, name, start_date, prev_start. Order by region_id and tournament_id.',
    'Use LAG(start_date) with PARTITION BY region_id and return tournament_id, region_id, name, start_date, prev_start, ordered by region_id and tournament_id.',
  ],
  hintTemplate: 'LAG reads the previous row in the same region partition; the first row per partition returns NULL.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tWindowRunning: Template = {
  skill: 'sl-window-running',
  database: 'sideline',
  family: 'windowed',
  primaryTable: 'tournament',
  sqlShape:
    'SELECT tournament_id AS tournament_id, region_id AS region_id, name AS name, prize_pool_usd AS prize_pool_usd, ' +
    'SUM(prize_pool_usd) OVER (PARTITION BY region_id) AS running_prize FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (value: string) => value === 'region_id' },
    { slot: 'rankKey', predicate: (value: string) => value === 'tournament_id' },
  ],
  phrasings: [
    'For each region partition, calculate running_prize with a windowed SUM. Return tournament_id, region_id, name, prize_pool_usd, running_prize. Order by region_id and tournament_id.',
    'Use SUM(prize_pool_usd) OVER (PARTITION BY region_id) and return tournament_id, region_id, name, prize_pool_usd, running_prize, ordered by region_id and tournament_id.',
  ],
  hintTemplate: 'A windowed SUM keeps each tournament row while adding a partition-level prize calculation.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

const tWindowFrameBasic: Template = {
  skill: 'sl-window-frame-basic',
  database: 'sideline',
  family: 'windowed',
  primaryTable: 'tournament',
  sqlShape:
    'SELECT tournament_id AS tournament_id, region_id AS region_id, start_date AS start_date, prize_pool_usd AS prize_pool_usd, ' +
    'AVG(prize_pool_usd) OVER (PARTITION BY region_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS smoothed_prize ' +
    'FROM tournament WHERE region_id IS NOT NULL',
  slots: [
    { name: 'partitionCols', kind: 'partitionCols', table: 'tournament' },
    { name: 'rankKey', kind: 'rankKey', table: 'tournament' },
  ],
  bindingRules: [
    { slot: 'partitionCols', predicate: (value: string) => value === 'region_id' },
    { slot: 'rankKey', predicate: (value: string) => value === 'tournament_id' },
  ],
  phrasings: [
    'For each region partition, compute smoothed_prize with a 3-row window frame. Return tournament_id, region_id, start_date, prize_pool_usd, smoothed_prize. Order by region_id and tournament_id.',
    'Use AVG(prize_pool_usd) over a ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING frame and return tournament_id, region_id, start_date, prize_pool_usd, smoothed_prize, ordered by region_id and tournament_id.',
  ],
  hintTemplate: 'The ROWS BETWEEN frame slides over nearby rows in the same region partition; emit wraps AVG with ROUND.',
  scaffoldPlan: PLAN,
  gateHints: gh(3, 2, true),
};

export const SIDELINE_TEMPLATES: Template[] = [
  tJoinInner,
  tJoinMulti,
  tJoinLeft,
  antiJoinNeverPlayed,
  antiJoinSponsorless,
  antiJoinTeamlessSponsor,
  antiJoinPlayerless,
  tSemiJoin,
  tSelfJoinMatch,
  tSelfJoinCompare,
  tJoinRightFull,
  tJoinAggregate,
  tCaseExpression,
  tSubqueryScalar,
  tSubqueryIn,
  tSubqueryCorrelated,
  tCte,
  tSetOps,
  tDateFunctions,
  tScdAsof,
  tWindowRank,
  tWindowLagLead,
  tWindowRunning,
  tWindowFrameBasic,
];

function teach(plain: string, mentalModel: string, sql: string, note: string): TeachBlock {
  return { plain, mentalModel, example: { sql, note } };
}

export const SIDELINE_CONCEPT_META: ConceptMeta[] = [
  {
    skill: 'sl-join-inner',
    phaseId: 'sideline-joins',
    order: 1,
    title: 'Inner joins',
    teach: teach(
      'An inner join keeps only rows that match on both sides. Join player to team on team_id to pull each player alongside their team.',
      'Think of two lists lined up by a shared key; keep a row only when both lists have that key.',
      'SELECT p.handle, t.name FROM player p JOIN team t ON t.team_id = p.team_id',
      'Free agents (player.team_id IS NULL) drop out of an inner join because they have no matching team.'
    ),
  },
  {
    skill: 'sl-join-multi',
    phaseId: 'sideline-joins',
    order: 2,
    title: 'Multi-table joins',
    teach: teach(
      'Chain joins across three or more tables to follow a path: match -> tournament -> region, or map_result -> match -> team.',
      'Each JOIN adds one more table onto the growing row; keep the ON keys aligned so the chain does not fan out.',
      'SELECT mr.map_name, m.stage, t.name FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN tournament t ON t.tournament_id = m.tournament_id',
      'Add tables one join at a time and check the row count does not explode unexpectedly.'
    ),
  },
  {
    skill: 'sl-join-left',
    phaseId: 'sideline-joins',
    order: 3,
    title: 'Left outer joins',
    teach: teach(
      'A left join keeps every row from the left table and fills NULL where the right table has no match.',
      'The left table is the anchor; the right side is optional decoration that may be missing.',
      'SELECT t.name, ts.annual_value_usd FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'A team with no sponsor still appears, with NULL in the sponsor columns.'
    ),
  },
  {
    skill: 'sl-anti-join',
    phaseId: 'sideline-joins',
    order: 4,
    title: 'Anti joins',
    teach: teach(
      'An anti-join keeps left rows that have NO match on the right: LEFT JOIN then WHERE right key IS NULL, or NOT EXISTS.',
      'Find the leftovers: everything on the left that the right side never claimed.',
      'SELECT t.team_id, t.name FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE ts.team_id IS NULL',
      'This is how you find teams with no sponsor, or teams that never played a match.'
    ),
  },
  {
    skill: 'sl-semi-join',
    phaseId: 'sideline-joins',
    order: 5,
    title: 'Semi joins',
    teach: teach(
      'A semi-join keeps left rows that HAVE at least one match on the right, without duplicating them: EXISTS or IN.',
      'A yes/no membership test: does this left row have any partner on the right?',
      'SELECT t.team_id, t.name FROM team t WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id)',
      'EXISTS returns each team once even if it has many sponsors, unlike a plain inner join.'
    ),
  },
  {
    skill: 'sl-self-join-match',
    phaseId: 'sideline-joins',
    order: 6,
    title: 'Self join: winner vs loser',
    teach: teach(
      'match has two team FKs (team_a_id, team_b_id) plus winner_team_id. Join team twice to name both the winner and the loser; derive the loser id with a CASE that flips between the two team columns.',
      'The same table wears two hats in one query; give it two aliases so each hat is a separate join.',
      'SELECT m.match_id, w.name AS winner_name, l.name AS loser_name FROM match m JOIN team w ON w.team_id = m.winner_team_id JOIN team l ON l.team_id = CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END',
      'The loser is whichever of team_a_id / team_b_id is not the winner.'
    ),
  },
  {
    skill: 'sl-self-join-compare',
    phaseId: 'sideline-joins',
    order: 7,
    title: 'Self join: compare peers',
    teach: teach(
      'Join a table to itself to compare rows within the same group, such as two teams in the same region with equal Elo.',
      'Pair every row with its siblings; use a < b to keep each unordered pair once.',
      'SELECT a.name, b.name FROM team a JOIN team b ON a.region_id = b.region_id AND a.team_id < b.team_id',
      'The a.team_id < b.team_id guard removes self-pairs and mirrored duplicates.'
    ),
  },
  {
    skill: 'sl-join-right-full',
    phaseId: 'sideline-joins',
    order: 8,
    title: 'Right and full outer joins',
    teach: teach(
      'A full outer join keeps unmatched rows from BOTH sides, filling NULL on whichever side is missing.',
      'The union of two left joins: nobody gets dropped, from either table.',
      'SELECT t.name, ts.sponsor_id FROM team t FULL OUTER JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'Sponsorless teams and (structurally) any team-less sponsor rows both survive.'
    ),
  },
  {
    skill: 'sl-join-aggregate',
    phaseId: 'sideline-joins',
    order: 9,
    title: 'Join then aggregate',
    teach: teach(
      'Join first, then GROUP BY to summarize: count matches per region, sum sponsor value per team. ROLLUP, GROUPING SETS, string_agg, and FILTER extend the summary.',
      'Reshape rows into groups after the join; each group collapses to one summary row.',
      'SELECT r.name, count(*) AS match_count FROM match m JOIN tournament t ON t.tournament_id = m.tournament_id JOIN region r ON r.region_id = t.region_id GROUP BY r.name',
      'FILTER (WHERE ...) lets one query carry several conditional counts side by side.'
    ),
  },
  {
    skill: 'sl-case-expression',
    phaseId: 'sideline-subqueries',
    order: 1,
    title: 'CASE expressions',
    teach: teach(
      'CASE builds a computed column from conditions: label an Elo band, or bucket a prize pool into tiers.',
      'An if/else ladder that produces a value per row.',
      "SELECT name, CASE WHEN elo_rating >= 1800 THEN 'elite' WHEN elo_rating >= 1500 THEN 'mid' ELSE 'developing' END AS tier FROM team",
      'The first matching WHEN wins; ELSE is the fallback.'
    ),
  },
  {
    skill: 'sl-subquery-scalar',
    phaseId: 'sideline-subqueries',
    order: 2,
    title: 'Scalar subqueries',
    teach: teach(
      'A scalar subquery returns exactly one value you can compare against, such as the overall average Elo.',
      'Compute a single number in parentheses, then use it like a constant.',
      'SELECT name, elo_rating FROM team WHERE elo_rating > (SELECT avg(elo_rating) FROM team)',
      'If the inner query could return many rows, it is not scalar; use IN or a join instead.'
    ),
  },
  {
    skill: 'sl-subquery-in',
    phaseId: 'sideline-subqueries',
    order: 3,
    title: 'IN subqueries',
    teach: teach(
      'IN (subquery) filters against a set of values produced by another query, such as teams in international tournaments.',
      'Build a set on the inside; keep outer rows whose key is in that set.',
      "SELECT name FROM team WHERE region_id IN (SELECT region_id FROM tournament WHERE tier = 'S')",
      'NOT IN is risky when the subquery can return NULLs; prefer NOT EXISTS there.'
    ),
  },
  {
    skill: 'sl-subquery-correlated',
    phaseId: 'sideline-subqueries',
    order: 4,
    title: 'Correlated subqueries',
    teach: teach(
      'A correlated subquery references the outer row, so it re-runs per row: each player compared to their own team average earnings.',
      'The inner query peeks back at the current outer row every time it runs.',
      'SELECT p.handle FROM player p WHERE p.total_earnings_usd > (SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id)',
      'The inner reference to p.team_id is what makes it correlated.'
    ),
  },
  {
    skill: 'sl-cte',
    phaseId: 'sideline-subqueries',
    order: 5,
    title: 'Common table expressions',
    teach: teach(
      'A WITH clause names a subquery so you can read the query top to bottom and reuse the intermediate result.',
      'Give a subquery a name up front, then treat it like a table below.',
      'WITH team_matches AS (SELECT winner_team_id AS team_id, count(*) AS wins FROM match GROUP BY winner_team_id) SELECT t.name, tm.wins FROM team t JOIN team_matches tm ON tm.team_id = t.team_id',
      'CTEs do not change the answer; they make a layered query legible.'
    ),
  },
  {
    skill: 'sl-set-ops',
    phaseId: 'sideline-subqueries',
    order: 6,
    title: 'Set operations',
    teach: teach(
      'UNION, INTERSECT, and EXCEPT combine two same-shaped result sets. UNION dedups; UNION ALL keeps duplicates.',
      'Stack two column-compatible results and take their union, overlap, or difference.',
      'SELECT host_country FROM tournament WHERE host_country IS NOT NULL UNION SELECT country FROM player',
      'Both SELECTs must expose the same number and types of columns, in order.'
    ),
  },
  {
    skill: 'sl-date-functions',
    phaseId: 'sideline-subqueries',
    order: 7,
    title: 'Date functions',
    teach: teach(
      'Extract and compare date parts: tournament length in days, matches by month, contracts active on a date.',
      'Dates are values you can subtract, truncate, and slice into parts.',
      'SELECT name, (end_date - start_date) AS length_days FROM tournament',
      'date - date yields an integer number of days in Postgres.'
    ),
  },
  {
    skill: 'sl-scd-asof',
    phaseId: 'sideline-subqueries',
    order: 8,
    title: 'As-of / slowly changing lookups',
    teach: teach(
      'roster_change is a slowly changing history with from_date/to_date. An as-of query finds the stint that was open on a given date (to_date IS NULL or covers the date).',
      'Rewind the history to a moment and read the one row that was in effect then.',
      "SELECT rc.player_id, rc.team_id FROM roster_change rc WHERE rc.from_date <= DATE '2025-01-01' AND (rc.to_date IS NULL OR rc.to_date > DATE '2025-01-01')",
      'The open stint (to_date IS NULL) is the current row for a rostered player.'
    ),
  },
  {
    skill: 'sl-window-rank',
    phaseId: 'sideline-windows',
    order: 1,
    title: 'Ranking windows',
    teach: teach(
      'ROW_NUMBER / RANK / DENSE_RANK order rows within a partition without collapsing them, such as ranking teams by Elo inside each region.',
      'Number the rows inside each group by an ordering, keeping every row.',
      'SELECT name, region_id, RANK() OVER (PARTITION BY region_id ORDER BY elo_rating DESC) AS region_rank FROM team',
      'RANK leaves gaps after ties; DENSE_RANK does not; ROW_NUMBER is always unique.'
    ),
  },
  {
    skill: 'sl-window-lag-lead',
    phaseId: 'sideline-windows',
    order: 2,
    title: 'LAG and LEAD',
    teach: teach(
      'LAG and LEAD read a neighboring row within the partition: the previous or next match datetime for a team.',
      'Peek one row back or forward along the ordering without a self-join.',
      'SELECT match_id, winner_team_id, LAG(match_datetime) OVER (PARTITION BY winner_team_id ORDER BY match_datetime) AS prev_win FROM match',
      'The first row per partition has no previous neighbor, so LAG returns NULL there.'
    ),
  },
  {
    skill: 'sl-window-running',
    phaseId: 'sideline-windows',
    order: 3,
    title: 'Running totals',
    teach: teach(
      'SUM(...) OVER (ORDER BY ...) accumulates a running total, such as cumulative prize pool over the tournament calendar.',
      'Carry a growing subtotal down the ordered rows.',
      'SELECT name, start_date, SUM(prize_pool_usd) OVER (ORDER BY start_date, tournament_id) AS running_prize FROM tournament',
      'Add a unique tiebreak to ORDER BY so the running total is deterministic across ties.'
    ),
  },
  {
    skill: 'sl-window-frame-basic',
    phaseId: 'sideline-windows',
    order: 4,
    title: 'Basic window frames',
    teach: teach(
      'A frame (ROWS BETWEEN ...) limits which rows the window sees, enabling a simple moving average over adjacent rows.',
      'Slide a small fixed-size viewport along the ordered rows.',
      'SELECT tournament_id, prize_pool_usd, AVG(prize_pool_usd) OVER (ORDER BY start_date, tournament_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS smoothed FROM tournament',
      'Without a frame, ORDER BY implies RANGE UNBOUNDED PRECEDING, which is a running aggregate, not a sliding one.'
    ),
  },
];
export const SIDELINE_PHASES: PhaseMeta[] = [
  {
    id: 'sideline-joins',
    title: 'Joins',
    goal: 'Combine team, player, match, and sponsor tables with inner, outer, anti, semi, and self joins, including the two-FK winner/loser self-join.',
    level: 'intermediate',
    order: 1,
  },
  {
    id: 'sideline-subqueries',
    title: 'Subqueries, CTEs, and Set Operations',
    goal: 'Filter and compute with scalar, IN, and correlated subqueries; refactor with CTEs; use set operations, date functions, and as-of SCD lookups.',
    level: 'intermediate',
    order: 2,
  },
  {
    id: 'sideline-windows',
    title: 'Window Functions',
    goal: 'Rank, look forward and backward, accumulate running totals, and reason about a basic window frame over clean esports data.',
    level: 'intermediate',
    order: 3,
  },
];
export const SIDELINE_CHECKPOINTS: CheckpointMeta[] = [
  {
    id: 'cpF',
    phaseId: 'sideline-joins',
    afterOrder: 9,
    drawFromSkills: [
      'sl-join-inner', 'sl-join-multi', 'sl-join-left', 'sl-anti-join', 'sl-semi-join',
      'sl-self-join-match', 'sl-self-join-compare', 'sl-join-right-full', 'sl-join-aggregate',
    ],
    title: 'Joins checkpoint',
  },
  {
    id: 'cpG',
    phaseId: 'sideline-subqueries',
    afterOrder: 8,
    drawFromSkills: [
      'sl-case-expression', 'sl-subquery-scalar', 'sl-subquery-in', 'sl-subquery-correlated',
      'sl-cte', 'sl-set-ops', 'sl-date-functions', 'sl-scd-asof',
    ],
    title: 'Subqueries and dates checkpoint',
  },
  {
    id: 'cpH',
    phaseId: 'sideline-windows',
    afterOrder: 2,
    drawFromSkills: ['sl-window-rank', 'sl-window-lag-lead'],
    title: 'Windows mid checkpoint',
  },
  {
    id: 'cpI',
    phaseId: 'sideline-windows',
    afterOrder: 4,
    drawFromSkills: [...SIDELINE_SKILLS],
    title: 'Sideline capstone',
  },
];
