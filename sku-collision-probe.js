// sku-collision-probe.js
// Shows the 490 stemless 3-digit titles side-by-side with their
// 4-digit collision counterpart so you can confirm they're the same song.
//
//   node sku-collision-probe.js           — show first 50
//   node sku-collision-probe.js --all     — show all 490
//   node sku-collision-probe.js --csv     — export full list to collision-pairs.csv

const { Pool } = require('pg')
const fs = require('fs')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const SHOW_ALL = process.argv.includes('--all')
const CSV      = process.argv.includes('--csv')

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  SKU Collision Pair Review')
  console.log('══════════════════════════════════════════\n')

  const res = await pool.query(`
    SELECT
      t3.sku_root          AS ghost_sku,
      t3.title             AS ghost_title,
      t3.composer_id       AS ghost_composer,
      t4.sku_root          AS real_sku,
      t4.title             AS real_title,
      t4.composer_id       AS real_composer,
      CASE WHEN ms.sku_root IS NOT NULL THEN 'yes' ELSE 'no' END AS real_has_stems,
      CASE WHEN t3.title = t4.title THEN 'EXACT' ELSE 'DIFF' END AS title_match
    FROM titles t3
    LEFT JOIN mix_stems ms3 ON ms3.sku_root = t3.sku_root
    JOIN titles t4 ON t4.sku_root = t3.sku_root || '1'
    LEFT JOIN mix_stems ms ON ms.sku_root = t4.sku_root
    WHERE ms3.sku_root IS NULL
      AND t3.sku_root ~ '^[A-Z0-9]+[a-z]\\d{3}$'
    ORDER BY title_match DESC, t3.sku_root
  `)

  const rows = res.rows
  const exact = rows.filter(r => r.title_match === 'EXACT').length
  const diff  = rows.filter(r => r.title_match === 'DIFF').length

  console.log(`  Total collision pairs: ${rows.length}`)
  console.log(`  Exact title match:     ${exact}`)
  console.log(`  Title mismatch:        ${diff}  ← needs manual review\n`)

  if (diff > 0) {
    console.log('─── Title mismatches (review these carefully) ───\n')
    rows.filter(r => r.title_match === 'DIFF').forEach(r => {
      console.log(`  GHOST  ${r.ghost_sku.padEnd(12)} "${r.ghost_title}"`)
      console.log(`  REAL   ${r.real_sku.padEnd(12)} "${r.real_title}"  [stems: ${r.real_has_stems}]`)
      console.log()
    })
  }

  const limit = SHOW_ALL ? rows.length : 50
  console.log(`─── Exact matches (showing ${Math.min(exact, limit)} of ${exact}) ───\n`)
  rows.filter(r => r.title_match === 'EXACT').slice(0, limit).forEach(r => {
    console.log(`  ${r.ghost_sku.padEnd(12)} → ${r.real_sku.padEnd(14)} "${r.real_title}"  [stems: ${r.real_has_stems}]`)
  })

  if (CSV) {
    const lines = ['ghost_sku,ghost_title,real_sku,real_title,real_has_stems,title_match']
    rows.forEach(r => {
      const esc = v => `"${String(v).replace(/"/g,'""')}"`
      lines.push([r.ghost_sku, esc(r.ghost_title), r.real_sku, esc(r.real_title), r.real_has_stems, r.title_match].join(','))
    })
    fs.writeFileSync('collision-pairs.csv', lines.join('\n'))
    console.log('\n  → Saved collision-pairs.csv')
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[sku-collision-probe] Error:', e.message)
  await pool.end()
  process.exit(1)
})
