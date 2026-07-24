// genre-migration.js
// Fixes the dual genre schema: moves subgenre definitions from uppercase rows
// to the title-case rows that actually have tracks, then cleans up duplicates.
//
// Run: node genre-migration.js
// Add --execute flag to actually apply changes (default is dry-run preview)

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')

// ─── Mapping: uppercase (source, has subgenres) → title-case (target, has tracks) ───
const MIGRATIONS = {
  'ALTERNATIVE ROCK':        'Alternative Rock',
  'CLASSIC ROCK':            'Classic Rock',
  'FOLK':                    'Folk',
  'GREAT AMERICAN SONGBOOK': 'Great American Songbook',
  'GUITAR STING':            'Guitar Sting',
  'GUMSHOE':                 'Gumshoe',
  'HEARTLAND ROCK':          'Heartland Rock',
  'HEAVY METAL':             'Heavy Metal',
  'HIP HOP/RAP':             'Hip Hop/Rap',
  'HORROR STING':            'Horror Sting',
  'JAZZ':                    'Jazz',
  'MARCHING BAND':           'Marching Band',
  'MILITARY':                'Military',
  'NEW AGE':                 'New Age',
  'OLD TIMEY':               'Old Timey',
  'ORCHESTRAL':              'Orchestral',
  'POP':                     'Pop',
  'RELIGIOUS':               'Religious',
  'SINGLE INSTRUMENT BUMPER':'Single Instrument Bumper',
  'SOUL_R AND B':            'Soul',
  'SYNTHPOP':                'Synthpop',
  'TECHNO':                  'Techno',
  'TRADITIONAL':             'Traditional',
  'TRANCE':                  'Trance',
  'TV THEME':                'TV Theme',
  'WORLD-ETHNIC':            'World-Ethnic',

  // Political: two uppercase rows both collapse into one title-case row
  'POLITICAL_Negative':      'Political',
  'POLITICAL_Uplifting':     'Political',
}

// FILM SCORE_* is excluded here — handled separately below because
// Film Score title-case tracks (107k) can't be auto-mapped to a specific mood.

