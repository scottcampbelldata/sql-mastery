import type {
  Template,
  ConceptMeta,
  TeachBlock,
  PhaseMeta,
  CheckpointMeta
} from '../../types';

// Filled by T10.
export const SIDELINE_TEMPLATES: Template[] = [];
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
