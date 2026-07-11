import type { StarterSql, BlankMap, Binding, Template, SlotKind } from './types';

const SQL_KEYWORDS = new Set([
  'SELECT', 'DISTINCT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'BETWEEN',
  'LIKE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'AS', 'ON',
  'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER', 'CROSS', 'UNION', 'ALL', 'EXCEPT',
  'INTERSECT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH', 'RECURSIVE', 'OVER',
  'PARTITION', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ROW_NUMBER', 'RANK',
  'DENSE_RANK', 'LAG', 'LEAD', 'NTILE', 'COALESCE', 'NULLIF', 'CAST', 'EXISTS', 'USING'
]);

const RANK: Record<SlotKind, number> = {
  table: 1,
  limit: 1,
  column: 2,
  projection: 2,
  groupCols: 2,
  sortKey: 2,
  partitionCols: 2,
  rankKey: 2,
  literal: 3
};

interface Tok {
  text: string;
  word: boolean;
}

function tokenize(sql: string): Tok[] {
  const toks: Tok[] = [];
  const isWord = (c: string): boolean => /[A-Za-z0-9_$.]/.test(c);
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      toks.push({ text: sql.slice(i, j), word: true });
      i = j;
    } else if (isWord(c)) {
      let j = i;
      while (j < n && isWord(sql[j])) j += 1;
      toks.push({ text: sql.slice(i, j), word: true });
      i = j;
    } else {
      toks.push({ text: c, word: false });
      i += 1;
    }
  }
  return toks;
}

function answerAtoms(binding: Binding, template: Template): Set<string> {
  const atoms = new Set<string>();
  for (const slot of template.slots) {
    const value = binding.slots[slot.name] ?? binding.literals[slot.name];
    if (value === undefined || value === '') continue;
    void RANK[slot.kind];
    for (const t of tokenize(value)) {
      if (t.word) atoms.add(t.text);
    }
  }
  return atoms;
}

function topLevelClauseBodies(sql: string): Array<{ keyword: string; innerStart: number; innerEnd: number }> {
  const clauseRe = /\b(SELECT|FROM|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|LIMIT)\b/gi;
  const depth = new Array<number>(sql.length + 1).fill(0);
  let d = 0;
  let inStr = false;
  for (let i = 0; i < sql.length; i += 1) {
    depth[i] = d;
    const c = sql[i];
    if (inStr) {
      if (c === "'") {
        if (sql[i + 1] === "'") {
          i += 1;
          if (i < sql.length) depth[i] = d;
        } else {
          inStr = false;
        }
      }
    } else if (c === "'") {
      inStr = true;
    } else if (c === '(') {
      d += 1;
    } else if (c === ')') {
      d = Math.max(0, d - 1);
    }
  }

  const anchors: Array<{ keyword: string; kwStart: number; kwEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = clauseRe.exec(sql)) !== null) {
    if (depth[m.index] === 0) anchors.push({ keyword: m[0].replace(/\s+/g, ' ').toLowerCase(), kwStart: m.index, kwEnd: m.index + m[0].length });
  }

  const spans: Array<{ keyword: string; innerStart: number; innerEnd: number }> = [];
  for (let k = 0; k < anchors.length; k += 1) {
    const bodyStart = anchors[k].kwEnd;
    const bodyEnd = k + 1 < anchors.length ? anchors[k + 1].kwStart : sql.length;
    let s = bodyStart;
    let e = bodyEnd;
    while (s < e && /\s/.test(sql[s])) s += 1;
    while (e > s && (/\s/.test(sql[e - 1]) || sql[e - 1] === ';')) e -= 1;
    if (e > s) spans.push({ keyword: anchors[k].keyword, innerStart: s, innerEnd: e });
  }
  return spans;
}

function buildFullTier(sql: string, atoms: Set<string>): { text: string; map: Record<string, string> } {
  const toks = tokenize(sql);
  const map: Record<string, string> = {};
  let out = '';
  let counter = 0;
  let prevWord = '';
  for (const t of toks) {
    if (t.word) {
      const isKw = SQL_KEYWORDS.has(t.text.toUpperCase());
      const afterAs = prevWord.toUpperCase() === 'AS';
      if (!isKw && !afterAs && atoms.has(t.text)) {
        const token = `__BLANK_${counter}__`;
        counter += 1;
        map[token] = t.text;
        out += token;
      } else {
        out += t.text;
      }
      prevWord = t.text;
    } else {
      out += t.text;
    }
  }
  return { text: out, map };
}

