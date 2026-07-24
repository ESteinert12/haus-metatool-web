// sku-suffix2-probe.js
// For the 490 stemless titles that collide when appending '1',
// tries appending '2' instead to see if their stems live there.
//
//   node sku-suffix2-probe.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  SKU Suffix-2 Probe (collision subset)')
  console.log('══════════════════════════════════════════\n')

  // The collision subset: stemless 3-digit roots where root+'1' already exists in titles
  const collisions = await pool.query(`
    SELECT t3.sku_root
    FROM titles t3
    LEFT JOIN mix_stems ms3 ON ms3.sku_root = t3.sku_root
    JOIN titles t4 ON t4.sku_root = t3.sku_root || '1'
    WHERE ms3.sku_root IS NULL
      AND t3.sku_root ~ '^[A-Z0-9]+[a-z]\\d{3}$'
  `)

  const roots    = collisions.rows.map(r => r.sku_root)
  const suffixed = roots.map(r => r + '2')

  console.log(`  Collision subset size: ${roots.length}`)

  // How many of those +'2' SKUs exist in mix_stems?
  const inStems = await pool.query(`
    SELECT DISTINCT sku_root FROM mix_stems WHERE sku_root = ANY($1)
  `, [suffixed])
  console.log(`  Stems found under sku_root + '2': ${inStems.rows.length}`)

  if (inStems.rows.length > 0) {
    console.log('\n  Sample matches:')
    inStems.rows.slice(0, 10).forEach(r => {
      const base = r.sku_root.slice(0, -1)
      console.log(`    ${base} → ${r.sku_root}`)
    })
  }

  // Collision check for +'2' against existing titles
  const titleCollisions = await pool.query(`
    SELECT sku_root FROM titles WHERE sku_root = ANY($1)
  `, [suffixed])
  console.log(`\n  Collision check — +'2' SKUs already in titles: ${titleCollisions.rows.length}`)
  if (titleCollisions.rows.length > 0) {
    titleCollisions.rows.slice(0, 10).forEach(r => console.log(`    ⚠  ${r.sku_root}`))
  }

  // What's left unresolved after both passes
  const resolvedWith2 = new Set(inStems.rows.map(r => r.sku_root.slice(0, -1)))
  const stillUnresolved = roots.filter(r => !resolvedWith2.has(r))
  console.log(`\n  Still unresolved after both passes: ${stillUnresolved.length}`)
  if (stillUnresolved.length > 0 && stillUnresolved.length <= 20) {
    stillUnresolved.forEach(r => console.log(`    ${r}`))
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[sku-suffix2-probe] Error:', e.message)
  await pool.end()
  process.exit(1)
})
