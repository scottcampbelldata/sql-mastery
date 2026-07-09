import path from 'path';

import type { Prng } from '../framework/prng';
import { deriveStream } from '../framework/prng';
import { intBetween, floatBetween, pick, weightedPick, bernoulli, shuffle, sampleWithout, round2 } from '../framework/random';
import { formatDate, formatTimestamp, ANCHOR_MS, addDays, DATASET_END_MS } from '../framework/dates';
import type { DatasetModule, TableSpec } from '../framework/types';
import {
  REGIONS,
  TEAMS_PER_REGION,
  TEAM_NAME_ROOTS,
  TEAM_TAGS,
  TEAM_NAME_SUFFIXES,
  HANDLE_PREFIXES,
  HANDLE_SUFFIXES,
  REGION_NAME_POOLS,
  PLAYER_ROLES,
  MAP_POOL,
  INTERNATIONAL_TOURNAMENT_NAMES,
  REGIONAL_TOURNAMENT_SUFFIXES,
  SPONSORS,
  SPONSOR_HQ_COUNTRIES,
  MEGABRAND_SPONSOR_INDEX,
  REGION_MARKET_MULTIPLIER,
} from './pools';

type Row = Record<string, unknown>;

export const DB_NAME = 'sideline';
export const SCHEMA_FILE = path.join(process.cwd(), 'datasets', 'schema', 'sideline.sql');
export const SEED = 0x5344454c;
export const VERSION = 'sideline-1';

export const TABLES: TableSpec[] = [
  { name: 'region', columns: ['region_id', 'name', 'short_code'] },
  {
    name: 'team',
    columns: ['team_id', 'name', 'tag', 'region_id', 'elo_rating', 'founded_date', 'disbanded_date', 'home_city'],
  },
  {
    name: 'player',
    columns: [
      'player_id',
      'handle',
      'full_name',
      'country',
      'role',
      'birth_date',
      'team_id',
      'signed_date',
      'total_earnings_usd',
    ],
  },
  {
    name: 'tournament',
    columns: [
      'tournament_id',
      'name',
      'region_id',
      'tier',
      'prize_pool_usd',
      'start_date',
      'end_date',
      'host_city',
      'host_country',
    ],
  },
  {
    name: 'match',
    columns: [
      'match_id',
      'tournament_id',
      'stage',
      'best_of',
      'match_datetime',
      'team_a_id',
      'team_b_id',
      'team_a_score',
      'team_b_score',
      'winner_team_id',
    ],
  },
  {
    name: 'map_result',
    columns: [
      'map_result_id',
      'match_id',
      'map_number',
      'map_name',
      'winner_team_id',
      'team_a_rounds',
      'team_b_rounds',
      'duration_minutes',
    ],
  },
  {
    name: 'roster_change',
    columns: ['roster_change_id', 'player_id', 'team_id', 'from_date', 'to_date', 'change_reason'],
  },
  { name: 'sponsor', columns: ['sponsor_id', 'name', 'industry', 'headquarters_country'] },
  {
    name: 'team_sponsor',
    columns: ['team_id', 'sponsor_id', 'contract_start', 'contract_end', 'annual_value_usd'],
  },
];

const DAY_MS = 86400000;
const EARLIEST_CAREER_MS = addDays(ANCHOR_MS, -365 * 3);

const TEAM_COUNT = 40;
const PLAYER_COUNT = 280;
const TOURNAMENT_COUNT = 24;
const MATCH_COUNT = 1200;
const ROSTER_CHANGE_COUNT = 600;
const TEAM_SPONSOR_COUNT = 120;

const FREE_AGENT_COUNT = 35; // edge case: >= 20 free agents
const ZERO_WIN_TEAM_COUNT = 5; // edge case: >= 4 teams that win zero matches
const SPONSORLESS_TEAM_COUNT = 3; // edge case: >= 1 team with no team_sponsor rows
const MEGABRAND_TEAM_COUNT = 10; // one energy-drink megabrand across ~10 teams
const ENDED_SPONSOR_TEAM_COUNT = 4; // one sponsor with all contracts ended
const ZERO_MATCH_TOURNAMENT_COUNT = 2; // edge case: 1-2 tournaments with zero matches

