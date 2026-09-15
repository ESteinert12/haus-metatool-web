// add-description.js
// Adds a description column to the titles table.
// Run: node add-description.js

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

async function run() {
  await pool.query(`ALTER TABLE titles ADD COLUMN IF NOT EXISTS description TEXT`)
  console.log('✓ description column added to titles')
  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
