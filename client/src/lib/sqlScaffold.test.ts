import { describe, it, expect } from 'vitest';
import { hasSqlBlank, scaffoldSql, starterSqlForExercise } from './sqlScaffold';

describe('SQL scaffolding', () => {
  it('keeps an explicit lesson scaffold when one is provided, laid out multi-line', () => {
    expect(starterSqlForExercise({
      starterSql: 'SELECT ____ FROM genre;',
      expectedSql: 'SELECT * FROM genre;'
    })).toBe('SELECT ____\nFROM genre;');
  });

  it('creates editable blanks for a simple SELECT when starter SQL is missing', () => {
    expect(starterSqlForExercise({
      starterSql: '',
      expectedSql: 'SELECT * FROM media_type;'
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
    expect(hasSqlBlank('SELECT ____ FROM genre;')).toBe(true);
    expect(hasSqlBlank('SELECT * FROM genre;')).toBe(false);
  });
});