// Guaranteed edge entities for the intermediate join/anti-join templates (Task 10).
// Team 40 is a ghost org: present in team, but in no match, with no players, and no sponsor.
// Sponsor 30 is reserved to have zero team_sponsor rows (team-less sponsor).
const NEVER_PLAYED_TEAM_ID = TEAM_COUNT; // 40
const PLAYERLESS_TEAM_ID = TEAM_COUNT; // 40 (same ghost org)
const TEAMLESS_SPONSOR_ID = SPONSORS.length; // 30

const TIER_WEIGHTS_INTERNATIONAL: readonly (readonly [string, number])[] = [
  ['S', 40],
  ['A', 60],
];
const TIER_WEIGHTS_REGIONAL: readonly (readonly [string, number])[] = [
  ['A', 25],
  ['B', 75],
];

function buildRegions(): Row[] {
  return REGIONS.map((r, i) => ({ region_id: i + 1, name: r.name, short_code: r.shortCode }));
}

interface TeamsResult {
  rows: Row[];
  foundedMs: number[];
  elo: number[];
}

function buildTeams(seed: number): TeamsResult {
  const rng = deriveStream(seed, 'team');

  const regionAssignment: number[] = [];
  REGIONS.forEach((_, idx) => {
    for (let k = 0; k < TEAMS_PER_REGION[idx]; k += 1) regionAssignment.push(idx + 1);
  });
  const shuffledRegionAssignment = shuffle(rng, regionAssignment);

  const nameIdxPool = TEAM_NAME_ROOTS.map((_, i) => i);
  const chosenNameIdxs = sampleWithout(rng, nameIdxPool, TEAM_COUNT);

  const rows: Row[] = [];
  const foundedMs: number[] = [];
  const elo: number[] = [];

  for (let i = 0; i < TEAM_COUNT; i += 1) {
    const nameIdx = chosenNameIdxs[i];
    const root = TEAM_NAME_ROOTS[nameIdx];
    const tag = TEAM_TAGS[nameIdx];
    const suffix = pick(rng, TEAM_NAME_SUFFIXES);
    const regionId = shuffledRegionAssignment[i];
    const region = REGIONS[regionId - 1];

    // Beta(2,2)-like symmetric bounded strength proxy: mean of two uniforms is a triangular
    // distribution peaked at 0.5, the same unimodal-symmetric-bounded shape as Beta(2,2).
    const betaish = (rng() + rng()) / 2;
    const eloRating = Math.round(1200 + betaish * 900);

    const foundedDateMs = addDays(ANCHOR_MS, intBetween(rng, -365 * 6, 365));
    let disbandedDate: string | null = null;
    if (bernoulli(rng, 0.12)) {
      const maxOffsetDays = Math.max(366, Math.floor((DATASET_END_MS - foundedDateMs) / DAY_MS) - 30);
      const offsetDays = intBetween(rng, 365, maxOffsetDays);
      disbandedDate = formatDate(addDays(foundedDateMs, offsetDays));
    }
    const homeCity = bernoulli(rng, 0.85) ? pick(rng, region.cities) : null;

    rows.push({
      team_id: i + 1,
      name: `${root} ${suffix}`,
      tag,
      region_id: regionId,
      elo_rating: eloRating,
      founded_date: formatDate(foundedDateMs),
      disbanded_date: disbandedDate,
      home_city: homeCity,
    });
    foundedMs.push(foundedDateMs);
    elo.push(eloRating);
  }

  // Deterministic intra-region Elo tie: copy the first same-region pair's rating onto the
  // second, skipping the ghost team, so sl-self-join-compare has a guaranteed equal-rating pair.
  for (let i = 0; i < TEAM_COUNT && !eloTied(); i += 1) {
    for (let j = i + 1; j < TEAM_COUNT; j += 1) {
      if (
        rows[i].region_id === rows[j].region_id &&
        (rows[i].team_id as number) !== NEVER_PLAYED_TEAM_ID &&
        (rows[j].team_id as number) !== NEVER_PLAYED_TEAM_ID
      ) {
        rows[j].elo_rating = rows[i].elo_rating;
        elo[j] = elo[i];
        break;
      }
    }
  }

  function eloTied(): boolean {
    const seen = new Map<number, Set<number>>();
    for (let k = 0; k < TEAM_COUNT; k += 1) {
      const regionId = rows[k].region_id as number;
      if (!seen.has(regionId)) seen.set(regionId, new Set());
      const bucket = seen.get(regionId)!;
      if (bucket.has(elo[k])) return true;
      bucket.add(elo[k]);
    }
    return false;
  }

  return { rows, foundedMs, elo };
}

