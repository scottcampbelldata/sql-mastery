import { formatSql } from './sqlFormat';
import type { Exercise } from '../types';

export const SQL_BLANK = '____';

const JOIN_END = String.raw`(?=\s+(?:(?:LEFT|RIGHT|FULL|INNER|CROSS)\s+)?JOIN\b|\s+WHERE\b|\s+GROUP\s+BY\b|\s+HAVING\b|\s+ORDER\s+BY\b|\s+LIMIT\b|$)`;
const FROM_END = String.raw`(?=\s+(?:(?:LEFT|RIGHT|FULL|INNER|CROSS)\s+)?JOIN\b|\s+WHERE\b|\s+GROUP\s+BY\b|\s+HAVING\b|\s+ORDER\s+BY\b|\s+LIMIT\b|$)`;
const WHERE_END = String.raw`(?=\s+GROUP\s+BY\b|\s+HAVING\b|\s+ORDER\s+BY\b|\s+LIMIT\b|$)`;
const GROUP_END = String.raw`(?=\s+HAVING\b|\s+ORDER\s+BY\b|\s+LIMIT\b|$)`;
const ORDER_END = String.raw`(?=\s+LIMIT\b|$)`;

function normalizeSql(sql: string | undefined): string {
  return String(sql || '').trim().replace(/\s+/g, ' ').replace(/;+\s*$/, '');
}

function withSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed ? `${trimmed};` : '';
}

export function hasSqlBlank(sql: string | undefined): boolean {
  return /_{3,}/.test(String(sql || ''));
}

export function scaffoldSql(expectedSql: string | undefined): string {
  const normalized = normalizeSql(expectedSql);
  if (!normalized) return '';

  if (/^WITH\b/i.test(normalized)) {
    return 'WITH ____ AS (\n  SELECT ____\n  FROM ____\n)\nSELECT ____\nFROM ____;';
  }

  const explainPrefix = /^EXPLAIN\s+/i.test(normalized) ? 'EXPLAIN ' : '';
  let scaffold = normalized.replace(/^EXPLAIN\s+/i, '');

  if (!/\bSELECT\b/i.test(scaffold)) return formatSql(withSemicolon(`${explainPrefix}${SQL_BLANK}`));

  if (/\bFROM\b/i.test(scaffold)) {
    scaffold = scaffold.replace(/\bSELECT\s+.+?\s+FROM\b/i, `SELECT ${SQL_BLANK} FROM`);
  } else {
    scaffold = scaffold.replace(/\bSELECT\s+.+$/i, `SELECT ${SQL_BLANK}`);
  }

  scaffold = scaffold.replace(
    new RegExp(String.raw`\b((?:(?:LEFT|RIGHT|FULL|INNER|CROSS)\s+)?)JOIN\s+.+?\s+ON\s+.+?${JOIN_END}`, 'gi'),
    (_, joinType) => `${joinType || ''}JOIN ${SQL_BLANK} ON ${SQL_BLANK}`
  );
  scaffold = scaffold.replace(new RegExp(String.raw`\bFROM\s+.+?${FROM_END}`, 'i'), `FROM ${SQL_BLANK}`);
  scaffold = scaffold.replace(new RegExp(String.raw`\bWHERE\s+.+?${WHERE_END}`, 'i'), `WHERE ${SQL_BLANK}`);
  scaffold = scaffold.replace(new RegExp(String.raw`\bGROUP\s+BY\s+.+?${GROUP_END}`, 'i'), `GROUP BY ${SQL_BLANK}`);
  scaffold = scaffold.replace(new RegExp(String.raw`\bHAVING\s+.+?${GROUP_END}`, 'i'), `HAVING ${SQL_BLANK}`);
  scaffold = scaffold.replace(new RegExp(String.raw`\bORDER\s+BY\s+.+?${ORDER_END}`, 'i'), `ORDER BY ${SQL_BLANK}`);
  scaffold = scaffold.replace(/\bLIMIT\s+.+$/i, `LIMIT ${SQL_BLANK}`);

  return formatSql(withSemicolon(`${explainPrefix}${scaffold}`));
}

// Only the starter/expected fields are read, so a minimal shape is enough (and lets
// callers pass a full Exercise or a lightweight fixture).
export function starterSqlForExercise(exercise: Pick<Exercise, 'starterSql' | 'expectedSql'> | null | undefined): string {
  const explicit = String(exercise?.starterSql || '').trim();
  if (explicit) return formatSql(explicit);
  return scaffoldSql(exercise?.expectedSql);
}

// Middle scaffold tier: reveal about half of a starter's ____ blanks by filling them with
// their expected values (from expectedSql) and keeping the rest blank. Reveals the
// even-indexed blanks, always keeping at least one blank. The starter's literal segments
// are matched against the expected in order to recover each blank's value; on any mismatch
// this falls back to the untouched full starter, so it never reveals a wrong value.
export function revealHalfScaffold(starter: string, expectedSql: string | undefined): string {
  const norm = (s: string | undefined): string => String(s || '').replace(/\s+/g, ' ').trim();
  const starterN = norm(starter);
  const expectedN = norm(expectedSql).replace(/;+$/, '');
  const lits = starterN.replace(/;+$/, '').split(/_{2,}/);
  const blankCount = lits.length - 1;
  if (blankCount < 1 || !expectedN) return formatSql(starter);

  const values: string[] = [];
  let pos = expectedN.indexOf(lits[0]);
  if (pos < 0) return formatSql(starter);
  pos += lits[0].length;
  for (let i = 1; i < lits.length; i += 1) {
    const next = lits[i] === '' ? expectedN.length : expectedN.indexOf(lits[i], pos);
    if (next < 0) return formatSql(starter);
    values.push(expectedN.slice(pos, next).trim());
    pos = next + lits[i].length;
  }

  const reveal = new Set<number>();
  for (let i = 0; i < blankCount; i += 2) reveal.add(i);
  if (reveal.size >= blankCount) reveal.delete(blankCount - 1);

  let out = lits[0];
  for (let i = 0; i < blankCount; i += 1) {
    out += reveal.has(i) && values[i] ? values[i] : SQL_BLANK;
    out += lits[i + 1];
  }
  return formatSql(withSemicolon(out));
}
