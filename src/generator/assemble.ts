import { fnv1a } from '../datasets/framework/prng';
import { emitSql } from './emit';
import { buildScaffold } from './scaffold';
import { renderHint } from './hint';
import { renderTask } from './task-text';
import type { Catalog } from './schema-catalog';
import type { DraftExercise, Template, Binding } from './types';

function canonicalBinding(binding: Binding): string {
  const slots = Object.keys(binding.slots).sort()
    .map((k) => `${k}=${binding.slots[k]}`)
    .join('|');
  const literals = Object.keys(binding.literals).sort()
    .map((k) => `${k}=${binding.literals[k]}`)
    .join('|');
  return `${slots}#${literals}`;
}

function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';

  for (const ch of list) {
    if (ch === "'") inString = !inString;
    if (!inString && ch === '(') depth += 1;
    if (!inString && ch === ')') depth -= 1;
    if (!inString && depth === 0 && ch === ',') {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim() !== '') parts.push(current);
  return parts.map((part) => part.trim());
}

function topLevelSelectList(sql: string): string | null {
  const select = sql.match(/^\s*select\s+/i);
  if (!select) return null;

  const start = select[0].length;
  let depth = 0;
  let inString = false;

  for (let i = start; i < sql.length; i += 1) {
    const ch = sql[i];
    if (ch === "'") inString = !inString;
    else if (!inString && ch === '(') depth += 1;
    else if (!inString && ch === ')') depth -= 1;
    else if (
      !inString &&
      depth === 0 &&
      /\s/.test(sql[i - 1] || '') &&
      sql.slice(i, i + 4).toLowerCase() === 'from' &&
      /\s/.test(sql[i + 4] || ' ')
    ) {
      return sql.slice(start, i);
    }
  }

  return null;
}

function outputAliases(sql: string): string[] {
  const list = topLevelSelectList(sql);
  if (!list) return [];
  return splitTopLevel(list)
    .map((raw) => raw.match(/\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i)?.[1])
    .filter((alias): alias is string => !!alias);
}

function orderAliases(sql: string): string[] {
  const match = /\border\s+by\b([\s\S]+?)(?:\blimit\b|;|$)/i.exec(sql);
  if (!match) return [];
  return match[1]
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

// A precise "Order by: ..." contract is appended below, generated from the actual
// expectedSql. So drop any prose ordering the phrasing added - a mid-sentence ", ordered
// by star_id" or a whole trailing "Order by tier." sentence - because either form reads
// as a duplicate once the canonical contract follows it.
function stripProseOrdering(task: string): string {
  const cleaned = task.replace(/\s*,?\s+(?:after\s+)?order(?:ed|ing)?\s+by\b[^.]*\.?/i, '').trim();
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function appendAnswerContract(task: string, expectedSql: string): string {
  const aliases = outputAliases(expectedSql);
  const order = orderAliases(expectedSql);
  const base = order.length > 0 ? stripProseOrdering(task) : task;
  const parts: string[] = [];
  // Only spell out the columns if the prose does not already name them all.
  const proseNamesAllColumns = aliases.length > 0 && aliases.every((a) => new RegExp(`\\b${a}\\b`).test(base));
  if (aliases.length > 0 && !proseNamesAllColumns) parts.push(`Return columns: ${aliases.join(', ')}.`);
  if (order.length > 0) parts.push(`Order by: ${order.join(', ')}.`);
  return parts.length > 0 ? `${base} ${parts.join(' ')}` : base;
}

export function assembleExercise(
  template: Template,
  binding: Binding,
  catalog: Catalog
): DraftExercise {
  const expectedSql = emitSql(template, binding, catalog).trim();
  const { starterSql, blankMap } = buildScaffold(expectedSql, binding, template);
  const id = `${template.skill}-${fnv1a(`${template.skill}::${canonicalBinding(binding)}::${expectedSql}`).toString(36)}`;
  return {
    id,
    skill: template.skill,
    database: template.database,
    task: appendAnswerContract(renderTask(template, binding), expectedSql),
    starterSql,
    blankMap,
    hint: renderHint(template, binding),
    expectedSql,
    orderMatters: template.gateHints.orderMatters,
    rowCeiling: template.gateHints.rowCeiling
  };
}
