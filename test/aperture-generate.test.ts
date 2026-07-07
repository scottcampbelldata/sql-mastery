import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as aperture from '../src/datasets/aperture/generate';

test('aperture generates deterministic, referential, NULL-bearing data', () => {
  const d1 = aperture.generate(aperture.SEED);
  const d2 = aperture.generate(aperture.SEED);
  assert.deepEqual(d1, d2);                                   // deterministic
  assert.equal(d1.stars.length, 60);
  assert.equal(d1.planets.length, 180);
  const starIds = new Set(d1.stars.map((s: any) => s.star_id));
  for (const p of d1.planets) assert.ok(starIds.has(p.star_id)); // FK valid
  assert.ok(d1.planets.some((p: any) => p.mass_earth === null));  // IS NULL practice
  assert.ok(d1.planets.some((p: any) => p.radius_earth === null));
  const types = new Set(d1.stars.map((s: any) => s.spectral_type));
  for (const t of ['O','B','A','F','G','K','M']) assert.ok(types.has(t)); // all 7 present
  assert.ok(d1.stars.every((s: any) => s.temperature_k > 0 && s.mass_solar > 0));
  // one star hosts >= 7 planets (TRAPPIST-like) and >= 2 stars host zero planets
  const perStar = new Map<number, number>();
  d1.planets.forEach((p: any) => perStar.set(p.star_id, (perStar.get(p.star_id) || 0) + 1));
  assert.ok([...perStar.values()].some((n) => n >= 7));
  assert.ok(d1.stars.filter((s: any) => !perStar.has(s.star_id)).length >= 2);
});
