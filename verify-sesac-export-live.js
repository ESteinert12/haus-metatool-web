// verify-sesac-export-live.js
//
// Live-DB dry run of the new SESAC Bulk Song Recordings export path
// (sesac-export.js + the SESAC routing added to ebr-lot-export.js on
// feature/sesac-lot-export-rebased). See:
//   Claude outputs/handoff-2026-11-18-sesac-export-rebase-and-dryrun-for-erik.md
// for the full story -- this script is the thing that doc asks Erik to run.
//
// What this does, by default (NO writes anywhere, NO flags needed):
//   1. Connects to the real Neon DB (read-only queries only).
//   2. Finds real pure-SESAC titles across the WHOLE catalog (every writer
//      on the title is SESAC-affiliated, no ASCAP/BMI claim at all) using
//      the exact same eligibility rules runLotAutoExport() uses in
//      ebr-lot-export.js (same exclusions: already-acknowledged by
//      MusicMark, JUP titles, X-composer teams, no writers on file, bad
//      splits -- PLUS, since 2026-11-18, the same pro_catalog_matches
//      already-registered-with-SESAC exclusion via sesac-export.js's
//      excludeAlreadyRegistered(), so this preview's counts match what a
//      real export would actually produce) -- NOT lot-scoped, since this is
//      about finding real examples to eyeball, not simulating one specific
//      lot's auto-close.
//   3. Builds the SESAC rows for up to MAX_TITLES of those real titles using
//      the real ebrBuildRow() + sesac-export.js code (the exact same
//      functions runLotAutoExport() calls), and prints:
//        - how many pure-SESAC titles exist catalog-wide
//        - the first MAX_TITLES, with their writers
//        - the SESAC output rows that would be generated for them
//        - any validation warnings from sesac-export.js
//   4. Writes those rows to a LOCAL PREVIEW FILE ONLY, under
//      ./_sesac_dryrun_output/ (gitignored-pattern name, not the real "EBR
//      Exports" folder, not ebr_export_log) -- open this in Excel/Numbers
//      side-by-side with the real "SESAC Bulk Song Recordings Template.xlsx"
//      and eyeball every column, especially the ones sesac-export.js's
//      2026-11-18 fix commit touched: PUBLIC DOMAIN (must read Yes/No),
//      WRITER IPI # / PUBLISHER IPI # (must be 11 digits, check padding on
//      any IPI shorter than 11 digits in your real data), WRITER TYPE
//      (Composer/Author), PUBLISHER TYPE (Original Publisher), SONG # (must
//      be blank), ISWC # (must be exactly 11 characters if present).
//
// This script NEVER calls runLotAutoExport() and NEVER touches
// ebr_export_log or ebr_acknowledgments -- it only SELECTs. The one
// optional step that writes anything real is --live-lot, below.
//
// Usage (from Erik's own terminal -- this cloud session cannot reach Neon,
// same structural network block as every other live-DB script in this
// project):
//   node verify-sesac-export-live.js                 # read-only survey + local preview file
//   node verify-sesac-export-live.js --max 20         # look at more than the default 5 examples
//   node verify-sesac-export-live.js --live-lot 1234  # see "Optional: a real end-to-end run" below

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { ebrBuildRow, EBR_HEADERS } = require('./ebr-lot-export.js');
const sesacExport = require('./sesac-export.js');

const args = process.argv.slice(2);
const maxIdx = args.indexOf('--max');
const MAX_TITLES = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) || 5 : 5;
const liveLotIdx = args.indexOf('--live-lot');
const LIVE_LOT_ID = liveLotIdx !== -1 ? parseInt(args[liveLotIdx + 1], 10) : null;

const SPLIT_TOLERANCE_PCT = 0.5; // same tolerance ebr-lot-export.js uses

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 30000,
  statement_timeout: 20000,
  query_timeout: 25000,
});
pool.on('error', (err) => console.error('[pool] error (handled):', err.message));

async function findPureSesacTitles() {
  // Mirrors runLotAutoExport()'s eligibility query/filters exactly, minus
  // the lot_titles join (this is a catalog-wide survey, not one lot).
  const { rows: titleRows } = await pool.query(
    `SELECT t.sku_root, t.title, t.team_id, t.is_jup, tm.composer_prefix, ack.status AS ack_status
     FROM titles t
     LEFT JOIN teams tm ON tm.team_id = t.team_id
     LEFT JOIN LATERAL (
       SELECT status FROM ebr_acknowledgments a2
        WHERE a2.sku_root = t.sku_root
        ORDER BY a2.imported_at DESC LIMIT 1
     ) ack ON TRUE
     WHERE COALESCE(t.status,'active') = 'active'
       AND COALESCE(t.description,'') NOT ILIKE '%SOLD TO A&E%'
     ORDER BY t.title ASC`
  );

  const teamIds = [...new Set(titleRows.map(t => t.team_id).filter(Boolean))];
  const { rows: writersRaw } = teamIds.length
    ? await pool.query(`SELECT id, team_id, writer_name, pro, split_pct, ipi FROM team_writers WHERE team_id = ANY($1::varchar[]) ORDER BY team_id, id`, [teamIds])
    : { rows: [] };

  const writersByTeam = {};
  const { ebrSplitName } = require('./ebr-shared.js');
  writersRaw.forEach(w => {
    if (!writersByTeam[w.team_id]) writersByTeam[w.team_id] = [];
    const { first, last } = ebrSplitName(w.writer_name);
    writersByTeam[w.team_id].push({ ...w, first, last });
  });

  const pureSesac = [];
  titleRows.forEach(t => {
    const w = writersByTeam[t.team_id] || [];
    const splitSum = w.slice(0, 10).reduce((s, x) => s + parseFloat(x.split_pct || 0), 0);
    const badSplit = w.length > 0 && Math.abs(splitSum - 100) > SPLIT_TOLERANCE_PCT;
    const allSesac = w.length > 0 && w.every(x => x.pro === 'SESAC');
    if (t.ack_status === 'RA') return;
    if (t.is_jup) return;
    if (/x/i.test(t.composer_prefix || '')) return;
    if (!w.length) return;
    if (badSplit) return;
    if (allSesac) pureSesac.push({ title: t, writers: w });
  });

  // Same already-registered-with-SESAC exclusion runLotAutoExport() applies
  // (see sesac-export.js's excludeAlreadyRegistered() header comment) -- so
  // this script's counts mean the same thing as a real export's would.
  const { eligible, skipped: registeredSkipped } = await sesacExport.excludeAlreadyRegistered(
    pool, pureSesac.map(p => p.title.sku_root)
  );
  const eligibleSet = new Set(eligible);
  const eligiblePureSesac = pureSesac.filter(p => eligibleSet.has(p.title.sku_root));
  return { all: pureSesac, eligible: eligiblePureSesac, excluded: registeredSkipped };
}

