// check-missing-wavs.js
const { Pool } = require('pg')
const CONN = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'

const SKUS = ['R82a8854', 'S20d1064', 'S20d1074']

async function main() {
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

  for (const sku of SKUS) {
    console.log(`\n── ${sku} ──`)

    const title = await pool.query(`SELECT title, key, composer_id, created_at FROM titles WHERE sku_root=$1`, [sku])
    if (title.rows.length) {
      const t = title.rows[0]
      console.log(`  Title:    ${t.title}`)
      console.log(`  Key:      ${t.key}`)
      console.log(`  Composer: ${t.composer_id}`)
      console.log(`  Created:  ${t.created_at}`)
    } else {
      console.log('  ⚠ Not found in titles table')
    }

    const stems = await pool.query(`SELECT filename, b2_key, created_at FROM mix_stems WHERE sku_root=$1 ORDER BY filename`, [sku])
    if (stems.rows.length) {
      console.log(`  mix_stems (${stems.rows.length}):`)
      stems.rows.forEach(s => console.log(`    ${s.filename}${s.b2_key ? ' [B2: ' + s.b2_key + ']' : ''}`))
    } else {
      console.log('  mix_stems: none')
    }

    const lots = await pool.query(
      `SELECT l.lot_name FROM lot_titles lt JOIN lots l ON l.lot_id=lt.lot_id WHERE lt.sku_root=$1`, [sku]
    )
    if (lots.rows.length) {
      console.log(`  Lot:      ${lots.rows.map(r => r.lot_name).join(', ')}`)
    } else {
      console.log('  Lot:      none')
    }
  }

  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
