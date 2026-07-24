// add-edm-subgenre.js
// Adds "EDM" as a sub-genre of Country
// Run: node add-edm-subgenre.js

const { Pool } = require('pg')
const CONN = process.env.DATABASE_URL || 'postgresql://neondb_owner:PASTE_NEW_PASSWORD_HERE@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'

async function main() {
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

  // Find Country primary genre
  const pg = await pool.query(`SELECT primary_genre_id, primary_genre_name FROM primary_genres WHERE lower(primary_genre_name) = 'country' LIMIT 1`)
  if (!pg.rows.length) {
    console.error('Country primary genre not found. Available genres:')
    const all = await pool.query(`SELECT primary_genre_id, primary_genre_name FROM primary_genres ORDER BY primary_genre_name`)
    all.rows.forEach(r => console.log(`  [${r.primary_genre_id}] ${r.primary_genre_name}`))
    await pool.end(); return
  }

  const { primary_genre_id, primary_genre_name } = pg.rows[0]
  console.log(`Found: [${primary_genre_id}] ${primary_genre_name}`)

  // Check if already exists
  const existing = await pool.query(
    `SELECT 1 FROM secondary_genres WHERE primary_genre_id=$1 AND lower(secondary_genre_name)='edm'`,
    [primary_genre_id]
  )
  if (existing.rows.length) { console.log('= EDM already exists under Country'); await pool.end(); return }

  await pool.query(
    `INSERT INTO secondary_genres (primary_genre_id, secondary_genre_name) VALUES ($1, 'EDM')`,
    [primary_genre_id]
  )
  console.log('✓ EDM added as sub-genre of Country')

  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
