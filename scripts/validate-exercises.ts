import { createQueryService } from '../src/query-service';
import type { Exercise, ScaffoldTier } from '../src/generator/types';
import { buildFingerprint, hashRowsOrdered, toPositionalRows } from '../src/fingerprint';
import { buildAllExercises } from '../src/generator/index';
import { computeSnapshotHash, readServedSnapshot } from '../src/snapshot';

export interface GateContext {
  exercise: Exercise;
  database: string;
  result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number };
  validationSnapshot: string;
  servedSnapshot: string;
  run?: (sql: string) => Promise<{ fields: { name: string }[]; rows: unknown[][]; rowCount: number }>;
}

export interface GateResult {
  gate: string;
  pass: boolean;
  message: string;
}

export type Gate = (ctx: GateContext) => GateResult | Promise<GateResult>;

interface QueryLike {
  executeQuery(input: { database: string; sql: string; rowMode?: 'array' }): Promise<{
    columns?: string[];
    fields?: { name: string }[];
    rows: unknown[][];
    rowCount: number;
  }>;
  listDatabases?: () => string[];
  close?: () => Promise<void>;
}

export interface HarnessDeps {
  service?: QueryLike;
  computeSnapshot?: (database: string) => Promise<string>;
  readServed?: (database: string) => string | null;
  allowed?: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSql(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function wordPresent(haystack: string, needle: string): boolean {
  const clean = needle.toLowerCase().trim();
  if (!clean) return true;
  return new RegExp(`(^|[^a-z0-9_])${escapeRegExp(clean)}([^a-z0-9_]|$)`, 'i').test(haystack);
}

function orderByClause(sql: string): string | null {
  const match = /\border\s+by\b([\s\S]+?)(?:\blimit\b|;|$)/i.exec(sql);
  return match ? match[1] : null;
}

function orderByBareNames(sql: string): string[] {
  const clause = orderByClause(sql);
  if (!clause) return [];
  return clause
    .split(',')
    .map((term) =>
      term
        .trim()
        .replace(/\s+(asc|desc)\b[\s\S]*$/i, '')
        .split('.')
        .pop()!
        .replace(/["']/g, '')
        .trim()
    )
    .filter(Boolean);
}

function orderByKeyIndices(sql: string, fields: { name: string }[]): { hasOrderBy: boolean; indices: number[] } {
  if (!orderByClause(sql)) return { hasOrderBy: false, indices: [] };
  const names = fields.map((field) => field.name.toLowerCase());
  const indices: number[] = [];
  for (const bare of orderByBareNames(sql)) {
    const index = names.indexOf(bare.toLowerCase());
    if (index >= 0) indices.push(index);
  }
  return { hasOrderBy: true, indices };
}

function stripWhere(sql: string): string {
  return sql.replace(/\bwhere\b[\s\S]*?(?=\bgroup\s+by\b|\border\s+by\b|\blimit\b|$)/i, ' ');
}

function stripDedupFilter(sql: string): string {
  return sql.replace(/\bwhere\b\s+\w+\s*=\s*1\b/i, ' ');
}

function stripTimeZone(sql: string): string {
  return sql.replace(/\s+at\s+time\s+zone\s+'[^']*'/gi, '');
}

function rowKeyForIndices(row: unknown[], indices: number[]): string {
  return JSON.stringify(indices.map((index) => row[index]));
}

export const g0SnapshotIdentity: Gate = (ctx) => {
  const pass = ctx.validationSnapshot === ctx.servedSnapshot;
  return {
    gate: 'G0',
    pass,
    message: pass
      ? 'validation and served snapshots identical'
      : `snapshot drift: validation ${ctx.validationSnapshot.slice(0, 12)} vs served ${ctx.servedSnapshot.slice(0, 12)}`
  };
};

export const g1Runs: Gate = () => ({
  gate: 'G1',
  pass: true,
  message: 'expectedSql ran'
});

export const g2NonEmpty: Gate = (ctx) => {
  const pass = ctx.result.rowCount >= 1;
  return {
    gate: 'G2',
    pass,
    message: pass ? 'result is non-empty' : 'expectedSql returned zero rows'
  };
};

export const g3RowCeiling: Gate = (ctx) => {
  const ceiling = Number.isInteger(ctx.exercise.rowCeiling) ? ctx.exercise.rowCeiling : 200;
  const pass = ctx.result.rowCount <= ceiling;
  return {
    gate: 'G3',
    pass,
    message: pass ? `row count ${ctx.result.rowCount} <= ceiling ${ceiling}` : `row count ${ctx.result.rowCount} exceeds ceiling ${ceiling}`
  };
};

export const g4StableOrder: Gate = (ctx) => {
  const info = orderByKeyIndices(ctx.exercise.expectedSql, ctx.result.fields);
  if (!info.hasOrderBy) {
    return { gate: 'G4', pass: false, message: 'expectedSql has no ORDER BY' };
  }
  if (!info.indices.length) {
    return { gate: 'G4', pass: false, message: 'ORDER BY keys are not projected aliases' };
  }
  const keys = new Set(ctx.result.rows.map((row) => rowKeyForIndices(row, info.indices)));
  const pass = keys.size === ctx.result.rows.length;
  return {
    gate: 'G4',
    pass,
    message: pass ? 'ORDER BY projected key set is unique' : 'ORDER BY projected key set is not unique'
  };
};

export const g5NonDegenerate: Gate = async (ctx) => {
  const sql = ctx.exercise.expectedSql;
  const run = ctx.run;
  const isAggregate = /\b(count|sum|avg|min|max)\s*\(/i.test(sql);

  if (ctx.result.rowCount === 1 && ctx.result.fields.length === 1 && !isAggregate) {
    return { gate: 'G5', pass: false, message: 'answer is a single constant cell' };
  }

  if (/\bgroup\s+by\b/i.test(sql) && ctx.result.rowCount <= 1) {
    return { gate: 'G5', pass: false, message: 'GROUP BY produced a single group' };
  }

  if (run && /\bwhere\b/i.test(sql) && !/\blimit\b/i.test(sql)) {
    const unfiltered = stripWhere(sql);
    if (unfiltered !== sql) {
      const raw = await run(unfiltered);
      if (raw.rowCount === ctx.result.rowCount) {
        return { gate: 'G5', pass: false, message: 'WHERE filter does not change the row count' };
      }
    }
  }

  if (ctx.database === 'rove' && run) {
    if (/\brow_number\s*\(\s*\)/i.test(sql)) {
      const rawSql = stripDedupFilter(sql);
      if (rawSql !== sql) {
        const raw = await run(rawSql);
        if (raw.rowCount <= ctx.result.rowCount) {
          return { gate: 'G5', pass: false, message: 'dedup removed no rows' };
        }
      }
    }
    if (/\bat\s+time\s+zone\b/i.test(sql)) {
      const naiveSql = stripTimeZone(sql);
      if (naiveSql !== sql) {
        const naive = await run(naiveSql);
        const tzHash = hashRowsOrdered(toPositionalRows(ctx.result));
        const naiveHash = hashRowsOrdered(toPositionalRows(naive));
        if (tzHash === naiveHash) {
          return { gate: 'G5', pass: false, message: 'timezone conversion equals naive read' };
        }
      }
    }
  }

  return { gate: 'G5', pass: true, message: 'non-degenerate' };
};

export const g6DuplicateColumnName: Gate = (ctx) => {
  const names = ctx.result.fields.map((field) => field.name);
  const pass = new Set(names).size === names.length;
  return {
    gate: 'G6',
    pass,
    message: pass ? 'all output column names distinct' : `duplicate output column names: ${names.join(', ')}`
  };
};

export const g7TaskAnswerDeterminism: Gate = (ctx) => {
  const task = ctx.exercise.task.toLowerCase();
  const missing: string[] = [];
  for (const field of ctx.result.fields) {
    if (!wordPresent(task, field.name)) missing.push(field.name);
  }
  for (const key of orderByBareNames(ctx.exercise.expectedSql)) {
    if (!wordPresent(task, key)) missing.push(key);
  }
  if (missing.length) {
    return { gate: 'G7', pass: false, message: `task does not name: ${[...new Set(missing)].join(', ')}` };
  }
  if (ctx.exercise.orderMatters === false && !orderByClause(ctx.exercise.expectedSql)) {
    return { gate: 'G7', pass: false, message: 'orderMatters false requires stable ORDER BY for fingerprinting' };
  }
  return { gate: 'G7', pass: true, message: 'task references aliases and ORDER BY keys' };
};

export const g8ScaffoldFillBack: Gate = (ctx) => {
  const tiers: ScaffoldTier[] = ['full', 'half', 'blank'];
  const expected = normalizeSql(ctx.exercise.expectedSql);
  for (const tier of tiers) {
    const starter = ctx.exercise.starterSql[tier];
    const map = ctx.exercise.blankMap[tier];
    const tokens = Object.keys(map);
    let filled = starter;
    let blankCount = 0;
    for (const token of tokens) {
      const re = new RegExp(escapeRegExp(token), 'g');
      const matches = filled.match(re);
      blankCount += matches ? matches.length : 0;
      filled = filled.replace(re, map[token]);
    }
    if (blankCount !== tokens.length) {
      return { gate: 'G8', pass: false, message: `tier ${tier}: blank count ${blankCount} != answer-token count ${tokens.length}` };
    }
    if (normalizeSql(filled) !== expected) {
      return { gate: 'G8', pass: false, message: `tier ${tier}: filled scaffold does not reconstruct expectedSql` };
    }
  }
  return { gate: 'G8', pass: true, message: 'all tiers fill back to expectedSql' };
};

export const g9SelfCheck: Gate = async (ctx) => {
  const fingerprint = ctx.exercise.fingerprint;
  if (!fingerprint || !Array.isArray(fingerprint.columns)) {
    return { gate: 'G9', pass: false, message: 'no fingerprint baked before self-check' };
  }
  const rerun = ctx.run ? await ctx.run(ctx.exercise.expectedSql) : ctx.result;
  const fresh = buildFingerprint({ fields: rerun.fields, rows: rerun.rows });
  const columnsMatch = JSON.stringify(fingerprint.columns) === JSON.stringify(fresh.columns);
  const rowCountMatch = fingerprint.rowCount === fresh.rowCount;
  const hashMatch = ctx.exercise.orderMatters
    ? fingerprint.orderedRowHash === fresh.orderedRowHash
    : fingerprint.unorderedRowHash === fresh.unorderedRowHash;
  const pass = columnsMatch && rowCountMatch && hashMatch;
  return { gate: 'G9', pass, message: pass ? 'self-check correct' : 'self-check mismatch on re-run' };
};

export const GATES: Gate[] = [
  g0SnapshotIdentity,
  g1Runs,
  g2NonEmpty,
  g3RowCeiling,
  g4StableOrder,
  g5NonDegenerate,
  g6DuplicateColumnName,
  g7TaskAnswerDeterminism,
  g8ScaffoldFillBack,
  g9SelfCheck
];

const PRE_FINGERPRINT_GATES = GATES.slice(0, 9);

function fieldsFromResult(result: { columns?: string[]; fields?: { name: string }[] }): { name: string }[] {
  if (Array.isArray(result.fields)) return result.fields.map((field) => ({ name: field.name }));
  return (result.columns || []).map((name) => ({ name }));
}

async function runArray(
  service: QueryLike,
  database: string,
  sql: string
): Promise<{ fields: { name: string }[]; rows: unknown[][]; rowCount: number }> {
  const result = await service.executeQuery({ database, sql, rowMode: 'array' });
  const rows = (result.rows || []) as unknown[][];
  return {
    fields: fieldsFromResult(result),
    rows,
    rowCount: typeof result.rowCount === 'number' ? result.rowCount : rows.length
  };
}

export async function validateExercises(
  exercises: Exercise[],
  deps: HarnessDeps = {}
): Promise<{ passed: Exercise[]; failures: Array<{ id: string; results: GateResult[] }> }> {
  if (exercises.length === 0) return { passed: [], failures: [] };

  const ownsService = !deps.service;
  const service: QueryLike = deps.service || (createQueryService() as unknown as QueryLike);
  const computeSnapshot = deps.computeSnapshot || ((database: string) => computeSnapshotHash(database, { service: service as any }));
  const readServed = deps.readServed || readServedSnapshot;
  const allowed = deps.allowed || (typeof service.listDatabases === 'function'
    ? service.listDatabases()
    : ['aperture', 'sideline', 'rove']);

  const snapshotCache = new Map<string, string>();
  const passed: Exercise[] = [];
  const failures: Array<{ id: string; results: GateResult[] }> = [];

  try {
    for (const exercise of exercises) {
      const database = exercise.database;
      if (!allowed.includes(database)) {
        failures.push({
          id: exercise.id,
          results: [{ gate: 'G0', pass: false, message: `database "${database}" is not an allowed target` }]
        });
        continue;
      }

      let result: { fields: { name: string }[]; rows: unknown[][]; rowCount: number };
      try {
        result = await runArray(service, database, exercise.expectedSql);
      } catch (error) {
        failures.push({
          id: exercise.id,
          results: [{ gate: 'G1', pass: false, message: `expectedSql failed to run: ${(error as Error).message}` }]
        });
        continue;
      }

      if (!snapshotCache.has(database)) snapshotCache.set(database, await computeSnapshot(database));
      const validationSnapshot = snapshotCache.get(database)!;
      const servedSnapshot = readServed(database) || validationSnapshot;
      const ctx: GateContext = {
        exercise,
        database,
        result,
        validationSnapshot,
        servedSnapshot,
        run: (sql: string) => runArray(service, database, sql)
      };

      const results: GateResult[] = [];
      let ok = true;
      for (const gate of PRE_FINGERPRINT_GATES) {
        const gateResult = await gate(ctx);
        results.push(gateResult);
        if (!gateResult.pass) ok = false;
      }
      if (!ok) {
        failures.push({ id: exercise.id, results });
        continue;
      }

      const fingerprint = buildFingerprint({ fields: result.fields, rows: result.rows });
      const withFingerprint: Exercise = { ...exercise, fingerprint };
      const selfCheck = await g9SelfCheck({ ...ctx, exercise: withFingerprint });
      results.push(selfCheck);
      if (!selfCheck.pass) {
        failures.push({ id: exercise.id, results });
        continue;
      }
      passed.push(withFingerprint);
    }
  } finally {
    if (ownsService && typeof service.close === 'function') {
      await service.close();
    }
  }

  return { passed, failures };
}

function parseDbArg(argv: string[]): string | null {
  const index = argv.indexOf('--db');
  return index >= 0 ? argv[index + 1] || null : null;
}

async function main(): Promise<void> {
  const byDb = await buildAllExercises();
  const db = parseDbArg(process.argv.slice(2));
  const all: Exercise[] = [];
  for (const key of Object.keys(byDb) as Array<keyof typeof byDb>) {
    if (db && key !== db) continue;
    for (const draft of byDb[key]) all.push(draft as unknown as Exercise);
  }

  const { passed, failures } = await validateExercises(all);
  console.log(`validate-exercises: ${passed.length} passed, ${failures.length} failed`);
  for (const failure of failures) {
    const reasons = failure.results.filter((result) => !result.pass).map((result) => `${result.gate}:${result.message}`).join('; ');
    console.log(`FAIL ${failure.id} -> ${reasons}`);
  }
  if (failures.length) process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
