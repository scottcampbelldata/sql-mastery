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

function sidelineTemplate(
  config: Omit<Template, 'database' | 'scaffoldPlan' | 'gateHints'> & { gateHints?: GateHints }
): Template {
  const { gateHints, ...rest } = config;
  const sqlShape = /\blimit\b/i.test(rest.sqlShape) ? rest.sqlShape : `${rest.sqlShape} LIMIT 200`;
  return { ...rest, sqlShape, database: 'sideline', scaffoldPlan: PLAN, gateHints: gateHints ?? gh(2, 2, true) };
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
    'Find pairs of teams in the same region with equal elo_rating. Return team_id, team_a_name, team_b_name, keeping each pair once with the lower team_id first. Order by team_id.',
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
    'Label each team as tier: elite when elo_rating >= 1800, mid when elo_rating >= 1500, else developing. Return team_id, team_name, tier. Order by team_id.',
    'Use CASE to bucket elo_rating into tier (elite at 1800 or more, mid at 1500 or more, else developing) and return team_id, team_name, tier, ordered by team_id.',
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

const joinMultiTemplates: Template[] = [
  tJoinMulti,
  sidelineTemplate({
    skill: 'sl-join-multi',
    family: 'join',
    primaryTable: 'match',
    sqlShape:
      'SELECT m.match_id AS match_id, m.stage AS stage, t.name AS tournament_name, w.name AS winner_name ' +
      "FROM match m JOIN tournament t ON t.tournament_id = m.tournament_id JOIN team w ON w.team_id = m.winner_team_id WHERE t.tier = '{tierValue}' LIMIT {topN}",
    slots: [
      { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
      { name: 'topN', kind: 'limit' },
      { name: 'sortKey', kind: 'sortKey', table: 'match' },
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'match_id' }],
    phrasings: [
      'For tier {tierValue} tournaments, join match to tournament and winner team, returning the first {topN} match_id, stage, tournament_name, and winner_name rows. Order by match_id.',
      'Chain match to tournament to team and return {topN} match_id, stage, tournament_name, winner_name rows for tier {tierValue}, ordered by match_id.',
    ],
    hintTemplate: 'Follow match.tournament_id to tournament, then match.winner_team_id to team.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-multi',
    family: 'join',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT mr.map_result_id AS map_result_id, mr.map_name AS map_name, a.name AS team_a_name, b.name AS team_b_name ' +
      'FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN team a ON a.team_id = m.team_a_id JOIN team b ON b.team_id = m.team_b_id LIMIT {topN}',
    slots: [
      { name: 'topN', kind: 'limit' },
      { name: 'sortKey', kind: 'sortKey', table: 'map_result' },
    ],
    bindingRules: [{ slot: 'sortKey', predicate: (value: string) => value === 'map_result_id' }],
    phrasings: [
      'Join map_result to match and both team aliases, returning the first {topN} map_result_id, map_name, team_a_name, and team_b_name rows. Order by map_result_id.',
      'Chain map_result to match to two team aliases and return {topN} map_result_id, map_name, team_a_name, team_b_name rows ordered by map_result_id.',
    ],
    hintTemplate: 'Use two team aliases so team_a_id and team_b_id can both be named in one result.',
    gateHints: gh(3, 2, true),
  }),
];

function withSort(slots: Template['slots'], table: string, value: string): Pick<Template, 'slots' | 'bindingRules'> {
  return {
    slots: [...slots, { name: 'sortKey', kind: 'sortKey', table }],
    bindingRules: [{ slot: 'sortKey', predicate: (candidate: string) => candidate === value }],
  };
}

function sortBy(table: string, value: string): Pick<Template, 'slots' | 'bindingRules'> {
  return withSort([], table, value);
}

function groupedBy(table: string, value: string): Pick<Template, 'slots' | 'bindingRules'> {
  return {
    slots: [{ name: 'groupCols', kind: 'groupCols', table }],
    bindingRules: [{ slot: 'groupCols', predicate: (candidate: string) => candidate === value }],
  };
}

function windowBy(table: string, partition: string, rank: string): Pick<Template, 'slots' | 'bindingRules'> {
  return {
    slots: [
      { name: 'partitionCols', kind: 'partitionCols', table },
      { name: 'rankKey', kind: 'rankKey', table },
    ],
    bindingRules: [
      { slot: 'partitionCols', predicate: (candidate: string) => candidate === partition },
      { slot: 'rankKey', predicate: (candidate: string) => candidate === rank },
    ],
  };
}

const joinLeftTemplates: Template[] = [
  tJoinLeft,
  sidelineTemplate({
    skill: 'sl-join-left',
    family: 'join',
    primaryTable: 'player',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, p.player_id AS player_id, p.handle AS handle ' +
      'FROM team t LEFT JOIN player p ON p.team_id = t.team_id',
    ...withSort([], 'player', 'team_id'),
    phrasings: [
      'List every team and its rostered players (if any) as team_id, team_name, player_id, handle, keeping teams without players. Order by team_id, player_id.',
      'LEFT JOIN team to player and return team_id, team_name, player_id, handle, ordered by team_id, player_id.',
    ],
    hintTemplate: 'The team table is preserved, so teams with no players keep NULL player columns.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-left',
    family: 'join',
    primaryTable: 'team_sponsor',
    sqlShape:
      'SELECT s.sponsor_id AS sponsor_id, s.name AS sponsor_name, ts.team_id AS team_id, ts.contract_start AS contract_start ' +
      'FROM sponsor s LEFT JOIN team_sponsor ts ON ts.sponsor_id = s.sponsor_id',
    ...withSort([], 'team_sponsor', 'sponsor_id'),
    phrasings: [
      'List every sponsor and its team deals (if any) as sponsor_id, sponsor_name, team_id, contract_start, keeping sponsors with no deals. Order by sponsor_id, team_id, contract_start.',
      'LEFT JOIN sponsor to team_sponsor and return sponsor_id, sponsor_name, team_id, contract_start, ordered by sponsor_id, team_id, contract_start.',
    ],
    hintTemplate: 'Sponsors stay in the result even when no team_sponsor row exists.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-left',
    family: 'join',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT r.region_id AS region_id, r.name AS region_name, t.tournament_id AS tournament_id, t.name AS tournament_name ' +
      'FROM region r LEFT JOIN tournament t ON t.region_id = r.region_id',
    ...withSort([], 'tournament', 'region_id'),
    phrasings: [
      'List every region and its hosted tournaments (if any) as region_id, region_name, tournament_id, tournament_name. Order by region_id, tournament_id.',
      'LEFT JOIN region to tournament and return region_id, region_name, tournament_id, tournament_name, ordered by region_id, tournament_id.',
    ],
    hintTemplate: 'A LEFT JOIN from region keeps every region even if the tournament side is missing.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-left',
    family: 'join',
    primaryTable: 'team_sponsor',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, ts.sponsor_id AS sponsor_id, ts.contract_start AS contract_start ' +
      'FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id AND ts.contract_end IS NULL',
    ...withSort([], 'team_sponsor', 'team_id'),
    phrasings: [
      'List every team and its active sponsor deals (if any) as team_id, team_name, sponsor_id, contract_start, keeping teams with no active sponsor. Order by team_id, sponsor_id, contract_start.',
      'LEFT JOIN team to active team_sponsor rows and return team_id, team_name, sponsor_id, contract_start, ordered by team_id, sponsor_id, contract_start.',
    ],
    hintTemplate: 'Put contract_end IS NULL inside the ON clause so teams without active sponsors are still kept.',
    gateHints: gh(3, 2, true),
  }),
];

const antiJoinTemplates: Template[] = [
  antiJoinNeverPlayed,
  antiJoinSponsorless,
  antiJoinTeamlessSponsor,
  antiJoinPlayerless,
  sidelineTemplate({
    skill: 'sl-anti-join',
    family: 'join',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT t.tournament_id AS tournament_id, t.name AS tournament_name FROM tournament t ' +
      'LEFT JOIN region r ON r.region_id = t.region_id WHERE r.region_id IS NULL',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'List tournament_id and tournament_name for tournaments that have no matching region row. Order by tournament_id.',
      'Anti-join tournament to region to find international tournaments; return tournament_id, tournament_name ordered by tournament_id.',
    ],
    hintTemplate: 'A NULL tournament.region_id cannot match region, so the left join exposes international tournaments.',
    gateHints: gh(1, 1, true),
  }),
];

const semiJoinTemplates: Template[] = [
  tSemiJoin,
  sidelineTemplate({
    skill: 'sl-semi-join',
    family: 'join',
    primaryTable: 'team',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name FROM team t ' +
      'WHERE EXISTS (SELECT 1 FROM player p WHERE p.team_id = t.team_id)',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'List team_id and team_name for teams that have at least one player. Order by team_id.',
      'Use EXISTS against player to return teams with rostered players as team_id, team_name, ordered by team_id.',
    ],
    hintTemplate: 'EXISTS keeps each team once even if many players match.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-semi-join',
    family: 'join',
    primaryTable: 'sponsor',
    sqlShape:
      'SELECT s.sponsor_id AS sponsor_id, s.name AS sponsor_name FROM sponsor s ' +
      'WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.sponsor_id = s.sponsor_id)',
    ...sortBy('sponsor', 'sponsor_id'),
    phrasings: [
      'List sponsor_id and sponsor_name for sponsors that have at least one team deal. Order by sponsor_id.',
      'Use EXISTS against team_sponsor to return active or historical sponsors once, ordered by sponsor_id.',
    ],
    hintTemplate: 'The semi-join tests for membership without duplicating sponsors by deal count.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-semi-join',
    family: 'join',
    primaryTable: 'player',
    sqlShape:
      'SELECT p.player_id AS player_id, p.handle AS handle FROM player p ' +
      'WHERE EXISTS (SELECT 1 FROM roster_change rc WHERE rc.player_id = p.player_id)',
    ...sortBy('player', 'player_id'),
    phrasings: [
      'List player_id and handle for players that have at least one roster_change row. Order by player_id.',
      'Use EXISTS against roster_change to return players with roster history as player_id, handle, ordered by player_id.',
    ],
    hintTemplate: 'EXISTS is a yes/no roster-history test for each player.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-semi-join',
    family: 'join',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT t.tournament_id AS tournament_id, t.name AS tournament_name FROM tournament t ' +
      'WHERE EXISTS (SELECT 1 FROM match m WHERE m.tournament_id = t.tournament_id)',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'List tournament_id and tournament_name for tournaments that have at least one match. Order by tournament_id.',
      'Use EXISTS against match to return tournaments with match activity as tournament_id, tournament_name, ordered by tournament_id.',
    ],
    hintTemplate: 'The EXISTS subquery checks whether any match points back to the tournament.',
    gateHints: gh(3, 2, true),
  }),
];

