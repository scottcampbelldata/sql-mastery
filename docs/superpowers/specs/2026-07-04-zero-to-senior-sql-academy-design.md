# Zero To Senior SQL Academy Design

## Direction

SQL Mastery Path must teach someone who has never seen SQL before and carry them to senior data analyst / analytics engineer interview readiness. The app should not assume the learner knows what a database, table, row, column, join, aggregation, CTE, or window function is.

## Curriculum Model

- Track length: 36 weeks, 4 sessions per week, 144 total sessions.
- Audience: senior data analyst and analytics engineer interviews, not DBA administration.
- Lesson format: each exercise can include a concept explanation, mental model, worked example, step-by-step plan, common mistakes, and interview angle.
- Progression:
  1. Absolute zero: databases, tables, rows, columns, schemas.
  2. SQL sentence structure: SELECT, FROM, WHERE, ORDER BY, LIMIT.
  3. Data types, NULL, comparison logic, and CASE.
  4. Aggregation and business metrics.
  5. Joins, grain, fan-out, anti-joins, and reconciliation.
  6. CTEs and query decomposition.
  7. Window functions and ranking/running/time-series patterns.
  8. Data quality, analytics engineering habits, performance, and explain plans.
  9. Senior business cases, ambiguous prompts, and mock interviews.

## Question Bank

Add broad repetition beyond the guided lesson path. The bank should cover drill, fluency, debugging, case, and interview-style prompts. Exercises should run against the local full databases whenever possible.

## UI

The workbench should teach before asking for SQL. It should show:

- What you are learning.
- Why it matters.
- A mental model.
- A worked example.
- A plan for the current task.
- Common mistake warnings.
- Senior interview framing.

## Constraints

- Keep the existing `/api/curriculum` and `/api/check` APIs.
- Keep the current local PostgreSQL execution model.
- Preserve old reference pages.
- Do not add a frontend framework.
- Avoid DBA/admin-only material except where schema inspection helps analysts.
