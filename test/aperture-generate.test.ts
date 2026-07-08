import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as aperture from '../src/datasets/aperture/generate';

test('aperture generates deterministic, referential, real-data-backed rows', () => {
  const d1 = aperture.generate(aperture.SEED);
  const d2 = aperture.generate(aperture.SEED);
  assert.deepEqual(d1, d2); // deterministic

  assert.equal(d1.stars.length, 77); // 67 real hosts + 10 famous planetless stars
  assert.equal(d1.planets.length, 140);
  assert.equal(d1.facility.length, 23);

  const starIds = new Set(d1.stars.map((s: any) => s.star_id));
  const facilityIds = new Set(d1.facility.map((f: any) => f.facility_id));
  for (const p of d1.planets) {
    assert.ok(starIds.has(p.star_id)); // FK valid: planets -> stars
    assert.ok(facilityIds.has(p.facility_id)); // FK valid: planets -> facility
  }

  const types = new Set(d1.stars.map((s: any) => s.spectral_type));
  for (const t of ['O', 'B', 'A', 'F', 'G', 'K', 'M']) assert.ok(types.has(t)); // all 7 present (O from Naos)

  const perStar = new Map<number, number>();
  d1.planets.forEach((p: any) => perStar.set(p.star_id, (perStar.get(p.star_id) || 0) + 1));

  const planetlessStars = d1.stars.filter((s: any) => !perStar.has(s.star_id));
  assert.ok(planetlessStars.length >= 5); // the famous stars (Sirius, Vega, Rigel, Naos, etc.)

  assert.ok([...perStar.values()].some((n) => n >= 7)); // TRAPPIST-1 hosts 7 confirmed planets

  const nullEqTempCount = d1.planets.filter((p: any) => p.equilibrium_temp_k === null).length;
  assert.ok(nullEqTempCount >= 5); // the IS NULL teaching column

  // mass_solar/spectral_type consistency: no M star with temperature_k > 3700, no O star < 30000
  assert.ok(d1.stars.every((s: any) => !(s.spectral_type === 'M' && s.temperature_k > 3700)));
  assert.ok(d1.stars.every((s: any) => !(s.spectral_type === 'O' && s.temperature_k < 30000)));

  assert.ok(d1.planets.some((p: any) => p.in_habitable_zone === true));
});
