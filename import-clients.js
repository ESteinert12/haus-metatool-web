#!/usr/bin/env node
/**
 * import-clients.js
 * Imports CLIENTS.csv (FileMaker export) into the clients table.
 *
 * Usage:
 *   DATABASE_URL="postgres://..." node import-clients.js [--dry-run]
 *
 * Flags:
 *   --dry-run   Print what would be inserted without touching the DB
 */

const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

// ── Load .env if present ──────────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    })
  }
} catch {}

const DRY_RUN  = process.argv.includes('--dry-run')
const CSV_FILE = path.join(__dirname, 'CLIENTS.csv')

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
        if (ch === '"') { if (raw[i+1] === '"') { cur += '"'; i++ } else inQ = false }
        else cur += ch
      } else {
        if (ch === '"') inQ = true
        else if (ch === ',') { fields.push(cur); cur = '' }
        else cur += ch
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
    process.exit(1)
  }

  const connStr = process.env.DATABASE_URL || process.env.NEON_DB_URL
  if (!connStr) {
    console.error('❌  No DATABASE_URL env var found.')
    process.exit(1)
  }

  const [header, ...dataRows] = parseCSV(fs.readFileSync(CSV_FILE, 'utf8'))
  const idx = {}
  header.forEach((h, i) => { idx[h.trim().toLowerCase()] = i })

  const COL_PK      = idx['pk']
  const COL_CLIENT  = idx['client']
  const COL_CITY    = idx['city']
  const COL_STATE   = idx['state']
  const COL_COUNTRY = idx['country']
  const COL_CONTACT = idx['contact']

  const records = dataRows.map(row => ({
    fm_pk:   (row[COL_PK]      || '').trim(),
    name:    (row[COL_CLIENT]  || '').trim(),
    city:    (row[COL_CITY]    || '').trim() || null,
    state:   (row[COL_STATE]   || '').trim() || null,
    country: (row[COL_COUNTRY] || '').trim() || null,
    contact: (row[COL_CONTACT] || '').trim() || null,
  })).filter(r => r.name)

  console.log(`📋  ${records.length} clients parsed from CSV`)
  if (DRY_RUN) console.log('🔍  DRY RUN — no DB writes\n')

  const db = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await db.connect()
  console.log('✅  Connected to Postgres\n')

  // Ensure table exists with fm_pk column
  await db.query(`CREATE TABLE IF NOT EXISTS clients (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    city       TEXT,
    state      TEXT,
    country    TEXT,
    contact    TEXT,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`)
  // Add fm_pk column if not present
  await db.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS fm_pk TEXT`)

  let inserted = 0, skipped = 0

  for (const r of records) {
    // Skip if fm_pk already exists
    const exists = await db.query('SELECT id FROM clients WHERE fm_pk=$1', [r.fm_pk])
    if (exists.rows.length) {
      console.log(`  ⟳  SKIP (already imported): ${r.fm_pk} — ${r.name}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      console.log(`  +  ${r.fm_pk}  ${r.name}  |  ${[r.city,r.state,r.country].filter(Boolean).join(', ')}  |  ${r.contact||'—'}`)
    } else {
      await db.query(
        `INSERT INTO clients (fm_pk, name, city, state, country, contact)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [r.fm_pk, r.name, r.city, r.state, r.country, r.contact]
      )
      console.log(`  ✓  ${r.fm_pk}  ${r.name}`)
    }
    inserted++
  }

  await db.end()

  console.log(`\n── Summary ─────────────────────────────`)
  console.log(`  ${inserted}  ${DRY_RUN ? 'would be inserted' : 'inserted'}`)
  console.log(`  ${skipped}  skipped (already in DB)`)
  if (DRY_RUN) console.log('\n  Re-run without --dry-run to import.')
}

main().catch(err => { console.error('❌ ', err.message); process.exit(1) })
