import { describe, it, expect } from 'vitest';
import { hasSqlBlank, scaffoldSql, starterSqlForExercise, revealHalfScaffold, pickStarter } from './sqlScaffold';

describe('SQL scaffolding', () => {
  it('keeps an explicit lesson scaffold when one is provided, laid out multi-line', () => {
    expect(starterSqlForExercise({
      starterSql: 'SELECT ____ FROM planets;',
      expectedSql: 'SELECT * FROM planets;'
    })).toBe('SELECT ____\nFROM planets;');
  });

  it('creates editable blanks for a simple SELECT when starter SQL is missing', () => {
    expect(starterSqlForExercise({
      starterSql: '',
      expectedSql: 'SELECT * FROM stars;'
    })).toBe('SELECT ____\nFROM ____;');
  });

  it('keeps SQL clause structure while blanking the answer parts', () => {
    expect(scaffoldSql('SELECT name, milliseconds FROM track WHERE unit_price > 0.99 ORDER BY milliseconds DESC LIMIT 10;'))
      .toBe('SELECT ____\nFROM ____\nWHERE ____\nORDER BY ____\nLIMIT ____;');
  });

  it('scaffolds joins without revealing table names or ON conditions', () => {
    expect(scaffoldSql('SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 20;'))
      .toBe('SELECT ____\nFROM ____\nJOIN ____ ON ____\nORDER BY ____\nLIMIT ____;');
  });

  it('detects fill-in-the-blank markers inside SQL', () => {
    expect(hasSqlBlank('SELECT ____ FROM planets;')).toBe(true);
    expect(hasSqlBlank('SELECT __BLANK_0__ FROM planets;')).toBe(true);
    expect(hasSqlBlank('SELECT * FROM planets;')).toBe(false);
  });

  it('picks a generated starter tier and normalizes generated blank tokens for the editor', () => {
    const starterSql = {
      full: 'SELECT name FROM planets ORDER BY __BLANK_0__;',
      half: 'SELECT name FROM __BLANK_0__ ORDER BY __BLANK_1__;',
      blank: 'SELECT __BLANK_0__ FROM __BLANK_1__;'
    };

    expect(pickStarter(starterSql, 'blank')).toBe('SELECT ____\nFROM ____;');
    expect(starterSqlForExercise({ starterSql, expectedSql: 'SELECT name FROM planets ORDER BY name;' }, 'half'))
      .toBe('SELECT name\nFROM ____\nORDER BY ____;');
  });

  it('falls back to the full generated starter when a requested tier is empty', () => {
    expect(starterSqlForExercise({
      starterSql: { full: 'SELECT * FROM planets;', half: 'SELECT ____ FROM planets;', blank: '' },
      expectedSql: 'SELECT * FROM planets;'
    }, 'blank')).toBe('');

    expect(starterSqlForExercise({
      starterSql: { full: 'SELECT ____ FROM planets;', half: '', blank: '' },
      expectedSql: 'SELECT * FROM planets;'
    }, 'blank')).toBe('');
  });

  describe('revealHalfScaffold (middle tier)', () => {
    it('reveals about half the blanks with their expected values and keeps the rest blank', () => {
      const out = revealHalfScaffold(
        'SELECT ____, ____\nFROM ____\nORDER BY ____ DESC\nLIMIT ____;',
        'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 10;'
      );
      // Even-indexed blanks (0,2,4) revealed: name, track, 10; blanks 1 and 3 stay ____.
      expect(out).toBe('SELECT name, ____\nFROM track\nORDER BY ____ DESC\nLIMIT 10;');
      expect((out.match(/_{2,}/g) || []).length).toBe(2);
    });

    it('always keeps at least one blank for a two-blank starter', () => {
      const out = revealHalfScaffold('SELECT ____\nFROM ____;', 'SELECT * FROM planets;');
      expect(out).toBe('SELECT *\nFROM ____;');
    });

    it('falls back to the full starter when the skeleton does not align to the expected', () => {
      const starter = 'SELECT ____\nFROM nowhere;';
      expect(revealHalfScaffold(starter, 'SELECT planet_name FROM planets;')).toBe('SELECT ____\nFROM nowhere;');
    });
  });
});
