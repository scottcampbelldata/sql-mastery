import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curate, honestCounts } from '../src/generator/curate';
import type { DraftExercise, ConceptMeta } from '../src/generator/types';

function draft(id: string, skill: string, expectedSql: string): DraftExercise {
  return {
    id,
    skill,
    database: 'aperture',
    task: 't',
    hint: 'h',
    expectedSql,
    starterSql: { full: '', half: '', blank: '' },
    blankMap: { full: {}, half: {}, blank: {} },
    orderMatters: true,
    rowCeiling: 200
  };
}

const meta: ConceptMeta[] = [{
  skill: 'ap-a',
  order: 1,
  title: 'A',
  phaseId: 'ap-basics',
  teach: { plain: '', mentalModel: '', example: { sql: '', note: '' } }
}];

test('curate collapses two exercises differing only by a numeric literal', () => {
  const a = draft('id-a', 'ap-a', 'SELECT name FROM track WHERE genre_id = 1 ORDER BY track_id;');
  const b = draft('id-b', 'ap-a', 'SELECT name FROM track WHERE genre_id = 2 ORDER BY track_id;');
  const out = curate([a, b], meta);
  assert.equal(out.length, 1);
  assert.equal(out[0].skill, 'ap-a');
});

test('curate drops skills not in meta; honestCounts reports per-skill', () => {
  const a = draft('id-a', 'ap-a', 'SELECT 1;');
  const x = draft('id-x', 'ap-unknown', 'SELECT 2;');
  const out = curate([a, x], meta);
  assert.equal(out.length, 1);
  assert.deepEqual(honestCounts(out), { 'ap-a': 1 });
});
