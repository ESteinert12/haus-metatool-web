// sku-unresolved-probe.js
// Investigates the 14 stemless titles that don't resolve with +1 or +2.
// Tries suffixes 3-9 and also shows what titles/stems already exist
// for those base SKUs so we can understand the full picture.
//
//   node sku-unresolved-probe.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const UNRESOLVED = [
  'R13a152','R13a155','R13a153','R13a154','R13a156',
  'R13a157','R13a150','R13a151','S33a190','R13a158',
  'S33a187','R13a122','R13a101','R13a159'
]

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Unresolved SKU Deep Probe')
  console.log('══════════════════════════════════════════\n')

  for (const root of UNRESOLVED) {
    // Get the ghost title
    const ghost = await pool.query(
      `SELECT title, composer_id, lot_id FROM titles WHERE sku_root = $1`, [root]
    )
    const g = ghost.rows[0]
    console.log(`\n  ${root}  "${g?.title}"  composer=${g?.composer_id}  lot=${g?.lot_id}`)

    // Check suffixes 1–9 in both titles and mix_stems
    for (const d of ['1','2','3','4','5','6','7','8','9']) {
      const suffixed = root + d
      const inTitles = await pool.query(
        `SELECT title FROM titles WHERE sku_root = $1`, [suffixed]
      )
      const inStems = await pool.query(
        `SELECT COUNT(*) AS n FROM mix_stems WHERE sku_root = $1`, [suffixed]
      )
      const stemCount = parseInt(inStems.rows[0].n)
      if (inTitles.rows.length > 0 || stemCount > 0) {
        const titleStr = inTitles.rows[0] ? `"${inTitles.rows[0].title}"` : '(no title)'
        console.log(`    +${d} → ${suffixed}  title=${titleStr}  stems=${stemCount}`)
      }
    }
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[sku-unresolved-probe] Error:', e.message)
  await pool.end()
  process.exit(1)
})
