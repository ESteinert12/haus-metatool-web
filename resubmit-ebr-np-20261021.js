// Targeted resubmission for EB260001H03_707.xlsx rows MusicMark came back
// with a non-accepted status (NP) on, after a real rejection reason came
// back: "Writer IPI Name# and Writer Internal ID are blank" for every
// writer on every row. Two real causes:
//   1. Writer IPI Name# -- genuinely blank in team_writers at the time that
//      batch went out (890 of 903 rows). Backfilled earlier today (see
//      claude/handoff-2026-10-21-ebr-batch-and-ipi-backfill.md) -- fixed at
//      the data level, nothing to do here except pull current data.
//   2. Writer Internal ID -- the exporter (generate-ebr-export.js /
//      ebr-lot-export.js / index.html, all via ebr-shared.js's column list)
//      never populated this column for ANY writer, on ANY export, ever.
//      Fixed today in all three builders to write team_writers.id as the
//      Writer Internal ID.
//
// This script does NOT use generate-ebr-export.js's normal eligibility
// query, because that query explicitly EXCLUDES anything already in
// ebr_export_log.sku_list -- these titles were already sent once and are
// correctly excluded from a *new* batch. This is a *resubmission* of
// specific, already-sent titles with corrected writer data, not a new
// batch, so it targets exactly the sku_roots MusicMark flagged NP.
//
// Usage: node resubmit-ebr-np-20261021.js            (dry run, default)
//        node resubmit-ebr-np-20261021.js --live      (writes the file + logs it)
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { Pool } = require('pg')
const { EBR_HEADERS, EBR_COL_INDEX, EBR_MAX_ORIGINAL_PUBS, ebrSplitName, ebrPublisherFor } = require('./ebr-shared.js')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true,
  max: 5,
  connectionTimeoutMillis: 30000,
  idleTimeoutMillis: 0,
  statement_timeout: 20000,
  query_timeout: 25000,
})
pool.on('error', (err) => console.error('[pool] error (handled):', err.message))

const LIVE = process.argv.includes('--live')
const SENDER_CODE = 'H03'
const EBR_SEQ_LOCK_KEY = 771983501

