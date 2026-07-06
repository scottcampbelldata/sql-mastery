// Canonical multi-line layout for the SQL we render: starter scaffolds, worked
// examples, and model answers. The old scaffolds were one long line that forced a
// horizontal scrollbar; this lays each top-level clause on its own line so the
// query reads top to bottom and fits the editor width.
//
// Safety contract: the formatter only ever reflows WHITESPACE. It replaces a single
// space (or tab) that sits before a top-level clause keyword with a newline, and it
// leaves every other token, identifiers, string literals, operators, numbers, and
// the ____ blanks, byte-for-byte intact. It never inserts whitespace where there was
// none and never removes a space that separates two tokens. The result: collapsing
// all whitespace in the output reproduces the input exactly, so the formatter can
// re-wrap any query but can never corrupt one. That invariant is what makes it safe
// to run on arbitrary answer SQL, including CTEs, window functions, and subqueries.

const INDENT = '  ';

// Top-level keywords that start their own line. GROUP and ORDER are matched on their
// first word; the BY that follows rides along on the same line.
const CLAUSE = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER',
  'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'RETURNING', 'WINDOW'
]);
// Words that precede JOIN so the whole "LEFT OUTER JOIN" phrase starts one line.
const JOIN_LEAD = new Set(['LEFT', 'RIGHT', 'FULL', 'INNER', 'CROSS', 'OUTER']);
// Statement prefixes that keep the following clause on the same first line.
const PREFIX = new Set(['EXPLAIN', 'ANALYZE', 'VERBOSE']);

type TokenKind = 'ws' | 'str' | 'name' | 'comment' | 'word' | 'num' | 'punct';
interface Token { t: TokenKind; v: string; }
interface SigToken { index: number; tok: Token; depth: number; up: string; }

const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
const isWordStart = (ch: string): boolean => /[A-Za-z_]/.test(ch);
const isWordPart = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';

// Split SQL into tokens without ever interpreting the inside of a string literal,
// quoted identifier, or comment. A run of 2+ underscores (the ____ blank) tokenizes
// as an ordinary word, so it survives untouched.
function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  const n = sql.length;
  let i = 0;
  while (i < n) {
    const ch = sql[i];
    if (isSpace(ch)) {
      let j = i + 1;
      while (j < n && isSpace(sql[j])) j += 1;
      tokens.push({ t: 'ws', v: sql.slice(i, j) });
      i = j;
    } else if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") { if (sql[j + 1] === "'") { j += 2; continue; } j += 1; break; }
        j += 1;
      }
      tokens.push({ t: 'str', v: sql.slice(i, j) });
      i = j;
    } else if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === '"') { if (sql[j + 1] === '"') { j += 2; continue; } j += 1; break; }
        j += 1;
      }
      tokens.push({ t: 'name', v: sql.slice(i, j) });
      i = j;
    } else if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n') j += 1;
      tokens.push({ t: 'comment', v: sql.slice(i, j) });
      i = j;
    } else if (ch === '/' && sql[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(sql[j] === '*' && sql[j + 1] === '/')) j += 1;
      j = Math.min(n, j + 2);
      tokens.push({ t: 'comment', v: sql.slice(i, j) });
      i = j;
    } else if (isWordStart(ch)) {
      let j = i + 1;
      while (j < n && isWordPart(sql[j])) j += 1;
      tokens.push({ t: 'word', v: sql.slice(i, j) });
      i = j;
    } else if (isDigit(ch)) {
      let j = i + 1;
      while (j < n && (isDigit(sql[j]) || sql[j] === '.')) j += 1;
      tokens.push({ t: 'num', v: sql.slice(i, j) });
      i = j;
    } else {
      tokens.push({ t: 'punct', v: ch });
      i += 1;
    }
  }
  return tokens;
}

// Format a single-line query. Callers should only pass single-line SQL here; the
// public formatSql() guards multi-line input.
function layoutSingleLine(sql: string): string {
  const tokens = tokenize(sql);

  // Index every non-whitespace token and track its paren depth. Only depth-0 tokens
  // can start a new line, which keeps subqueries and function arg lists inline.
  const sig: SigToken[] = [];
  let depth = 0;
  tokens.forEach((tok, index) => {
    if (tok.t === 'ws') return;
    sig.push({ index, tok, depth, up: tok.t === 'word' ? tok.v.toUpperCase() : '' });
    if (tok.t === 'punct') {
      if (tok.v === '(') depth += 1;
      else if (tok.v === ')') depth = Math.max(0, depth - 1);
    }
  });

  // break[tokenIndex] = the whitespace string that should replace the space before
  // that token (newline for a clause, newline + indent for a chained AND/OR).
  const breakBefore = new Map<number, string>();
  let clause = '';          // WHERE / HAVING / ON put us in a boolean-condition context
  let pendingBetween = false;

  for (let k = 0; k < sig.length; k += 1) {
    const cur = sig[k];
    const prev = sig[k - 1];
    const first = k === 0;
    if (cur.depth !== 0) continue;
    const up = cur.up;
    if (!up) continue;

    if (first) { clause = CLAUSE.has(up) ? up : ''; continue; }

    const prevIsPrefix = prev && prev.depth === 0 && PREFIX.has(prev.up);

    if (up === 'JOIN') {
      // Walk back over LEFT / OUTER / INNER etc. so the break lands before the phrase.
      let start = k;
      while (start - 1 >= 0 && sig[start - 1].depth === 0 && JOIN_LEAD.has(sig[start - 1].up)) start -= 1;
      if (!(start === 1 && prevIsPrefix)) breakBefore.set(sig[start].index, '\n');
      clause = 'JOIN';
      continue;
    }
    if (JOIN_LEAD.has(up)) continue; // handled when we reach the JOIN word

    if (up === 'ON') { clause = 'ON'; continue; }

    if (CLAUSE.has(up)) {
      if (!prevIsPrefix) breakBefore.set(cur.index, '\n');
      clause = (up === 'WHERE' || up === 'HAVING') ? up : '';
      pendingBetween = false;
      continue;
    }

    if (up === 'BETWEEN') { pendingBetween = true; continue; }

    if (up === 'AND' || up === 'OR') {
      if (up === 'AND' && pendingBetween) { pendingBetween = false; continue; }
      if (clause === 'WHERE' || clause === 'HAVING' || clause === 'ON') {
        breakBefore.set(cur.index, `\n${INDENT}`);
      }
    }
  }

  // Reassemble. Hold each whitespace token until the next real token: at a break we
  // swap that held space for the newline; otherwise we emit the original space. When
  // there is no preceding whitespace we never invent one, which keeps the invariant.
  let out = '';
  let pendingWs: string | null = null;
  for (let idx = 0; idx < tokens.length; idx += 1) {
    const tok = tokens[idx];
    if (tok.t === 'ws') { pendingWs = tok.v; continue; }
    const br = breakBefore.get(idx);
    if (br && pendingWs !== null) out += br;
    else if (pendingWs !== null) out += pendingWs;
    out += tok.v;
    pendingWs = null;
  }
  return out.trim();
}

// Public entry point. Multi-line input is already authored by hand, so it is returned
// byte-for-byte (only the outer ends are trimmed) to avoid disturbing whitespace that
// lives inside a string literal or comment. Single-line input gets the canonical layout.
export function formatSql(sql: string | null | undefined): string {
  const text = String(sql == null ? '' : sql);
  if (!text.trim()) return '';
  if (text.includes('\n')) return text.trim();
  return layoutSingleLine(text.trim());
}
