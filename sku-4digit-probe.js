// sku-4digit-probe.js
// For composers with 1000+ songs, stemless titles with 4-digit sequences
// need album code appended (e.g. R13a1521 + 1 = R13a15211).
// This probes how many resolve that way, and checks for collisions.
//
//   node sku-4digit-probe.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  4-Digit SKU Stem Probe')
  console.log('══════════════════════════════════════════\n')

  // Stemless titles with a 4-digit sequence (composers over 1000 songs)
  const stemless4 = await pool.query(`
    SELECT t.sku_root, t.composer_id, t.title
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
      AND t.sku_root ~ '^[A-Z0-9]+[a-z]\\d{4}$'
    ORDER BY t.composer_id, t.sku_root
  `)

  const rows = stemless4.rows
  console.log(`  Stemless titles with 4-digit sku_root: ${rows.length}`)

  // Count by composer
  const byComposer = {}
  for (const r of rows) {
    byComposer[r.composer_id] = (byComposer[r.composer_id] || 0) + 1
  }
  console.log('\n  By composer:')
  Object.entries(byComposer).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => {
    console.log(`    ${c.padEnd(10)} ${n}`)
  })

  // Try appending '1'
  const roots    = rows.map(r => r.sku_root)
  const suffix1  = roots.map(r => r + '1')
  const suffix2  = roots.map(r => r + '2')

  const stems1 = await pool.query(
    `SELECT DISTINCT sku_root FROM mix_stems WHERE sku_root = ANY($1)`, [suffix1]
  )
  const stems2 = await pool.query(
    `SELECT DISTINCT sku_root FROM mix_stems WHERE sku_root = ANY($1)`, [suffix2]
  )

  const resolvedWith1 = new Set(stems1.rows.map(r => r.sku_root.slice(0,-1)))
  const resolvedWith2 = new Set(stems2.rows.map(r => r.sku_root.slice(0,-1)))
  const resolvedEither = new Set([...resolvedWith1, ...resolvedWith2])
  const unresolved = rows.filter(r => !resolvedEither.has(r.sku_root))

  console.log(`\n  Stems found under sku_root + '1': ${resolvedWith1.size}`)
  console.log(`  Stems found under sku_root + '2': ${resolvedWith2.size}`)
  console.log(`  Resolved by either:               ${resolvedEither.size}`)
  console.log(`  Still unresolved:                 ${unresolved.length}`)

  // Collision check for +'1'
  const col1 = await pool.query(
    `SELECT sku_root FROM titles WHERE sku_root = ANY($1)`, [suffix1]
  )
  console.log(`\n  Collision check +'1' vs titles: ${col1.rows.length}`)

  if (unresolved.length > 0 && unresolved.length <= 30) {
    console.log('\n  Unresolved:')
    unresolved.forEach(r => console.log(`    ${r.sku_root}  "${r.title}"`))
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[sku-4digit-probe] Error:', e.message)
  await pool.end()
  process.exit(1)
})
