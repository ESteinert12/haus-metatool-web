#!/usr/bin/env node
/**
 * import-ebr-acks.js
 *
 * Batch-imports MusicMark EBR acknowledgment files (.xls/.xlsx) into the
 * ebr_acknowledgments table, and mirrors each result onto pro_registrations
 * — the same two things the app's own "Import Acknowledgment File" button
 * (index.html: ebrImportAckFile / ebrSyncProRegistrations) does for one
 * file at a time via a file-picker dialog. This script does the same thing
 * for every ack file in a folder in one run, with a per-file skip so it's
 * safe to re-run (already-imported files are not re-inserted unless you
 * pass --force).
 *
 * Parsing logic (header names, trimming, blank-row filtering) is copied
 * from main.js's `ebr-read-ack-file` IPC handler. DB logic (table shape,
 * insert, pro_registrations sync) is copied from index.html's
 * ebrEnsureAckTable / ebrImportAckFile / ebrSyncProRegistrations. Nothing
 * here is new business logic — it's the existing, already-working import
 * path, just run in a loop instead of through 46 file-picker dialogs.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node import-ebr-acks.js [folder] [--dry-run] [--force]
 *
 * [folder] defaults to "~/Downloads/RETURNED EBRs".
 * --dry-run : parse and match against `titles`, but write nothing to the DB.
 * --force   : re-import files whose source_file already has rows on file.
 *
 * Must be run from a real terminal with DATABASE_URL set to the live Neon
 * connection string — this script makes a raw Postgres connection, which a
 * device-bridge / proxied shell cannot reach (see engineering_notes.md,
 * "Network note for future sessions").
 *
 * Writes two review files next to this script when done:
 *   ebr-ack-import-unmatched.csv  — rows whose sku_root isn't in `titles`
 *   ebr-ack-import-flagged.csv    — rows with a non-accepted status (RJ, NP, AS, CO)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const XLSX = require('xlsx')
const { Pool } = require('pg')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const folderArg = args.find(a => !a.startsWith('--'))
const folder = folderArg || path.join(os.homedir(), 'Downloads', 'RETURNED EBRs')

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Run this with the live Neon connection string, e.g.:')
  console.error('  DATABASE_URL="postgres://..." node import-ebr-acks.js')
  process.exit(1)
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// ---- parsing (mirrors main.js ebr-read-ack-file) ----------------------
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

// ---- DB helpers (mirrors index.html) -----------------------------------
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

function csvEscape(v) {
  const s = String(v == null ? '' : v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  if (!fs.existsSync(folder)) {
    console.error(`FATAL: folder not found: ${folder}`)
    process.exit(1)
  }
  const files = fs.readdirSync(folder)
    .filter(f => /\.xlsx?$/i.test(f))
    .sort()
  if (!files.length) {
    console.error(`No .xls/.xlsx files found in ${folder}`)
    process.exit(1)
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Found ${files.length} ack file(s) in ${folder}`)

  const client = await pool.connect()
  const unmatchedRows = []
  const flaggedRows = []
  const statusTotals = {}
  let grandImported = 0, grandUnmatched = 0, grandSkippedFiles = 0

  try {
    await ensureAckTable(client)

    for (const file of files) {
      const filePath = path.join(folder, file)
      let parsed
      try {
        parsed = readAckFile(filePath)
      } catch (e) {
        console.error(`✗ ${file}: failed to read (${e.message})`)
        continue
      }
      if (!parsed.ok) {
        console.error(`✗ ${file}: ${parsed.error}`)
        continue
      }

      if (!force) {
        const existing = await client.query(
          `SELECT 1 FROM ebr_acknowledgments WHERE source_file = $1 LIMIT 1`,
          [file]
        )
        if (existing.rows.length) {
          console.log(`– ${file}: already imported, skipping (use --force to re-import)`)
          grandSkippedFiles++
          continue
        }
      }

      let imported = 0, unmatched = 0
      for (const r of parsed.rows) {
        const skuRoot = r.submitterWorkId
        if (!skuRoot) continue

        const check = await client.query(`SELECT sku_root FROM titles WHERE sku_root = $1`, [skuRoot])
        if (!check.rows.length) {
          unmatched++
          unmatchedRows.push({ file, ...r })
          continue
        }

        statusTotals[r.status] = (statusTotals[r.status] || 0) + 1
        if (r.status && r.status !== 'AC' && r.status !== 'RA') {
          flaggedRows.push({ file, ...r })
        }

        if (!dryRun) {
          await client.query(
            `INSERT INTO ebr_acknowledgments (sku_root, work_title, recipient_work_id, iswc, status, comments, source_file)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [skuRoot, r.workTitle, r.recipientWorkId, r.iswc, r.status, r.comments, file]
          )
          await syncProRegistrations(client, skuRoot, r.status)
        }
        imported++
      }

      grandImported += imported
      grandUnmatched += unmatched
      console.log(`${dryRun ? '≈' : '✓'} ${file}: ${imported} matched${dryRun ? ' (not written)' : ' & recorded'}${unmatched ? `, ${unmatched} unmatched sku_root` : ''}`)
    }
  } finally {
    client.release()
    await pool.end()
  }

  console.log('')
  console.log('==== Summary ====')
  console.log(`Files processed: ${files.length} (${grandSkippedFiles} already-imported, skipped)`)
  console.log(`Rows matched to a title: ${grandImported}${dryRun ? ' (dry run — nothing written)' : ''}`)
  console.log(`Rows with no matching sku_root in titles: ${grandUnmatched}`)
  console.log('Status breakdown (matched rows):', statusTotals)

  if (unmatchedRows.length) {
    const outPath = path.join(__dirname, 'ebr-ack-import-unmatched.csv')
    const header = 'file,sku_root,work_title,recipient_work_id,iswc,status,comments'
    const lines = unmatchedRows.map(r => [r.file, r.submitterWorkId, r.workTitle, r.recipientWorkId, r.iswc, r.status, r.comments].map(csvEscape).join(','))
    fs.writeFileSync(outPath, [header, ...lines].join('\n'))
    console.log(`Wrote ${unmatchedRows.length} unmatched row(s) to ${outPath}`)
  }
  if (flaggedRows.length) {
    const outPath = path.join(__dirname, 'ebr-ack-import-flagged.csv')
    const header = 'file,sku_root,work_title,recipient_work_id,iswc,status,comments'
    const lines = flaggedRows.map(r => [r.file, r.submitterWorkId, r.workTitle, r.recipientWorkId, r.iswc, r.status, r.comments].map(csvEscape).join(','))
    fs.writeFileSync(outPath, [header, ...lines].join('\n'))
    console.log(`Wrote ${flaggedRows.length} non-accepted row(s) (RJ/NP/AS/CO) to ${outPath}`)
  }
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
