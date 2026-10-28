// Read-only verification: runs cue-sheet-import.js's real parser + matcher
// against the real cue sheet corpus in ~/Documents/HAUS CUE SHEETS, using the
// LIVE titles/deal_publishers catalog from Postgres (same queries api.js's
// /api/cue-sheets/import route uses). No writes anywhere -- SELECT only,
// nothing inserted into cue_sheets/cue_sheet_cues, no files touched.
//
// Usage (from the real ATMOSPHERE checkout, per standing_rules.md):
//   node verify-cue-sheets-corpus.js "/Users/kyle/Documents/HAUS CUE SHEETS"
//
// Requires DATABASE_URL in .env (same as generate-ebr-export.js and friends).
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const {
  parseCueSheetFile,
  matchCueToTitles,
  normTitle,
  titleToCamelKey,
} = require('./cue-sheet-import.js');

const ROOT = process.argv[2];
if (!ROOT) {
  console.error('Usage: node verify-cue-sheets-corpus.js "<path to HAUS CUE SHEETS folder>"');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 30000,
  statement_timeout: 20000,
  query_timeout: 25000,
});
pool.on('error', (err) => console.error('[pool] error (handled):', err.message));

const FILE_EXTS = new Set(['.xlsx', '.csv']);
// Same exclusions as the 2026-10-28 cue-sheet dry run: scratch/dev folders,
// and AP31-prefixed cues (confirmed sold to A&E, out of scope here).
const SKIP_DIRS = new Set(['_cue_parser_poc', '_wt_cue_sheets']);
const isAp31Cue = (c) =>
  /^AP31/i.test(c.titleRaw || '') || /^AP31/i.test(c.filenameCamelKey || '');

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    out.push({ dirError: dir, error: String(e) });
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (FILE_EXTS.has(path.extname(e.name).toLowerCase())) {
      out.push(full);
    }
  }
}

(async () => {
  console.log('Loading real catalog from Postgres (SELECT only, no writes)...');
  const dealPubRows = await pool.query(`SELECT DISTINCT publisher_name FROM deal_publishers`);
  const hausPublisherNames = new Set(
    dealPubRows.rows.map((r) => (r.publisher_name || '').trim().toLowerCase())
  );
  const titlesRes = await pool.query(`SELECT sku_root, title, team_id FROM titles`);
  const titlesIndex = titlesRes.rows.map((t) => ({
    ...t,
    normTitle: normTitle(t.title),
    camelKey: titleToCamelKey(t.title),
  }));
  console.log(
    `Loaded ${titlesIndex.length} catalog titles, ${hausPublisherNames.size} known HAUS/deal publisher names.`
  );
  await pool.end();

  const files = [];
  walk(ROOT, files);
  console.log(`Scanning ${files.length} cue sheet files under "${ROOT}"...`);

  const byFormat = {};
  let totalFiles = 0, unknownFiles = 0, errorFiles = 0;
  let totalCues = 0, ap31Cues = 0, nonHausCues = 0, hausCues = 0;
  let matched = 0, ambiguous = 0, unmatched = 0;
  let matchedViaTitle = 0, matchedViaFilenameKey = 0;
  const ambiguousExamples = [];
  const unmatchedExamples = [];
  const errorFileList = [];

  for (const f of files) {
    if (f.dirError) { errorFiles++; errorFileList.push(`${f.dirError} :: ${f.error}`); continue; }
    totalFiles++;
    let parsed;
    try {
      parsed = parseCueSheetFile(f, path.basename(f));
    } catch (e) {
      errorFiles++;
      errorFileList.push(`${path.relative(ROOT, f)} :: ${e.message}`);
      continue;
    }
    byFormat[parsed.format] = (byFormat[parsed.format] || 0) + 1;
    if (parsed.format === 'UNKNOWN') { unknownFiles++; continue; }

    for (const cue of parsed.cues) {
      totalCues++;
      if (isAp31Cue(cue)) { ap31Cues++; continue; }
      if (!cue.isHaus) { nonHausCues++; continue; }
      hausCues++;

      const m = matchCueToTitles(cue, titlesIndex);
      if (m.status === 'matched') {
        matched++;
        if (m.confidence === 'exact') matchedViaTitle++;
        else matchedViaFilenameKey++;
      } else if (m.status === 'ambiguous') {
        ambiguous++;
        if (ambiguousExamples.length < 25) {
          ambiguousExamples.push({
            file: path.relative(ROOT, f),
            titleRaw: cue.titleRaw,
            candidates: m.candidates.map((c) => c.sku_root + ' / ' + c.title),
          });
        }
      } else {
        unmatched++;
        if (unmatchedExamples.length < 40) {
          unmatchedExamples.push({
            file: path.relative(ROOT, f),
            titleRaw: cue.titleRaw,
            filenameCamelKey: cue.filenameCamelKey,
          });
        }
      }
    }
  }

  console.log('\n=== FILE-LEVEL SUMMARY ===');
  console.log('Total files scanned:', totalFiles);
  console.log('Unrecognized (UNKNOWN) files:', unknownFiles);
  console.log('Files that errored:', errorFiles);
  console.log('By format:', JSON.stringify(byFormat, null, 2));
  if (errorFileList.length) {
    console.log('\nError files:');
    errorFileList.forEach((e) => console.log(' -', e));
  }

  console.log('\n=== CUE-LEVEL SUMMARY ===');
  console.log('Total cues parsed:', totalCues);
  console.log('  AP31 (excluded, A&E-sold):', ap31Cues);
  console.log('  Other publishers (excluded, not HAUS):', nonHausCues);
  console.log('  HAUS-own cues:', hausCues);
  console.log('\nOf HAUS-own cues, matched against the REAL live catalog:');
  console.log('  Matched:', matched, matched && hausCues ? `(${(100 * matched / hausCues).toFixed(1)}%)` : '');
  console.log('    - via exact title match:', matchedViaTitle);
  console.log('    - via filename-key fallback:', matchedViaFilenameKey);
  console.log('  Ambiguous (multiple catalog titles matched):', ambiguous);
  console.log('  Unmatched:', unmatched, unmatched && hausCues ? `(${(100 * unmatched / hausCues).toFixed(1)}%)` : '');

  console.log('\n=== AMBIGUOUS MATCH EXAMPLES (data integrity risk -- same title, multiple sku_roots) ===');
  ambiguousExamples.forEach((e) => console.log(JSON.stringify(e)));

  console.log('\n=== SAMPLE UNMATCHED HAUS CUES (first 40) ===');
  unmatchedExamples.forEach((e) => console.log(JSON.stringify(e)));

  fs.writeFileSync(
    path.join(__dirname, 'cue-sheet-verification-result-' + new Date().toISOString().slice(0, 10) + '.json'),
    JSON.stringify(
      { byFormat, totalFiles, unknownFiles, errorFiles, totalCues, ap31Cues, nonHausCues, hausCues,
        matched, matchedViaTitle, matchedViaFilenameKey, ambiguous, unmatched,
        ambiguousExamples, unmatchedExamples },
      null, 2
    )
  );
  console.log('\nFull result JSON written alongside this script.');
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