async function run() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — no changes will be written. Run with --execute to apply.\n'
    : '⚡ EXECUTE MODE — writing to database.\n'
  )

  // ─── Step 1: Remap secondary_genres for clear pairs ───────────────────────
  console.log('═══ STEP 1: Remap subgenres to title-case genres ═══\n')

  for (const [fromName, toName] of Object.entries(MIGRATIONS)) {
    const fromRow = await pool.query(
      'SELECT primary_genre_id FROM primary_genres WHERE primary_genre_name = $1 LIMIT 1',
      [fromName]
    )
    const toRow = await pool.query(
      'SELECT primary_genre_id FROM primary_genres WHERE primary_genre_name = $1 LIMIT 1',
      [toName]
    )

    if (!fromRow.rows.length) {
      console.log(`  SKIP  "${fromName}" — not found in primary_genres`)
      continue
    }
    if (!toRow.rows.length) {
      console.log(`  ⚠️   "${toName}" (target) not found — skipping "${fromName}"`)
      continue
    }

    const fromId = fromRow.rows[0].primary_genre_id
    const toId   = toRow.rows[0].primary_genre_id

    const sgCount = await pool.query(
      'SELECT COUNT(*) FROM secondary_genres WHERE primary_genre_id = $1',
      [fromId]
    )
    const count = parseInt(sgCount.rows[0].count)

    if (count === 0) {
      console.log(`  SKIP  "${fromName}" → "${toName}" (no subgenres to move)`)
      continue
    }

    console.log(`  MOVE  "${fromName}" → "${toName}"  (${count} subgenre rows)`)

    if (!DRY_RUN) {
      await pool.query(
        'UPDATE secondary_genres SET primary_genre_id = $1 WHERE primary_genre_id = $2',
        [toId, fromId]
      )
      await pool.query(
        'DELETE FROM primary_genres WHERE primary_genre_id = $1',
        [fromId]
      )
    }
  }

  // ─── Step 2: Deduplicate secondary_genres ────────────────────────────────
  console.log('\n═══ STEP 2: Deduplicate secondary_genres ═══\n')

  const dupCheck = await pool.query(`
    SELECT primary_genre_id, secondary_genre_name, COUNT(*) as cnt
    FROM secondary_genres
    GROUP BY primary_genre_id, secondary_genre_name
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `)

  if (dupCheck.rows.length === 0) {
    console.log('  ✓ No duplicates found in secondary_genres')
  } else {
    console.log(`  Found ${dupCheck.rows.length} duplicate combinations (showing top 20):`)
    dupCheck.rows.forEach(r => console.log(`    ${r.cnt}x  genre_id=${r.primary_genre_id}  "${r.secondary_genre_name}"`))

    if (!DRY_RUN) {
      console.log('\n  Deduplicating...')
      await pool.query(`
        DELETE FROM secondary_genres
        WHERE secondary_genre_id NOT IN (
          SELECT MIN(secondary_genre_id)
          FROM secondary_genres
          GROUP BY primary_genre_id, secondary_genre_name
        )
      `)
      console.log('  ✓ Duplicates removed')
    }
  }

  // ─── Step 2b: Deduplicate primary_genres rows ────────────────────────────
  console.log('\n═══ STEP 2b: Deduplicate primary_genres rows ═══\n')

  const pgDups = await pool.query(`
    SELECT primary_genre_id, primary_genre_name, COUNT(*) as cnt
    FROM primary_genres
    GROUP BY primary_genre_id, primary_genre_name
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `)

  if (pgDups.rows.length === 0) {
    console.log('  ✓ No duplicate rows in primary_genres')
  } else {
    console.log(`  Found ${pgDups.rows.length} duplicate primary genres:`)
    pgDups.rows.forEach(r => console.log(`    ${r.cnt}x  id=${r.primary_genre_id}  "${r.primary_genre_name}"`))

    if (!DRY_RUN) {
      await pool.query(`
        DELETE FROM primary_genres
        WHERE ctid NOT IN (
          SELECT MIN(ctid)
          FROM primary_genres
          GROUP BY primary_genre_id
        )
      `)
      console.log('  ✓ Duplicate primary_genres rows removed')
    }
  }

  // ─── Step 3: Delete 0-track uppercase orphans with no subgenres ───────────
  console.log('\n═══ STEP 3: Delete empty orphan genre rows ═══\n')

  const orphans = await pool.query(`
    SELECT pg.primary_genre_id, pg.primary_genre_name
    FROM primary_genres pg
    LEFT JOIN secondary_genres sg ON sg.primary_genre_id = pg.primary_genre_id
    LEFT JOIN titles t ON t.primary_genre_id = pg.primary_genre_id
    WHERE sg.secondary_genre_id IS NULL
    GROUP BY pg.primary_genre_id, pg.primary_genre_name
    HAVING COUNT(t.sku_root) = 0
  `)

  if (orphans.rows.length === 0) {
    console.log('  ✓ No empty orphan rows found')
  } else {
    orphans.rows.forEach(r => console.log(`  DELETE  "${r.primary_genre_name}" (id=${r.primary_genre_id})`))
    if (!DRY_RUN) {
      for (const r of orphans.rows) {
        await pool.query('DELETE FROM primary_genres WHERE primary_genre_id = $1', [r.primary_genre_id])
      }
      console.log(`\n  ✓ Deleted ${orphans.rows.length} orphan rows`)
    }
  }

  // ─── Step 4: Report Film Score situation ─────────────────────────────────
  console.log('\n═══ STEP 4: FILM SCORE — manual review needed ═══\n')
  console.log('  "Film Score" (title-case) has 107k+ tracks with NO mood subgenre assigned.')
  console.log('  The FILM SCORE_* rows (Light Tension, Melancholic, etc.) have their own tracks.')
  console.log('  These cannot be auto-merged — tracks need manual mood reclassification.')
  console.log('  Recommended: leave Film Score as a catch-all until tracks are reclassified.')

  // ─── Final summary ────────────────────────────────────────────────────────
  console.log('\n═══ DONE ═══')
  if (DRY_RUN) {
    console.log('\nRun with --execute to apply all changes:')
    console.log('  node genre-migration.js --execute\n')
  }

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
