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
