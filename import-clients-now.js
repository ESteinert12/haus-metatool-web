const { Pool } = require('pg')
const fs = require('fs')

const CONN = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const pool = new Pool({ connectionString: CONN })

async function run() {
  try {
    const csvPath = '/sessions/cool-loving-goodall/mnt/uploads/CLIENTS.csv'
    const csv = fs.readFileSync(csvPath, 'utf8')
    const lines = csv.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())
    
    console.log('Importing clients...')
    let inserted = 0
    
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',')
      const obj = {}
      headers.forEach((h, idx) => {
        obj[h] = (parts[idx] || '').trim()
      })
      
      const { PK, CLIENT, CITY, State, Country, Contact } = obj
      if (!PK || !CLIENT) continue
      
      try {
        const result = await pool.query(
          `INSERT INTO clients (fm_pk, name, city, state, country, contact, active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           ON CONFLICT (fm_pk) DO NOTHING`,
          [PK, CLIENT, CITY || null, State || null, Country || null, Contact || null]
        )
        if (result.rowCount) inserted++
      } catch (e) {
        console.log(`  Error on ${PK}: ${e.message}`)
      }
    }
    
    console.log(`✓ Imported ${inserted} clients`)
    const count = await pool.query('SELECT COUNT(*) FROM clients')
    console.log(`Total clients in DB: ${count.rows[0].count}`)
    await pool.end()
  } catch (e) {
    console.error(e.message)
    await pool.end()
    process.exit(1)
  }
}

run()
