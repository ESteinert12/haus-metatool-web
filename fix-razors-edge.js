// Fix Razor's Edge bad SKU — run in two phases
// Phase 1 (dry run): node fix-razors-edge.js
// Phase 2 (apply):   node fix-razors-edge.js --apply

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const APPLY  = process.argv.includes('--apply')
const BAD_SKU     = 'S73R10454'
const CORRECT_SKU = 'S73r1284'
const CORRECT_TITLE = "Razor's Edge"

// Filename correction: S73R → S73r
function fixFilename(f) {
  return f.replace(/S73R/g, 'S73r')
}

async function run() {
  console.log(`\n── Razor's Edge SKU Fix ──────────────────────────────`)
  console.log(`Mode: ${APPLY ? '⚠️  APPLY (writes to DB)' : '🔍 DRY RUN (read-only)'}`)
  console.log(`  ${BAD_SKU} → ${CORRECT_SKU}`)
  console.log(`  Title: "RAZORS EDGE" → "${CORRECT_TITLE}"\n`)

  // 1. Find bad record
  const titleRows = await pool.query(
    `SELECT * FROM titles WHERE sku_root = $1`, [BAD_SKU]
  )
  console.log('Bad title record:')
  console.table(titleRows.rows)

  // 2. Find stems
  const stemRows = await pool.query(
    `SELECT mix_stem_id, sku_root, stem_name, filename, b2_key FROM mix_stems WHERE sku_root = $1`,
    [BAD_SKU]
  )
  console.log('Stems to migrate:')
  stemRows.rows.forEach(s => {
    console.log(`  ${s.filename}  →  ${fixFilename(s.filename)}`)
  })

  // 3. Preview sequence state
  const seqRows = await pool.query(
    `SELECT composer_full_id, next_seq FROM sku_sequences WHERE lower(composer_full_id)='s73r'`
  )
  console.log('\nsku_sequences:')
  console.table(seqRows.rows)
  console.log(`After apply: S73r next_seq → 129`)

  // 4. Preview file renames for shipping folder
  console.log('\nFiles to rename on disk (ATMOS_Shipping):')
  stemRows.rows.forEach(s => {
    console.log(`  ${s.filename}  →  ${fixFilename(s.filename)}`)
  })
  console.log(`  Folder: ${BAD_SKU}_RAZORS EDGE  →  ${CORRECT_SKU}_RAZORS EDGE`)

  if (!APPLY) {
    console.log(`\n── DRY RUN COMPLETE — run with --apply to execute the fix ──`)
    await pool.end(); return
  }

  // ── APPLY PHASE ──────────────────────────────────────────────────────────────
  console.log(`\n── Applying fix… ────────────────────────────────────────`)
  const bad = titleRows.rows[0]

  // 5. Migrate mix_stems: insert with corrected sku_root + filename, then delete old
  for (const stem of stemRows.rows) {
    const newFilename = fixFilename(stem.filename)
    await pool.query(`
      INSERT INTO mix_stems (sku_root, stem_name, filename, b2_key)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (sku_root, filename) DO UPDATE
        SET b2_key    = COALESCE(EXCLUDED.b2_key, mix_stems.b2_key),
            stem_name = EXCLUDED.stem_name
    `, [CORRECT_SKU, stem.stem_name, newFilename, stem.b2_key])
    console.log(`  ✅ stem migrated: ${newFilename}`)
  }
  await pool.query(`DELETE FROM mix_stems WHERE sku_root = $1`, [BAD_SKU])
  console.log(`  🗑  Old stems deleted (${BAD_SKU})`)

  // 6. Resolve team_id from correct composer_id
  const teamRow = await pool.query(
    `SELECT team_id FROM teams WHERE composer_full_id = 'S73r' LIMIT 1`
  )
  const teamId = teamRow.rows[0]?.team_id || null

  // 7. Insert correct title
  await pool.query(`
    INSERT INTO titles (
      sku_root, lot_id, composer_id, team_id, variant, title,
      key, bpm, ksl_ids, primary_genre_id, secondary_genre_id,
      mood_1_id, description, created_at, updated_at
    ) VALUES ($1,$2,'S73r',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now())
    ON CONFLICT DO NOTHING
  `, [
    CORRECT_SKU, bad.lot_id, teamId, bad.variant, CORRECT_TITLE,
    bad.key, bad.bpm, bad.ksl_ids, bad.primary_genre_id, bad.secondary_genre_id,
    bad.mood_1_id, bad.description
  ])
  console.log(`  ✅ Inserted: ${CORRECT_SKU} — ${CORRECT_TITLE}`)

  // 8. Delete bad title
  await pool.query(`DELETE FROM titles WHERE sku_root = $1`, [BAD_SKU])
  console.log(`  🗑  Deleted bad title: ${BAD_SKU}`)

  // 9. Bump sequence to 129 (we used seq 128)
  await pool.query(`
    UPDATE sku_sequences SET next_seq = 129
    WHERE composer_full_id = 'S73r' AND next_seq <= 129
  `)
  console.log(`  ✅ S73r next_seq → 129`)

  // 10. Verify
  const verify = await pool.query(`
    SELECT t.sku_root, t.composer_id, t.team_id, t.title, t.key, t.bpm,
           s.next_seq AS seq_next
    FROM titles t
    LEFT JOIN sku_sequences s ON s.composer_full_id = t.composer_id
    WHERE t.sku_root = $1
  `, [CORRECT_SKU])
  console.log('\nVerification:')
  console.table(verify.rows)

  const stemVerify = await pool.query(
    `SELECT stem_name, filename FROM mix_stems WHERE sku_root = $1 ORDER BY stem_name`, [CORRECT_SKU]
  )
  console.table(stemVerify.rows)

  console.log('\n✅ DB fix complete!')
  console.log('\n── Now rename files on disk ──────────────────────────────')
  console.log('Run this shell command (update the SHIPPING_DIR path if needed):\n')

  const shippingDir = `/Volumes/ATMOS_Shipping`  // adjust if different
  console.log(`SHIPPING_DIR="${shippingDir}"`)
  console.log(`cd "$SHIPPING_DIR"`)
  console.log(`mv "${BAD_SKU}_RAZORS EDGE" "${CORRECT_SKU}_RAZORS EDGE"`)
  console.log(`cd "${CORRECT_SKU}_RAZORS EDGE"`)
  stemRows.rows.forEach(s => {
    const newName = fixFilename(s.filename)
    if (newName !== s.filename) {
      console.log(`mv "${s.filename}" "${newName}"`)
    }
  })

  await pool.end()
}

run().catch(async e => {
  console.error('Error:', e.message)
  await pool.end()
  process.exit(1)
})
