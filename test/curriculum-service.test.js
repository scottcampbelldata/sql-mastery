const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildCurriculum } = require('../src/curriculum-service');

const rootDir = path.join(__dirname, '..', 'content');

test('buildCurriculum parses the existing workbook into many guided exercises', () => {
  const curriculum = buildCurriculum({ rootDir });

  assert.ok(curriculum.exercises.length >= 500);
  assert.ok(curriculum.stats.checkableExercises >= 450);
});

test('buildCurriculum extracts the first fundamentals exercise with database and expected SQL', () => {
  const curriculum = buildCurriculum({ rootDir });
  const exercise = curriculum.exercises.find((item) => item.id === 'p1-1');

  assert.equal(exercise.title, 'P1.1');
  assert.equal(exercise.database, 'chinook');
  assert.match(exercise.task, /List the 15 longest tracks/);
  assert.match(exercise.expectedSql, /ORDER BY milliseconds DESC/);
  assert.equal(exercise.checkable, true);
});

test('buildCurriculum schedules a thirty six week academy path with one hundred forty four sessions', () => {
  const curriculum = buildCurriculum({ rootDir });

  assert.equal(curriculum.weeks.length, 36);
  assert.equal(curriculum.sessions.length, 144);
  assert.equal(curriculum.weeks[0].sessions.length, 4);
  assert.equal(curriculum.weeks[35].sessions.length, 4);
  assert.equal(curriculum.stats.estimatedAttempts, curriculum.exercises.length * 3);
});

test('buildCurriculum never schedules an empty session', () => {
  const curriculum = buildCurriculum({ rootDir });

  const emptySessions = curriculum.sessions.filter((session) => session.exerciseIds.length === 0);

  assert.deepEqual(emptySessions, []);
});

test('buildCurriculum starts from absolute zero and carries teaching metadata', () => {
  const curriculum = buildCurriculum({ rootDir });
  const firstExercise = curriculum.exercises.find((item) => item.id === 'zero-database-01');
  const seniorCase = curriculum.exercises.find((item) => item.id === 'senior-analytics-case-01');

  assert.equal(firstExercise.database, 'chinook');
  assert.match(firstExercise.task, /database/i);
  assert.match(firstExercise.concept, /database/i);
  assert.match(firstExercise.mentalModel, /spreadsheet/i);
  assert.ok(Array.isArray(firstExercise.steps));
  assert.ok(firstExercise.steps.length >= 3);
  assert.match(firstExercise.interviewAngle, /interview/i);

  assert.equal(seniorCase.database, 'adventureworks');
  assert.equal(seniorCase.level, 'senior case');
  assert.match(seniorCase.task, /executive/i);
});

test('buildCurriculum keeps generated window sort columns available in outer queries', () => {
  const curriculum = buildCurriculum({ rootDir });
  const exercise = curriculum.exercises.find((item) => item.id === 'academy-rank-by-group-08-stackoverflow-users');

  assert.match(exercise.expectedSql, /SELECT location, id, displayname, reputation, creationdate,/);
  assert.match(exercise.expectedSql, /ORDER BY location, rn/);
});

test('buildCurriculum includes senior interview expansion packs', () => {
  const curriculum = buildCurriculum({ rootDir });
  const advanced = curriculum.exercises.find((item) => item.id === 'senior-window-01');
  const caseStudy = curriculum.exercises.find((item) => item.id === 'case-executive-sales-01');

  assert.equal(advanced.database, 'stackoverflow');
  assert.match(advanced.task, /accepted answer rate/i);
  assert.match(advanced.expectedSql, /OVER/);
  assert.equal(caseStudy.database, 'adventureworks');
  assert.match(caseStudy.solutionNote, /executive/i);
});

test('buildCurriculum adapts StackOverflow reference SQL to the local database port', () => {
  const curriculum = buildCurriculum({ rootDir });
  const stackoverflowSql = curriculum.exercises
    .filter((item) => item.database === 'stackoverflow' && item.expectedSql)
    .map((item) => item.expectedSql)
    .join('\n');

  assert.match(stackoverflowSql, /displayname|creationdate|posttypeid|owneruserid/);
  assert.doesNotMatch(stackoverflowSql, /\bdisplay_name\b/);
  assert.doesNotMatch(stackoverflowSql, /\bcreation_date\b/);
  assert.doesNotMatch(stackoverflowSql, /\bpost_type_id\b/);
  assert.doesNotMatch(stackoverflowSql, /\bowner_user_id\b/);
});

test('buildCurriculum preserves less-than operators from HTML solution snippets', () => {
  const curriculum = buildCurriculum({ rootDir });
  const byId = new Map(curriculum.exercises.map((item) => [item.id, item]));

  assert.match(byId.get('p1-9').expectedSql, /creationdate <\s+DATE '2019-01-01'/);
  assert.match(byId.get('p2-12').expectedSql, /reputation < 100/);
  assert.match(byId.get('p5-5').expectedSql, /^WITH first_answers AS \(/);
  assert.match(byId.get('p5-5').expectedSql, /first_answer_at <= q\.creationdate \+ INTERVAL '1 hour'/);
});
