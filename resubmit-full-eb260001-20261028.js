// Full resubmission of EB260001H03_707.xlsx (ebr_export_log sequence 1,
// 4,231 titles, sent 2026-09-29). MusicMark rejected the ENTIRE batch
// outright -- confirmed by Erik via a separate rejection notice, same
// reason as the per-row NP comments: "Writer IPI Name# and Writer Internal
// ID are blank" for every writer. This is NOT limited to the 668 titles
// that came back with an NP acknowledgment status (resubmit-ebr-np-
// 20261021.js, already run as EB260009H03_707.xlsx on 2026-10-28) -- if
// MusicMark rejected the whole file, none of it was actually registered,
// so the correct fix is to resend the WHOLE original 4,231-title
// population with corrected data, not just the subset that had its own
// acknowledgment row.
//
// Pulls the exact sku_list from ebr_export_log's EB260001H03 row (not a
// fresh eligibility query) so this resends precisely what was originally
// sent, no more, no less. Applies the same split-tolerance quality check
// as generate-ebr-export.js (holds out bad-split titles by default, e.g.
// TEAM669's 7 still-unresolved titles) since those shouldn't go out with
// bad data just because the surrounding batch is being resent.
//
// Usage: node resubmit-full-eb260001-20261028.js            (dry run, default)
//        node resubmit-full-eb260001-20261028.js --live      (writes the file + logs it)
//        node resubmit-full-eb260001-20261028.js --live --include-bad-splits
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
const INCLUDE_BAD_SPLITS = process.argv.includes('--include-bad-splits')
const SENDER_CODE = 'H03'
const EBR_SEQ_LOCK_KEY = 771983501
const SPLIT_TOLERANCE_PCT = 0.5
const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

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

  const { rows: origRows } = await pool.query(
    `SELECT sequence_num, file_name, title_count, sku_list FROM ebr_export_log WHERE file_name = 'EB260001H03_707.xlsx' ORDER BY id LIMIT 1`
  )
  if (!origRows.length) {
    console.error('Could not find EB260001H03_707.xlsx in ebr_export_log -- aborting rather than guessing at the original sku_list.')
    await pool.end()
    process.exit(1)
  }
  const orig = origRows[0]
  const origSkus = orig.sku_list.split(',').map(s => s.trim()).filter(Boolean)
  console.log(`Original EB260001H03_707.xlsx (ebr_export_log sequence ${orig.sequence_num}): ${orig.title_count} titles logged, ${origSkus.length} sku_roots parsed from sku_list.`)

  const { rows: titlesRaw } = await pool.query(
    `SELECT sku_root, title, team_id, description FROM titles WHERE sku_root = ANY($1::text[])`,
    [origSkus]
  )
  const foundSkusRaw = new Set(titlesRaw.map(t => t.sku_root))
  const missingFromTitles = origSkus.filter(s => !foundSkusRaw.has(s))
  if (missingFromTitles.length) {
    console.log(`WARNING: ${missingFromTitles.length} of the original sku_roots no longer exist in titles (deleted/renamed?) -- these will be skipped, not resent:`, missingFromTitles.slice(0, 15))
  }

  const aeTitles = titlesRaw.filter(t => /SOLD TO A&E/i.test(t.description || ''))
  if (aeTitles.length) {
    console.log(`WARNING: ${aeTitles.length} titles in this batch were SOLD TO A&E and will be EXCLUDED from resubmission (must never be sent to MusicMark):`, aeTitles.map(t => t.sku_root))
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
    [origSkus]
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

  // Same split-tolerance quality gate as generate-ebr-export.js -- don't resend
  // a bad split just because the rest of the batch is being corrected.
  const badSplits = []
  const goodTitles = []
  const noWriters = []
  for (const t of titles) {
    const writers = (writersByTeam[t.team_id] || []).slice(0, 10)
    if (!writers.length) { noWriters.push(t); continue }
    const sum = writers.reduce((acc, w) => acc + (typeof w.split_pct === 'number' ? w.split_pct : parseFloat(w.split_pct) || 0), 0)
    if (Math.abs(sum - 100) > SPLIT_TOLERANCE_PCT) {
      badSplits.push({ sku_root: t.sku_root, title: t.title, writer_count: writers.length, split_sum: sum })
      if (INCLUDE_BAD_SPLITS) goodTitles.push(t)
    } else {
      goodTitles.push(t)
    }
  }
  if (noWriters.length) console.log(`WARNING: ${noWriters.length} titles from the original batch now have zero writers on file -- skipped:`, noWriters.slice(0, 10).map(t => t.sku_root))
  if (badSplits.length) {
    console.log(`\n${badSplits.length} titles have writer splits that do NOT sum to 100% (+/- ${SPLIT_TOLERANCE_PCT}%). ${INCLUDE_BAD_SPLITS ? 'Included anyway (--include-bad-splits).' : 'HELD OUT of this resubmission -- rerun with --include-bad-splits to include them, or fix the splits first.'}`)
    console.log(badSplits)
  }

  // Sanity check the fix actually landed for this population.
  const stillMissingIpi = []
  for (const t of goodTitles) {
    for (const w of (writersByTeam[t.team_id] || [])) {
      if (!w.ipi) stillMissingIpi.push({ sku_root: t.sku_root, title: t.title, writer_name: w.writer_name })
    }
  }
  console.log('\nWriters still missing IPI among the resubmission set:', stillMissingIpi.length)
  if (stillMissingIpi.length) console.log(stillMissingIpi.slice(0, 10))

  const rows = goodTitles.map(t => ebrBuildRow(t, writersByTeam, stemsBySku))
  console.log(`\nFull resubmission population: ${rows.length} titles (of ${origSkus.length} in the original batch).`)
  console.log('Sample of first 3:')
  console.log(goodTitles.slice(0, 3).map(t => {
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

    if (badSplits.length) {
      const reviewCsv = 'sku_root,title,writer_count,split_sum\n' + badSplits.map(r => [r.sku_root, r.title, r.writer_count, r.split_sum].map(csvEscape).join(',')).join('\n') + '\n'
      fs.writeFileSync(path.join(__dirname, 'ebr-resubmit-flagged-bad-splits.csv'), reviewCsv)
      console.log('Wrote ebr-resubmit-flagged-bad-splits.csv for manual review.')
    }

    await client.query(
      `INSERT INTO ebr_export_log (sequence_num, file_name, title_count, sku_list) VALUES ($1,$2,$3,$4)`,
      [seq, fileName, goodTitles.length, goodTitles.map(t => t.sku_root).join(',')]
    )
    await client.query('COMMIT')
    console.log('Logged to ebr_export_log: sequence', seq, ', title_count', goodTitles.length, '-- this is a FULL RESUBMISSION of the EB260001H03 batch MusicMark rejected outright, with corrected Writer Internal ID + IPI data.')
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

  console.log('\nThis file supersedes EB260009H03_707.xlsx (the earlier 668-title partial resubmission) -- it covers the FULL originally-rejected batch. Send this one to MusicMark, not the smaller one, unless you have a specific reason to send both.')
  await pool.end()
}

run().catch(e => { console.error('SCRIPT ERROR:', e.message); process.exit(1) })
