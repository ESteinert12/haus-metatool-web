// sku-full-reconcile.js
// Uses Titles_Descriptions.csv as master source to fix sku_roots for ALL
// stemless titles across the entire catalog (not just R13/S33).
//
// Match strategy: composer_id + title (case-insensitive) — most reliable.
// Filename column contains composer ID as last segment after final underscore.
//
//   node sku-full-reconcile.js            — report + generate full-reconcile.csv
//   node sku-full-reconcile.js --fix      — apply sku_root updates
//   node sku-full-reconcile.js --verbose  — show unmatched titles

const { Pool } = require('pg')
const fs   = require('fs')
const path = require('path')
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_q7Sf3XALBusc@ep-polished-cloud-adsex56o.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require'
})

const FIX     = process.argv.includes('--fix')
const VERBOSE = process.argv.includes('--verbose')

// ── Load master CSV ────────────────────────────────────────────────────────────
// Columns: filename, title, description, full_sku_root
function loadMaster(filepath) {
  const byComposerTitle = {}  // "composerId|title" → correct_sku_root
  const byTitle         = {}  // "title" → [correct_sku_root, ...] (fallback)

  const lines = fs.readFileSync(filepath, 'utf8')
  const rows  = []

  // Simple CSV parse (handles quoted fields + \r\n line endings)
  const normalized = lines.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let cur = '', inQ = false, fields = []
  for (const ch of normalized + '\n') {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = '' }
    else if (ch === '\n' && !inQ) {
      if (cur || fields.length) { fields.push(cur.trim()); rows.push(fields) }
      fields = []; cur = ''
    } else { cur += ch }
  }

  for (const row of rows) {
    if (row.length < 4) continue
    const filename = row[0].trim()
    const title    = row[1].trim()
    const sku      = row[3].trim()
    if (!sku || !title) continue

    // Extract composer from filename: HAUS_Title_Key_ComposerID → last segment
    const parts = filename.split('_')
    const composer = parts[parts.length - 1].trim()

    const titleKey    = title.toLowerCase()
    const composerKey = `${composer.toLowerCase()}|${titleKey}`

    byComposerTitle[composerKey] = sku
    if (!byTitle[titleKey]) byTitle[titleKey] = []
    byTitle[titleKey].push({ sku, composer })
  }

  return { byComposerTitle, byTitle }
}

const UPLOADS = path.join(
  require('os').homedir(),
  'Library/Application Support/Claude/local-agent-mode-sessions/a1155e18-d57c-4e1e-8cdb-7bc4766f493d/492b8352-c57b-4766-8fc9-eb9107691393/local_2bfd3fc7-2fe3-4f8c-a2f8-7680beb8fd01/uploads'
)
const masterPath = fs.existsSync(path.join(__dirname, 'Titles_Descriptions.csv'))
  ? path.join(__dirname, 'Titles_Descriptions.csv')
  : path.join(UPLOADS, 'Titles_Descriptions.csv')
const { byComposerTitle, byTitle } = loadMaster(masterPath)
console.log(`\nMaster file: ${masterPath}`)
console.log(`Master list loaded: ${Object.keys(byComposerTitle).length} entries`)