function buildPlayers(seed: number): Row[] {
  const rng = deriveStream(seed, 'player');

  const allCombos: string[] = [];
  HANDLE_PREFIXES.forEach((p) => HANDLE_SUFFIXES.forEach((s) => allCombos.push(`${p}${s}`)));
  const handles = sampleWithout(rng, allCombos, PLAYER_COUNT);

  const regionWeights: (readonly [(typeof REGIONS)[number], number])[] = REGIONS.map(
    (r, i) => [r, TEAMS_PER_REGION[i]] as const
  );

  const rows: Row[] = [];
  for (let i = 0; i < PLAYER_COUNT; i += 1) {
    const regionSeed = weightedPick(rng, regionWeights);
    const namePool = REGION_NAME_POOLS[regionSeed.shortCode];
    const fullName = `${pick(rng, namePool.given)} ${pick(rng, namePool.surname)}`;
    const country = pick(rng, regionSeed.countries);
    const role = pick(rng, PLAYER_ROLES);
    const birthDate = bernoulli(rng, 0.95)
      ? formatDate(addDays(ANCHOR_MS, -intBetween(rng, 16 * 365, 29 * 365)))
      : null;

    rows.push({
      player_id: i + 1,
      handle: handles[i],
      full_name: fullName,
      country,
      role,
      birth_date: birthDate,
      team_id: null,
      signed_date: null,
      total_earnings_usd: 0,
    });
  }
  return rows;
}

function pickChangeReason(rng: Prng, k: number, count: number, isRostered: boolean): string {
  const isLast = k === count - 1;
  if (k === 0 && !isLast) return 'Signed';
  if (isLast) {
    return isRostered ? pick(rng, ['Signed', 'Transfer', 'Promoted']) : pick(rng, ['Released', 'Retired']);
  }
  return pick(rng, ['Transfer', 'Promoted', 'Loan', 'Benched']);
}

