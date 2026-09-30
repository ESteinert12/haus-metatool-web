// ebr-lot-export.js
//
// Server-side EBR (MusicMark) export for a single lot, used when a
// track-limited lot auto-closes. Ported byte-for-byte (not re-derived) from
// index.html's HAUS_PUBLISHERS / EBR_HEADERS / ebrSplitName / ebrPublisherFor
// / ebrBuildRow -- those stay the source of truth for the manual "Export"
// and "Missing Registrations" tabs (which still write via the Electron
// writeXlsx bridge with a user-chosen save path, so they weren't moved
// here). Keep this file's copies in sync with index.html's if EBR_HEADERS
// or the row-building logic ever changes there -- see engineering_notes.md,
// 2026-09-30, for why this duplication exists rather than a shared module
// (that consolidation is a separate follow-up, not done here).
//
// Mirrors generate-ebr-export.js's Fix 3/Fix 4 pattern: the whole export
// (query -> filter -> build rows -> write xlsx -> log) runs inside one
// process here, so the sequence claim, the file write, and the log insert
// can share a single advisory-locked transaction -- something the old
// client-side ebrAutoRunForLot could not do, because its pgQ() only ever
// held a connection for the length of one HTTP request.

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EBR_SEQ_LOCK_KEY = 771983501; // same key generate-ebr-export.js uses
const SPLIT_TOLERANCE_PCT = 0.5;     // same tolerance as Fix 4 / the index.html port

const HAUS_PUBLISHERS = {
  'ASCAP': { name: 'HAUS Collection Musik', pro: 'ASCAP', ipi: '770983501' },
  'BMI':   { name: 'SDNYC Music',           pro: 'BMI',   ipi: '554507939' },
  'SESAC': { name: 'SDBK Music',            pro: 'SESAC', ipi: '555590134' },
}


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
]

const EBR_COL_INDEX = Object.fromEntries(EBR_HEADERS.map((h, i) => [h, i]))
const EBR_MAX_ORIGINAL_PUBS = 4

function ebrSplitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}


function ebrPublisherFor(pro) {
  const key = pro === 'BMI' ? 'BMI' : (pro === 'SESAC' ? 'SESAC' : 'ASCAP')
  return HAUS_PUBLISHERS[key] || HAUS_PUBLISHERS['ASCAP']
}


function ebrBuildRow(title, writersByTeam, stemsBySku) {
  // Unlike index.html's copy of this function (which defaults these params to
  // its own page-level `ebrState` global when omitted), this module has no
  // such global -- runLotAutoExport always passes both explicitly, so there
  // is no default here. Passing them in is required; omitting them is a bug.
  writersByTeam = writersByTeam || {}
  stemsBySku = stemsBySku || {}
  const row = new Array(EBR_HEADERS.length).fill('')
  const col = (name) => {
    const idx = EBR_COL_INDEX[name]
    if (idx === undefined) console.error(`[ebrBuildRow] unknown EBR column: ${name}`)
    return idx
  }
  const set = (name, val) => { const i = col(name); if (i !== undefined) row[i] = val }

  set('Work Title', title.title || '')
  set('Submitter Work ID', title.sku_root || '')
  set('Arrangement of PD Work (Y/N)', 'No')

  const stems = (stemsBySku[title.sku_root] || [])
    .filter(s => (s.stem_name || '').toUpperCase() !== 'FULL')
    .slice(0, 10)
  stems.forEach((s, i) => {
    const base = (s.filename || '').replace(/\.[^.]+$/, '')
    set(`Alt Title ${i + 1}`, base)
  })

  const writers = writersByTeam[title.team_id] || []
  writers.slice(0, 10).forEach((w, i) => {
    const n = i + 1
    const pub = ebrPublisherFor(w.pro)
    set(`Writer LN ${n}`, w.last || '')
    set(`Writer FN ${n}`, w.first || '')
    set(`Writer Role Code ${n}`, 'C')
    set(`Writer PR Affiliation ${n}`, w.pro || '')
    set(`Writer Share ${n}`, w.split_pct != null ? w.split_pct : '')
    set(`Writer IPI Name# ${n}`, w.ipi || '')
    set(`1st Controlled Pub IPI Name# or Internal ID for Writer ${n}`, pub.ipi)

    if (n <= EBR_MAX_ORIGINAL_PUBS) {
      set(`Original Pub Name ${n}`, pub.name)
      set(`Original Pub PR Affiliation ${n}`, pub.pro)
      set(`Original Pub World Own Share ${n}`, w.split_pct != null ? (w.split_pct / 2) : '')
      set(`Original Pub IPI Name# ${n}`, pub.ipi)
      set(`Original Pub Controlled (Y/N) ${n}`, 'YES')
    }
  })

  return row
}