const selfJoinCompareTemplates: Template[] = [
  tSelfJoinCompare,
  sidelineTemplate({
    skill: 'sl-self-join-compare',
    family: 'join',
    primaryTable: 'team',
    sqlShape:
      'SELECT a.team_id AS team_id, a.name AS team_name, b.team_id AS peer_team_id, b.name AS peer_team_name ' +
      'FROM team a JOIN team b ON b.region_id = a.region_id AND b.team_id > a.team_id ' +
      'WHERE b.team_id = (SELECT min(c.team_id) FROM team c WHERE c.region_id = a.region_id AND c.team_id > a.team_id)',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'For each team with a higher-id team in the same region, return team_id, team_name, peer_team_id, peer_team_name for the next peer. Order by team_id.',
      'Self-join team to the next same-region peer and return team_id, team_name, peer_team_id, peer_team_name ordered by team_id.',
    ],
    hintTemplate: 'The correlated min() picks one peer per left team, keeping team_id unique.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-self-join-compare',
    family: 'join',
    primaryTable: 'player',
    sqlShape:
      'SELECT a.player_id AS player_id, a.handle AS handle, b.player_id AS peer_player_id, b.handle AS peer_handle ' +
      'FROM player a JOIN player b ON b.country = a.country AND b.role = a.role AND b.player_id > a.player_id ' +
      'WHERE b.player_id = (SELECT min(c.player_id) FROM player c WHERE c.country = a.country AND c.role = a.role AND c.player_id > a.player_id)',
    ...sortBy('player', 'player_id'),
    phrasings: [
      'For each player with a higher-id peer in the same country and role, return player_id, handle, peer_player_id, peer_handle. Order by player_id.',
      'Self-join player to the next same-country same-role peer and return player_id, handle, peer_player_id, peer_handle ordered by player_id.',
    ],
    hintTemplate: 'Use a self-join for candidate peers and a correlated min() to keep only the next one.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-self-join-compare',
    family: 'join',
    primaryTable: 'sponsor',
    sqlShape:
      'SELECT a.sponsor_id AS sponsor_id, a.name AS sponsor_name, b.sponsor_id AS peer_sponsor_id, b.name AS peer_sponsor_name ' +
      'FROM sponsor a JOIN sponsor b ON b.headquarters_country = a.headquarters_country AND b.sponsor_id > a.sponsor_id ' +
      'WHERE b.sponsor_id = (SELECT min(c.sponsor_id) FROM sponsor c WHERE c.headquarters_country = a.headquarters_country AND c.sponsor_id > a.sponsor_id)',
    ...sortBy('sponsor', 'sponsor_id'),
    phrasings: [
      'For each sponsor with a higher-id sponsor in the same headquarters_country, return sponsor_id, sponsor_name, peer_sponsor_id, peer_sponsor_name. Order by sponsor_id.',
      'Self-join sponsor to the next headquarters-country peer and return sponsor_id, sponsor_name, peer_sponsor_id, peer_sponsor_name ordered by sponsor_id.',
    ],
    hintTemplate: 'The self-join compares sponsors within one headquarters country.',
    gateHints: gh(1, 1, true),
  }),
  sidelineTemplate({
    skill: 'sl-self-join-compare',
    family: 'join',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT a.tournament_id AS tournament_id, a.name AS tournament_name, b.tournament_id AS peer_tournament_id, b.name AS peer_tournament_name ' +
      'FROM tournament a JOIN tournament b ON b.tier = a.tier AND b.tournament_id > a.tournament_id ' +
      'WHERE b.tournament_id = (SELECT min(c.tournament_id) FROM tournament c WHERE c.tier = a.tier AND c.tournament_id > a.tournament_id)',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'For each tournament with a higher-id tournament in the same tier, return tournament_id, tournament_name, peer_tournament_id, peer_tournament_name. Order by tournament_id.',
      'Self-join tournament to the next same-tier peer and return tournament_id, tournament_name, peer_tournament_id, peer_tournament_name ordered by tournament_id.',
    ],
    hintTemplate: 'The self-join pairs tournaments inside the same tier and the min() narrows each left row to one peer.',
    gateHints: gh(3, 2, true),
  }),
];

const joinRightFullTemplates: Template[] = [
  tJoinRightFull,
  sidelineTemplate({
    skill: 'sl-join-right-full',
    family: 'join',
    primaryTable: 'sponsor',
    sqlShape:
      'SELECT s.sponsor_id AS sponsor_id, s.name AS sponsor_name, ts.team_id AS team_id ' +
      'FROM sponsor s FULL OUTER JOIN team_sponsor ts ON ts.sponsor_id = s.sponsor_id WHERE s.sponsor_id IS NULL OR ts.team_id IS NULL',
    ...sortBy('sponsor', 'sponsor_id'),
    phrasings: [
      'FULL OUTER JOIN sponsor to team_sponsor and keep unmatched rows. Return sponsor_id, sponsor_name, team_id. Order by sponsor_id.',
      'Show the outer edge of sponsor versus team_sponsor as sponsor_id, sponsor_name, team_id, ordered by sponsor_id.',
    ],
    hintTemplate: 'The unmatched filter keeps rows where either side of the full join is missing.',
    gateHints: gh(1, 1, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-right-full',
    family: 'join',
    primaryTable: 'player',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, p.player_id AS player_id, p.handle AS handle ' +
      'FROM team t FULL OUTER JOIN player p ON p.team_id = t.team_id WHERE t.team_id IS NULL OR p.player_id IS NULL',
    ...withSort([], 'player', 'team_id'),
    phrasings: [
      'FULL OUTER JOIN team to player and keep unmatched rows. Return team_id, team_name, player_id, handle. Order by team_id, player_id.',
      'Show teams without players and free agents from a full join of team and player, ordered by team_id, player_id.',
    ],
    hintTemplate: 'A player with NULL team_id appears on the player-only side of the full outer join.',
    gateHints: gh(1, 1, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-right-full',
    family: 'join',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT t.tournament_id AS tournament_id, t.name AS tournament_name, r.region_id AS region_id, r.name AS region_name ' +
      'FROM tournament t FULL OUTER JOIN region r ON r.region_id = t.region_id WHERE t.tournament_id IS NULL OR r.region_id IS NULL',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'FULL OUTER JOIN tournament to region and keep unmatched rows. Return tournament_id, tournament_name, region_id, region_name. Order by tournament_id.',
      'Show tournaments without a region and regions without tournaments from a full outer join, ordered by tournament_id.',
    ],
    hintTemplate: 'International tournaments have no region match, so they survive the unmatched filter.',
    gateHints: gh(1, 1, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-right-full',
    family: 'join',
    primaryTable: 'team',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, m.match_id AS match_id ' +
      'FROM team t FULL OUTER JOIN match m ON m.team_a_id = t.team_id WHERE t.team_id IS NULL OR m.match_id IS NULL',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'FULL OUTER JOIN team to match team_a rows and keep unmatched rows. Return team_id, team_name, match_id. Order by team_id.',
      'Show teams that never appear as match team_a using a full outer join; return team_id, team_name, match_id ordered by team_id.',
    ],
    hintTemplate: 'A FULL OUTER JOIN requires a hashable equality condition, so match team_a_id to team_id.',
    gateHints: gh(1, 1, true),
  }),
];

const joinAggregateTemplates: Template[] = [
  tJoinAggregate,
  sidelineTemplate({
    skill: 'sl-join-aggregate',
    family: 'grouped',
    primaryTable: 'team',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, count(ts.sponsor_id) AS sponsor_count, sum(ts.annual_value_usd) AS sponsor_value ' +
      'FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id GROUP BY t.team_id, t.name',
    ...groupedBy('team', 'team_id'),
    phrasings: [
      'For each team, return team_id, team_name, sponsor_count, and sponsor_value from a left join to team_sponsor. Order by team_id.',
      'LEFT JOIN team to team_sponsor, group by team_id and team_name, and return sponsor_count plus sponsor_value ordered by team_id.',
    ],
    hintTemplate: 'The left join lets teams with no sponsor still form a group.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-aggregate',
    family: 'grouped',
    primaryTable: 'region',
    sqlShape:
      'SELECT r.region_id AS region_id, r.name AS region_name, count(m.match_id) AS match_count ' +
      'FROM region r JOIN tournament t ON t.region_id = r.region_id JOIN match m ON m.tournament_id = t.tournament_id GROUP BY r.region_id, r.name',
    ...groupedBy('region', 'region_id'),
    phrasings: [
      'For each region with matches, return region_id, region_name, and match_count. Order by region_id.',
      'Join region to tournament to match, group by region_id and region_name, and return match_count ordered by region_id.',
    ],
    hintTemplate: 'Join through tournament to connect matches back to regions before grouping.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-aggregate',
    family: 'grouped',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT t.tournament_id AS tournament_id, t.name AS tournament_name, count(mr.map_result_id) AS map_count, avg(mr.duration_minutes) AS avg_duration ' +
      'FROM tournament t JOIN match m ON m.tournament_id = t.tournament_id JOIN map_result mr ON mr.match_id = m.match_id GROUP BY t.tournament_id, t.name',
    ...groupedBy('tournament', 'tournament_id'),
    phrasings: [
      'For each tournament with maps, return tournament_id, tournament_name, map_count, and avg_duration. Order by tournament_id.',
      'Join tournament to match to map_result, group by tournament, and return map_count plus avg_duration ordered by tournament_id.',
    ],
    hintTemplate: 'Aggregate after joining down to map_result so each map contributes to the tournament summary.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-join-aggregate',
    family: 'grouped',
    primaryTable: 'player',
    sqlShape:
      'SELECT p.role AS role, count(p.player_id) AS player_count, avg(p.total_earnings_usd) AS avg_earnings ' +
      'FROM player p JOIN team t ON t.team_id = p.team_id GROUP BY p.role',
    ...groupedBy('player', 'role'),
    phrasings: [
      'For rostered players, return role, player_count, and avg_earnings after joining player to team. Order by role.',
      'Join player to team, group by role, and return player_count plus avg_earnings ordered by role.',
    ],
    hintTemplate: 'The join filters to rostered players before the role-level aggregate.',
    gateHints: gh(2, 2, true),
  }),
];

const caseExpressionTemplates: Template[] = [
  tCaseExpression,
  sidelineTemplate({
    skill: 'sl-case-expression',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      "SELECT player_id AS player_id, handle AS handle, CASE WHEN total_earnings_usd >= 100000 THEN 'veteran' WHEN total_earnings_usd >= 25000 THEN 'proven' ELSE 'prospect' END AS earnings_band FROM player",
    ...sortBy('player', 'player_id'),
    phrasings: [
      'Label each player as earnings_band: veteran when total_earnings_usd >= 100000, proven when >= 25000, else prospect. Return player_id, handle, earnings_band. Order by player_id.',
      'Use CASE on total_earnings_usd to bucket every player (veteran at 100000 or more, proven at 25000 or more, else prospect) as player_id, handle, earnings_band, ordered by player_id.',
    ],
    hintTemplate: 'CASE evaluates earnings thresholds from highest to lowest and falls through to the ELSE label.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-case-expression',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      "SELECT tournament_id AS tournament_id, name AS name, CASE WHEN prize_pool_usd >= 500000 THEN 'major' WHEN prize_pool_usd >= 150000 THEN 'regional' ELSE 'open' END AS prize_band FROM tournament",
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'Label each tournament as prize_band: major when prize_pool_usd >= 500000, regional when >= 150000, else open. Return tournament_id, name, prize_band. Order by tournament_id.',
      'Use CASE on prize_pool_usd to bucket tournaments (major at 500000 or more, regional at 150000 or more, else open) as tournament_id, name, prize_band, ordered by tournament_id.',
    ],
    hintTemplate: 'The CASE expression turns numeric prize thresholds into a readable band.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-case-expression',
    family: 'single-table',
    primaryTable: 'match',
    sqlShape:
      "SELECT match_id AS match_id, stage AS stage, CASE WHEN best_of = 5 THEN 'marathon' WHEN best_of = 3 THEN 'series' ELSE 'single_map' END AS format_label FROM match",
    ...sortBy('match', 'match_id'),
    phrasings: [
      'Label each match as format_label: marathon when best_of is 5, series when best_of is 3, else single_map. Return match_id, stage, format_label. Order by match_id.',
      'Use CASE on best_of (5 is marathon, 3 is series, anything else single_map) to return match_id, stage, format_label, ordered by match_id.',
    ],
    hintTemplate: 'CASE can map exact values such as best_of 1, 3, and 5 into labels.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-case-expression',
    family: 'single-table',
    primaryTable: 'team_sponsor',
    sqlShape:
      "SELECT team_id AS team_id, sponsor_id AS sponsor_id, contract_start AS contract_start, CASE WHEN contract_end IS NULL THEN 'active' ELSE 'ended' END AS contract_status FROM team_sponsor",
    ...sortBy('team_sponsor', 'team_id'),
    phrasings: [
      'Label each sponsor contract as contract_status: active when contract_end is NULL, else ended. Return team_id, sponsor_id, contract_start, contract_status. Order by team_id, sponsor_id, contract_start.',
      'Use CASE on contract_end (NULL means active, anything else ended) to return team_id, sponsor_id, contract_start, contract_status, ordered by team_id, sponsor_id, contract_start.',
    ],
    hintTemplate: 'A NULL contract_end marks an active contract; non-NULL dates mark ended contracts.',
    gateHints: gh(3, 2, true),
  }),
];

