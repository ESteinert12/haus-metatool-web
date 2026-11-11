// Live-DB dry run of the ACTUAL cue-sheet import/write path (not just
// parse+match, which verify-cue-sheets-corpus.js already covers read-only).
// Exercises the exact transaction + batched-insert logic api.js's
// importOneCueSheet() now uses (see the 2026-11-11 guardrails handoff doc)
// against a handful of real files -- by default one real file per newly
// supported format (K, L, M, N, O), so the new code gets proven against
// Neon's real schema/types before any of those formats are trusted in
// production. api.js itself can't be require()'d for this (it has no
// module.exports and calls app.listen() at load time -- requiring it would
// start a second live server), so this script is a deliberate, clearly
// labeled mirror of importOneCueSheet's logic, not an import of it. If that
// function changes in api.js, re-sync this script's copy by eye.
//
// SAFE BY DEFAULT: every write happens inside one transaction that always
// ROLLS BACK unless --commit is passed, same pattern already used by this
// project's other live-DB dry-run scripts (see claude/handoff-2026-10-28-
// titles-usage-count-and-royalty-tracker-rebase.md's verify-royalty-tracker-
// live.js). Run with no --commit first; only re-run with --commit once the
// dry-run output has been reviewed by eye.
//
// Usage (from Erik's/Kyle's own terminal -- this cloud session cannot reach
// Neon directly, same structural network block as every other live-DB
// script in this project):
//   node verify-cue-sheets-import-live.js "<path to one real cue sheet file>" [more files...] [--commit]
// With no file args, scans the default corpus root below for the first real
// file it finds of each of formats K, L, M, N, O and dry-runs all five.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { parseCueSheetFile, matchCueToTitles, normTitle, titleToCamelKey } = require('./cue-sheet-import.js');

const DEFAULT_CORPUS_ROOT = '/Users/HAUS/Documents/CUE SHEETS';
const NEW_FORMATS = ['K', 'L', 'M', 'N', 'O'];
const FILE_EXTS = new Set(['.xlsx', '.xlsm', '.xls', '.csv']);

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

const CUE_SHEET_CUE_COLS = ['cue_sheet_id', 'seq', 'title_raw', 'title_normalized', 'usage_type', 'duration',
  'is_haus_cue', 'classify_reason', 'classify_confidence', 'match_status', 'matched_sku_root', 'match_confidence'];
const CUE_SHEET_PARTY_COLS = ['cue_id', 'name', 'role', 'pro', 'split_pct'];
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

