import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { createQueryService } from '../src/query-service';
import { SIDELINE_UNMATCHED_MANIFEST as M } from '../src/generator/templates/sideline/manifest';

const svc = createQueryService();

after(async () => {
  await svc.close();
});

async function scalar(sql: string): Promise<number> {
  const res = await svc.executeQuery({ database: 'sideline', sql, rowMode: 'array' });
  return Number(res.rows[0][0]);
}

test('every neverPlayedTeamId is in no match', async () => {
  for (const id of M.neverPlayedTeamIds) {
    const n = await scalar(
      `SELECT count(*) FROM match WHERE team_a_id = ${id} OR team_b_id = ${id} OR winner_team_id = ${id}`
    );
    assert.equal(n, 0, `team ${id} appears in ${n} matches`);
  }

  const total = await scalar(
    `SELECT count(*) FROM team t WHERE NOT EXISTS (SELECT 1 FROM match m WHERE m.team_a_id = t.team_id OR m.team_b_id = t.team_id)`
  );
  assert.ok(total >= 1);
});

test('every playerlessTeamId has zero players', async () => {
  for (const id of M.playerlessTeamIds) {
    const n = await scalar(`SELECT count(*) FROM player WHERE team_id = ${id}`);
    assert.equal(n, 0, `team ${id} has ${n} players`);
  }
});

test('every teamlessSponsorId has zero team_sponsor rows', async () => {
  for (const id of M.teamlessSponsorIds) {
    const n = await scalar(`SELECT count(*) FROM team_sponsor WHERE sponsor_id = ${id}`);
    assert.equal(n, 0, `sponsor ${id} has ${n} team_sponsor rows`);
  }
});

test('the sponsorless-team anti-join predicate returns >= 1 row', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.sponsorlessTeamAntiJoin}) q`);
  assert.ok(n >= 1);
});

test('the null-region tournament predicate returns >= 1 row', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.nullRegionTournament}) q`);
  assert.ok(n >= 1);
});

test('the intra-region Elo tie predicate returns >= 1 pair', async () => {
  const n = await scalar(`SELECT count(*) FROM (${M.intraRegionEloTie}) q`);
  assert.ok(n >= 1);
});
