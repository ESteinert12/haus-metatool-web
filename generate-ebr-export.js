require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  max: 5,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 0,
  statement_timeout: 20000,
  query_timeout: 25000,
});
pool.on('error', (err) => console.error('[pool] error (handled):', err.message));

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const INCLUDE_ACCEPTED = args.includes('--include-accepted');
const INCLUDE_BAD_SPLITS = args.includes('--include-bad-splits');
const excludeFileArg = args.find(a => a.startsWith('--exclude-file='));
const EXCLUDE_SKUS = new Set();
if (excludeFileArg) {
  const excludePath = excludeFileArg.split('=')[1];
  const lines = fs.readFileSync(excludePath, 'utf8').split('\n').slice(1).filter(Boolean);
  for (const line of lines) {
    const first = line.split(',')[0].replace(/^"|"$/g, '').trim();
    if (first) EXCLUDE_SKUS.add(first);
  }
}
const senderArg = args.find(a => a.startsWith('--sender='));
const SENDER_CODE = (senderArg ? senderArg.split('=')[1] : 'H03').trim().toUpperCase().slice(0, 3);
const outArg = args.find(a => a.startsWith('--out='));
const OUT_DIR = outArg ? outArg.split('=')[1] : __dirname;
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : null;
if (batchSizeArg && (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE <= 0)) {
  console.error(`Invalid --batch-size value: ${batchSizeArg.split('=')[1]}`);
  process.exit(1);
}

const SPLIT_TOLERANCE_PCT = 0.5;
const EBR_SEQ_LOCK_KEY = 771983501;
const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Shared across index.html / generate-ebr-export.js / ebr-lot-export.js --
// see ebr-shared.js for why this used to be three hand-synced copies.
const { HAUS_PUBLISHERS, EBR_HEADERS, EBR_COL_INDEX, EBR_MAX_ORIGINAL_PUBS, ebrSplitName, ebrPublisherFor } = require('./ebr-shared.js')
function ebrBuildRow(title, writersByTeam, stemsBySku) {
  const row = new Array(EBR_HEADERS.length).fill('');
  const col = (name) => EBR_COL_INDEX[name];
  const set = (name, val) => { const i = col(name); if (i !== undefined) row[i] = val; };

  set('Work Title', title.title || '');
  set('Submitter Work ID', title.sku_root || '');
  set('Arrangement of PD Work (Y/N)', 'No');

  const stems = (stemsBySku[title.sku_root] || [])
    .filter(s => (s.stem_name || '').toUpperCase() !== 'FULL')
    .slice(0, 10);
  stems.forEach((s, i) => {
    const base = (s.filename || '').replace(/\.[^.]+$/, '');
    set(`Alt Title ${i + 1}`, base);
  });

  const writers = writersByTeam[title.team_id] || [];
  writers.slice(0, 10).forEach((w, i) => {
    const n = i + 1;
    const pub = ebrPublisherFor(w.pro);
    set(`Writer LN ${n}`, w.last || '');
    set(`Writer FN ${n}`, w.first || '');
    set(`Writer Role Code ${n}`, 'C');
    set(`Writer PR Affiliation ${n}`, w.pro || '');
    set(`Writer Share ${n}`, w.split_pct != null ? w.split_pct : '');
    set(`Writer Internal ID ${n}`, w.id != null ? String(w.id) : '');
    set(`Writer IPI Name# ${n}`, w.ipi || '');
    set(`1st Controlled Pub IPI Name# or Internal ID for Writer ${n}`, pub.ipi);

    if (n <= EBR_MAX_ORIGINAL_PUBS) {
      set(`Original Pub Name ${n}`, pub.name);
      set(`Original Pub PR Affiliation ${n}`, pub.pro);
      set(`Original Pub World Own Share ${n}`, w.split_pct != null ? (w.split_pct / 2) : '');
      set(`Original Pub IPI Name# ${n}`, pub.ipi);
      set(`Original Pub Controlled (Y/N) ${n}`, 'YES');
    }
  });

  return row;
}

