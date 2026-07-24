// fix-final-4.js
// Fixes the 4 remaining duplicate sku_roots by moving the displaced titles
// to their correct sku_roots (confirmed via FileMaker).
//
//   node fix-final-4.js            — dry run
//   node fix-final-4.js --fix      — apply

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

// title → correct sku_root (confirmed in FileMaker)
// Order matters: move Cosmic Dust first to clear S33a4824, then Like A Good Fast Ride can take it
const FIXES = [
  { title: 'All Out, All In',        newSku: 'R13a10513' },
  { title: 'All Good, Baby',         newSku: 'R13a11813' },
  { title: 'Up Hill, Down Hill',     newSku: 'R13a15914' },
  { title: 'Cosmic Dust',            newSku: 'S33a48244' },  // clear S33a4824 first
  { title: 'Like A Good Fast Ride',  newSku: 'S33a4824'  },
]

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Fix Final 4 Duplicate SKUs')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  for (const { title, newSku } of FIXES) {
    const row = await pool.query(
      `SELECT sku_root, title FROM titles WHERE title ILIKE $1`, [title]
    )
    if (row.rows.length === 0) {
      console.log(`  ⚠  "${title}" — not found in DB`)
      continue
    }
    if (row.rows.length > 1) {
      console.log(`  ⚠  "${title}" — ${row.rows.length} rows found:`)
      row.rows.forEach(r => console.log(`      ${r.sku_root}`))
    }
    const current = row.rows.find(r => r.sku_root !== newSku) || row.rows[0]
    console.log(`  "${title}"`)
    console.log(`    current sku: ${current.sku_root}`)
    console.log(`    correct sku: ${newSku}`)

    // Check for collision at target
    const collision = await pool.query(
      `SELECT title FROM titles WHERE sku_root = $1`, [newSku]
    )
    if (collision.rows.length > 0) {
      console.log(`    ⚠  target already occupied by: "${collision.rows[0].title}"`)
    } else {
      console.log(`    target is clear ✓`)
    }
    console.log()
  }

  if (!FIX) {
    console.log('Run with --fix to apply:')
    console.log('  node fix-final-4.js --fix\n')
    await pool.end()
    return
  }

  console.log('─── Applying fixes ───\n')
  for (const { title, newSku } of FIXES) {
    // Find the row with this title that has the WRONG sku_root
    const row = await pool.query(
      `SELECT ctid, sku_root FROM titles WHERE title ILIKE $1 AND sku_root != $2`,
      [title, newSku]
    )
    if (row.rows.length === 0) {
      console.log(`  ⚠  "${title}" already at correct sku or not found`)
      continue
    }
    const { ctid, sku_root: oldSku } = row.rows[0]

    await pool.query(`UPDATE titles      SET sku_root=$1 WHERE ctid=$2`,   [newSku, ctid])
    await pool.query(`UPDATE title_moods SET sku_root=$1 WHERE sku_root=$2`, [newSku, oldSku])
    await pool.query(`UPDATE title_rmo   SET sku_root=$1 WHERE sku_root=$2`, [newSku, oldSku])

    // Move stems by filename match
    const words = title.replace(/[^a-zA-Z0-9 ]/g, '').split(' ').filter(w => w.length > 2)
    if (words.length > 0) {
      const stemResult = await pool.query(`
        UPDATE mix_stems SET sku_root=$1
        WHERE sku_root=$2 AND filename ILIKE $3
        RETURNING 1
      `, [newSku, oldSku, `%${words[0]}%`])
      console.log(`  ✅  "${title}": ${oldSku} → ${newSku}  (${stemResult.rowCount} stems moved)`)
    } else {
      console.log(`  ✅  "${title}": ${oldSku} → ${newSku}`)
    }
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[fix-final-4] Error:', e.message)
  await pool.end()
  process.exit(1)
})