// Assigns each player to a current team (or leaves them a free agent) and builds their full
// roster_change history. Stints are laid out strictly forward in time per player, so from_date
// is always increasing and stints never overlap; the very last stint of a currently rostered
// player is the only one left open (to_date null), which is what makes it the SCD "current" row.
function assignRostersAndBuildChanges(seed: number, players: Row[], teamsResult: TeamsResult): Row[] {
  const rng = deriveStream(seed, 'roster_change');

  const allIdxs = shuffle(
    rng,
    players.map((_, i) => i)
  );
  const rosteredIdxsInOrder = allIdxs.slice(FREE_AGENT_COUNT);

  const teamSizes = new Array(TEAM_COUNT).fill(5) as number[];
  teamSizes[PLAYERLESS_TEAM_ID - 1] = 0; // ghost org receives no players
  let remainingSize = rosteredIdxsInOrder.length - (TEAM_COUNT - 1) * 5;
  let guard = 0;
  while (remainingSize > 0 && guard < 200000) {
    const t = intBetween(rng, 0, TEAM_COUNT - 1);
    if (t !== PLAYERLESS_TEAM_ID - 1 && teamSizes[t] < 9) {
      teamSizes[t] += 1;
      remainingSize -= 1;
    }
    guard += 1;
  }

  const finalTeamIdxByPlayerIdx = new Map<number, number>();
  let cursor = 0;
  for (let t = 0; t < TEAM_COUNT; t += 1) {
    for (let k = 0; k < teamSizes[t]; k += 1) {
      finalTeamIdxByPlayerIdx.set(rosteredIdxsInOrder[cursor], t);
      cursor += 1;
    }
  }

  const counts = new Array(PLAYER_COUNT).fill(0) as number[];
  finalTeamIdxByPlayerIdx.forEach((_teamIdx, playerIdx) => {
    counts[playerIdx] = 1;
  });
  let remainingStints = ROSTER_CHANGE_COUNT - rosteredIdxsInOrder.length;
  const STINT_CAP = 4;
  guard = 0;
  while (remainingStints > 0 && guard < 500000) {
    const p = intBetween(rng, 0, PLAYER_COUNT - 1);
    if (counts[p] < STINT_CAP) {
      counts[p] += 1;
      remainingStints -= 1;
    }
    guard += 1;
  }

  const rosterChanges: Row[] = [];
  let rcId = 1;

  for (let p = 0; p < PLAYER_COUNT; p += 1) {
    const count = counts[p];
    const isRostered = finalTeamIdxByPlayerIdx.has(p);

    if (count === 0) {
      players[p].team_id = null;
      players[p].signed_date = null;
      continue;
    }

    let currentMs = EARLIEST_CAREER_MS + intBetween(rng, 0, 180) * DAY_MS;
    let lastFromMs = 0;
    let lastTeamId = 0;
    let eloSum = 0;

    for (let k = 0; k < count; k += 1) {
      const isLast = k === count - 1;
      const teamIdx = isLast && isRostered ? finalTeamIdxByPlayerIdx.get(p)! : intBetween(rng, 0, TEAM_COUNT - 1);
      const team = teamsResult.rows[teamIdx];
      const teamFoundedMs = teamsResult.foundedMs[teamIdx];

      const fromMs = Math.max(currentMs, teamFoundedMs);
      let toMs: number | null;
      if (isLast && isRostered) {
        toMs = null;
      } else {
        const spanDays = intBetween(rng, 30, 150);
        let candidate = fromMs + spanDays * DAY_MS;
        if (candidate > DATASET_END_MS) candidate = DATASET_END_MS;
        if (candidate <= fromMs) candidate = fromMs + DAY_MS;
        toMs = candidate;
      }

      const reason = pickChangeReason(rng, k, count, isRostered);
      rosterChanges.push({
        roster_change_id: rcId,
        player_id: p + 1,
        team_id: team.team_id,
        from_date: formatDate(fromMs),
        to_date: toMs === null ? null : formatDate(toMs),
        change_reason: reason,
      });
      rcId += 1;
      eloSum += teamsResult.elo[teamIdx];

      if (isLast) {
        lastFromMs = fromMs;
        lastTeamId = team.team_id as number;
      } else {
        const gapDays = intBetween(rng, 5, 30);
        currentMs = (toMs as number) + gapDays * DAY_MS;
      }
    }

    const avgElo = eloSum / count;
    const earnings = round2(
      Math.max(0, (avgElo - 1200) * floatBetween(rng, 50, 150) + count * floatBetween(rng, 2000, 8000))
    );
    players[p].total_earnings_usd = earnings;

    if (isRostered) {
      players[p].team_id = lastTeamId;
      players[p].signed_date = formatDate(lastFromMs);
    } else {
      players[p].team_id = null;
      players[p].signed_date = null;
    }
  }

  return rosterChanges;
}

interface TournamentsResult {
  rows: Row[];
  startMs: number[];
  endMs: number[];
  zeroMatchIds: Set<number>;
}

