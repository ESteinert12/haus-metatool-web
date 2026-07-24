// delete-specialty.js
// Deletes specialty-prefix titles: GST, HST, DST, DB, XI
// Keeps: SIB, OH, AC, LA, BACH
//
//   node delete-specialty.js            — dry run
//   node delete-specialty.js --execute  — apply deletes

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')
const PREFIXES = ['GST', 'HST', 'DST', 'DB', 'XI']

async function run() {
  console.log(DRY_RUN
    ? '\n🔍 DRY RUN — no changes will be made. Add --execute to delete.\n'
    : '\n⚡ EXECUTE MODE — deleting specialty tracks…\n'
  )

  // Build WHERE clause
  const conditions = PREFIXES.map(p => `t.title ILIKE '${p} %'`).join(' OR ')

  const targets = await pool.query(`
    SELECT t.sku_root, t.title, t.composer_id,
           CASE WHEN ms.sku_root IS NOT NULL THEN true ELSE false END AS has_stems
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ${conditions}
    ORDER BY split_part(t.title, ' ', 1), t.composer_id, t.sku_root
  `)

  const rows = targets.rows
  const withStems = rows.filter(r => r.has_stems)

  // Summary by prefix
  const byCat = {}
  for (const r of rows) {
    const prefix = r.title.split(' ')[0].toUpperCase()
    if (!byCat[prefix]) byCat[prefix] = { total: 0, stems: 0 }
    byCat[prefix].total++
    if (r.has_stems) byCat[prefix].stems++
  }

  console.log('─── Summary by prefix ───\n')
  for (const [p, c] of Object.entries(byCat)) {
    const stemNote = c.stems > 0 ? `  ⚠  ${c.stems} have stems!` : ''
    console.log(`  ${p.padEnd(6)} ${c.total} titles${stemNote}`)
  }
  console.log(`\n  Total: ${rows.length} titles`)

  if (withStems.length > 0) {
    console.log(`\n  ⚠  ${withStems.length} titles have mix_stems — these will also be deleted:`)
    withStems.forEach(r => console.log(`     ${r.sku_root}  "${r.title}"`))
  }

  if (DRY_RUN) {
    console.log(`\nRun with --execute to delete all ${rows.length} titles and their related rows.`)
    console.log('  node delete-specialty.js --execute\n')
    await pool.end()
    return
  }

  const skuList = rows.map(r => r.sku_root)

  const ms = await pool.query(`DELETE FROM mix_stems   WHERE sku_root = ANY($1)`, [skuList])
  console.log(`\n  → deleted ${ms.rowCount} mix_stems rows`)

  const tm = await pool.query(`DELETE FROM title_moods WHERE sku_root = ANY($1)`, [skuList])
  console.log(`  → deleted ${tm.rowCount} title_moods rows`)

  const tr = await pool.query(`DELETE FROM title_rmo   WHERE sku_root = ANY($1)`, [skuList])
  console.log(`  → deleted ${tr.rowCount} title_rmo rows`)

  const td = await pool.query(`DELETE FROM titles      WHERE sku_root = ANY($1) RETURNING sku_root`, [skuList])
  console.log(`  → deleted ${td.rowCount} title rows`)

  console.log(`\n✅ Done. ${td.rowCount} specialty titles removed.\n`)
  await pool.end()
}

run().catch(async e => {
  console.error('\n[delete-specialty] Error:', e.message)
  await pool.end()
  process.exit(1)
})
