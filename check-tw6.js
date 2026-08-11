const { Pool } = require('pg')
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require' })

async function run() {
  try {
    // Find Texas Wives 6 lot
    const lotRes = await pool.query(
      "SELECT id, name, description, created_at FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' OR description ILIKE '%260729%'"
    )

    if (lotRes.rows.length === 0) {
      console.log('Texas Wives 6 lot not found')
      await pool.end()
      return
    }

    const lot = lotRes.rows[0]
    console.log('TEXAS WIVES 6 LOT:')
    console.log(`  ID: ${lot.id}`)
    console.log(`  Name: ${lot.name}`)
    console.log(`  Description: ${lot.description}`)
    console.log(`  Created: ${lot.created_at}`)

    // Get titles in this lot
    const titlesRes = await pool.query(
      'SELECT id, sku, title, key, composers FROM titles WHERE lot_id = $1 ORDER BY sku',
      [lot.id]
    )

    console.log(`\n\nTITLES IN LOT: ${titlesRes.rows.length} found`)
    console.log('─'.repeat(80))
    titlesRes.rows.forEach(t => {
      console.log(`  ${t.sku.padEnd(12)} | ${t.title.padEnd(40)} | ${(t.key || '').padEnd(8)} | composers: ${t.composers}`)
    })

    // Get mix_stems for this lot
    const stemsRes = await pool.query(`
      SELECT ms.id, ms.title_id, t.sku, ms.stem_type, ms.b2_key, ms.duration_s
      FROM mix_stems ms
      JOIN titles t ON ms.title_id = t.id
      WHERE t.lot_id = $1
      ORDER BY t.sku, ms.stem_type
    `, [lot.id])

    console.log(`\n\nMIX STEMS IN LOT: ${stemsRes.rows.length} found`)
    console.log('─'.repeat(100))
    stemsRes.rows.forEach(s => {
      console.log(`  ${s.sku.padEnd(12)} | ${s.stem_type.padEnd(12)} | duration: ${(s.duration_s || '?').toString().padEnd(6)} | ${s.b2_key}`)
    })

    // Summary by stem type
    const stemSummary = await pool.query(`
      SELECT ms.stem_type, COUNT(*) as count
      FROM mix_stems ms
      JOIN titles t ON ms.title_id = t.id
      WHERE t.lot_id = $1
      GROUP BY ms.stem_type
      ORDER BY stem_type
    `, [lot.id])

    console.log(`\n\nSTEM TYPES SUMMARY:`)
    stemSummary.rows.forEach(s => {
      console.log(`  ${s.stem_type.padEnd(12)}: ${s.count}`)
    })

  } catch (err) {
    console.error('ERROR:', err.message)
  } finally {
    await pool.end()
  }
}

run()
