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

const SPLIT_TOLERANCE_PCT = 0.5;
const EBR_SEQ_LOCK_KEY = 771983501;

const HAUS_PUBLISHERS = {
  'ASCAP': { name: 'HAUS Collection Musik', pro: 'ASCAP', ipi: '770983501' },
  'BMI':   { name: 'SDNYC Music',           pro: 'BMI',   ipi: '554507939' },
  'SESAC': { name: 'SDBK Music',            pro: 'SESAC', ipi: '555590134' },
};

const EBR_HEADERS = [
  "Work Title",
  "Submitter Work ID",
  "ISWC",
  "ISRC",
  "Work Title Duration (HHMMSS)",
  "Alt Title 1",
  "Alt Title 2",
  "Alt Title 3",
  "Alt Title 4",
  "Alt Title 5",
  "Alt Title 6",
  "Alt Title 7",
  "Alt Title 8",
  "Alt Title 9",
  "Alt Title 10",
  "Artist LN 1",
  "Artist FN 1",
  "Artist LN 2",
  "Artist FN 2",
  "Artist LN 3",
  "Artist FN 3",
  "Artist LN 4",
  "Artist FN 4",
  "Artist LN 5",
  "Artist FN 5",
  "Artist LN 6",
  "Artist FN 6",
  "Artist LN 7",
  "Artist FN 7",
  "Artist LN 8",
  "Artist FN 8",
  "Artist LN 9",
  "Artist FN 9",
  "Artist LN 10",
  "Artist FN 10",
  "Intended Purpose",
  "Production Title",
  "Library",
  "CD Identifier",
  "Work Title CD Cut#",
  "Arrangement of PD Work (Y/N)",
  "Original PD Title",
  "Original PD Writer LN 1",
  "Original PD Writer FN 1",
  "Original PD Writer LN 2",
  "Original PD Writer FN 2",
  "Writer LN 1",
  "Writer FN 1",
  "Writer Role Code 1",
  "Writer PR Affiliation 1",
  "Writer Share 1",
  "Writer Internal ID 1",
  "Writer IPI Name# 1",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 1",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 1",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 1",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 1",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 1",
  "Writer LN 2",
  "Writer FN 2",
  "Writer Role Code 2",
  "Writer PR Affiliation 2",
  "Writer Share 2",
  "Writer Internal ID 2",
  "Writer IPI Name# 2",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 2",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 2",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 2",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 2",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 2",
  "Writer LN 3",
  "Writer FN 3",
  "Writer Role Code 3",
  "Writer PR Affiliation 3",
  "Writer Share 3",
  "Writer Internal ID 3",
  "Writer IPI Name# 3",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 3",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 3",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 3",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 3",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 3",
  "Writer LN 4",
  "Writer FN 4",
  "Writer Role Code 4",
  "Writer PR Affiliation 4",
  "Writer Share 4",
  "Writer Internal ID 4",
  "Writer IPI Name# 4",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 4",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 4",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 4",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 4",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 4",
  "Writer LN 5",
  "Writer FN 5",
  "Writer Role Code 5",
  "Writer PR Affiliation 5",
  "Writer Share 5",
  "Writer Internal ID 5",
  "Writer IPI Name# 5",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 5",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 5",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 5",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 5",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 5",
  "Writer LN 6",
  "Writer FN 6",
  "Writer Role Code 6",
  "Writer PR Affiliation 6",
  "Writer Share 6",
  "Writer Internal ID 6",
  "Writer IPI Name# 6",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 6",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 6",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 6",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 6",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 6",
  "Writer LN 7",
  "Writer FN 7",
  "Writer Role Code 7",
  "Writer PR Affiliation 7",
  "Writer Share 7",
  "Writer Internal ID 7",
  "Writer IPI Name# 7",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 7",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 7",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 7",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 7",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 7",
  "Writer LN 8",
  "Writer FN 8",
  "Writer Role Code 8",
  "Writer PR Affiliation 8",
  "Writer Share 8",
  "Writer Internal ID 8",
  "Writer IPI Name# 8",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 8",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 8",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 8",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 8",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 8",
  "Writer LN 9",
  "Writer FN 9",
  "Writer Role Code 9",
  "Writer PR Affiliation 9",
  "Writer Share 9",
  "Writer Internal ID 9",
  "Writer IPI Name# 9",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 9",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 9",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 9",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 9",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 9",
  "Writer LN 10",
  "Writer FN 10",
  "Writer Role Code 10",
  "Writer PR Affiliation 10",
  "Writer Share 10",
  "Writer Internal ID 10",
  "Writer IPI Name# 10",
  "1st Controlled Pub IPI Name# or Internal ID for Writer 10",
  "2nd Controlled Pub IPI Name# or Internal ID for Writer 10",
  "3rd Controlled Pub IPI Name# or Internal ID for Writer 10",
  "4th Controlled Pub IPI Name# or Internal ID for Writer 10",
  "5th Controlled Pub IPI Name# or Internal ID for Writer 10",
  "Original Pub Name 1",
  "Original Pub PR Affiliation 1",
  "Original Pub World Own Share 1",
  "Original Pub IPI Name# 1",
  "Original Pub Controlled (Y/N) 1",
  "Original Pub Name 2",
  "Original Pub PR Affiliation 2",
  "Original Pub World Own Share 2",
  "Original Pub Internal ID 2",
  "Original Pub IPI Name# 2",
  "Original Pub Controlled (Y/N) 2",
  "Original Pub Name 3",
  "Original Pub PR Affiliation 3",
  "Original Pub World Own Share 3",
  "Original Pub Internal ID 3",
  "Original Pub IPI Name# 3",
  "Original Pub Controlled (Y/N) 3",
  "Original Pub Name 4",
  "Original Pub PR Affiliation 4",
  "Original Pub World Own Share 4",
  "Original Pub Internal ID 4",
  "Original Pub IPI Name# 4",
  "Original Pub Controlled (Y/N) 4",
  "1st AM/Sub Pub Name 1",
  "3rd AM/Sub Pub Name 1",
  "3rd AM/Sub Pub Role Code 1",
  "3rd AM/Sub Pub PR Affiliation 1",
  "3rd AM/Sub Pub Territory Code 1",
  "3rd AM/Sub Pub Collect Share 1",
  "3rd AM/Sub Pub Internal ID 1",
  "3rd AM/Sub Pub IPI Name# 1",
  "4th AM/Sub Pub Name 1",
  "4th AM/Sub Pub Role Code 1",
  "4th AM/Sub Pub PR Affiliation 1",
  "4th AM/Sub Pub Territory Code 1",
  "4th AM/Sub Pub Collect Share 1",
  "4th AM/Sub Pub Internal ID 1",
  "4th AM/Sub Pub IPI Name# 1",
  "5th AM/Sub Pub Name 1",
  "5th AM/Sub Pub Role Code 1",
  "5th AM/Sub Pub PR Affiliation 1",
  "5th AM/Sub Pub Territory Code 1",
  "5th AM/Sub Pub Collect Share 1",
  "5th AM/Sub Pub Internal ID 1",
  "5th AM/Sub Pub IPI Name# 1",
  "6th AM/Sub Pub Name 1",
  "6th AM/Sub Pub Role Code 1",
  "6th AM/Sub Pub PR Affiliation 1",
  "6th AM/Sub Pub Territory Code 1",
  "6th AM/Sub Pub Collect Share 1",
  "6th AM/Sub Pub Internal ID 1",
  "6th AM/Sub Pub IPI Name# 1"
];
const EBR_COL_INDEX = Object.fromEntries(EBR_HEADERS.map((h, i) => [h, i]));
const EBR_MAX_ORIGINAL_PUBS = 4;

function ebrSplitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}
function ebrPublisherFor(pro) {
  const key = pro === 'BMI' ? 'BMI' : (pro === 'SESAC' ? 'SESAC' : 'ASCAP');
  return HAUS_PUBLISHERS[key] || HAUS_PUBLISHERS['ASCAP'];
}
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
      AND ae.sku_root IS NULL
      AND ($1::boolean OR ack.status IS DISTINCT FROM 'RA')
    GROUP BY t.sku_root, t.title, t.team_id, t.created_at
    HAVING count(tw.id) > 0 AND NOT bool_or(tw.pro = 'SESAC')
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

  const rows = finalEligible.map(t => ebrBuildRow(t, writersByTeam, stemsBySku));

  console.log('\nSample of first 3 rows (Work Title / Submitter Work ID / writer count):');
  console.log(finalEligible.slice(0, 3).map(t => ({ title: t.title, sku_root: t.sku_root, writers: (writersByTeam[t.team_id] || []).length })));

  if (!LIVE) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const { rows: seqPeek } = await pool.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`);
    const seq = seqPeek.length ? seqPeek[0].next : 1;
    const nnnn = String(seq).padStart(4, '0');
    const fileName = `EB${yy}${nnnn}${SENDER_CODE}_707.xlsx`;
    console.log(`\nWould write: ${fileName} (sequence ${seq} as of right now -- may shift by the time a live run actually claims it), ${rows.length} works.`);
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

    await client.query(
      `INSERT INTO ebr_export_log (sequence_num, file_name, title_count, sku_list) VALUES ($1,$2,$3,$4)`,
      [seq, fileName, finalEligible.length, finalEligible.map(t => t.sku_root).join(',')]
    );
    await client.query('COMMIT');
    console.log('Logged to ebr_export_log: sequence', seq, ', title_count', finalEligible.length, '(committed under advisory lock)');
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
