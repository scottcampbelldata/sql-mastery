// Learn-from-mistakes coaching. Given a learner's wrong SQL plus the grader's diff
// (or the Postgres error when the SQL did not run), name the specific misconception and
// teach the fix, without leaking the expected answer. Returns null when no known
// signature matches, so the caller falls back to the generic hint. Detection is
// deliberately conservative (first match wins, highest-frequency beginner errors first)
// and grounded in the documented common foundational-SQL mistakes.

export interface DiagnoseInput {
  sql: string;
  taskText?: string;
  pgError?: { code?: string; message?: string } | null;
  diff?: {
    reason?: string;
    orderOnly?: boolean;
    yourRowCount?: number;
    expectedRowCount?: number;
  } | null;
}

export interface Coaching {
  label: string;
  text: string;
}

function pgErrorCoaching(err: { code?: string; message?: string }): Coaching | null {
  const code = err.code || '';
  const msg = (err.message || '').toLowerCase();
  if (code === '42803' || /must appear in the group by/.test(msg)) {
    return {
      label: 'Aggregate mixed with a plain column',
      text: 'You used an aggregate (COUNT, SUM, AVG, ...) alongside a plain column. Every non-aggregated column in your SELECT must appear in GROUP BY. Add the column to GROUP BY, or wrap it in an aggregate.'
    };
  }
  if (code === '42703' || /column .* does not exist/.test(msg)) {
    return {
      label: 'Unknown column',
      text: 'Postgres cannot find that column. Check the spelling and exact case against the Database tab. Remember: text values need single quotes (like \'G\'); column names do not.'
    };
  }
  if (code === '42P01' || /relation .* does not exist/.test(msg)) {
    return {
      label: 'Unknown table',
      text: 'Postgres cannot find that table. Check the table name against the Database tab.'
    };
  }
  if (code === '42601' || /syntax error/.test(msg)) {
    return {
      label: 'Syntax error',
      text: 'There is a syntax error near the marked spot. Check clause order (SELECT, FROM, WHERE, GROUP BY, HAVING, ORDER BY) and that commas separate your columns.'
    };
  }
  if (code === '42883' || /operator does not exist|function .* does not exist/.test(msg)) {
    return {
      label: 'Type or function mismatch',
      text: 'That function or comparison does not exist as written, usually a type mismatch (comparing text to a number, or a misspelled function). Check the function name and that the types line up.'
    };
  }
  return null;
}

export function diagnoseMistake(input: DiagnoseInput): Coaching | null {
  const sql = input.sql || '';
  const lower = sql.toLowerCase();
  const task = (input.taskText || '').toLowerCase();
  const diff = input.diff || {};

  // 1. The SQL did not run: explain the Postgres error in learner terms.
  if (input.pgError && (input.pgError.code || input.pgError.message)) {
    return pgErrorCoaching(input.pgError);
  }

  // 2. Definitive SQL-text signatures (true regardless of the diff).
  if (/(?:=|!=|<>|>=|<=|<|>)\s*null\b/i.test(sql)) {
    return {
      label: 'Comparing to NULL',
      text: 'Nothing equals NULL, not even NULL itself, so "= NULL" (or "!= NULL") matches no rows. Use IS NULL or IS NOT NULL to test for missing values.'
    };
  }
  if (/\blimit\b/.test(lower) && !/\border\s+by\b/.test(lower)) {
    return {
      label: 'LIMIT without ORDER BY',
      text: 'LIMIT with no ORDER BY returns an arbitrary handful of rows, because row order is undefined. Add ORDER BY (with a tiebreaker column) before LIMIT so "top N" actually means something.'
    };
  }

  // 3. Diff-driven signatures (the SQL ran but the result was wrong).
  if (diff.reason === 'columns' && /select\s+\*/i.test(sql)) {
    return {
      label: 'Returning every column',
      text: 'SELECT * returns all columns. The task asks for specific columns in a specific order. List exactly those columns after SELECT.'
    };
  }
  if (diff.orderOnly) {
    return {
      label: 'Right rows, wrong order',
      text: 'Your rows are correct but out of order. The task specifies a sort. Add or fix ORDER BY, and check the direction (ASC vs DESC).'
    };
  }
  if (
    diff.reason === 'rowCount' &&
    typeof diff.yourRowCount === 'number' &&
    typeof diff.expectedRowCount === 'number'
  ) {
    const tooMany = diff.yourRowCount > diff.expectedRowCount;
    const tooFew = diff.yourRowCount < diff.expectedRowCount;
    if (tooMany && /\b(top|first|highest|lowest|largest|smallest)\b/.test(task) && !/\blimit\b/.test(lower)) {
      return {
        label: 'Missing LIMIT',
        text: 'You returned more rows than asked for. The task wants the top N. After ORDER BY, add LIMIT n to keep only the first n rows.'
      };
    }
    if (tooMany && /\b(distinct|unique|different)\b/.test(task) && !/\bdistinct\b/.test(lower)) {
      return {
        label: 'Duplicate rows',
        text: 'Your output has duplicates. The task wants distinct values. Add DISTINCT right after SELECT.'
      };
    }
    if (tooMany && /\bjoin\b/.test(lower)) {
      return {
        label: 'Join fan-out',
        text: 'You got more rows than expected. A join multiplies rows when one row matches many on the other side (fan-out). Check the join key and whether the relationship is one-to-many; you may need to aggregate the many side or use COUNT(DISTINCT ...).'
      };
    }
    if (tooFew && /\bjoin\b/.test(lower) && !/\bleft\s+(outer\s+)?join\b/.test(lower)) {
      return {
        label: 'Inner join dropped rows',
        text: 'You got fewer rows than expected. An inner join keeps only rows that match on both sides. If rows should survive even when there is no match, use LEFT JOIN.'
      };
    }
  }

  return null;
}