async function run() {
  console.log('\n══════════════════════════════════════════')
  console.log('  Full Catalog SKU Reconciliation')
  console.log(FIX ? '  MODE: APPLY FIXES' : '  MODE: REPORT ONLY')
  console.log('══════════════════════════════════════════\n')

  // All stemless titles
  const stemless = await pool.query(`
    SELECT t.sku_root, t.title, t.composer_id
    FROM titles t
    LEFT JOIN mix_stems ms ON ms.sku_root = t.sku_root
    WHERE ms.sku_root IS NULL
    ORDER BY t.composer_id, t.sku_root
  `)

  const rows = stemless.rows
  console.log(`  Total stemless titles in DB: ${rows.length}\n`)

  const canFix    = []
  const collision = []
  const noMatch   = []
  const alreadyOk = []

  for (const row of rows) {
    const titleKey    = row.title.toLowerCase()
    const composerKey = `${row.composer_id.toLowerCase()}|${titleKey}`

    // Try composer+title match first, then title-only
    let correct = byComposerTitle[composerKey]
    if (!correct) {
      const matches = byTitle[titleKey]
      if (matches && matches.length === 1) correct = matches[0].sku  // unambiguous
    }

    if (!correct) { noMatch.push(row); continue }
    if (correct === row.sku_root) { alreadyOk.push(row); continue }
    canFix.push({ dbSku: row.sku_root, correctSku: correct, title: row.title, composer: row.composer_id })
  }

  // Collision check
  const toCheck = canFix.map(m => m.correctSku)
  const existing = toCheck.length
    ? await pool.query(`SELECT sku_root, title FROM titles WHERE sku_root = ANY($1)`, [toCheck])
    : { rows: [] }
  const existingMap = {}
  existing.rows.forEach(r => { existingMap[r.sku_root] = r.title })

  const fixable = []
  for (const m of canFix) {
    if (existingMap[m.correctSku]) {
      collision.push({ ...m, existingTitle: existingMap[m.correctSku] })
    } else {
      fixable.push(m)
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`  ✓  Already correct:             ${alreadyOk.length}`)
  console.log(`  →  Can be fixed (rename):       ${fixable.length}`)
  console.log(`  ⚠  Collision (target occupied): ${collision.length}`)
  console.log(`  ✗  Not in master list:          ${noMatch.length}`)

  // By composer for not-found
  if (noMatch.length > 0) {
    const byC = {}
    noMatch.forEach(r => { byC[r.composer_id] = (byC[r.composer_id]||0)+1 })
    console.log('\n  Not-found breakdown by composer (top 15):')
    Object.entries(byC).sort((a,b)=>b[1]-a[1]).slice(0,15).forEach(([c,n]) => {
      console.log(`    ${c.padEnd(10)} ${n}`)
    })
  }

  if (VERBOSE && noMatch.length > 0) {
    console.log('\n─── Unmatched titles ───\n')
    noMatch.slice(0, 50).forEach(r =>
      console.log(`  ${r.sku_root.padEnd(14)} "${r.title}"  (${r.composer_id})`)
    )
    if (noMatch.length > 50) console.log(`  ... and ${noMatch.length - 50} more`)
  }

  // ── Export CSV ───────────────────────────────────────────────────────────────
  const outPath = path.join(__dirname, 'full-reconcile.csv')
  const lines = ['status,db_sku,correct_sku,composer,title,collision_with']
  const esc = v => `"${String(v||'').replace(/"/g,'""')}"`
  fixable.forEach(m   => lines.push(['CAN_FIX',   m.dbSku, m.correctSku, m.composer,    esc(m.title), ''].join(',')))
  collision.forEach(c => lines.push(['COLLISION',  c.dbSku, c.correctSku, c.composer,    esc(c.title), esc(c.existingTitle)].join(',')))
  noMatch.forEach(r   => lines.push(['NOT_FOUND',  r.sku_root, '', r.composer_id,        esc(r.title), ''].join(',')))
  alreadyOk.forEach(r => lines.push(['ALREADY_OK', r.sku_root, '', r.composer_id,        esc(r.title), ''].join(',')))
  fs.writeFileSync(outPath, lines.join('\n'))
  console.log(`\n  → Saved full-reconcile.csv (${lines.length - 1} rows)`)

  // ── Apply fixes ──────────────────────────────────────────────────────────────
  if (FIX && fixable.length > 0) {
    console.log(`\n─── Applying ${fixable.length} sku_root updates ───\n`)
    let done = 0
    for (const m of fixable) {
      await pool.query(`UPDATE titles     SET sku_root=$1 WHERE sku_root=$2`, [m.correctSku, m.dbSku])
      await pool.query(`UPDATE mix_stems  SET sku_root=$1 WHERE sku_root=$2`, [m.correctSku, m.dbSku])
      await pool.query(`UPDATE title_moods SET sku_root=$1 WHERE sku_root=$2`, [m.correctSku, m.dbSku])
      await pool.query(`UPDATE title_rmo   SET sku_root=$1 WHERE sku_root=$2`, [m.correctSku, m.dbSku])
      done++
      if (done % 100 === 0) process.stdout.write(`  ${done} / ${fixable.length}\r`)
    }
    console.log(`\n  ✅ ${done} titles updated.`)
    console.log('  Run node sku-audit.js to verify integrity.\n')
  } else if (!FIX && fixable.length > 0) {
    console.log(`\nRun with --fix to apply ${fixable.length} updates:`)
    console.log('  node sku-full-reconcile.js --fix\n')
  }

  console.log('══════════════════════════════════════════\n')
  await pool.end()
}

run().catch(async e => {
  console.error('[full-reconcile] Error:', e.message)
  await pool.end()
  process.exit(1)
})
