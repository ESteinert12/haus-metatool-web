#!/usr/bin/env node
// Show (and optionally delete) lots that have no titles linked to them.
// Usage:
//   node clean-lots.js         — list empty lots
//   node clean-lots.js --apply — delete them

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const APPLY = process.argv.includes('--apply')

async function run() {
  console.log(`\n── Empty Lot Cleanup ─────────────────────────────────────`)
  console.log(`Mode: ${APPLY ? '⚠️  APPLY (deletes rows)' : '🔍 DRY RUN'}`)

  const rows = await pool.query(`
    SELECT l.lot_id, l.lot_name,
           COUNT(t.sku_root) AS title_count
    FROM lots l
    LEFT JOIN titles t ON t.lot_id = l.lot_id
    GROUP BY l.lot_id, l.lot_name
    HAVING COUNT(t.sku_root) = 0
    ORDER BY l.lot_name
  `)

  if (!rows.rows.length) {
    console.log('\nNo empty lots found — nothing to clean up.')
    await pool.end(); return
  }

  console.log(`\nEmpty lots (${rows.rows.length}):`)
  rows.rows.forEach(r => console.log(`  [${r.lot_id}] ${r.lot_name}`))

  if (!APPLY) {
    console.log('\n── DRY RUN — run with --apply to delete these lots ──')
    await pool.end(); return
  }

  const ids = rows.rows.map(r => r.lot_id)
  await pool.query(`DELETE FROM lots WHERE lot_id = ANY($1)`, [ids])
  console.log(`\n✅ Deleted ${ids.length} empty lots.`)

  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
