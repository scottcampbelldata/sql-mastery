import type { Template, Slot, Binding } from './types';
import type { Catalog } from './schema-catalog';

export type { Binding } from './types';
export type LiteralProbe = (sql: string) => Promise<unknown[][]>;

const LIMIT_CANDIDATES = ['3', '5', '10'];
const TARGET_WITH_LITERALS = 8;
const MAX_BINDINGS = 24;
const MAX_COMBOS = 5000;

function parseFromTable(sql: string): string {
  const match = sql.match(/\bfrom\s+([a-zA-Z_][a-zA-Z0-9_]*)/i);
  if (!match) throw new Error('bind: cannot locate FROM table');
  return match[1];
}

function primaryTableOf(template: Template): string {
  return template.primaryTable ?? parseFromTable(template.sqlShape);
}

function literalValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/'/g, "''");
}

function tableColumns(catalog: Catalog, table: string): string[] {
  const found = catalog.tables.find((catalogTable) => catalogTable.name === table);
  if (!found) throw new Error(`bind: table ${table} not in catalog`);
  return found.columns.map((column) => column.name);
}

function candidatesFor(slot: Slot, template: Template, catalog: Catalog): string[] {
  const table = slot.table ?? primaryTableOf(template);

  switch (slot.kind) {
    case 'table':
      return catalog.tables.map((catalogTable) => catalogTable.name);
    case 'limit':
      return LIMIT_CANDIDATES;
    case 'literal':
      return [];
    default:
      return tableColumns(catalog, table);
  }
}

async function drawCompoundLiterals(
  template: Template,
  compound: Slot[],
  probe: LiteralProbe,
  bindingIndex: number
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (compound.length === 0) return out;

  const table = compound[0].table ?? primaryTableOf(template);
  const cols = compound.map((slot) => {
    if (!slot.col) throw new Error(`bind: literal slot ${slot.name} missing col`);
    return slot.col;
  });
  const guards = cols.map((col) => `${col} IS NOT NULL`).join(' AND ');
  const sql = `SELECT DISTINCT ${cols.join(', ')} FROM ${table} WHERE ${guards} ORDER BY ${cols.join(', ')} LIMIT 500`;
  const rows = await probe(sql);

  if (rows.length === 0) return out;

  const row = rows[bindingIndex % rows.length];
  compound.forEach((slot, index) => {
    const value = literalValue(row[index]);
    if (value !== null) out[slot.name] = value;
  });
  return out;
}

async function drawSingleLiterals(
  template: Template,
  singles: Slot[],
  probe: LiteralProbe,
  bindingIndex: number
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};

  for (const slot of singles) {
    if (!slot.col) throw new Error(`bind: literal slot ${slot.name} missing col`);
    const table = slot.table ?? primaryTableOf(template);
    const sql = `SELECT DISTINCT ${slot.col} FROM ${table} WHERE ${slot.col} IS NOT NULL ORDER BY ${slot.col}`;
    const rows = await probe(sql);

    if (rows.length > 0) {
      const value = literalValue(rows[bindingIndex % rows.length][0]);
      if (value !== null) out[slot.name] = value;
    }
  }

  return out;
}

async function drawLiterals(
  template: Template,
  literalSlots: Slot[],
  probe: LiteralProbe,
  bindingIndex: number
): Promise<Record<string, string>> {
  const compound = literalSlots.filter((slot) => slot.sampleStrategy === 'compound-row');
  const singles = literalSlots.filter((slot) => slot.sampleStrategy !== 'compound-row');
  return {
    ...(await drawCompoundLiterals(template, compound, probe, bindingIndex)),
    ...(await drawSingleLiterals(template, singles, probe, bindingIndex))
  };
}

export async function bindTemplate(
  template: Template,
  catalog: Catalog,
  probe: LiteralProbe
): Promise<Binding[]> {
  const structural = template.slots.filter((slot) => slot.kind !== 'literal');
  const literalSlots = template.slots.filter((slot) => slot.kind === 'literal');

  let combos: Record<string, string>[] = [{}];
  for (const slot of structural) {
    const candidates = candidatesFor(slot, template, catalog);
    const next: Record<string, string>[] = [];

    for (const combo of combos) {
      for (const value of candidates) {
        next.push({ ...combo, [slot.name]: value });
        if (next.length >= MAX_COMBOS) break;
      }
      if (next.length >= MAX_COMBOS) break;
    }

    combos = next;
  }

  const accepted = combos.filter((combo) =>
    template.bindingRules.every((rule) => {
      const value = combo[rule.slot];
      return value === undefined ? true : rule.predicate(value, catalog);
    })
  );

  if (accepted.length === 0) return [];

  const hasLiterals = literalSlots.length > 0;
  const count = hasLiterals
    ? Math.min(MAX_BINDINGS, Math.max(accepted.length, TARGET_WITH_LITERALS))
    : Math.min(MAX_BINDINGS, accepted.length);

  const bindings: Binding[] = [];
  for (let bindingIndex = 0; bindingIndex < count; bindingIndex += 1) {
    const slots = accepted[bindingIndex % accepted.length];
    const literals = await drawLiterals(template, literalSlots, probe, bindingIndex);
    bindings.push({
      skill: template.skill,
      database: template.database,
      bindingIndex,
      slots: { ...slots },
      literals
    });
  }

  return bindings;
}
