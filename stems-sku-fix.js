// stems-sku-fix.js
// Finds mix_stems rows with sku_root < 8 chars (missing album digit)
// and repairs them using THE COLLECTION_full list.csv as the source of truth.
//
//   node stems-sku-fix.js            — dry run (report only)
//   node stems-sku-fix.js --fix      — apply repairs

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

// ── Load master list: sku_root (no album digit) → full sku_root (with album digit)
function loadMaster() {
  const UPLOADS = path.join(os.homedir(),
    'Library/Application Support/Claude/local-agent-mode-sessions/a1155e18-d57c-4e1e-8cdb-7bc4766f493d/492b8352-c57b-4766-8fc9-eb9107691393/local_2bfd3fc7-2fe3-4f8c-a2f8-7680beb8fd01/uploads'
  )
  const candidates = [
    path.join(__dirname, 'THE COLLECTION_full list.csv'),
    path.join(UPLOADS, 'THE COLLECTION_full list.csv')
  ]
  const masterPath = candidates.find(p => fs.existsSync(p))
  if (!masterPath) throw new Error('Cannot find THE COLLECTION_full list.csv')

  // Map: stripped_sku (without last digit) → full_sku
  // e.g. "R13a159" → "R13a1591"
  const map = {}
  const content = fs.readFileSync(masterPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '')
  for (const line of content.split('\n')) {
    const sku = line.split(',')[0].trim().replace(/^"|"$/g, '')
    if (!sku || sku === 'SKUROOT' || sku.length < 8) continue
    const base = sku.slice(0, -1)  // strip album digit
    if (!map[base]) map[base] = sku  // keep first occurrence
  }
  return map
}

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Stems SKU Repair (< 8 chars)')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  console.log('Loading master list...')
  const master = loadMaster()
  console.log(`Master entries loaded: ${Object.keys(master).length}\n`)

  // Find all bad stems
  const bad = await pool.query(`
    SELECT DISTINCT sku_root, length(sku_root) AS len
    FROM mix_stems
    WHERE length(sku_root) < 8
    ORDER BY sku_root
  `)

  console.log(`  Stems with sku_root < 8 chars: ${bad.rows.length}\n`)

  const fixable   = []
  const notFound  = []

  for (const row of bad.rows) {
    const correct = master[row.sku_root]
    if (correct) fixable.push({ bad: row.sku_root, correct })
    else notFound.push(row.sku_root)
  }

  console.log(`  Found in master list (fixable): ${fixable.length}`)
  console.log(`  Not in master list:             ${notFound.length}`)

  if (fixable.length > 0) {
    console.log('\n  Sample fixes:')
    fixable.slice(0, 15).forEach(f =>
      console.log(`    ${f.bad.padEnd(12)} → ${f.correct}`)
    )
    if (fixable.length > 15) console.log(`    ... and ${fixable.length - 15} more`)
  }

  if (notFound.length > 0 && notFound.length <= 20) {
    console.log('\n  Not found in master (need manual review):')
    notFound.forEach(s => console.log(`    ${s}`))
  }

  if (!FIX) {
    console.log(`\nRun with --fix to repair ${fixable.length} stem sku_roots:`)
    console.log('  node stems-sku-fix.js --fix\n')
    await pool.end()
    return
  }

  // Apply fixes
  console.log(`\n─── Applying ${fixable.length} stem sku_root updates ───\n`)
  let done = 0
  for (const { bad, correct } of fixable) {
    await pool.query(`UPDATE mix_stems SET sku_root=$1 WHERE sku_root=$2`, [correct, bad])
    done++
    if (done % 50 === 0) process.stdout.write(`  ${done} / ${fixable.length}\r`)
  }
  console.log(`\n  ✅ ${done} stem sku_roots repaired.`)
  console.log('  Run node sku-audit.js to verify.\n')

  console.log('══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[stems-sku-fix] Error:', e.message)
  await pool.end()
  process.exit(1)
})
