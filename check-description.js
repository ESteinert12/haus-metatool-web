// check-description.js
// Checks if description column exists and how many tracks have data in it.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  // Check if column exists
  const col = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='titles' AND column_name='description'
  `)
  if (col.rows.length === 0) {
    console.log('✗ description column does not exist yet — run: node add-description.js')
    await pool.end(); return
  }
  console.log('✓ description column exists')

  // Check fill rate
  const stats = await pool.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(description) AS with_desc,
      COUNT(*) - COUNT(description) AS missing
    FROM titles
  `)
  const { total, with_desc, missing } = stats.rows[0]
  console.log(`  Total tracks:       ${total}`)
  console.log(`  Have description:   ${with_desc}`)
  console.log(`  Missing:            ${missing}`)

  // Show a sample
  if (parseInt(with_desc) > 0) {
    const sample = await pool.query(`SELECT sku_root, title, description FROM titles WHERE description IS NOT NULL LIMIT 3`)
    console.log('\nSample:')
    sample.rows.forEach(r => console.log(`  ${r.sku_root} | ${r.title}\n    "${r.description}"`))
  }

  // Check if local titles table had a description-like column by listing all titles columns
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='titles'
    ORDER BY ordinal_position
  `)
  console.log('\nAll titles columns:', cols.rows.map(r => r.column_name).join(', '))

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
