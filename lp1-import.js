// lp1-import.js
// Imports LP1.csv tracks into the playlist_tracks table.
// Run from haus-workspace: node lp1-import.js
// Optionally pass playlist name: node lp1-import.js "TEXWIV_Collection Pull 1"

const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const CONN = 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
const CSV  = path.join(__dirname, 'LP1.csv')

async function main() {
  const pool = new Pool({ connectionString: CONN, ssl: { rejectUnauthorized: false } })

  // Parse CSV — skip header, extract SKUROOT (col 1)
  const lines = fs.readFileSync(CSV, 'utf8').trim().split('\n').slice(1)
  const skus = lines.map(l => {
    const parts = l.split(',')
    return parts[1]?.trim()
  }).filter(Boolean)

  console.log(`Found ${skus.length} tracks in CSV`)

  // Find playlist — by name arg or list all to pick from
  const nameArg = process.argv[2]
  let playlist

  if (nameArg) {
    const res = await pool.query(`SELECT id, name FROM playlists WHERE name ILIKE $1 LIMIT 1`, [nameArg])
    playlist = res.rows[0]
  } else {
    // List all playlists so user can pick
    const res = await pool.query(`SELECT id, name FROM playlists ORDER BY name LIMIT 50`)
    console.log('\nAvailable playlists:')
    res.rows.forEach(r => console.log(`  [${r.id}] ${r.name}`))
    console.log('\nRe-run with playlist name: node lp1-import.js "Playlist Name"')
    await pool.end()
    return
  }

  if (!playlist) {
    console.error(`Playlist not found: "${nameArg}"`)
    await pool.end()
    return
  }

  console.log(`\nTarget playlist: [${playlist.id}] ${playlist.name}`)

  // Insert tracks with position
  let inserted = 0, skipped = 0, missing = 0
  for (let i = 0; i < skus.length; i++) {
    const sku = skus[i]

    // Verify title exists
    const check = await pool.query('SELECT 1 FROM titles WHERE sku_root=$1', [sku])
    if (!check.rows.length) {
      console.warn(`  ⚠ SKU not in titles: ${sku}`)
      missing++
      continue
    }

    const existing = await pool.query(
      'SELECT 1 FROM playlist_tracks WHERE playlist_id=$1 AND sku_root=$2',
      [playlist.id, sku]
    )
    if (existing.rows.length) {
      skipped++
      console.log(`  = ${sku} (already in playlist)`)
      continue
    }
    await pool.query(
      `INSERT INTO playlist_tracks (playlist_id, sku_root, position) VALUES ($1, $2, $3)`,
      [playlist.id, sku, i + 1]
    )
    inserted++
    console.log(`  + ${sku}`)
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed, ${missing} SKUs not found`)
  await pool.end()
}

main().catch(e => { console.error(e.message); process.exit(1) })
