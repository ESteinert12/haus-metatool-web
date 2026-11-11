// Live-DB dry run of the ACTUAL royalty-statement import/write path (not
// just parse+classify, which _verify_royalty_historical_formats_20261111.js
// already covers read-only, with no DB involved at all). Exercises the exact
// transaction + batched-insert logic api.js's importOneRoyaltyStatement()
// now uses (see claude/handoff-2026-11-11-royalty-tracker-transaction-fix-
// and-historical-formats.md) against real statement files -- by default up
// to 2 real files per recognized format tag (BMI, ASCAP_DOM, ASCAP_FOR,
// SESAC, plus the two newly-recognized legacy tags ASCAP_FOR_LEGACY and
// SESAC_LEGACY), so BOTH the transaction fix and the historical-format fix
// get proven against Neon's real schema/types before either is trusted in
// production. api.js itself can't be require()'d for this (no
// module.exports, calls app.listen() at load time -- requiring it would
// start a second live server), so this script is a deliberate, clearly
// labeled mirror of importOneRoyaltyStatement's logic, not an import of it.
// If that function changes in api.js, re-sync this script's copy by eye.
// Mirrors the exact same pattern as this project's other live-DB dry-run
// scripts (verify-cue-sheets-import-live.js, verify-royalty-tracker-live.js).
//
// SAFE BY DEFAULT: every write happens inside one transaction that always
// ROLLS BACK unless --commit is passed. Run with no --commit first; only
// re-run with --commit once the dry-run output has been reviewed by eye.
//
// Usage (from Erik's/Kyle's own terminal -- this cloud session cannot reach
// Neon directly, same structural network block as every other live-DB
// script in this project):
//   node verify-royalty-import-live.js "<path to one real statement file>" [more files...] [--commit]
// With no file args, scans the default corpus root below for up to 2 real
// files per recognized format and dry-runs all of them.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { sniffFormat, parseRoyaltyStatementFile, matchLineToTitles, normTitle, titleToCamelKey } = require('./royalty-import.js');

const DEFAULT_CORPUS_ROOT = '/Users/HAUS/Documents/ROYALTY STATEMENTS';
const CORPUS_DIRS = ['1. ASCAP', '2. BMI', '3. SESAC', '4. ASCAP_International', '5. SOCAN'];
const MAX_PER_FORMAT = 2; // BMI/ASCAP_DOM get an old + a new example when available, to prove both eras

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const fileArgs = args.filter(a => a !== '--commit');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 30000,
  statement_timeout: 20000,
  query_timeout: 25000,
});
pool.on('error', (err) => console.error('[pool] error (handled):', err.message));

async function _pgRetryTransaction(fn, label, attempts = 4) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      last = e;
      const transient = /terminated|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|Connection|socket|starting up|shutting down|timeout/i.test(e.message || '');
      if (!transient || attempt === attempts - 1) throw e;
      const wait = 1000 * Math.pow(2, attempt);
      console.warn(`[pg] ${label} failed (${e.message}) — retrying whole transaction, attempt ${attempt + 1}/${attempts - 1} in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
    } finally {
      client.release();
    }
  }
  throw last;
}

const ROYALTY_LINE_COLS = ['statement_id', 'title_raw', 'title_normalized', 'payee_name', 'payee_role', 'amount',
  'usage_type', 'country', 'work_id', 'show_name', 'episode_name', 'bonus_amount', 'match_status', 'matched_sku_root'];
const CHUNK = 500;

async function _bulkInsert(client, table, cols, items, rowsFn, { returning } = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    if (!chunk.length) continue;
    const values = [], params = [];
    chunk.forEach((item, idx) => {
      const row = rowsFn(item);
      const base = idx * cols.length;
      values.push(`(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`);
      params.push(...row);
    });
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}` + (returning ? ` RETURNING ${returning}` : '');
    const res = await client.query(sql, params);
    if (returning) out.push(...res.rows.map(r => r[returning]));
  }
  return out;
}

