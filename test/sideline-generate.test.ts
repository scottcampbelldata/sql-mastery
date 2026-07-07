import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sideline from '../src/datasets/sideline/generate';

test('sideline generates deterministic, referentially intact, believable data', () => {
  const d1 = sideline.generate(sideline.SEED);
  const d2 = sideline.generate(sideline.SEED);
  assert.deepEqual(d1, d2); // deterministic

  assert.equal(d1.region.length, 8);
  assert.equal(d1.team.length, 40);
  assert.equal(d1.player.length, 280);
  assert.equal(d1.tournament.length, 24);
  assert.equal(d1.match.length, 1200);
  assert.equal(d1.map_result.length, 3000);
  assert.equal(d1.roster_change.length, 600);
  assert.equal(d1.sponsor.length, 30);
  assert.equal(d1.team_sponsor.length, 120);

  const regionIds = new Set(d1.region.map((r: any) => r.region_id));
  const teamIds = new Set(d1.team.map((t: any) => t.team_id));
  const playerIds = new Set(d1.player.map((p: any) => p.player_id));
  const tournamentIds = new Set(d1.tournament.map((t: any) => t.tournament_id));
  const matchIds = new Set(d1.match.map((m: any) => m.match_id));
  const sponsorIds = new Set(d1.sponsor.map((s: any) => s.sponsor_id));

  const teamById = new Map(d1.team.map((t: any) => [t.team_id, t]));
  const tournamentById = new Map(d1.tournament.map((t: any) => [t.tournament_id, t]));

  // full referential integrity across all FKs
  for (const t of d1.team) {
    assert.ok(regionIds.has((t as any).region_id));
  }
  for (const p of d1.player) {
    if ((p as any).team_id !== null) assert.ok(teamIds.has((p as any).team_id));
  }
  for (const t of d1.tournament) {
    if ((t as any).region_id !== null) assert.ok(regionIds.has((t as any).region_id));
  }
  for (const m of d1.match) {
    assert.ok(tournamentIds.has((m as any).tournament_id));
    assert.ok(teamIds.has((m as any).team_a_id));
    assert.ok(teamIds.has((m as any).team_b_id));
    assert.ok(teamIds.has((m as any).winner_team_id));
    assert.notEqual((m as any).team_a_id, (m as any).team_b_id);
    assert.ok((m as any).winner_team_id === (m as any).team_a_id || (m as any).winner_team_id === (m as any).team_b_id);
  }
  for (const mr of d1.map_result) {
    assert.ok(matchIds.has((mr as any).match_id));
    assert.ok(teamIds.has((mr as any).winner_team_id));
  }
  for (const rc of d1.roster_change) {
    assert.ok(playerIds.has((rc as any).player_id));
    assert.ok(teamIds.has((rc as any).team_id));
  }
  for (const ts of d1.team_sponsor) {
    assert.ok(teamIds.has((ts as any).team_id));
    assert.ok(sponsorIds.has((ts as any).sponsor_id));
  }

  // per-map winners sum to the match score, majority side matches winner
  const mapsByMatch = new Map<number, any[]>();
  for (const mr of d1.map_result) {
    const key = (mr as any).match_id;
    if (!mapsByMatch.has(key)) mapsByMatch.set(key, []);
    mapsByMatch.get(key)!.push(mr);
  }
  for (const m of d1.match) {
    const maps = mapsByMatch.get((m as any).match_id) || [];
    const aWins = maps.filter((mr) => mr.winner_team_id === (m as any).team_a_id).length;
    const bWins = maps.filter((mr) => mr.winner_team_id === (m as any).team_b_id).length;
    assert.equal(aWins, (m as any).team_a_score);
    assert.equal(bWins, (m as any).team_b_score);
    assert.ok(aWins + bWins > 0);
  }

  // match_datetime within tournament window
  for (const m of d1.match) {
    const tour = tournamentById.get((m as any).tournament_id) as any;
    const dt = new Date((m as any).match_datetime as string).getTime();
    const start = new Date(`${tour.start_date}T00:00:00Z`).getTime();
    const end = new Date(`${tour.end_date}T23:59:59Z`).getTime();
    assert.ok(dt >= start && dt <= end, `match ${(m as any).match_id} outside tournament window`);
  }

  // >= 4 teams win zero matches
  const winCounts = new Map<number, number>();
  for (const t of d1.team) winCounts.set((t as any).team_id, 0);
  for (const m of d1.match) {
    const w = (m as any).winner_team_id;
    winCounts.set(w, (winCounts.get(w) || 0) + 1);
  }
  const zeroWinTeams = [...winCounts.values()].filter((n) => n === 0);
  assert.ok(zeroWinTeams.length >= 4, `expected >= 4 zero-win teams, got ${zeroWinTeams.length}`);

  // >= 1 team has zero team_sponsor rows
  const sponsoredTeamIds = new Set(d1.team_sponsor.map((ts: any) => ts.team_id));
  const sponsorlessTeams = d1.team.filter((t: any) => !sponsoredTeamIds.has(t.team_id));
  assert.ok(sponsorlessTeams.length >= 1);

  // >= 20 free agents
  const freeAgents = d1.player.filter((p: any) => p.team_id === null);
  assert.ok(freeAgents.length >= 20, `expected >= 20 free agents, got ${freeAgents.length}`);

  // every current player has exactly one open roster stint on their team
  const openStintsByPlayer = new Map<number, any[]>();
  for (const rc of d1.roster_change) {
    if ((rc as any).to_date === null) {
      const key = (rc as any).player_id;
      if (!openStintsByPlayer.has(key)) openStintsByPlayer.set(key, []);
      openStintsByPlayer.get(key)!.push(rc);
    }
  }
  for (const p of d1.player) {
    const pid = (p as any).player_id;
    const teamId = (p as any).team_id;
    if (teamId !== null) {
      const open = openStintsByPlayer.get(pid) || [];
      assert.equal(open.length, 1, `player ${pid} should have exactly one open stint`);
      assert.equal(open[0].team_id, teamId, `player ${pid} open stint team mismatch`);
    } else {
      const open = openStintsByPlayer.get(pid) || [];
      assert.equal(open.length, 0, `free agent ${pid} should have no open stint`);
    }
  }
});
