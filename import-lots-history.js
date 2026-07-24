#!/usr/bin/env node
// Import historical lots + title-lot join table from FileMaker exports
// Usage: node import-lots-history.js [--dry-run]
//
// Files expected in same directory:
//   "STAK Lots.csv"     — lots table (PK, LOT NAME, CREATION DATE, CLIENT, TARGET SHOW, SENT, AVID, NOTES)
//   "TITLELOT_JT.csv"   — join table  (PK, SKU, LOT)

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const CONN = process.env.DATABASE_URL || 'postgresql://neondb_owner:PASTE_NEW_PASSWORD_HERE@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const DRY_RUN = process.argv.includes('--dry-run')
const DIR = process.cwd()
console.log('Looking for CSVs in:', DIR)

const pool = new Pool({ connectionString: CONN })

// ── CSV parser (handles quoted fields with commas inside) ──────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = parseLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const vals = parseLine(line)
    const obj = {}
    headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || '').trim() })
    rows.push(obj)
  }
  return rows
}

function parseLine(line) {
  const fields = []
  let cur = '', inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i+1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      fields.push(cur); cur = ''
    } else {
      cur += c
    }
  }
  fields.push(cur)
  return fields
}

// ── Date parser — M/D/YYYY or MM/DD/YYYY → YYYY-MM-DD ─────────────────────
function parseDate(s) {
  if (!s || !s.trim()) return null
  const parts = s.trim().split('/')
  if (parts.length !== 3) return null
  const [m, d, y] = parts
  if (!y || y.length !== 4) return null
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
}

// ── SKU → sku_root (strip last char = album digit) ────────────────────────
function toSkuRoot(sku) {
  if (!sku || sku.length < 5) return null
  return sku.slice(0, -1)
}

