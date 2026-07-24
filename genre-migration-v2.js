// genre-migration-v2.js
// Fixes uppercase/lowercase genre naming and merges split rows.
//
// Type A: Both UPPERCASE (subgenres, no tracks) + lowercase (tracks, no subgenres) exist
//         → Move tracks to uppercase row, delete lowercase row
// Type B: Only lowercase exists (has tracks + subgenres)
//         → Rename to UPPERCASE
//
// Run: node genre-migration-v2.js          (dry run)
//      node genre-migration-v2.js --execute (apply changes)

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')

// These primary genres should keep their mixed case exactly as-is
const KEEP_AS_IS = new Set([
  "50's Rock and Pop",
  "60's Rock and Pop",
  "80's Rock and Pop",
  "FILM SCORE_Action",
  "FILM SCORE_Adventure",
  "FILM SCORE_Battle",
  "FILM SCORE_Comic Light Tension",
  "FILM SCORE_Creepy Scary",
  "FILM SCORE_Defeated",
  "FILM SCORE_Dramatic Builds",
  "FILM SCORE_Dramatic Tension",
  "FILM SCORE_Epic",
  "FILM SCORE_Fanfares",
  "FILM SCORE_Fantasy_Magical",
  "FILM SCORE_Final Reel Triumphant",
  "FILM SCORE_Intrigue",
  "FILM SCORE_Light Tension",
  "FILM SCORE_Melancholic",
  "FILM SCORE_Mysterious",
  "FILM SCORE_Regal",
  "FILM SCORE_Romantic",
  "FILM SCORE_Serious",
  "FILM SCORE_Sports Package",
  "FILM SCORE_Tense Beat",
  "FILM SCORE_Tense Drone",
  "FILM SCORE_Tense Pulse",
  "FILM SCORE_Tension",
  "FILM SCORE_Uplifting",
  "FILM SCORE_Western",
  "FILM SCORE_Whimsical",
  "HOUSE",
  "ORCHESTRAL",
  "SFX",
])

async function run() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — no changes written. Add --execute to apply.\n'
    : '⚡ EXECUTE MODE\n'
  )

  const all = await pool.query('SELECT primary_genre_id, primary_genre_name FROM primary_genres ORDER BY primary_genre_id')
  const genres = all.rows

  // Build lookup: UPPER(name) → list of rows
  const byUpper = {}
  for (const g of genres) {
    const key = g.primary_genre_name.toUpperCase()
    if (!byUpper[key]) byUpper[key] = []
    byUpper[key].push(g)
  }

  let typeA = 0, typeB = 0

  for (const [upperKey, rows] of Object.entries(byUpper)) {
    if (rows.length === 1) {
      const g = rows[0]
      // Skip if already uppercase or in keep-as-is list
      if (KEEP_AS_IS.has(g.primary_genre_name)) continue
      if (g.primary_genre_name === g.primary_genre_name.toUpperCase()) continue

      // Type B: only one row, not uppercase → rename it
      const newName = g.primary_genre_name.toUpperCase()
      // Special cases that shouldn't be fully uppercased
      // (Hip Hop/Rap → HIP HOP/RAP is fine, World-Ethnic → WORLD-ETHNIC is fine)
      console.log(`  TYPE B  rename  "${g.primary_genre_name}" → "${newName}"  (id=${g.primary_genre_id})`)
      if (!DRY_RUN) {
        await pool.query(
          'UPDATE primary_genres SET primary_genre_name = $1 WHERE primary_genre_id = $2',
          [newName, g.primary_genre_id]
        )
      }
      typeB++
    } else {
      // Multiple rows with same uppercase key
      // Find the uppercase row (the "real" one with subgenres)
      const ucRow = rows.find(r => r.primary_genre_name === r.primary_genre_name.toUpperCase())
      const lcRows = rows.filter(r => r !== ucRow)

      if (!ucRow) {
        // All are mixed-case, keep lowest ID, rename to uppercase, delete rest
        rows.sort((a, b) => a.primary_genre_id - b.primary_genre_id)
        const keep = rows[0]
        const del = rows.slice(1)
        const newName = keep.primary_genre_name.toUpperCase()
        if (!KEEP_AS_IS.has(keep.primary_genre_name)) {
          console.log(`  MERGE   rename  "${keep.primary_genre_name}" → "${newName}"  (id=${keep.primary_genre_id})`)
          if (!DRY_RUN) {
            await pool.query('UPDATE primary_genres SET primary_genre_name=$1 WHERE primary_genre_id=$2', [newName, keep.primary_genre_id])
          }
        }
        for (const d of del) {
          console.log(`  MERGE   delete  "${d.primary_genre_name}"  (id=${d.primary_genre_id}) — duplicate`)
          if (!DRY_RUN) {
            await pool.query('UPDATE titles SET primary_genre_id=$1 WHERE primary_genre_id=$2', [keep.primary_genre_id, d.primary_genre_id])
            await pool.query('DELETE FROM primary_genres WHERE primary_genre_id=$1', [d.primary_genre_id])
          }
        }
        continue
      }

      if (KEEP_AS_IS.has(ucRow.primary_genre_name)) continue

      // Type A: uppercase row (subgenres) + lowercase row(s) (tracks)
      for (const lc of lcRows) {
        if (KEEP_AS_IS.has(lc.primary_genre_name)) continue
        const trackCount = await pool.query(
          'SELECT COUNT(*) FROM titles WHERE primary_genre_id = $1',
          [lc.primary_genre_id]
        )
        const n = parseInt(trackCount.rows[0].count)
        console.log(`  TYPE A  move ${n} tracks  "${lc.primary_genre_name}"(${lc.primary_genre_id}) → "${ucRow.primary_genre_name}"(${ucRow.primary_genre_id})`)
        if (!DRY_RUN) {
          await pool.query('UPDATE titles SET primary_genre_id=$1 WHERE primary_genre_id=$2', [ucRow.primary_genre_id, lc.primary_genre_id])
          await pool.query('DELETE FROM primary_genres WHERE primary_genre_id=$1', [lc.primary_genre_id])
        }
        typeA++
      }
    }
  }

  console.log(`\n  Type A merges: ${typeA}`)
  console.log(`  Type B renames: ${typeB}`)

  if (DRY_RUN) {
    console.log('\nRun with --execute to apply:\n  node genre-migration-v2.js --execute\n')
  } else {
    console.log('\n✓ Done.')
  }

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
