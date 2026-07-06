# Curriculum Rebuild: Two Databases (chinook + stackoverflow)

**Date:** 2026-07-05
**Branch:** `content/rebuild-two-dbs`
**Status:** Approved design

## Objective

Rebuild the entire SQL Mastery curriculum (`content/*.html`, 9 files) so every lesson,
example, and drill uses **only** the two databases that exist on the server:

- `chinook` (teaching alias → real DB `chinook_serial`)
- `stackoverflow` (teaching alias → real DB `stackoverflow_dba`)

Remove **all** references to the dropped databases: `northwind`, `adventureworks`, `nyctaxi`.
Additionally, **fix the existing StackOverflow examples**, which were written against a
snake_case schema (`owner_user_id`, `post_type_id`, `display_name`) that does **not** match the
loaded database (real columns are lowercase, no underscores: `owneruserid`, `posttypeid`,
`displayname`).

## Quality bar — verification-first (non-negotiable)

**Every SQL snippet in every rebuilt file must execute against the live database without error
before it ships.** The app runs these queries for real; a lesson whose SQL errors is a broken
lesson. Snippets are validated by running them through the read-only `sqlrunner` role on the VPS
(or an equivalent local Postgres). Intentionally-illustrative fragments (e.g. a bare `WHERE`
clause, or `CREATE INDEX` shown for teaching) are exempted **only** when they are clearly partial
and marked as such; anything presented as a complete runnable query must run.

## Database assignment ("StackOverflow-led, chinook where it fits")

Advanced material (windows, performance, interview patterns, recursion-at-scale, ranking,
time-series) leans on **stackoverflow** because it is large and real-world. **chinook** is used
where a small, clean, readable result set teaches the concept more clearly, and for the
beginner modules.

| Module | Primary DB | Notes |
|---|---|---|
| m0 schemas | both | Document only these two schemas |
| m1 fundamentals | chinook | Clean SELECT/WHERE/ORDER/LIMIT on `track`, `invoice`, `customer` |
| m2 aggregation | chinook + stackoverflow | GROUP BY/HAVING on invoices; `posts` counts by type |
| m3 joins | chinook | Rich FK graph; anti-join & self-join on stackoverflow |
| m4 transformation | chinook + stackoverflow | CASE/strings/dates; `posts.creationdate` time-series; tag parsing |
| m5 subqueries/CTEs | chinook + stackoverflow | **Recursive CTE → chinook `employee.reports_to` (3 clean levels)** |
| m6 window functions | stackoverflow-led | Rank users by reputation, top-N per group, LAG/LEAD monthly |
| m7 interview patterns | stackoverflow-led | Gaps/islands, dedup, pivot, cohort on users/posts |
| m8 performance | stackoverflow-led | EXPLAIN/indexes/sargability on big `posts`/`votes` tables |
| mock-interviews | both | Convert every non-kept-DB question to chinook/stackoverflow |

## Schema cheat-sheet (from live introspection — authoritative)

### chinook (real DB `chinook_serial`, public schema, snake_case)

| Table | Columns |
|---|---|
| `artist` | artist_id, name |
| `album` | album_id, title, artist_id |
| `track` | track_id, name, album_id, media_type_id, genre_id, composer, milliseconds, bytes, unit_price |
| `genre` | genre_id, name (25 genres) |
| `media_type` | media_type_id, name |
| `playlist` | playlist_id, name |
| `playlist_track` | playlist_id, track_id |
| `invoice` | invoice_id, customer_id, invoice_date, billing_address/city/state/country/postal_code, total |
| `invoice_line` | invoice_line_id, invoice_id, track_id, unit_price, quantity |
| `customer` | customer_id, first_name, last_name, company, address, city, state, country, postal_code, phone, fax, email, support_rep_id |
| `employee` | employee_id, last_name, first_name, title, reports_to, birth_date, hire_date, address…, email |

- Row counts: track 3503, invoice_line 2240, playlist_track 8715, invoice 412, album 347, artist 275, customer 59, genre 25, employee 8.
- `invoice_date` range: 2021-01-01 … 2025-12-22.
- **Employee hierarchy (recursive CTE gold):** 1 Andrew Adams (General Manager, reports_to NULL) → 2 Nancy Edwards (Sales Manager) & 6 Michael Mitchell (IT Manager) → agents 3/4/5 under Nancy, staff 7/8 under Michael. Clean 3-level tree.
- Line revenue = `unit_price * quantity` from `invoice_line` (no discount column — unlike old northwind).
- FK graph: album.artist_id→artist; track.album_id→album, track.genre_id→genre; invoice.customer_id→customer; invoice_line.invoice_id→invoice, invoice_line.track_id→track; customer.support_rep_id→employee.employee_id; employee.reports_to→employee.employee_id.

### stackoverflow (real DB `stackoverflow_dba`, public schema, lowercase-no-underscore)

This is the **DBA Stack Exchange** dump (recognizable users: Aaron Bertrand, Erwin Brandstetter).

| Table | Columns |
|---|---|
| `users` | id, reputation, creationdate, displayname, lastaccessdate, websiteurl, location, aboutme, views, upvotes, downvotes, accountid |
| `posts` | id, posttypeid, acceptedanswerid, parentid, creationdate, score, viewcount, body, owneruserid, lasteditoruserid, lasteditdate, lastactivitydate, title, tags, answercount, commentcount, favoritecount, closeddate |
| `comments` | id, postid, score, text, creationdate, userid |
| `votes` | id, postid, votetypeid, userid, creationdate, bountyamount |
| `badges` | id, userid, name, date, class, tagbased |
| `tags` | id, tagname, count, excerptpostid, wikipostid |
| `posthistory` | id, posthistorytypeid, postid, revisionguid, creationdate, userid, text, comment |
| `postlinks` | id, creationdate, postid, relatedpostid, linktypeid |

