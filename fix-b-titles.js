// fix-b-titles.js
// Corrects the titles for the 7 'b'-suffix sku_roots whose titles are wrong in Neon.
// The sku_roots themselves are correct — the master list confirms them.
// Only the title column needs updating.
//
//   node fix-b-titles.js            — dry run
//   node fix-b-titles.js --fix      — apply

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

// Correct titles per master list
const CORRECTIONS = [
  { sku: 'R37a092b', correct_title: 'SIB Slide Guitar 7' },
  { sku: 'S22a008b', correct_title: 'SIB Lapsteel Slide Down' },
  { sku: 'S22a009b', correct_title: 'SIB Lapsteel Swinging Hi' },
  { sku: 'S22a010b', correct_title: 'SIB Lapsteel Swing Lo' },
  { sku: 'S22a011b', correct_title: 'SIB Lapsteel Thats All' },
  { sku: 'S22a013b', correct_title: 'SIB Lapsteel Waah Waah' },
  { sku: 'S22a014b', correct_title: 'SIB Lapsteel Whoa Whoa' },
]

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Fix B-Suffix Titles')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  // Show current state
  const skus = CORRECTIONS.map(c => c.sku)
  const current = await pool.query(
    `SELECT sku_root, title FROM titles WHERE sku_root = ANY($1) ORDER BY sku_root`,
    [skus]
  )

  console.log('  Current state in Neon:')
  current.rows.forEach(r => {
    const fix = CORRECTIONS.find(c => c.sku === r.sku_root)
    const marker = r.title === fix?.correct_title ? '✓' : '✗'
    console.log(`  ${marker}  ${r.sku_root}  "${r.title}"`)
    if (r.title !== fix?.correct_title)
      console.log(`        → should be: "${fix?.correct_title}"`)
  })

  const toFix = current.rows.filter(r => {
    const fix = CORRECTIONS.find(c => c.sku === r.sku_root)
    return fix && r.title !== fix.correct_title
  })

  console.log(`\n  ${toFix.length} titles need correction`)

  if (!FIX) {
    console.log('\nRun with --fix to apply corrections:')
    console.log('  node fix-b-titles.js --fix\n')
    await pool.end()
    return
  }

  console.log('\n─── Applying corrections ───\n')
  for (const { sku, correct_title } of CORRECTIONS) {
    const result = await pool.query(
      `UPDATE titles SET title=$1 WHERE sku_root=$2`,
      [correct_title, sku]
    )
    if (result.rowCount > 0)
      console.log(`  ✅  ${sku}  → "${correct_title}"`)
    else
      console.log(`  ⚠   ${sku}  not found in DB`)
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[fix-b-titles] Error:', e.message)
  await pool.end()
  process.exit(1)
})
