// title-dedup.js
// Resolves the 490 duplicate sku_roots created when title-sku-fix updated
// a 7-char title to an 8-char sku_root that already existed.
//
// For each duplicate pair:
//   - If same title/composer → safe to delete the higher-id row (keep original)
//   - If different titles → flag for manual review
//
//   node title-dedup.js            — report only + export dedup-review.csv
//   node title-dedup.js --fix      — delete confirmed safe duplicates

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Title Dedup — Duplicate SKU Resolution')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  // Find all duplicate sku_roots with full row data (use ctid as row identifier)
  const dups = await pool.query(`
    SELECT t.ctid, t.sku_root, t.title, t.composer_id, t.lot_id,
           EXISTS(SELECT 1 FROM mix_stems ms WHERE ms.sku_root = t.sku_root) AS has_stems
    FROM titles t
    WHERE t.sku_root IN (
      SELECT sku_root FROM titles
      GROUP BY sku_root HAVING COUNT(*) > 1
    )
    ORDER BY t.sku_root, t.ctid
  `)

  // Group by sku_root
  const groups = {}
  for (const row of dups.rows) {
    if (!groups[row.sku_root]) groups[row.sku_root] = []
    groups[row.sku_root].push(row)
  }

  const safeToDelete  = []  // same title + composer → delete one via ctid
  const needsReview   = []  // different titles → manual review

  for (const [sku, rows] of Object.entries(groups)) {
    const titles    = new Set(rows.map(r => r.title.toLowerCase().trim()))
    const composers = new Set(rows.map(r => r.composer_id))
    const sameTitle    = titles.size === 1
    const sameComposer = composers.size === 1

    if (sameTitle && sameComposer) {
      // Safe: identical song — keep first (lowest ctid), delete the rest
      const keep   = rows[0]
      const deletes = rows.slice(1)
      deletes.forEach(d => safeToDelete.push({ keep, del: d, sku }))
    } else {
      needsReview.push({ sku, rows })
    }
  }

  console.log(`  Total duplicate groups: ${Object.keys(groups).length}`)
  console.log(`  Safe to delete (same song): ${safeToDelete.length}`)
  console.log(`  Needs manual review (different titles): ${needsReview.length}`)

  if (needsReview.length > 0) {
    console.log('\n  ⚠  Conflicts needing review:')
    needsReview.slice(0, 10).forEach(({ sku, rows }) => {
      console.log(`\n    SKU: ${sku}`)
      rows.forEach(r => console.log(`      id=${r.id}  "${r.title}"  [${r.composer_id}]  stems=${r.has_stems}`))
    })
    if (needsReview.length > 10) console.log(`    ... and ${needsReview.length - 10} more`)
  }

  // Export CSV for review
  const outPath = path.join(__dirname, 'dedup-review.csv')
  const lines = ['action,sku_root,keep_ctid,keep_title,del_ctid,del_title,composer']
  const esc = v => `"${String(v||'').replace(/"/g,'""')}"`
  safeToDelete.forEach(({ sku, keep, del }) =>
    lines.push(['DELETE', sku, keep.ctid, esc(keep.title), del.ctid, esc(del.title), keep.composer_id].join(','))
  )
  needsReview.forEach(({ sku, rows }) =>
    rows.forEach(r => lines.push(['REVIEW', sku, '', '', r.ctid, esc(r.title), r.composer_id].join(',')))
  )
  fs.writeFileSync(outPath, lines.join('\n'))
  console.log(`\n  → Saved dedup-review.csv (${lines.length - 1} rows)`)

  if (!FIX) {
    console.log(`\nRun with --fix to delete ${safeToDelete.length} confirmed duplicates:`)
    console.log('  node title-dedup.js --fix\n')
    await pool.end()
    return
  }

  // Apply deletions
  if (safeToDelete.length > 0) {
    console.log(`\n─── Deleting ${safeToDelete.length} duplicate rows ───\n`)
    const idsToDelete = safeToDelete.map(({ del }) => del.id)

    // Delete duplicate rows by ctid — no FK cleanup needed since the
    // sku_root still exists in the surviving row
    const ctidsToDelete = safeToDelete.map(({ del }) => del.ctid)
    let deleted = 0
    for (const ctid of ctidsToDelete) {
      const result = await pool.query(`DELETE FROM titles WHERE ctid = $1`, [ctid])
      deleted += result.rowCount
      if (deleted % 50 === 0) process.stdout.write(`  ${deleted} / ${ctidsToDelete.length}\r`)
    }
    const result = { rowCount: deleted }
    console.log(`  ✅ Deleted ${result.rowCount} duplicate title rows.`)
  }

  if (needsReview.length > 0)
    console.log(`\n  ⚠  ${needsReview.length} conflicts still need manual review — see dedup-review.csv`)

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[title-dedup] Error:', e.message)
  await pool.end()
  process.exit(1)
})