const subqueryScalarTemplates: Template[] = [
  tSubqueryScalar,
  sidelineTemplate({
    skill: 'sl-subquery-scalar',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, handle AS handle, total_earnings_usd AS total_earnings_usd FROM player ' +
      'WHERE total_earnings_usd > (SELECT avg(total_earnings_usd) FROM player)',
    ...sortBy('player', 'player_id'),
    phrasings: [
      'List players whose total_earnings_usd is above the overall player average. Return player_id, handle, total_earnings_usd. Order by player_id.',
      'Compare each player to a scalar average earnings subquery and return player_id, handle, total_earnings_usd, ordered by player_id.',
    ],
    hintTemplate: 'The subquery returns one average earnings value for the outer WHERE comparison.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-scalar',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, name AS name, prize_pool_usd AS prize_pool_usd FROM tournament ' +
      'WHERE prize_pool_usd > (SELECT avg(prize_pool_usd) FROM tournament)',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'List tournaments whose prize_pool_usd is above the overall average. Return tournament_id, name, prize_pool_usd. Order by tournament_id.',
      'Compare each tournament to the scalar average prize_pool_usd subquery and return tournament_id, name, prize_pool_usd, ordered by tournament_id.',
    ],
    hintTemplate: 'A scalar aggregate subquery can be used like a single numeric value.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-scalar',
    family: 'single-table',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT map_result_id AS map_result_id, map_name AS map_name, duration_minutes AS duration_minutes FROM map_result ' +
      'WHERE duration_minutes > (SELECT avg(duration_minutes) FROM map_result)',
    ...sortBy('map_result', 'map_result_id'),
    phrasings: [
      'List maps whose duration_minutes is above the overall map average. Return map_result_id, map_name, duration_minutes. Order by map_result_id.',
      'Use a scalar average duration subquery and return map_result_id, map_name, duration_minutes for longer maps, ordered by map_result_id.',
    ],
    hintTemplate: 'The inner AVG returns one duration threshold for all outer map rows.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-scalar',
    family: 'single-table',
    primaryTable: 'team',
    sqlShape:
      'SELECT team_id AS team_id, name AS team_name, founded_date AS founded_date FROM team ' +
      'WHERE founded_date < (SELECT min(start_date) FROM tournament)',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'List teams founded before the earliest tournament start_date. Return team_id, team_name, founded_date. Order by team_id.',
      'Compare founded_date to a scalar min tournament start_date subquery and return team_id, team_name, founded_date ordered by team_id.',
    ],
    hintTemplate: 'The min(start_date) subquery returns one date for every team to compare against.',
    gateHints: gh(2, 2, true),
  }),
];

const subqueryInTemplates: Template[] = [
  tSubqueryIn,
  sidelineTemplate({
    skill: 'sl-subquery-in',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, handle AS handle FROM player WHERE team_id IN (SELECT winner_team_id FROM match)',
    ...sortBy('player', 'player_id'),
    phrasings: [
      'List players whose team_id appears among match winners. Return player_id and handle. Order by player_id.',
      'Use team_id IN a subquery of winner_team_id values and return player_id, handle ordered by player_id.',
    ],
    hintTemplate: 'The subquery builds the set of teams that have won at least one match.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-in',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, name AS name FROM tournament WHERE tournament_id IN (SELECT tournament_id FROM match WHERE best_of = 5)',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'List tournaments that include at least one best_of 5 match. Return tournament_id and name. Order by tournament_id.',
      'Use tournament_id IN a subquery of best_of 5 matches and return tournament_id, name ordered by tournament_id.',
    ],
    hintTemplate: 'The match subquery supplies tournament ids that had a best-of-5 match.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-in',
    family: 'single-table',
    primaryTable: 'sponsor',
    sqlShape:
      'SELECT sponsor_id AS sponsor_id, name AS sponsor_name FROM sponsor WHERE sponsor_id IN (SELECT sponsor_id FROM team_sponsor WHERE contract_end IS NULL)',
    ...sortBy('sponsor', 'sponsor_id'),
    phrasings: [
      'List sponsors with at least one active contract. Return sponsor_id and sponsor_name. Order by sponsor_id.',
      'Use sponsor_id IN a subquery of active team_sponsor rows and return sponsor_id, sponsor_name ordered by sponsor_id.',
    ],
    hintTemplate: 'The subquery keeps sponsor ids from open contracts only.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-in',
    family: 'single-table',
    primaryTable: 'region',
    sqlShape:
      'SELECT region_id AS region_id, name AS region_name FROM region WHERE region_id IN (SELECT region_id FROM team WHERE elo_rating >= 1800)',
    ...sortBy('region', 'region_id'),
    phrasings: [
      'List regions that have at least one team with elo_rating >= 1800. Return region_id and region_name. Order by region_id.',
      'Use region_id IN a subquery of teams with elo_rating >= 1800 and return region_id, region_name ordered by region_id.',
    ],
    hintTemplate: 'The inner query creates the set of regions with at least one high-Elo team.',
    gateHints: gh(2, 2, true),
  }),
];