function ebrBuildRow(title, writersByTeam, stemsBySku) {
  const row = new Array(EBR_HEADERS.length).fill('')
  const col = (name) => EBR_COL_INDEX[name]
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
    set(`Writer Internal ID ${n}`, w.id != null ? String(w.id) : '')
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

async function ensureEbrExportLogTable(queryable) {
  await queryable.query(`CREATE TABLE IF NOT EXISTS ebr_export_log (
    id            SERIAL PRIMARY KEY,
    sequence_num  INTEGER NOT NULL,
    file_name     TEXT,
    title_count   INTEGER,
    sku_list      TEXT,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {})
}

async function run() {
  console.log(LIVE ? '*** LIVE RUN -- will write a file and log to ebr_export_log ***' : 'Dry run (pass --live to actually write the resubmission file)')
  await ensureEbrExportLogTable(pool)

  // The exact sku_roots that came back NOT RA/AC -- one latest-status row per sku_root.
  const { rows: npRows } = await pool.query(`
    SELECT DISTINCT ON (sku_root) sku_root, status, comments
    FROM ebr_acknowledgments
    WHERE status NOT IN ('RA', 'AC')
    ORDER BY sku_root, imported_at DESC
  `)
  console.log('sku_roots with a non-accepted (NP) acknowledgment status:', npRows.length)
  if (!npRows.length) { console.log('Nothing to resubmit.'); await pool.end(); return }

  const skuRoots = npRows.map(r => r.sku_root)
  const { rows: titlesRaw } = await pool.query(
    `SELECT sku_root, title, team_id, description FROM titles WHERE sku_root = ANY($1::text[])`,
    [skuRoots]
  )
  const foundSkusRaw = new Set(titlesRaw.map(t => t.sku_root))
  const missingFromTitles = skuRoots.filter(s => !foundSkusRaw.has(s))
  if (missingFromTitles.length) {
    console.log(`WARNING: ${missingFromTitles.length} NP sku_root(s) no longer exist in titles (deleted/renamed?) -- skipped:`, missingFromTitles.slice(0, 10))
  }

  const aeTitles = titlesRaw.filter(t => /SOLD TO A&E/i.test(t.description || ''))
  if (aeTitles.length) {
    console.log(`WARNING: ${aeTitles.length} NP titles were SOLD TO A&E and will be EXCLUDED from resubmission (must never be sent to MusicMark):`, aeTitles.map(t => t.sku_root))
  }
  const aeSkuSet = new Set(aeTitles.map(t => t.sku_root))
  const titles = titlesRaw.filter(t => !aeSkuSet.has(t.sku_root))
  const foundSkus = new Set(titles.map(t => t.sku_root))

  const teamIds = [...new Set(titles.map(t => t.team_id).filter(Boolean))]
  const { rows: writerRows } = await pool.query(
    `SELECT id, team_id, writer_name, pro, split_pct, ipi FROM team_writers WHERE team_id = ANY($1::varchar[]) ORDER BY team_id, id`,
    [teamIds]
  )
  const { rows: stemRows } = await pool.query(
    `SELECT sku_root, stem_name, filename FROM mix_stems WHERE sku_root = ANY($1::varchar[]) ORDER BY sku_root, filename`,
    [skuRoots]
  )

  const writersByTeam = {}
  writerRows.forEach(w => {
    if (!writersByTeam[w.team_id]) writersByTeam[w.team_id] = []
    const { first, last } = ebrSplitName(w.writer_name)
    writersByTeam[w.team_id].push({ ...w, first, last })
  })
  const stemsBySku = {}
  stemRows.forEach(s => {
    if (!stemsBySku[s.sku_root]) stemsBySku[s.sku_root] = []
    stemsBySku[s.sku_root].push(s)
  })

  // Sanity check: confirm the real fix actually landed -- every writer on
  // every title being resubmitted should now have BOTH an internal id
  // (always true, it's team_writers.id) AND an IPI (should be true post-backfill,
  // except the one known unresolved encoding-artifact writer).
  const stillMissingIpi = []
  for (const t of titles) {
    const writers = writersByTeam[t.team_id] || []
    for (const w of writers) {
      if (!w.ipi) stillMissingIpi.push({ sku_root: t.sku_root, title: t.title, writer_name: w.writer_name })
    }
  }
  console.log('Writers still missing IPI among the resubmission set:', stillMissingIpi.length)
  if (stillMissingIpi.length) console.log(stillMissingIpi.slice(0, 10))

  const rows = titles.map(t => ebrBuildRow(t, writersByTeam, stemsBySku))
  console.log(`\nResubmission population: ${rows.length} titles.`)
  console.log('Sample of first 3 (title / sku_root / writer count / first writer internal id+ipi):')
  console.log(titles.slice(0, 3).map(t => {
    const w0 = (writersByTeam[t.team_id] || [])[0]
    return { title: t.title, sku_root: t.sku_root, writers: (writersByTeam[t.team_id] || []).length, w0_internal_id: w0 && w0.id, w0_ipi: w0 && w0.ipi }
  }))

  if (!LIVE) {
    const { rows: seqPeek } = await pool.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`)
    const seq = seqPeek.length ? seqPeek[0].next : 1
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const nnnn = String(seq).padStart(4, '0')
    const fileName = `EB${yy}${nnnn}${SENDER_CODE}_707.xlsx`
    console.log(`\nWould write: ${fileName} (sequence ${seq} as of right now), ${rows.length} works.`)
    console.log('Dry run only -- no file written, no ebr_export_log row inserted. Rerun with --live to actually generate the file.')
    await pool.end()
    return
  }

  const client = await pool.connect()
  let fileName, outPath, seq
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [EBR_SEQ_LOCK_KEY])

    const { rows: seqRows } = await client.query(`SELECT COALESCE(MAX(sequence_num),0) + 1 AS next FROM ebr_export_log`)
    seq = seqRows.length ? seqRows[0].next : 1
    const now = new Date()
    const yy = String(now.getFullYear()).slice(-2)
    const nnnn = String(seq).padStart(4, '0')
    fileName = `EB${yy}${nnnn}${SENDER_CODE}_707.xlsx`
    outPath = path.join(__dirname, fileName)

    const ws = XLSX.utils.aoa_to_sheet([EBR_HEADERS, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Registrations')
    XLSX.writeFile(wb, outPath)
    console.log('Wrote', outPath)

    await client.query(
      `INSERT INTO ebr_export_log (sequence_num, file_name, title_count, sku_list) VALUES ($1,$2,$3,$4)`,
      [seq, fileName, titles.length, titles.map(t => t.sku_root).join(',')]
    )
    await client.query('COMMIT')
    console.log('Logged to ebr_export_log: sequence', seq, ', title_count', titles.length, '-- note this sku_list OVERLAPS with the original EB260001H03 batch by design (this is a correction resubmission, not new titles).')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    if (outPath && fs.existsSync(outPath)) {
      fs.unlinkSync(outPath)
      console.log(`Rolled back: removed ${outPath} since the ebr_export_log insert failed.`)
    }
    throw e
  } finally {
    client.release()
  }

  console.log('\nThis file is a RESUBMISSION of previously-NP titles with corrected Writer Internal ID + Writer IPI Name# -- eyeball a few rows before sending to MusicMark.')
  await pool.end()
}

run().catch(e => { console.error('SCRIPT ERROR:', e.message); process.exit(1) })
