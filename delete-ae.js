// delete-ae.js
// Finds and deletes titles with "SOLD TO A+E" in the description.
// Also removes their associated mix_stems, title_moods, and title_rmo rows.
//
//   node delete-ae.js            — dry run (shows what would be deleted)
//   node delete-ae.js --execute  — apply the deletes

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const DRY_RUN = !process.argv.includes('--execute')

async function run() {
  console.log(DRY_RUN
    ? '\n🔍 DRY RUN — no changes will be made. Add --execute to delete.\n'
    : '\n⚡ EXECUTE MODE — deleting A+E titles…\n'
  )

  // Find all matching titles
  const targets = await pool.query(`
    SELECT sku_root, title, composer_id, lot_id, description
    FROM titles
    WHERE description ILIKE '%SOLD TO A&E%'
    ORDER BY composer_id, sku_root
  `)

  const rows = targets.rows
  console.log(`Found ${rows.length} titles matching "SOLD TO A+E":\n`)

  rows.forEach(r => {
    console.log(`  ${r.sku_root}  ${r.composer_id}  "${r.title}"`)
    if (r.description) {
      const snippet = r.description.length > 80 ? r.description.slice(0, 80) + '…' : r.description
      console.log(`           note: ${snippet}`)
    }
  })

  if (rows.length === 0) {
    console.log('Nothing to delete.')
    await pool.end()
    return
  }

  if (DRY_RUN) {
    console.log(`\nRun with --execute to delete these ${rows.length} titles and their related rows.`)
    console.log('  node delete-ae.js --execute\n')
    await pool.end()
    return
  }

  // Execute — delete junction rows first, then titles
  const skuList = rows.map(r => r.sku_root)

  // mix_stems
  const ms = await pool.query(
    `DELETE FROM mix_stems WHERE sku_root = ANY($1) RETURNING sku_root`,
    [skuList]
  )
  console.log(`\n  → deleted ${ms.rowCount} mix_stems rows`)

  // title_moods
  const tm = await pool.query(
    `DELETE FROM title_moods WHERE sku_root = ANY($1) RETURNING sku_root`,
    [skuList]
  )
  console.log(`  → deleted ${tm.rowCount} title_moods rows`)

  // title_rmo
  const tr = await pool.query(
    `DELETE FROM title_rmo WHERE sku_root = ANY($1) RETURNING sku_root`,
    [skuList]
  )
  console.log(`  → deleted ${tr.rowCount} title_rmo rows`)

  // titles
  const td = await pool.query(
    `DELETE FROM titles WHERE sku_root = ANY($1) RETURNING sku_root`,
    [skuList]
  )
  console.log(`  → deleted ${td.rowCount} title rows`)

  console.log(`\n✅ Done. ${td.rowCount} A+E titles removed.\n`)
  await pool.end()
}

run().catch(async e => {
  console.error('\n[delete-ae] Error:', e.message)
  await pool.end()
  process.exit(1)
})