function buildTournaments(seed: number): TournamentsResult {
  const rng = deriveStream(seed, 'tournament');

  interface Slot {
    international: boolean;
    regionIdx: number;
  }
  const slots: Slot[] = [];
  for (let i = 0; i < 8; i += 1) slots.push({ international: true, regionIdx: -1 });
  for (let r = 0; r < REGIONS.length; r += 1) {
    slots.push({ international: false, regionIdx: r });
    slots.push({ international: false, regionIdx: r });
  }
  const shuffledSlots = shuffle(rng, slots);

  const regionSuffixPairs: string[][] = REGIONS.map(() => sampleWithout(rng, REGIONAL_TOURNAMENT_SUFFIXES, 2));
  const regionSuffixCursor = new Array(REGIONS.length).fill(0) as number[];
  let intlCursor = 0;

  const rows: Row[] = [];
  const startMs: number[] = [];
  const endMs: number[] = [];
  const totalWindowDays = Math.floor((DATASET_END_MS - ANCHOR_MS) / DAY_MS);

  for (let i = 0; i < TOURNAMENT_COUNT; i += 1) {
    const slot = shuffledSlots[i];
    const baseStartDay = Math.floor((i * totalWindowDays) / TOURNAMENT_COUNT);
    const jitterDays = intBetween(rng, 0, 10);
    const startDay = Math.min(baseStartDay + jitterDays, totalWindowDays - 14);
    const start = addDays(ANCHOR_MS, startDay);
    const durationDays = intBetween(rng, 3, 10);
    let end = addDays(start, durationDays);
    if (end > DATASET_END_MS) end = DATASET_END_MS;

    let name: string;
    let regionId: number | null;
    let tier: string;
    if (slot.international) {
      name = INTERNATIONAL_TOURNAMENT_NAMES[intlCursor % INTERNATIONAL_TOURNAMENT_NAMES.length];
      intlCursor += 1;
      regionId = null;
      tier = weightedPick(rng, TIER_WEIGHTS_INTERNATIONAL);
    } else {
      const region = REGIONS[slot.regionIdx];
      const suffix = regionSuffixPairs[slot.regionIdx][regionSuffixCursor[slot.regionIdx] % 2];
      regionSuffixCursor[slot.regionIdx] += 1;
      name = `${region.name} ${suffix}`;
      regionId = slot.regionIdx + 1;
      tier = weightedPick(rng, TIER_WEIGHTS_REGIONAL);
    }

    const prizePool =
      tier === 'S'
        ? round2(floatBetween(rng, 500000, 2000000))
        : tier === 'A'
          ? round2(floatBetween(rng, 100000, 500000))
          : round2(floatBetween(rng, 20000, 100000));

    const onlineProbability = slot.international ? 0.25 : 0.45;
    let hostCity: string | null = null;
    let hostCountry: string | null = null;
    if (!bernoulli(rng, onlineProbability)) {
      const hostRegion = slot.international ? pick(rng, REGIONS) : REGIONS[slot.regionIdx];
      hostCity = pick(rng, hostRegion.cities);
      hostCountry = pick(rng, hostRegion.countries);
    }

    rows.push({
      tournament_id: i + 1,
      name,
      region_id: regionId,
      tier,
      prize_pool_usd: prizePool,
      start_date: formatDate(start),
      end_date: formatDate(end),
      host_city: hostCity,
      host_country: hostCountry,
    });
    startMs.push(start);
    endMs.push(end);
  }

  const order = rows.map((_, idx) => idx).sort((a, b) => startMs[b] - startMs[a]);
  const zeroMatchIds = new Set<number>(
    order.slice(0, ZERO_MATCH_TOURNAMENT_COUNT).map((idx) => rows[idx].tournament_id as number)
  );

  return { rows, startMs, endMs, zeroMatchIds };
}

interface MatchTemplate {
  bestOf: number;
  mapsCount: number;
  winnerMapWins: number;
  loserMapWins: number;
  stagePool: readonly string[];
}

// Fixed recipe of (best_of, maps played) categories whose match counts sum to exactly
// MATCH_COUNT (1200) and whose maps-played counts sum to exactly 3000, so map_result's volume
// is hit by construction rather than emerging from chance. The recipe is shuffled before use so
// no tournament or team is biased toward a particular best_of.
function buildMatchTemplates(): MatchTemplate[] {
  const categories: { template: MatchTemplate; count: number }[] = [
    {
      count: 300,
      template: {
        bestOf: 1,
        mapsCount: 1,
        winnerMapWins: 1,
        loserMapWins: 0,
        stagePool: ['Group', 'Group', 'Group', 'Quarterfinal'],
      },
    },
    {
      count: 300,
      template: {
        bestOf: 3,
        mapsCount: 2,
        winnerMapWins: 2,
        loserMapWins: 0,
        stagePool: ['Group', 'Quarterfinal', 'Semifinal'],
      },
    },
    {
      count: 300,
      template: {
        bestOf: 3,
        mapsCount: 3,
        winnerMapWins: 2,
        loserMapWins: 1,
        stagePool: ['Group', 'Quarterfinal', 'Semifinal', 'Final'],
      },
    },
    {
      count: 100,
      template: {
        bestOf: 5,
        mapsCount: 3,
        winnerMapWins: 3,
        loserMapWins: 0,
        stagePool: ['Semifinal', 'Final', 'Grand Final'],
      },
    },
    {
      count: 100,
      template: {
        bestOf: 5,
        mapsCount: 4,
        winnerMapWins: 3,
        loserMapWins: 1,
        stagePool: ['Semifinal', 'Final', 'Grand Final'],
      },
    },
    {
      count: 100,
      template: {
        bestOf: 5,
        mapsCount: 5,
        winnerMapWins: 3,
        loserMapWins: 2,
        stagePool: ['Final', 'Grand Final'],
      },
    },
  ];
  const templates: MatchTemplate[] = [];
  for (const c of categories) {
    for (let i = 0; i < c.count; i += 1) templates.push(c.template);
  }
  return templates;
}

