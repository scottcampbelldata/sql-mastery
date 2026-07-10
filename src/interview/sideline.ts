import type { DraftInterviewProblem } from './types';

// Hand-crafted, business-framed interview problems on the Sideline (esports league) database.
// Filled by the content pass; validated + fingerprinted by scripts/validate-interview.ts.
export const SIDELINE_INTERVIEW: DraftInterviewProblem[] = [
  {
    id: 'iv-sl-kr-roster-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the league operations analyst. The Korea regional lead is preparing a roster directory for the KR division and wants every rostered player attached to a Korea-based team, tagged with their role and their team current strength rating.',
    task: "Join players to their team and region, and for every player whose team sits in the region with short_code 'KR', return handle, role, team_name (the team name), and elo_rating. Sort by elo_rating descending, then handle ascending.",
    expectedSql:
      "SELECT p.handle, p.role, t.name AS team_name, t.elo_rating FROM player p JOIN team t ON t.team_id = p.team_id JOIN region r ON r.region_id = t.region_id WHERE r.short_code = 'KR' ORDER BY t.elo_rating DESC, p.handle",
    modelAnswer: `-- Join player to team to region on the foreign keys, then filter the region code.
SELECT p.handle,
       p.role,
       t.name AS team_name,
       t.elo_rating
FROM player p
JOIN team t ON t.team_id = p.team_id
JOIN region r ON r.region_id = t.region_id
WHERE r.short_code = 'KR'
ORDER BY t.elo_rating DESC, p.handle;`,
    approachNote:
      "Chain player to team to region on their foreign keys, then filter region.short_code = 'KR'. A free agent (team_id NULL) drops out naturally on the inner join to team, which is what you want here. The common wrong turn is filtering on a hand-typed region name instead of joining through team.region_id, or forgetting the elo tie-break and letting equal-rated players fall in an unstable order.",
    orderMatters: true,
    rowCeiling: 60,
  },
  {
    id: 'iv-sl-sponsor-value-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the league commercial analyst. The commissioner wants a sponsorship revenue board covering every team in the league, including the orgs that currently carry no active sponsor, so the gaps are as visible as the leaders.',
    task: "For every one of the teams, return team_name and total_annual_value, the sum of annual_value_usd across the team currently active sponsorships (contract_end IS NULL), showing 0 for a team with no active sponsor. Sort by total_annual_value descending, then team_name ascending.",
    expectedSql:
      'SELECT t.name AS team_name, coalesce(sum(ts.annual_value_usd), 0) AS total_annual_value FROM team t LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id AND ts.contract_end IS NULL GROUP BY t.name ORDER BY total_annual_value DESC, team_name',
    modelAnswer: `-- Keep the active-only test in the ON clause so teams with no active sponsor survive the LEFT JOIN.
SELECT t.name AS team_name,
       coalesce(sum(ts.annual_value_usd), 0) AS total_annual_value
FROM team t
LEFT JOIN team_sponsor ts
  ON ts.team_id = t.team_id
 AND ts.contract_end IS NULL
GROUP BY t.name
ORDER BY total_annual_value DESC, team_name;`,
    approachNote:
      'Keep the active-contract test (contract_end IS NULL) in the LEFT JOIN ON clause, not in WHERE. Moving it to WHERE would discard teams whose only sponsorships have expired and silently turn this into an inner join, so those orgs would vanish instead of showing 0. coalesce(sum(...), 0) converts the NULL sum for sponsor-less teams into a real 0.',
    orderMatters: true,
    rowCeiling: 50,
  },
  {
    id: 'iv-sl-no-sponsor-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the partnerships analyst. The commercial team is building a prospect list and wants every team that has never signed a single sponsor, active or expired, so sales can prioritise the fully unsponsored orgs.',
    task: 'Return team_name, region_code (the region short_code), and elo_rating for every team that has no row at all in team_sponsor. Sort by elo_rating descending, then team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating FROM team t JOIN region r ON r.region_id = t.region_id WHERE NOT EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id) ORDER BY t.elo_rating DESC, team_name',
    modelAnswer: `-- NOT EXISTS keeps only teams with no matching sponsorship row (the anti-join).
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE NOT EXISTS (
  SELECT 1
  FROM team_sponsor ts
  WHERE ts.team_id = t.team_id
)
ORDER BY t.elo_rating DESC, team_name;`,
    approachNote:
      'NOT EXISTS against team_sponsor is the anti-join: keep only teams with no matching sponsorship row. A LEFT JOIN ... WHERE ts.team_id IS NULL reaches the same answer, but NOT EXISTS states the intent and avoids row fan-out from teams that hold several sponsorships. Avoid NOT IN here, since a single NULL in the subquery list would collapse the whole result to empty.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-elite-sponsors-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Semi-join',
    difficulty: 2,
    scenario:
      'You are the commercial analyst. Ahead of a renewal pitch, the head of partnerships wants the list of sponsors that back at least one elite team (Elo rating of 1900 or higher), to feature those marquee relationships in the deck.',
    task: 'Return sponsor_name (the sponsor name), industry, and headquarters_country for every sponsor that sponsors at least one team with elo_rating of 1900 or higher. Sort by sponsor_name ascending.',
    expectedSql:
      'SELECT s.name AS sponsor_name, s.industry, s.headquarters_country FROM sponsor s WHERE EXISTS (SELECT 1 FROM team_sponsor ts JOIN team t ON t.team_id = ts.team_id WHERE ts.sponsor_id = s.sponsor_id AND t.elo_rating >= 1900) ORDER BY sponsor_name',
    modelAnswer: `-- EXISTS returns each sponsor once, however many elite teams it backs (the semi-join).
SELECT s.name AS sponsor_name,
       s.industry,
       s.headquarters_country
FROM sponsor s
WHERE EXISTS (
  SELECT 1
  FROM team_sponsor ts
  JOIN team t ON t.team_id = ts.team_id
  WHERE ts.sponsor_id = s.sponsor_id
    AND t.elo_rating >= 1900
)
ORDER BY sponsor_name;`,
    approachNote:
      'EXISTS is a semi-join: it returns each qualifying sponsor exactly once no matter how many elite teams it backs, so no DISTINCT is needed. Writing this as a plain JOIN from sponsor through team_sponsor to team would duplicate a sponsor that backs two elite teams unless you add DISTINCT, and the correlation (ts.sponsor_id = s.sponsor_id) is what ties the inner check back to the outer sponsor.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-teammate-pairs-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Self-join',
    difficulty: 3,
    scenario:
      'You are the analytics analyst. The coaching staff wants a duo-chemistry worksheet listing every pair of teammates on the Japan-region rosters, with each pairing shown once so the sheet has no duplicate mirror rows.',
    task: "Self-join players to find every pair of players on the same team whose team is in the region with short_code 'JP'. Return team_name, player_a, and player_b, where player_a and player_b are the two handles with player_a earlier than player_b alphabetically. Sort by team_name ascending, then player_a ascending, then player_b ascending.",
    expectedSql:
      "SELECT t.name AS team_name, p1.handle AS player_a, p2.handle AS player_b FROM player p1 JOIN player p2 ON p1.team_id = p2.team_id AND p1.handle < p2.handle JOIN team t ON t.team_id = p1.team_id JOIN region r ON r.region_id = t.region_id WHERE r.short_code = 'JP' ORDER BY team_name, player_a, player_b",
    modelAnswer: `-- Self-join on equal team_id; handle < handle drops self-pairs and mirror duplicates.
SELECT t.name AS team_name,
       p1.handle AS player_a,
       p2.handle AS player_b
FROM player p1
JOIN player p2
  ON p1.team_id = p2.team_id
 AND p1.handle < p2.handle
JOIN team t ON t.team_id = p1.team_id
JOIN region r ON r.region_id = t.region_id
WHERE r.short_code = 'JP'
ORDER BY team_name, player_a, player_b;`,
    approachNote:
      'Join player to itself on equal team_id and add p1.handle < p2.handle. The strict inequality does double duty: it removes the self-match (a player paired with themselves) and collapses each mirror pair (A,B) and (B,A) into one row. Using <> instead of < would keep both orderings and double the output; joining without any inequality guard leaves the self-pairs in as well.',
    orderMatters: true,
    rowCeiling: 80,
  },
  {
    id: 'iv-sl-above-team-avg-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 3,
    scenario:
      'You are the players association analyst. For a pay-equity review, you need every rostered player who out-earns the average of their own team, each shown next to that team average.',
    task: 'For every player on a team (team_id is not NULL) whose total_earnings_usd is greater than the average total_earnings_usd of their team, return handle, team_name, total_earnings_usd, and team_avg (the team average earnings rounded to 2 decimals). Sort by team_name ascending, then total_earnings_usd descending, then handle ascending.',
    expectedSql:
      'SELECT p.handle, t.name AS team_name, p.total_earnings_usd, round((SELECT avg(p2.total_earnings_usd) FROM player p2 WHERE p2.team_id = p.team_id), 2) AS team_avg FROM player p JOIN team t ON t.team_id = p.team_id WHERE p.total_earnings_usd > (SELECT avg(p3.total_earnings_usd) FROM player p3 WHERE p3.team_id = p.team_id) ORDER BY team_name, p.total_earnings_usd DESC, p.handle',
    modelAnswer: `-- Window rewrite: compute each team average once, then filter above it in an outer query.
WITH earnings AS (
  SELECT p.handle,
         t.name AS team_name,
         p.total_earnings_usd,
         avg(p.total_earnings_usd) OVER (PARTITION BY p.team_id) AS team_avg
  FROM player p
  JOIN team t ON t.team_id = p.team_id
)
SELECT handle,
       team_name,
       total_earnings_usd,
       round(team_avg, 2) AS team_avg
FROM earnings
WHERE total_earnings_usd > team_avg
ORDER BY team_name, total_earnings_usd DESC, handle;`,
    approachNote:
      'The canonical form uses a correlated subquery that recomputes the team average per row by matching p2.team_id to the outer p.team_id: correct, but it rescans the team for every player. The window rewrite avg(...) OVER (PARTITION BY team_id) computes each team average once, then you filter in an outer query because a window result cannot be referenced in the same WHERE. Both give identical rows; the classic mistake is comparing against a league-wide avg with no correlation or partition, which flags the wrong players.',
    orderMatters: true,
    rowCeiling: 150,
  },
  {
    id: 'iv-sl-win-rate-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 3,
    scenario:
      'You are the league operations analyst. The commissioner wants a win-rate table for every team that has actually played, counting a team appearances on either side of a match against the matches it won.',
    task: 'Using CTEs, count each team matches played (appearances as team_a or team_b) and matches won (winner_team_id), then for every team with at least one match played return team_name, matches_played, matches_won, and win_pct (matches_won * 100.0 / matches_played rounded to 1 decimal). Sort by win_pct descending, then matches_played descending, then team_name ascending.',
    expectedSql:
      'WITH appearances AS (SELECT team_a_id AS team_id FROM match UNION ALL SELECT team_b_id FROM match), played AS (SELECT team_id, count(*) AS matches_played FROM appearances GROUP BY team_id), won AS (SELECT winner_team_id AS team_id, count(*) AS matches_won FROM match GROUP BY winner_team_id) SELECT t.name AS team_name, pl.matches_played, coalesce(w.matches_won, 0) AS matches_won, round(coalesce(w.matches_won, 0) * 100.0 / pl.matches_played, 1) AS win_pct FROM team t JOIN played pl ON pl.team_id = t.team_id LEFT JOIN won w ON w.team_id = t.team_id ORDER BY win_pct DESC, matches_played DESC, team_name',
    modelAnswer: `-- One appearance per team via UNION ALL, counted in a CTE; LEFT JOIN wins so winless teams stay.
WITH appearances AS (
  SELECT team_a_id AS team_id FROM match
  UNION ALL
  SELECT team_b_id FROM match
),
played AS (
  SELECT team_id, count(*) AS matches_played
  FROM appearances
  GROUP BY team_id
),
won AS (
  SELECT winner_team_id AS team_id, count(*) AS matches_won
  FROM match
  GROUP BY winner_team_id
)
SELECT t.name AS team_name,
       pl.matches_played,
       coalesce(w.matches_won, 0) AS matches_won,
       round(coalesce(w.matches_won, 0) * 100.0 / pl.matches_played, 1) AS win_pct
FROM team t
JOIN played pl ON pl.team_id = t.team_id
LEFT JOIN won w ON w.team_id = t.team_id
ORDER BY win_pct DESC, matches_played DESC, team_name;`,
    approachNote:
      'A UNION ALL of team_a_id and team_b_id flattens the two-sided match table into one appearance per team, which a CTE then counts; a second CTE counts wins. The inner JOIN to the played CTE enforces at least one match played, while a LEFT JOIN to wins plus coalesce keeps a winless team at matches_won = 0 rather than dropping it. Multiply by 100.0 (not 100) to force numeric division, or integer division truncates every rate to a whole number.',
    orderMatters: true,
    rowCeiling: 50,
  },
  {
    id: 'iv-sl-region-top-earner-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Ranking',
    difficulty: 3,
    scenario:
      "You are the league operations analyst. A 'regional MVP' broadcast graphic needs exactly one player per region: the single highest earner among players rostered to teams in that region.",
    task: 'Rank players within their team region by total_earnings_usd descending (break ties by handle ascending) and return region_code (the region short_code), handle, and total_earnings_usd for the top earner in each region, one row per region. Sort by region_code ascending.',
    expectedSql:
      'WITH ranked AS (SELECT r.short_code AS region_code, p.handle, p.total_earnings_usd, row_number() OVER (PARTITION BY r.short_code ORDER BY p.total_earnings_usd DESC, p.handle) AS rn FROM player p JOIN team t ON t.team_id = p.team_id JOIN region r ON r.region_id = t.region_id) SELECT region_code, handle, total_earnings_usd FROM ranked WHERE rn = 1 ORDER BY region_code',
    modelAnswer: `-- ROW_NUMBER picks exactly one top earner per region; filter to rn = 1.
WITH ranked AS (
  SELECT r.short_code AS region_code,
         p.handle,
         p.total_earnings_usd,
         row_number() OVER (
           PARTITION BY r.short_code
           ORDER BY p.total_earnings_usd DESC, p.handle
         ) AS rn
  FROM player p
  JOIN team t ON t.team_id = p.team_id
  JOIN region r ON r.region_id = t.region_id
)
SELECT region_code,
       handle,
       total_earnings_usd
FROM ranked
WHERE rn = 1
ORDER BY region_code;`,
    approachNote:
      'row_number() OVER (PARTITION BY region ORDER BY earnings DESC, handle) numbers players inside each region; filtering to rn = 1 in an outer query yields exactly one winner per region, and the handle tie-break makes the pick deterministic. rank() would return more than one row for a region on a tie and break the one-per-region rule; you also cannot filter on the window result in the same SELECT, which is why the ranking lives in a CTE or subquery.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-elo-rank-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Ranking',
    difficulty: 3,
    scenario:
      'You are the competition analyst. The seeding committee ranks the teams inside each region by Elo, and wants tied teams to share the same seed number rather than be split arbitrarily.',
    task: 'Rank teams within their region by elo_rating descending using a function that lets ties share a rank. Return region_code (the region short_code), team_name, elo_rating, and elo_rank. Sort by region_code ascending, then elo_rank ascending, then team_name ascending.',
    expectedSql:
      'SELECT r.short_code AS region_code, t.name AS team_name, t.elo_rating, rank() OVER (PARTITION BY r.region_id ORDER BY t.elo_rating DESC) AS elo_rank FROM team t JOIN region r ON r.region_id = t.region_id ORDER BY region_code, elo_rank, team_name',
    modelAnswer: `-- RANK lets tied teams share a seed and then skips the next value.
SELECT r.short_code AS region_code,
       t.name AS team_name,
       t.elo_rating,
       rank() OVER (PARTITION BY r.region_id ORDER BY t.elo_rating DESC) AS elo_rank
FROM team t
JOIN region r ON r.region_id = t.region_id
ORDER BY region_code, elo_rank, team_name;`,
    approachNote:
      'rank() gives tied teams the same rank and then skips the next value (two teams at rank 2 are followed by rank 4), which is how shared seeds behave. dense_rank() would not skip (2, 2, 3), and row_number() would break the tie arbitrarily and hand equal-Elo teams different seeds. The team_name in ORDER BY only fixes the display order of tied rows; it does not change the elo_rank value itself.',
    orderMatters: true,
    rowCeiling: 50,
  },
  {
    id: 'iv-sl-prize-delta-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 3,
    scenario:
      'You are the finance analyst. Walking the calendar of events, the CFO wants to see how each tournament prize pool moved relative to the tournament immediately before it.',
    task: "Order tournaments by start_date and return tournament_name (the tournament name), start_date, prize_pool_usd, and delta_vs_prev, the prize_pool_usd minus the previous tournament prize_pool_usd (NULL for the earliest tournament). Sort by start_date ascending.",
    expectedSql:
      'SELECT name AS tournament_name, start_date, prize_pool_usd, prize_pool_usd - lag(prize_pool_usd) OVER (ORDER BY start_date) AS delta_vs_prev FROM tournament ORDER BY start_date',
    modelAnswer: `-- LAG pulls the previous tournament pool onto this row for a one-line delta.
SELECT name AS tournament_name,
       start_date,
       prize_pool_usd,
       prize_pool_usd - lag(prize_pool_usd) OVER (ORDER BY start_date) AS delta_vs_prev
FROM tournament
ORDER BY start_date;`,
    approachNote:
      'lag(prize_pool_usd) OVER (ORDER BY start_date) pulls the prior row value onto the current row so the subtraction is a single expression; the first row has no predecessor, so its delta is NULL. A self-join on the max start_date less than this one reaches the same answer but is far clumsier and stumbles when two events share a date. Here start_date is unique, so the ordering (and every delta) is deterministic.',
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-match-runtotal-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 3,
    scenario:
      'You are the league operations analyst. For a season-load review, the ops director wants the month-by-month match count alongside a running cumulative total across the whole league calendar.',
    task: "Bucket matches by calendar month and return month_start (date_trunc('month', match_datetime) cast to date), matches_in_month (matches that month), and running_total_matches (the cumulative sum of matches_in_month from the first month through the current one). Sort by month_start ascending.",
    expectedSql:
      "WITH monthly AS (SELECT date_trunc('month', match_datetime)::date AS month_start, count(*) AS matches_in_month FROM match GROUP BY 1) SELECT month_start, matches_in_month, sum(matches_in_month) OVER (ORDER BY month_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total_matches FROM monthly ORDER BY month_start",
    modelAnswer: `-- Aggregate to one row per month, then a running SUM over the ordered months.
WITH monthly AS (
  SELECT date_trunc('month', match_datetime)::date AS month_start,
         count(*) AS matches_in_month
  FROM match
  GROUP BY 1
)
SELECT month_start,
       matches_in_month,
       sum(matches_in_month) OVER (
         ORDER BY month_start
         ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS running_total_matches
FROM monthly
ORDER BY month_start;`,
    approachNote:
      'Aggregate to one row per month first (a CTE keeps it readable), then apply sum(matches_in_month) OVER (ORDER BY month_start ...) for the cumulative total. The explicit ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW frame states the running-total intent; the ORDER BY default frame happens to match here, but spelling it out avoids the RANGE-frame surprise when two rows tie on the order key. Summing raw match rows without grouping by month first would not produce a clean per-month series.',
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-role-top3-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Ranking',
    difficulty: 3,
    scenario:
      'You are the talent analyst. A role-by-role earnings feature spotlights the top three earners in each player role, and if two players tie at the cut both should make the list.',
    task: 'Within each role, rank players by total_earnings_usd descending with a function where ties share a rank, and return role, handle, total_earnings_usd, and earnings_rank for players whose rank is 3 or better. Sort by role ascending, then earnings_rank ascending, then handle ascending.',
    expectedSql:
      'WITH ranked AS (SELECT p.role, p.handle, p.total_earnings_usd, dense_rank() OVER (PARTITION BY p.role ORDER BY p.total_earnings_usd DESC) AS earnings_rank FROM player p) SELECT role, handle, total_earnings_usd, earnings_rank FROM ranked WHERE earnings_rank <= 3 ORDER BY role, earnings_rank, handle',
    modelAnswer: `-- DENSE_RANK keeps every tied player at the cut; filter to the top three tiers.
WITH ranked AS (
  SELECT p.role,
         p.handle,
         p.total_earnings_usd,
         dense_rank() OVER (PARTITION BY p.role ORDER BY p.total_earnings_usd DESC) AS earnings_rank
  FROM player p
)
SELECT role,
       handle,
       total_earnings_usd,
       earnings_rank
FROM ranked
WHERE earnings_rank <= 3
ORDER BY role, earnings_rank, handle;`,
    approachNote:
      'dense_rank() OVER (PARTITION BY role ORDER BY earnings DESC) numbers players per role and, because it does not skip after a tie, filtering earnings_rank <= 3 returns a genuine top-three tier even when players tie (a role can then show more than three rows). row_number() would arbitrarily drop a tied player and hard-cap each role at three; rank() could skip past 3 after a tie and hide a legitimately third-tier contender.',
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-grand-finals-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the broadcast operations analyst. The production team is assembling a champions reel and needs every Grand Final played in the league premier S-tier tournaments, with both finalists and the winner named on a single line.',
    task: "Join match to its tournament and to the team table three times (side A, side B, and the winner) and, for every match whose stage is 'Grand Final' in a tournament of tier 'S', return tournament_name, match_datetime, team_a (the team_a_id name), team_b (the team_b_id name), and winner_name (the winner_team_id name). Sort by match_datetime ascending, then tournament_name ascending.",
    expectedSql:
      "SELECT tr.name AS tournament_name, m.match_datetime, ta.name AS team_a, tb.name AS team_b, tw.name AS winner_name FROM match m JOIN tournament tr ON tr.tournament_id = m.tournament_id JOIN team ta ON ta.team_id = m.team_a_id JOIN team tb ON tb.team_id = m.team_b_id JOIN team tw ON tw.team_id = m.winner_team_id WHERE m.stage = 'Grand Final' AND tr.tier = 'S' ORDER BY m.match_datetime, tournament_name",
    modelAnswer: `-- Join match to tournament, then to team three times: side A, side B, and the winner.
SELECT tr.name AS tournament_name,
       m.match_datetime,
       ta.name AS team_a,
       tb.name AS team_b,
       tw.name AS winner_name
FROM match m
JOIN tournament tr ON tr.tournament_id = m.tournament_id
JOIN team ta ON ta.team_id = m.team_a_id
JOIN team tb ON tb.team_id = m.team_b_id
JOIN team tw ON tw.team_id = m.winner_team_id
WHERE m.stage = 'Grand Final'
  AND tr.tier = 'S'
ORDER BY m.match_datetime, tournament_name;`,
    approachNote:
      'The match table holds three separate foreign keys into team (team_a_id, team_b_id, winner_team_id), so team is joined three times under three aliases; without distinct aliases the joins collapse and the query cannot tell the sides apart. Joining tournament in lets you restrict to the S tier and label the event. The winner is always one of the two finalists, so the third join never adds or drops rows, it only resolves the winner name.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-free-agent-roster-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the league operations analyst. The competitions desk wants a complete in-game-leader directory: every IGL in the player pool shown against their current team, with the unsigned ones flagged rather than dropped so free agents stay visible to recruiters.',
    task: "For every player whose role is 'IGL', return handle, team_name (the team name, or the literal 'Free Agent' when team_id is NULL), and total_earnings_usd. Sort by team_name ascending, then handle ascending.",
    expectedSql:
      "SELECT p.handle, coalesce(t.name, 'Free Agent') AS team_name, p.total_earnings_usd FROM player p LEFT JOIN team t ON t.team_id = p.team_id WHERE p.role = 'IGL' ORDER BY team_name, p.handle",
    modelAnswer: `-- LEFT JOIN keeps the unsigned IGLs; COALESCE turns the NULL team into a 'Free Agent' label.
SELECT p.handle,
       coalesce(t.name, 'Free Agent') AS team_name,
       p.total_earnings_usd
FROM player p
LEFT JOIN team t ON t.team_id = p.team_id
WHERE p.role = 'IGL'
ORDER BY team_name, p.handle;`,
    approachNote:
      "A free agent has team_id NULL, so an INNER JOIN to team would silently drop every unsigned IGL. The LEFT JOIN keeps them with NULL team columns, and coalesce(t.name, 'Free Agent') turns that NULL into a readable label. The common wrong turn is a plain JOIN, which loses the free agents the directory is meant to surface, or pushing a team-name filter into WHERE that reintroduces the same drop.",
    orderMatters: true,
    rowCeiling: 80,
  },
  {
    id: 'iv-sl-no-match-win-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the competition analyst. For a parity report, the commissioner wants the list of teams still chasing their first match win: the orgs that have never been recorded as the winner of any match.',
    task: 'Return team_name, region_code (the region short_code), and elo_rating for every team that is never the winner_team_id of any match. Sort by elo_rating descending, then team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating FROM team t JOIN region r ON r.region_id = t.region_id WHERE NOT EXISTS (SELECT 1 FROM match m WHERE m.winner_team_id = t.team_id) ORDER BY t.elo_rating DESC, team_name',
    modelAnswer: `-- NOT EXISTS keeps only teams that never appear as a match winner (the anti-join).
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE NOT EXISTS (
  SELECT 1
  FROM match m
  WHERE m.winner_team_id = t.team_id
)
ORDER BY t.elo_rating DESC, team_name;`,
    approachNote:
      'NOT EXISTS correlated on winner_team_id is the anti-join: keep a team only when the subquery finds no matching win. A team that played and lost every match qualifies just as much as one that never played, since both are absent from the winners. NOT IN reaches the same set here because winner_team_id is NOT NULL, but NOT EXISTS is the safer habit; the LEFT JOIN ... IS NULL rewrite works too but fans out on the many matches per team before filtering.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-empty-roster-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Anti-join',
    difficulty: 3,
    scenario:
      'You are the league operations analyst. Roster audit season is here and the ops director wants the orgs holding a league slot with nobody signed to it, the teams that currently field no player at all.',
    task: 'Return team_name, region_code (the region short_code), and founded_date for every team whose team_id does not appear as team_id anywhere in the player table. Sort by team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.founded_date FROM team t JOIN region r ON r.region_id = t.region_id WHERE t.team_id NOT IN (SELECT p.team_id FROM player p WHERE p.team_id IS NOT NULL) ORDER BY team_name',
    modelAnswer: `-- NOT IN over player.team_id, guarded against the free-agent NULLs.
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.founded_date
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE t.team_id NOT IN (
  SELECT p.team_id
  FROM player p
  WHERE p.team_id IS NOT NULL
)
ORDER BY team_name;`,
    approachNote:
      'player.team_id is NULL for every free agent, and NOT IN with even one NULL in its list evaluates to UNKNOWN for every team and returns nothing at all. The WHERE p.team_id IS NOT NULL guard strips those NULLs so NOT IN behaves. NOT EXISTS or LEFT JOIN ... IS NULL avoid the trap entirely and are the usual fixes; the classic mistake is dropping the guard and reporting zero empty-roster teams when there really is one.',
    orderMatters: true,
    rowCeiling: 10,
  },
  {
    id: 'iv-sl-no-roster-change-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Anti-join',
    difficulty: 2,
    scenario:
      'You are the roster data steward. While cleaning up the transactions log, you need the players who have no roster-move history on file at all, not a single row in roster_change, so their signings can be backfilled.',
    task: 'Return handle, role, and country for every player who has no matching row in roster_change. Sort by handle ascending.',
    expectedSql:
      'SELECT p.handle, p.role, p.country FROM player p LEFT JOIN roster_change rc ON rc.player_id = p.player_id WHERE rc.player_id IS NULL ORDER BY p.handle',
    modelAnswer: `-- LEFT JOIN to the history table; the unmatched players are the ones with no move on file.
SELECT p.handle,
       p.role,
       p.country
FROM player p
LEFT JOIN roster_change rc ON rc.player_id = p.player_id
WHERE rc.player_id IS NULL
ORDER BY p.handle;`,
    approachNote:
      'The LEFT JOIN keeps every player; rows that found no roster_change match have all rc columns NULL, so testing rc.player_id IS NULL isolates the players with no history. Test the join key (or another NOT NULL column from roster_change), never a nullable data column, or a legitimately NULL value would masquerade as a non-match. NOT EXISTS expresses the same anti-join more directly, but the LEFT JOIN ... IS NULL form is the one to recognise here.',
    orderMatters: true,
    rowCeiling: 20,
  },
  {
    id: 'iv-sl-gf-winners-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Semi-join',
    difficulty: 2,
    scenario:
      'You are the competition analyst. A champions filter on the standings page should surface only the teams that have lifted a trophy, meaning the orgs that have won at least one Grand Final.',
    task: "Return team_name, region_code (the region short_code), and elo_rating for every team whose team_id is the winner_team_id of at least one match with stage 'Grand Final'. Sort by elo_rating descending, then team_name ascending.",
    expectedSql:
      "SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating FROM team t JOIN region r ON r.region_id = t.region_id WHERE t.team_id IN (SELECT m.winner_team_id FROM match m WHERE m.stage = 'Grand Final') ORDER BY t.elo_rating DESC, team_name",
    modelAnswer: `-- IN against the set of Grand Final winners is a semi-join: each team once, however many titles.
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE t.team_id IN (
  SELECT m.winner_team_id
  FROM match m
  WHERE m.stage = 'Grand Final'
)
ORDER BY t.elo_rating DESC, team_name;`,
    approachNote:
      'IN (or EXISTS) is a semi-join: it returns each qualifying team exactly once no matter how many Grand Finals it won, so no DISTINCT is needed. A plain JOIN from team to the winning matches would emit one row per title and duplicate the multi-time champions. IN is safe here because winner_team_id is NOT NULL; the mirror-image NOT IN would demand a null guard, but the positive IN does not.',
    orderMatters: true,
    rowCeiling: 60,
  },
  {
    id: 'iv-sl-earnings-gap-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Self-join',
    difficulty: 3,
    scenario:
      'You are the players association analyst. To surface intra-roster pay imbalance, the union wants every teammate pairing where one player has earned at least double the other, so the widest in-house gaps are on the table.',
    task: 'Self-join players on the same team to find pairs where one player total_earnings_usd is at least twice the other player total_earnings_usd. Return team_name, higher_earner (the higher earner handle), higher_earnings, lower_earner (the lower earner handle), and lower_earnings, with each pair listed once. Sort by team_name ascending, then higher_earner ascending, then lower_earner ascending.',
    expectedSql:
      'SELECT t.name AS team_name, a.handle AS higher_earner, a.total_earnings_usd AS higher_earnings, b.handle AS lower_earner, b.total_earnings_usd AS lower_earnings FROM player a JOIN player b ON a.team_id = b.team_id AND a.player_id <> b.player_id AND a.total_earnings_usd >= 2 * b.total_earnings_usd JOIN team t ON t.team_id = a.team_id ORDER BY team_name, higher_earner, lower_earner',
    modelAnswer: `-- Self-join on the same team; the >= 2x test fixes which side is the higher earner and kills mirrors.
SELECT t.name AS team_name,
       a.handle AS higher_earner,
       a.total_earnings_usd AS higher_earnings,
       b.handle AS lower_earner,
       b.total_earnings_usd AS lower_earnings
FROM player a
JOIN player b
  ON a.team_id = b.team_id
 AND a.player_id <> b.player_id
 AND a.total_earnings_usd >= 2 * b.total_earnings_usd
JOIN team t ON t.team_id = a.team_id
ORDER BY team_name, higher_earner, lower_earner;`,
    approachNote:
      'Aliasing player as a and b and joining on equal team_id builds every teammate pair; the a.total_earnings_usd >= 2 * b.total_earnings_usd predicate both enforces the doubling rule and pins a as the higher earner, so no mirror row (b, a) can also pass. player_id <> b.player_id drops the self-pair. Because every rostered player here has positive earnings, the 2x test already implies a strictly outearns b; if zero-earning teammates existed you would add a.total_earnings_usd > b.total_earnings_usd to stop a 0-versus-0 pair from appearing in both directions.',
    orderMatters: true,
    rowCeiling: 120,
  },
  {
    id: 'iv-sl-elo-behind-top-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the competition analyst. The seeding committee wants a gap-to-the-top board: every team next to the single highest Elo in the league and how far below that ceiling it sits.',
    task: 'Return team_name, region_code (the region short_code), elo_rating, league_top_elo (the maximum elo_rating across all teams), and gap_to_top (league_top_elo minus the team elo_rating). Sort by gap_to_top ascending, then team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating, (SELECT max(elo_rating) FROM team) AS league_top_elo, (SELECT max(elo_rating) FROM team) - t.elo_rating AS gap_to_top FROM team t JOIN region r ON r.region_id = t.region_id ORDER BY gap_to_top, team_name',
    modelAnswer: `-- A scalar subquery returns the league-max Elo as a constant reused on every row.
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating,
       (SELECT max(elo_rating) FROM team) AS league_top_elo,
       (SELECT max(elo_rating) FROM team) - t.elo_rating AS gap_to_top
FROM team t
JOIN region r ON r.region_id = t.region_id
ORDER BY gap_to_top, team_name;`,
    approachNote:
      '(SELECT max(elo_rating) FROM team) is an uncorrelated scalar subquery: it does not reference the outer row, so it computes once and the single value is reused across every team. The top team lands at gap_to_top = 0. A cross join to a one-row max would work but reads worse; the wrong turn is a correlated max that recomputes per row for no benefit, or a GROUP BY that needlessly aggregates the outer query.',
    orderMatters: true,
    rowCeiling: 60,
  },
  {
    id: 'iv-sl-tournament-load-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the league operations analyst. For a scheduling load review, the ops director wants each tournament next to how many matches it staged, the heaviest events first.',
    task: 'For every tournament, return tournament_name (the tournament name), tier, and match_count, the number of match rows tied to that tournament via a correlated subquery. Sort by match_count descending, then tournament_name ascending.',
    expectedSql:
      'SELECT tr.name AS tournament_name, tr.tier, (SELECT count(*) FROM match m WHERE m.tournament_id = tr.tournament_id) AS match_count FROM tournament tr ORDER BY match_count DESC, tournament_name',
    modelAnswer: `-- A correlated subquery counts the matches for each tournament row.
SELECT tr.name AS tournament_name,
       tr.tier,
       (SELECT count(*)
        FROM match m
        WHERE m.tournament_id = tr.tournament_id) AS match_count
FROM tournament tr
ORDER BY match_count DESC, tournament_name;`,
    approachNote:
      'The subquery correlates on m.tournament_id = tr.tournament_id, so it recounts matches for each outer tournament. An equivalent JOIN ... GROUP BY tr.tournament_id is usually the tidier and faster shape and would be preferred at scale; the correlated count is shown because it is the pattern to read fluently. Either way, count(*) over the matches gives the per-tournament total; a bare count with no correlation would return the whole-league match total on every row.',
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-qualified-teams-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the commercial analyst. Marketing wants one combined shortlist of teams worth featuring: any elite team of Elo 1900 or higher together with any team that carries an active sponsor, merged into a single de-duplicated list.',
    task: 'Build the union of two team sets, the teams with elo_rating of 1900 or higher and the teams with at least one active sponsorship (a team_sponsor row where contract_end IS NULL), returning team_name, region_code (the region short_code), and elo_rating, with a team that qualifies on both counts listed only once. Sort by team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating FROM team t JOIN region r ON r.region_id = t.region_id WHERE t.elo_rating >= 1900 UNION SELECT t.name, r.short_code, t.elo_rating FROM team t JOIN region r ON r.region_id = t.region_id WHERE EXISTS (SELECT 1 FROM team_sponsor ts WHERE ts.team_id = t.team_id AND ts.contract_end IS NULL) ORDER BY team_name',
    modelAnswer: `-- UNION merges the two qualifying sets and collapses a team that meets both to one row.
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE t.elo_rating >= 1900
UNION
SELECT t.name,
       r.short_code,
       t.elo_rating
FROM team t
JOIN region r ON r.region_id = t.region_id
WHERE EXISTS (
  SELECT 1
  FROM team_sponsor ts
  WHERE ts.team_id = t.team_id
    AND ts.contract_end IS NULL
)
ORDER BY team_name;`,
    approachNote:
      'UNION concatenates the two result sets and then removes duplicate rows, so a team that is both elite and actively sponsored appears once. UNION ALL would skip that de-duplication and list such a team twice, the wrong turn for a shortlist. The single ORDER BY applies to the combined result and must reference the first branch output column names.',
    orderMatters: true,
    rowCeiling: 60,
  },
  {
    id: 'iv-sl-talent-no-sponsor-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the commercial strategy analyst. Sponsorship sales want a whitespace map: the player home countries that no current sponsor is headquartered in, as leads for regional deals.',
    task: 'Using a set operator, return country: every distinct player country that does not appear as any sponsor headquarters_country. Sort by country ascending.',
    expectedSql:
      'SELECT country FROM player EXCEPT SELECT headquarters_country FROM sponsor ORDER BY country',
    modelAnswer: `-- EXCEPT is the set difference: player countries minus sponsor home countries, de-duplicated.
SELECT country FROM player
EXCEPT
SELECT headquarters_country FROM sponsor
ORDER BY country;`,
    approachNote:
      'EXCEPT returns the distinct rows from the first query that are not present in the second, which is exactly the countries with players but no sponsor base. It de-duplicates automatically, so no DISTINCT is needed. A NOT IN over sponsor countries would answer the same question but needs a NULL guard if that column were nullable; the set operator sidesteps that and states the intent plainly.',
    orderMatters: true,
    rowCeiling: 30,
  },
  {
    id: 'iv-sl-tournament-span-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 2,
    scenario:
      'You are the events operations analyst. The ops director wants a run-length view of the calendar: how many days each tournament ran and the month it kicked off, longest events first.',
    task: "For every tournament, return tournament_name (the tournament name), start_date, end_date, days_long (end_date minus start_date, in days), and start_month (start_date formatted as 'YYYY-MM'). Sort by days_long descending, then start_date ascending.",
    expectedSql:
      "SELECT name AS tournament_name, start_date, end_date, (end_date - start_date) AS days_long, to_char(start_date, 'YYYY-MM') AS start_month FROM tournament ORDER BY days_long DESC, start_date",
    modelAnswer: `-- Date minus date yields an integer day count; to_char formats the start month.
SELECT name AS tournament_name,
       start_date,
       end_date,
       (end_date - start_date) AS days_long,
       to_char(start_date, 'YYYY-MM') AS start_month
FROM tournament
ORDER BY days_long DESC, start_date;`,
    approachNote:
      "In Postgres, subtracting one date from another returns a plain integer number of days, so end_date - start_date is the run length with no casting needed. to_char(start_date, 'YYYY-MM') renders the month bucket as text. Reaching for age() or extract() here would over-complicate a simple day span, and ordering by start_date breaks the days_long ties deterministically because start_date is unique.",
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-team-top2-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Ranking',
    difficulty: 3,
    scenario:
      'You are the talent analyst. A per-team earnings snapshot spotlights each roster two biggest earners, exactly two names per team even when the earnings are close.',
    task: 'Within each team, rank players by total_earnings_usd descending, breaking ties by handle ascending, and return team_name, handle, total_earnings_usd, and team_rank for the top two earners on every team. Sort by team_name ascending, then team_rank ascending, then handle ascending.',
    expectedSql:
      'WITH ranked AS (SELECT t.name AS team_name, p.handle, p.total_earnings_usd, row_number() OVER (PARTITION BY p.team_id ORDER BY p.total_earnings_usd DESC, p.handle) AS team_rank FROM player p JOIN team t ON t.team_id = p.team_id) SELECT team_name, handle, total_earnings_usd, team_rank FROM ranked WHERE team_rank <= 2 ORDER BY team_name, team_rank, handle',
    modelAnswer: `-- ROW_NUMBER per team gives a strict 1..n order; keep the first two.
WITH ranked AS (
  SELECT t.name AS team_name,
         p.handle,
         p.total_earnings_usd,
         row_number() OVER (
           PARTITION BY p.team_id
           ORDER BY p.total_earnings_usd DESC, p.handle
         ) AS team_rank
  FROM player p
  JOIN team t ON t.team_id = p.team_id
)
SELECT team_name,
       handle,
       total_earnings_usd,
       team_rank
FROM ranked
WHERE team_rank <= 2
ORDER BY team_name, team_rank, handle;`,
    approachNote:
      'row_number() with PARTITION BY team_id numbers each roster from 1, and the handle tie-break makes the second slot deterministic when two players earn the same, so filtering team_rank <= 2 returns exactly two per team. rank() or dense_rank() could hand out three or more names on a tie, breaking the strict top-two rule. The ranking has to live in a CTE or subquery because a window result cannot be filtered in the same WHERE.',
    orderMatters: true,
    rowCeiling: 120,
  },
  {
    id: 'iv-sl-prize-movingavg-1',
    database: 'sideline',
    level: 'intermediate',
    difficulty: 3,
    scenario:
      'You are the finance analyst. Walking the prize calendar in date order, the CFO wants each tournament pool smoothed by a three-event trailing average to read the trend past the spikes.',
    task: 'Order tournaments by start_date and return tournament_name (the tournament name), start_date, prize_pool_usd, and moving_avg_3, the average prize_pool_usd over the current tournament and the two immediately before it, rounded to 2 decimals. Sort by start_date ascending.',
    expectedSql:
      'SELECT name AS tournament_name, start_date, prize_pool_usd, round(avg(prize_pool_usd) OVER (ORDER BY start_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS moving_avg_3 FROM tournament ORDER BY start_date',
    modelAnswer: `-- An explicit ROWS frame averages this event and the two before it (a trailing window).
SELECT name AS tournament_name,
       start_date,
       prize_pool_usd,
       round(avg(prize_pool_usd) OVER (
         ORDER BY start_date
         ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
       ), 2) AS moving_avg_3
FROM tournament
ORDER BY start_date;`,
    approachNote:
      'ROWS BETWEEN 2 PRECEDING AND CURRENT ROW is a sliding three-row frame, so avg() smooths each pool with its two predecessors; the first two rows simply average the one or two rows available. Spelling out the ROWS frame matters, since the default frame is RANGE-based and would pull in every earlier row that ties on start_date, turning the moving average into a running one. Here start_date is unique, so the order and every window are deterministic.',
    orderMatters: true,
    rowCeiling: 40,
  },
  {
    id: 'iv-sl-elo-quartile-1',
    database: 'sideline',
    level: 'intermediate',
    pattern: 'Ranking',
    difficulty: 3,
    scenario:
      'You are the competition analyst. The league wants its teams split into four Elo tiers of roughly equal size, from the elite quartile down to the bottom, for a strength-of-schedule study.',
    task: 'Split all teams into four buckets by elo_rating descending (break ties by team name ascending) using a bucketing window function, and return team_name, region_code (the region short_code), elo_rating, and elo_tier (1 for the strongest quartile through 4 for the weakest). Sort by elo_tier ascending, then elo_rating descending, then team_name ascending.',
    expectedSql:
      'SELECT t.name AS team_name, r.short_code AS region_code, t.elo_rating, ntile(4) OVER (ORDER BY t.elo_rating DESC, t.name) AS elo_tier FROM team t JOIN region r ON r.region_id = t.region_id ORDER BY elo_tier, t.elo_rating DESC, team_name',
    modelAnswer: `-- NTILE(4) splits the ordered teams into four near-equal tiers.
SELECT t.name AS team_name,
       r.short_code AS region_code,
       t.elo_rating,
       ntile(4) OVER (ORDER BY t.elo_rating DESC, t.name) AS elo_tier
FROM team t
JOIN region r ON r.region_id = t.region_id
ORDER BY elo_tier, t.elo_rating DESC, team_name;`,
    approachNote:
      'ntile(4) splits the ordered rows into four groups as equal in size as possible, assigning tier 1 to the highest Elo block. It buckets by position, not by value, so two teams on the same Elo can straddle a tier boundary; the team-name tie-break in the window ORDER BY makes which one moves up deterministic. That is the key difference from rank(), which is value-driven and would give tied teams the same number but never guarantee four balanced groups.',
    orderMatters: true,
    rowCeiling: 60,
  },
];
