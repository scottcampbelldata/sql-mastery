// Validates every Foundations expectedSql against the running server's /api/check-style
// execution. Requires `npm start` running on PORT (default 3000). Fails loudly on any
// query that errors, returns zero rows, or is non-deterministic (differs across two runs).
const http = require('http');
const { getLearningPath } = require('../src/learning-path');

const PORT = process.env.PORT || 3000;

function runQuery(database, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ database, sql });
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/api/query', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode !== 200) return reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            resolve(parsed);
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const { exercises } = getLearningPath();
  let failures = 0;
  for (const exercise of exercises) {
    try {
      const a = await runQuery(exercise.database, exercise.expectedSql);
      const b = await runQuery(exercise.database, exercise.expectedSql);
      const rowsA = JSON.stringify(a.rows);
      const rowsB = JSON.stringify(b.rows);
      const problems = [];
      if (!a.rows.length) problems.push('ZERO ROWS');
      if (rowsA !== rowsB) problems.push('NON-DETERMINISTIC (row order/values differ across runs)');
      if (problems.length) {
        failures += 1;
        console.error(`FAIL ${exercise.id} [${exercise.skill}]: ${problems.join(', ')}\n  SQL: ${exercise.expectedSql}`);
      } else {
        console.log(`ok   ${exercise.id} [${exercise.skill}] -> ${a.rows.length} row(s), cols ${JSON.stringify(a.columns)}`);
      }
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${exercise.id} [${exercise.skill}]: ${error.message}\n  SQL: ${exercise.expectedSql}`);
    }
  }
  console.log(`\n${exercises.length - failures}/${exercises.length} exercises valid.`);
  process.exit(failures ? 1 : 0);
}

main();
