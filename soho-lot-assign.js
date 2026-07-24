// soho-lot-assign.js
// Reads SOHO_LotAssign.csv and inserts rows into lot_titles,
// creating lots in the lots table if they don't already exist.
// Run from haus-workspace: node soho-lot-assign.js

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const CONN = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const CSV  = path.join(__dirname, 'SOHO_LotAssign.csv')

async function main() {
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

  // Parse CSV
  const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1) // skip header
  const rows = lines.map(l => {
    const comma = l.indexOf(',')
    return { sku: l.slice(0, comma).trim(), lot: l.slice(comma + 1).trim() }
  })

  // Get unique lot names
  const lotNames = [...new Set(rows.map(r => r.lot))]
  console.log(`Found ${rows.length} tracks across ${lotNames.length} lots`)

  // For each lot name, find or create in lots table
  const lotIdMap = {}
  for (const name of lotNames) {
    const existing = await pool.query('SELECT lot_id FROM lots WHERE lot_name = $1 LIMIT 1', [name])
    if (existing.rows.length) {
      lotIdMap[name] = existing.rows[0].lot_id
      console.log(`  ✓ Found lot: ${name} (${lotIdMap[name]})`)
    } else {
      const ins = await pool.query(
        `INSERT INTO lots (lot_name, created_at) VALUES ($1, NOW()) RETURNING lot_id`,
        [name]
      )
      lotIdMap[name] = ins.rows[0].lot_id
      console.log(`  + Created lot: ${name} (${lotIdMap[name]})`)
    }
  }

  // Insert lot_titles rows
  let inserted = 0, skipped = 0, missing = 0
  for (const { sku, lot } of rows) {
    const lotId = lotIdMap[lot]
    if (!lotId) { missing++; continue }

    // Check if title exists
    const titleCheck = await pool.query('SELECT 1 FROM titles WHERE sku_root = $1', [sku])
    if (!titleCheck.rows.length) {
      console.warn(`  ⚠ SKU not in titles table: ${sku}`)
      missing++
      continue
    }

    const result = await pool.query(
      `INSERT INTO lot_titles (sku_root, lot_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [sku, lotId]
    )
    if (result.rowCount > 0) inserted++
    else skipped++
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed, ${missing} skipped (SKU not found)`)
  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
