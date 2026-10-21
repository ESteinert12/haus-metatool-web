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
 * Parsing + DB logic now lives in ebr-ack-import.js (extracted 2026-10-21
 * so the new FTP-fetch route in api.js could reuse the exact same code
 * instead of becoming a third copy — this script's behavior is unchanged).
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
const { Pool } = require('pg')
const ebrAckImport = require('./ebr-ack-import')

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
    await ebrAckImport.ensureAckTable(client)

    for (const file of files) {
      const filePath = path.join(folder, file)

      if (!force) {
        const already = await ebrAckImport.alreadyImported(client, file)
        if (already) {
          console.log(`– ${file}: already imported, skipping (use --force to re-import)`)
          grandSkippedFiles++
          continue
        }
      }

      const result = await ebrAckImport.importAckFile(client, filePath, file, { dryRun })
      if (!result.ok) {
        console.error(`✗ ${file}: ${result.error}`)
        continue
      }

      unmatchedRows.push(...result.unmatchedRows)
      flaggedRows.push(...result.flaggedRows)
      for (const [status, count] of Object.entries(result.statusTotals)) {
        statusTotals[status] = (statusTotals[status] || 0) + count
      }

      grandImported += result.imported
      grandUnmatched += result.unmatched
      console.log(`${dryRun ? '≈' : '✓'} ${file}: ${result.imported} matched${dryRun ? ' (not written)' : ' & recorded'}${result.unmatched ? `, ${result.unmatched} unmatched sku_root` : ''}`)
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