interface MatchesResult {
  matches: Row[];
  mapResults: Row[];
}

function buildMatchesAndMapResults(
  seed: number,
  teamsResult: TeamsResult,
  tournamentsResult: TournamentsResult
): MatchesResult {
  const rng = deriveStream(seed, 'match');
  const rngMap = deriveStream(seed, 'map_result');

  const eloRanked = teamsResult.rows
    .map((t) => ({ id: t.team_id as number, elo: teamsResult.elo[(t.team_id as number) - 1] }))
    .sort((a, b) => a.elo - b.elo);
  const zeroWinTeamIds = new Set(eloRanked.slice(0, ZERO_WIN_TEAM_COUNT).map((t) => t.id));

  const activeTournaments = tournamentsResult.rows.filter(
    (t) => !tournamentsResult.zeroMatchIds.has(t.tournament_id as number)
  );

  const baseCount = Math.floor(MATCH_COUNT / activeTournaments.length);
  const remainder = MATCH_COUNT - baseCount * activeTournaments.length;
  const matchCountByTournament = activeTournaments.map((_, idx) => baseCount + (idx < remainder ? 1 : 0));

  const templates = shuffle(rng, buildMatchTemplates());

  const teamsByRegion = new Map<number, number[]>();
  for (const t of teamsResult.rows) {
    const tid = t.team_id as number;
    if (tid === NEVER_PLAYED_TEAM_ID) continue;
    const rid = t.region_id as number;
    if (!teamsByRegion.has(rid)) teamsByRegion.set(rid, []);
    teamsByRegion.get(rid)!.push(tid);
  }
  const allTeamIds = teamsResult.rows
    .map((t) => t.team_id as number)
    .filter((id) => id !== NEVER_PLAYED_TEAM_ID);

  const matches: Row[] = [];
  const mapResults: Row[] = [];
  let matchId = 1;
  let mapResultId = 1;
  let templateIdx = 0;

  activeTournaments.forEach((tournament, tIdx) => {
    const tournamentId = tournament.tournament_id as number;
    const regionId = tournament.region_id as number | null;
    const eligible = regionId === null ? allTeamIds : teamsByRegion.get(regionId)!;
    const tStartMs = tournamentsResult.startMs[tournamentId - 1];
    const tEndMs = tournamentsResult.endMs[tournamentId - 1];
    const windowMs = Math.max(0, tEndMs - tStartMs);

    for (let j = 0; j < matchCountByTournament[tIdx]; j += 1) {
      const template = templates[templateIdx];
      templateIdx += 1;

      let teamAId = 0;
      let teamBId = 0;
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const pair = sampleWithout(rng, eligible, 2);
        if (!(zeroWinTeamIds.has(pair[0]) && zeroWinTeamIds.has(pair[1]))) {
          teamAId = pair[0];
          teamBId = pair[1];
          break;
        }
      }
      if (teamAId === 0) {
        const pair = sampleWithout(rng, eligible, 2);
        teamAId = pair[0];
        teamBId = pair[1];
      }

      const eloA = teamsResult.elo[teamAId - 1];
      const eloB = teamsResult.elo[teamBId - 1];

      let winnerId: number;
      if (zeroWinTeamIds.has(teamAId) && !zeroWinTeamIds.has(teamBId)) {
        winnerId = teamBId;
      } else if (zeroWinTeamIds.has(teamBId) && !zeroWinTeamIds.has(teamAId)) {
        winnerId = teamAId;
      } else if (bernoulli(rng, 0.12)) {
        // Deliberate upset: force the lower-elo side to win regardless of the Elo formula.
        winnerId = eloA <= eloB ? teamAId : teamBId;
      } else {
        const pA = 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
        winnerId = rng() < pA ? teamAId : teamBId;
      }
      const loserId = winnerId === teamAId ? teamBId : teamAId;

      const teamAScore = winnerId === teamAId ? template.winnerMapWins : template.loserMapWins;
      const teamBScore = winnerId === teamBId ? template.winnerMapWins : template.loserMapWins;
      const stage = pick(rng, template.stagePool);

      const offsetSeconds = intBetween(rng, 0, Math.floor(windowMs / 1000));
      const matchMs = tStartMs + offsetSeconds * 1000;

      matches.push({
        match_id: matchId,
        tournament_id: tournamentId,
        stage,
        best_of: template.bestOf,
        match_datetime: formatTimestamp(matchMs),
        team_a_id: teamAId,
        team_b_id: teamBId,
        team_a_score: teamAScore,
        team_b_score: teamBScore,
        winner_team_id: winnerId,
      });

      // Build the per-map winner sequence: the match loser can only win maps before the match
      // is clinched, so the FINAL map is always won by the match winner.
      const winnerEntries = new Array(Math.max(0, template.winnerMapWins - 1)).fill('W');
      const loserEntries = new Array(template.loserMapWins).fill('L');
      const sequence = [...shuffle(rngMap, [...winnerEntries, ...loserEntries]), 'W'];
      const mapNames = sampleWithout(rngMap, MAP_POOL, template.mapsCount);
      const eloGap = Math.abs(eloA - eloB);
      const maxLoserRounds = Math.min(11, Math.max(3, 11 - Math.floor(eloGap / 100)));

      for (let mnum = 0; mnum < template.mapsCount; mnum += 1) {
        const entry = sequence[mnum];
        const mapWinnerId = entry === 'W' ? winnerId : loserId;
        const overtime = bernoulli(rngMap, 0.08);
        let winnerRounds: number;
        let loserRounds: number;
        if (overtime) {
          loserRounds = 12 + intBetween(rngMap, 0, 2);
          winnerRounds = loserRounds + 2;
        } else {
          winnerRounds = 13;
          loserRounds = intBetween(rngMap, 0, maxLoserRounds);
        }
        const teamARounds = mapWinnerId === teamAId ? winnerRounds : loserRounds;
        const teamBRounds = mapWinnerId === teamBId ? winnerRounds : loserRounds;
        const totalRounds = teamARounds + teamBRounds;
        const durationMinutes = Math.round(8 + totalRounds * 1.6 + floatBetween(rngMap, -3, 3));

        mapResults.push({
          map_result_id: mapResultId,
          match_id: matchId,
          map_number: mnum + 1,
          map_name: mapNames[mnum],
          winner_team_id: mapWinnerId,
          team_a_rounds: teamARounds,
          team_b_rounds: teamBRounds,
          duration_minutes: durationMinutes,
        });
        mapResultId += 1;
      }

      matchId += 1;
    }
  });

  return { matches, mapResults };
}

