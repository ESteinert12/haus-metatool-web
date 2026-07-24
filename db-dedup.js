// db-dedup.js
// Diagnoses and deduplicates all reference tables and junction tables.
// Run: node db-dedup.js          (dry run — shows what would change)
//      node db-dedup.js --execute (apply fixes)

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')

// ─── Deduplicate a simple reference table using ctid ─────────────────────────
// Groups by (id_col, name_col) — keeps MIN(ctid), deletes the rest.
async function dedupTable(table, id_col, name_col) {
  const dups = await pool.query(`
    SELECT ${id_col}, ${name_col}, COUNT(*) AS cnt
    FROM ${table}
    GROUP BY ${id_col}, ${name_col}
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `)

  if (dups.rows.length === 0) {
    console.log(`  ✓ ${table} — no duplicates`)
    return 0
  }

  const total = dups.rows.reduce((s, r) => s + parseInt(r.cnt) - 1, 0)
  console.log(`  ⚠ ${table} — ${dups.rows.length} duplicate groups, ${total} extra rows`)
  dups.rows.slice(0, 5).forEach(r =>
    console.log(`      ${r.cnt}x  ${id_col}=${r[id_col]}  "${r[name_col]}"`)
  )
  if (dups.rows.length > 5) console.log(`      ... and ${dups.rows.length - 5} more`)

  if (!DRY_RUN) {
    await pool.query(`
      DELETE FROM ${table}
      WHERE ctid NOT IN (
        SELECT MIN(ctid)
        FROM ${table}
        GROUP BY ${id_col}
      )
    `)
    console.log(`    → deleted ${total} duplicate rows`)
  }
  return total
}

// ─── Deduplicate a junction table (no id column, compound key) ───────────────
async function dedupJunction(table, col1, col2) {
  const dups = await pool.query(`
    SELECT ${col1}, ${col2}, COUNT(*) AS cnt
    FROM ${table}
    GROUP BY ${col1}, ${col2}
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
  `)

  if (dups.rows.length === 0) {
    console.log(`  ✓ ${table} — no duplicates`)
    return 0
  }

  const total = dups.rows.reduce((s, r) => s + parseInt(r.cnt) - 1, 0)
  console.log(`  ⚠ ${table} — ${dups.rows.length} duplicate groups, ${total} extra rows`)

  if (!DRY_RUN) {
    await pool.query(`
      DELETE FROM ${table}
      WHERE ctid NOT IN (
        SELECT MIN(ctid)
        FROM ${table}
        GROUP BY ${col1}, ${col2}
      )
    `)
    console.log(`    → deleted ${total} duplicate rows`)
  }
  return total
}

// ─── Check what columns exist in a table ─────────────────────────────────────
async function getColumns(table) {
  const res = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table])
  return res.rows.map(r => r.column_name)
}