function buildClauseTier(sql: string, which: 'half' | 'blank'): { text: string; map: Record<string, string> } {
  const spans = topLevelClauseBodies(sql);
  const chosen = which === 'blank' ? spans : spans.slice(Math.ceil(spans.length / 2));
  const map: Record<string, string> = {};
  let out = '';
  let cursor = 0;
  let counter = 0;
  for (const sp of chosen) {
    out += sql.slice(cursor, sp.innerStart);
    const token = `__BLANK_${counter}__`;
    counter += 1;
    map[token] = sql.slice(sp.innerStart, sp.innerEnd);
    out += token;
    cursor = sp.innerEnd;
  }
  out += sql.slice(cursor);
  return { text: out, map };
}

type FocusTarget = 'projection' | 'from' | 'where' | 'having';
const FOCUS_CLAUSE: Record<FocusTarget, string> = { projection: 'select', from: 'from', where: 'where', having: 'having' };

// Which clause each concept's query actually teaches. Every deterministic query carries an
// ORDER BY for grading, and the default full-tier scaffold blanks only the answer's plain
// column/literal atoms - so for any concept whose signature lives in a structural clause (a
// JOIN, a subquery, a window/CASE/cast expression, an EXISTS/IN filter) the first exercise a
// learner sees would hand them the concept and blank only the sort. Mapping the concept to its
// carrying clause makes the full/half scaffolds blank that clause instead. The clause chosen is
// where the lesson's named idea lives: the JOIN (from), the filter that defines it (where), or
// the projected expression (projection). Concepts not listed (plain SELECT/WHERE/GROUP BY
// beginner lessons, ORDER BY, top-N, recursive CTE) keep the default slot/clause scaffolding.
const FOCUS_BY_SKILL: Record<string, FocusTarget> = {
  // Aperture (beginner)
  'ap-join-intro': 'from',
  'ap-having': 'having',
  // Sideline (intermediate)
  'sl-join-inner': 'from',
  'sl-join-left': 'from',
  'sl-join-right-full': 'from',
  'sl-join-multi': 'from',
  'sl-join-aggregate': 'from',
  'sl-self-join-compare': 'from',
  'sl-self-join-match': 'from',
  'sl-cte': 'from',
  'sl-set-ops': 'from',
  'sl-anti-join': 'where',
  'sl-semi-join': 'where',
  'sl-subquery-in': 'where',
  'sl-subquery-scalar': 'where',
  'sl-subquery-correlated': 'where',
  'sl-scd-asof': 'where',
  'sl-case-expression': 'projection',
  'sl-date-functions': 'projection',
  'sl-window-rank': 'projection',
  'sl-window-lag-lead': 'projection',
  'sl-window-frame-basic': 'projection',
  'sl-window-running': 'projection',
  // Rove (advanced)
  'rv-orphan-anti-join': 'where',
  'rv-soft-delete-valid': 'where',
  'rv-rating-outlier-clean': 'where',
  'rv-dedup-rownumber': 'where',
  'rv-payment-dedup': 'where',
  'rv-topn-per-group': 'where',
  'rv-case-canonicalize': 'projection',
  'rv-money-text-cast': 'projection',
  'rv-null-coalesce-nullif': 'projection',
  'rv-regex-clean-contacts': 'projection',
  'rv-profile-dirty-data': 'projection',
  'rv-rank-leaderboard': 'projection',
  'rv-ntile-bucketing': 'projection',
  'rv-lag-lead-deltas': 'projection',
  'rv-running-total': 'projection',
  'rv-moving-average-frame': 'projection',
  'rv-timezone-city-join': 'projection',
  'rv-retention-cohort': 'projection',
  'rv-funnel-conversion': 'projection',
  'rv-lifecycle-latency': 'projection',
  'rv-text-normalize': 'projection',
  'rv-clean-layer-capstone': 'projection',
  'rv-sessionization': 'projection'
};

function blankSpans(sql: string, spans: Array<{ innerStart: number; innerEnd: number }>): { text: string; map: Record<string, string> } {
  const chosen = [...spans].sort((a, b) => a.innerStart - b.innerStart);
  const map: Record<string, string> = {};
  let out = '';
  let cursor = 0;
  let counter = 0;
  for (const sp of chosen) {
    out += sql.slice(cursor, sp.innerStart);
    const token = `__BLANK_${counter}__`;
    counter += 1;
    map[token] = sql.slice(sp.innerStart, sp.innerEnd);
    out += token;
    cursor = sp.innerEnd;
  }
  out += sql.slice(cursor);
  return { text: out, map };
}