const subqueryCorrelatedTemplates: Template[] = [
  tSubqueryCorrelated,
  sidelineTemplate({
    skill: 'sl-subquery-correlated',
    family: 'single-table',
    primaryTable: 'team',
    sqlShape:
      'SELECT t.team_id AS team_id, t.name AS team_name, t.elo_rating AS elo_rating FROM team t ' +
      'WHERE t.elo_rating > (SELECT avg(t2.elo_rating) FROM team t2 WHERE t2.region_id = t.region_id)',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'List teams whose elo_rating is above their own region average. Return team_id, team_name, elo_rating. Order by team_id.',
      'Use a correlated subquery on region_id to compare each team to regional peers and return team_id, team_name, elo_rating ordered by team_id.',
    ],
    hintTemplate: 'The inner average references the outer team region_id.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-correlated',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT t.tournament_id AS tournament_id, t.name AS name, t.prize_pool_usd AS prize_pool_usd FROM tournament t ' +
      'WHERE t.prize_pool_usd > (SELECT avg(t2.prize_pool_usd) FROM tournament t2 WHERE t2.tier = t.tier)',
    ...sortBy('tournament', 'tournament_id'),
    phrasings: [
      'List tournaments whose prize_pool_usd is above their own tier average. Return tournament_id, name, prize_pool_usd. Order by tournament_id.',
      'Use a correlated subquery on tier to compare each tournament to tier peers and return tournament_id, name, prize_pool_usd ordered by tournament_id.',
    ],
    hintTemplate: 'The subquery recomputes the average prize pool for the outer tournament tier.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-correlated',
    family: 'single-table',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT mr.map_result_id AS map_result_id, mr.map_name AS map_name, mr.duration_minutes AS duration_minutes FROM map_result mr ' +
      'WHERE mr.duration_minutes > (SELECT avg(mr2.duration_minutes) FROM map_result mr2 WHERE mr2.map_name = mr.map_name)',
    ...sortBy('map_result', 'map_result_id'),
    phrasings: [
      'List map results whose duration_minutes is above the average for that same map_name. Return map_result_id, map_name, duration_minutes. Order by map_result_id.',
      'Use a correlated subquery on map_name and return longer-than-map-average rows as map_result_id, map_name, duration_minutes ordered by map_result_id.',
    ],
    hintTemplate: 'The inner query filters to the current outer map_name before averaging.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-subquery-correlated',
    family: 'single-table',
    primaryTable: 'match',
    sqlShape:
      'SELECT m.match_id AS match_id, m.stage AS stage, m.best_of AS best_of FROM match m ' +
      'WHERE m.best_of > (SELECT avg(m2.best_of) FROM match m2 WHERE m2.stage = m.stage)',
    ...sortBy('match', 'match_id'),
    phrasings: [
      'List matches whose best_of is above the average for their own stage. Return match_id, stage, best_of. Order by match_id.',
      'Use a correlated subquery on stage to compare each match format and return match_id, stage, best_of ordered by match_id.',
    ],
    hintTemplate: 'The inner average is tied to the outer match stage.',
    gateHints: gh(2, 2, true),
  }),
];

const cteTemplates: Template[] = [
  tCte,
  sidelineTemplate({
    skill: 'sl-cte',
    family: 'join',
    primaryTable: 'team',
    sqlShape:
      'SELECT team_id, team_name, sponsor_count FROM (' +
      'WITH sponsor_counts AS (SELECT team_id, count(*) AS sponsor_count FROM team_sponsor GROUP BY team_id) ' +
      'SELECT t.team_id AS team_id, t.name AS team_name, sc.sponsor_count AS sponsor_count FROM team t JOIN sponsor_counts sc ON sc.team_id = t.team_id' +
      ') sponsored_team_counts',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'Using a CTE that counts sponsors per team, return team_id, team_name, sponsor_count. Order by team_id.',
      'Define WITH sponsor_counts, join it to team, and return team_id, team_name, sponsor_count ordered by team_id.',
    ],
    hintTemplate: 'The CTE creates one count row per sponsored team before the final join.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-cte',
    family: 'grouped',
    primaryTable: 'player',
    sqlShape:
      'SELECT role, player_count FROM (' +
      'WITH role_counts AS (SELECT role AS role, count(*) AS player_count FROM player GROUP BY role) ' +
      'SELECT role AS role, player_count AS player_count FROM role_counts' +
      ') role_summary',
    ...groupedBy('player', 'role'),
    phrasings: [
      'Using a CTE that counts players per role, return role and player_count. Order by role.',
      'Define WITH role_counts and return role, player_count ordered by role.',
    ],
    hintTemplate: 'A CTE can name an aggregate result before the outer SELECT reads it.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-cte',
    family: 'grouped',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tier, total_prize FROM (' +
      'WITH tier_prizes AS (SELECT tier AS tier, sum(prize_pool_usd) AS total_prize FROM tournament GROUP BY tier) ' +
      'SELECT tier AS tier, total_prize AS total_prize FROM tier_prizes' +
      ') prize_by_tier',
    ...groupedBy('tournament', 'tier'),
    phrasings: [
      'Using a CTE that sums prize pools per tier, return tier and total_prize. Order by tier.',
      'Define WITH tier_prizes and return tier, total_prize ordered by tier.',
    ],
    hintTemplate: 'The WITH clause names the tier aggregate for the outer query.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-cte',
    family: 'join',
    primaryTable: 'team',
    sqlShape:
      'SELECT team_id, team_name, current_players FROM (' +
      'WITH current_roster AS (SELECT team_id, count(*) AS current_players FROM roster_change WHERE to_date IS NULL GROUP BY team_id) ' +
      'SELECT t.team_id AS team_id, t.name AS team_name, cr.current_players AS current_players FROM team t JOIN current_roster cr ON cr.team_id = t.team_id' +
      ') current_roster_counts',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'Using a CTE that counts current roster stints, return team_id, team_name, current_players. Order by team_id.',
      'Define WITH current_roster, join it to team, and return team_id, team_name, current_players ordered by team_id.',
    ],
    hintTemplate: 'Filter open roster_change rows inside the CTE, then join the summary to team.',
    gateHints: gh(2, 2, true),
  }),
];

const setOpsTemplates: Template[] = [
  tSetOps,
  sidelineTemplate({
    skill: 'sl-set-ops',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      'SELECT DISTINCT role AS role FROM (' +
      'SELECT role AS role FROM player UNION SELECT change_reason AS role FROM roster_change' +
      ') role_values',
    ...sortBy('player', 'role'),
    phrasings: [
      'Return the distinct set of player roles and roster change reasons in one role column. Order by role.',
      'UNION player role with roster_change change_reason into role and return distinct values ordered by role.',
    ],
    hintTemplate: 'Both sides of the UNION expose one text column named role.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-set-ops',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      'SELECT DISTINCT country AS country FROM (' +
      'SELECT country AS country FROM player INTERSECT SELECT host_country AS country FROM tournament' +
      ') shared_countries',
    ...sortBy('player', 'country'),
    phrasings: [
      'Return countries that appear as both a player country and a tournament host_country. Order by country.',
      'INTERSECT player country with tournament host_country and return distinct country values ordered by country.',
    ],
    hintTemplate: 'INTERSECT keeps only values present in both same-shaped SELECTs.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-set-ops',
    family: 'single-table',
    primaryTable: 'team',
    sqlShape:
      'SELECT DISTINCT team_id AS team_id FROM (' +
      'SELECT team_id AS team_id FROM team EXCEPT SELECT winner_team_id AS team_id FROM match' +
      ') winless_teams',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'Return team_id values for teams that do not appear as a match winner. Order by team_id.',
      'Use EXCEPT to subtract winner_team_id values from team_id values and return team_id ordered by team_id.',
    ],
    hintTemplate: 'EXCEPT returns values from the first SELECT that are absent from the second.',
    gateHints: gh(1, 1, true),
  }),
  sidelineTemplate({
    skill: 'sl-set-ops',
    family: 'single-table',
    primaryTable: 'team',
    sqlShape:
      'SELECT DISTINCT team_id AS team_id FROM (' +
      'SELECT team_a_id AS team_id FROM match UNION SELECT team_b_id AS team_id FROM match' +
      ') participating_teams',
    ...sortBy('team', 'team_id'),
    phrasings: [
      'Return distinct team_id values for teams that appeared as team_a or team_b in a match. Order by team_id.',
      'UNION match team_a_id and team_b_id into one team_id column and return distinct values ordered by team_id.',
    ],
    hintTemplate: 'UNION deduplicates teams appearing on either side of the match.',
    gateHints: gh(2, 2, true),
  }),
];

const dateFunctionTemplates: Template[] = [
  tDateFunctions,
  sidelineTemplate({
    skill: 'sl-date-functions',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      "SELECT tournament_id AS tournament_id, name AS name, EXTRACT(YEAR FROM start_date) AS start_year FROM tournament WHERE tier = '{tierValue}'",
    ...withSort([
      { name: 'tierValue', kind: 'literal', op: '=', col: 'tier', table: 'tournament', sampleStrategy: 'single' },
    ], 'tournament', 'tournament_id'),
    phrasings: [
      'For tier {tierValue} tournaments, extract start_year from start_date. Return tournament_id, name, start_year. Order by tournament_id.',
      'Use EXTRACT(YEAR FROM start_date) for tier {tierValue} tournaments and return tournament_id, name, start_year ordered by tournament_id.',
    ],
    hintTemplate: 'EXTRACT pulls one date part from each tournament start_date.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-date-functions',
    family: 'join',
    primaryTable: 'team_sponsor',
    sqlShape:
      "SELECT team_id AS team_id, sponsor_id AS sponsor_id, contract_start AS contract_start, (COALESCE(contract_end, DATE '2025-12-31') - contract_start) AS contract_days FROM team_sponsor",
    ...sortBy('team_sponsor', 'team_id'),
    phrasings: [
      'Compute contract_days for each sponsor contract using contract_end or 2025-12-31 when open. Return team_id, sponsor_id, contract_start, contract_days. Order by team_id, sponsor_id, contract_start.',
      'Use COALESCE(contract_end, DATE 2025-12-31) minus contract_start and return team_id, sponsor_id, contract_start, contract_days ordered by team_id, sponsor_id, contract_start.',
    ],
    hintTemplate: 'COALESCE supplies a stand-in end date before subtracting dates.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-date-functions',
    family: 'single-table',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, handle AS handle, (signed_date - birth_date) AS days_to_sign FROM player WHERE signed_date IS NOT NULL AND birth_date IS NOT NULL',
    ...sortBy('player', 'player_id'),
    phrasings: [
      'For players with both dates, compute days_to_sign as signed_date minus birth_date. Return player_id, handle, days_to_sign. Order by player_id.',
      'Subtract birth_date from signed_date and return player_id, handle, days_to_sign for dated player rows ordered by player_id.',
    ],
    hintTemplate: 'Date subtraction returns an integer day count.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-date-functions',
    family: 'single-table',
    primaryTable: 'tournament',
    sqlShape:
      "SELECT tournament_id AS tournament_id, name AS name, date_trunc('month', start_date)::date AS start_month FROM tournament WHERE host_country = '{countryValue}'",
    ...withSort([
      { name: 'countryValue', kind: 'literal', op: '=', col: 'host_country', table: 'tournament', sampleStrategy: 'single' },
    ], 'tournament', 'tournament_id'),
    phrasings: [
      'For tournaments hosted in {countryValue}, truncate start_date to start_month. Return tournament_id, name, start_month. Order by tournament_id.',
      'Use date_trunc month on start_date for host_country {countryValue} and return tournament_id, name, start_month ordered by tournament_id.',
    ],
    hintTemplate: 'date_trunc can snap each date to the first instant of its month, then the cast returns a date.',
    gateHints: gh(2, 2, true),
  }),
];