async function ensureEbrTables(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ebr_acknowledgments (
    ack_id             SERIAL PRIMARY KEY,
    sku_root           TEXT,
    work_title         TEXT,
    recipient_work_id  TEXT,
    iswc               TEXT,
    status             TEXT NOT NULL,
    comments           TEXT,
    source_file        TEXT,
    imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS ebr_export_log (
    id            SERIAL PRIMARY KEY,
    sequence_num  INTEGER NOT NULL,
    file_name     TEXT,
    title_count   INTEGER,
    sku_list      TEXT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
}

// Runs the whole lot auto-export server-side: query -> filter -> build rows
// -> (inside one locked transaction) claim sequence -> write xlsx -> log.
// Returns a plain result object; never throws (callers get { ok:false, error }).
async function runLotAutoExport(pgPool, { lotId, lotName, outDir, senderCode }) {
  senderCode = String(senderCode || 'H03').trim().toUpperCase().slice(0, 3) || 'H03';
  await ensureEbrTables(pgPool);

  const { rows: titleRows } = await pgPool.query(
    `SELECT t.sku_root, t.title, t.team_id, t.is_jup, ack.status AS ack_status
     FROM titles t
     JOIN lot_titles lt ON lt.sku_root = t.sku_root
     LEFT JOIN LATERAL (
       SELECT status FROM ebr_acknowledgments a2
        WHERE a2.sku_root = t.sku_root
        ORDER BY a2.imported_at DESC LIMIT 1
     ) ack ON TRUE
     WHERE lt.lot_id = $1 AND COALESCE(t.status,'active') = 'active'
     ORDER BY t.title ASC`,
    [lotId]
  );
  if (!titleRows.length) return { ok: true, exported: 0, skipped: [], reason: 'no titles in lot' };

  const teamIds = [...new Set(titleRows.map(t => t.team_id).filter(Boolean))];
  const skuRoots = titleRows.map(t => t.sku_root);

  const [{ rows: writersRaw }, { rows: stemsRaw }] = await Promise.all([
    teamIds.length
      ? pgPool.query(`SELECT id, team_id, writer_name, pro, split_pct, ipi FROM team_writers WHERE team_id = ANY($1::varchar[]) ORDER BY team_id, id`, [teamIds])
      : Promise.resolve({ rows: [] }),
    skuRoots.length
      ? pgPool.query(`SELECT sku_root, stem_name, filename FROM mix_stems WHERE sku_root = ANY($1::varchar[]) ORDER BY sku_root, filename`, [skuRoots])
      : Promise.resolve({ rows: [] }),
  ]);

  const writersByTeam = {};
  writersRaw.forEach(w => {
    if (!writersByTeam[w.team_id]) writersByTeam[w.team_id] = [];
    const { first, last } = ebrSplitName(w.writer_name);
    writersByTeam[w.team_id].push({ ...w, first, last });
  });
  const stemsBySku = {};
  stemsRaw.forEach(s => {
    if (!stemsBySku[s.sku_root]) stemsBySku[s.sku_root] = [];
    stemsBySku[s.sku_root].push(s);
  });

  const exportable = [], skipped = [];
  titleRows.forEach(t => {
    const w = writersByTeam[t.team_id] || [];
    const splitSum = w.slice(0, 10).reduce((s, x) => s + parseFloat(x.split_pct || 0), 0);
    const badSplit = w.length > 0 && Math.abs(splitSum - 100) > SPLIT_TOLERANCE_PCT;
    if (t.ack_status === 'RA')                skipped.push({ sku: t.sku_root, reason: 'already accepted by MusicMark' });
    else if (t.is_jup)                        skipped.push({ sku: t.sku_root, reason: 'JUP title — not supported yet' });
    else if (!w.length)                       skipped.push({ sku: t.sku_root, reason: 'no writers on file' });
    else if (w.some(x => x.pro === 'SESAC'))  skipped.push({ sku: t.sku_root, reason: 'SESAC writer — separate process' });
    else if (badSplit)                        skipped.push({ sku: t.sku_root, reason: `writer splits sum to ${splitSum}%, not ~100% — fix before export` });
    else                                       exportable.push(t);
  });

  if (!exportable.length) return { ok: true, exported: 0, skipped, reason: 'nothing eligible after filters' };

  const dataRows = exportable.map(t => ebrBuildRow(t, writersByTeam, stemsBySku));

  fs.mkdirSync(outDir, { recursive: true });

  const client = await pgPool.connect();
  let fileName, outPath, seq;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [EBR_SEQ_LOCK_KEY]);

    const { rows: seqRows } = await client.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`);
    seq = seqRows.length ? seqRows[0].next : 1;
    const yy = String(new Date().getFullYear()).slice(-2);
    const nnnn = String(seq).padStart(4, '0');
    fileName = `EB${yy}${nnnn}${senderCode}_707.xlsx`;
    outPath = path.join(outDir, fileName);

    const ws = XLSX.utils.aoa_to_sheet([EBR_HEADERS, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations');
    XLSX.writeFile(wb, outPath);

    await client.query(
      `INSERT INTO ebr_export_log (sequence_num, file_name, title_count, sku_list) VALUES ($1,$2,$3,$4)`,
      [seq, fileName, exportable.length, exportable.map(t => t.sku_root).join(',')]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (outPath && fs.existsSync(outPath)) {
      try { fs.unlinkSync(outPath); } catch {}
    }
    return { ok: false, error: e.message };
  } finally {
    client.release();
  }

  return { ok: true, exported: exportable.length, fileName, skipped };
}

module.exports = { runLotAutoExport, EBR_HEADERS, ebrBuildRow, ebrSplitName, ebrPublisherFor, HAUS_PUBLISHERS };
