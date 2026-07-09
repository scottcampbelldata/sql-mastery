import { pk } from './schema-catalog';
import type { Template, Binding } from './types';
import type { Catalog } from './schema-catalog';

function substitute(shape: string, binding: Binding): string {
  return shape.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (Object.prototype.hasOwnProperty.call(binding.slots, name)) return binding.slots[name];
    if (Object.prototype.hasOwnProperty.call(binding.literals, name)) return binding.literals[name];
    throw new Error(`emit: no binding for slot {${name}} (skill ${binding.skill})`);
  });
}

function parseFromTable(sql: string): string {
  const match = sql.match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!match) throw new Error('emit: cannot locate FROM table');
  return match[1];
}

function splitSelect(sql: string): { pre: string; list: string; post: string } {
  const select = sql.match(/^\s*select\s+/i);
  if (!select) throw new Error('emit: expected leading SELECT');

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
      return { pre: sql.slice(0, start), list: sql.slice(start, i), post: sql.slice(i) };
    }
  }

  throw new Error('emit: no top-level FROM');
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

function roundWrap(expr: string): string {
  if (!/\bavg\s*\(/i.test(expr)) return expr;
  if (/^\s*round\s*\(/i.test(expr)) return expr;
  return `ROUND(${expr}, 2)`;
}

function deriveAlias(expr: string): string {
  const qualified = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (qualified) return qualified[2];
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(expr)) return expr;

  const fn = expr.match(/^([a-zA-Z_]+)\s*\(\s*(\*|[a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (fn) {
    const name = fn[1].toLowerCase();
    if (fn[2] === '*') return name;
    const parts = fn[2].split('.');
    return `${name}_${parts[parts.length - 1]}`;
  }

  return 'expr';
}

function splitDistinct(list: string): { prefix: string; body: string } {
  const match = list.match(/^\s*distinct\s+/i);
  if (!match) return { prefix: '', body: list };
  return { prefix: 'DISTINCT ', body: list.slice(match[0].length) };
}

function aliasProjections(sql: string): string {
  const { pre, list, post } = splitSelect(sql);
  const { prefix, body } = splitDistinct(list);
  if (body.trim() === '*') return sql;

  const used = new Set<string>();
  const out = splitTopLevel(body).map((raw) => {
    const asMatch = raw.match(/\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i);
    const original = asMatch ? raw.slice(0, asMatch.index).trim() : raw.trim();
    const base = asMatch ? asMatch[1] : deriveAlias(original);
    let alias = base;
    let n = 2;

    while (used.has(alias)) {
      alias = `${base}_${n}`;
      n += 1;
    }

    used.add(alias);
    return `${roundWrap(original)} AS ${alias}`;
  });

  return `${pre}${prefix}${out.join(', ')} ${post}`;
}

function projectionAliases(sql: string): string[] {
  const { list } = splitSelect(sql);
  const { body } = splitDistinct(list);
  if (body.trim() === '*') return [];
  return splitTopLevel(body)
    .map((raw) => raw.match(/\s+as\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/i)?.[1])
    .filter((alias): alias is string => !!alias);
}

function csv(value: string): string[] {
  return value.split(',').map((part) => part.trim()).filter((part) => part !== '');
}

function appendPrimaryKey(keys: string[], catalog: Catalog, primaryTable: string): string[] {
  const out = keys.slice();
  for (const key of pk(catalog, primaryTable)) {
    if (!out.some((existing) => existing.split('.').pop() === key)) out.push(key);
  }
  return out;
}

function requiredSlotKeys(template: Template, binding: Binding, slotName: string): string[] {
  const value = binding.slots[slotName];
  if (value === undefined) throw new Error(`emit: family ${template.family} requires a '${slotName}' slot (${template.skill})`);
  return csv(value);
}

function tiebreakKeys(
  template: Template,
  binding: Binding,
  catalog: Catalog,
  primaryTable: string,
  aliases: string[],
  isDistinct: boolean
): string[] {
  switch (template.family) {
    case 'single-table':
      return isDistinct
        ? requiredSlotKeys(template, binding, 'sortKey')
        : appendPrimaryKey(requiredSlotKeys(template, binding, 'sortKey'), catalog, primaryTable);
    case 'join':
      return appendPrimaryKey(requiredSlotKeys(template, binding, 'sortKey'), catalog, primaryTable);
    case 'grouped': {
      return requiredSlotKeys(template, binding, 'groupCols');
    }
    case 'aggregate-scalar': {
      if (aliases.length === 0) {
        throw new Error(`emit: family aggregate-scalar needs at least one projected alias (${template.skill})`);
      }
      return [aliases[0]];
    }
    case 'windowed': {
      const partitionCols = binding.slots['partitionCols'];
      const rankKey = binding.slots['rankKey'];
      if (partitionCols === undefined || rankKey === undefined) {
        throw new Error(`emit: family windowed requires 'partitionCols' and 'rankKey' slots (${template.skill})`);
      }
      return [...csv(partitionCols), ...csv(rankKey)];
    }
    default: {
      const cols = pk(catalog, primaryTable);
      if (cols.length === 0) {
        throw new Error(`emit: family ${template.family} needs a primary key on ${primaryTable} (${template.skill})`);
      }
      return cols.map((col) => `${primaryTable}.${col}`);
    }
  }
}

function appendOrderBy(sql: string, keys: string[]): string {
  const trimmed = sql.trim();
  const limit = trimmed.match(/\s+limit\s+[\s\S]+$/i);
  if (limit && limit.index !== undefined) {
    return `${trimmed.slice(0, limit.index)} ORDER BY ${keys.join(', ')}${trimmed.slice(limit.index)}`;
  }
  return `${trimmed} ORDER BY ${keys.join(', ')}`;
}

export function emitSql(template: Template, binding: Binding, catalog: Catalog): string {
  const filled = substitute(template.sqlShape, binding);
  const primaryTable = template.primaryTable ?? parseFromTable(filled);
  const aliased = aliasProjections(filled);
  const keys = tiebreakKeys(
    template,
    binding,
    catalog,
    primaryTable,
    projectionAliases(aliased),
    /^\s*select\s+distinct\b/i.test(filled)
  );
  return appendOrderBy(aliased, keys);
}