// Mirror of importOneRoyaltyStatement in api.js (post-2026-11-11 transaction
// fix) -- see that function's own comments for the full rationale. The
// dedupe checks run for real (against real royalty_statements rows) so a
// file that collides with something already imported is reported rather
// than silently double-counted, but since the whole transaction rolls back
// unless --commit, even a "no collision" result never touches real state.
async function dryRunImportOneRoyaltyStatement(client, filePath, origName, titlesIndex) {
  const parsed = parseRoyaltyStatementFile(filePath);
  if (parsed.format === 'UNKNOWN') {
    return { ok: false, origName, error: `Unrecognized format -- not a real import candidate` };
  }

  const dupByPeriod = parsed.meta.period
    ? await client.query(
        `SELECT id, source_filename, imported_at FROM royalty_statements WHERE source = $1 AND format = $2 AND period = $3 LIMIT 1`,
        [parsed.meta.source, parsed.format, parsed.meta.period]
      )
    : { rows: [] };
  if (dupByPeriod.rows.length) {
    return { ok: false, origName, format: parsed.format, error: `dry run only -- a ${parsed.meta.source} ${parsed.format} statement for period ${parsed.meta.period} is already imported (#${dupByPeriod.rows[0].id}, "${dupByPeriod.rows[0].source_filename}"); skipping rather than touching real dedupe state.` };
  }
  const dup = await client.query(
    `SELECT id, imported_at FROM royalty_statements WHERE source_filename = $1 LIMIT 1`,
    [origName]
  );
  if (dup.rows.length) {
    return { ok: false, origName, format: parsed.format, error: `dry run only -- "${origName}" is already imported (#${dup.rows[0].id}); skipping rather than touching real dedupe state.` };
  }

  const statementRow = await client.query(
    `INSERT INTO royalty_statements (source, format, period, source_filename, statement_total, imported_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [parsed.meta.source, parsed.format, parsed.meta.period || null, origName, parsed.meta.statementTotal || 0, 'DRY-RUN-SCRIPT']
  );
  const statementId = statementRow.rows[0].id;

  let matchedCount = 0, unmatchedCount = 0, ambiguousCount = 0;
  const lineRows = [];
  for (const line of parsed.lines) {
    const m = matchLineToTitles(line, titlesIndex);
    if (m.status === 'matched') matchedCount++;
    else if (m.status === 'ambiguous') ambiguousCount++;
    else unmatchedCount++;
    const matchedSku = (m.status === 'matched' && m.candidates.length === 1) ? m.candidates[0].sku_root : null;
    lineRows.push([statementId, line.titleRaw, line.titleNormalized, line.payeeName || null, line.payeeRole || null, line.amount,
       line.usageType || null, line.country || null, line.workId || null, line.showName || null, line.episodeName || null,
       line.bonusAmount || null, m.status, matchedSku]);
  }
  await _bulkInsert(client, 'royalty_statement_lines', ROYALTY_LINE_COLS, lineRows, row => row);

  return {
    ok: true, origName, statementId, format: parsed.format, period: parsed.meta.period,
    totalLines: parsed.lines.length, matched: matchedCount, ambiguous: ambiguousCount, unmatched: unmatchedCount,
    statementTotal: parsed.meta.statementTotal,
  };
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (path.extname(e.name).toLowerCase() === '.csv') out.push(full);
  }
}

(async () => {
  let targets = [];
  if (fileArgs.length) {
    targets = fileArgs.map(f => ({ file: f, label: path.basename(f) }));
  } else {
    console.log(`No files given -- scanning "${DEFAULT_CORPUS_ROOT}" for up to ${MAX_PER_FORMAT} real files per recognized format...`);
    const all = [];
    for (const d of CORPUS_DIRS) walk(path.join(DEFAULT_CORPUS_ROOT, d), all);
    const byFormat = {};
    for (const f of all) {
      let fmt;
      try { fmt = sniffFormat(f); } catch { continue; }
      if (fmt === 'UNKNOWN') continue;
      byFormat[fmt] = byFormat[fmt] || [];
      if (byFormat[fmt].length < MAX_PER_FORMAT) byFormat[fmt].push(f);
    }
    for (const [fmt, files] of Object.entries(byFormat)) {
      for (const f of files) targets.push({ file: f, label: `[format ${fmt}] ${path.basename(f)}` });
    }
    if (!targets.length) {
      console.error('Found no recognized statement files under', DEFAULT_CORPUS_ROOT);
      process.exit(1);
    }
    console.log(`Found: ${Object.entries(byFormat).map(([fmt, files]) => `${fmt}=${files.length}`).join(', ')}\n`);
  }

  console.log(`\n${COMMIT ? '*** --commit passed: this WILL be written for real ***' : 'DRY RUN (no --commit): everything below will be ROLLED BACK, nothing written for real'}\n`);

  console.log('Loading real catalog from Postgres...');
  const titlesRes = await pool.query(`SELECT sku_root, title, team_id FROM titles`);
  const titlesIndex = titlesRes.rows.map(t => ({ ...t, normTitle: normTitle(t.title), camelKey: titleToCamelKey(t.title) }));
  console.log(`Loaded ${titlesIndex.length} catalog titles.\n`);

  for (const { file, label } of targets) {
    console.log(`\n=== ${label} ===`);
    try {
      const result = await _pgRetryTransaction(async (client) => {
        const r = await dryRunImportOneRoyaltyStatement(client, file, path.basename(file), titlesIndex);
        if (!COMMIT) throw Object.assign(new Error('dry-run rollback (not a real failure)'), { dryRunResult: r, isDryRunRollback: true });
        return r;
      }, 'royalty-import dry-run').catch(e => {
        if (e.isDryRunRollback) return e.dryRunResult;
        throw e;
      });
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error('FAILED:', e.message);
    }
  }

  await pool.end();
  console.log(`\nDone. ${COMMIT ? 'Changes were committed.' : 'Nothing was written (all rolled back). Re-run with --commit once this output looks right.'}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