// Split a SELECT body into its top-level, comma-separated item spans (respecting parens and
// strings), so a plain column list can get one blank per column.
function selectItemSpans(sql: string, body: { innerStart: number; innerEnd: number }): Array<{ innerStart: number; innerEnd: number }> {
  const text = sql.slice(body.innerStart, body.innerEnd);
  const spans: Array<{ innerStart: number; innerEnd: number }> = [];
  let depth = 0;
  let inStr = false;
  let start = 0;
  const push = (from: number, to: number) => {
    let s = from;
    let e = to;
    while (s < e && /\s/.test(text[s])) s += 1;
    while (e > s && /\s/.test(text[e - 1])) e -= 1;
    if (e > s) spans.push({ innerStart: body.innerStart + s, innerEnd: body.innerStart + e });
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "'") inStr = !inStr;
    else if (!inStr && ch === '(') depth += 1;
    else if (!inStr && ch === ')') depth -= 1;
    else if (!inStr && depth === 0 && ch === ',') { push(start, i); start = i + 1; }
  }
  push(start, text.length);
  return spans;
}

// A bare (optionally table-qualified, optionally aliased) column reference - as opposed to a
// function call, window expression, or CASE. A plain list of these is what a beginner should
// fill one blank at a time.
function isSimpleColumn(item: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_.]*(\s+as\s+[a-zA-Z_][a-zA-Z0-9_]*)?$/i.test(item.trim());
}

// The clause region(s) to blank for a projection focus in the full (most-help) tier:
//   - a plain column list blanks per column (SELECT ____, ____, ____) so a beginner fills each;
//   - a mixed list (plain columns plus a concept expression - a window, CASE, cast, aggregate,
//     regex) blanks only the concept expression(s), leaving the plain columns given, so the
//     learner writes the thing the lesson is about, not the incidental columns;
//   - anything else (all expressions, or a single item) blanks the whole clause as one.
function focusSpansFor(sql: string, focus: FocusTarget, focusSpan: { innerStart: number; innerEnd: number }, which: 'full' | 'half'): Array<{ innerStart: number; innerEnd: number }> {
  if (focus === 'projection' && which === 'full') {
    const items = selectItemSpans(sql, focusSpan);
    if (items.length > 1) {
      const simple = (sp: { innerStart: number; innerEnd: number }) => isSimpleColumn(sql.slice(sp.innerStart, sp.innerEnd));
      if (items.every(simple)) return items;
      const concept = items.filter((sp) => !simple(sp));
      if (concept.length > 0 && concept.length < items.length) return concept;
    }
  }
  return [focusSpan];
}

// Blank the concept-carrying clause. 'full' blanks just that clause (most help); 'half' also
// blanks the later-half clauses so it stays harder than full, but the concept is always
// blanked. Returns null if the clause is not present (caller falls back to defaults).
function buildFocusTier(sql: string, focus: FocusTarget, which: 'full' | 'half'): { text: string; map: Record<string, string> } | null {
  const all = topLevelClauseBodies(sql);
  const focusSpan = all.find((span) => span.keyword === FOCUS_CLAUSE[focus]);
  if (!focusSpan) return null;
  const focusSpans = focusSpansFor(sql, focus, focusSpan, which);
  if (which === 'full') return blankSpans(sql, focusSpans);
  const later = all.slice(Math.ceil(all.length / 2));
  const byStart = new Map<number, { innerStart: number; innerEnd: number }>();
  for (const span of [...focusSpans, ...later]) byStart.set(span.innerStart, span);
  return blankSpans(sql, [...byStart.values()]);
}

export function buildScaffold(
  expectedSql: string,
  binding: Binding,
  template: Template
): { starterSql: StarterSql; blankMap: BlankMap } {
  const atoms = answerAtoms(binding, template);
  const focus = template.scaffoldFocus ?? FOCUS_BY_SKILL[template.skill];
  const full = (focus && buildFocusTier(expectedSql, focus, 'full')) || buildFullTier(expectedSql, atoms);
  const half = (focus && buildFocusTier(expectedSql, focus, 'half')) || buildClauseTier(expectedSql, 'half');
  const blank = buildClauseTier(expectedSql, 'blank');
  return {
    starterSql: { full: full.text, half: half.text, blank: blank.text },
    blankMap: { full: full.map, half: half.map, blank: blank.map }
  };
}