async function run() {
  const lotsPath = path.join(DIR, 'STAK Lots.csv')
  const jtPath   = path.join(DIR, 'TITLELOT_JT.csv')

  if (!fs.existsSync(lotsPath)) { console.error('Missing: STAK Lots.csv'); process.exit(1) }
  if (!fs.existsSync(jtPath))   { console.error('Missing: TITLELOT_JT.csv'); process.exit(1) }

  console.log(`\n── HAUS Historical Lots Import ──────────────────────────`)
  console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN (no writes)' : '⚡ LIVE'}`)

  const lotsRaw = parseCSV(fs.readFileSync(lotsPath, 'utf8'))
  const jtRaw   = parseCSV(fs.readFileSync(jtPath,   'utf8'))
  console.log(`\nLots to import:     ${lotsRaw.length}`)
  console.log(`JT rows to import:  ${jtRaw.length}`)

  // ── Step 1: Add fm_pk column if needed ──────────────────────────────────
  if (!DRY_RUN) {
    await pool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS fm_pk TEXT`).catch(() => {})
    await pool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS sent_date DATE`).catch(() => {})
    await pool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS avid_bin TEXT`).catch(() => {})
    await pool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => {})
    await pool.query(`ALTER TABLE lots ADD COLUMN IF NOT EXISTS target_show TEXT`).catch(() => {})
    // Add unique constraint on fm_pk (ignore if already exists)
    await pool.query(`ALTER TABLE lots ADD CONSTRAINT lots_fm_pk_unique UNIQUE (fm_pk)`).catch(() => {})
    // Check lot_titles schema — if lot_id is UUID, drop and recreate with INTEGER
    const ltCols = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'lot_titles' ORDER BY ordinal_position
    `).catch(() => ({ rows: [] }))
    const lotIdCol = ltCols.rows.find(r => r.column_name === 'lot_id')
    if (lotIdCol && lotIdCol.data_type === 'uuid') {
      console.log('  ⚠️  lot_titles.lot_id is UUID — dropping and recreating with INTEGER')
      await pool.query(`DROP TABLE lot_titles`)
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lot_titles (
        lot_id   INTEGER NOT NULL,
        sku_root TEXT NOT NULL,
        added_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (lot_id, sku_root)
      )
    `)
    console.log('\n✅ Schema ready')
  } else {
    console.log('\n[dry-run] Would add fm_pk + target_show columns to lots')
  }

  // ── Step 2: Import lots ──────────────────────────────────────────────────
  console.log('\n── Importing lots…')
  const fmPkToLotId = {}  // e.g. { 'PL02': 5, 'PL01': 6, … }
  let lotsInserted = 0, lotsSkipped = 0, lotsUpdated = 0

  for (const row of lotsRaw) {
    const fmPk      = row['PK']?.trim()
    const lotName   = row['LOT NAME']?.trim()
    const client    = row['CLIENT']?.trim() || null
    const targetShow= row['TARGET SHOW']?.trim() || null
    const sentDate  = parseDate(row['SENT'])
    const avidBin   = row['AVID']?.trim() || null
    const notes     = row['NOTES']?.trim() || null
    const createdAt = parseDate(row['CREATION DATE'])

    if (!fmPk || !lotName) { lotsSkipped++; continue }

    if (DRY_RUN) {
      fmPkToLotId[fmPk] = `DRY_${fmPk}`
      continue
    }

    try {
      const r = await pool.query(`
        INSERT INTO lots (lot_name, client, sent_date, avid_bin, notes, target_show, lot_type, status, fm_pk, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'client', 'active', $7, $8)
        ON CONFLICT (fm_pk) DO UPDATE SET
          lot_name    = EXCLUDED.lot_name,
          client      = EXCLUDED.client,
          sent_date   = COALESCE(EXCLUDED.sent_date, lots.sent_date),
          avid_bin    = COALESCE(EXCLUDED.avid_bin, lots.avid_bin),
          notes       = COALESCE(EXCLUDED.notes, lots.notes),
          target_show = COALESCE(EXCLUDED.target_show, lots.target_show)
        RETURNING lot_id, (xmax = 0) AS inserted
      `, [lotName, client, sentDate, avidBin, notes, targetShow, fmPk, createdAt || new Date().toISOString()])

      if (r.rows.length) {
        const { lot_id, inserted } = r.rows[0]
        fmPkToLotId[fmPk] = lot_id
        if (inserted) lotsInserted++
        else lotsUpdated++
      }
    } catch (e) {
      console.error(`  ✗ lot ${fmPk} "${lotName}": ${e.message}`)
      lotsSkipped++
    }
  }

  if (DRY_RUN) {
    console.log(`[dry-run] Would upsert ${lotsRaw.length} lots`)
  } else {
    console.log(`  Inserted: ${lotsInserted}  Updated: ${lotsUpdated}  Skipped: ${lotsSkipped}`)
  }

  // ── Step 3: Import lot_titles join table ─────────────────────────────────
  console.log('\n── Importing lot_titles join table (batched)…')

  // Filter valid rows
  const validJT = []
  let jtBadLot = 0, jtBadSku = 0

  for (const row of jtRaw) {
    const fmPk   = row['PK']?.trim()
    const sku    = row['SKU']?.trim()
    const lotId  = fmPkToLotId[fmPk]
    const skuRoot= toSkuRoot(sku)

    if (!lotId || DRY_RUN && !fmPk) { jtBadLot++; continue }
    if (!skuRoot) { jtBadSku++; continue }

    validJT.push({ lotId, skuRoot })
  }

  if (DRY_RUN) {
    // Count what we'd do
    let dryBadLot = 0, dryBadSku = 0, dryGood = 0
    const seenFmPks = new Set(lotsRaw.map(r => r['PK']?.trim()))
    for (const row of jtRaw) {
      const fmPk = row['PK']?.trim()
      const sku  = row['SKU']?.trim()
      if (!seenFmPks.has(fmPk)) { dryBadLot++; continue }
      if (!toSkuRoot(sku)) { dryBadSku++; continue }
      dryGood++
    }
    console.log(`[dry-run] Would insert ~${dryGood} lot_titles rows`)
    console.log(`[dry-run] Skipped: ${dryBadLot} unknown lot PKs, ${dryBadSku} bad SKUs`)
    console.log('\n✅ Dry run complete — no data written')
    await pool.end(); return
  }

  console.log(`  Valid rows: ${validJT.length}  (skipped ${jtBadLot} unknown lots, ${jtBadSku} bad SKUs)`)

  // Batch insert in chunks of 500
  const BATCH = 500
  let jtInserted = 0, jtConflict = 0
  for (let i = 0; i < validJT.length; i += BATCH) {
    const chunk = validJT.slice(i, i + BATCH)
    const values = chunk.map((r, idx) => `($${idx*2+1}, $${idx*2+2})`).join(', ')
    const params = chunk.flatMap(r => [r.lotId, r.skuRoot])
    try {
      const r = await pool.query(
        `INSERT INTO lot_titles (lot_id, sku_root) VALUES ${values} ON CONFLICT DO NOTHING`,
        params
      )
      jtInserted += r.rowCount
      jtConflict += chunk.length - r.rowCount
    } catch (e) {
      console.error(`  ✗ batch at row ${i}: ${e.message}`)
    }

    if ((i / BATCH) % 20 === 0) {
      process.stdout.write(`  Progress: ${i + chunk.length}/${validJT.length}\r`)
    }
  }

  console.log(`\n  Inserted: ${jtInserted}  Already existed: ${jtConflict}`)

  // ── Summary ──────────────────────────────────────────────────────────────
  const lotCount = await pool.query('SELECT COUNT(*) FROM lots')
  const ltCount  = await pool.query('SELECT COUNT(*) FROM lot_titles')
  console.log(`\n── Final counts ─────────────────────────────────────────`)
  console.log(`  lots:       ${lotCount.rows[0].count}`)
  console.log(`  lot_titles: ${ltCount.rows[0].count}`)
  console.log('\n✅ Import complete')

  await pool.end()
}

run().catch(async e => {
  console.error('\n✗ Fatal:', e.message)
  await pool.end()
  process.exit(1)
})