interface SponsorsResult {
  sponsors: Row[];
  teamSponsors: Row[];
}

function buildSponsorsAndTeamSponsors(seed: number, teamsResult: TeamsResult): SponsorsResult {
  const rng = deriveStream(seed, 'sponsor');

  const sponsors: Row[] = SPONSORS.map((s, i) => ({
    sponsor_id: i + 1,
    name: s.name,
    industry: s.industry,
    headquarters_country: pick(rng, SPONSOR_HQ_COUNTRIES),
  }));

  const allTeamIds = teamsResult.rows.map((t) => t.team_id as number);
  const shuffledTeamIds = shuffle(rng, allTeamIds);
  const eligibleTeamIds = shuffledTeamIds
    .filter((id) => id !== NEVER_PLAYED_TEAM_ID)
    .slice(SPONSORLESS_TEAM_COUNT);

  const megabrandSponsorId = MEGABRAND_SPONSOR_INDEX + 1;
  const megabrandTeamIds = sampleWithout(rng, eligibleTeamIds, MEGABRAND_TEAM_COUNT);

  const nonMegabrandSponsorIds = sponsors
    .map((s) => s.sponsor_id as number)
    .filter((id) => id !== megabrandSponsorId && id !== TEAMLESS_SPONSOR_ID);
  const endedSponsorId = pick(rng, nonMegabrandSponsorIds);
  const remainingForEnded = eligibleTeamIds.filter((id) => !megabrandTeamIds.includes(id));
  const endedSponsorTeamIds = sampleWithout(rng, remainingForEnded, ENDED_SPONSOR_TEAM_COUNT);

  const teamSponsors: Row[] = [];
  const usedPairs = new Set<string>();

  function pushTeamSponsor(teamId: number, sponsorId: number, forceEnded: boolean): void {
    const team = teamsResult.rows[teamId - 1];
    const teamFoundedMs = teamsResult.foundedMs[teamId - 1];
    const startUpperBound = Math.max(teamFoundedMs, DATASET_END_MS - 30 * DAY_MS);
    const contractStartMs = intBetween(rng, teamFoundedMs, startUpperBound);

    let contractEnd: string | null = null;
    if (forceEnded || bernoulli(rng, 0.35)) {
      const endOffsetDays = intBetween(rng, 90, 700);
      let endMs = contractStartMs + endOffsetDays * DAY_MS;
      if (endMs > DATASET_END_MS) endMs = DATASET_END_MS;
      if (endMs <= contractStartMs) endMs = contractStartMs + DAY_MS;
      contractEnd = formatDate(endMs);
    }

    const region = REGIONS[(team.region_id as number) - 1];
    const multiplier = REGION_MARKET_MULTIPLIER[region.shortCode] || 1;
    const elo = teamsResult.elo[teamId - 1];
    const annualValue = round2((20000 + (elo - 1200) * 80) * multiplier * floatBetween(rng, 0.8, 1.3));

    teamSponsors.push({
      team_id: teamId,
      sponsor_id: sponsorId,
      contract_start: formatDate(contractStartMs),
      contract_end: contractEnd,
      annual_value_usd: annualValue,
    });
    usedPairs.add(`${teamId}|${sponsorId}`);
  }

  for (const teamId of megabrandTeamIds) pushTeamSponsor(teamId, megabrandSponsorId, false);
  for (const teamId of endedSponsorTeamIds) pushTeamSponsor(teamId, endedSponsorId, true);

  // Megabrand and the all-ended sponsor are excluded from the general pool below so their row
  // counts stay exactly at their designated levels (~10 and ENDED_SPONSOR_TEAM_COUNT) rather
  // than drifting upward if the random draw happens to re-pick them for another team.
  const candidates: [number, number][] = [];
  for (const teamId of eligibleTeamIds) {
    for (const sponsor of sponsors) {
      const sponsorId = sponsor.sponsor_id as number;
      if (sponsorId === megabrandSponsorId || sponsorId === endedSponsorId || sponsorId === TEAMLESS_SPONSOR_ID) continue;
      const key = `${teamId}|${sponsorId}`;
      if (usedPairs.has(key)) continue;
      candidates.push([teamId, sponsorId]);
    }
  }
  const remainingCount = TEAM_SPONSOR_COUNT - teamSponsors.length;
  const chosenPairs = sampleWithout(rng, candidates, remainingCount);
  for (const [teamId, sponsorId] of chosenPairs) pushTeamSponsor(teamId, sponsorId, false);

  return { sponsors, teamSponsors };
}

export function generate(seed: number): Record<string, Row[]> {
  const region = buildRegions();
  const teamsResult = buildTeams(seed);
  const players = buildPlayers(seed);
  const roster_change = assignRostersAndBuildChanges(seed, players, teamsResult);
  const tournamentsResult = buildTournaments(seed);
  const { matches, mapResults } = buildMatchesAndMapResults(seed, teamsResult, tournamentsResult);
  const { sponsors, teamSponsors } = buildSponsorsAndTeamSponsors(seed, teamsResult);

  return {
    region,
    team: teamsResult.rows,
    player: players,
    tournament: tournamentsResult.rows,
    match: matches,
    map_result: mapResults,
    roster_change,
    sponsor: sponsors,
    team_sponsor: teamSponsors,
  };
}

const mod: DatasetModule = { DB_NAME, SCHEMA_FILE, SEED, VERSION, TABLES, generate };
export default mod;
