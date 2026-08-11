#!/usr/bin/env node

const { Pool } = require('pg')

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_VWPl7U3kYwJb@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
})

const MISSING_SONGS = [
  { sku: 'R48a5624', title: 'Breaking Ground', composer_id: 'R48a', key: 'A', bpm: 60 },
  { sku: 'R48a5634', title: 'Buck Eyes', composer_id: 'R48a', key: 'G', bpm: 125 },
  { sku: 'R48a5644', title: 'Buckle Up Cowboy', composer_id: 'R48a', key: 'TEX', bpm: 130 },
  { sku: 'R48a5654', title: 'Diamond Boots', composer_id: 'R48a', key: 'Fsharp', bpm: 130 },
  { sku: 'R48a5664', title: "Stompin' Out", composer_id: 'R48a', key: 'G', bpm: 130 },
  { sku: 'R48a5684', title: 'Midnight Mesa', composer_id: 'R48a', key: 'E', bpm: 100 },
  { sku: 'R48a5694', title: 'Texas Proud', composer_id: 'R48a', key: 'G', bpm: 130 },
  { sku: 'R48a5734', title: 'Making My Day', composer_id: 'R48a', key: 'TEX', bpm: 91 },
  { sku: 'R82a8904', title: 'Midnight Confession', composer_id: 'R82a', key: 'A', bpm: 68 },
  { sku: 'R85c0044', title: 'High Beaming', composer_id: 'R85c', key: 'C', bpm: 120 },
  { sku: 'S20d1194', title: 'Pickin Daisy', composer_id: 'S20D', key: 'G', bpm: 120 },
  { sku: 'S33a49234', title: "We Can't Hide Away", composer_id: 'S33a', key: 'Csharpm', bpm: 67 },
  { sku: 'S73r1314', title: 'Breachball', composer_id: 'S73r', key: 'D', bpm: 77 },
  { sku: 'T55a0154', title: 'Heartland Hustle', composer_id: 'T55a', key: 'Fsharpm', bpm: 75 }
]

async function run() {
  try {
    console.log('Finding Texas Wives 6 lot...')
    const lotRes = await pool.query(
      "SELECT id FROM lots WHERE name ILIKE '%TEXAS WIVES%6%' OR description ILIKE '%260729%'"
    )

    if (lotRes.rows.length === 0) {
      console.error('ERROR: Texas Wives 6 lot not found')
      process.exit(1)
    }

    const lotId = lotRes.rows[0].id
    console.log(`Found lot_id: ${lotId}\n`)

    let inserted = 0
    let skipped = 0

    for (const song of MISSING_SONGS) {
      // Check if SKU already exists
      const existing = await pool.query('SELECT id FROM titles WHERE sku = $1', [song.sku])

      if (existing.rows.length > 0) {
        console.log(`⊘ SKIP ${song.sku}: Already in database`)
        skipped++
        continue
      }

      // Insert title
      const res = await pool.query(
        `INSERT INTO titles (lot_id, sku, title, key, composers, bpm_target)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [lotId, song.sku, song.title, song.key, song.composer_id, song.bpm]
      )

      const titleId = res.rows[0].id
      console.log(`✓ INSERT ${song.sku}: ${song.title} (title_id: ${titleId})`)
      inserted++
    }

    console.log(`\n=== SUMMARY ===`)
    console.log(`Inserted: ${inserted}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Total: ${inserted + skipped}`)

    await pool.end()
  } catch (err) {
    console.error('ERROR:', err.message)
    process.exit(1)
  }
}

run()
