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
];
