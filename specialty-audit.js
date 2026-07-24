// specialty-audit.js
// Counts specialty-prefix titles across the FULL titles table (not just stemless).
// Shows counts per prefix and whether they have mix_stems or not.
//
//   node specialty-audit.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const PREFIXES = ['GST', 'HST', 'DST', 'DB', 'SIB']

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Specialty Track Audit — Full Catalog')
  console.log('══════════════════════════════════════════\n')

  for (const prefix of PREFIXES) {
    const res = await pool.query(`
      SELECT
        COUNT(*)                                             AS total,
        COUNT(ms.sku_root)                                   AS with_stems,
        COUNT(*) - COUNT(ms.sku_root)                        AS without_stems
      FROM titles t
      LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
      WHERE t.title ILIKE $1
    `, [`${prefix} %`])

    const { total, with_stems, without_stems } = res.rows[0]
    console.log(`  ${prefix.padEnd(6)} total=${total}  with_stems=${with_stems}  stemless=${without_stems}`)
  }

  // Also show any other short uppercase prefix patterns we might have missed
  console.log('\n─── Other short-prefix groups (≥5 titles) ───\n')
  const others = await pool.query(`
    SELECT
      split_part(title, ' ', 1) AS prefix,
      COUNT(*) AS total
    FROM titles
    WHERE title ~ '^[A-Z]{2,4} '
    GROUP BY prefix
    HAVING COUNT(*) >= 5
    ORDER BY total DESC
  `)
  others.rows.forEach(r => {
    if (!PREFIXES.includes(r.prefix)) {
      console.log(`  ${r.prefix.padEnd(6)} ${r.total} titles`)
    }
  })

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[specialty-audit] Error:', e.message)
  await pool.end()
  process.exit(1)
})
