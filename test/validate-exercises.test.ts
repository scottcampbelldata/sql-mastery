import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFingerprint } from '../src/fingerprint';
import type { Exercise } from '../src/generator/types';
import {
  g3RowCeiling,
  g5NonDegenerate,
  g6DuplicateColumnName,
  g7TaskAnswerDeterminism,
  g8ScaffoldFillBack,
  validateExercises,
  type GateContext
} from '../scripts/validate-exercises';

const DUMMY_FP = {
  columns: [],
  rowCount: 0,
  orderedRowHash: '',
  unorderedRowHash: ''
};

function makeExercise(over: Partial<Exercise>): Exercise {
  return {
    id: 'x1',
    skill: 'ap-order-by',
    database: 'aperture',
    task: 'List each camera model and its price ordered by price then model.',
    starterSql: { full: '', half: '', blank: '' },
    blankMap: { full: {}, half: {}, blank: {} },
    hint: 'hint',
    expectedSql: 'SELECT model, price FROM cameras ORDER BY price, model',
    orderMatters: true,
    rowCeiling: 200,
    fingerprint: DUMMY_FP,
    ...over
  } as Exercise;
}

function makeCtx(
  exercise: Exercise,
  result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number },
  run?: GateContext['run']
): GateContext {
  return {
    exercise,
    database: exercise.database,
    result,
    validationSnapshot: 'same',
    servedSnapshot: 'same',
    run
  };
}

test('g3 fails when rowCount exceeds the ceiling', async () => {
  const ex = makeExercise({ rowCeiling: 50 });
  const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 51 });
  assert.equal((await g3RowCeiling(ctx)).pass, false);
  const ok = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 50 });
  assert.equal((await g3RowCeiling(ok)).pass, true);
});

test('g6 fails on duplicate output column names', async () => {
  const ex = makeExercise({});
  const dup = makeCtx(ex, { fields: [{ name: 'total' }, { name: 'total' }], rows: [], rowCount: 0 });
  assert.equal((await g6DuplicateColumnName(dup)).pass, false);
  const uniq = makeCtx(ex, { fields: [{ name: 'a' }, { name: 'b' }], rows: [], rowCount: 0 });
  assert.equal((await g6DuplicateColumnName(uniq)).pass, true);
});

test('g7 fails when the task does not name a projected alias', async () => {
  const ex = makeExercise({ task: 'Show model only.' });
  const ctx = makeCtx(ex, {
    fields: [{ name: 'model' }, { name: 'price' }],
    rows: [],
    rowCount: 0
  });
  assert.equal((await g7TaskAnswerDeterminism(ctx)).pass, false);
});

test('g7 requires a stable ORDER BY even when orderMatters is false', async () => {
  const ex = makeExercise({
    orderMatters: false,
    task: 'Show model and price.',
    expectedSql: 'SELECT model, price FROM cameras'
  });
  const ctx = makeCtx(ex, {
    fields: [{ name: 'model' }, { name: 'price' }],
    rows: [],
    rowCount: 0
  });
  assert.equal((await g7TaskAnswerDeterminism(ctx)).pass, false);
});

test('g8 passes when every tier fills back to expectedSql', async () => {
  const ex = makeExercise({
    expectedSql: 'SELECT model FROM cameras ORDER BY model',
    starterSql: {
      full: 'SELECT __1__ FROM cameras ORDER BY __2__',
      half: 'SELECT __1__ FROM cameras ORDER BY model',
      blank: 'SELECT model FROM cameras ORDER BY model'
    },
    blankMap: {
      full: { __1__: 'model', __2__: 'model' },
      half: { __1__: 'model' },
      blank: {}
    }
  });
  const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 0 });
  assert.equal((await g8ScaffoldFillBack(ctx)).pass, true);
});

test('g8 fails when a tier does not reconstruct expectedSql', async () => {
  const ex = makeExercise({
    expectedSql: 'SELECT model FROM cameras ORDER BY model',
    starterSql: { full: 'SELECT __1__ FROM cameras ORDER BY model', half: '', blank: '' },
    blankMap: { full: { __1__: 'price' }, half: {}, blank: {} }
  });
  const ctx = makeCtx(ex, { fields: [{ name: 'model' }], rows: [], rowCount: 0 });
  assert.equal((await g8ScaffoldFillBack(ctx)).pass, false);
});

test('g5 fails a GROUP BY that yields a single group', async () => {
  const ex = makeExercise({
    expectedSql: 'SELECT brand, COUNT(*) AS n FROM cameras GROUP BY brand ORDER BY brand'
  });
  const ctx = makeCtx(ex, { fields: [{ name: 'brand' }, { name: 'n' }], rows: [['a', '9']], rowCount: 1 });
  assert.equal((await g5NonDegenerate(ctx)).pass, false);
});

test('g5 ignores nested WHERE clauses when checking top-level filter impact', async () => {
  const ex = makeExercise({
    expectedSql:
      'SELECT canon.brand, COUNT(*) AS n FROM (SELECT brand FROM cameras WHERE active = true) canon GROUP BY canon.brand ORDER BY brand'
  });
  const ctx = makeCtx(
    ex,
    { fields: [{ name: 'brand' }, { name: 'n' }], rows: [['a', '2'], ['b', '3']], rowCount: 2 },
    async () => {
      throw new Error('nested WHERE should not be stripped');
    }
  );
  assert.equal((await g5NonDegenerate(ctx)).pass, true);
});

test('validateExercises bakes a real fingerprint onto passers', async () => {
  const ex = makeExercise({
    expectedSql: 'SELECT model, price FROM cameras ORDER BY price, model',
    task: 'List model and price ordered by price then model.',
    starterSql: {
      full: 'SELECT model, price FROM cameras ORDER BY price, model',
      half: 'SELECT model, price FROM cameras ORDER BY price, model',
      blank: 'SELECT model, price FROM cameras ORDER BY price, model'
    },
    blankMap: { full: {}, half: {}, blank: {} }
  });
  const arrayResult = {
    columns: ['model', 'price'],
    fields: [{ name: 'model' }, { name: 'price' }],
    rows: [
      ['a', '10'],
      ['b', '20']
    ],
    rowCount: 2
  };
  const service = {
    listDatabases: () => ['aperture', 'sideline', 'rove'],
    async executeQuery(_i: { database: string; sql: string; rowMode?: 'array' }) {
      return arrayResult;
    }
  };
  const { passed, failures } = await validateExercises([ex], {
    service: service as any,
    computeSnapshot: async () => 'snap',
    readServed: () => 'snap'
  });
  assert.equal(failures.length, 0);
  assert.equal(passed.length, 1);
  const expectedFp = buildFingerprint({
    fields: [{ name: 'model' }, { name: 'price' }],
    rows: arrayResult.rows
  });
  assert.deepEqual(passed[0].fingerprint, expectedFp);
});
