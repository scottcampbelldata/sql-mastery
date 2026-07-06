#!/usr/bin/env node
// Extract every <pre> SQL block from lesson HTML files, infer the target DB by
// table names, and run each complete query against local Postgres. Reports errors.
//
// Usage: node verify-sql.js <file1.html> [file2.html ...]
// Env:   PGPASSWORD must be set (or rely on .pgpass). Uses local PG18 psql.

import fs from 'fs';
import { execFileSync } from 'child_process';

const PSQL = process.env.PSQL || 'C:/Program Files/PostgreSQL/18/bin/psql.exe';
const PGUSER = process.env.PGUSER || 'postgres';
const PGHOST = process.env.PGHOST || 'localhost';

// teaching name -> real local DB name
const DB_REAL: Record<string, string> = { chinook: 'chinook_serial', stackoverflow: 'stackoverflow_dba' };

const CHINOOK = new Set(['artist','album','track','genre','media_type','playlist','playlist_track','invoice','invoice_line','customer','employee']);
const STACK = new Set(['users','posts','comments','votes','badges','tags','posthistory','postlinks']);

function decode(s: string) {
  return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
}
// Only strip real HTML tags: '<' followed by '/', a letter, or '!'. A '<' followed
// by space/digit/quote is a SQL operator (e.g. `x < 1`), not a tag — leave it.
function stripTags(s: string) { return s.replace(/<\/?[a-zA-Z!][^>]*>/g, ''); }
// Drop SQL line comments (--...) so a ';' inside a comment doesn't split statements.
function stripLineComments(s: string) { return s.replace(/--[^\n]*/g, ''); }

// pull inner text of every <pre>...</pre>
function extractPres(html: string) {
  const out = [];
  const re = /<pre>([\s\S]*?)<\/pre>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(decode(stripTags(m[1])).trim());
  return out;
}

// split a pre block into candidate statements on semicolons (comments already removed)
function statements(block: string) {
  return stripLineComments(block).split(';').map(s => s.trim()).filter(Boolean).map(s => s + ';');
}

// only run complete read queries; skip DDL/DML/fragments/meta
function isRunnable(stmt: string) {
  const s = stmt.replace(/^\s*(--[^\n]*\n)+/, '').trimStart(); // drop leading comment lines
  return /^(SELECT|WITH|EXPLAIN|TABLE|VALUES)\b/i.test(s);
}
function isExemptDDL(stmt: string) {
  return /^\s*(--.*\n)*\s*(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|BEGIN|SET|ANALYZE|VACUUM|GRANT|REVOKE)\b/i.test(stmt);
}

function inferDb(stmt: string) {
  const toks = new Set((stmt.toLowerCase().match(/[a-z_][a-z0-9_]*/g) || []));
  let c = 0, s = 0;
  for (const t of CHINOOK) if (toks.has(t)) c++;
  for (const t of STACK) if (toks.has(t)) s++;
  if (s > c) return 'stackoverflow';
  if (c > s) return 'chinook';
  if (toks.has('information_schema') || toks.has('pg_catalog') || toks.has('schemata')) return 'chinook';
  return null; // ambiguous
}

function runOne(db: string, stmt: string) {
  const real = DB_REAL[db];
  try {
    execFileSync(PSQL, ['-h', PGHOST, '-U', PGUSER, '-d', real, '-v', 'ON_ERROR_STOP=1', '-qAtc',
      "SET statement_timeout='45s'; " + stmt], { stdio: ['ignore','pipe','pipe'], timeout: 60000 });
    return { ok: true };
  } catch (e) {
    const err = ((e as any).stderr ? (e as any).stderr.toString() : (e as any).message).trim();
    const timedOut = /statement timeout|canceling statement/i.test(err) || (e as any).killed;
    return { ok: timedOut, timedOut, err };
  }
}

let totalRun = 0, totalFail = 0, totalAmbig = 0, totalTimeout = 0;
for (const file of process.argv.slice(2)) {
  const html = fs.readFileSync(file, 'utf8');
  const pres = extractPres(html);
  console.log(`\n=== ${file} — ${pres.length} <pre> blocks ===`);
  let idx = 0;
  for (const block of pres) {
    idx++;
    for (const stmt of statements(block)) {
      if (!isRunnable(stmt)) {
        if (isExemptDDL(stmt)) continue; // exempt teaching DDL/DML
        continue; // fragment / comment / meta — skip silently
      }
      const db = inferDb(stmt);
      if (!db) { totalAmbig++; console.log(`  [pre ${idx}] AMBIGUOUS DB — ${stmt.slice(0,70).replace(/\s+/g,' ')}`); continue; }
      totalRun++;
      const r = runOne(db, stmt);
      if (!r.ok) {
        totalFail++;
        console.log(`  [pre ${idx}] FAIL (${db}): ${r.err.split('\n')[0]}`);
        console.log(`      SQL: ${stmt.slice(0,160).replace(/\s+/g,' ')}`);
      } else if (r.timedOut) {
        totalTimeout++;
        console.log(`  [pre ${idx}] slow/timeout but valid (${db})`);
      }
    }
  }
}
console.log(`\n=== SUMMARY: ran ${totalRun}, failed ${totalFail}, ambiguous ${totalAmbig}, slow ${totalTimeout} ===`);
process.exit(totalFail > 0 ? 1 : 0);
