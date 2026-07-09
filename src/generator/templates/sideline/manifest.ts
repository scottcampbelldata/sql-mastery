// Confirmed-unmatched-rows manifest for the sideline intermediate templates. These entities are
// GUARANTEED by the sideline seed generator (Task 10 edits) and CONFIRMED against the seeded DB by
// test/sideline-manifest.test.ts. The anti/semi/full-outer/self-join-compare templates draw from
// this curated set (not a blind cross-product) so every emitted exercise is non-empty (gate g2).
export interface SidelineUnmatchedManifest {
  neverPlayedTeamIds: number[];
  playerlessTeamIds: number[];
  teamlessSponsorIds: number[];
  sponsorlessTeamAntiJoin: string;
  nullRegionTournament: string;
  intraRegionEloTie: string;
}

export const SIDELINE_UNMATCHED_MANIFEST: SidelineUnmatchedManifest = {
  neverPlayedTeamIds: [40],
  playerlessTeamIds: [40],
  teamlessSponsorIds: [30],
  sponsorlessTeamAntiJoin:
    'SELECT t.team_id, t.name FROM team t ' +
    'LEFT JOIN team_sponsor ts ON ts.team_id = t.team_id ' +
    'WHERE ts.team_id IS NULL',
  nullRegionTournament:
    'SELECT tournament_id, name FROM tournament WHERE region_id IS NULL',
  intraRegionEloTie:
    'SELECT a.team_id AS team_a, b.team_id AS team_b, a.elo_rating ' +
    'FROM team a JOIN team b ON a.region_id = b.region_id ' +
    'AND a.elo_rating = b.elo_rating AND a.team_id < b.team_id',
};
