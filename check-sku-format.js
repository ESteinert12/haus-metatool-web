const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' })

async function run() {
  // Show sample sku_roots from DB
  const sample = await pool.query('SELECT sku_root, title FROM titles WHERE description IS NULL LIMIT 10')
  console.log('DB sku_root samples (no description):')
  sample.rows.forEach(r => console.log(`  ${r.sku_root} | ${r.title}`))

  // Total tracks
  const total = await pool.query('SELECT COUNT(*) FROM titles')
  const withDesc = await pool.query("SELECT COUNT(*) FROM titles WHERE description IS NOT NULL AND description != ''")
  console.log(`\nTotal tracks: ${total.rows[0].count}`)
  console.log(`With description: ${withDesc.rows[0].count}`)

  // Try matching one CSV sku against DB
  const test = await pool.query("SELECT sku_root FROM titles WHERE sku_root = 'C46a0062' LIMIT 1")
  console.log(`\nDirect match for 'C46a0062': ${test.rows.length > 0 ? 'FOUND' : 'NOT FOUND'}`)

  // Try ILIKE
  const ilike = await pool.query("SELECT sku_root FROM titles WHERE sku_root ILIKE '%C46a%' LIMIT 5")
  console.log('ILIKE %C46a% matches:', ilike.rows.map(r => r.sku_root))

  await pool.end()
}
run().catch(async e => { console.error(e.message); pool.end() })