async function run() {
  console.log(DRY_RUN
    ? '🔍 DRY RUN — showing issues only. Add --execute to fix.\n'
    : '⚡ EXECUTE MODE\n'
  )

  // ─── 1. Reference tables ──────────────────────────────────────────────────
  console.log('═══ Reference Tables ═══\n')
  await dedupTable('moods',   'mood_id',   'mood_name')
  await dedupTable('mood_1',  'mood_1_id', 'mood_1_name')
  await dedupTable('ksl',     'ksl_id',    'ksl_name')

  // rmo: figure out which column name it actually uses
  const rmoCols = await getColumns('rmo')
  console.log(`\n  rmo table columns: ${rmoCols.join(', ')}`)
  const rmoNameCol = rmoCols.includes('rmo_name') ? 'rmo_name' : 'name'
  await dedupTable('rmo', 'rmo_id', rmoNameCol)

  await dedupTable('primary_genres',   'primary_genre_id',   'primary_genre_name')
  await dedupTable('secondary_genres', 'secondary_genre_id', 'secondary_genre_name')
  await dedupTable('composers',        'composer_id',        'full_name')
  await dedupTable('lots',             'lot_id',             'lot_name')

  // ─── 2. Titles table ─────────────────────────────────────────────────────
  console.log('\n═══ Titles Table ═══\n')
  const titleDups = await pool.query(`
    SELECT sku_root, COUNT(*) AS cnt
    FROM titles
    GROUP BY sku_root
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
  `)
  if (titleDups.rows.length === 0) {
    console.log('  ✓ titles — no duplicates')
  } else {
    const totalDups = await pool.query(`SELECT COUNT(*) - COUNT(DISTINCT sku_root) AS extra FROM titles`)
    const extra = parseInt(totalDups.rows[0].extra)
    console.log(`  ⚠ titles — ${extra} extra rows (${titleDups.rows[0].cnt}x per sku_root)`)
    if (!DRY_RUN) {
      await pool.query(`
        DELETE FROM titles
        WHERE ctid NOT IN (
          SELECT MIN(ctid)
          FROM titles
          GROUP BY sku_root
        )
      `)
      console.log(`    → deleted ${extra} duplicate rows`)
    }
  }

  // ─── 3. Junction tables ───────────────────────────────────────────────────
  console.log('\n═══ Junction Tables ═══\n')
  await dedupJunction('title_moods', 'sku_root', 'mood_id')
  await dedupJunction('title_rmo',   'sku_root', 'rmo_id')

  // ─── 4. Teams table ───────────────────────────────────────────────────────
  // Teams is special: we must keep the row with the HIGHEST next_seq per
  // composer_full_id so we never go backwards and reissue a SKU that was
  // already burned. Standard MIN(ctid) would keep the oldest row, which may
  // have a stale (lower) next_seq.
  console.log('\n═══ Teams Table ═══\n')
  const teamDups = await pool.query(`
    SELECT composer_full_id, COUNT(*) AS cnt,
           MAX(next_seq) AS max_seq, MIN(next_seq) AS min_seq
    FROM teams
    WHERE composer_full_id IS NOT NULL AND composer_full_id != ''
    GROUP BY composer_full_id
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC
    LIMIT 5
  `)
  const totalTeamDups = await pool.query(`
    SELECT COUNT(*) - COUNT(DISTINCT composer_full_id) AS extra FROM teams
    WHERE composer_full_id IS NOT NULL AND composer_full_id != ''
  `)
  const teamExtra = parseInt(totalTeamDups.rows[0].extra)
  if (teamExtra === 0) {
    console.log('  ✓ teams — no duplicates')
  } else {
    console.log(`  ⚠ teams — ${teamExtra} extra rows`)
    teamDups.rows.forEach(r =>
      console.log(`      ${r.cnt}x  ${r.composer_full_id}  next_seq range: ${r.min_seq}–${r.max_seq}`)
    )
    if (!DRY_RUN) {
      // Keep the row with the highest next_seq (DISTINCT ON orders by next_seq DESC)
      // so issued sequence numbers are never reused.
      await pool.query(`
        DELETE FROM teams
        WHERE ctid NOT IN (
          SELECT DISTINCT ON (composer_full_id) ctid
          FROM teams
          WHERE composer_full_id IS NOT NULL AND composer_full_id != ''
          ORDER BY composer_full_id, next_seq DESC, ctid
        )
        AND composer_full_id IS NOT NULL AND composer_full_id != ''
      `)
      console.log(`    → deleted ${teamExtra} duplicate rows (kept highest next_seq per composer)`)
    }
  }

  // ─── 5. Check rmo column name ─────────────────────────────────────────────
  console.log('\n═══ Column Name Check ═══\n')
  console.log(`  rmo table uses column: "${rmoNameCol}" ✓`)

  if (DRY_RUN) {
    console.log('\nRun with --execute to apply all deduplication fixes:')
    console.log('  node db-dedup.js --execute\n')
  } else {
    console.log('\n✓ Done.')
  }

  await pool.end()
}

run().catch(async e => { console.error(e.message); await pool.end() })
