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

test('curate keeps exercises differing by a numeric literal', () => {
  const a = draft('id-a', 'ap-a', 'SELECT title FROM articles WHERE author_id = 1 ORDER BY article_id;');
  const b = draft('id-b', 'ap-a', 'SELECT title FROM articles WHERE author_id = 2 ORDER BY article_id;');
  const out = curate([a, b], meta);
  assert.equal(out.length, 2);
  assert.equal(out[0].skill, 'ap-a');
});

test('curate collapses exact duplicate SQL for the same skill', () => {
  const a = draft('id-a', 'ap-a', 'SELECT title FROM articles WHERE author_id = 1 ORDER BY article_id;');
  const b = draft('id-b', 'ap-a', 'select title from articles where author_id = 1 order by article_id;');
  const out = curate([a, b], meta);
  assert.equal(out.length, 1);
});

test('curate drops skills not in meta; honestCounts reports per-skill', () => {
  const a = draft('id-a', 'ap-a', 'SELECT 1;');
  const x = draft('id-x', 'ap-unknown', 'SELECT 2;');
  const out = curate([a, x], meta);
  assert.equal(out.length, 1);
  assert.deepEqual(honestCounts(out), { 'ap-a': 1 });
});
