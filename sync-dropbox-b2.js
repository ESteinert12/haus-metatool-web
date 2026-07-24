#!/usr/bin/env node
// sync-dropbox-b2.js
// Copies audio from Dropbox archive folders → B2 in the correct HAUS format.
// Dropbox structure: "1. ARCHIVE_Stratus/{composer}/" → B2: "stratus/{id}_{fullName}_STRATUS/"
//
// Usage:
//   node sync-dropbox-b2.js           # dry run (no files copied)
//   node sync-dropbox-b2.js --live    # actually copy

const { Pool } = require('pg')
const { execSync, spawnSync } = require('child_process')

const CONN = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const LIVE = process.argv.includes('--live')

// Dropbox archive folder name → B2 album name
const ARCHIVE_MAP = {
  '1. ARCHIVE_Stratus':  'stratus',
  '2. ARCHIVE_Cumulus':  'cumulus',
  '3. ARCHIVE_Cirrus':   'cirrus',
  '4. ARCHIVE_Nimbus':   'nimbus',
}

const RCLONE = (() => {
  for (const p of ['/usr/local/bin/rclone', '/opt/homebrew/bin/rclone', 'rclone']) {
    try { execSync(`${p} version`, { stdio: 'ignore' }); return p } catch {}
  }
  throw new Error('rclone not found')
})()

function rclone(...args) {
  const result = spawnSync(RCLONE, args, { encoding: 'utf8', timeout: 600000 })
  if (result.error) throw new Error(`rclone error: ${result.error.message}`)
  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status }
}

function listDirs(remotePath) {
  // lsf --dirs-only outputs one folder name per line (with trailing slash)
  const r = rclone('lsf', '--dirs-only', remotePath)
  return r.stdout.split('\n')
    .map(l => l.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

async function main() {
  console.log(LIVE
    ? '⚠  LIVE MODE — files WILL be copied to B2'
    : '🔍 DRY RUN — no files copied (add --live to actually copy)')
  console.log('')

  // ── DB: load composer ID → full name mapping ─────────────────────────────
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })
  const { rows } = await pool.query(`
    SELECT composer_id, full_name FROM composers
    WHERE composer_id ~ '^[A-Z]\\d{2}$' ORDER BY composer_id
  `)
  await pool.end()
  const composerMap = Object.fromEntries(rows.map(r => [r.composer_id.toUpperCase(), r.full_name]))
  console.log(`DB: ${rows.length} composers loaded\n`)

  let totalCopied = 0, totalSkipped = 0, totalUnknown = 0

  // ── For each Dropbox archive folder ──────────────────────────────────────
  for (const [archiveFolder, album] of Object.entries(ARCHIVE_MAP)) {
    const albumUpper = album.toUpperCase()
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`  ${archiveFolder}  →  b2:haus-music/${album}/`)
    console.log('═'.repeat(50))

    // List composer folders inside this archive
    const composerFolders = listDirs(`dropbox:${archiveFolder}`)

    if (!composerFolders.length) {
      console.log('  (no sub-folders found)')
      continue
    }

    for (const folder of composerFolders) {
      // Extract 3-char prefix from folder name (e.g. "R87_ASOL" → "R87")
      const match = folder.match(/^([A-Z]\d{2})/i)
      if (!match) { totalUnknown++; continue }

      const prefix   = match[1].toUpperCase()
      const fullName = composerMap[prefix]
      if (!fullName) {
        console.log(`  ⚠ ${folder} — composer ${prefix} not in DB, skipping`)
        totalUnknown++
        continue
      }

      const b2Dest = `b2:haus-music/${album}/${prefix}_${fullName}_${albumUpper}`
      console.log(`\n  ${prefix} — ${fullName}`)
      console.log(`    dropbox:${archiveFolder}/${folder}`)
      console.log(`    → ${b2Dest}`)

      const args = [
        RCLONE, 'copy',
        `dropbox:${archiveFolder}/${folder}`,
        b2Dest,
        '--transfers', '4',
        '--progress',
      ]
      if (!LIVE) args.push('--dry-run')

      // Stream output directly to terminal (avoids buffer overflow)
      spawnSync(args[0], args.slice(1), { stdio: 'inherit', timeout: 600000 })
      totalCopied++
    }
  }

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  Processed : ${totalCopied} composer folders`)
  console.log(`  Unknown   : ${totalUnknown}`)
  if (!LIVE) console.log('\n  Run with --live to actually copy files.')
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
