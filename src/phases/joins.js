const DB = 'chinook';
function ex(id, skill, task, expectedSql, opts = {}) {
  return { id, skill, database: DB, task, starterSql: opts.starterSql || '', hint: opts.hint || '', expectedSql: expectedSql.trim() };
}

const CONCEPTS = [
  {
    id: 'j-inner', order: 1, skill: 'inner-join',
    title: 'Combine two tables (JOIN)',
    teach: {
      plain: 'A JOIN glues two tables together on a matching column (a "key"). track.album_id matches album.album_id, so you can show a track next to its album title. Give each table a short alias (track t, album al) and qualify columns as t.name, al.title. Use AS to rename an output column.',
      mentalModel: 'FROM a JOIN b ON a.key = b.key stitches each row of a to its matching row in b.',
      example: { sql: 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 5;', note: 'Each track shown next to the album it belongs to.' }
    },
    exercises: [
      ex('j-inner-1', 'inner-join', 'Show each track name next to its album title. Order by track_id, first 20.', 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 20;', { starterSql: 'SELECT t.name, al.title FROM track t JOIN album al ON t.album_id = ____ ORDER BY t.track_id LIMIT 20;', hint: 'Match track.album_id to album.album_id.' }),
      ex('j-inner-2', 'inner-join', 'Show invoice_id with the first_name and last_name of the customer who placed it. Order by invoice_id, first 20.', 'SELECT i.invoice_id, c.first_name, c.last_name FROM invoice i JOIN customer c ON i.customer_id = c.customer_id ORDER BY i.invoice_id LIMIT 20;', { hint: 'Join invoice.customer_id to customer.customer_id.' }),
      ex('j-inner-3', 'inner-join', 'Show each track and its genre. Label the columns track and genre. Order by track_id, first 20.', 'SELECT t.name AS track, g.name AS genre FROM track t JOIN genre g ON t.genre_id = g.genre_id ORDER BY t.track_id LIMIT 20;', { hint: 'Both columns are called name, so alias them with AS track and AS genre.' })
    ]
  },
  {
    id: 'j-left', order: 2, skill: 'left-join',
    title: 'Keep every row with LEFT JOIN',
    teach: {
      plain: 'A plain JOIN drops rows that have no match. A LEFT JOIN keeps every row from the left (first) table and fills NULL where the right table has no match. That is how you answer "which X have no Y": LEFT JOIN, then keep the rows where the right key IS NULL.',
      mentalModel: 'LEFT JOIN keeps all of the left table; unmatched right-side columns come back NULL.',
      example: { sql: 'SELECT ar.name, al.title FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id ORDER BY ar.artist_id LIMIT 5;', note: 'Artists appear even if they have no album (title is NULL).' }
    },
    exercises: [
      ex('j-left-1', 'left-join', 'List the artists that have NO album. Show artist_id and name, ordered by artist_id.', 'SELECT ar.artist_id, ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id WHERE al.album_id IS NULL ORDER BY ar.artist_id;', { starterSql: 'SELECT ar.artist_id, ar.name FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id WHERE al.album_id ____ ORDER BY ar.artist_id;', hint: 'No album means the album key came back NULL: WHERE al.album_id IS NULL.' }),
      ex('j-left-2', 'left-join', 'Show every artist name and their album title (NULL when they have none). Order by artist_id, then album_id, first 30.', 'SELECT ar.name, al.title FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id ORDER BY ar.artist_id, al.album_id LIMIT 30;', { hint: 'LEFT JOIN keeps everyone; order by ar.artist_id then al.album_id.' }),
      ex('j-left-3', 'left-join', 'Count how many albums each artist has, including artists with zero. Show artist_id and album_count, ordered by artist_id.', 'SELECT ar.artist_id, COUNT(al.album_id) AS album_count FROM artist ar LEFT JOIN album al ON al.artist_id = ar.artist_id GROUP BY ar.artist_id ORDER BY ar.artist_id;', { hint: 'COUNT(al.album_id) counts only matched rows, so artists with no album score 0.' })
    ]
  },
  {
    id: 'j-multi', order: 3, skill: 'multi-join',
    title: 'Chain three or more tables',
    teach: {
      plain: 'You can JOIN more than two tables: each JOIN adds another table on its key. To show a track with its artist you go track → album → artist, because the artist is stored on the album, not the track.',
      mentalModel: 'Each additional JOIN … ON … hops one more key across the schema.',
      example: { sql: 'SELECT ar.name AS artist, t.name AS track FROM artist ar JOIN album al ON al.artist_id = ar.artist_id JOIN track t ON t.album_id = al.album_id ORDER BY t.track_id LIMIT 5;', note: 'artist → album → track, chained by two joins.' }
    },
    exercises: [
      ex('j-multi-1', 'multi-join', 'Show each track and its artist. Label the columns track and artist. Order by track_id, first 20.', 'SELECT t.name AS track, ar.name AS artist FROM track t JOIN album al ON t.album_id = al.album_id JOIN artist ar ON al.artist_id = ar.artist_id ORDER BY t.track_id LIMIT 20;', { starterSql: 'SELECT t.name AS track, ar.name AS artist FROM track t JOIN album al ON t.album_id = al.album_id JOIN artist ar ON al.artist_id = ____ ORDER BY t.track_id LIMIT 20;', hint: 'Second hop: album.artist_id = artist.artist_id.' }),
      ex('j-multi-2', 'multi-join', 'For each invoice line show invoice_id, the customer last_name, and the track name. Order by invoice_line_id, first 20.', 'SELECT il.invoice_id, c.last_name, t.name FROM invoice_line il JOIN invoice i ON il.invoice_id = i.invoice_id JOIN customer c ON i.customer_id = c.customer_id JOIN track t ON il.track_id = t.track_id ORDER BY il.invoice_line_id LIMIT 20;', { hint: 'Four tables: invoice_line → invoice → customer, and invoice_line → track.' }),
      ex('j-multi-3', 'multi-join', 'Show each track with its album title and genre. Label the columns track, album, genre. Order by track_id, first 20.', 'SELECT t.name AS track, al.title AS album, g.name AS genre FROM track t JOIN album al ON t.album_id = al.album_id JOIN genre g ON t.genre_id = g.genre_id ORDER BY t.track_id LIMIT 20;', { hint: 'Join album on album_id and genre on genre_id.' })
    ]
  },
  {
    id: 'j-agg', order: 4, skill: 'join-aggregate',
    title: 'Summarize across a join',
    teach: {
      plain: 'Once tables are joined, GROUP BY and the aggregate functions you already know work across them: revenue per genre, tracks per album, sales per country. Join first, then group by the label you want one row per.',
      mentalModel: 'JOIN builds the wide table; GROUP BY + COUNT/SUM collapse it per group.',
      example: { sql: 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 5;', note: 'Track count per genre, busiest first.' }
    },
    exercises: [
      ex('j-agg-1', 'join-aggregate', 'For each genre, count its tracks. Label the columns genre and tracks. Most tracks first, ties by genre name, first 10.', 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 10;', { starterSql: 'SELECT g.name AS genre, COUNT(*) AS tracks FROM track t JOIN genre g ON t.genre_id = ____ GROUP BY g.name ORDER BY tracks DESC, g.name LIMIT 10;', hint: 'Join on genre_id, GROUP BY g.name.' }),
      ex('j-agg-2', 'join-aggregate', 'Total revenue per genre (sum of unit_price times quantity from invoice_line, rounded to 2 decimals). Label genre and revenue. Highest revenue first, ties by genre, first 10.', 'SELECT g.name AS genre, ROUND(SUM(il.unit_price * il.quantity), 2) AS revenue FROM invoice_line il JOIN track t ON il.track_id = t.track_id JOIN genre g ON t.genre_id = g.genre_id GROUP BY g.name ORDER BY revenue DESC, g.name LIMIT 10;', { hint: 'invoice_line → track → genre, then SUM(unit_price*quantity).' }),
      ex('j-agg-3', 'join-aggregate', 'Number of tracks per album title. Label album and tracks. Most first, ties by album title, first 10.', 'SELECT al.title AS album, COUNT(*) AS tracks FROM track t JOIN album al ON t.album_id = al.album_id GROUP BY al.title ORDER BY tracks DESC, al.title LIMIT 10;', { hint: 'GROUP BY al.title.' })
    ]
  },
  {
    id: 'j-self', order: 5, skill: 'self-join',
    title: 'Join a table to itself',
    teach: {
      plain: 'A table can join to itself, useful for hierarchies. Each employee row has a reports_to that holds their manager’s employee_id. Join employee to a second copy of employee to line up each person with their manager. Alias the two copies (e for employee, m for manager) so SQL can tell them apart.',
      mentalModel: 'Two aliases of the same table = "this row" and "the row it points at".',
      example: { sql: 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', note: 'Each employee beside their manager.' }
    },
    exercises: [
      ex('j-self-1', 'self-join', 'Show each employee first_name next to their manager first_name. Label the columns employee and manager. Order by the employee’s employee_id.', 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { starterSql: 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e JOIN employee m ON e.reports_to = ____ ORDER BY e.employee_id;', hint: 'reports_to points at the manager’s employee_id.' }),
      ex('j-self-2', 'self-join', 'Show each employee first_name, their own last_name as emp_last, and their manager’s last_name as mgr_last. Order by employee_id.', 'SELECT e.first_name, e.last_name AS emp_last, m.last_name AS mgr_last FROM employee e JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { hint: 'Two aliases e and m; alias the two last_name columns.' }),
      ex('j-self-3', 'self-join', 'Use a LEFT self-join to include the top manager (who has no manager). Show employee first_name and manager first_name (NULL for the boss). Label them employee and manager. Order by employee_id.', 'SELECT e.first_name AS employee, m.first_name AS manager FROM employee e LEFT JOIN employee m ON e.reports_to = m.employee_id ORDER BY e.employee_id;', { hint: 'LEFT JOIN keeps the boss even though reports_to is NULL.' })
    ]
  }
];

const CHECKPOINTS = [
  { id: 'cpC', afterOrder: 2, drawFromSkills: ['inner-join', 'left-join'], title: 'Checkpoint C: joins (inner + left)' },
  { id: 'cpD', afterOrder: 5, drawFromSkills: ['inner-join', 'left-join', 'multi-join', 'join-aggregate', 'self-join'], title: 'Checkpoint D: all joins' }
];

const joinsPhase = {
  id: 'joins', order: 2,
  title: 'Joins',
  goal: 'Combine multiple tables: inner and left joins, multi-table chains, aggregation across joins, and self-joins.',
  concepts: CONCEPTS,
  checkpoints: CHECKPOINTS
};

module.exports = { joinsPhase };
