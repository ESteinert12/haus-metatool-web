#!/usr/bin/env node
/**
 * backfill-lots.js
 * Reads STAKLOTSBackfill.csv and updates legacy lots in Postgres with
 * lot_client (client company) and client (project/show name).
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node backfill-lots.js [--dry-run]
 *
 * Or set DATABASE_URL in a .env file alongside this script.
 *   node -e "require('dotenv').config()" backfill-lots.js
 *
 * Flags:
 *   --dry-run   Print what would be updated without touching the DB
 *   --avid      Also backfill avid_bin where the DB value is currently empty
 */

const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

// ── Load .env if present ──────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
} catch {}

const DRY_RUN  = process.argv.includes('--dry-run')
const DO_AVID  = process.argv.includes('--avid')
const CSV_FILE = path.join(__dirname, 'STAKLOTSBackfill.csv')

// ── Minimal CSV parser (handles quoted fields and embedded commas) ─────────────
function parseCSV(text) {
  const rows = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const raw of lines) {
    if (!raw.trim()) continue
    const fields = []
    let cur = '', inQ = false
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      if (inQ) {
        if (ch === '"') {
          if (raw[i + 1] === '"') { cur += '"'; i++ }   // escaped quote
          else inQ = false
        } else {
          cur += ch
        }
      } else {
        if (ch === '"') { inQ = true }
        else if (ch === ',') { fields.push(cur); cur = '' }
        else { cur += ch }
      }
    }
    fields.push(cur)
    rows.push(fields)
  }
  return rows
}

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`❌  CSV not found: ${CSV_FILE}`)
    console.error(`    Place STAKLOTSBackfill.csv in the same folder as this script.`)
    process.exit(1)
  }

  const connStr = process.env.DATABASE_URL || process.env.NEON_DB_URL || process.env.PG_CONN
  if (!connStr) {
    console.error('❌  No DATABASE_URL env var found.')
    console.error('    Run:  DATABASE_URL="postgres://..." node backfill-lots.js')
    process.exit(1)
  }

  // Parse CSV
  const raw   = fs.readFileSync(CSV_FILE, 'utf8')
  const rows  = parseCSV(raw)
  const [header, ...dataRows] = rows

  // Map header names → indices (case-insensitive, trimmed)
  const idx = {}
  header.forEach((h, i) => { idx[h.trim().toLowerCase()] = i })

  const COL_LOT     = idx['lot']
  const COL_CLIENT  = idx['client']
  const COL_PROJECT = idx['project']
  const COL_AVID    = idx['avid']

  if (COL_LOT === undefined || COL_CLIENT === undefined || COL_PROJECT === undefined) {
    console.error('❌  Could not find expected columns (LOT, CLIENT, PROJECT) in CSV.')
    console.error('    Header found:', header)
    process.exit(1)
  }

  // Build update list
  const updates = []
  for (const row of dataRows) {
    const lotName   = (row[COL_LOT]     || '').trim()
    const lotClient = (row[COL_CLIENT]  || '').trim()
    const project   = (row[COL_PROJECT] || '').trim()
    const avid      = COL_AVID !== undefined ? (row[COL_AVID] || '').trim() : ''

    if (!lotName) continue
    updates.push({ lotName, lotClient, project, avid })
  }

  console.log(`📋  ${updates.length} rows parsed from CSV`)
  if (DRY_RUN) console.log('🔍  DRY RUN — no DB writes will happen\n')

  // Connect
  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('✅  Connected to Postgres\n')

  let updated = 0, skipped = 0, notFound = 0

  for (const { lotName, lotClient, project, avid } of updates) {
    // Look up the lot
    const found = await client.query(
      'SELECT lot_id, lot_name, lot_client, client, avid_bin FROM lots WHERE lot_name = $1',
      [lotName]
    )

    if (found.rows.length === 0) {
      console.log(`  ⚠️  NOT FOUND: "${lotName}"`)
      notFound++
      continue
    }

    const lot = found.rows[0]
    const newLotClient = lotClient || lot.lot_client
    const newProject   = project   || lot.client
    const newAvid      = (DO_AVID && avid && !lot.avid_bin) ? avid : lot.avid_bin

    // Skip if nothing would change
    if (
      newLotClient === lot.lot_client &&
      newProject   === lot.client &&
      newAvid      === lot.avid_bin
    ) {
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`  → "${lotName}"`)
      if (newLotClient !== lot.lot_client) console.log(`     lot_client: ${lot.lot_client || '(empty)'} → ${newLotClient}`)
      if (newProject   !== lot.client)     console.log(`     client:     ${lot.client     || '(empty)'} → ${newProject}`)
      if (newAvid      !== lot.avid_bin)   console.log(`     avid_bin:   ${lot.avid_bin   || '(empty)'} → ${newAvid}`)
    } else {
      await client.query(
        'UPDATE lots SET lot_client=$1, client=$2, avid_bin=$3 WHERE lot_id=$4',
        [newLotClient || null, newProject || null, newAvid || null, lot.lot_id]
      )
      console.log(`  ✓  "${lotName}" — client: ${newLotClient || '—'} · project: ${newProject || '—'}`)
    }
    updated++
  }

  await client.end()

  console.log(`\n── Summary ─────────────────────────────────`)
  console.log(`  ${updated}  ${DRY_RUN ? 'would be updated' : 'updated'}`)
  console.log(`  ${skipped}  already match (skipped)`)
  console.log(`  ${notFound}  not found in DB`)
  if (DRY_RUN) console.log('\n  Re-run without --dry-run to apply.')
}

main().catch(err => {
  console.error('❌ ', err.message)
  process.exit(1)
})
