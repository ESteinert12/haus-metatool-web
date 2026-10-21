/**
 * ebr-ack-import.js
 *
 * Shared parsing + DB logic for importing MusicMark EBR acknowledgment
 * files (.xls/.xlsx) into `ebr_acknowledgments` and mirroring each result
 * onto `pro_registrations`. This is the one place this logic should live —
 * don't copy it a third time. Used by:
 *   - import-ebr-acks.js            (manual batch run from a local folder)
 *   - api.js `/api/ebr/fetch-acks-from-ftp` (pulls from HAUS's own FTP
 *     server via ebr-ftp.js, then imports with this module)
 *
 * Parsing (header names, trimming, blank-row filtering) mirrors main.js's
 * `ebr-read-ack-file` IPC handler, which backs the in-app "Import
 * Acknowledgment File" button (index.html: ebrImportAckFile). DB logic
 * (table shape, insert, pro_registrations sync) mirrors index.html's
 * ebrEnsureAckTable / ebrImportAckFile / ebrSyncProRegistrations.
 *
 * Extracted 2026-10-21 out of import-ebr-acks.js (which previously had its
 * own copy of all of this) so the FTP-fetch route could reuse it instead of
 * becoming a third, independently-drifting implementation. See the project
 * doc "handoff-2026-10-21-ebr-ack-ftp-autofetch-spec.md" for the decision
 * record behind the FTP-fetch feature this was extracted for.
 */

const path = require('path')
const XLSX = require('xlsx')

// ---- parsing (mirrors main.js ebr-read-ack-file) ------------------------
function readAckFile(filePath) {
  const wb = XLSX.readFile(filePath)
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  if (!aoa.length) return { ok: false, error: 'Sheet is empty' }

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, '')
  const headerRow = aoa[0].map(norm)
  const colMap = {
    workTitle: ['worktitle'],
    submitterWorkId: ['submitterworkid'],
    recipientWorkId: ['recipientworkid'],
    iswc: ['iswc'],
    status: ['transactionstatus'],
    comments: ['comments']
  }
  const idx = {}
  for (const [key, names] of Object.entries(colMap)) {
    idx[key] = headerRow.findIndex(h => names.includes(h))
  }
  if (idx.submitterWorkId === -1 || idx.status === -1) {
    return { ok: false, error: 'Unrecognized ack file format — missing Submitter_Work_ID or Transaction_Status column' }
  }

  const rows = aoa.slice(1)
    .filter(r => r.some(c => String(c || '').trim() !== ''))
    .map(r => ({
      workTitle: idx.workTitle >= 0 ? String(r[idx.workTitle] || '').trim() : '',
      submitterWorkId: idx.submitterWorkId >= 0 ? String(r[idx.submitterWorkId] || '').trim() : '',
      recipientWorkId: idx.recipientWorkId >= 0 ? String(r[idx.recipientWorkId] || '').trim() : '',
      iswc: idx.iswc >= 0 ? String(r[idx.iswc] || '').trim() : '',
      status: idx.status >= 0 ? String(r[idx.status] || '').trim() : '',
      // comments can carry embedded \r line breaks and huge trailing
      // whitespace in real MusicMark files — collapse for storage/CSV.
      comments: idx.comments >= 0 ? String(r[idx.comments] || '').replace(/\s+/g, ' ').trim() : ''
    }))

  return { ok: true, rows, fileName: path.basename(filePath) }
}

