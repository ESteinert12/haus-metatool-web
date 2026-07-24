// sku-suffix-probe.js
// Tests the theory: stemless titles with 3-digit sku_roots may have their
// stems stored under sku_root + '1' (the albumDigit suffix).
//
//   node sku-suffix-probe.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  SKU Suffix Probe')
  console.log('══════════════════════════════════════════\n')

  // Get stemless titles with a 3-digit sequence (canonical format, no suffix)
  const stemless = await pool.query(`
    SELECT t.sku_root
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
      AND t.sku_root ~ '^[A-Z0-9]+[a-z]\\d{3}$'
    ORDER BY t.sku_root
  `)

  const roots = stemless.rows.map(r => r.sku_root)
  const suffixed = roots.map(r => r + '1')

  console.log(`  Stemless titles with 3-digit sku_root: ${roots.length}`)

  // How many of those suffixed SKUs exist in mix_stems?
  const inStems = await pool.query(`
    SELECT sku_root FROM mix_stems
    WHERE sku_root = ANY($1)
  `, [suffixed])

  console.log(`  Of those, stems found under sku_root + '1': ${inStems.rows.length}`)

  if (inStems.rows.length > 0) {
    console.log('\n  Sample matches (title sku_root → stem sku_root):')
    inStems.rows.slice(0, 10).forEach(r => {
      const base = r.sku_root.slice(0, -1)
      console.log(`    ${base} → ${r.sku_root}`)
    })
  }

  // Collision check — would any of the suffixed SKUs conflict with an existing title?
  const collisions = await pool.query(`
    SELECT sku_root FROM titles
    WHERE sku_root = ANY($1)
  `, [suffixed])

  console.log(`\n  Collision check — suffixed SKUs already in titles: ${collisions.rows.length}`)
  if (collisions.rows.length > 0) {
    console.log('  ⚠  These would collide (cannot rename):')
    collisions.rows.slice(0, 10).forEach(r => console.log(`    ${r.sku_root}`))
  }

  // Summary
  console.log('\n──────────────────────────────────────────')
  const matchPct = roots.length > 0
    ? ((inStems.rows.length / roots.length) * 100).toFixed(1)
    : 0
  console.log(`  ${inStems.rows.length} / ${roots.length} stemless titles would get stems by appending '1' (${matchPct}%)`)
  console.log(`  ${collisions.rows.length} collisions would need to be resolved first`)
  console.log('══════════════════════════════════════════\n')

  await pool.end()
}

run().catch(async e => {
  console.error('[sku-suffix-probe] Error:', e.message)
  await pool.end()
  process.exit(1)
})
