// Authored beginner content for the Foundations track. Hand-written data (not
// parsed HTML). Every exercise is graded by /api/check against expectedSql on
// the chinook database. expectedSql is deterministic (single-row, or ORDER BY a
// unique key) so the result-set grader never rejects a correct answer on row order.

const DB = 'chinook';

function ex(id, skill, task, expectedSql, opts = {}) {
  return {
    id,
    skill,
    database: DB,
    task,
    starterSql: opts.starterSql || '',
    hint: opts.hint || '',
    expectedSql: expectedSql.trim()
  };
}

const CONCEPTS = [
  {
    id: 'c1-select-all', order: 1, skill: 'select-all',
    title: 'Ask a table for everything',
    teach: {
      plain: 'A database table is like a spreadsheet: columns across the top, one row per record. A query is a question you ask a table. SELECT * FROM genre means "show every column (the * ) for every row in the genre table."',
      mentalModel: 'SELECT = "show me", * = "all columns", FROM genre = "from this table".',
      example: { sql: 'SELECT * FROM genre;', note: 'Returns all 25 genres with both columns (genre_id and name).' }
    },
    exercises: [
      ex('c1-r1', 'select-all', 'Show everything — every column and every row — from the genre table.', 'SELECT * FROM genre;', { starterSql: 'SELECT ____ FROM genre;', hint: 'The star * means "all columns".' }),
      ex('c1-r2', 'select-all', 'Show everything in the media_type table.', 'SELECT * FROM media_type;', { hint: 'Same shape as the example, different table name.' }),
      ex('c1-r3', 'select-all', 'Show everything in the playlist table.', 'SELECT * FROM playlist;', { hint: 'SELECT * FROM <table>;' })
    ]
  },
  {
    id: 'c2-select-columns', order: 2, skill: 'select-columns',
    title: 'Pick the columns you want',
    teach: {
      plain: 'You usually do not want every column. Instead of *, list the columns you want after SELECT, separated by commas. SELECT name FROM track shows only the track names.',
      mentalModel: 'Replace * with a comma-separated list of column names.',
      example: { sql: 'SELECT name, composer FROM track;', note: 'Shows just two columns: the track name and its composer.' }
    },
    exercises: [
      ex('c2-r1', 'select-columns', 'Show only the name column from the genre table.', 'SELECT name FROM genre;', { starterSql: 'SELECT ____ FROM genre;', hint: 'Put the column name where the * used to be.' }),
      ex('c2-r2', 'select-columns', 'Show only the name column from the media_type table.', 'SELECT name FROM media_type;', { hint: 'One column: name.' }),
      ex('c2-r3', 'select-columns', 'Show the genre_id and name columns (in that order) from the genre table.', 'SELECT genre_id, name FROM genre;', { hint: 'Two columns separated by a comma.' })
    ]
  },
  {
    id: 'c3-order-limit', order: 3, skill: 'order-limit',
    title: 'Sort and take the top rows',
    teach: {
      plain: 'ORDER BY sorts the rows by a column. Add DESC after the column for high-to-low (default is low-to-high). LIMIT keeps only the first N rows, which is how you answer "top" or "longest" questions.',
      mentalModel: 'ORDER BY <column> [DESC] sorts; LIMIT <n> keeps the first n rows.',
      example: { sql: 'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 5;', note: 'The 5 longest tracks, longest first.' }
    },
    exercises: [
      ex('c3-r1', 'order-limit', 'Show the 10 longest tracks — their name and milliseconds — longest first.', 'SELECT name, milliseconds FROM track ORDER BY milliseconds DESC LIMIT 10;', { starterSql: 'SELECT name, milliseconds FROM track ORDER BY ____ DESC LIMIT 10;', hint: 'Longest first means sort by milliseconds DESC, then LIMIT 10.' }),
      ex('c3-r2', 'order-limit', 'Show the genre_id and name of every genre, sorted alphabetically by name.', 'SELECT genre_id, name FROM genre ORDER BY name;', { hint: 'ORDER BY name (no DESC = A to Z).' }),
      ex('c3-r3', 'order-limit', 'Show the genre_id and name of every genre, from highest genre_id to lowest.', 'SELECT genre_id, name FROM genre ORDER BY genre_id DESC;', { hint: 'Highest first means DESC.' })
    ]
  },
  {
    id: 'c4-distinct', order: 4, skill: 'distinct',
    title: 'Remove duplicate values',
    teach: {
      plain: 'DISTINCT removes duplicate rows from the result, so you see each value only once. SELECT DISTINCT unit_price FROM track lists each price that appears, without repeats.',
      mentalModel: 'SELECT DISTINCT <columns> = the unique combinations of those columns.',
      example: { sql: 'SELECT DISTINCT unit_price FROM track ORDER BY unit_price;', note: 'Only two prices exist in the whole track table: 0.99 and 1.99.' }
    },
    exercises: [
      ex('c4-r1', 'distinct', 'Show each unit price that appears in the track table, with no duplicates, lowest first.', 'SELECT DISTINCT unit_price FROM track ORDER BY unit_price;', { starterSql: 'SELECT DISTINCT ____ FROM track ORDER BY unit_price;', hint: 'DISTINCT goes right after SELECT.' }),
      ex('c4-r2', 'distinct', 'Show each distinct genre_id used by tracks, lowest first.', 'SELECT DISTINCT genre_id FROM track ORDER BY genre_id;', { hint: 'SELECT DISTINCT genre_id ...' }),
      ex('c4-r3', 'distinct', 'Show each distinct media_type_id used by tracks, lowest first.', 'SELECT DISTINCT media_type_id FROM track ORDER BY media_type_id;', { hint: 'SELECT DISTINCT media_type_id ...' })
    ]
  },
  {
    id: 'c5-where', order: 5, skill: 'where',
    title: 'Keep only the rows you want',
    teach: {
      plain: 'WHERE filters rows to only those that match a condition. Use comparisons like > < = , combine them with AND / OR, and use IN (a, b, c) to match any of several values. The WHERE clause goes after FROM and before ORDER BY.',
      mentalModel: 'FROM picks the table, WHERE throws away rows that fail the test, ORDER BY sorts what is left.',
      example: { sql: 'SELECT track_id, name FROM track WHERE unit_price > 0.99 ORDER BY track_id;', note: 'Only the more expensive (1.99) tracks survive the filter.' }
    },
    exercises: [
      ex('c5-r1', 'where', 'Show the track_id and name of tracks that cost more than 0.99, lowest track_id first.', 'SELECT track_id, name FROM track WHERE unit_price > 0.99 ORDER BY track_id;', { starterSql: 'SELECT track_id, name FROM track WHERE unit_price ____ 0.99 ORDER BY track_id;', hint: '"more than" is the > operator.' }),
      ex('c5-r2', 'where', 'Show the name and unit_price of tracks that cost exactly 1.99, ordered by track_id.', 'SELECT name, unit_price FROM track WHERE unit_price = 1.99 ORDER BY track_id;', { hint: 'Exactly means = . You can ORDER BY a column you did not select.' }),
      ex('c5-r3', 'where', 'Show the track_id and name of tracks in genre 1 (Rock), lowest track_id first.', 'SELECT track_id, name FROM track WHERE genre_id = 1 ORDER BY track_id;', { hint: 'WHERE genre_id = 1.' }),
      ex('c5-r4', 'where', 'Show the track_id and name of tracks whose genre_id is 1, 2, or 3, lowest track_id first.', 'SELECT track_id, name FROM track WHERE genre_id IN (1, 2, 3) ORDER BY track_id;', { hint: 'WHERE genre_id IN (1, 2, 3).' })
    ]
  },
  {
    id: 'c6-null', order: 6, skill: 'null',
    title: 'Handle missing values (NULL)',
    teach: {
      plain: 'NULL means "no value" — the data is missing. You cannot test it with = ; you must use IS NULL or IS NOT NULL. In the track table, many rows have no composer listed, so composer is NULL for them.',
      mentalModel: 'NULL is "unknown". Use IS NULL / IS NOT NULL, never = NULL.',
      example: { sql: 'SELECT track_id, name FROM track WHERE composer IS NULL ORDER BY track_id;', note: '977 tracks have no composer recorded.' }
    },
    exercises: [
      ex('c6-r1', 'null', 'Show the track_id and name of tracks that have no composer listed, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NULL ORDER BY track_id;', { starterSql: 'SELECT track_id, name FROM track WHERE composer ____ ORDER BY track_id;', hint: '"no composer" means composer IS NULL.' }),
      ex('c6-r2', 'null', 'Show the track_id and name of tracks that DO have a composer, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NOT NULL ORDER BY track_id;', { hint: 'IS NOT NULL.' }),
      ex('c6-r3', 'null', 'Show the track_id and name of Rock tracks (genre_id 1) that have no composer, lowest track_id first.', 'SELECT track_id, name FROM track WHERE composer IS NULL AND genre_id = 1 ORDER BY track_id;', { hint: 'Combine two conditions with AND.' })
    ]
  },
  {
    id: 'c7-aggregate', order: 7, skill: 'aggregate',
    title: 'Summarize with COUNT, SUM, AVG',
    teach: {
      plain: 'Aggregate functions collapse many rows into one summary number. COUNT(*) counts rows, SUM adds a column up, AVG averages it, MIN and MAX find extremes. Wrap the column in the function: AVG(milliseconds).',
      mentalModel: 'One aggregate over the whole table returns exactly one row.',
      example: { sql: 'SELECT COUNT(*), ROUND(AVG(milliseconds)) FROM track;', note: 'How many tracks there are, and their average length rounded to a whole number.' }
    },
    exercises: [
      ex('c7-r1', 'aggregate', 'Count how many rows are in the track table.', 'SELECT COUNT(*) FROM track;', { starterSql: 'SELECT ____ FROM track;', hint: 'COUNT(*) counts every row.' }),
      ex('c7-r2', 'aggregate', 'Show the average track length in milliseconds, rounded to a whole number.', 'SELECT ROUND(AVG(milliseconds)) FROM track;', { hint: 'ROUND(AVG(milliseconds)). Do not add an alias.' }),
      ex('c7-r3', 'aggregate', 'Show the lowest and highest unit_price in the track table (min first, then max).', 'SELECT MIN(unit_price), MAX(unit_price) FROM track;', { hint: 'Two functions: MIN(unit_price), MAX(unit_price).' }),
      ex('c7-r4', 'aggregate', 'Show the total of all milliseconds across every track.', 'SELECT SUM(milliseconds) FROM track;', { hint: 'SUM(milliseconds).' })
    ]
  },
  {
    id: 'c8-group-by', order: 8, skill: 'group-by',
    title: 'Summarize per group with GROUP BY',
    teach: {
      plain: 'GROUP BY splits the table into groups and runs the aggregate once per group. SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id gives one row per genre with its track count. Every non-aggregated column in SELECT must also appear in GROUP BY.',
      mentalModel: 'GROUP BY <column> = "for each value of that column, summarize its rows".',
      example: { sql: 'SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id ORDER BY genre_id;', note: 'One row per genre, showing how many tracks it has.' }
    },
    exercises: [
      ex('c8-r1', 'group-by', 'For each genre_id, count how many tracks it has. Show genre_id and the count, lowest genre_id first.', 'SELECT genre_id, COUNT(*) FROM track GROUP BY genre_id ORDER BY genre_id;', { starterSql: 'SELECT genre_id, COUNT(*) FROM track GROUP BY ____ ORDER BY genre_id;', hint: 'GROUP BY the column you are counting per: genre_id.' }),
      ex('c8-r2', 'group-by', 'For each album_id, count how many tracks it has. Show album_id and the count, lowest album_id first.', 'SELECT album_id, COUNT(*) FROM track GROUP BY album_id ORDER BY album_id;', { hint: 'GROUP BY album_id.' }),
      ex('c8-r3', 'group-by', 'For each unit_price, count how many tracks have that price. Show unit_price and the count, lowest price first.', 'SELECT unit_price, COUNT(*) FROM track GROUP BY unit_price ORDER BY unit_price;', { hint: 'GROUP BY unit_price.' }),
      ex('c8-r4', 'group-by', 'For each genre_id, show the average track length rounded to a whole number. Show genre_id and the rounded average, lowest genre_id first.', 'SELECT genre_id, ROUND(AVG(milliseconds)) FROM track GROUP BY genre_id ORDER BY genre_id;', { hint: 'ROUND(AVG(milliseconds)) with GROUP BY genre_id.' })
    ]
  }
];

const CHECKPOINTS = [
  { id: 'cpA', afterOrder: 4, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct'], title: 'Checkpoint A: mixed practice (SELECT → DISTINCT)' },
  { id: 'cpB', afterOrder: 8, drawFromSkills: ['select-all', 'select-columns', 'order-limit', 'distinct', 'where', 'null', 'aggregate', 'group-by'], title: 'Checkpoint B: mixed practice (everything so far)' }
];

const SKILLS = CONCEPTS.map((c) => ({ skill: c.skill, conceptId: c.id, title: c.title, order: c.order }));

function getFoundations() {
  const exercises = CONCEPTS.flatMap((c) => c.exercises);
  return {
    dataset: DB,
    concepts: CONCEPTS,
    checkpoints: CHECKPOINTS,
    skills: SKILLS,
    exercises // flat list of every rep
  };
}

module.exports = { getFoundations };