// ---- DB helpers (mirrors index.html) ------------------------------------
async function ensureAckTable(client) {
  await client.query(`CREATE TABLE IF NOT EXISTS ebr_acknowledgments (
    ack_id             SERIAL PRIMARY KEY,
    sku_root           TEXT,
    work_title         TEXT,
    recipient_work_id  TEXT,
    iswc               TEXT,
    status             TEXT NOT NULL,
    comments           TEXT,
    source_file        TEXT,
    imported_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
}

async function syncProRegistrations(client, skuRoot, ackStatus) {
  const prStatus = ackStatus === 'RA' ? 'registered' : (ackStatus === 'RJ' ? 'failed' : 'pending')
  await client.query(
    `UPDATE pro_registrations pr
     SET status = $1
     FROM mix_stems ms
     WHERE pr.mix_stem_id = ms.mix_stem_id AND ms.sku_root = $2`,
    [prStatus, skuRoot]
  )
}

// Has this exact filename already been imported? Both import-ebr-acks.js
// and the FTP-fetch route use this as their sole dedup key — see the
// "leave files on the FTP server, dedup locally by filename" decision in
// the FTP-fetch spec doc. Known limitation, accepted there: if MusicMark
// ever reuses a filename for different content, this would wrongly skip it.
async function alreadyImported(client, fileName) {
  const existing = await client.query(
    `SELECT 1 FROM ebr_acknowledgments WHERE source_file = $1 LIMIT 1`,
    [fileName]
  )
  return existing.rows.length > 0
}

// Bulk version of the same check -- one query for every already-imported
// filename instead of one query per candidate file. Added so a caller (the
// FTP-fetch route) can do this single lookup BEFORE opening a slow,
// unrelated network connection (FTP), instead of holding a Postgres client
// checked out, idle, for the whole FTP listing/download -- Neon has been
// observed dropping connections held open-but-idle like that (see the
// 2026-10-21 "holding a pg client across slow FTP I/O" incident).
async function getImportedFileNames(client) {
  const { rows } = await client.query(`SELECT DISTINCT source_file FROM ebr_acknowledgments WHERE source_file IS NOT NULL`)
  return new Set(rows.map(r => r.source_file))
}

// Imports one already-downloaded ack file (parse + per-row title match +
// insert + pro_registrations sync). Caller owns ensureAckTable() (once per
// run/connection) and any already-imported skip via alreadyImported() —
// kept out of this function so a caller with a different dedup rule (e.g.
// import-ebr-acks.js's --force) isn't forced into this function's opinion.
//
// Pass { dryRun: true } to parse and match against `titles` without writing
// anything to the DB (mirrors import-ebr-acks.js's --dry-run).
//
// Never throws for a bad/unrecognized file — comes back as
// { ok: false, error }, same "UNKNOWN format = zero rows imported, never a
// guess" rule this codebase uses for cue sheets and royalty statements.
async function importAckFile(client, filePath, fileName, opts = {}) {
  const dryRun = !!opts.dryRun
  let parsed
  try {
    parsed = readAckFile(filePath)
  } catch (e) {
    return { ok: false, error: `failed to read (${e.message})` }
  }
  if (!parsed.ok) return { ok: false, error: parsed.error }

  let imported = 0, unmatched = 0
  const unmatchedRows = []
  const flaggedRows = []
  const statusTotals = {}

  for (const r of parsed.rows) {
    const rawId = r.submitterWorkId
    if (!rawId) continue

    // MusicMark echoes the submitted Submitter_Work_ID back fully uppercased
    // (our real sku_root values use mixed case, e.g. "R84a0701"), and some
    // rows carry a trailing "_01"-style suffix we haven't identified the
    // meaning of yet. Match case-insensitively, falling back to the
    // suffix-stripped id, and always store OUR canonical sku_root casing
    // rather than whatever case/suffix came back in the file.
    let check = await client.query(`SELECT sku_root FROM titles WHERE lower(sku_root) = lower($1)`, [rawId])
    if (!check.rows.length) {
      const stripped = rawId.replace(/_\d+$/, '')
      if (stripped !== rawId) {
        check = await client.query(`SELECT sku_root FROM titles WHERE lower(sku_root) = lower($1)`, [stripped])
      }
    }
    if (!check.rows.length) {
      unmatched++
      unmatchedRows.push({ file: fileName, ...r })
      continue
    }
    const skuRoot = check.rows[0].sku_root

    statusTotals[r.status] = (statusTotals[r.status] || 0) + 1
    if (r.status && r.status !== 'AC' && r.status !== 'RA') {
      flaggedRows.push({ file: fileName, ...r })
    }

    if (!dryRun) {
      await client.query(
        `INSERT INTO ebr_acknowledgments (sku_root, work_title, recipient_work_id, iswc, status, comments, source_file)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [skuRoot, r.workTitle, r.recipientWorkId, r.iswc, r.status, r.comments, fileName]
      )
      await syncProRegistrations(client, skuRoot, r.status)
    }
    imported++
  }

  return {
    ok: true,
    imported,
    unmatched,
    unmatchedRows,
    flagged: flaggedRows.length,
    flaggedRows,
    statusTotals
  }
}

module.exports = { readAckFile, ensureAckTable, syncProRegistrations, alreadyImported, getImportedFileNames, importAckFile }