- Row counts: badges 429421, posthistory 835178, comments 347838, users 248141, posts 243394, votes 911783, postlinks 20194, tags 1242.
- `posts.creationdate` range: 2008-09-16 … 2024-03-31. Use years like 2013/2016/2018 for date-range drills.
- **Join keys:** posts.owneruserid→users.id; posts.parentid→posts.id (answer→its question); posts.acceptedanswerid→posts.id; comments.postid→posts.id, comments.userid→users.id; votes.postid→posts.id; badges.userid→users.id.
- **Value codes (memorize):**
  - `posts.posttypeid`: **1 = question, 2 = answer** (also 4/5 tag-wiki, 6/7 rare — filter to 1/2 in lessons).
  - `votes.votetypeid`: **2 = upvote (711,944), 3 = downvote (75,952)**, 1 = accepted, 5 = favorite, 10 = deletion, 15/16 = moderation.
  - `badges.class`: **1 = gold (9,745), 2 = silver (53,429), 3 = bronze (366,247)**.
- **`posts.tags` is PIPE-DELIMITED**, e.g. `|mysql|innodb|myisam|`. Filter a tag with `tags LIKE '%|postgresql|%'`. (NOT angle brackets.) Top tags: sql-server, mysql, postgresql, oracle, performance, database-design.
- **Gotchas that break naive SQL:** every column is lowercase with no underscores; the user PK is `id` (not `userid`); reputation lives on `users`; there is no `up_votes`/`down_votes` — it's `upvotes`/`downvotes`; there is no discount/amount math like the old datasets.

## Authoring conventions (preserve exactly)

- **File structure:** keep `<!DOCTYPE>…<head>` (fonts), `<header class="site">` nav, `<body data-page="mN">`, the `<div class="wrap">…</div>`, and the `<div class="pager">` links. The build (`scripts/extract-lessons.js`) extracts everything inside `<div class="wrap">` up to the last `</div>` before the first `<script>`/`</body>`.
- **Syntax-highlight spans inside `<pre>`:** `<span class="k">` keywords, `<span class="f">` function names, `<span class="c">` comments, `<span class="s">` string literals, `<span class="n">` numeric literals. Table/column identifiers are plain text. Match the density and style of the existing files.
- **Drill blocks:** `<div class="problem">` → `<div class="phead">` containing `<span class="pid">P6.3</span>`, `<span class="db">stackoverflow</span>`, `<span class="chip core">core</span>`, `<input type="checkbox" class="done" data-id="p6-3">` → `<div class="pbody">` with the prompt, optional `<details class="hint">`, and `<details class="sol">`.
- **`<span class="db">` value must be a valid teaching name:** `chinook`, `stackoverflow`, or `any`. Never a dropped DB.
- **Difficulty chips:** `warmup`, `core`, `interview`, `hard` — keep each drill's existing level unless the DB change forces a difficulty shift.
- **PRESERVE problem IDs (`P6.3`) and checkbox `data-id`s (`p6-3`)** so progress tracking and counts stay stable. Keep the same *number* of drills per module where possible; if a drill has no sensible analog, repurpose it to an equivalent concept on the new DB rather than deleting it (deleting changes counts/data-ids).
- **Callouts:** `<div class="tip|note|warn">` with `<span class="tag">…</span>`. Keep the interview-coaching voice.

## Verification protocol

1. Each rebuilt file's SQL blocks are extracted and every complete query is run against the live
   DB it is tagged with (`chinook` or `stackoverflow`), using the read-only role.
2. A query "passes" if it returns rows or an empty set without error. `EXPLAIN`/`EXPLAIN ANALYZE`
   examples must produce a plan. Teaching-only `CREATE INDEX`/`DROP INDEX` in performance drills
   are run against a scratch copy or accepted as DDL that the read-only role would reject — these
   are marked in prose as "run locally" and are exempt from the read-only pass but must be
   syntactically valid.
3. Global pass after fan-out: re-extract SQL from all 9 files and run the full set; zero errors
   on non-exempt queries is the release gate.

## Execution plan (approach C)

1. **Spec** (this document) → commit.
2. **Exemplar (author directly):** rebuild `schemas.html` + `m8-performance.html`, verifying all
   SQL live. These lock the conventions and the verification harness. User eyeballs them.
3. **Fan-out (workflow):** parallel subagents rebuild m1, m2, m3, m4, m5, m6, m7, mock-interviews
   from this spec + the exemplar, each running its own SQL against the live DB. Then an adversarial
   verification stage re-runs every query and checks the DB assignment/column-name rules; then a
   consistency-critic pass on tone/highlighting.
4. **Integrate:** `npm run build` (regenerate `client/src/lessons/fragments`), smoke-test the app
   locally, run the global SQL verification, then commit → push → redeploy to the VPS
   (`git pull && npm run build && systemctl restart sql-mastery`).

## Out of scope

- No schema/data changes to the databases themselves.
- No app/UI code changes beyond regenerating lesson fragments.
- No new modules or drills beyond what exists (repurpose, don't expand).
