// title-sku-fix.js
// Fixes titles rows with sku_root < 8 chars (missing album digit)
// by looking up the correct full SKU from THE COLLECTION_full list.csv.
// Mirror logic of stems-sku-fix.js — same master list, same map.
//
//   node title-sku-fix.js            — dry run (report only)
//   node title-sku-fix.js --fix      — apply repairs

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')

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
  console.log(`Master file: ${masterPath}`)

  // Map: stripped_sku (without last digit) → full_sku
  // e.g. "C27a0012" → base "C27a001" → map["C27a001"] = "C27a0012"
  const map = {}
  const content = fs.readFileSync(masterPath, 'utf8')
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x00/g, '')
  for (const line of content.split('\n')) {
    const sku = line.split(',')[0].trim().replace(/^"|"$/g, '')
    if (!sku || sku === 'SKUROOT' || sku.length < 8) continue
    const base = sku.slice(0, -1)  // strip album digit
    if (!map[base]) map[base] = sku
  }
  return map
}

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Title SKU Repair (< 8 chars)')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: DRY RUN')
  console.log('══════════════════════════════════════════\n')

  console.log('Loading master list...')
  const master = loadMaster()
  console.log(`Master entries loaded: ${Object.keys(master).length}\n`)

  // Find all titles with short sku_root
  const bad = await pool.query(`
    SELECT sku_root, composer_id, title
    FROM titles
    WHERE length(sku_root) < 8
    ORDER BY composer_id, sku_root
  `)
  console.log(`  Titles with sku_root < 8 chars: ${bad.rows.length}\n`)

  const fixable  = []
  const notFound = []

  for (const row of bad.rows) {
    const correct = master[row.sku_root]
    if (correct) fixable.push({ bad: row.sku_root, correct, composer: row.composer_id })
    else notFound.push(row)
  }

  console.log(`  Found in master list (fixable): ${fixable.length}`)
  console.log(`  Not in master list:             ${notFound.length}`)

  if (fixable.length > 0) {
    console.log('\n  Sample fixes:')
    fixable.slice(0, 15).forEach(f =>
      console.log(`    ${f.bad.padEnd(12)} → ${f.correct}  [${f.composer}]`)
    )
    if (fixable.length > 15) console.log(`    ... and ${fixable.length - 15} more`)
  }

  if (notFound.length > 0 && notFound.length <= 30) {
    console.log('\n  Not found in master (need manual review):')
    notFound.forEach(r => console.log(`    ${r.sku_root.padEnd(12)} "${r.title}"  [${r.composer_id}]`))
  } else if (notFound.length > 30) {
    console.log(`\n  Not found in master: ${notFound.length} titles`)
    const byComposer = {}
    notFound.forEach(r => { byComposer[r.composer_id] = (byComposer[r.composer_id]||0)+1 })
    console.log('  By composer (top 10):')
    Object.entries(byComposer).sort((a,b)=>b[1]-a[1]).slice(0,10)
      .forEach(([c,n]) => console.log(`    ${c.padEnd(10)} ${n}`))
  }

  if (!FIX) {
    console.log(`\nRun with --fix to repair ${fixable.length} title sku_roots:`)
    console.log('  node title-sku-fix.js --fix\n')
    await pool.end()
    return
  }

  // Apply fixes — update titles and all FK tables
  console.log(`\n─── Applying ${fixable.length} title sku_root updates ───\n`)
  let done = 0
  for (const { bad, correct } of fixable) {
    await pool.query(`UPDATE titles      SET sku_root=$1 WHERE sku_root=$2`, [correct, bad])
    await pool.query(`UPDATE title_moods SET sku_root=$1 WHERE sku_root=$2`, [correct, bad])
    await pool.query(`UPDATE title_rmo   SET sku_root=$1 WHERE sku_root=$2`, [correct, bad])
    done++
    if (done % 200 === 0) process.stdout.write(`  ${done} / ${fixable.length}\r`)
  }
  console.log(`\n  ✅ ${done} title sku_roots repaired.`)
  if (notFound.length > 0)
    console.log(`  ⚠  ${notFound.length} titles not found in master list — manual review needed.`)
  console.log('  Run node sku-audit.js to verify.\n')

  console.log('══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[title-sku-fix] Error:', e.message)
  await pool.end()
  process.exit(1)
})
