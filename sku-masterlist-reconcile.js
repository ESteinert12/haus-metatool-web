// sku-masterlist-reconcile.js
// Cross-references stemless DB titles against R13 and S33 master lists
// to find the correct full SKU (with album code) for each orphaned title.
//
//   node sku-masterlist-reconcile.js            — report only
//   node sku-masterlist-reconcile.js --fix      — apply sku_root updates
//   node sku-masterlist-reconcile.js --csv      — export full report to reconcile-report.csv

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX = process.argv.includes('--fix')
const CSV = process.argv.includes('--csv')

// ── Load master lists ──────────────────────────────────────────────────────────
function loadMasterList(filepath) {
  const lines = fs.readFileSync(filepath, 'utf8').split('\n')
  const map = {}  // title.lowercase → correct_sku_root
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const comma = line.indexOf(',')
    if (comma < 0) continue
    const sku   = line.slice(0, comma).trim()
    const title = line.slice(comma + 1).trim().replace(/^"|"$/g, '').toLowerCase()
    if (sku && title) map[title] = sku
  }
  return map
}

const masterDir = path.join(__dirname)
const r13Master = loadMasterList(path.join(masterDir, 'R13.csv'))
const s33Master = loadMasterList(path.join(masterDir, 'S33.csv'))

function lookupMaster(composerId, title) {
  const t = title.toLowerCase()
  if (composerId.startsWith('R13')) return r13Master[t] || null
  if (composerId.startsWith('S33')) return s33Master[t] || null
  return null
}

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Master List Reconciliation')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: REPORT ONLY')
  console.log('══════════════════════════════════════════\n')

  // All stemless titles for R13a and S33a
  const stemless = await pool.query(`
    SELECT t.sku_root, t.title, t.composer_id, t.lot_id
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
      AND (t.composer_id ILIKE 'R13%' OR t.composer_id ILIKE 'S33%')
    ORDER BY t.composer_id, t.sku_root
  `)

  const rows = stemless.rows
  console.log(`  Stemless R13/S33 titles in DB: ${rows.length}\n`)

  const matched    = []  // { dbSku, correctSku, title, composer }
  const noMatch    = []  // title not found in master list
  const collision  = []  // correctSku already exists in titles under different sku_root
  const alreadyOk  = []  // db sku_root already matches master list

  for (const row of rows) {
    const correct = lookupMaster(row.composer_id, row.title)
    if (!correct) {
      noMatch.push(row)
      continue
    }
    if (correct === row.sku_root) {
      alreadyOk.push(row)
      continue
    }
    matched.push({ dbSku: row.sku_root, correctSku: correct, title: row.title, composer: row.composer_id })
  }

  // Check matched for collisions (correctSku already exists in titles)
  if (matched.length > 0) {
    const correctSkus = matched.map(m => m.correctSku)
    const existing = await pool.query(
      `SELECT sku_root, title FROM titles WHERE sku_root = ANY($1)`,
      [correctSkus]
    )
    const existingMap = {}
    existing.rows.forEach(r => { existingMap[r.sku_root] = r.title })

    for (let i = matched.length - 1; i >= 0; i--) {
      const m = matched[i]
      if (existingMap[m.correctSku]) {
        collision.push({ ...m, existingTitle: existingMap[m.correctSku] })
        matched.splice(i, 1)
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`  ✓  Already correct sku_root:    ${alreadyOk.length}`)
  console.log(`  →  Can be fixed (rename):       ${matched.length}`)
  console.log(`  ⚠  Collision (target occupied): ${collision.length}`)
  console.log(`  ✗  Not found in master list:    ${noMatch.length}`)

  if (collision.length > 0) {
    console.log('\n─── Collisions (need manual review) ───\n')
    collision.slice(0, 20).forEach(c => {
      console.log(`  DB:      ${c.dbSku.padEnd(14)} "${c.title}"`)
      console.log(`  Target:  ${c.correctSku.padEnd(14)} already occupied by "${c.existingTitle}"`)
      console.log()
    })
    if (collision.length > 20) console.log(`  ... and ${collision.length - 20} more`)
  }

  if (noMatch.length > 0 && noMatch.length <= 30) {
    console.log('\n─── Not found in master list ───\n')
    noMatch.forEach(r => console.log(`  ${r.sku_root.padEnd(14)} "${r.title}"  (${r.composer_id})`))
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  if (CSV) {
    const lines = ['status,db_sku,correct_sku,composer,title,collision_with']
    const esc = v => `"${String(v||'').replace(/"/g,'""')}"`
    matched.forEach(m   => lines.push(['CAN_FIX',  m.dbSku, m.correctSku, m.composer, esc(m.title), ''].join(',')))
    collision.forEach(c => lines.push(['COLLISION', c.dbSku, c.correctSku, c.composer, esc(c.title), esc(c.existingTitle)].join(',')))
    noMatch.forEach(r   => lines.push(['NOT_FOUND', r.sku_root, '', r.composer_id, esc(r.title), ''].join(',')))
    alreadyOk.forEach(r => lines.push(['ALREADY_OK',r.sku_root, '', r.composer_id, esc(r.title), ''].join(',')))
    const outPath = path.join(__dirname, 'reconcile-report.csv')
    fs.writeFileSync(outPath, lines.join('\n'))
    console.log(`\n  → Saved reconcile-report.csv (${lines.length - 1} rows)`)
  }

  // ── Apply fixes ──────────────────────────────────────────────────────────────
  if (FIX && matched.length > 0) {
    console.log(`\n─── Applying ${matched.length} sku_root updates ───\n`)
    let fixed = 0
    for (const m of matched) {
      // Update titles
      await pool.query(
        `UPDATE titles SET sku_root = $1 WHERE sku_root = $2`,
        [m.correctSku, m.dbSku]
      )
      // Update mix_stems (in case any exist under old key)
      await pool.query(
        `UPDATE mix_stems SET sku_root = $1 WHERE sku_root = $2`,
        [m.correctSku, m.dbSku]
      )
      // Update junction tables
      await pool.query(`UPDATE title_moods SET sku_root = $1 WHERE sku_root = $2`, [m.correctSku, m.dbSku])
      await pool.query(`UPDATE title_rmo   SET sku_root = $1 WHERE sku_root = $2`, [m.correctSku, m.dbSku])
      fixed++
      if (fixed % 50 === 0) console.log(`  ... ${fixed} / ${matched.length}`)
    }
    console.log(`\n  ✅ ${fixed} titles updated. Re-run without --fix to verify stems now connect.`)
  } else if (!FIX && matched.length > 0) {
    console.log(`\nRun with --fix to apply ${matched.length} sku_root updates:`)
    console.log('  node sku-masterlist-reconcile.js --fix\n')
  }

  console.log('\n══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[reconcile] Error:', e.message)
  await pool.end()
  process.exit(1)
})