async function ensureEbrExportLogTable(queryable) {
  await queryable.query(`CREATE TABLE IF NOT EXISTS ebr_export_log (
    id            SERIAL PRIMARY KEY,
    sequence_num  INTEGER NOT NULL,
    file_name     TEXT,
    title_count   INTEGER,
    sku_list      TEXT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
}

async function run() {
  console.log(LIVE ? '*** LIVE RUN -- will write a file and log to ebr_export_log ***' : 'Dry run (pass --live to actually write the export file)');
  if (INCLUDE_ACCEPTED) console.log('(--include-accepted: titles already acknowledged RA will NOT be excluded)');
  if (INCLUDE_BAD_SPLITS) console.log('(--include-bad-splits: titles with writer splits not summing to ~100% will NOT be held out)');

  await ensureEbrExportLogTable(pool);

  console.log('Loading EBR-eligible titles from the registration gap...');
  let { rows: eligible } = await pool.query(`
    WITH gap AS (
      SELECT sku_root
      FROM pro_catalog_matches
      WHERE pro_name IN ('ASCAP','BMI','SESAC')
      GROUP BY sku_root
      HAVING NOT bool_or(match_status = 'matched')
    ),
    already_exported AS (
      SELECT DISTINCT trim(exported_sku) AS sku_root
      FROM ebr_export_log el, unnest(string_to_array(el.sku_list, ',')) AS exported_sku
    ),
    latest_ack AS (
      SELECT DISTINCT ON (sku_root) sku_root, status
      FROM ebr_acknowledgments
      ORDER BY sku_root, imported_at DESC
    )
    SELECT t.sku_root, t.title, t.team_id, t.created_at
    FROM titles t
    JOIN gap g ON g.sku_root = t.sku_root
    JOIN team_writers tw ON tw.team_id = t.team_id
    LEFT JOIN already_exported ae ON ae.sku_root = t.sku_root
    LEFT JOIN latest_ack ack ON ack.sku_root = t.sku_root
    WHERE COALESCE(t.status,'active') = 'active'
      AND COALESCE(t.is_jup,false)    = false
      AND COALESCE(t.description,'') NOT ILIKE '%SOLD TO A&E%'
      AND ae.sku_root IS NULL
      AND ($1::boolean OR ack.status IS DISTINCT FROM 'RA')
    GROUP BY t.sku_root, t.title, t.team_id, t.created_at
    HAVING count(tw.id) > 0 AND bool_or(tw.pro IS DISTINCT FROM 'SESAC')  -- exclude only if EVERY writer is SESAC (pure-SESAC title, not an EBR/joint ASCAP-BMI work); a mixed SESAC+ASCAP/BMI title is eligible, SESAC writer included in the row
    ORDER BY t.title ASC
  `, [INCLUDE_ACCEPTED]);
  console.log('EBR-eligible titles (after ebr_acknowledgments + ebr_export_log exclusion):', eligible.length);

  let eligibleAfterExclude = eligible;
  if (EXCLUDE_SKUS.size) {
    eligibleAfterExclude = eligible.filter(t => !EXCLUDE_SKUS.has(t.sku_root));
    console.log(`--exclude-file: excluded ${eligible.length - eligibleAfterExclude.length} of ${EXCLUDE_SKUS.size} listed sku_roots that were in the eligible set (rest weren't eligible anyway).`);
  }
  eligible = eligibleAfterExclude;

  if (!eligible.length) { console.log('Nothing to export.'); await pool.end(); return; }

  const teamIds = [...new Set(eligible.map(t => t.team_id).filter(Boolean))];
  const skuRoots = eligible.map(t => t.sku_root);

  const { rows: writerRows } = await pool.query(
    `SELECT id, team_id, writer_name, pro, split_pct, ipi FROM team_writers WHERE team_id = ANY($1::varchar[]) ORDER BY team_id, id`,
    [teamIds]
  );
  const { rows: stemRows } = await pool.query(
    `SELECT sku_root, stem_name, filename FROM mix_stems WHERE sku_root = ANY($1::varchar[]) ORDER BY sku_root, filename`,
    [skuRoots]
  );

  const writersByTeam = {};
  writerRows.forEach(w => {
    if (!writersByTeam[w.team_id]) writersByTeam[w.team_id] = [];
    const { first, last } = ebrSplitName(w.writer_name);
    writersByTeam[w.team_id].push({ ...w, first, last });
  });
  const stemsBySku = {};
  stemRows.forEach(s => {
    if (!stemsBySku[s.sku_root]) stemsBySku[s.sku_root] = [];
    stemsBySku[s.sku_root].push(s);
  });

  const overCap = eligible.filter(t => (writersByTeam[t.team_id] || []).length > EBR_MAX_ORIGINAL_PUBS);
  if (overCap.length) {
    console.log(`\nWARNING: ${overCap.length} titles have more than ${EBR_MAX_ORIGINAL_PUBS} writers on file -- this template only carries publisher info for the first ${EBR_MAX_ORIGINAL_PUBS}. Included anyway (same as the in-app behavior), but review manually:`);
    console.log(overCap.slice(0, 10).map(t => ({ sku_root: t.sku_root, title: t.title, writer_count: (writersByTeam[t.team_id] || []).length })));
  }

  const badSplits = [];
  const goodEligible = [];
  for (const t of eligible) {
    const writers = (writersByTeam[t.team_id] || []).slice(0, 10);
    const sum = writers.reduce((acc, w) => acc + (typeof w.split_pct === 'number' ? w.split_pct : parseFloat(w.split_pct) || 0), 0);
    const missingIpi = writers.filter(w => !w.ipi).length;
    if (missingIpi) {
      console.log(`  NOTE: ${t.sku_root} "${t.title}" has ${missingIpi}/${writers.length} writer(s) with no IPI on file (included; MusicMark may still accept without it).`);
    }
    if (Math.abs(sum - 100) > SPLIT_TOLERANCE_PCT) {
      badSplits.push({ sku_root: t.sku_root, title: t.title, writer_count: writers.length, split_sum: sum });
      if (INCLUDE_BAD_SPLITS) goodEligible.push(t);
    } else {
      goodEligible.push(t);
    }
  }
  if (badSplits.length) {
    console.log(`\nWARNING: ${badSplits.length} titles have writer splits that do NOT sum to 100% (+/- ${SPLIT_TOLERANCE_PCT}%). ${INCLUDE_BAD_SPLITS ? 'Included anyway (--include-bad-splits).' : 'HELD OUT of this export -- rerun with --include-bad-splits to include them, or fix the splits first.'}`);
    console.log(badSplits.slice(0, 15));
    const csvEsc = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const reviewCsv = 'sku_root,title,writer_count,split_sum\n' + badSplits.map(r => [r.sku_root, r.title, r.writer_count, r.split_sum].map(csvEsc).join(',')).join('\n') + '\n';
    fs.writeFileSync(path.join(OUT_DIR, 'ebr-flagged-bad-splits.csv'), reviewCsv);
    console.log(`Wrote ebr-flagged-bad-splits.csv (${badSplits.length} rows) for manual review.`);
  }

  const finalEligible = goodEligible;
  console.log(`\nFinal export population: ${finalEligible.length} titles (of ${eligible.length} otherwise-eligible).`);
  if (!finalEligible.length) { console.log('Nothing left to export after quality checks.'); await pool.end(); return; }

  let batchEligible = finalEligible;
  if (BATCH_SIZE && finalEligible.length > BATCH_SIZE) {
    batchEligible = finalEligible.slice(0, BATCH_SIZE);
    console.log(`--batch-size=${BATCH_SIZE}: this run will export the first ${batchEligible.length} of ${finalEligible.length} remaining eligible titles (same title-ASC order as the full query). ${finalEligible.length - batchEligible.length} will remain for the next run -- each --live run excludes whatever is already in ebr_export_log, so rerunning the same command gets you the next batch.`);
  } else if (BATCH_SIZE) {
    console.log(`--batch-size=${BATCH_SIZE}: only ${finalEligible.length} eligible title(s) remain, so this is the last batch.`);
  }

  const rows = batchEligible.map(t => ebrBuildRow(t, writersByTeam, stemsBySku));

  console.log('\nSample of first 3 rows (Work Title / Submitter Work ID / writer count):');
  console.log(batchEligible.slice(0, 3).map(t => ({ title: t.title, sku_root: t.sku_root, writers: (writersByTeam[t.team_id] || []).length })));

  if (!LIVE) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const { rows: seqPeek } = await pool.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`);
    const seq = seqPeek.length ? seqPeek[0].next : 1;
    const nnnn = String(seq).padStart(4, '0');
    const fileName = `EB${yy}${nnnn}${SENDER_CODE}_707.xlsx`;
    console.log(`\nWould write: ${fileName} (sequence ${seq} as of right now -- may shift by the time a live run actually claims it), ${rows.length} works.`);
    if (BATCH_SIZE) {
      const reviewPath = path.join(OUT_DIR, fileName.replace(/\.xlsx$/, '-review.csv'));
      const reviewCsv = 'sku_root,title,writer_count\n' + batchEligible.map(t => [t.sku_root, t.title, (writersByTeam[t.team_id] || []).length].map(csvEscape).join(',')).join('\n') + '\n';
      fs.writeFileSync(reviewPath, reviewCsv);
      console.log(`Wrote ${path.basename(reviewPath)} (${batchEligible.length} rows) -- the exact titles in this batch, for eyeballing before --live. Note: sequence/filename are provisional for a dry run, so this review file's name may not match the one a --live run actually produces.`);
    }
    console.log('\nDry run only -- no file written, no ebr_export_log row inserted. Rerun with --live to actually generate the file.');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  let fileName, outPath, seq;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [EBR_SEQ_LOCK_KEY]);

    const { rows: seqRows } = await client.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`);
    seq = seqRows.length ? seqRows[0].next : 1;
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const nnnn = String(seq).padStart(4, '0');
    fileName = `EB${yy}${nnnn}${SENDER_CODE}_707.xlsx`;
    outPath = path.join(OUT_DIR, fileName);

    const ws = XLSX.utils.aoa_to_sheet([EBR_HEADERS, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    XLSX.writeFile(wb, outPath);
    console.log('Wrote', outPath);

    if (BATCH_SIZE) {
      const reviewPath = outPath.replace(/\.xlsx$/, '-review.csv');
      const reviewCsv = 'sku_root,title,writer_count\n' + batchEligible.map(t => [t.sku_root, t.title, (writersByTeam[t.team_id] || []).length].map(csvEscape).join(',')).join('\n') + '\n';
      fs.writeFileSync(reviewPath, reviewCsv);
      console.log('Wrote', reviewPath, `(${batchEligible.length} rows, matches this exact export file)`);
    }

    await client.query(
      `INSERT INTO ebr_export_log (sequence_num, file_name, title_count, sku_list) VALUES ($1,$2,$3,$4)`,
      [seq, fileName, batchEligible.length, batchEligible.map(t => t.sku_root).join(',')]
    );
    await client.query('COMMIT');
    console.log('Logged to ebr_export_log: sequence', seq, ', title_count', batchEligible.length, '(committed under advisory lock)');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (outPath && fs.existsSync(outPath)) {
      fs.unlinkSync(outPath);
      console.log(`Rolled back: removed ${outPath} since the ebr_export_log insert failed.`);
    }
    throw e;
  } finally {
    client.release();
  }

  console.log('\nIMPORTANT: eyeball this file against a previously accepted MusicMark submission (e.g. EB263700H03_707.xlsx) before actually submitting it -- the sheet name and exact xlsx formatting from the app\'s own Electron writeXlsx bridge were not independently verified here, only the column headers/row content.');

  await pool.end();
}

run().catch(e => { console.error('EBR EXPORT ERROR:', e.message); process.exit(1); });
