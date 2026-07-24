// One-time fix: insert Mood Ring Blues which was processed but DB write failed
// Run: node insert-mood-ring-blues.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

async function run() {
  // Resolve lot_id
  const lotRows = await pool.query(`SELECT lot_id FROM lots WHERE lot_name = $1`, ['260619_FirstTest'])
  if (!lotRows.rows.length) {
    console.error('Lot "260619_FirstTest" not found — check lot name')
    await pool.end(); return
  }
  const lotId = lotRows.rows[0].lot_id
  console.log(`lot_id = ${lotId}`)

  // Resolve team_id for R82b
  const teamRows = await pool.query(`SELECT team_id FROM teams WHERE composer_full_id = $1`, ['R82b'])
  const teamId = teamRows.rows[0]?.team_id || null
  console.log(`team_id = ${teamId}`)

  // Insert title
  const result = await pool.query(`
    INSERT INTO titles (sku_root, lot_id, composer_id, team_id, variant, title, key, bpm, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'a', $5, $6, NULL, now(), now())
    RETURNING sku_root
  `, ['R82b0604', lotId, 'R82b', teamId, 'Mood Ring Blues', 'Bb'])

  console.log(`✅ Inserted: ${result.rows[0].sku_root} — Mood Ring Blues`)
  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
})