async function main() {
  console.log('=== SESAC export dry run (read-only survey) ===');
  console.log(`DB: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@') : '(DATABASE_URL not set!)'}`);

  const { all: pureSesacAll, eligible: pureSesac, excluded } = await findPureSesacTitles();
  console.log(`\nPure-SESAC titles found catalog-wide (every writer SESAC, eligible otherwise): ${pureSesacAll.length}`);
  if (excluded.length) {
    console.log(`Of those, ${excluded.length} are already on file with SESAC per the pro_catalog_matches snapshot (or ambiguous) -- excluded from export, see sesac-export.js's excludeAlreadyRegistered().`);
  }
  console.log(`Eligible for a real SESAC export today: ${pureSesac.length}`);

  if (!pureSesac.length) {
    console.log('Nothing to preview -- either no title in the catalog today is 100% SESAC-written and otherwise eligible, or every such title is already on file with SESAC per the snapshot.');
    console.log('(Mixed-PRO titles with SOME SESAC writers are NOT in this list on purpose -- those already go through normal EBR, see the 2026-10-28 decision in ebr-lot-export.js\'s header comment.)');
    await pool.end();
    return;
  }

  const sample = pureSesac.slice(0, MAX_TITLES);
  console.log(`\nShowing first ${sample.length} of ${pureSesac.length} eligible:\n`);
  const wideRows = [];
  for (const { title, writers } of sample) {
    console.log(`- ${title.sku_root}  "${title.title}"  writers: ${writers.map(w => `${w.first} ${w.last} (IPI ${w.ipi || 'none on file'}, ${w.split_pct}%)`).join('; ')}`);
    const writersByTeam = { [title.team_id]: writers };
    wideRows.push(ebrBuildRow(title, writersByTeam, {}));
  }

  const { rows: sesacRows, warnings } = sesacExport.buildSesacExport(EBR_HEADERS, wideRows);
  console.log(`\nSESAC output rows generated: ${sesacRows.length} (one per writer, ${sample.length} titles)`);
  if (warnings.length) {
    console.log('\n*** VALIDATION WARNINGS -- review before trusting this sample ***');
    warnings.forEach(w => console.log('  - ' + w));
  } else {
    console.log('No validation warnings (writer shares sum to 50.00 per title, none exceed the 50% cap).');
  }

  const outDir = path.join(__dirname, '_sesac_dryrun_output');
  const outPath = path.join(outDir, `SESAC_dryrun_preview_${new Date().toISOString().slice(0, 10)}.xlsx`);
  sesacExport.writeSesacFile(sesacRows, outPath);
  console.log(`\nLocal preview file written: ${outPath}`);
  console.log('Open this side-by-side with the real "SESAC Bulk Song Recordings Template.xlsx" and eyeball every column.');
  console.log('This file was NOT written to the real EBR Exports folder and NOTHING was written to ebr_export_log -- fully safe, nothing to undo.');

  if (LIVE_LOT_ID) {
    console.log(`\n=== --live-lot ${LIVE_LOT_ID}: running the REAL runLotAutoExport() against this lot ===`);
    console.log('This WILL write a real file to the configured EBR Exports folder and a real row to ebr_export_log if the lot has anything eligible.');
    console.log('Only proceed if you specifically want to test the full end-to-end path against one real lot.');
    const ebrLotExport = require('./ebr-lot-export.js');
    const { rows: lotRows } = await pool.query('SELECT lot_name FROM lots WHERE lot_id = $1', [LIVE_LOT_ID]);
    if (!lotRows.length) {
      console.log(`Lot ${LIVE_LOT_ID} not found -- aborting, nothing written.`);
    } else {
      const outDirReal = process.env.EBR_DRYRUN_OUTDIR || outDir; // defaults to the SAME safe preview folder unless Erik explicitly points this at the real EBR Exports path via env var
      const result = await ebrLotExport.runLotAutoExport(pool, {
        lotId: LIVE_LOT_ID,
        lotName: lotRows[0].lot_name,
        outDir: outDirReal,
        senderCode: 'H03',
      });
      console.log(JSON.stringify(result, null, 2));
      console.log(`\n(Wrote into: ${outDirReal} -- set EBR_DRYRUN_OUTDIR to the real "EBR Exports" path only once you're ready to treat this as a real submission file.)`);
    }
  }

  await pool.end();
}

main().catch(e => {
  console.error('FAILED:', e);
  process.exit(1);
});
