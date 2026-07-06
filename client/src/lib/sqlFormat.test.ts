import { describe, it, expect } from 'vitest';
import { formatSql } from './sqlFormat';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('formatSql', () => {
  it('puts each top-level clause on its own line', () => {
    expect(formatSql('SELECT * FROM genre;')).toBe('SELECT *\nFROM genre;');
  });

  it('lays out a multi-join query with each JOIN and its ON on one line', () => {
    const input = 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id JOIN artist ar ON al.artist_id = ar.artist_id ORDER BY t.track_id LIMIT 20;';
    expect(formatSql(input)).toBe(
      'SELECT t.name, al.title\n'
      + 'FROM track t\n'
      + 'JOIN album al ON t.album_id = al.album_id\n'
      + 'JOIN artist ar ON al.artist_id = ar.artist_id\n'
      + 'ORDER BY t.track_id\n'
      + 'LIMIT 20;'
    );
  });

  it('keeps the join type on the join line (LEFT JOIN)', () => {
    const input = 'SELECT ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id ORDER BY ar.artist_id;';
    expect(formatSql(input)).toBe(
      'SELECT ar.name\nFROM artist ar\nLEFT JOIN album al ON al.artist_id = ar.artist_id\nORDER BY ar.artist_id;'
    );
  });

  it('breaks chained AND / OR in WHERE onto indented continuation lines', () => {
    const input = 'SELECT track_id FROM track WHERE composer IS NULL AND genre_id = 1 ORDER BY track_id;';
    expect(formatSql(input)).toBe('SELECT track_id\nFROM track\nWHERE composer IS NULL\n  AND genre_id = 1\nORDER BY track_id;');
  });

  it('breaks AND in HAVING but keeps clauses like GROUP BY intact', () => {
    const input = 'SELECT g, COUNT(*) FROM t GROUP BY g HAVING COUNT(*) > 1 AND g IS NOT NULL ORDER BY g;';
    expect(formatSql(input)).toBe('SELECT g, COUNT(*)\nFROM t\nGROUP BY g\nHAVING COUNT(*) > 1\n  AND g IS NOT NULL\nORDER BY g;');
  });

  it('does not break the AND that belongs to BETWEEN', () => {
    const input = 'SELECT id FROM t WHERE x BETWEEN 1 AND 10 AND y = 2;';
    expect(formatSql(input)).toBe('SELECT id\nFROM t\nWHERE x BETWEEN 1 AND 10\n  AND y = 2;');
  });

  it('never treats keywords inside a string literal as clauses', () => {
    const input = "SELECT name FROM t WHERE label = 'from a to b and back' ORDER BY name;";
    expect(formatSql(input)).toBe("SELECT name\nFROM t\nWHERE label = 'from a to b and back'\nORDER BY name;");
  });

  it('leaves operators like :: casts untouched', () => {
    expect(formatSql('SELECT c.reltuples::bigint AS n FROM pg_class c;')).toBe('SELECT c.reltuples::bigint AS n\nFROM pg_class c;');
  });

  it('preserves ____ blanks verbatim', () => {
    const input = 'SELECT ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id WHERE al.album_id ____ ORDER BY ar.artist_id;';
    expect(formatSql(input)).toBe('SELECT ar.name\nFROM artist ar\nLEFT JOIN album al ON al.artist_id = ar.artist_id\nWHERE al.album_id ____\nORDER BY ar.artist_id;');
  });

  it('keeps a statement prefix (EXPLAIN) on the first line', () => {
    expect(formatSql('EXPLAIN SELECT n FROM t WHERE a = 1;')).toBe('EXPLAIN SELECT n\nFROM t\nWHERE a = 1;');
  });

  it('breaks set operations onto their own line', () => {
    expect(formatSql('SELECT a FROM t1 UNION ALL SELECT a FROM t2 ORDER BY a;')).toBe('SELECT a\nFROM t1\nUNION ALL\nSELECT a\nFROM t2\nORDER BY a;');
  });

  it('leaves already-multi-line SQL untouched (only outer trim)', () => {
    const authored = 'SELECT a\nFROM t\nWHERE b = 1;';
    expect(formatSql(authored)).toBe(authored);
    expect(formatSql('  SELECT a\nFROM t;  ')).toBe('SELECT a\nFROM t;');
    // Interior whitespace, including inside a string literal, is preserved verbatim.
    expect(formatSql("SELECT note\nFROM t\nWHERE x = 'keep  trailing';")).toBe("SELECT note\nFROM t\nWHERE x = 'keep  trailing';");
  });

  it('returns an empty string for empty or nullish input', () => {
    expect(formatSql('')).toBe('');
    expect(formatSql('   ')).toBe('');
    expect(formatSql(null)).toBe('');
    expect(formatSql(undefined)).toBe('');
  });

  it('is idempotent: formatting a formatted query changes nothing', () => {
    const inputs = [
      'SELECT * FROM genre;',
      'SELECT id FROM t WHERE x BETWEEN 1 AND 10 AND y = 2;',
      'SELECT t.name FROM track t JOIN album al ON t.album_id = al.album_id LIMIT 5;'
    ];
    for (const input of inputs) {
      const once = formatSql(input);
      expect(formatSql(once)).toBe(once);
    }
  });

  it('only reflows whitespace: collapsing the output reproduces the input', () => {
    const inputs = [
      'SELECT g.name AS genre, ROUND(SUM(il.unit_price * il.quantity), 2) AS revenue FROM invoice_line il JOIN track t ON il.track_id = t.track_id JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY revenue DESC, g.name LIMIT 10;',
      "SELECT c.relname AS table_name, c.reltuples::bigint AS estimated_rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY estimated_rows DESC, table_name;"
    ];
    for (const input of inputs) {
      expect(norm(formatSql(input))).toBe(norm(input));
    }
  });
});