const scdAsofTemplates: Template[] = [
  tScdAsof,
  sidelineTemplate({
    skill: 'sl-scd-asof',
    family: 'single-table',
    primaryTable: 'roster_change',
    sqlShape:
      'SELECT rc.roster_change_id AS roster_change_id, rc.player_id AS player_id, rc.team_id AS team_id, rc.from_date AS from_date ' +
      'FROM roster_change rc WHERE rc.to_date IS NULL LIMIT {topN}',
    ...withSort([{ name: 'topN', kind: 'limit' }], 'roster_change', 'roster_change_id'),
    phrasings: [
      'List the first {topN} currently active roster stints as roster_change_id, player_id, team_id, from_date. Order by roster_change_id.',
      'Use open-ended roster_change rows and return {topN} roster_change_id, player_id, team_id, from_date rows ordered by roster_change_id.',
    ],
    hintTemplate: 'For current as-of rows, to_date IS NULL marks the open stint.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-scd-asof',
    family: 'single-table',
    primaryTable: 'roster_change',
    sqlShape:
      'SELECT rc.roster_change_id AS roster_change_id, rc.player_id AS player_id, rc.team_id AS team_id, rc.from_date AS from_date ' +
      "FROM roster_change rc WHERE rc.from_date <= DATE '2024-07-01' AND (rc.to_date IS NULL OR rc.to_date > DATE '2024-07-01') LIMIT {topN}",
    ...withSort([{ name: 'topN', kind: 'limit' }], 'roster_change', 'roster_change_id'),
    phrasings: [
      'As of 2024-07-01, list the first {topN} active roster stints as roster_change_id, player_id, team_id, from_date. Order by roster_change_id.',
      'Do an as-of lookup on roster_change for 2024-07-01 and return {topN} roster_change_id, player_id, team_id, from_date rows ordered by roster_change_id.',
    ],
    hintTemplate: 'The as-of date must be on or after from_date and before to_date unless the stint is open.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-scd-asof',
    family: 'join',
    primaryTable: 'roster_change',
    sqlShape:
      'SELECT rc.roster_change_id AS roster_change_id, rc.player_id AS player_id, rc.team_id AS team_id, p.signed_date AS signed_date ' +
      "FROM roster_change rc JOIN player p ON p.player_id = rc.player_id WHERE p.signed_date >= rc.from_date AND p.signed_date < COALESCE(rc.to_date, DATE '2026-01-01') LIMIT {topN}",
    ...withSort([{ name: 'topN', kind: 'limit' }], 'roster_change', 'roster_change_id'),
    phrasings: [
      'Find roster stints active on each player signed_date (treat an open to_date as 2026-01-01) and return {topN} roster_change_id, player_id, team_id, signed_date rows. Order by roster_change_id.',
      'Join roster_change to player and use signed_date as the as-of date, treating open stints as ending 2026-01-01, returning {topN} rows ordered by roster_change_id.',
    ],
    hintTemplate: 'Treat signed_date as the lookup date and test it against from_date and to_date.',
    gateHints: gh(2, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-scd-asof',
    family: 'single-table',
    primaryTable: 'roster_change',
    sqlShape:
      "SELECT rc.roster_change_id AS roster_change_id, rc.player_id AS player_id, rc.team_id AS team_id, rc.to_date AS to_date FROM roster_change rc WHERE rc.to_date IS NOT NULL AND rc.to_date <= DATE '2024-12-31' LIMIT {topN}",
    ...withSort([{ name: 'topN', kind: 'limit' }], 'roster_change', 'roster_change_id'),
    phrasings: [
      'List the first {topN} roster stints that had ended by 2024-12-31 as roster_change_id, player_id, team_id, to_date. Order by roster_change_id.',
      'Use to_date to find closed historical stints by 2024-12-31 and return {topN} rows ordered by roster_change_id.',
    ],
    hintTemplate: 'Closed history rows have a non-NULL to_date at or before the cutoff.',
    gateHints: gh(2, 2, true),
  }),
];

const windowRankTemplates: Template[] = [
  tWindowRank,
  sidelineTemplate({
    skill: 'sl-window-rank',
    family: 'windowed',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, tier AS tier, prize_pool_usd AS prize_pool_usd, DENSE_RANK() OVER (PARTITION BY tier) AS tier_rank FROM tournament',
    ...windowBy('tournament', 'tier', 'tournament_id'),
    phrasings: [
      'Dense-rank tournaments within each tier partition and return tournament_id, tier, prize_pool_usd, tier_rank. Order by tier and tournament_id.',
      'Use DENSE_RANK() with PARTITION BY tier and return tournament_id, tier, prize_pool_usd, tier_rank ordered by tier and tournament_id.',
    ],
    hintTemplate: 'DENSE_RANK emits a rank value per row without collapsing the partition.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-rank',
    family: 'windowed',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, role AS role, total_earnings_usd AS total_earnings_usd, ROW_NUMBER() OVER (PARTITION BY role) AS role_row FROM player',
    ...windowBy('player', 'role', 'player_id'),
    phrasings: [
      'Number players within each role partition and return player_id, role, total_earnings_usd, role_row. Order by role and player_id.',
      'Use ROW_NUMBER() with PARTITION BY role and return player_id, role, total_earnings_usd, role_row ordered by role and player_id.',
    ],
    hintTemplate: 'ROW_NUMBER assigns a per-row sequence within the role partition.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-rank',
    family: 'windowed',
    primaryTable: 'team',
    sqlShape:
      'SELECT team_id AS team_id, region_id AS region_id, elo_rating AS elo_rating, NTILE(4) OVER (PARTITION BY region_id) AS elo_quartile FROM team',
    ...windowBy('team', 'region_id', 'team_id'),
    phrasings: [
      'Assign teams to elo_quartile within each region partition and return team_id, region_id, elo_rating, elo_quartile. Order by region_id and team_id.',
      'Use NTILE(4) with PARTITION BY region_id and return team_id, region_id, elo_rating, elo_quartile ordered by region_id and team_id.',
    ],
    hintTemplate: 'NTILE divides rows in each partition into numbered buckets.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-rank',
    family: 'windowed',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT map_result_id AS map_result_id, map_name AS map_name, duration_minutes AS duration_minutes, RANK() OVER (PARTITION BY map_name) AS map_rank FROM map_result',
    ...windowBy('map_result', 'map_name', 'map_result_id'),
    phrasings: [
      'Rank map results within each map_name partition and return map_result_id, map_name, duration_minutes, map_rank. Order by map_name and map_result_id.',
      'Use RANK() with PARTITION BY map_name and return map_result_id, map_name, duration_minutes, map_rank ordered by map_name and map_result_id.',
    ],
    hintTemplate: 'PARTITION BY map_name restarts the rank for each map pool entry.',
    gateHints: gh(3, 2, true),
  }),
];

const windowLagLeadTemplates: Template[] = [
  tWindowLagLead,
  sidelineTemplate({
    skill: 'sl-window-lag-lead',
    family: 'windowed',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, region_id AS region_id, name AS name, start_date AS start_date, LEAD(start_date) OVER (PARTITION BY region_id) AS next_start FROM tournament WHERE region_id IS NOT NULL',
    ...windowBy('tournament', 'region_id', 'tournament_id'),
    phrasings: [
      'For each region partition, show each tournament with next_start from LEAD(start_date). Return tournament_id, region_id, name, start_date, next_start. Order by region_id and tournament_id.',
      'Use LEAD(start_date) with PARTITION BY region_id and return tournament_id, region_id, name, start_date, next_start ordered by region_id and tournament_id.',
    ],
    hintTemplate: 'LEAD reads the following row in the same partition.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-lag-lead',
    family: 'windowed',
    primaryTable: 'match',
    sqlShape:
      'SELECT match_id AS match_id, tournament_id AS tournament_id, match_datetime AS match_datetime, LAG(match_datetime) OVER (PARTITION BY tournament_id) AS prev_match_at FROM match',
    ...windowBy('match', 'tournament_id', 'match_id'),
    phrasings: [
      'For each tournament partition, show each match with prev_match_at from LAG(match_datetime). Return match_id, tournament_id, match_datetime, prev_match_at. Order by tournament_id and match_id.',
      'Use LAG(match_datetime) with PARTITION BY tournament_id and return match_id, tournament_id, match_datetime, prev_match_at ordered by tournament_id and match_id.',
    ],
    hintTemplate: 'LAG can look back within each tournament partition.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-lag-lead',
    family: 'windowed',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT map_result_id AS map_result_id, map_name AS map_name, duration_minutes AS duration_minutes, LEAD(duration_minutes) OVER (PARTITION BY map_name) AS next_duration FROM map_result',
    ...windowBy('map_result', 'map_name', 'map_result_id'),
    phrasings: [
      'For each map_name partition, show next_duration from LEAD(duration_minutes). Return map_result_id, map_name, duration_minutes, next_duration. Order by map_name and map_result_id.',
      'Use LEAD(duration_minutes) with PARTITION BY map_name and return map_result_id, map_name, duration_minutes, next_duration ordered by map_name and map_result_id.',
    ],
    hintTemplate: 'LEAD peeks forward without joining map_result to itself.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-lag-lead',
    family: 'windowed',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, role AS role, total_earnings_usd AS total_earnings_usd, LAG(total_earnings_usd) OVER (PARTITION BY role) AS prev_earnings FROM player',
    ...windowBy('player', 'role', 'player_id'),
    phrasings: [
      'For each role partition, show prev_earnings from LAG(total_earnings_usd). Return player_id, role, total_earnings_usd, prev_earnings. Order by role and player_id.',
      'Use LAG(total_earnings_usd) with PARTITION BY role and return player_id, role, total_earnings_usd, prev_earnings ordered by role and player_id.',
    ],
    hintTemplate: 'LAG reads the previous row in the same role partition.',
    gateHints: gh(3, 2, true),
  }),
];

const windowRunningTemplates: Template[] = [
  tWindowRunning,
  sidelineTemplate({
    skill: 'sl-window-running',
    family: 'windowed',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, tier AS tier, name AS name, prize_pool_usd AS prize_pool_usd, COUNT(*) OVER (PARTITION BY tier) AS tier_tournament_count FROM tournament',
    ...windowBy('tournament', 'tier', 'tournament_id'),
    phrasings: [
      'For each tier partition, calculate tier_tournament_count with a windowed COUNT. Return tournament_id, tier, name, prize_pool_usd, tier_tournament_count. Order by tier and tournament_id.',
      'Use COUNT(*) OVER (PARTITION BY tier) and return tournament_id, tier, name, prize_pool_usd, tier_tournament_count ordered by tier and tournament_id.',
    ],
    hintTemplate: 'A windowed COUNT keeps every tournament row while adding the partition count.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-running',
    family: 'windowed',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, role AS role, handle AS handle, total_earnings_usd AS total_earnings_usd, SUM(total_earnings_usd) OVER (PARTITION BY role) AS role_earnings FROM player',
    ...windowBy('player', 'role', 'player_id'),
    phrasings: [
      'For each role partition, calculate role_earnings with a windowed SUM. Return player_id, role, handle, total_earnings_usd, role_earnings. Order by role and player_id.',
      'Use SUM(total_earnings_usd) OVER (PARTITION BY role) and return player_id, role, handle, total_earnings_usd, role_earnings ordered by role and player_id.',
    ],
    hintTemplate: 'The windowed SUM adds a role total to every player row.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-running',
    family: 'windowed',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT map_result_id AS map_result_id, map_name AS map_name, duration_minutes AS duration_minutes, AVG(duration_minutes) OVER (PARTITION BY map_name) AS map_avg_duration FROM map_result',
    ...windowBy('map_result', 'map_name', 'map_result_id'),
    phrasings: [
      'For each map_name partition, calculate map_avg_duration with a windowed AVG. Return map_result_id, map_name, duration_minutes, map_avg_duration. Order by map_name and map_result_id.',
      'Use AVG(duration_minutes) OVER (PARTITION BY map_name) and return map_result_id, map_name, duration_minutes, map_avg_duration ordered by map_name and map_result_id.',
    ],
    hintTemplate: 'The windowed AVG annotates each map row with its map-name average.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-running',
    family: 'windowed',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, team_id AS team_id, handle AS handle, COUNT(player_id) OVER (PARTITION BY team_id) AS roster_size FROM player WHERE team_id IS NOT NULL',
    ...windowBy('player', 'team_id', 'player_id'),
    phrasings: [
      'For each team_id partition, calculate roster_size with a windowed COUNT. Return player_id, team_id, handle, roster_size. Order by team_id and player_id.',
      'Use COUNT(player_id) OVER (PARTITION BY team_id) and return player_id, team_id, handle, roster_size for rostered players ordered by team_id and player_id.',
    ],
    hintTemplate: 'The WHERE clause removes free agents before the team partition count is applied.',
    gateHints: gh(3, 2, true),
  }),
];

const windowFrameBasicTemplates: Template[] = [
  tWindowFrameBasic,
  sidelineTemplate({
    skill: 'sl-window-frame-basic',
    family: 'windowed',
    primaryTable: 'tournament',
    sqlShape:
      'SELECT tournament_id AS tournament_id, tier AS tier, prize_pool_usd AS prize_pool_usd, SUM(prize_pool_usd) OVER (PARTITION BY tier ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS framed_prize ' +
      'FROM tournament',
    ...windowBy('tournament', 'tier', 'tournament_id'),
    phrasings: [
      'For each tier partition, compute framed_prize with a ROWS BETWEEN 2 PRECEDING AND CURRENT ROW frame. Return tournament_id, tier, prize_pool_usd, framed_prize. Order by tier and tournament_id.',
      'Use SUM(prize_pool_usd) over a 2 preceding frame and return tournament_id, tier, prize_pool_usd, framed_prize ordered by tier and tournament_id.',
    ],
    hintTemplate: 'The ROWS frame limits the SUM to nearby rows in the same tier partition.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-frame-basic',
    family: 'windowed',
    primaryTable: 'map_result',
    sqlShape:
      'SELECT map_result_id AS map_result_id, map_name AS map_name, duration_minutes AS duration_minutes, AVG(duration_minutes) OVER (PARTITION BY map_name ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) AS framed_duration ' +
      'FROM map_result',
    ...windowBy('map_result', 'map_name', 'map_result_id'),
    phrasings: [
      'For each map_name partition, compute framed_duration with a ROWS BETWEEN 1 PRECEDING AND CURRENT ROW frame. Return map_result_id, map_name, duration_minutes, framed_duration. Order by map_name and map_result_id.',
      'Use AVG(duration_minutes) over a one-row preceding frame and return map_result_id, map_name, duration_minutes, framed_duration ordered by map_name and map_result_id.',
    ],
    hintTemplate: 'The frame changes which neighboring map rows feed the AVG.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-frame-basic',
    family: 'windowed',
    primaryTable: 'match',
    sqlShape:
      'SELECT match_id AS match_id, tournament_id AS tournament_id, best_of AS best_of, COUNT(*) OVER (PARTITION BY tournament_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS nearby_matches ' +
      'FROM match',
    ...windowBy('match', 'tournament_id', 'match_id'),
    phrasings: [
      'For each tournament partition, compute nearby_matches with a one-row preceding and following frame. Return match_id, tournament_id, best_of, nearby_matches. Order by tournament_id and match_id.',
      'Use COUNT(*) over a centered ROWS frame and return match_id, tournament_id, best_of, nearby_matches ordered by tournament_id and match_id.',
    ],
    hintTemplate: 'A centered frame can count the current row plus immediate neighbors.',
    gateHints: gh(3, 2, true),
  }),
  sidelineTemplate({
    skill: 'sl-window-frame-basic',
    family: 'windowed',
    primaryTable: 'player',
    sqlShape:
      'SELECT player_id AS player_id, role AS role, total_earnings_usd AS total_earnings_usd, AVG(total_earnings_usd) OVER (PARTITION BY role ROWS BETWEEN CURRENT ROW AND 1 FOLLOWING) AS forward_avg_earnings ' +
      'FROM player',
    ...windowBy('player', 'role', 'player_id'),
    phrasings: [
      'For each role partition, compute forward_avg_earnings with a current row and one following frame. Return player_id, role, total_earnings_usd, forward_avg_earnings. Order by role and player_id.',
      'Use AVG(total_earnings_usd) over a forward ROWS frame and return player_id, role, total_earnings_usd, forward_avg_earnings ordered by role and player_id.',
    ],
    hintTemplate: 'The frame can look forward from the current row inside the role partition.',
    gateHints: gh(3, 2, true),
  }),
];

export const SIDELINE_TEMPLATES: Template[] = [
  tJoinInner,
  ...joinMultiTemplates,
  ...joinLeftTemplates,
  ...antiJoinTemplates,
  ...semiJoinTemplates,
  tSelfJoinMatch,
  ...selfJoinCompareTemplates,
  ...joinRightFullTemplates,
  ...joinAggregateTemplates,
  ...caseExpressionTemplates,
  ...subqueryScalarTemplates,
  ...subqueryInTemplates,
  ...subqueryCorrelatedTemplates,
  ...cteTemplates,
  ...setOpsTemplates,
  ...dateFunctionTemplates,
  ...scdAsofTemplates,
  ...windowRankTemplates,
  ...windowLagLeadTemplates,
  ...windowRunningTemplates,
  ...windowFrameBasicTemplates,
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
    teach: {
      ...teach(
      'An inner join keeps only rows that match on both sides. Join player to team on team_id to pull each player alongside their team.',
      'Think of two lists lined up by a shared key; keep a row only when both lists have that key.',
      'SELECT p.handle, t.name FROM player p JOIN team t ON t.team_id = p.team_id',
      'Free agents (player.team_id IS NULL) drop out of an inner join because they have no matching team.'
      ),
      whyWhen: 'Reach for INNER JOIN when you only want rows that exist on both sides; if the question needs every left row including unmatched ones, use LEFT JOIN and COALESCE instead.',
      watchOut: 'INNER silently drops the unmatched side, so free agents (player.team_id IS NULL) vanish; a prompt like "all players including those with no team" must become a LEFT JOIN.',
      interviewNote: 'Interviewers test that you know INNER drops non-matches and that join order does not change the result because the optimizer reorders; the trap is "all customers including those with no orders," which needs LEFT, not INNER.',
    },
  },
  {
    skill: 'sl-join-multi',
    phaseId: 'sideline-joins',
    order: 2,
    title: 'Multi-table joins',
    teach: {
      ...teach(
      'Chain joins across three or more tables to follow a path: match -> tournament -> region, or map_result -> match -> team.',
      'Each JOIN adds one more table onto the growing row; keep the ON keys aligned so the chain does not fan out.',
      'SELECT mr.map_name, m.stage, t.name FROM map_result mr JOIN match m ON m.match_id = mr.match_id JOIN tournament t ON t.tournament_id = m.tournament_id',
      'Add tables one join at a time and check the row count does not explode unexpectedly.'
      ),
      whyWhen: 'Use a multi-table join to walk a foreign-key path (map_result -> match -> tournament) in one pass instead of nesting a subquery per hop.',
      watchOut: 'The top gotcha is silent row fan-out: a one-to-many join deeper in the chain multiplies rows; add joins one at a time and confirm why the count grows before aggregating or reaching for DISTINCT.',
      interviewNote: 'Interviewers watch that you keep ON keys aligned across the chain and can point to where a row count exploded, rather than stacking joins blindly.',
    },
  },
  {
    skill: 'sl-join-left',
    phaseId: 'sideline-joins',
    order: 3,
    title: 'Left outer joins',
    teach: {
      ...teach(
      'A left join keeps every row from the left table and fills NULL where the right table has no match.',
      'The left table is the anchor; the right side is optional decoration that may be missing.',
      'SELECT t.name, ts.annual_value_usd FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'A team with no sponsor still appears, with NULL in the sponsor columns.'
      ),
      whyWhen: 'Use LEFT JOIN when the left table is a spine you must keep whole (every team, even sponsorless ones) and the right side is optional detail.',
      watchOut: 'Putting a right-table predicate in WHERE (WHERE ts.contract_end IS NULL) silently demotes the LEFT JOIN to INNER because NULL fails the test; move that condition into the ON clause to preserve unmatched left rows.',
      interviewNote: 'A favorite trap is asking why a LEFT JOIN lost its unmatched rows; the answer is a right-side filter sitting in WHERE, fixed by moving it into ON or allowing IS NULL.',
    },
  },
  {
    skill: 'sl-anti-join',
    phaseId: 'sideline-joins',
    order: 4,
    title: 'Anti joins',
    teach: {
      ...teach(
      'An anti-join keeps left rows that have NO match on the right: LEFT JOIN then WHERE right key IS NULL, or NOT EXISTS.',
      'Find the leftovers: everything on the left that the right side never claimed.',
      'SELECT t.team_id, t.name FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id WHERE ts.team_id IS NULL',
      'This is how you find teams with no sponsor, or teams that never played a match.'
      ),
      whyWhen: 'Use an anti-join to answer "rows with no match" (teams that never played, sponsorless teams); NOT EXISTS is the safe default, with LEFT JOIN ... WHERE right IS NULL as an equivalent.',
      watchOut: 'NOT IN against a subquery returns zero rows the moment that subquery yields a single NULL, because comparing to NULL is UNKNOWN; use NOT EXISTS, which handles NULLs correctly.',
      interviewNote: 'Interviewers ask you to name the three forms (NOT EXISTS; LEFT JOIN ... WHERE right IS NULL; NOT IN) and to explain why NOT IN over a NULL-bearing subquery is unsafe.',
      interviewPattern: 'Anti-join',
    },
  },
  {
    skill: 'sl-semi-join',
    phaseId: 'sideline-joins',
    order: 5,
    title: 'Semi joins',
    teach: {
      ...teach(
      'A semi-join keeps left rows that HAVE at least one match on the right, without duplicating them: EXISTS or IN.',
      'A yes/no membership test: does this left row have any partner on the right?',
      'SELECT t.team_id, t.name FROM team t WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id)',
      'EXISTS returns each team once even if it has many sponsors, unlike a plain inner join.'
      ),
      whyWhen: 'Use a semi-join (EXISTS or IN) when you only need to confirm a match exists and want each left row once, not one row per match.',
      watchOut: 'Testing existence with INNER JOIN fans out to one row per match, so people paper over it with DISTINCT; EXISTS avoids the duplication and can stop at the first match found.',
      interviewNote: 'Interviewers check that you reach for EXISTS instead of JOIN plus DISTINCT and can explain why EXISTS does not multiply rows.',
      interviewPattern: 'Semi-join',
    },
  },
  {
    skill: 'sl-self-join-match',
    phaseId: 'sideline-joins',
    order: 6,
    title: 'Self join: winner vs loser',
    teach: {
      ...teach(
      'match has two team FKs (team_a_id, team_b_id) plus winner_team_id. Join team twice to name both the winner and the loser; derive the loser id with a CASE that flips between the two team columns.',
      'The same table wears two hats in one query; give it two aliases so each hat is a separate join.',
      'SELECT m.match_id, w.name AS winner_name, l.name AS loser_name FROM match m JOIN team w ON w.team_id = m.winner_team_id JOIN team l ON l.team_id = CASE WHEN m.winner_team_id = m.team_a_id THEN m.team_b_id ELSE m.team_a_id END',
      'The loser is whichever of team_a_id / team_b_id is not the winner.'
      ),
      whyWhen: 'Use a self-join when two roles live in one table and you need both on a row, such as naming winner and loser from match.team_a_id, team_b_id, and winner_team_id.',
      watchOut: 'Forgetting to alias each copy makes column references ambiguous and the query fails; give the two instances distinct aliases (w and l) so each join targets one role.',
      interviewNote: 'The canonical version is employee-to-manager in one table; here it is winner vs loser, and interviewers check that you alias both copies of the table.',
      interviewPattern: 'Self-join',
    },
  },
  {
    skill: 'sl-self-join-compare',
    phaseId: 'sideline-joins',
    order: 7,
    title: 'Self join: compare peers',
    teach: {
      ...teach(
      'Join a table to itself to compare rows within the same group, such as two teams in the same region with equal Elo.',
      'Pair every row with its siblings; use a < b to keep each unordered pair once.',
      'SELECT a.name, b.name FROM team a JOIN team b ON a.region_id = b.region_id AND a.team_id < b.team_id',
      'The a.team_id < b.team_id guard removes self-pairs and mirrored duplicates.'
      ),
      whyWhen: 'Use a self-join to compare rows within one table (two teams in the same region with equal Elo) that no second table would provide.',
      watchOut: 'Without a guard you double-count every pair (a,b and b,a) and match rows to themselves; add a.team_id < b.team_id to keep one copy of each unordered pair.',
      interviewNote: 'Interviewers look for the a < b guard that drops mirror pairs and self-matches; omitting it is the classic mistake.',
      interviewPattern: 'Self-join',
    },
  },
  {
    skill: 'sl-join-right-full',
    phaseId: 'sideline-joins',
    order: 8,
    title: 'Right and full outer joins',
    teach: {
      ...teach(
      'A full outer join keeps unmatched rows from BOTH sides, filling NULL on whichever side is missing.',
      'The union of two left joins: nobody gets dropped, from either table.',
      'SELECT t.name, ts.sponsor_id FROM team t FULL OUTER JOIN team_sponsor ts ON ts.team_id = t.team_id',
      'Sponsorless teams and (structurally) any team-less sponsor rows both survive.'
      ),
      whyWhen: 'Use FULL OUTER JOIN when you must keep unmatched rows from both sides at once (two-way reconciliation); RIGHT JOIN is just a LEFT JOIN with the tables swapped.',
      watchOut: 'The gotcha is expecting FULL OUTER to show only mismatches; it returns matched rows too, so add WHERE one side IS NULL when you want just the unmatched edge.',
      interviewNote: 'Interviewers ask when you would pick FULL OUTER over LEFT (two-sided reconciliation) and expect you to note RIGHT JOIN is rarely needed because you can flip it to LEFT.',
    },
  },
  {
    skill: 'sl-join-aggregate',
    phaseId: 'sideline-joins',
    order: 9,
    title: 'Join then aggregate',
    teach: {
      ...teach(
      'Join first, then GROUP BY to summarize: count matches per region, sum sponsor value per team. ROLLUP, GROUPING SETS, string_agg, and FILTER extend the summary.',
      'Reshape rows into groups after the join; each group collapses to one summary row.',
      'SELECT r.name, count(*) AS match_count FROM match m JOIN tournament t ON t.tournament_id = m.tournament_id JOIN region r ON r.region_id = t.region_id GROUP BY r.name',
      'FILTER (WHERE ...) lets one query carry several conditional counts side by side.'
      ),
      whyWhen: 'Join first, then GROUP BY when a summary needs columns from several tables (match count per region, sponsor value per team).',
      watchOut: 'A one-to-many join before aggregating inflates SUM and COUNT by fanning out rows; count the right key with count(m.match_id) or pre-aggregate the many-side in a subquery.',
      interviewNote: 'Interviewers probe that every non-aggregated SELECT column appears in GROUP BY and that you use COUNT(col) vs COUNT(*) correctly around outer joins.',
    },
  },
  {
    skill: 'sl-case-expression',
    phaseId: 'sideline-subqueries',
    order: 1,
    title: 'CASE expressions',
    teach: {
      ...teach(
      'CASE builds a computed column from conditions: label an Elo band, or bucket a prize pool into tiers.',
      'An if/else ladder that produces a value per row.',
      "SELECT name, CASE WHEN elo_rating >= 1800 THEN 'elite' WHEN elo_rating >= 1500 THEN 'mid' ELSE 'developing' END AS tier FROM team",
      'The first matching WHEN wins; ELSE is the fallback.'
      ),
      whyWhen: 'Use CASE to derive a labeled column inline (Elo band, prize tier) without a lookup table, and inside aggregates for conditional counts.',
      watchOut: 'CASE stops at the first WHEN that matches, so order branches from most to least specific; without an ELSE, unmatched rows silently return NULL.',
      interviewNote: 'A common ask is bucketing a number into labels or pivoting with SUM(CASE WHEN ... THEN 1 ELSE 0 END); they check branch order and the ELSE fallback.',
    },
  },
  {
    skill: 'sl-subquery-scalar',
    phaseId: 'sideline-subqueries',
    order: 2,
    title: 'Scalar subqueries',
    teach: {
      ...teach(
      'A scalar subquery returns exactly one value you can compare against, such as the overall average Elo.',
      'Compute a single number in parentheses, then use it like a constant.',
      'SELECT name, elo_rating FROM team WHERE elo_rating > (SELECT avg(elo_rating) FROM team)',
      'If the inner query could return many rows, it is not scalar; use IN or a join instead.'
      ),
      whyWhen: 'Use a scalar subquery when you need one aggregate value (the overall average Elo) to compare each row against.',
      watchOut: 'If the subquery ever returns more than one row it errors at runtime; guarantee a single value with an aggregate or LIMIT 1, and switch to IN when you actually want a set.',
      interviewNote: 'Interviewers check you can tell a scalar subquery (one value) from an IN subquery (a set) and know where each is valid.',
    },
  },
  {
    skill: 'sl-subquery-in',
    phaseId: 'sideline-subqueries',
    order: 3,
    title: 'IN subqueries',
    teach: {
      ...teach(
      'IN (subquery) filters against a set of values produced by another query, such as teams in international tournaments.',
      'Build a set on the inside; keep outer rows whose key is in that set.',
      "SELECT name FROM team WHERE region_id IN (SELECT region_id FROM tournament WHERE tier = 'S')",
      'NOT IN is risky when the subquery can return NULLs; prefer NOT EXISTS there.'
      ),
      whyWhen: 'Use IN (subquery) to filter against a set of keys another query produces (teams in regions that host a tier A tournament).',
      watchOut: 'NOT IN turns dangerous when the subquery can emit NULL: the predicate goes UNKNOWN and the query returns zero rows; add IS NOT NULL to the subquery or use NOT EXISTS.',
      interviewNote: 'The classic probe is the NOT IN plus NULL trap; they want you to prefer NOT EXISTS or filter NULLs out of the subquery.',
    },
  },
  {
    skill: 'sl-subquery-correlated',
    phaseId: 'sideline-subqueries',
    order: 4,
    title: 'Correlated subqueries',
    teach: {
      ...teach(
      'A correlated subquery references the outer row, so it re-runs per row: each player compared to their own team average earnings.',
      'The inner query peeks back at the current outer row every time it runs.',
      'SELECT p.handle FROM player p WHERE p.total_earnings_usd > (SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id)',
      'The inner reference to p.team_id is what makes it correlated.'
      ),
      whyWhen: 'Use a correlated subquery when the inner filter depends on the outer row (each player vs their own team average); a plain subquery cannot see the outer row.',
      watchOut: 'A correlated subquery re-runs once per outer row and can be slow; for "each row vs its group average" prefer AVG(x) OVER (PARTITION BY g), which computes it in a single pass.',
      interviewNote: 'Interviewers ask you to spot the correlation (the inner reference to p.team_id) and to rewrite a correlated aggregate as a window function.',
    },
  },
  {
    skill: 'sl-cte',
    phaseId: 'sideline-subqueries',
    order: 5,
    title: 'Common table expressions',
    teach: {
      ...teach(
      'A WITH clause names a subquery so you can read the query top to bottom and reuse the intermediate result.',
      'Give a subquery a name up front, then treat it like a table below.',
      'WITH team_matches AS (SELECT winner_team_id AS team_id, count(*) AS wins FROM match GROUP BY winner_team_id) SELECT t.name, tm.wins FROM team t JOIN team_matches tm ON tm.team_id = t.team_id',
      'CTEs do not change the answer; they make a layered query legible.'
      ),
      whyWhen: 'Use a CTE to name an intermediate result so a layered query reads top to bottom, or to express a recursive query.',
      watchOut: 'A non-recursive CTE is just a named subquery for readability, not a speedup; Postgres inlines it, so do not expect it to be materialized or cached unless you write WITH ... AS MATERIALIZED.',
      interviewNote: 'Interviewers may ask whether a CTE runs faster than a subquery; the honest answer is no for a plain CTE, it is a readability aid.',
    },
  },
  {
    skill: 'sl-set-ops',
    phaseId: 'sideline-subqueries',
    order: 6,
    title: 'Set operations',
    teach: {
      ...teach(
      'UNION, INTERSECT, and EXCEPT combine two same-shaped result sets. UNION dedups; UNION ALL keeps duplicates.',
      'Stack two column-compatible results and take their union, overlap, or difference.',
      'SELECT host_country FROM tournament WHERE host_country IS NOT NULL UNION SELECT country FROM player',
      'Both SELECTs must expose the same number and types of columns, in order.'
      ),
      whyWhen: 'Use UNION, INTERSECT, or EXCEPT to combine two same-shaped result sets vertically; reach for UNION ALL when duplicates are impossible or wanted.',
      watchOut: 'UNION sorts and de-dupes at a real cost; when you know duplicates cannot occur or you want to keep them, use UNION ALL to skip that dedupe.',
      interviewNote: 'Interviewers check you know UNION removes duplicates (and pays for it) while UNION ALL does not, and that both sides must share column count and types in order.',
    },
  },
  {
    skill: 'sl-date-functions',
    phaseId: 'sideline-subqueries',
    order: 7,
    title: 'Date functions',
    teach: {
      ...teach(
      'Extract and compare date parts: tournament length in days, matches by month, contracts active on a date.',
      'Dates are values you can subtract, truncate, and slice into parts.',
      'SELECT name, (end_date - start_date) AS length_days FROM tournament',
      'date - date yields an integer number of days in Postgres.'
      ),
      whyWhen: 'Use date arithmetic and extraction to compute durations (tournament length) or bucket rows by period (matches per month).',
      watchOut: 'date - date returns an integer of days, but timestamp - timestamp returns an interval; be deliberate about the types and avoid comparing a date to a timestamp by accident.',
      interviewNote: 'Interviewers ask for grouping by month (date_trunc or EXTRACT) or computing an age or duration, watching that your date and timestamp types line up.',
    },
  },
  {
    skill: 'sl-scd-asof',
    phaseId: 'sideline-subqueries',
    order: 8,
    title: 'As-of / slowly changing lookups',
    teach: {
      ...teach(
      'roster_change is a slowly changing history with from_date/to_date. An as-of query finds the stint that was open on a given date (to_date IS NULL or covers the date).',
      'Rewind the history to a moment and read the one row that was in effect then.',
      "SELECT rc.player_id, rc.team_id FROM roster_change rc WHERE rc.from_date <= DATE '2025-01-01' AND (rc.to_date IS NULL OR rc.to_date > DATE '2025-01-01')",
      'The open stint (to_date IS NULL) is the current row for a rostered player.'
      ),
      whyWhen: 'Use an as-of lookup on a from_date/to_date history to find the one row in effect on a given date (which team a player was on then).',
      watchOut: 'The gotcha is half-open intervals: use from_date <= d AND (to_date IS NULL OR to_date > d) so no row is double-counted on a boundary date, and remember the open stint has to_date IS NULL.',
      interviewNote: 'Interviewers frame this as point-in-time or slowly-changing-dimension joins and check your boundary logic (<= vs <, NULL end date) so a single date never matches two stints.',
    },
  },
  {
    skill: 'sl-window-rank',
    phaseId: 'sideline-windows',
    order: 1,
    title: 'Ranking windows',
    teach: {
      ...teach(
      'ROW_NUMBER / RANK / DENSE_RANK order rows within a partition without collapsing them, such as ranking teams by Elo inside each region.',
      'Number the rows inside each group by an ordering, keeping every row.',
      'SELECT name, region_id, RANK() OVER (PARTITION BY region_id ORDER BY elo_rating DESC) AS region_rank FROM team',
      'RANK leaves gaps after ties; DENSE_RANK does not; ROW_NUMBER is always unique.'
      ),
      whyWhen: 'Use ROW_NUMBER, RANK, or DENSE_RANK to number rows within a partition while keeping every row; use GROUP BY only when you want to collapse them.',
      watchOut: 'The three differ on ties: ROW_NUMBER is always unique with an arbitrary tie-break, RANK shares and leaves gaps (1,2,2,4), DENSE_RANK shares with no gap (1,2,2,3); "top 3 salaries" wants RANK or DENSE_RANK while "3 highest-paid people" wants ROW_NUMBER.',
      interviewNote: 'The single most common window question is exactly this distinction, plus per-group top-N via a partitioned ranking filtered in an outer query.',
      interviewPattern: 'Ranking',
    },
  },
  {
    skill: 'sl-window-lag-lead',
    phaseId: 'sideline-windows',
    order: 2,
    title: 'LAG and LEAD',
    teach: {
      ...teach(
      'LAG and LEAD read a neighboring row within the partition: the previous or next match datetime for a team.',
      'Peek one row back or forward along the ordering without a self-join.',
      'SELECT match_id, winner_team_id, LAG(match_datetime) OVER (PARTITION BY winner_team_id ORDER BY match_datetime) AS prev_win FROM match',
      'The first row per partition has no previous neighbor, so LAG returns NULL there.'
      ),
      whyWhen: 'Use LAG or LEAD to compare a row to its neighbor (previous match date, month-over-month change) without a self-join.',
      watchOut: 'LAG and LEAD need an ORDER BY in the OVER clause or the neighbor is undefined, and the first or last row per partition returns NULL, so COALESCE before you subtract.',
      interviewNote: 'A frequent ask is a period-over-period delta; interviewers check that you order the window and handle the NULL at the partition edge.',
    },
  },
  {
    skill: 'sl-window-running',
    phaseId: 'sideline-windows',
    order: 3,
    title: 'Running totals',
    teach: {
      ...teach(
      'SUM(...) OVER (ORDER BY ...) accumulates a running total, such as cumulative prize pool over the tournament calendar.',
      'Carry a growing subtotal down the ordered rows.',
      'SELECT name, start_date, SUM(prize_pool_usd) OVER (ORDER BY start_date, tournament_id) AS running_prize FROM tournament',
      'Add a unique tiebreak to ORDER BY so the running total is deterministic across ties.'
      ),
      whyWhen: 'Use SUM(...) OVER (ORDER BY ...) for a cumulative running total that keeps every row, instead of a self-join or correlated subquery.',
      watchOut: 'The default frame under ORDER BY is RANGE ... CURRENT ROW, which lumps tied peers into one subtotal and can inflate a running total; use ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW plus a unique tie-break for true row-by-row accumulation.',
      interviewNote: 'Interviewers ask for a running total or cumulative share and probe whether you know the default RANGE frame versus ROWS and why ties matter.',
    },
  },
  {
    skill: 'sl-window-frame-basic',
    phaseId: 'sideline-windows',
    order: 4,
    title: 'Basic window frames',
    teach: {
      ...teach(
      'A frame (ROWS BETWEEN ...) limits which rows the window sees, enabling a simple moving average over adjacent rows.',
      'Slide a small fixed-size viewport along the ordered rows.',
      'SELECT tournament_id, prize_pool_usd, AVG(prize_pool_usd) OVER (ORDER BY start_date, tournament_id ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS smoothed FROM tournament',
      'Without a frame, ORDER BY implies RANGE UNBOUNDED PRECEDING, which is a running aggregate, not a sliding one.'
      ),
      whyWhen: 'Use an explicit ROWS BETWEEN frame for a sliding window such as a moving average over adjacent rows, as opposed to a full running aggregate.',
      watchOut: 'With ORDER BY but no frame you get RANGE UNBOUNDED PRECEDING (a running aggregate), not a sliding one; spell out ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING to bound the window.',
      interviewNote: 'Interviewers ask for a moving average or N-row window and check that you state the frame explicitly; a related probe is that an empty OVER () treats the whole result set as one partition.',
    },
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
