// db-diagnose.js
// Quick diagnostic: understand current sku_root length distribution
// in titles vs mix_stems to diagnose mismatch.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  DB Diagnostic — SKU Length Distribution')
  console.log('══════════════════════════════════════════\n')

  // Title sku_root length distribution
  const titleLengths = await pool.query(`
    SELECT length(sku_root) AS len, COUNT(*) AS cnt
    FROM titles
    GROUP BY len ORDER BY len
  `)
  console.log('TITLES — sku_root length distribution:')
  titleLengths.rows.forEach(r => console.log(`  ${r.len} chars: ${r.cnt}`))

  // Stem sku_root length distribution
  const stemLengths = await pool.query(`
    SELECT length(sku_root) AS len, COUNT(*) AS cnt
    FROM mix_stems
    GROUP BY len ORDER BY len
  `)
  console.log('\nMIX_STEMS — sku_root length distribution:')
  stemLengths.rows.forEach(r => console.log(`  ${r.len} chars: ${r.cnt}`))

  // How many stems actually match a title?
  const matched = await pool.query(`
    SELECT COUNT(*) AS n FROM mix_stems ms
    INNER JOIN titles t ON t.sku_root = ms.sku_root
  `)
  console.log(`\nStems that match a title: ${matched.rows[0].n}`)

  // Sample orphaned stems — what do they look like?
  const orphanSample = await pool.query(`
    SELECT ms.sku_root, length(ms.sku_root) AS len
    FROM mix_stems ms
    LEFT JOIN titles t ON t.sku_root = ms.sku_root
    WHERE t.sku_root IS NULL
    GROUP BY ms.sku_root, len
    ORDER BY len, ms.sku_root
    LIMIT 20
  `)
  console.log('\nSample orphaned stem sku_roots (first 20):')
  orphanSample.rows.forEach(r => console.log(`  "${r.sku_root}" (${r.len} chars)`))

  // Sample stemless titles — what do they look like?
  const stemlessSample = await pool.query(`
    SELECT t.sku_root, length(t.sku_root) AS len, t.composer_id
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
    ORDER BY t.composer_id, t.sku_root
    LIMIT 20
  `)
  console.log('\nSample stemless title sku_roots (first 20):')
  stemlessSample.rows.forEach(r => console.log(`  "${r.sku_root}" (${r.len} chars)  [${r.composer_id}]`))

  // Cross-check: for stemless titles, do stems exist under sku_root + '1' or sku_root + '2'?
  const stemlessRoots = stemlessSample.rows.map(r => r.sku_root)
  const with1 = stemlessRoots.map(s => s + '1')
  const with2 = stemlessRoots.map(s => s + '2')

  const found1 = await pool.query(
    `SELECT DISTINCT sku_root FROM mix_stems WHERE sku_root = ANY($1)`, [with1]
  )
  const found2 = await pool.query(
    `SELECT DISTINCT sku_root FROM mix_stems WHERE sku_root = ANY($1)`, [with2]
  )
  console.log(`\nOf the 20 sampled stemless titles:`)
  console.log(`  ${found1.rows.length} have stems under sku_root + '1'`)
  console.log(`  ${found2.rows.length} have stems under sku_root + '2'`)
  if (found1.rows.length > 0) {
    console.log('  Examples (sku_root+1 found in mix_stems):')
    found1.rows.slice(0, 5).forEach(r => console.log(`    ${r.sku_root}`))
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[diagnose] Error:', e.message)
  await pool.end()
  process.exit(1)
})
