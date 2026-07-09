import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generate, SEED } from '../src/datasets/sideline/generate';

type Row = Record<string, unknown>;

const data = generate(SEED);
const teams = data.team as Row[];
const players = data.player as Row[];
const matches = data.match as Row[];
const tournaments = data.tournament as Row[];
const sponsors = data.sponsor as Row[];
const teamSponsors = data.team_sponsor as Row[];

test('there is >= 1 never-played team (team 40 in no match slot)', () => {
  const played = new Set<number>();
  for (const match of matches) {
    played.add(match.team_a_id as number);
    played.add(match.team_b_id as number);
    played.add(match.winner_team_id as number);
  }
  const neverPlayed = teams.filter((team) => !played.has(team.team_id as number));
  assert.ok(neverPlayed.length >= 1, 'expected at least one never-played team');
  assert.ok(neverPlayed.some((team) => (team.team_id as number) === 40), 'team 40 must be never-played');
});

test('there is >= 1 player-less team (no player.team_id references it)', () => {
  const withPlayers = new Set(players.map((player) => player.team_id as number | null).filter((teamId) => teamId !== null));
  const playerless = teams.filter((team) => !withPlayers.has(team.team_id as number));
  assert.ok(playerless.length >= 1);
  assert.ok(playerless.some((team) => (team.team_id as number) === 40), 'team 40 must be player-less');
});

test('there is >= 1 team-less sponsor (sponsor 30 has no team_sponsor rows)', () => {
  const linked = new Set(teamSponsors.map((teamSponsor) => teamSponsor.sponsor_id as number));
  assert.ok(sponsors.some((sponsor) => (sponsor.sponsor_id as number) === 30));
  assert.ok(!linked.has(30), 'sponsor 30 must have zero team_sponsor rows');
});

test('there is >= 1 sponsorless team (a team absent from team_sponsor)', () => {
  const sponsored = new Set(teamSponsors.map((teamSponsor) => teamSponsor.team_id as number));
  assert.ok(teams.some((team) => !sponsored.has(team.team_id as number)));
});

test('there is >= 1 NULL-region tournament', () => {
  assert.ok(tournaments.some((tournament) => tournament.region_id === null));
});

test('there is >= 1 intra-region Elo tie (two teams, same region, equal elo)', () => {
  const byRegion = new Map<number, number[]>();
  for (const team of teams) {
    const regionId = team.region_id as number;
    if (!byRegion.has(regionId)) byRegion.set(regionId, []);
    byRegion.get(regionId)!.push(team.elo_rating as number);
  }
  let tie = false;
  for (const elos of byRegion.values()) {
    if (new Set(elos).size < elos.length) tie = true;
  }
  assert.ok(tie, 'expected at least one same-region pair sharing an elo_rating');
});
