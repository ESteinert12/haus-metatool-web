#!/usr/bin/env node
// List all lots with title counts and current status
// Usage:
//   node list-lots.js
//   node list-lots.js --mark-shipping "BRAVO4 INTAKE LOT"   — mark a lot as active (shipping target)
//   node list-lots.js --mark-staging "260626_Kyle 2"         — mark a lot as staging (hide from dropdown)

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  const markShipping = process.argv.indexOf('--mark-shipping')
  const markStaging  = process.argv.indexOf('--mark-staging')

  if (markShipping > -1) {
    const name = process.argv[markShipping + 1]
    await pool.query(`UPDATE lots SET status='active' WHERE lot_name=$1`, [name])
    console.log(`✅ Marked as shipping target (status=active): "${name}"`)
    await pool.end(); return
  }

  if (markStaging > -1) {
    const name = process.argv[markStaging + 1]
    await pool.query(`UPDATE lots SET status='staging' WHERE lot_name=$1`, [name])
    console.log(`✅ Marked as staging lot (status=staging): "${name}"`)
    await pool.end(); return
  }

  const rows = await pool.query(`
    SELECT l.lot_id, l.lot_name, l.status,
           COUNT(t.sku_root) AS title_count
    FROM lots l
    LEFT JOIN titles t ON t.lot_id = l.lot_id
    GROUP BY l.lot_id, l.lot_name, l.status
    ORDER BY l.status NULLS LAST, l.lot_name
  `)

  console.log(`\n${'ID'.padEnd(6)} ${'STATUS'.padEnd(10)} ${'TITLES'.padEnd(8)} LOT NAME`)
  console.log('─'.repeat(70))
  rows.rows.forEach(r => {
    const status = (r.status || 'null').padEnd(10)
    const count  = String(r.title_count).padEnd(8)
    console.log(`${String(r.lot_id).padEnd(6)} ${status} ${count} ${r.lot_name}`)
  })
  console.log(`\nTotal: ${rows.rows.length} lots`)
  console.log('\nTo mark a lot as a shipping target:')
  console.log('  node list-lots.js --mark-shipping "Lot Name Here"')
  console.log('To hide a lot from the intake dropdown:')
  console.log('  node list-lots.js --mark-staging "Lot Name Here"')

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end(); process.exit(1) })