// Mirror of importOneCueSheet in api.js -- see that function's own comments
// for the full rationale. Dedupe/replace is never exercised here: this
// always imports as a FRESH episode+cue_sheet (never replace=true against a
// real existing row), since the point is proving the write path works, not
// touching real production dedupe state. The transaction rolls back
// regardless unless --commit, so even this is fully reversible.
async function dryRunImportOneCueSheet(client, filePath, origName, hausPublisherNames, titlesIndex) {
  const parsed = parseCueSheetFile(filePath, origName, hausPublisherNames);
  if (parsed.format === 'UNKNOWN' || parsed.format === 'EBR_SKIP') {
    return { ok: false, origName, error: `format=${parsed.format}, not a real import candidate` };
  }
  if (!parsed.cues.length) {
    return { ok: false, origName, error: `format=${parsed.format} but 0 cues parsed -- exactly the case the new empty-parse guard now catches` };
  }

  const program = (parsed.meta.program || '').trim() || null;
  const episodeNum = (parsed.meta.episodeNum || '').trim() || origName.replace(/\.[^.]+$/, '');
  const existingEpisode = await client.query(
    `SELECT id FROM episodes WHERE (program IS NOT DISTINCT FROM $1) AND episode_num = $2 LIMIT 1`,
    [program, episodeNum]
  );
  let episodeId, episodeWasExisting = false;
  if (existingEpisode.rows.length) {
    episodeId = existingEpisode.rows[0].id;
    episodeWasExisting = true;
  } else {
    const newEpisode = await client.query(
      `INSERT INTO episodes (program, episode_title, episode_num, air_date) VALUES ($1,$2,$3,$4) RETURNING id`,
      [program, parsed.meta.episode || null, episodeNum, parsed.meta.airDate || null]
    );
    episodeId = newEpisode.rows[0].id;
  }

  const dup = await client.query(
    `SELECT id, imported_at FROM cue_sheets WHERE episode_id = $1 AND source_filename = $2 LIMIT 1`,
    [episodeId, origName]
  );
  if (dup.rows.length) {
    return { ok: false, origName, error: `dry run only -- episode already has a cue sheet for this exact filename (#${dup.rows[0].id}); skipping rather than touching real dedupe state. Try a filename this episode hasn't seen, or ignore if this is expected.` };
  }

  const sheetRow = await client.query(
    `INSERT INTO cue_sheets (episode_id, source_filename, format, cue_sheet_ref, imported_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [episodeId, origName, parsed.format, parsed.meta.cueSheetId || null, 'DRY-RUN-SCRIPT']
  );
  const cueSheetId = sheetRow.rows[0].id;

  const hausCues = parsed.cues.filter(c => c.isHaus);
  let matchedCount = 0, unmatchedCount = 0, ambiguousCount = 0;
  const matchResults = hausCues.map(cue => {
    const m = matchCueToTitles(cue, titlesIndex);
    if (m.status === 'matched') matchedCount++;
    else if (m.status === 'ambiguous') ambiguousCount++;
    else unmatchedCount++;
    const matchedSku = (m.status === 'matched' && m.candidates.length === 1) ? m.candidates[0].sku_root : null;
    return { cue, status: m.status, confidence: m.confidence || null, matchedSku };
  });

  const cueIds = await _bulkInsert(
    client, 'cue_sheet_cues', CUE_SHEET_CUE_COLS, matchResults,
    mr => [cueSheetId, mr.cue.seq, mr.cue.titleRaw, mr.cue.titleNormalized, mr.cue.usage || null, mr.cue.duration || null,
      true, mr.cue.classifyReason || null, mr.cue.classifyConfidence || null, mr.status, mr.matchedSku, mr.confidence],
    { returning: 'id' }
  );

  const partyRows = [];
  matchResults.forEach((mr, idx) => {
    for (const p of mr.cue.parties) partyRows.push([cueIds[idx], p]);
  });
  await _bulkInsert(
    client, 'cue_sheet_cue_parties', CUE_SHEET_PARTY_COLS, partyRows,
    ([cueId, p]) => [cueId, p.name || null, p.role || null, p.pro || null, p.pct ? (parseFloat(p.pct) || null) : null]
  );

  return {
    ok: true, origName, format: parsed.format, episodeId, episodeWasExisting, cueSheetId,
    totalCues: parsed.cues.length, hausCues: hausCues.length, cuesInserted: cueIds.length,
    partiesInserted: partyRows.length, matched: matchedCount, ambiguous: ambiguousCount, unmatched: unmatchedCount,
    sampleDurations: matchResults.slice(0, 3).map(mr => mr.cue.duration),
    sampleAirDate: parsed.meta.airDate,
  };
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (FILE_EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
}

(async () => {
  let targets = [];
  if (fileArgs.length) {
    targets = fileArgs.map(f => ({ file: f, label: path.basename(f) }));
  } else {
    console.log(`No files given -- scanning "${DEFAULT_CORPUS_ROOT}" for one real file per new format (${NEW_FORMATS.join(', ')})...`);
    const { sniffFormat } = require('./cue-sheet-import.js');
    const all = [];
    walk(DEFAULT_CORPUS_ROOT, all);
    const seen = new Set();
    for (const f of all) {
      if (seen.size === NEW_FORMATS.length) break;
      let fmt;
      try { fmt = sniffFormat(f, path.basename(f)); } catch { continue; }
      if (NEW_FORMATS.includes(fmt) && !seen.has(fmt)) {
        seen.add(fmt);
        targets.push({ file: f, label: `[format ${fmt}] ${path.basename(f)}` });
      }
    }
    if (!targets.length) {
      console.error('Found no files matching formats', NEW_FORMATS, 'under', DEFAULT_CORPUS_ROOT);
      process.exit(1);
    }
  }

  console.log(`\n${COMMIT ? '*** --commit passed: this WILL be written for real ***' : 'DRY RUN (no --commit): everything below will be ROLLED BACK, nothing written for real'}\n`);

  console.log('Loading real catalog from Postgres...');
  const dealPubRows = await pool.query(`SELECT DISTINCT publisher_name FROM deal_publishers`);
  const hausPublisherNames = new Set(dealPubRows.rows.map(r => (r.publisher_name || '').trim().toLowerCase()));
  const titlesRes = await pool.query(`SELECT sku_root, title, team_id FROM titles`);
  const titlesIndex = titlesRes.rows.map(t => ({ ...t, normTitle: normTitle(t.title), camelKey: titleToCamelKey(t.title) }));
  console.log(`Loaded ${titlesIndex.length} catalog titles, ${hausPublisherNames.size} known HAUS/deal publisher names.\n`);

  for (const { file, label } of targets) {
    console.log(`\n=== ${label} ===`);
    try {
      const result = await _pgRetryTransaction(async (client) => {
        const r = await dryRunImportOneCueSheet(client, file, path.basename(file), hausPublisherNames, titlesIndex);
        if (!COMMIT) throw Object.assign(new Error('dry-run rollback (not a real failure)'), { dryRunResult: r, isDryRunRollback: true });
        return r;
      }, 'cue-sheets dry-run import').catch(e => {
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
